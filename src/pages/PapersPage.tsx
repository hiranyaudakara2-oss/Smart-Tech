import React, { useMemo, useState } from 'react';
import { Download, ExternalLink, Eye, Search, Upload } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { PdfViewerModal } from '../components/SharedUI';
import {
  filterAndSortPapers,
  formatBytes,
  formatShortDate,
  getResourceTargetUrl,
  isGoogleDriveResource,
  paginateItems,
} from '../utils/platformLogic';
import { recordUserResourceActivity } from '../services/platformService';
import type { ExamPaper } from '../types/platform';

export function PapersPage() {
  const { publishedPapers, dataLoading, firebaseUser, isVerifiedAdmin, navigate } = usePlatform();

  const [queryText, setQueryText] = useState('');
  const [subject, setSubject] = useState('all');
  const [category, setCategory] = useState('all');
  const [year, setYear] = useState('all');
  const [grade, setGrade] = useState('all');
  const [examType, setExamType] = useState('all');
  const [language, setLanguage] = useState('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);
  const [activePaper, setActivePaper] = useState<ExamPaper | null>(null);

  const filterOptions = useMemo(() => {
    const subjects = new Set<string>([
      'Engineering Technology',
      'Biosystems Technology',
      'ICT',
      'Science for Technology',
    ]);
    const categories = new Set<string>([
      'National Past Paper',
      'Provincial Term Paper',
      'Model Paper',
    ]);
    const years = new Set<string>();
    const grades = new Set<string>();
    const types = new Set<string>(['National A/L', 'Provincial Term Test', 'Model Paper']);
    const languages = new Set<string>(['English', 'Sinhala', 'Tamil']);

    publishedPapers.forEach((p) => {
      subjects.add(p.subject);
      if (p.category) categories.add(p.category);
      years.add(String(p.year));
      grades.add(p.grade);
      types.add(p.examType);
      languages.add(p.language);
    });

    return {
      subjects: Array.from(subjects),
      categories: Array.from(categories),
      years: Array.from(years).sort((a, b) => Number(b) - Number(a)),
      grades: Array.from(grades).sort(),
      types: Array.from(types),
      languages: Array.from(languages),
    };
  }, [publishedPapers]);

  const filteredPapers = useMemo(
    () =>
      filterAndSortPapers(publishedPapers, {
        query: queryText,
        subject,
        category,
        year,
        grade,
        examType,
        language,
        sortOrder,
      }),
    [publishedPapers, queryText, subject, category, year, grade, examType, language, sortOrder]
  );

  const { slice: visiblePapers, totalPages, safePage } = useMemo(
    () => paginateItems(filteredPapers, page, 8),
    [filteredPapers, page]
  );

  const openPreview = (paper: ExamPaper) => {
    setActivePaper(paper);
    if (firebaseUser) {
      recordUserResourceActivity({
        userId: firebaseUser.uid,
        resourceId: paper.id,
        resourceType: 'paper',
        resourceTitle: paper.title,
        subject: paper.subject,
        action: 'viewed',
      }).catch(() => undefined);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-50">
            Past Examination Papers Archive
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Filter national G.C.E. A/L, provincial term test, and model examination papers by
            subject, category, examination year, grade, and medium of instruction.
          </p>
        </div>

        {isVerifiedAdmin && (
          <button
            type="button"
            onClick={() => navigate('admin')}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Upload Past Papers
          </button>
        )}
      </div>

      {/* Multi-Facet Filter Controls */}
      <div className="glass-surface mt-7 rounded-2xl p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label htmlFor="papers-search" className="block text-xs font-medium text-slate-300">
              Search papers
            </label>
            <div className="relative mt-1.5">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="papers-search"
                type="search"
                value={queryText}
                onChange={(e) => {
                  setQueryText(e.target.value);
                  setPage(1);
                }}
                placeholder="Paper title, category, year, or keyword..."
                className="w-full rounded-lg border border-slate-700/80 bg-[#060b18] py-2 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-400"
              />
            </div>
          </div>

          <div>
            <label htmlFor="papers-subject" className="block text-xs font-medium text-slate-300">
              Subject
            </label>
            <select
              id="papers-subject"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setPage(1);
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
            >
              <option value="all">All Subjects</option>
              {filterOptions.subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="papers-category" className="block text-xs font-medium text-slate-300">
              Category
            </label>
            <select
              id="papers-category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
            >
              <option value="all">All Categories</option>
              {filterOptions.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="papers-year" className="block text-xs font-medium text-slate-300">
              Year
            </label>
            <select
              id="papers-year"
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setPage(1);
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
            >
              <option value="all">All Years</option>
              {filterOptions.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="papers-language" className="block text-xs font-medium text-slate-300">
              Language
            </label>
            <select
              id="papers-language"
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                setPage(1);
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
            >
              <option value="all">All Languages</option>
              {filterOptions.languages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="papers-grade" className="text-xs text-slate-400">
              Grade:
            </label>
            <select
              id="papers-grade"
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-700/80 bg-[#060b18] px-2.5 py-1 text-xs text-slate-200"
            >
              <option value="all">All Grades</option>
              {filterOptions.grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            <label htmlFor="papers-type" className="text-xs text-slate-400">
              Exam Type:
            </label>
            <select
              id="papers-type"
              value={examType}
              onChange={(e) => {
                setExamType(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-700/80 bg-[#060b18] px-2.5 py-1 text-xs text-slate-200"
            >
              <option value="all">All Types</option>
              {filterOptions.types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <label htmlFor="papers-sort" className="text-xs text-slate-400">
              Order:
            </label>
            <select
              id="papers-sort"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
              className="rounded-lg border border-slate-700/80 bg-[#060b18] px-2.5 py-1 text-xs text-slate-200"
            >
              <option value="newest">Latest year first</option>
              <option value="oldest">Earliest year first</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              setQueryText('');
              setSubject('all');
              setCategory('all');
              setYear('all');
              setGrade('all');
              setExamType('all');
              setLanguage('all');
              setPage(1);
            }}
            className="text-xs font-medium text-cyan-300 hover:text-cyan-200"
          >
            Reset all filters
          </button>
        </div>
      </div>

      {/* Papers List */}
      {dataLoading ? (
        <div className="mt-6 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-surface h-24 animate-pulse rounded-2xl p-5" />
          ))}
        </div>
      ) : visiblePapers.length === 0 ? (
        <div className="glass-surface mt-6 rounded-2xl p-10 text-center">
          <h2 className="text-base font-semibold text-slate-100">
            No past examination papers match your selection
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            {publishedPapers.length === 0
              ? 'No past papers have been uploaded yet. Verified administrators can upload PDF papers in the Admin workspace.'
              : 'Adjust the year, subject, category, or language filters to view available examination papers.'}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {visiblePapers.map((paper) => {
            const isDrive = isGoogleDriveResource(paper);
            const targetUrl = getResourceTargetUrl(paper);
            const downloadHref = paper.pdfUrl.startsWith('/api/')
              ? `${paper.pdfUrl}${paper.pdfUrl.includes('?') ? '&' : '?'}download=1`
              : targetUrl;

            return (
              <article
                key={paper.id}
                className="glass-surface flex flex-col justify-between rounded-2xl p-5"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    <span className="text-cyan-300">{paper.subject}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono font-semibold text-slate-200 tabular-nums">
                      {paper.year}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{paper.category || paper.examType}</span>
                    <span aria-hidden="true">·</span>
                    <span>{paper.language}</span>
                    <span aria-hidden="true">·</span>
                    <span>{isDrive ? 'Google Drive' : paper.fileFormat}</span>
                  </div>
                  <h2 className="mt-2 text-base font-semibold text-slate-50">{paper.title}</h2>
                  {paper.description && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-slate-400">{paper.description}</p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3.5">
                  <div className="text-xs text-slate-500 tabular-nums">
                    <span>{paper.grade}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{isDrive ? 'Google Drive Link' : formatBytes(paper.fileSize)}</span>
                    <span aria-hidden="true"> · </span>
                    <span>Uploaded {formatShortDate(paper.createdAtMs)}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isDrive ? (
                      <a
                        href={targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open Google Drive paper ${paper.title}`}
                        onClick={() => {
                          if (firebaseUser) {
                            recordUserResourceActivity({
                              userId: firebaseUser.uid,
                              resourceId: paper.id,
                              resourceType: 'paper',
                              resourceTitle: paper.title,
                              subject: paper.subject,
                              action: 'viewed',
                            }).catch(() => undefined);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        Open Google Drive
                      </a>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => openPreview(paper)}
                          aria-label={`Preview ${paper.title}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white whitespace-nowrap"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          Preview
                        </button>
                        <a
                          href={downloadHref}
                          download={paper.fileName}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Download ${paper.title}`}
                          onClick={() => {
                            if (firebaseUser) {
                              recordUserResourceActivity({
                                userId: firebaseUser.uid,
                                resourceId: paper.id,
                                resourceType: 'paper',
                                resourceTitle: paper.title,
                                subject: paper.subject,
                                action: 'downloaded',
                              }).catch(() => undefined);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          Download PDF
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="font-mono text-xs text-slate-300 tabular-nums">
            Page {safePage} of {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      <PdfViewerModal
        open={Boolean(activePaper)}
        title={activePaper?.title || ''}
        subtitle={
          activePaper
            ? `${activePaper.subject} · ${activePaper.year} · ${activePaper.language} · PDF`
            : ''
        }
        pdfUrl={activePaper?.pdfUrl || ''}
        fileName={activePaper?.fileName || 'paper.pdf'}
        onClose={() => setActivePaper(null)}
        onDownloadTriggered={() => {
          if (firebaseUser && activePaper) {
            recordUserResourceActivity({
              userId: firebaseUser.uid,
              resourceId: activePaper.id,
              resourceType: 'paper',
              resourceTitle: activePaper.title,
              subject: activePaper.subject,
              action: 'downloaded',
            }).catch(() => undefined);
          }
        }}
      />
    </div>
  );
}
