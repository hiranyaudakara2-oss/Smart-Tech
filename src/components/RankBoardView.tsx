import React, { useMemo, useState } from 'react';
import { Award, CheckCircle2, Clock, Search, Trophy } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import type {
  CustomRankBoard,
  CustomRankEntry,
  OnlineExam,
  RankBoardEntry,
} from '../types/platform';
import { computeManualBoardRankings, formatShortDate } from '../utils/platformLogic';

interface RankBoardViewProps {
  entries?: RankBoardEntry[];
  exams?: OnlineExam[];
  customBoards?: CustomRankBoard[];
  customEntries?: CustomRankEntry[];
  loading?: boolean;
  defaultExamId?: string;
  compact?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

interface UnifiedRankRow {
  id: string;
  groupKey: string;
  groupTitle: string;
  groupCategory: string;
  rankPosition: number;
  displayOrder: number;
  studentName: string;
  secondaryCode: string;
  subject: string;
  marks: number;
  maxMarks: number;
  percentage: number;
  standingLabel: string;
  isPositiveStanding: boolean;
  isFinalized: boolean;
  updatedAtMs: number;
}

export function RankBoardView({
  entries,
  exams,
  customBoards,
  customEntries,
  loading = false,
  defaultExamId = 'all',
  compact = false,
  emptyTitle = 'No published rank board standings yet',
  emptyDescription = 'Once an administrator publishes a Rank Board or releases official online examination standings, ranked student results appear here automatically.',
}: RankBoardViewProps) {
  const platform = usePlatform();
  const effectiveEntries = entries ?? platform.publishedRankEntries;
  const effectiveExams = exams ?? platform.publishedExams;
  const effectiveCustomBoards = customBoards ?? platform.publishedRankBoards;
  const effectiveCustomEntries = customEntries ?? platform.publishedCustomRankEntries;

  const [selectedBoardKey, setSelectedBoardKey] = useState<string>(defaultExamId);
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Only include published Custom Rank Boards for normal users
  const activePublishedBoardsMap = useMemo(() => {
    const map = new Map<string, CustomRankBoard>();
    effectiveCustomBoards.forEach((b) => {
      if (b.published) {
        map.set(b.id, b);
      }
    });
    return map;
  }, [effectiveCustomBoards]);

  const unifiedRows = useMemo<UnifiedRankRow[]>(() => {
    const rows: UnifiedRankRow[] = [];

    // 1. Published Custom Rank Board Entries (computed live per board to guarantee Rank 1 at top & consistent tie order)
    const entriesByBoard = new Map<string, CustomRankEntry[]>();
    effectiveCustomEntries.forEach((ce) => {
      if (!ce.boardPublished) return;
      if (effectiveCustomBoards.length > 0 && !activePublishedBoardsMap.has(ce.boardId)) return;
      const bucket = entriesByBoard.get(ce.boardId) || [];
      bucket.push(ce);
      entriesByBoard.set(ce.boardId, bucket);
    });

    entriesByBoard.forEach((list, boardId) => {
      const boardMeta = activePublishedBoardsMap.get(boardId);
      const mode = boardMeta?.rankingMode || 'auto';
      const ranked = computeManualBoardRankings(list, mode);

      ranked.forEach((item) => {
        rows.push({
          id: `custom_${item.id}`,
          groupKey: `board:${boardId}`,
          groupTitle: boardMeta?.title || item.boardTitle,
          groupCategory: boardMeta?.category || item.boardCategory || 'Rank Board',
          rankPosition: item.computedRank,
          displayOrder: item.computedOrder,
          studentName: item.studentName,
          secondaryCode:
            boardMeta?.targetGroup ||
            (item.linkedItemType !== 'none' && item.linkedItemTitle
              ? item.linkedItemTitle
              : item.boardCategory),
          subject: item.subject,
          marks: item.marks,
          maxMarks: item.maxMarks,
          percentage: item.computedPercentage,
          standingLabel: item.isManualRank ? 'Official Rank' : 'Verified Rank',
          isPositiveStanding: item.computedPercentage >= 50,
          isFinalized: true,
          updatedAtMs: item.updatedAtMs,
        });
      });
    });

    // 2. Published Native Online Examination Rank Entries
    effectiveEntries.forEach((r) => {
      if (!r.published) return;
      rows.push({
        id: `exam_${r.id}`,
        groupKey: r.examId,
        groupTitle: r.examTitle,
        groupCategory: 'Online Exam',
        rankPosition: r.rankPosition,
        displayOrder: r.rankPosition,
        studentName: r.studentDisplayName,
        secondaryCode: r.anonymizeNames ? '' : r.anonymizedCode,
        subject: r.subject,
        marks: r.marksObtained,
        maxMarks: r.totalMarks,
        percentage: r.percentage,
        standingLabel: r.passed ? 'Passed · Finalized' : 'Finalized',
        isPositiveStanding: r.passed,
        isFinalized: r.isFinalized,
        updatedAtMs: r.updatedAtMs,
      });
    });

    return rows;
  }, [activePublishedBoardsMap, effectiveCustomBoards.length, effectiveCustomEntries, effectiveEntries]);

  const boardFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    effectiveCustomBoards.forEach((b) => {
      if (b.published) {
        map.set(`board:${b.id}`, `${b.title} (${b.category})`);
      }
    });
    effectiveExams.forEach((e) => {
      if (e.examMode === 'native' && e.rankBoardPublished) {
        map.set(e.id, `${e.title} (Online Exam)`);
      }
    });
    unifiedRows.forEach((r) => {
      if (!map.has(r.groupKey)) {
        map.set(r.groupKey, `${r.groupTitle} (${r.groupCategory})`);
      }
    });
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [effectiveCustomBoards, exams, unifiedRows]);

