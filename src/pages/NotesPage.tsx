import React, { useMemo, useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import {
  Bookmark,
  BookOpen,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import type { NoteResource } from '../types/platform';
import {
  formatBytes,
  getResourceTargetUrl,
  isGoogleDriveResource,
  resolveResourcePreviewUrl,
  triggerCrossBrowserResourceDownload,
} from '../utils/platformLogic';
import { recordUserResourceActivity } from '../services/platformService';

export function NotesPage() {
  const {
    publishedNotes,
    firebaseUser,
    bookmarkedNoteIds,
    bookmarkedLibraryItems,
    pendingBookmarkIds,
    toggleNoteBookmark,
    navigate,
    pushToast,
  } = usePlatform();
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [savedOnly, setSavedOnly] = useState(false);
  const [activePreviewNote, setActivePreviewNote] = useState<NoteResource | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const subjects = useMemo(() => {
    const set = new Set(publishedNotes.map((n) => n.subject).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [publishedNotes]);

  const filteredNotes = useMemo(() => {
    return publishedNotes.filter((note) => {
      if (savedOnly && !bookmarkedNoteIds.has(note.id)) {
        return false;
      }
      const matchesSubject = selectedSubject === 'All' || note.subject === selectedSubject;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        note.title.toLowerCase().includes(q) ||
        note.description.toLowerCase().includes(q) ||
        note.tags.some((t) => t.toLowerCase().includes(q));
      return matchesSubject && matchesSearch;
    });
  }, [publishedNotes, savedOnly, bookmarkedNoteIds, search, selectedSubject]);

  const handleDownloadPdf = async (note: NoteResource) => {
    if (downloadingId === note.id) return;
    setDownloadingId(note.id);
    try {
      await triggerCrossBrowserResourceDownload(note);
      if (firebaseUser) {
        recordUserResourceActivity({
          userId: firebaseUser.uid,
          resourceId: note.id,
          resourceType: 'note',
          resourceTitle: note.title,
          subject: note.subject,
          action: 'downloaded',
        }).catch(() => undefined);
      }
    } catch (err) {
      pushToast(
        'error',
        'Download unavailable',
        err instanceof Error ? err.message : 'Unable to download this note right now.'
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOpenPreview = (note: NoteResource) => {
    setActivePreviewNote(note);
    if (firebaseUser) {
      recordUserResourceActivity({
        userId: firebaseUser.uid,
        resourceId: note.id,
        resourceType: 'note',
        resourceTitle: note.title,
        subject: note.subject,
        action: 'viewed',
      }).catch(() => undefined);
    }
  };

  const previewUrl = activePreviewNote ? resolveResourcePreviewUrl(activePreviewNote) : '';
  const directTargetUrl = activePreviewNote ? getResourceTargetUrl(activePreviewNote) : '';
  const activePreviewSaved = activePreviewNote ? bookmarkedNoteIds.has(activePreviewNote.id) : false;
  const activePreviewBookmarkBusy = activePreviewNote
    ? pendingBookmarkIds.has(activePreviewNote.id)
    : false;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="space-y-3">
          <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-cyan-400 shrink-0" />
            <span>Educational Notes &amp; Modules</span>
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-3xl">
            Browse, preview, bookmark to My Library, and download G.C.E. A/L study notes, technical guides, and curriculum revision modules on any device.
          </p>
        </div>

        {firebaseUser && (
          <button
            type="button"
            onClick={() => navigate('dashboard')}
            className="inline-flex min-h-[40px] items-center gap-2 self-start sm:self-auto rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-400/50 hover:text-white transition-colors whitespace-nowrap shrink-0 tabular-nums"
          >
            <Bookmark className="h-4 w-4 text-amber-400 fill-amber-400/20" />
            <span>My Library ({bookmarkedLibraryItems.length})</span>
          </button>
        )}
      </header>

      {/* Search & Subject / Saved Filter Controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes by title, topic, or tag..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900/80 pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0">
          {firebaseUser && (
            <button
              type="button"
              onClick={() => setSavedOnly((prev) => !prev)}
              aria-pressed={savedOnly}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0 tabular-nums transition-colors ${
                savedOnly
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-amber-400/50 hover:text-white'
              }`}
            >
              <Bookmark className={`h-3.5 w-3.5 ${savedOnly ? 'fill-current' : 'text-amber-400'}`} />
              <span>Saved ({bookmarkedLibraryItems.length})</span>
            </button>
          )}

          {subjects.map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => setSelectedSubject(sub)}
              className={`min-h-[40px] rounded-xl px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                selectedSubject === sub
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      </div>

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center space-y-3">
          <p className="text-sm font-medium text-slate-300">
            {savedOnly
              ? 'You have no saved notes matching the current filter.'
              : 'No educational notes match your filter criteria.'}
          </p>
          {(savedOnly || selectedSubject !== 'All' || search.trim()) && (
            <div>
              <button
                type="button"
                onClick={() => {
                  setSavedOnly(false);
                  setSelectedSubject('All');
                  setSearch('');
                }}
                className="text-xs font-semibold text-cyan-400 underline hover:text-cyan-300 whitespace-nowrap shrink-0"
              >
                Show all educational notes
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredNotes.map((note) => {
            const isDrive = isGoogleDriveResource(note);
            const busy = downloadingId === note.id;
            const isSaved = bookmarkedNoteIds.has(note.id);
            const bookmarkBusy = pendingBookmarkIds.has(note.id);

            return (
              <div
                key={note.id}
                className="glass-panel flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-6 transition-colors hover:border-slate-700"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-medium text-cyan-300">
                      <span>{note.subject}</span>
                      <span className="text-slate-500" aria-hidden="true"> · </span>
                      <span className="text-slate-400">{note.grade}</span>
                    </p>

                    <button
                      type="button"
                      disabled={bookmarkBusy}
                      onClick={() => toggleNoteBookmark(note)}
                      aria-pressed={isSaved}
                      aria-label={
                        isSaved
                          ? `Remove "${note.title}" from My Library`
                          : `Save "${note.title}" to My Library`
                      }
                      title={isSaved ? 'Saved in My Library (click to remove)' : 'Save to My Library'}
                      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
                        isSaved
                          ? 'border-amber-400/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                          : 'border-slate-700 bg-slate-800/70 text-slate-300 hover:border-amber-400/40 hover:text-white'
                      }`}
                    >
                      {bookmarkBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Bookmark className={`h-3.5 w-3.5 ${isSaved ? 'fill-current text-amber-400' : ''}`} />
                      )}
                      <span>{isSaved ? 'Saved' : 'Save'}</span>
                    </button>
                  </div>

                  <h3 className="font-bold text-lg text-white line-clamp-2">{note.title}</h3>
                  <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                    {note.description}
                  </p>

                  {(note.tags.length > 0 || (!isDrive && note.fileSize > 0)) && (
                    <p className="text-xs text-slate-400 pt-1 tabular-nums">
                      {!isDrive && note.fileSize > 0 ? `PDF · ${formatBytes(note.fileSize)}` : 'Google Drive Document'}
                      {note.tags.length > 0 ? ` · ${note.tags.slice(0, 4).join(' · ')}` : ''}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-5 border-t border-slate-800 mt-6">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDownloadPdf(note)}
                    className="flex-1 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-cyan-500/15 border border-cyan-400/30 px-4 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isDrive ? (
                      <ExternalLink className="h-3.5 w-3.5" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    <span>{isDrive ? 'Download via Drive' : 'Download PDF'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenPreview(note)}
                    className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 p-2.5 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors shrink-0"
                    title="Preview note"
                    aria-label={`Preview ${note.title}`}
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {activePreviewNote && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview: ${activePreviewNote.title}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6"
        >
          <div className="w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 p-5 sm:p-6 space-y-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-cyan-400">
                  {activePreviewNote.subject} · {activePreviewNote.grade}
                </p>
                <h2 className="text-lg sm:text-xl font-bold text-white">{activePreviewNote.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setActivePreviewNote(null)}
                aria-label="Close note preview"
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{activePreviewNote.description}</p>

            {previewUrl && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-2 sm:p-3 space-y-2">
                <iframe
                  src={previewUrl}
                  title={activePreviewNote.title}
                  className="w-full h-[55dvh] sm:h-[60vh] rounded-lg border border-slate-800 bg-slate-900"
                />
                <p className="text-[11px] text-slate-400 text-center">
                  If your mobile browser does not display embedded PDFs inline, use{' '}
                  <a
                    href={directTargetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-cyan-300 underline hover:text-cyan-200"
                  >
                    Open Full Document View
                  </a>{' '}
                  or tap Download below.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={activePreviewBookmarkBusy}
                onClick={() => toggleNoteBookmark(activePreviewNote)}
                aria-pressed={activePreviewSaved}
                className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
                  activePreviewSaved
                    ? 'border-amber-400/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                    : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-amber-400/40 hover:text-white'
                }`}
              >
                {activePreviewBookmarkBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Bookmark
                    className={`h-3.5 w-3.5 ${activePreviewSaved ? 'fill-current text-amber-400' : ''}`}
                  />
                )}
                <span>{activePreviewSaved ? 'Saved in My Library' : 'Save to My Library'}</span>
              </button>

              {directTargetUrl && (
                <a
                  href={directTargetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open in New Tab</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => handleDownloadPdf(activePreviewNote)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap shrink-0"
              >
                <Download className="h-4 w-4" />
                <span>
                  {isGoogleDriveResource(activePreviewNote)
                    ? 'Download via Google Drive'
                    : 'Download Note PDF'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
