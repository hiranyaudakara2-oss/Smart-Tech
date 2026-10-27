import React, { useState } from 'react';
import { ArrowRight, Check, Clock, Download, ExternalLink, Eye, Lock } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { VISUAL_ASSETS, getDefaultSubjectThumbnail } from '../assets/visualCatalog';
import { PdfViewerModal, ResilientImage } from '../components/SharedUI';
import { ImportantNoticePopup } from '../components/ImportantNoticePopup';
import { RankBoardView } from '../components/RankBoardView';
import {
  evaluateExamStatus,
  formatBytes,
  formatColomboDateTime,
  formatCountdown,
  formatShortDate,
  getResourceTargetUrl,
  isGoogleDriveResource,
} from '../utils/platformLogic';
import {
  markAnnouncementAsRead,
  recordUserResourceActivity,
} from '../services/platformService';
import type { ExamPaper, NoteResource } from '../types/platform';

export function HomePage() {
  const {
    navigate,
    dataLoading,
    stats,
    publishedNotes,
    publishedPapers,
    publishedExams,
    publishedAnnouncements,
    publishedRankEntries,
    readAnnouncementIds,
    firebaseUser,
    isVerifiedAdmin,
    serverNowMs,
  } = usePlatform();

  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    subtitle: string;
    pdfUrl: string;
    fileName: string;
    id: string;
    type: 'note' | 'paper';
    subject: string;
  } | null>(null);

  const featuredNotes = publishedNotes.slice(0, 3);
  const recentPapers = publishedPapers.slice(0, 4);
  const upcomingOrOpenExams = publishedExams
    .filter((ex) => serverNowMs < ex.closesAtMs)
    .slice(0, 3);
  const recentAnnouncements = publishedAnnouncements.slice(0, 4);

  const openNotePreview = (note: NoteResource) => {
    setPreviewDoc({
      id: note.id,
      type: 'note',
      title: note.title,
      subject: note.subject,
      subtitle: `${note.subject} · ${note.grade} · ${formatBytes(note.fileSize)}`,
      pdfUrl: note.pdfUrl,
      fileName: note.fileName,
    });
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

  const openPaperPreview = (paper: ExamPaper) => {
    setPreviewDoc({
      id: paper.id,
      type: 'paper',
      title: paper.title,
      subject: paper.subject,
      subtitle: `${paper.subject} · ${paper.year} · ${paper.language} · PDF`,
      pdfUrl: paper.pdfUrl,
      fileName: paper.fileName,
    });
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

  const statItems = [
    { label: 'Total registered users', value: stats.totalUsers },
    { label: 'Total available PDF documents', value: stats.totalPdfs },
    { label: 'Total published examination papers', value: stats.totalPapers },
    { label: 'Total available online examinations', value: stats.totalExams },
    { label: 'Total available notes', value: stats.totalNotes },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Dynamic Important Administrator Notice Popup */}
      <ImportantNoticePopup
        onNavigateToAnnouncements={() => {
          document
            .getElementById('announcements-heading')
            ?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      {/* Hero Section (Balanced 2-Column Split) */}
      <section
        aria-labelledby="hero-heading"
        className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12"
      >
        <div className="glass-panel flex flex-col justify-between rounded-2xl p-7 sm:p-10 lg:col-span-7">
          <div>
            <p className="text-xs font-medium tracking-wide text-cyan-300">
              Smart Tech · Engineering · Biosystems · ICT · Science for Technology
            </p>
            <h1
              id="hero-heading"
              className="mt-3 font-display text-3xl font-bold leading-tight text-slate-50 sm:text-4xl lg:text-[2.75rem]"
            >
              Structured Digital Mastery for Technology Stream Students
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300">
              Access verified lecture notes, past national and provincial examination papers,
              6-digit password-protected online examinations with automatic marking, and official
              competition rank boards from one responsive academic workspace.
            </p>
          </div>

          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => navigate('notes')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 whitespace-nowrap shrink-0"
            >
              Explore Notes
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => navigate('papers')}
              className="inline-flex items-center justify-center rounded-lg border border-sky-400/35 bg-sky-500/10 px-5 py-2.5 text-sm font-semibold text-slate-100 transition-colors hover:border-cyan-300/60 hover:bg-sky-500/20 whitespace-nowrap shrink-0"
            >
              View Past Papers
            </button>
            <button
              type="button"
              onClick={() => navigate('online-papers')}
              className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900/80 px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white whitespace-nowrap shrink-0"
            >
              Take an Online Exam
            </button>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-sky-400/15 bg-[#091226] lg:col-span-5">
          <ResilientImage
            src={VISUAL_ASSETS.heroTechEducation}
            alt="Precision silicon architecture and optical engineering schematic centerpiece"
            fallbackLabel="Technology Engineering Architecture"
            className="h-72 w-full object-cover sm:h-80 lg:h-full"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#060b18] via-[#060b18]/75 to-transparent p-6">
            <p className="text-xs font-medium text-cyan-300">Synchronized Cloud Library</p>
            <p className="mt-1 text-sm text-slate-200">
              Real-time curriculum documents, auto-graded examinations, and live rankings powered by
              Firebase.
            </p>
          </div>
        </div>
      </section>

      {/* Live Educational Statistics Strip (Real Firestore Records Only) */}
      <section aria-label="Live platform statistics" className="mt-8">
        <div className="glass-surface grid grid-cols-2 gap-px overflow-hidden rounded-2xl sm:grid-cols-3 lg:grid-cols-5">
          {statItems.map((item) => (
            <div key={item.label} className="bg-[#091224]/90 p-5 sm:p-6">
              {dataLoading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-slate-800" />
              ) : (
                <p className="font-mono text-2xl font-semibold text-slate-50 tabular-nums sm:text-3xl">
                  {item.value.toLocaleString()}
                </p>
              )}
              <p className="mt-1.5 text-xs text-slate-400">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Notes Section */}
      <section aria-labelledby="featured-notes-heading" className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="featured-notes-heading" className="text-2xl font-semibold text-slate-50">
              Featured Study Notes
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Recently published PDF modules across Engineering, Biosystems, and ICT streams.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('notes')}
            className="text-sm font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap shrink-0"
          >
            Browse all notes →
          </button>
        </div>

        {dataLoading ? (
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="glass-surface h-72 animate-pulse rounded-2xl p-5" />
            ))}
          </div>
        ) : featuredNotes.length === 0 ? (
          <div className="glass-surface mt-6 rounded-2xl p-8 text-center">
            <h3 className="text-base font-semibold text-slate-100">
              No published study notes in the database yet
            </h3>
            <p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">
              All statistics and cards above reflect live Cloud Firestore records. Verified
              administrators can upload PDF notes or initialize starter Technology Stream modules in
              the Admin panel.
            </p>
            {isVerifiedAdmin && (
              <button
                type="button"
                onClick={() => navigate('admin')}
                className="mt-5 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Open Admin Panel to Upload or Seed Notes
              </button>
            )}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            {featuredNotes.map((note) => {
              const isDrive = isGoogleDriveResource(note);
              const targetUrl = getResourceTargetUrl(note);

              return (
                <article
                  key={note.id}
                  className="glass-surface flex flex-col justify-between overflow-hidden rounded-2xl transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <div>
                    <div className="aspect-[4/3] w-full overflow-hidden border-b border-slate-800/80">
                      <ResilientImage
                        src={note.thumbnailUrl || getDefaultSubjectThumbnail(note.subject)}
                        alt={`${note.title} cover preview`}
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
                        <span className="tabular-nums">{formatShortDate(note.createdAtMs)}</span>
                      </div>
                      <h3 className="mt-2 line-clamp-2 text-base font-semibold text-slate-50">
                        {note.title}
                      </h3>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-400">{note.description}</p>
                      {note.tags.length > 0 && (
                        <p className="mt-2.5 truncate text-xs text-slate-500">
                          {note.tags.join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-slate-800/70 px-5 py-3.5">
                    {isDrive ? (
                      <>
                        <a
                          href={targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
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
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          View Note
                        </a>
                        <a
                          href={targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
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
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white whitespace-nowrap shrink-0"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          Google Drive
                        </a>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => openNotePreview(note)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          Read PDF
                        </button>
                        <a
                          href={
                            note.pdfUrl.startsWith('/api/')
                              ? `${note.pdfUrl}${note.pdfUrl.includes('?') ? '&' : '?'}download=1`
                              : note.pdfUrl
                          }
                          download={note.fileName}
                          target="_blank"
                          rel="noopener noreferrer"
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
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white whitespace-nowrap shrink-0"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          Download
                        </a>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Past Papers & Upcoming Examinations Split */}
      <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Recently Uploaded Past Papers */}
        <section aria-labelledby="recent-papers-heading" className="lg:col-span-7">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="recent-papers-heading" className="text-2xl font-semibold text-slate-50">
                Recently Uploaded PDF Papers
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Official G.C.E. A/L, provincial, and model examination papers in PDF format.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('papers')}
              className="text-sm font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap shrink-0"
            >
              All papers →
            </button>
          </div>

          <div className="glass-surface mt-5 divide-y divide-slate-800/80 rounded-2xl">
            {dataLoading ? (
              <div className="space-y-3 p-6">
                <div className="h-12 animate-pulse rounded bg-slate-800/70" />
                <div className="h-12 animate-pulse rounded bg-slate-800/70" />
              </div>
            ) : recentPapers.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                No past examination papers have been published yet.
              </div>
            ) : (
              recentPapers.map((paper) => {
                const isDrive = isGoogleDriveResource(paper);
                const targetUrl = getResourceTargetUrl(paper);

                return (
                  <div
                    key={paper.id}
                    className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                        <span className="text-cyan-300">{paper.subject}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{paper.year}</span>
                        <span aria-hidden="true">·</span>
                        <span>{paper.category || paper.examType}</span>
                        <span aria-hidden="true">·</span>
                        <span>{paper.language}</span>
                      </div>
                      <h3 className="mt-1 truncate text-sm font-semibold text-slate-100">
                        {paper.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isDrive ? (
                        <a
                          href={targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
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
                          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-sky-500/25 whitespace-nowrap"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          Open Drive
                        </a>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => openPaperPreview(paper)}
                            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white whitespace-nowrap"
                          >
                            Preview
                          </button>
                          <a
                            href={
                              paper.pdfUrl.startsWith('/api/')
                                ? `${paper.pdfUrl}${paper.pdfUrl.includes('?') ? '&' : '?'}download=1`
                                : paper.pdfUrl
                            }
                            download={paper.fileName}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-sky-500/25 whitespace-nowrap"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            PDF
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Upcoming & Live Online Examinations */}
        <section aria-labelledby="upcoming-exams-heading" className="lg:col-span-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="upcoming-exams-heading" className="text-2xl font-semibold text-slate-50">
                Upcoming &amp; Active Examinations
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Enforced on Asia/Colombo server schedule.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('online-papers')}
              className="text-sm font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap shrink-0"
            >
              Exam portal →
            </button>
          </div>

          <div className="glass-surface mt-5 divide-y divide-slate-800/80 rounded-2xl">
            {dataLoading ? (
              <div className="space-y-3 p-6">
                <div className="h-16 animate-pulse rounded bg-slate-800/70" />
                <div className="h-16 animate-pulse rounded bg-slate-800/70" />
              </div>
            ) : upcomingOrOpenExams.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                No upcoming or active online examinations are currently scheduled.
              </div>
            ) : (
              upcomingOrOpenExams.map((exam) => {
                const status = evaluateExamStatus(exam.opensAtMs, exam.closesAtMs, serverNowMs);
                return (
                  <div key={exam.id} className="p-5">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                      <span className="text-cyan-300">
                        {exam.subject} ·{' '}
                        {exam.examMode === 'native'
                          ? `${exam.durationMinutes} min Timed`
                          : 'Google Forms'}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-slate-300">
                        {status.state === 'open' ? (
                          <span className="text-emerald-300">
                            Open · Closes in {formatCountdown(status.remainingMs)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-300">
                            <Lock className="h-3 w-3" aria-hidden="true" />
                            Opens in {formatCountdown(status.remainingMs)}
                          </span>
                        )}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-sm font-semibold text-slate-100">{exam.title}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400 tabular-nums">
                      <Clock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                      Opens: {formatColomboDateTime(exam.opensAtMs)}
                    </p>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => navigate('online-papers')}
                        className="text-xs font-semibold text-cyan-300 hover:text-cyan-200"
                      >
                        {status.state === 'open'
                          ? exam.examMode === 'native'
                            ? 'Enter 6-Digit Password & Start →'
                            : 'Open Examination →'
                          : 'View Exam Details →'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Latest Examination Results & Official Rank Board */}
      <section aria-labelledby="home-rankboard-heading" className="mt-14">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="home-rankboard-heading" className="text-2xl font-semibold text-slate-50">
              Latest Examination Results &amp; Official Rank Board
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Official competition, subject, and examination rankings updated live.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('online-papers')}
            className="text-sm font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap shrink-0"
          >
            View full Rank Board →
          </button>
        </div>

        <RankBoardView
          entries={publishedRankEntries}
          loading={dataLoading}
          compact={true}
          emptyTitle="No published Rank Boards yet"
          emptyDescription="Published subject, competition, past paper, and online examination rank boards appear here automatically in descending order of marks."
        />
      </section>

      {/* Dedicated Announcements Section */}
      <section aria-labelledby="announcements-heading" className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="announcements-heading" className="text-2xl font-semibold text-slate-50">
              Official Announcements &amp; Notices
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Updates from faculty administrators regarding new study materials and exam windows.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          {dataLoading ? (
            <>
              <div className="glass-surface h-32 animate-pulse rounded-2xl p-5" />
              <div className="glass-surface h-32 animate-pulse rounded-2xl p-5" />
            </>
          ) : recentAnnouncements.length === 0 ? (
            <div className="glass-surface rounded-2xl p-8 text-center text-sm text-slate-400 md:col-span-2">
              No administrator announcements have been posted yet.
            </div>
          ) : (
            recentAnnouncements.map((ann) => {
              const isUnread = firebaseUser ? !readAnnouncementIds.has(ann.id) : false;
              return (
                <article
                  key={ann.id}
                  className="glass-surface flex flex-col justify-between overflow-hidden rounded-2xl"
                >
                  <div>
                    {ann.imageUrl && (
                      <div className="h-44 w-full overflow-hidden border-b border-slate-800/80">
                        <ResilientImage
                          src={ann.imageUrl}
                          alt={ann.title}
                          fallbackLabel={ann.category}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={
                              ann.isImportant || ann.priority === 'urgent'
                                ? 'font-semibold text-rose-300'
                                : ann.priority === 'high'
                                ? 'font-semibold text-amber-300'
                                : 'text-cyan-300'
                            }
                          >
                            {ann.isImportant ? 'Important Notice' : ann.category}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatColomboDateTime(ann.publishedAtMs || ann.createdAtMs)}
                          </span>
                        </div>
                        {isUnread && <span className="font-medium text-cyan-300">Unread notice</span>}
                      </div>
                      <h3 className="mt-2 text-base font-semibold text-slate-100">{ann.title}</h3>
                      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-300">
                        {ann.body}
                      </p>
                    </div>
                  </div>

                  {firebaseUser && isUnread && (
                    <div className="flex justify-end px-5 pb-4">
                      <button
                        type="button"
                        onClick={() =>
                          markAnnouncementAsRead(firebaseUser.uid, ann.id).catch(() => undefined)
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Mark as read
                      </button>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>

      <PdfViewerModal
        open={Boolean(previewDoc)}
        title={previewDoc?.title || ''}
        subtitle={previewDoc?.subtitle || ''}
        pdfUrl={previewDoc?.pdfUrl || ''}
        fileName={previewDoc?.fileName || 'document.pdf'}
        onClose={() => setPreviewDoc(null)}
        onDownloadTriggered={() => {
          if (firebaseUser && previewDoc) {
            recordUserResourceActivity({
              userId: firebaseUser.uid,
              resourceId: previewDoc.id,
              resourceType: previewDoc.type,
              resourceTitle: previewDoc.title,
              subject: previewDoc.subject,
              action: 'downloaded',
            }).catch(() => undefined);
          }
        }}
      />
    </div>
  );
}