  const subjectOptions = useMemo(() => {
    const set = new Set<string>();
    unifiedRows.forEach((r) => {
      if (r.subject) set.add(r.subject);
    });
    return Array.from(set).sort();
  }, [unifiedRows]);

  // Ensure selectedBoardKey resets cleanly if a board is unpublished or deleted
  const activeFilterKey =
    selectedBoardKey === 'all' || boardFilterOptions.some((o) => o.id === selectedBoardKey)
      ? selectedBoardKey
      : 'all';

  const activeBoardMeta = useMemo(() => {
    if (!activeFilterKey.startsWith('board:')) return null;
    const rawId = activeFilterKey.slice('board:'.length);
    return activePublishedBoardsMap.get(rawId) || null;
  }, [activeFilterKey, activePublishedBoardsMap]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = unifiedRows.filter((item) => {
      if (activeFilterKey !== 'all' && item.groupKey !== activeFilterKey) return false;
      if (selectedSubject !== 'all' && item.subject !== selectedSubject) return false;
      if (q) {
        const hay = `${item.studentName} ${item.secondaryCode} ${item.groupTitle} ${item.subject} ${item.groupCategory}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (a.groupKey === b.groupKey) {
        if (a.rankPosition !== b.rankPosition) return a.rankPosition - b.rankPosition;
        if (b.marks !== a.marks) return b.marks - a.marks;
        return a.displayOrder - b.displayOrder;
      }
      // Across multiple boards: Rank #1 first, then highest marks/percentage
      if (a.rankPosition !== b.rankPosition) return a.rankPosition - b.rankPosition;
      if (b.percentage !== a.percentage) return b.percentage - a.percentage;
      return b.marks - a.marks;
    });
  }, [unifiedRows, activeFilterKey, selectedSubject, searchQuery]);

  // Identify tied ranks within the same board/exam so ties are clearly annotated
  const tieCountsByGroupAndRank = useMemo(() => {
    const counts = new Map<string, number>();
    unifiedRows.forEach((e) => {
      const k = `${e.groupKey}:${e.rankPosition}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    return counts;
  }, [unifiedRows]);

  const topPodium = useMemo(() => {
    if (compact) return [];
    const uniqueGroups = new Set(filteredEntries.map((e) => e.groupKey));
    if (uniqueGroups.size !== 1) return [];
    return filteredEntries.filter((e) => e.rankPosition <= 3).slice(0, 3);
  }, [compact, filteredEntries]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((n) => (
          <div key={n} className="glass-surface h-14 animate-pulse rounded-xl p-4" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {!compact && (
        <div className="glass-surface mb-6 rounded-2xl p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-5">
              <label htmlFor="rank-search-input" className="block text-xs font-medium text-slate-300">
                Search student, subject, or rank board
              </label>
              <div className="relative mt-1.5">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="rank-search-input"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Student name, subject, paper, or board..."
                  className="w-full rounded-lg border border-slate-700/80 bg-[#060b18] py-2 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-400"
                />
              </div>
            </div>

            <div className="md:col-span-4">
              <label htmlFor="rank-exam-filter" className="block text-xs font-medium text-slate-300">
                Rank Board / Examination
              </label>
              <select
                id="rank-exam-filter"
                value={activeFilterKey}
                onChange={(e) => setSelectedBoardKey(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
              >
                <option value="all">All Published Rank Boards</option>
                {boardFilterOptions.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label htmlFor="rank-subject-filter" className="block text-xs font-medium text-slate-300">
                Subject Stream
              </label>
              <select
                id="rank-subject-filter"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
              >
                <option value="all">All Subjects</option>
                {subjectOptions.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeBoardMeta && activeBoardMeta.description && (
            <div className="mt-4 border-t border-slate-800/80 pt-3 text-xs text-slate-300">
              <span className="font-semibold text-cyan-300">{activeBoardMeta.category}:</span>{' '}
              {activeBoardMeta.description}
            </div>
          )}
        </div>
      )}

      {/* Top Standings Summary Cards when viewing a single Rank Board / Examination */}
      {topPodium.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {topPodium.map((entry) => {
            const isTied =
              (tieCountsByGroupAndRank.get(`${entry.groupKey}:${entry.rankPosition}`) || 0) > 1;
            const rankAccent =
              entry.rankPosition === 1
                ? 'border-amber-400/35 text-amber-300'
                : entry.rankPosition === 2
                ? 'border-slate-300/30 text-slate-200'
                : 'border-cyan-400/30 text-cyan-300';

            return (
              <div
                key={entry.id}
                className={`glass-surface flex flex-col justify-between rounded-2xl border p-5 ${rankAccent}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums">
                    <Trophy className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Rank #{entry.rankPosition}
                    {isTied ? ' (Tied)' : ''}
                  </span>
                  <span className="font-mono text-lg font-bold text-slate-50 tabular-nums">
                    {entry.percentage}%
                  </span>
                </div>
                <div className="mt-3">
                  <p className="truncate text-base font-semibold text-slate-50">
                    {entry.studentName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {entry.subject} ·{' '}
                    <span className="font-mono tabular-nums">
                      {entry.marks} / {entry.maxMarks} marks
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filteredEntries.length === 0 ? (
        <div className="glass-surface rounded-2xl p-8 text-center">
          <Award className="mx-auto h-8 w-8 text-cyan-300/80" aria-hidden="true" />
          <h3 className="mt-3 text-base font-semibold text-slate-100">{emptyTitle}</h3>
          <p className="mx-auto mt-1.5 max-w-lg text-sm text-slate-400">{emptyDescription}</p>
        </div>
      ) : (
        <div className="glass-surface overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800/90 bg-[#070f20] text-xs font-medium text-slate-400">
                  <th className="px-4 py-3 font-medium">Rank</th>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Rank Board / Examination</th>
                  <th className="px-4 py-3 text-right font-medium">Marks</th>
                  <th className="px-4 py-3 text-right font-medium">Score %</th>
                  {!compact && <th className="px-4 py-3 font-medium">Standing</th>}
                  {!compact && <th className="px-4 py-3 text-right font-medium">Updated</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/75">
                {filteredEntries.slice(0, compact ? 6 : 100).map((entry) => {
                  const isTied =
                    (tieCountsByGroupAndRank.get(`${entry.groupKey}:${entry.rankPosition}`) || 0) >
                    1;
                  return (
                    <tr
                      key={entry.id}
                      className="transition-colors hover:bg-sky-500/[0.04]"
                    >
                      <td className="px-4 py-3 font-mono text-sm font-semibold tabular-nums whitespace-nowrap">
                        <span
                          className={
                            entry.rankPosition === 1
                              ? 'text-amber-300'
                              : entry.rankPosition === 2
                              ? 'text-slate-100'
                              : entry.rankPosition === 3
                              ? 'text-cyan-300'
                              : 'text-slate-300'
                          }
                        >
                          #{entry.rankPosition}
                        </span>
                        {isTied && (
                          <span className="ml-1.5 font-sans text-[11px] font-normal text-slate-400">
                            · Tied
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-100">{entry.studentName}</p>
                        {entry.secondaryCode && (
                          <p className="truncate font-mono text-[11px] text-slate-500 tabular-nums max-w-[14rem]">
                            {entry.secondaryCode}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-xs truncate text-slate-200">{entry.groupTitle}</p>
                        <p className="text-xs text-cyan-300">
                          {entry.subject} · {entry.groupCategory}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-100 tabular-nums whitespace-nowrap">
                        {entry.marks} / {entry.maxMarks}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-cyan-300 tabular-nums whitespace-nowrap">
                        {entry.percentage}%
                      </td>
                      {!compact && (
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {entry.isFinalized ? (
                            <span
                              className={`inline-flex items-center gap-1.5 ${
                                entry.isPositiveStanding ? 'text-emerald-300' : 'text-slate-300'
                              }`}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              {entry.standingLabel}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-amber-300">
                              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              Provisional
                            </span>
                          )}
                        </td>
                      )}
                      {!compact && (
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-400 tabular-nums whitespace-nowrap">
                          {formatShortDate(entry.updatedAtMs)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
