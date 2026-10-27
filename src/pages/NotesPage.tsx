import React, { useMemo, useState } from 'react';
import { Download, ExternalLink, Eye, Search, Upload } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { getDefaultSubjectThumbnail } from '../assets/visualCatalog';
import { PdfViewerModal, ResilientImage } from '../components/SharedUI';
import {
  filterAndSortNotes,
  formatBytes,
  formatShortDate,
  getResourceTargetUrl,
  isGoogleDriveResource,
  paginateItems,
} from '../utils/platformLogic';
import { recordUserResourceActivity } from '../services/platformService';
import type { NoteResource } from '../types/platform';

const DEFAULT_STREAMS = [
  'All',
  'Engineering Technology',
  'Biosystems Technology',
  'ICT',
  'Science for Technology',
];

export function NotesPage() {
  const { publishedNotes, dataLoading, firebaseUser, isVerifiedAdmin, navigate } = usePlatform();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [selectedTag, setSelectedTag] = useState('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);
  const [activeNote, setActiveNote] = useState<NoteResource | null>(null);

  const availableSubjects = useMemo(() => {
    const dynamic = new Set(DEFAULT_STREAMS.slice(1));
    publishedNotes.forEach((n) => dynamic.add(n.subject));
    return Array.from(dynamic);
  }, [publishedNotes]);

  const availableGrades = useMemo(() => {
    const grades = new Set<string>();
    publishedNotes.forEach((n) => grades.add(n.grade));
    return Array.from(grades).sort();
  }, [publishedNotes]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    publishedNotes.forEach((n) => (n.tags || []).forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [publishedNotes]);

  const filteredNotes = useMemo(
    () =>
      filterAndSortNotes(publishedNotes, {
        query: searchQuery,
        subject: selectedSubject,
        grade: selectedGrade,
        tag: selectedTag,
        sortOrder,
      }),
    [publishedNotes, searchQuery, selectedSubject, selectedGrade, selectedTag, sortOrder]
  );

  const { slice: visibleNotes, totalPages, safePage } = useMemo(
    () => paginateItems(filteredNotes, page, 6),
    [filteredNotes, page]
  );

  const handleOpenPreview = (note: NoteResource) => {
    setActiveNote(note);
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-50">
            Educational Notes Library
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Search and filter structured PDF lecture notes by technology stream, academic grade,
            topic tags, and publication date.
          </p>
        </div>

        {isVerifiedAdmin && (
          <button
            type="button"
            onClick={() => navigate('admin')}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Upload or Manage Notes
          </button>
        )}
      </div>

      {/* Interactive Search & Filter Toolbar */}
      <div className="glass-surface mt-7 rounded-2xl p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-5">
            <label htmlFor="notes-search-input" className="block text-xs font-medium text-slate-300">
              Search notes
            </label>
            <div className="relative mt-1.5">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="notes-search-input"
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by topic, tag, unit title, or keyword..."
                className="w-full rounded-lg border border-slate-700/80 bg-[#060b18] py-2 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-400"
              />
            </div>
          </div>

          <div className="md:col-span-3">
            <label htmlFor="notes-grade-select" className="block text-xs font-medium text-slate-300">
              Grade / Academic Level
            </label>
            <select
              id="notes-grade-select"
              value={selectedGrade}
              onChange={(e) => {
                setSelectedGrade(e.target.value);
                setPage(1);
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
            >
              <option value="all">All Academic Levels</option>
              {availableGrades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="notes-tag-select" className="block text-xs font-medium text-slate-300">
              Topic Tag
            </label>
            <select
              id="notes-tag-select"
              value={selectedTag}
              onChange={(e) => {
                setSelectedTag(e.target.value);
                setPage(1);
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
            >
              <option value="all">All Tags</option>
              {availableTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="notes-sort-select" className="block text-xs font-medium text-slate-300">
              Sort Order
            </label>
            <select
              id="notes-sort-select"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
              className="mt-1.5 w-full rounded-lg border border-slate-700/80 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </div>

        {/* Interactive Stream Filter Buttons */}
        <div
          role="group"
          aria-label="Filter notes by technology stream"
          className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-800/80 pt-4"
        >
          <button
            type="button"
            onClick={() => {
              setSelectedSubject('all');
              setPage(1);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              selectedSubject === 'all'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'bg-slate-900/80 text-slate-300 hover:text-white'
            }`}
          >
            All Streams
          </button>
          {availableSubjects.map((subj) => (
            <button
              key={subj}
              type="button"
              onClick={() => {
                setSelectedSubject(subj);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                selectedSubject === subj
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'bg-slate-900/80 text-slate-300 hover:text-white'
              }`}
            >
              {subj}
            </button>
          ))}
        </div>
      </div>

      {/* Results Count */}
      <div className="mt-5 flex items-center justify-between text-xs text-slate-400">
        <span className="tabular-nums">
          Showing {visibleNotes.length} of {filteredNotes.length} published notes
        </span>
        {(searchQuery ||
          selectedSubject !== 'all' ||
          selectedGrade !== 'all' ||
          selectedTag !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedSubject('all');
              setSelectedGrade('all');
              setSelectedTag('all');
              setPage(1);
            }}
            className="text-cyan-300 hover:text-cyan-200"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Notes Grid */}
      {dataLoading ? (
        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-surface h-80 animate-pulse rounded-2xl p-5" />
          ))}
        </div>
      ) : visibleNotes.length === 0 ? (
        <div className="glass-surface mt-6 rounded-2xl p-10 text-center">
          <h2 className="text-base font-semibold text-slate-100">No matching notes found</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            {publishedNotes.length === 0
              ? 'No educational notes have been uploaded yet. Administrators can upload PDF modules from the Admin panel.'
              : 'Try broadening your search terms or clearing the selected subject or tag filter.'}
          </p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visibleNotes.map((note) => {
            const isDrive = isGoogleDriveResource(note);
            const targetUrl = getResourceTargetUrl(note);
            const downloadHref = note.pdfUrl.startsWith('/api/')
              ? `${note.pdfUrl}${note.pdfUrl.includes('?') ? '&' : '?'}download=1`
              : targetUrl;

            return (
              <article
                key={note.id}
                className="glass-surface flex flex-col justify-between overflow-hidden rounded-2xl"
              >
                <div>
                  <div className="aspect-[4/3] w-full overflow-hidden border-b border-slate-800/80">
                    <ResilientImage
                      src={note.thumbnailUrl || getDefaultSubjectThumbnail(note.subject)}
                      alt={`${note.title} cover image`}
                      fallbackLabel={note.subject}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-5">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                      <span className="text-cyan-300">{note.subject}</span>
                      <span aria-hidden="true">·</span>
                      <span>{note.grade}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {isDrive ? 'Google Drive' : formatBytes(note.fileSize)}
                      </span>
                    </div>
                    <h2 className="mt-2 text-base font-semibold text-slate-50">{note.title}</h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-400">
                      {note.description}
                    </p>
                    {note.tags.length > 0 && (
                      <p className="mt-2.5 truncate text-xs text-cyan-300/85">
                        {note.tags.join(' · ')}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-slate-500 tabular-nums">
                      Uploaded {formatShortDate(note.createdAtMs)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-800/80 px-5 py-3.5">
                  {isDrive ? (
                    <>
                      <a
                        href={targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`View ${note.title} on Google Drive`}
                        onClick={() => {
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
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        View Note
                      </a>
                      <a
                        href={targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open Google Drive link for ${note.title}`}
                        onClick={() => {
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
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap shrink-0"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        Open Google Drive
                      </a>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenPreview(note)}
                        aria-label={`Open PDF preview for ${note.title}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        Open PDF
                      </button>
                      <a
                        href={downloadHref}
                        download={note.fileName}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Download PDF for ${note.title}`}
                        onClick={() => {
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
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        Download PDF
                      </a>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
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
        open={Boolean(activeNote)}
        title={activeNote?.title || ''}
        subtitle={
          activeNote
            ? `${activeNote.subject} · ${activeNote.grade} · ${formatBytes(activeNote.fileSize)}`
            : ''
        }
        pdfUrl={activeNote?.pdfUrl || ''}
        fileName={activeNote?.fileName || 'note.pdf'}
        onClose={() => setActiveNote(null)}
        onDownloadTriggered={() => {
          if (firebaseUser && activeNote) {
            recordUserResourceActivity({
              userId: firebaseUser.uid,
              resourceId: activeNote.id,
              resourceType: 'note',
              resourceTitle: activeNote.title,
              subject: activeNote.subject,
              action: 'downloaded',
            }).catch(() => undefined);
          }
        }}
      />
    </div>
  );
}
