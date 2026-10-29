import React, { useMemo, useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import {
  FileText,
  Download,
  ExternalLink,
  Search,
  Calendar,
  Award,
  Eye,
  X,
  Loader2,
} from 'lucide-react';
import type { ExamPaper } from '../types/platform';
import {
  formatBytes,
  getResourceTargetUrl,
  isGoogleDriveResource,
  resolveResourcePreviewUrl,
  triggerCrossBrowserResourceDownload,
} from '../utils/platformLogic';
import { recordUserResourceActivity } from '../services/platformService';

export function PapersPage() {
  const { publishedPapers, firebaseUser, pushToast } = usePlatform();
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [selectedYear, setSelectedYear] = useState('All');
  const [activePreviewPaper, setActivePreviewPaper] = useState<ExamPaper | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const subjects = useMemo(() => {
    const set = new Set(publishedPapers.map((p) => p.subject).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [publishedPapers]);

  const years = useMemo(() => {
    const set = new Set(publishedPapers.map((p) => String(p.year)).filter(Boolean));
    return ['All', ...Array.from(set).sort().reverse()];
  }, [publishedPapers]);

  const filteredPapers = useMemo(() => {
    return publishedPapers.filter((paper) => {
      const matchSub = selectedSubject === 'All' || paper.subject === selectedSubject;
      const matchYr = selectedYear === 'All' || String(paper.year) === selectedYear;
      const q = search.trim().toLowerCase();
      const matchQ =
        !q ||
        paper.title.toLowerCase().includes(q) ||
        paper.description.toLowerCase().includes(q) ||
        paper.category.toLowerCase().includes(q);
      return matchSub && matchYr && matchQ;
    });
  }, [publishedPapers, search, selectedSubject, selectedYear]);

  const handleDownloadPaper = async (paper: ExamPaper) => {
    if (downloadingId === paper.id) return;
    setDownloadingId(paper.id);
    try {
      await triggerCrossBrowserResourceDownload(paper);
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
    } catch (err) {
      pushToast(
        'error',
        'Download unavailable',
        err instanceof Error ? err.message : 'Unable to download this paper right now.'
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOpenPreview = (paper: ExamPaper) => {
    setActivePreviewPaper(paper);
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

  const previewUrl = activePreviewPaper ? resolveResourcePreviewUrl(activePreviewPaper) : '';
  const directTargetUrl = activePreviewPaper ? getResourceTargetUrl(activePreviewPaper) : '';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
          <FileText className="h-8 w-8 text-sky-400" />
          <span>Past Papers &amp; Model Examinations</span>
        </h1>
        <p className="text-slate-300 text-sm sm:text-base max-w-3xl">
          Preview and download past examination papers, provincial evaluation papers, and structured model test papers on any browser or mobile device.
        </p>
      </header>

      {/* Filter Toolbar */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search papers by title..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900/80 pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
          />
        </div>

        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
        >
          {subjects.map((sub) => (
            <option key={sub} value={sub}>
              Subject: {sub}
            </option>
          ))}
        </select>

        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
        >
          {years.map((yr) => (
            <option key={yr} value={yr}>
              Year: {yr}
            </option>
          ))}
        </select>
      </div>

      {/* Papers Grid */}
      {filteredPapers.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400">
          No past papers match your current search filters.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPapers.map((paper) => {
            const isDrive = isGoogleDriveResource(paper);
            const busy = downloadingId === paper.id;
            return (
              <div
                key={paper.id}
                className="glass-panel flex flex-col justify-between rounded-2xl border border-sky-400/15 bg-slate-900/80 p-6 transition-all hover:border-sky-400/30"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="rounded-full bg-sky-500/10 px-3 py-1 font-semibold text-sky-300 border border-sky-500/20">
                      {paper.category}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {paper.year}
                    </span>
                  </div>

                  <h3 className="font-bold text-lg text-white line-clamp-2">{paper.title}</h3>
                  <p className="text-xs text-slate-300 line-clamp-3">{paper.description}</p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 pt-2">
                    <span className="flex items-center gap-1">
                      <Award className="h-3.5 w-3.5 text-cyan-400" />
                      {paper.subject}
                    </span>
                    <span>{paper.grade}</span>
                    {paper.language && <span>{paper.language}</span>}
                    {!isDrive && paper.fileSize > 0 && (
                      <span className="font-mono">{formatBytes(paper.fileSize)}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-6 border-t border-slate-800 mt-6">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDownloadPaper(paper)}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-sky-500/20 hover:from-sky-400 hover:to-blue-500 transition-all disabled:opacity-60"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isDrive ? (
                      <ExternalLink className="h-4 w-4" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    <span>{isDrive ? 'Download via Drive' : 'Download Paper PDF'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenPreview(paper)}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 p-2.5 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                    title="Preview paper"
                    aria-label={`Preview ${paper.title}`}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paper Preview Modal */}
      {activePreviewPaper && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview: ${activePreviewPaper.title}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6"
        >
          <div className="w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 p-5 sm:p-6 space-y-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-sky-400">
                  {activePreviewPaper.subject} · {activePreviewPaper.year} · {activePreviewPaper.grade}
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-white">{activePreviewPaper.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setActivePreviewPaper(null)}
                aria-label="Close paper preview"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{activePreviewPaper.description}</p>

            {previewUrl && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-2 sm:p-3 space-y-2">
                <iframe
                  src={previewUrl}
                  title={activePreviewPaper.title}
                  className="w-full h-[55dvh] sm:h-[60vh] rounded-lg border border-slate-800 bg-slate-900"
                />
                <p className="text-[11px] text-slate-400 text-center">
                  If your mobile browser does not display embedded PDFs inline, use{' '}
                  <a
                    href={directTargetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-sky-300 underline hover:text-sky-200"
                  >
                    Open Full Paper View
                  </a>{' '}
                  or tap Download below.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              {directTargetUrl && (
                <a
                  href={directTargetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open in New Tab</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => handleDownloadPaper(activePreviewPaper)}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-xs font-semibold text-white hover:bg-sky-400"
              >
                <Download className="h-4 w-4" />
                <span>
                  {isGoogleDriveResource(activePreviewPaper)
                    ? 'Download via Google Drive'
                    : 'Download Paper PDF'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
