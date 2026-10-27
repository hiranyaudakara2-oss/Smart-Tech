import React from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  ExternalLink,
  FileText,
  GraduationCap,
  Trophy,
  User as UserIcon,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import {
  evaluateExamStatus,
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

export function DashboardPage() {
  const {
    authReady,
    firebaseUser,
    userProfile,
    signInWithGoogle,
    navigate,
    publishedNotes,
    publishedPapers,
    publishedExams,
    publishedAnnouncements,
    userActivities,
    myExamAttempts,
    readAnnouncementIds,
    unreadAnnouncementsCount,
    serverNowMs,
  } = usePlatform();

  if (!authReady) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="glass-surface h-64 animate-pulse rounded-2xl p-8" />
      </div>
    );
  }

  if (!firebaseUser || !userProfile) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <div className="glass-panel rounded-2xl p-8 text-center">
          <GraduationCap className="mx-auto h-10 w-10 text-cyan-300" aria-hidden="true" />
          <h1 className="mt-4 font-display text-2xl font-bold text-slate-50">
            Personal Student Dashboard
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Sign in with your Google account to unlock your personalized Technology Stream
            dashboard, track completed online examinations, view recently downloaded PDF resources,
            and receive unread administrator notices.
          </p>
          <button
            type="button"
            onClick={() => signInWithGoogle()}
            className="mt-6 rounded-lg bg-sky-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
          >
            Continue with Google Sign-In
          </button>
        </div>
      </div>
    );
  }

  const upcomingAndOpenExams = publishedExams
    .filter((ex) => serverNowMs < ex.closesAtMs)
    .slice(0, 4);
  const completedAttempts = myExamAttempts.filter((a) => a.status !== 'in_progress');

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Personalized Welcome Header */}
      <div className="glass-panel flex flex-col justify-between gap-6 rounded-2xl p-6 sm:flex-row sm:items-center sm:p-8">
        <div className="flex items-center gap-4">
          {userProfile.photoURL ? (
            <img
              src={userProfile.photoURL}
              alt={`${userProfile.displayName} profile photo`}
              referrerPolicy="no-referrer"
              className="h-14 w-14 rounded-full border border-sky-400/40 object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-sky-400/30 bg-sky-950/60">
              <UserIcon className="h-6 w-6 text-cyan-300" aria-hidden="true" />
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-cyan-300">
              Personal Learning Workspace · {userProfile.grade || 'Technology Stream'}
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-bold text-slate-50 sm:text-3xl">
              Welcome back, {userProfile.displayName}
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">{userProfile.email}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate('notes')}
            className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap"
          >
            Notes
          </button>
          <button
            type="button"
            onClick={() => navigate('papers')}
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white whitespace-nowrap"
          >
            Papers
          </button>
          <button
            type="button"
            onClick={() => navigate('online-papers')}
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white whitespace-nowrap"
          >
            Online Exams &amp; Rank Board
          </button>
          <button
            type="button"
            onClick={() => navigate('profile')}
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white whitespace-nowrap"
          >
            Profile
          </button>
        </div>
      </div>

      {/* Dashboard Summary Cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="glass-surface rounded-2xl p-5">
          <p className="text-xs text-slate-400">Available Notes</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-50 tabular-nums">
            {publishedNotes.length}
          </p>
        </div>
        <div className="glass-surface rounded-2xl p-5">
          <p className="text-xs text-slate-400">Past Examination Papers</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-50 tabular-nums">
            {publishedPapers.length}
          </p>
        </div>
        <div className="glass-surface rounded-2xl p-5">
          <p className="text-xs text-slate-400">Active / Upcoming Exams</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-cyan-300 tabular-nums">
            {upcomingAndOpenExams.length}
          </p>
        </div>
        <div className="glass-surface rounded-2xl p-5">
          <p className="text-xs text-slate-400">My Completed Exams</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-emerald-300 tabular-nums">
            {completedAttempts.length}
          </p>
        </div>
        <div className="glass-surface rounded-2xl p-5">
          <p className="text-xs text-slate-400">Unread Notices</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-amber-300 tabular-nums">
            {unreadAnnouncementsCount}
          </p>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left 7 Columns: Online Examinations, Completed Scores & Recent Activity */}
        <div className="space-y-8 lg:col-span-7">
          <section aria-labelledby="dash-exams-heading" className="glass-surface rounded-2xl p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 id="dash-exams-heading" className="text-lg font-semibold text-slate-50">
                Available &amp; Upcoming Online Examinations
              </h2>
              <button
                type="button"
                onClick={() => navigate('online-papers')}
                className="text-xs font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
              >
                Open Exam Center →
              </button>
            </div>

            {upcomingAndOpenExams.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">
                No open or upcoming online examinations are currently scheduled.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-slate-800/80">
                {upcomingAndOpenExams.map((exam) => {
                  const ev = evaluateExamStatus(exam.opensAtMs, exam.closesAtMs, serverNowMs);
                  return (
                    <div key={exam.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                        <span className="text-cyan-300">
                          {exam.subject} · {exam.grade} ·{' '}
                          {exam.examMode === 'native'
                            ? `${exam.durationMinutes} min Timed`
                            : 'Google Forms'}
                        </span>
                        <span className="font-mono tabular-nums">
                          {ev.state === 'open' ? (
                            <span className="text-emerald-300">
                              Open now · Closes in {formatCountdown(ev.remainingMs)}
                            </span>
                          ) : (
                            <span className="text-amber-300">
                              Opens in {formatCountdown(ev.remainingMs)}
                            </span>
                          )}
                        </span>
                      </div>
                      <h3 className="mt-1 text-sm font-semibold text-slate-100">{exam.title}</h3>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                          Opens: {formatColomboDateTime(exam.opensAtMs)}
                        </span>
                        <span>Closes: {formatColomboDateTime(exam.closesAtMs)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Completed Examination Attempts */}
          <section aria-labelledby="dash-scores-heading" className="glass-surface rounded-2xl p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                <h2 id="dash-scores-heading" className="text-lg font-semibold text-slate-50">
                  My Examination Attempts &amp; Scores
                </h2>
              </div>
              <button
                type="button"
                onClick={() => navigate('online-papers')}
                className="text-xs font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
              >
                Rank Board →
              </button>
            </div>

            {completedAttempts.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">
                You have not completed any online examinations yet.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-800/80">
                {completedAttempts.slice(0, 6).map((att) => (
                  <li key={att.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-100">{att.examTitle}</p>
                      <p className="text-xs text-slate-400">
                        {att.subject} · Attempt #{att.attemptNumber} ·{' '}
                        {formatShortDate(att.submittedAtMs)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right font-mono text-xs tabular-nums">
                      {att.status === 'graded' && att.resultsPublished ? (
                        <span className="font-semibold text-cyan-300">
                          {att.marksObtained}/{att.totalMarks} ({att.percentage}%)
                        </span>
                      ) : (
                        <span className="text-amber-300">Pending Release</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="dash-activity-heading" className="glass-surface rounded-2xl p-6">
            <h2 id="dash-activity-heading" className="text-lg font-semibold text-slate-50">
              Recently Viewed &amp; Downloaded Resources
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Private history isolated to your authenticated Firebase UID.
            </p>

            {userActivities.length === 0 ? (
              <div className="mt-4 rounded-xl border border-slate-800/80 bg-[#060b18]/60 p-5 text-sm text-slate-400">
                Resources you preview or download from the Note, paper, or Online paper pages will
                appear here automatically.
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-slate-800/80">
                {userActivities.map((act) => (
                  <li key={act.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-100">{act.resourceTitle}</p>
                      <p className="text-xs text-slate-400">
                        {act.subject} ·{' '}
                        {act.action === 'downloaded'
                          ? 'Downloaded PDF'
                          : act.action === 'opened_exam'
                          ? 'Started Exam'
                          : act.action === 'submitted_exam'
                          ? 'Submitted Exam'
                          : 'Viewed PDF'}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-slate-500 tabular-nums">
                      {formatShortDate(act.createdAtMs)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right 5 Columns: Administrator Messages & Newly Published Materials */}
        <div className="space-y-8 lg:col-span-5">
          <section aria-labelledby="dash-messages-heading" className="glass-surface rounded-2xl p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 id="dash-messages-heading" className="text-lg font-semibold text-slate-50">
                Administrator Messages
              </h2>
              {unreadAnnouncementsCount > 0 && (
                <span className="font-mono text-xs font-semibold text-cyan-300 tabular-nums">
                  {unreadAnnouncementsCount} unread
                </span>
              )}
            </div>

            {publishedAnnouncements.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No announcements published yet.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {publishedAnnouncements.slice(0, 5).map((ann) => {
                  const unread = !readAnnouncementIds.has(ann.id);
                  return (
                    <div
                      key={ann.id}
                      className="rounded-xl border border-slate-800/90 bg-[#060b18]/75 p-4"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
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
                        <span className="tabular-nums">{formatShortDate(ann.createdAtMs)}</span>
                      </div>
                      <h3 className="mt-1.5 text-sm font-semibold text-slate-100">{ann.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-300">{ann.body}</p>
                      {unread && (
                        <button
                          type="button"
                          onClick={() =>
                            markAnnouncementAsRead(firebaseUser.uid, ann.id).catch(() => undefined)
                          }
                          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Mark read
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-labelledby="dash-recent-pubs" className="glass-surface rounded-2xl p-6">
            <h2 id="dash-recent-pubs" className="text-lg font-semibold text-slate-50">
              Latest Notes &amp; Past Papers
            </h2>
            <div className="mt-4 space-y-3">
              {publishedNotes.slice(0, 2).map((n) =>
                isGoogleDriveResource(n) ? (
                  <a
                    key={n.id}
                    href={getResourceTargetUrl(n)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      recordUserResourceActivity({
                        userId: firebaseUser.uid,
                        resourceId: n.id,
                        resourceType: 'note',
                        resourceTitle: n.title,
                        subject: n.subject,
                        action: 'viewed',
                      }).catch(() => undefined);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800/90 bg-[#060b18]/70 p-3.5 text-left hover:border-sky-400/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <BookOpen className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-100">{n.title}</p>
                        <p className="text-[11px] text-slate-400">
                          Google Drive Note · {n.subject} · {n.grade}
                        </p>
                      </div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
                  </a>
                ) : (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => navigate('notes')}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800/90 bg-[#060b18]/70 p-3.5 text-left hover:border-sky-400/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <BookOpen className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-100">{n.title}</p>
                        <p className="text-[11px] text-slate-400">
                          Note · {n.subject} · {n.grade}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                  </button>
                )
              )}
              {publishedPapers.slice(0, 2).map((p) =>
                isGoogleDriveResource(p) ? (
                  <a
                    key={p.id}
                    href={getResourceTargetUrl(p)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      recordUserResourceActivity({
                        userId: firebaseUser.uid,
                        resourceId: p.id,
                        resourceType: 'paper',
                        resourceTitle: p.title,
                        subject: p.subject,
                        action: 'viewed',
                      }).catch(() => undefined);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800/90 bg-[#060b18]/70 p-3.5 text-left hover:border-sky-400/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-100">{p.title}</p>
                        <p className="text-[11px] text-slate-400">
                          Google Drive Paper · {p.subject} · {p.year}
                        </p>
                      </div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
                  </a>
                ) : (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => navigate('papers')}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800/90 bg-[#060b18]/70 p-3.5 text-left hover:border-sky-400/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-100">{p.title}</p>
                        <p className="text-[11px] text-slate-400">
                          Past Paper · {p.subject} · {p.year}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                  </button>
                )
              )}
              {publishedNotes.length === 0 && publishedPapers.length === 0 && (
                <p className="text-sm text-slate-400">
                  Newly uploaded study modules and papers will appear here.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
