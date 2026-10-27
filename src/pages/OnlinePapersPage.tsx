import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  KeyRound,
  Lock,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { ExamPortalModal } from '../components/SharedUI';
import { ExamRunnerModal } from '../components/ExamRunnerModal';
import { RankBoardView } from '../components/RankBoardView';
import {
  evaluateExamStatus,
  formatColomboDateTime,
  formatCountdown,
  formatShortDate,
} from '../utils/platformLogic';
import {
  fetchAuthorizedExamFormUrl,
  recordUserResourceActivity,
} from '../services/platformService';
import type { ExamAttempt, OnlineExam } from '../types/platform';

type PortalViewTab = 'exams' | 'my-results' | 'rank-board';

export function OnlinePapersPage() {
  const {
    publishedExams,
    publishedRankEntries,
    publishedCustomRankEntries,
    myExamAttempts,
    dataLoading,
    serverNowMs,
    firebaseUser,
    userProfile,
    isVerifiedAdmin,
    signInWithGoogle,
    navigate,
    pushToast,
  } = usePlatform();

  const [viewTab, setViewTab] = useState<PortalViewTab>('exams');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'upcoming' | 'closed'>('all');
  const [openingExamId, setOpeningExamId] = useState<string | null>(null);

  const [portalExam, setPortalExam] = useState<{ exam: OnlineExam; formUrl: string } | null>(null);
  const [nativeRunnerExam, setNativeRunnerExam] = useState<OnlineExam | null>(null);
  const [selectedAttemptDetail, setSelectedAttemptDetail] = useState<ExamAttempt | null>(null);

  const filteredExams = useMemo(() => {
    return publishedExams.filter((exam) => {
      if (statusFilter === 'all') return true;
      const ev = evaluateExamStatus(exam.opensAtMs, exam.closesAtMs, serverNowMs);
      return ev.state === statusFilter;
    });
  }, [publishedExams, statusFilter, serverNowMs]);

  const completedAttempts = useMemo(
    () => myExamAttempts.filter((a) => a.status !== 'in_progress'),
    [myExamAttempts]
  );

  const handleOpenExamination = async (exam: OnlineExam) => {
    const check = evaluateExamStatus(exam.opensAtMs, exam.closesAtMs, serverNowMs);
    if (!check.canAccessForm) {
      pushToast('error', 'Examination unavailable', check.statusMessage);
      return;
    }

    if (exam.examMode === 'native') {
      if (!firebaseUser || !userProfile) {
        pushToast(
          'info',
          'Student sign-in required',
          'Sign in with Google so your timed examination attempt and rank standing can be recorded.'
        );
        await signInWithGoogle('online-papers');
        return;
      }
      setNativeRunnerExam(exam);
      return;
    }

    setOpeningExamId(exam.id);
    try {
      const authorizedUrl = await fetchAuthorizedExamFormUrl(exam.id);
      setPortalExam({ exam, formUrl: authorizedUrl });

      if (firebaseUser) {
        recordUserResourceActivity({
          userId: firebaseUser.uid,
          resourceId: exam.id,
          resourceType: 'exam',
          resourceTitle: exam.title,
          subject: exam.subject,
          action: 'opened_exam',
        }).catch(() => undefined);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to unlock examination link.';
      pushToast('error', 'Schedule verification rejected access', msg);
    } finally {
      setOpeningExamId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-50">
            Online Examinations &amp; Official Rank Board
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Sit 6-digit password-protected timed examinations with automatic server marking, review
            your personal scores, and view official competition rankings in Asia/Colombo time.
          </p>
        </div>

        <div className="glass-surface rounded-xl px-4 py-2.5 text-right">
          <p className="text-[11px] text-slate-400">Authoritative Server Clock</p>
          <p className="font-mono text-xs font-medium text-cyan-300 tabular-nums">
            {formatColomboDateTime(serverNowMs)}
          </p>
        </div>
      </div>

      {/* Primary Section Switcher */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div
          role="tablist"
          aria-label="Online examination portal views"
          className="flex flex-wrap items-center gap-2"
        >
          <button
            role="tab"
            type="button"
            aria-selected={viewTab === 'exams'}
            onClick={() => setViewTab('exams')}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              viewTab === 'exams'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            Available Examinations ({publishedExams.length})
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={viewTab === 'my-results'}
            onClick={() => setViewTab('my-results')}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              viewTab === 'my-results'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            My Examination Results ({completedAttempts.length})
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={viewTab === 'rank-board'}
            onClick={() => setViewTab('rank-board')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              viewTab === 'rank-board'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
            Official Rank Board ({publishedRankEntries.length + publishedCustomRankEntries.length})
          </button>
        </div>

        {isVerifiedAdmin && (
          <button
            type="button"
            onClick={() => navigate('admin')}
            className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
          >
            Create Exam, 6-Digit Password &amp; Rank Board in Admin →
          </button>
        )}
      </div>

      {/* TAB 1: AVAILABLE EXAMINATIONS */}
      {viewTab === 'exams' && (
        <>
          <div className="glass-surface mt-6 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" aria-hidden="true" />
              <div className="text-xs leading-relaxed text-slate-300">
                <p className="font-semibold text-slate-100">
                  6-Digit Password Gate, Server Countdown &amp; Automatic Marking Policy
                </p>
                <p className="mt-1 text-slate-400">
                  Interactive Smart Tech examinations require a verified student Google account and
                  the 6-digit numeric access password issued by your instructor. Answer keys never
                  leave the server before results release, countdown timers automatically submit at
                  00:00, and finalized scores feed directly into the Official Rank Board. External
                  Google Forms examinations remain protected by Firestore server schedule locks.
                </p>
              </div>
            </div>
          </div>

          {/* Schedule Status Filter */}
          <div className="mt-6 flex flex-wrap items-center gap-1.5">
            {(
              [
                { key: 'all', label: 'All Examinations' },
                { key: 'open', label: 'Currently Open' },
                { key: 'upcoming', label: 'Upcoming' },
                { key: 'closed', label: 'Closed' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === tab.key
                    ? 'bg-sky-500/20 border border-sky-400/50 text-cyan-200 font-semibold'
                    : 'bg-slate-900/80 text-slate-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {dataLoading ? (
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {[1, 2].map((i) => (
                <div key={i} className="glass-surface h-64 animate-pulse rounded-2xl p-6" />
              ))}
            </div>
          ) : filteredExams.length === 0 ? (
            <div className="glass-surface mt-6 rounded-2xl p-10 text-center">
              <h2 className="text-base font-semibold text-slate-100">
                No online examinations in this category
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
                {publishedExams.length === 0
                  ? 'No online examinations have been published yet. Administrators can create interactive 6-digit password examinations in the Admin Dashboard.'
                  : 'Switch to "All Examinations" to view upcoming or completed examination windows.'}
              </p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {filteredExams.map((exam) => {
                const evaluation = evaluateExamStatus(exam.opensAtMs, exam.closesAtMs, serverNowMs);
                const isUnlocking = openingExamId === exam.id;
                const usedAttempts = myExamAttempts.filter(
                  (a) => a.examId === exam.id && a.status !== 'in_progress'
                ).length;
                const attemptsExhausted =
                  exam.examMode === 'native' && Boolean(firebaseUser) && usedAttempts >= exam.maxAttempts;

                return (
                  <article
                    key={exam.id}
                    className="glass-surface flex flex-col justify-between rounded-2xl p-6"
                  >
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-cyan-300">{exam.subject}</span>
                          <span aria-hidden="true">·</span>
                          <span>{exam.grade}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {exam.examMode === 'native'
                              ? '6-Digit Password · Auto-Graded'
                              : 'Google Forms'}
                          </span>
                        </div>
                        <span
                          className={`font-medium ${
                            evaluation.state === 'open'
                              ? 'text-emerald-300'
                              : evaluation.state === 'upcoming'
                              ? 'text-amber-300'
                              : 'text-slate-400'
                          }`}
                        >
                          {evaluation.state === 'open'
                            ? 'Active Window'
                            : evaluation.state === 'upcoming'
                            ? 'Scheduled'
                            : 'Ended'}
                        </span>
                      </div>

                      <h2 className="mt-2 text-lg font-semibold text-slate-50">{exam.title}</h2>
                      <p className="mt-2 text-sm leading-relaxed text-slate-300">
                        {exam.description}
                      </p>

                      {exam.examMode === 'native' && (
                        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300 tabular-nums">
                          <span>
                            Questions:{' '}
                            <strong className="font-mono text-slate-100">{exam.questionCount}</strong>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Total Marks:{' '}
                            <strong className="font-mono text-slate-100">{exam.totalMarks}</strong>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Duration:{' '}
                            <strong className="font-mono text-cyan-300">
                              {exam.durationMinutes} min
                            </strong>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Max Attempts:{' '}
                            <strong className="font-mono text-slate-100">{exam.maxAttempts}</strong>
                          </span>
                        </div>
                      )}

                      <div className="mt-4 rounded-xl border border-slate-800/90 bg-[#060b18]/80 p-3.5 text-xs text-slate-300">
                        <p className="font-medium text-slate-200">Candidate Instructions</p>
                        <p className="mt-1 text-slate-400">{exam.instructions}</p>
                      </div>

                      <dl className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                        <div className="rounded-lg bg-slate-900/60 px-3 py-2">
                          <dt className="text-slate-400">Scheduled Opening</dt>
                          <dd className="mt-0.5 font-mono text-slate-100 tabular-nums">
                            {formatColomboDateTime(exam.opensAtMs)}
                          </dd>
                        </div>
                        <div className="rounded-lg bg-slate-900/60 px-3 py-2">
                          <dt className="text-slate-400">Scheduled Closing</dt>
                          <dd className="mt-0.5 font-mono text-slate-100 tabular-nums">
                            {formatColomboDateTime(exam.closesAtMs)}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    {/* Schedule Enforcement Action Zone */}
                    <div className="mt-6 border-t border-slate-800/80 pt-4">
                      {evaluation.state === 'upcoming' && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm text-amber-300">
                            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>This examination has not opened yet.</span>
                          </div>
                          <span className="font-mono text-xs font-semibold text-slate-200 tabular-nums">
                            Opens in {formatCountdown(evaluation.remainingMs)}
                          </span>
                        </div>
                      )}

                      {evaluation.state === 'open' && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-xs text-emerald-300 tabular-nums">
                            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>Closes in {formatCountdown(evaluation.remainingMs)}</span>
                          </div>

                          {attemptsExhausted ? (
                            <button
                              type="button"
                              onClick={() => setViewTab('my-results')}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/40 whitespace-nowrap"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Completed ({usedAttempts}/{exam.maxAttempts}) · View Result
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isUnlocking}
                              onClick={() => handleOpenExamination(exam)}
                              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50 whitespace-nowrap shrink-0"
                            >
                              {exam.examMode === 'native' ? (
                                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              {isUnlocking
                                ? 'Verifying Schedule...'
                                : exam.examMode === 'native'
                                ? 'Enter 6-Digit Password & Start'
                                : 'Open Examination'}
                            </button>
                          )}
                        </div>
                      )}

                      {evaluation.state === 'closed' && (
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-slate-400">
                            This examination is now closed.
                          </p>
                          {exam.rankBoardPublished ? (
                            <button
                              type="button"
                              onClick={() => setViewTab('rank-board')}
                              className="rounded-lg border border-sky-400/40 bg-sky-500/10 px-3.5 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-sky-500/20"
                            >
                              View Rank Board
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="cursor-not-allowed rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2 text-xs font-medium text-slate-500"
                            >
                              Closed
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* TAB 2: STUDENT PERSONAL EXAMINATION RESULTS */}
      {viewTab === 'my-results' && (
        <div className="mt-6">
          {!firebaseUser ? (
            <div className="glass-surface rounded-2xl p-10 text-center">
              <h2 className="text-base font-semibold text-slate-100">
                Sign in to view your personal examination results
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
                Authenticate with your student Google account to view your submitted attempts,
                marks, percentages, and question breakdowns.
              </p>
              <button
                type="button"
                onClick={() => signInWithGoogle('online-papers')}
                className="mt-5 rounded-lg bg-sky-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Sign in with Google
              </button>
            </div>
          ) : completedAttempts.length === 0 ? (
            <div className="glass-surface rounded-2xl p-10 text-center">
              <h2 className="text-base font-semibold text-slate-100">
                No completed examination attempts yet
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
                Once you sit and submit a native online examination, your marks and itemized review
                will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {completedAttempts.map((att) => (
                <div
                  key={att.id}
                  className="glass-surface flex flex-col justify-between gap-4 rounded-2xl p-5 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                      <span className="text-cyan-300">{att.subject}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Attempt #{att.attemptNumber}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatShortDate(att.submittedAtMs)}
                      </span>
                    </div>
                    <h3 className="mt-1 text-base font-semibold text-slate-50">{att.examTitle}</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      {att.status === 'pending_review'
                        ? 'Submitted · Pending instructor evaluation of short-answer responses'
                        : !att.resultsPublished
                        ? 'Submitted & Graded · Awaiting official results release by administrator'
                        : att.passed
                        ? 'Finalized · Passed'
                        : 'Finalized · Below passing threshold'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 shrink-0">
                    {att.status === 'graded' && att.resultsPublished && (
                      <div className="text-right font-mono tabular-nums">
                        <p className="text-lg font-bold text-slate-50">
                          {att.marksObtained} / {att.totalMarks}
                        </p>
                        <p className="text-xs font-semibold text-cyan-300">{att.percentage}%</p>
                      </div>
                    )}
                    {att.resultsPublished && (att.reviewBreakdown || []).length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedAttemptDetail(
                            selectedAttemptDetail?.id === att.id ? null : att
                          )
                        }
                        className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white"
                      >
                        {selectedAttemptDetail?.id === att.id ? 'Hide Breakdown' : 'View Breakdown'}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {selectedAttemptDetail && selectedAttemptDetail.resultsPublished && (
                <div className="glass-panel rounded-2xl p-6">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-base font-semibold text-slate-50">
                      Answer Review: {selectedAttemptDetail.examTitle}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSelectedAttemptDetail(null)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {(selectedAttemptDetail.reviewBreakdown || []).map((item, idx) => (
                      <div
                        key={item.questionId}
                        className="rounded-xl border border-slate-800 bg-[#060b18]/80 p-4 text-xs"
                      >
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-slate-200">Question {idx + 1}</span>
                          <span className="font-mono font-semibold text-cyan-300 tabular-nums">
                            {item.marksAwarded} / {item.maxMarks} marks
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-slate-100">{item.prompt}</p>
                        <p className="mt-2 text-slate-300">
                          <span className="text-slate-400">Your answer: </span>
                          {item.studentAnswer}
                        </p>
                        <p className="mt-1 text-cyan-300">
                          <span className="text-slate-400">Expected: </span>
                          {item.correctAnswerLabel}
                        </p>
                        {item.explanation && (
                          <p className="mt-1 text-slate-400">{item.explanation}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: OFFICIAL PUBLIC RANK BOARD */}
      {viewTab === 'rank-board' && (
        <div className="mt-6">
          <RankBoardView
            entries={publishedRankEntries}
            exams={publishedExams}
            loading={dataLoading}
          />
        </div>
      )}

      {/* Google Forms Modal */}
      <ExamPortalModal
        open={Boolean(portalExam)}
        title={portalExam?.exam.title || ''}
        subject={portalExam?.exam.subject || ''}
        formUrl={portalExam?.formUrl || ''}
        onClose={() => setPortalExam(null)}
      />

      {/* Native 6-Digit Password Interactive Exam Runner Modal */}
      <ExamRunnerModal
        open={Boolean(nativeRunnerExam)}
        exam={nativeRunnerExam}
        onClose={() => setNativeRunnerExam(null)}
        onOpenRankBoard={() => setViewTab('rank-board')}
      />
    </div>
  );
}
