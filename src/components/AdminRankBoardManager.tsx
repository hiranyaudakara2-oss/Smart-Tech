import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Award,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Trophy,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { ConfirmDialog } from './SharedUI';
import { AdminRankBoardPanel } from './AdminExamManager';
import {
  computeManualBoardRankings,
  formatShortDate,
  validateCustomRankBoardInput,
  validateCustomRankEntryInput,
} from '../utils/platformLogic';
import {
  createCustomRankBoard,
  deleteCustomRankBoard,
  deleteCustomRankEntry,
  recalculateCustomRankBoard,
  reorderCustomRankEntry,
  updateCustomRankBoard,
  upsertCustomRankEntry,
} from '../services/platformService';
import type {
  CustomRankBoard,
  CustomRankEntry,
  RankBoardCategory,
  RankLinkedItemType,
} from '../types/platform';

const BOARD_CATEGORIES: RankBoardCategory[] = [
  'Examination',
  'Past Paper',
  'Subject',
  'Class',
  'Competition',
];

export function AdminRankBoardManager() {
  const {
    allRankBoards,
    allCustomRankEntries,
    allPapers,
    allExams,
    allNotes,
    pushToast,
  } = usePlatform();

  const [subTab, setSubTab] = useState<'custom' | 'native'>('custom');

  // Selected Board for Entry Management
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');

  // Board Create / Edit Form State
  const [editingBoard, setEditingBoard] = useState<CustomRankBoard | null>(null);
  const [boardTitle, setBoardTitle] = useState('');
  const [boardCategory, setBoardCategory] = useState<RankBoardCategory>('Examination');
  const [boardSubject, setBoardSubject] = useState('Engineering Technology');
  const [boardTargetGroup, setBoardTargetGroup] = useState('Grade 13 (G.C.E. A/L)');
  const [boardDescription, setBoardDescription] = useState('');
  const [boardRankingMode, setBoardRankingMode] = useState<'auto' | 'manual'>('auto');
  const [boardLinkType, setBoardLinkType] = useState<RankLinkedItemType>('none');
  const [boardLinkId, setBoardLinkId] = useState('');
  const [boardPublished, setBoardPublished] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [boardBusy, setBoardBusy] = useState(false);

  // Entry Create / Edit Form State
  const [editingEntry, setEditingEntry] = useState<CustomRankEntry | null>(null);
  const [studentName, setStudentName] = useState('');
  const [entryMarks, setEntryMarks] = useState<string>('85');
  const [entryMaxMarks, setEntryMaxMarks] = useState<string>('100');
  const [entrySubject, setEntrySubject] = useState('');
  const [entryIsManualRank, setEntryIsManualRank] = useState(false);
  const [entryManualRank, setEntryManualRank] = useState<string>('1');
  const [entryLinkType, setEntryLinkType] = useState<RankLinkedItemType>('none');
  const [entryLinkId, setEntryLinkId] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entryBusy, setEntryBusy] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  // Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    if (allRankBoards.length === 0) {
      setSelectedBoardId('');
      return;
    }
    if (!selectedBoardId || !allRankBoards.some((b) => b.id === selectedBoardId)) {
      setSelectedBoardId(allRankBoards[0].id);
    }
  }, [allRankBoards, selectedBoardId]);

  const activeBoard = useMemo(
    () => allRankBoards.find((b) => b.id === selectedBoardId) || null,
    [allRankBoards, selectedBoardId]
  );

  // Sync default subject & linked item when switching activeBoard (unless currently editing an entry)
  useEffect(() => {
    if (!activeBoard || editingEntry) return;
    setEntrySubject(activeBoard.linkedItemTitle || activeBoard.subject);
    setEntryLinkType(activeBoard.linkedItemType);
    setEntryLinkId(activeBoard.linkedItemId);
  }, [activeBoard, editingEntry]);

  const resolveLinkedItemTitle = (type: RankLinkedItemType, id: string): string => {
    if (type === 'none' || !id) return '';
    if (type === 'paper') {
      return allPapers.find((p) => p.id === id)?.title || '';
    }
    if (type === 'exam') {
      return allExams.find((e) => e.id === id)?.title || '';
    }
    if (type === 'note') {
      return allNotes.find((n) => n.id === id)?.title || '';
    }
    return '';
  };

  const boardEntries = useMemo(() => {
    if (!activeBoard) return [];
    const raw = allCustomRankEntries.filter((e) => e.boardId === activeBoard.id);
    const ranked = computeManualBoardRankings(raw, activeBoard.rankingMode);
    return ranked.map((r) => ({
      ...r,
      rankPosition: r.computedRank,
      displayOrder: r.computedOrder,
      percentage: r.computedPercentage,
    }));
  }, [activeBoard, allCustomRankEntries]);

  const tieCountsOnActiveBoard = useMemo(() => {
    const map = new Map<number, number>();
    boardEntries.forEach((e) => {
      map.set(e.rankPosition, (map.get(e.rankPosition) || 0) + 1);
    });
    return map;
  }, [boardEntries]);

  const entryCountsByBoard = useMemo(() => {
    const map = new Map<string, number>();
    allCustomRankEntries.forEach((e) => {
      map.set(e.boardId, (map.get(e.boardId) || 0) + 1);
    });
    return map;
  }, [allCustomRankEntries]);

  const resetBoardForm = () => {
    setEditingBoard(null);
    setBoardTitle('');
    setBoardCategory('Examination');
    setBoardSubject('Engineering Technology');
    setBoardTargetGroup('Grade 13 (G.C.E. A/L)');
    setBoardDescription('');
    setBoardRankingMode('auto');
    setBoardLinkType('none');
    setBoardLinkId('');
    setBoardPublished(true);
    setBoardError(null);
  };

  const resetEntryForm = (board?: CustomRankBoard | null) => {
    const refBoard = board ?? activeBoard;
    setEditingEntry(null);
    setStudentName('');
    setEntryMarks('85');
    setEntryMaxMarks('100');
    setEntrySubject(refBoard ? refBoard.linkedItemTitle || refBoard.subject : '');
    setEntryIsManualRank(false);
    setEntryManualRank('1');
    setEntryLinkType(refBoard ? refBoard.linkedItemType : 'none');
    setEntryLinkId(refBoard ? refBoard.linkedItemId : '');
    setEntryError(null);
  };

  const handleSaveBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    setBoardError(null);

    const err = validateCustomRankBoardInput({
      title: boardTitle,
      category: boardCategory,
      subject: boardSubject,
      targetGroup: boardTargetGroup,
      description: boardDescription,
    });
    if (err) {
      setBoardError(err);
      return;
    }

    const effectiveLinkType: RankLinkedItemType =
      boardLinkType !== 'none' && boardLinkId ? boardLinkType : 'none';
    const effectiveLinkTitle = resolveLinkedItemTitle(effectiveLinkType, boardLinkId);

    setBoardBusy(true);
    try {
      if (editingBoard) {
        await updateCustomRankBoard(editingBoard, {
          title: boardTitle,
          category: boardCategory,
          subject: boardSubject,
          targetGroup: boardTargetGroup,
          description: boardDescription,
          rankingMode: boardRankingMode,
          linkedItemType: effectiveLinkType,
          linkedItemId: effectiveLinkType === 'none' ? '' : boardLinkId,
          linkedItemTitle: effectiveLinkTitle,
          published: boardPublished,
        });
        pushToast('success', 'Rank Board updated', `"${boardTitle.trim()}" saved in real time.`);
      } else {
        const createdId = await createCustomRankBoard({
          title: boardTitle,
          category: boardCategory,
          subject: boardSubject,
          targetGroup: boardTargetGroup,
          description: boardDescription,
          rankingMode: boardRankingMode,
          linkedItemType: effectiveLinkType,
          linkedItemId: effectiveLinkType === 'none' ? '' : boardLinkId,
          linkedItemTitle: effectiveLinkTitle,
          published: boardPublished,
        });
        setSelectedBoardId(createdId);
        pushToast(
          'success',
          boardPublished ? 'Rank Board created & published' : 'Rank Board saved as draft',
          'Add student ranking entries below.'
        );
      }
      resetBoardForm();
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : 'Unable to save Rank Board.';
      setBoardError(msg);
      pushToast('error', 'Rank Board save failed', msg);
    } finally {
      setBoardBusy(false);
    }
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBoard) return;
    setEntryError(null);

    const parsedMarks = Number(entryMarks);
    const parsedMax = Number(entryMaxMarks);
    const parsedManualRank = Number(entryManualRank);

    const err = validateCustomRankEntryInput({
      studentName,
      marks: parsedMarks,
      maxMarks: parsedMax,
      subject: entrySubject,
      isManualRank: entryIsManualRank,
      rankPosition: entryIsManualRank ? parsedManualRank : 1,
    });
    if (err) {
      setEntryError(err);
      return;
    }

    const effectiveLinkType: RankLinkedItemType =
      entryLinkType !== 'none' && entryLinkId ? entryLinkType : 'none';
    const effectiveLinkTitle = resolveLinkedItemTitle(effectiveLinkType, entryLinkId);

    setEntryBusy(true);
    try {
      await upsertCustomRankEntry({
        board: activeBoard,
        existingEntry: editingEntry,
        studentName,
        marks: parsedMarks,
        maxMarks: parsedMax,
        subject: entrySubject,
        isManualRank: entryIsManualRank,
        rankPosition: entryIsManualRank ? parsedManualRank : undefined,
        displayOrder: editingEntry ? editingEntry.displayOrder : boardEntries.length,
        linkedItemType: effectiveLinkType,
        linkedItemId: effectiveLinkType === 'none' ? '' : entryLinkId,
        linkedItemTitle: effectiveLinkTitle,
      });
      pushToast(
        'success',
        editingEntry ? 'Ranking entry updated' : 'Student added to Rank Board',
        `${studentName.trim()} (${parsedMarks}/${parsedMax})`
      );
      resetEntryForm(activeBoard);
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : 'Unable to save ranking entry.';
      setEntryError(msg);
      pushToast('error', 'Ranking entry failed', msg);
    } finally {
      setEntryBusy(false);
    }
  };

  const handleMoveEntry = async (entryId: string, direction: 'up' | 'down') => {
    if (!activeBoard) return;
    setReorderingId(entryId);
    try {
      await reorderCustomRankEntry({
        board: activeBoard,
        orderedEntries: boardEntries,
        entryId,
        direction,
      });
    } catch (ex) {
      pushToast('error', 'Reorder failed', ex instanceof Error ? ex.message : '');
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode Switcher */}
      <div className="glass-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('custom')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
              subTab === 'custom'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
            Dynamic &amp; Manual Rank Boards ({allRankBoards.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('native')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
              subTab === 'native'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Award className="h-3.5 w-3.5" aria-hidden="true" />
            Online Exam Auto-Sync Standings
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Only published Rank Boards are visible to students and visitors.
        </p>
      </div>

      {subTab === 'native' ? (
        <AdminRankBoardPanel />
      ) : (
        <div className="space-y-6">
          {/* Top Grid: Create/Edit Rank Board + Existing Rank Boards Inventory */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            {/* Create / Edit Rank Board Form */}
            <form
              onSubmit={handleSaveBoard}
              className="glass-surface rounded-2xl p-6 xl:col-span-6"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-50">
                  {editingBoard
                    ? `Edit Rank Board: ${editingBoard.title}`
                    : 'Create New Rank Board'}
                </h2>
                {editingBoard && (
                  <button
                    type="button"
                    onClick={resetBoardForm}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Create dedicated Rank Boards for subjects, past papers, classes, online exams, or
                competitions.
              </p>

              {boardError && (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-200"
                >
                  {boardError}
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="rb-title" className="block text-xs font-medium text-slate-300">
                    Rank Board Title
                  </label>
                  <input
                    id="rb-title"
                    type="text"
                    required
                    maxLength={160}
                    value={boardTitle}
                    onChange={(e) => setBoardTitle(e.target.value)}
                    placeholder="e.g., 2026 Engineering Technology Paper I Top Standings"
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                  />
                </div>

                <div>
                  <label htmlFor="rb-cat" className="block text-xs font-medium text-slate-300">
                    Board Category
                  </label>
                  <select
                    id="rb-cat"
                    value={boardCategory}
                    onChange={(e) => setBoardCategory(e.target.value as RankBoardCategory)}
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
                  >
                    {BOARD_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="rb-subj" className="block text-xs font-medium text-slate-300">
                    Subject / Stream
                  </label>
                  <input
                    id="rb-subj"
                    type="text"
                    required
                    maxLength={80}
                    value={boardSubject}
                    onChange={(e) => setBoardSubject(e.target.value)}
                    placeholder="e.g., Engineering Technology"
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                  />
                </div>

                <div>
                  <label htmlFor="rb-group" className="block text-xs font-medium text-slate-300">
                    Class / Competition Group
                  </label>
                  <input
                    id="rb-group"
                    type="text"
                    maxLength={80}
                    value={boardTargetGroup}
                    onChange={(e) => setBoardTargetGroup(e.target.value)}
                    placeholder="e.g., Grade 13 (G.C.E. A/L)"
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                  />
                </div>

                <div>
                  <label htmlFor="rb-mode" className="block text-xs font-medium text-slate-300">
                    Default Ranking Mode
                  </label>
                  <select
                    id="rb-mode"
                    value={boardRankingMode}
                    onChange={(e) =>
                      setBoardRankingMode(e.target.value === 'manual' ? 'manual' : 'auto')
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="auto">Auto Rank by Marks (Descending)</option>
                    <option value="manual">Manual Custom Row Order</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="rb-link-type" className="block text-xs font-medium text-slate-300">
                    Link to Past Paper / Item (Optional)
                  </label>
                  <select
                    id="rb-link-type"
                    value={boardLinkType}
                    onChange={(e) => {
                      const next = e.target.value as RankLinkedItemType;
                      setBoardLinkType(next);
                      setBoardLinkId('');
                    }}
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="none">Standalone (No Linked Resource)</option>
                    <option value="paper">Past Examination Paper</option>
                    <option value="exam">Online Examination</option>
                    <option value="note">Educational Note</option>
                  </select>
                </div>

                {boardLinkType !== 'none' && (
                  <div>
                    <label htmlFor="rb-link-id" className="block text-xs font-medium text-slate-300">
                      Select Linked{' '}
                      {boardLinkType === 'paper'
                        ? 'Past Paper'
                        : boardLinkType === 'exam'
                        ? 'Online Exam'
                        : 'Note'}
                    </label>
                    <select
                      id="rb-link-id"
                      value={boardLinkId}
                      onChange={(e) => {
                        const chosenId = e.target.value;
                        setBoardLinkId(chosenId);
                        if (boardLinkType === 'paper') {
                          const found = allPapers.find((p) => p.id === chosenId);
                          if (found) {
                            if (!boardTitle.trim()) setBoardTitle(`${found.title} — Rank Board`);
                            setBoardSubject(found.subject);
                          }
                        } else if (boardLinkType === 'exam') {
                          const found = allExams.find((ex) => ex.id === chosenId);
                          if (found) {
                            if (!boardTitle.trim()) setBoardTitle(`${found.title} — Rank Board`);
                            setBoardSubject(found.subject);
                          }
                        } else if (boardLinkType === 'note') {
                          const found = allNotes.find((n) => n.id === chosenId);
                          if (found) {
                            setBoardSubject(found.subject);
                          }
                        }
                      }}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="">-- Choose an item --</option>
                      {boardLinkType === 'paper' &&
                        allPapers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title} ({p.year})
                          </option>
                        ))}
                      {boardLinkType === 'exam' &&
                        allExams.map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            {ex.title}
                          </option>
                        ))}
                      {boardLinkType === 'note' &&
                        allNotes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.title}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label htmlFor="rb-desc" className="block text-xs font-medium text-slate-300">
                    Description / Competition Notes (Optional)
                  </label>
                  <textarea
                    id="rb-desc"
                    rows={2}
                    maxLength={1000}
                    value={boardDescription}
                    onChange={(e) => setBoardDescription(e.target.value)}
                    placeholder="Optional details displayed when students filter to this Rank Board..."
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800/80 pt-4">
                <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={boardPublished}
                    onChange={(e) => setBoardPublished(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Publish Rank Board to public &amp; student views
                </label>

                <button
                  type="submit"
                  disabled={boardBusy}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                >
                  {boardBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {boardBusy
                    ? 'Saving...'
                    : editingBoard
                    ? 'Save Board Changes'
                    : 'Create Rank Board'}
                </button>
              </div>
            </form>

            {/* Existing Rank Boards Directory */}
            <div className="glass-surface flex flex-col justify-between rounded-2xl p-6 xl:col-span-6">
              <div>
                <h2 className="text-base font-semibold text-slate-50">
                  Managed Rank Boards ({allRankBoards.length})
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Select a Rank Board below to manage student rankings, publish or unpublish
                  visibility, or edit metadata.
                </p>

                {allRankBoards.length === 0 ? (
                  <div className="mt-6 rounded-xl border border-slate-800/80 bg-[#060b18]/60 p-8 text-center">
                    <Trophy className="mx-auto h-7 w-7 text-cyan-300/80" aria-hidden="true" />
                    <p className="mt-2 text-sm font-medium text-slate-200">
                      No custom Rank Boards created yet
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Use the form on the left to create your first Rank Board for a past paper,
                      subject, class, or competition.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 max-h-[430px] space-y-3 overflow-y-auto pr-1">
                    {allRankBoards.map((b) => {
                      const isSelected = b.id === selectedBoardId;
                      const count = entryCountsByBoard.get(b.id) || 0;
                      return (
                        <div
                          key={b.id}
                          className={`rounded-xl border p-4 transition-colors ${
                            isSelected
                              ? 'border-sky-400/60 bg-sky-500/[0.08]'
                              : 'border-slate-800/90 bg-[#060b18]/75 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBoardId(b.id);
                                resetEntryForm(b);
                              }}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                                <span className="font-semibold text-cyan-300">{b.category}</span>
                                <span aria-hidden="true">·</span>
                                <span>{b.subject}</span>
                                {b.targetGroup && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>{b.targetGroup}</span>
                                  </>
                                )}
                                <span aria-hidden="true">·</span>
                                <span
                                  className={
                                    b.published
                                      ? 'font-semibold text-emerald-300'
                                      : 'text-amber-300'
                                  }
                                >
                                  {b.published ? 'Published' : 'Unpublished'}
                                </span>
                              </div>
                              <h3 className="mt-1 truncate text-sm font-semibold text-slate-100">
                                {b.title}
                              </h3>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                <span className="font-mono tabular-nums">
                                  {count} {count === 1 ? 'student' : 'students'}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {b.rankingMode === 'auto'
                                    ? 'Auto Marks Rank'
                                    : 'Manual Row Order'}
                                </span>
                                {b.linkedItemType !== 'none' && b.linkedItemTitle && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="inline-flex items-center gap-1 text-cyan-300">
                                      <Link2 className="h-3 w-3" aria-hidden="true" />
                                      {b.linkedItemTitle}
                                    </span>
                                  </>
                                )}
                              </div>
                            </button>

                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  updateCustomRankBoard(b, { published: !b.published })
                                    .then(() =>
                                      pushToast(
                                        'info',
                                        b.published
                                          ? 'Rank Board unpublished'
                                          : 'Rank Board published live',
                                        b.title
                                      )
                                    )
                                    .catch((err) =>
                                      pushToast(
                                        'error',
                                        'Status update failed',
                                        err instanceof Error ? err.message : ''
                                      )
                                    )
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white"
                              >
                                {b.published ? (
                                  <>
                                    <EyeOff className="h-3 w-3" aria-hidden="true" />
                                    Unpublish
                                  </>
                                ) : (
                                  <>
                                    <Eye className="h-3 w-3" aria-hidden="true" />
                                    Publish
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingBoard(b);
                                  setBoardTitle(b.title);
                                  setBoardCategory(b.category);
                                  setBoardSubject(b.subject);
                                  setBoardTargetGroup(b.targetGroup);
                                  setBoardDescription(b.description);
                                  setBoardRankingMode(b.rankingMode);
                                  setBoardLinkType(b.linkedItemType);
                                  setBoardLinkId(b.linkedItemId);
                                  setBoardPublished(b.published);
                                  setBoardError(null);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-cyan-300 hover:text-white"
                              >
                                <Edit3 className="h-3 w-3" aria-hidden="true" />
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmDialog({
                                    title: 'Delete Rank Board Permanently',
                                    description: `Permanently delete Rank Board "${b.title}" and all ${count} student ranking ${
                                      count === 1 ? 'entry' : 'entries'
                                    } inside it? Unrelated Rank Boards will not be affected.`,
                                    confirmLabel: 'Delete Rank Board',
                                    onConfirm: async () => {
                                      await deleteCustomRankBoard(b);
                                      if (editingBoard?.id === b.id) resetBoardForm();
                                      pushToast('info', 'Rank Board deleted', b.title);
                                    },
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:border-rose-500/40"
                              >
                                <Trash2 className="h-3 w-3" aria-hidden="true" />
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active Rank Board Student Rankings Workspace */}
          {activeBoard && (
            <div className="glass-panel rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/90 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-semibold text-cyan-300">{activeBoard.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeBoard.subject}</span>
                    {activeBoard.targetGroup && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{activeBoard.targetGroup}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        activeBoard.published
                          ? 'font-semibold text-emerald-300'
                          : 'font-semibold text-amber-300'
                      }
                    >
                      {activeBoard.published
                        ? 'Published (Visible to Users)'
                        : 'Unpublished (Hidden from Normal Users)'}
                    </span>
                  </div>
                  <h2 className="mt-1 font-display text-xl font-bold text-slate-50">
                    {activeBoard.title}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateCustomRankBoard(activeBoard, {
                        rankingMode: activeBoard.rankingMode === 'auto' ? 'manual' : 'auto',
                      })
                        .then(() =>
                          pushToast(
                            'info',
                            activeBoard.rankingMode === 'auto'
                              ? 'Switched to Manual Row Order'
                              : 'Switched to Automatic Marks Ranking'
                          )
                        )
                        .catch((err) =>
                          pushToast(
                            'error',
                            'Mode change failed',
                            err instanceof Error ? err.message : ''
                          )
                        )
                    }
                    className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white"
                  >
                    Mode:{' '}
                    <strong className="text-cyan-300">
                      {activeBoard.rankingMode === 'auto'
                        ? 'Auto by Marks'
                        : 'Manual Order'}
                    </strong>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      recalculateCustomRankBoard(activeBoard.id)
                        .then(() => pushToast('success', 'Rankings recalculated'))
                        .catch((err) =>
                          pushToast(
                            'error',
                            'Recalculation failed',
                            err instanceof Error ? err.message : ''
                          )
                        )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Recalculate Ranks
                  </button>
                </div>
              </div>

              {/* Add / Edit Student Entry Form */}
              <form
                onSubmit={handleSaveEntry}
                className="mt-5 rounded-xl border border-slate-800/90 bg-[#060b18]/80 p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">
                    {editingEntry
                      ? `Edit Student Ranking: ${editingEntry.studentName}`
                      : 'Add Student Ranking Entry'}
                  </h3>
                  {editingEntry && (
                    <button
                      type="button"
                      onClick={() => resetEntryForm(activeBoard)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Cancel Entry Edit
                    </button>
                  )}
                </div>

                {entryError && (
                  <div
                    role="alert"
                    className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-200"
                  >
                    {entryError}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
                  <div className="lg:col-span-4">
                    <label
                      htmlFor="re-student-name"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Student Name
                    </label>
                    <input
                      id="re-student-name"
                      type="text"
                      required
                      maxLength={100}
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="e.g., Kavindu Perera"
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#081022] px-3 py-2 text-sm text-slate-100"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label htmlFor="re-marks" className="block text-xs font-medium text-slate-300">
                      Marks / Score
                    </label>
                    <input
                      id="re-marks"
                      type="number"
                      step="any"
                      min={0}
                      max={10000}
                      required
                      value={entryMarks}
                      onChange={(e) => setEntryMarks(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#081022] px-3 py-2 font-mono text-sm text-slate-100 tabular-nums"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label
                      htmlFor="re-max-marks"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Out Of (Max)
                    </label>
                    <input
                      id="re-max-marks"
                      type="number"
                      step="any"
                      min={1}
                      max={10000}
                      required
                      value={entryMaxMarks}
                      onChange={(e) => setEntryMaxMarks(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#081022] px-3 py-2 font-mono text-sm text-slate-100 tabular-nums"
                    />
                  </div>

                  <div className="lg:col-span-4">
                    <label
                      htmlFor="re-subject"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Relevant Subject or Examination
                    </label>
                    <input
                      id="re-subject"
                      type="text"
                      required
                      maxLength={120}
                      value={entrySubject}
                      onChange={(e) => setEntrySubject(e.target.value)}
                      placeholder="e.g., Engineering Technology — Paper I"
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#081022] px-3 py-2 text-sm text-slate-100"
                    />
                  </div>

                  {/* Associated Past Paper / Item Link */}
                  <div className="lg:col-span-3">
                    <label
                      htmlFor="re-link-type"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Associated Resource Type
                    </label>
                    <select
                      id="re-link-type"
                      value={entryLinkType}
                      onChange={(e) => {
                        const next = e.target.value as RankLinkedItemType;
                        setEntryLinkType(next);
                        setEntryLinkId('');
                      }}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#081022] px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="none">No Linked Item</option>
                      <option value="paper">Past Paper (Auto-cleans on delete)</option>
                      <option value="exam">Online Exam (Auto-cleans on delete)</option>
                      <option value="note">Note (Auto-cleans on delete)</option>
                    </select>
                  </div>

                  <div className="lg:col-span-5">
                    <label
                      htmlFor="re-link-id"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Linked Past Paper / Resource
                    </label>
                    <select
                      id="re-link-id"
                      disabled={entryLinkType === 'none'}
                      value={entryLinkId}
                      onChange={(e) => {
                        const idVal = e.target.value;
                        setEntryLinkId(idVal);
                        const title = resolveLinkedItemTitle(entryLinkType, idVal);
                        if (title) setEntrySubject(title);
                      }}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#081022] px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
                    >
                      <option value="">
                        {entryLinkType === 'none'
                          ? 'Standalone entry (not tied to a specific paper)'
                          : '-- Select resource --'}
                      </option>
                      {entryLinkType === 'paper' &&
                        allPapers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title} ({p.year})
                          </option>
                        ))}
                      {entryLinkType === 'exam' &&
                        allExams.map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            {ex.title}
                          </option>
                        ))}
                      {entryLinkType === 'note' &&
                        allNotes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.title}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Manual Rank Override Option */}
                  <div className="flex flex-col justify-end lg:col-span-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={entryIsManualRank}
                          onChange={(e) => setEntryIsManualRank(e.target.checked)}
                          className="rounded border-slate-600 bg-slate-900"
                        />
                        Manual Rank Override
                      </label>

                      {entryIsManualRank && (
                        <div className="flex items-center gap-2">
                          <label htmlFor="re-manual-rank" className="text-xs text-cyan-300">
                            Rank #
                          </label>
                          <input
                            id="re-manual-rank"
                            type="number"
                            min={1}
                            max={100000}
                            value={entryManualRank}
                            onChange={(e) => setEntryManualRank(e.target.value)}
                            className="w-20 rounded-lg border border-sky-400/50 bg-[#081022] px-2.5 py-1.5 font-mono text-sm text-slate-100 tabular-nums"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3.5">
                  <p className="text-xs text-slate-400">
                    {entryIsManualRank
                      ? `Manual rank #${entryManualRank || 1} will be pinned for this student.`
                      : 'Rank position will be calculated automatically from marks (Rank 1 at top, standard tie handling).'}
                  </p>
                  <button
                    type="submit"
                    disabled={entryBusy}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {entryBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {entryBusy
                      ? 'Saving...'
                      : editingEntry
                      ? 'Update Ranking Entry'
                      : 'Add Student to Rank Board'}
                  </button>
                </div>
              </form>

              {/* Ranked Entries Table */}
              <div className="mt-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Current Standings ({boardEntries.length}{' '}
                    {boardEntries.length === 1 ? 'entry' : 'entries'})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Displayed in descending order with Rank #1 at the top. Changes sync live without
                    refresh.
                  </p>
                </div>

                {boardEntries.length === 0 ? (
                  <div className="rounded-xl border border-slate-800/80 bg-[#060b18]/60 p-8 text-center text-sm text-slate-400">
                    No student entries added to this Rank Board yet. Use the form above to add
                    candidates.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-800/90 bg-[#060b18]/70">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-800 bg-[#070f20] text-xs text-slate-400">
                            <th className="px-4 py-3 font-medium">Rank</th>
                            <th className="px-4 py-3 font-medium">Student Name</th>
                            <th className="px-4 py-3 font-medium">Subject / Examination</th>
                            <th className="px-4 py-3 text-right font-medium">Marks</th>
                            <th className="px-4 py-3 text-right font-medium">Score %</th>
                            <th className="px-4 py-3 text-center font-medium">Order</th>
                            <th className="px-4 py-3 text-right font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/75">
                          {boardEntries.map((entry, idx) => {
                            const isTied = (tieCountsOnActiveBoard.get(entry.rankPosition) || 0) > 1;
                            const isMoving = reorderingId === entry.id;
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
                                  {entry.isManualRank && (
                                    <span className="ml-1.5 font-sans text-[11px] font-normal text-cyan-300">
                                      · Manual
                                    </span>
                                  )}
                                </td>

                                <td className="px-4 py-3">
                                  <p className="font-medium text-slate-100">{entry.studentName}</p>
                                  <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                                    Updated {formatShortDate(entry.updatedAtMs)}
                                  </p>
                                </td>

                                <td className="px-4 py-3">
                                  <p className="text-slate-200">{entry.subject}</p>
                                  {entry.linkedItemType !== 'none' && entry.linkedItemTitle && (
                                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-cyan-300">
                                      <Link2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                                      Linked {entry.linkedItemType}: {entry.linkedItemTitle}
                                    </p>
                                  )}
                                </td>

                                <td className="px-4 py-3 text-right font-mono text-slate-100 tabular-nums whitespace-nowrap">
                                  {entry.marks} / {entry.maxMarks}
                                </td>

                                <td className="px-4 py-3 text-right font-mono font-semibold text-cyan-300 tabular-nums whitespace-nowrap">
                                  {entry.percentage}%
                                </td>

                                <td className="px-4 py-3 text-center whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={idx === 0 || isMoving}
                                      onClick={() => handleMoveEntry(entry.id, 'up')}
                                      aria-label={`Move ${entry.studentName} up`}
                                      className="rounded border border-slate-700 p-1 text-slate-300 hover:border-sky-400/50 hover:text-white disabled:opacity-30"
                                    >
                                      <ArrowUp className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={idx === boardEntries.length - 1 || isMoving}
                                      onClick={() => handleMoveEntry(entry.id, 'down')}
                                      aria-label={`Move ${entry.studentName} down`}
                                      className="rounded border border-slate-700 p-1 text-slate-300 hover:border-sky-400/50 hover:text-white disabled:opacity-30"
                                    >
                                      <ArrowDown className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>

                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingEntry(entry);
                                        setStudentName(entry.studentName);
                                        setEntryMarks(String(entry.marks));
                                        setEntryMaxMarks(String(entry.maxMarks));
                                        setEntrySubject(entry.subject);
                                        setEntryIsManualRank(entry.isManualRank);
                                        setEntryManualRank(String(entry.rankPosition));
                                        setEntryLinkType(entry.linkedItemType);
                                        setEntryLinkId(entry.linkedItemId);
                                        setEntryError(null);
                                      }}
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-medium text-cyan-300 hover:text-white"
                                    >
                                      <Edit3 className="h-3 w-3" aria-hidden="true" />
                                      Edit
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmDialog({
                                          title: 'Delete Ranking Entry',
                                          description: `Remove "${entry.studentName}" (${entry.marks}/${entry.maxMarks}) from "${activeBoard.title}"? Remaining student ranks on this board will update automatically.`,
                                          confirmLabel: 'Remove Entry',
                                          onConfirm: async () => {
                                            await deleteCustomRankEntry(entry);
                                            if (editingEntry?.id === entry.id) {
                                              resetEntryForm(activeBoard);
                                            }
                                            pushToast('info', 'Ranking entry deleted');
                                          },
                                        })
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-2.5 py-1 text-xs font-medium text-rose-300 hover:border-rose-500/40"
                                    >
                                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title || ''}
        description={confirmDialog?.description || ''}
        confirmLabel={confirmDialog?.confirmLabel}
        busy={confirmBusy}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={async () => {
          if (!confirmDialog) return;
          setConfirmBusy(true);
          try {
            await confirmDialog.onConfirm();
            setConfirmDialog(null);
          } catch (err) {
            pushToast('error', 'Operation failed', err instanceof Error ? err.message : '');
          } finally {
            setConfirmBusy(false);
          }
        }}
      />
    </div>
  );
}
