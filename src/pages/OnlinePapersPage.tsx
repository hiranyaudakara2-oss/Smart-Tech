import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import {
  Monitor,
  Clock,
  Play,
  Trophy,
  Eye,
  X,
  Loader2,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { ExamRunnerModal } from '../components/ExamRunnerModal';
import { ExamPortalModal } from '../components/SharedUI';
import type { ExamAttempt, OnlineExam } from '../types/platform';
import { evaluateExamSchedule, formatColomboDateTime } from '../utils/platformLogic';
import {
  fetchAuthorizedExamFormUrl,
  recordUserResourceActivity,
} from '../services/platformService';

export function OnlinePapersPage() {
  const {
    publishedExams,
    serverNowMs,
    firebaseUser,
    signInWithGoogle,
    myExamAttempts,
    navigate,
    pushToast,
  } = usePlatform();

  const [activeExam, setActiveExam] = useState<OnlineExam | null>(null);
  const [googleFormPortal, setGoogleFormPortal] = useState<{
    exam: OnlineExam;
    formUrl: string;
  } | null>(null);
  const [loadingFormExamId, setLoadingFormExamId] = useState<string | null>(null);
  const [reviewingAttempt, setReviewingAttempt] = useState<{
    exam: OnlineExam;
    attempt: ExamAttempt;
  } | null>(null);

  const handleStartClick = async (exam: OnlineExam) => {
    if (!firebaseUser) {
      await signInWithGoogle('online-papers');
      return;
    }

    if (exam.examMode === 'google_form') {
      setLoadingFormExamId(exam.id);
      try {
        const formUrl = await fetchAuthorizedExamFormUrl(exam.id);
        if (!formUrl) {
          throw new Error('No Google Form link is configured for this examination.');
        }
        recordUserResourceActivity({
          userId: firebaseUser.uid,
          resourceId: exam.id,
          resourceType: 'exam',
          resourceTitle: exam.title,
          subject: exam.subject,
          action: 'opened_exam',
        }).catch(() => undefined);
        setGoogleFormPortal({ exam, formUrl });
      } catch (err) {
        pushToast(
          'error',
          'Unable to open examination form',
          err instanceof Error ? err.message : 'Please try again during the scheduled window.'
        );
      } finally {
        setLoadingFormExamId(null);
      }
      return;
    }

    // Native timed exam: open ExamRunnerModal directly (no duplicate passcode modal)
    setActiveExam(exam);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
          <Monitor className="h-8 w-8 text-indigo-400" />
          <span>Online Timed Examination System</span>
        </h1>
        <p className="text-slate-300 text-sm sm:text-base max-w-3xl">
          Sit interactive online examinations directly on any device or browser with automated server grading, live countdown timers, auto-saved drafts, and official rank board entry.
        </p>
      </header>

      {/* Available Exams Grid */}
      {publishedExams.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400">
          No online examinations are currently published.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {publishedExams.map((exam) => {
            const evalRes = evaluateExamSchedule(exam, serverNowMs);
            const examAttempts = myExamAttempts.filter((a) => a.examId === exam.id);
            const activeInProgress = examAttempts.find(
              (a) => a.status === 'in_progress' && a.expiresAtMs > serverNowMs
            );
            const completedAttempts = examAttempts.filter((a) => a.status !== 'in_progress');
            const latestCompleted = completedAttempts[0] || null;
            const maxAttempts = Math.max(1, exam.maxAttempts || 1);
            const attemptsExhausted =
              exam.examMode === 'native' &&
              !activeInProgress &&
              completedAttempts.length >= maxAttempts;
            const isOpeningForm = loadingFormExamId === exam.id;

            return (
              <div
                key={exam.id}
                className="glass-panel flex flex-col justify-between rounded-2xl border border-indigo-500/20 bg-slate-900/80 p-6 transition-all hover:border-indigo-500/40"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="rounded-full bg-indigo-500/10 px-3 py-1 font-semibold text-indigo-300 border border-indigo-500/20">
                      {exam.subject}
                    </span>
                    <span
                      className={`font-semibold text-right ${
                        evalRes.state === 'open'
                          ? 'text-emerald-400'
                          : evalRes.state === 'upcoming'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {evalRes.state === 'open'
                        ? 'Open Now'
                        : evalRes.state === 'upcoming'
                        ? 'Upcoming'
                        : 'Closed'}
                    </span>
                  </div>

                  <h3 className="font-bold text-lg text-white line-clamp-2">{exam.title}</h3>
                  <p className="text-xs text-slate-300 line-clamp-3">{exam.description}</p>

                  {exam.examMode === 'native' ? (
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 pt-2 border-t border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-indigo-400" />
                        <span>{exam.durationMinutes} mins</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Trophy className="h-3.5 w-3.5 text-amber-400" />
                        <span>{exam.totalMarks} marks</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-cyan-300 pt-2 border-t border-slate-800">
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Scheduled Google Forms Paper</span>
                    </div>
                  )}

                  <div className="text-[11px] text-slate-400 space-y-0.5">
                    <p>Opens: {formatColomboDateTime(exam.opensAtMs)}</p>
                    <p>Closes: {formatColomboDateTime(exam.closesAtMs)}</p>
                  </div>

                  {activeInProgress && (
                    <div className="rounded-xl border border-cyan-400/35 bg-cyan-950/30 p-3 text-xs text-cyan-200">
                      Active attempt in progress — your saved answers and remaining timer are ready to resume.
                    </div>
                  )}

                  {latestCompleted && (
                    <div className="rounded-xl bg-slate-800/60 p-3 text-xs space-y-1.5 border border-slate-700">
                      {latestCompleted.status === 'pending_review' ? (
                        <div className="flex items-center justify-between text-amber-300 font-semibold">
                          <span>Marking Status:</span>
                          <span>Pending Instructor Review</span>
                        </div>
                      ) : !latestCompleted.resultsPublished && !exam.resultsPublished ? (
                        <div className="flex items-center justify-between text-cyan-300 font-semibold">
                          <span>Submission Recorded:</span>
                          <span>Awaiting Result Release</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between text-slate-300">
                            <span>Your Result:</span>
                            <span className="font-bold text-white">
                              {latestCompleted.marksObtained} / {latestCompleted.totalMarks} (
                              {latestCompleted.percentage}%)
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Outcome:</span>
                            <span
                              className={`font-semibold ${
                                latestCompleted.passed ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {latestCompleted.passed ? 'PASSED' : 'NEEDS REVISION'}
                            </span>
                          </div>
                          {latestCompleted.reviewBreakdown &&
                            latestCompleted.reviewBreakdown.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setReviewingAttempt({ exam, attempt: latestCompleted })
                                }
                                className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900/80 py-1.5 text-[11px] font-semibold text-cyan-300 hover:border-cyan-400/50 hover:text-cyan-200"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>View Question Breakdown</span>
                              </button>
                            )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-slate-800 mt-6">
                  <button
                    type="button"
                    onClick={() => handleStartClick(exam)}
                    disabled={evalRes.state !== 'open' || attemptsExhausted || isOpeningForm}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-md transition-all ${
                      evalRes.state === 'open' && !attemptsExhausted
                        ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 shadow-indigo-500/20 hover:from-indigo-400 hover:to-cyan-400'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }`}
                  >
                    {isOpeningForm ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    <span>
                      {!firebaseUser && evalRes.state === 'open'
                        ? 'Sign In & Start Exam'
                        : activeInProgress
                        ? 'Resume In-Progress Exam'
                        : attemptsExhausted
                        ? `Attempts Completed (${completedAttempts.length}/${maxAttempts})`
                        : latestCompleted
                        ? `Retake Examination (${completedAttempts.length}/${maxAttempts})`
                        : exam.examMode === 'google_form'
                        ? 'Open Scheduled Exam Form'
                        : 'Start Online Exam'}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Active Native Exam Runner Modal */}
      {activeExam && (
        <ExamRunnerModal
          open={Boolean(activeExam)}
          exam={activeExam}
          onClose={() => setActiveExam(null)}
          onOpenRankBoard={() => navigate('home')}
        />
      )}

      {/* Scheduled Google Forms Exam Modal */}
      {googleFormPortal && (
        <ExamPortalModal
          open={Boolean(googleFormPortal)}
          title={googleFormPortal.exam.title}
          subject={googleFormPortal.exam.subject}
          formUrl={googleFormPortal.formUrl}
          onClose={() => setGoogleFormPortal(null)}
        />
      )}

      {/* Completed Result Breakdown Modal */}
      {reviewingAttempt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Result Breakdown: ${reviewingAttempt.exam.title}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6"
        >
          <div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 p-5 sm:p-6 space-y-5 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Verified Examination Result</span>
                </div>
                <h2 className="mt-1 text-lg sm:text-xl font-bold text-white">
                  {reviewingAttempt.exam.title}
                </h2>
                <p className="text-xs text-slate-400">
                  Score: {reviewingAttempt.attempt.marksObtained} /{' '}
                  {reviewingAttempt.attempt.totalMarks} ({reviewingAttempt.attempt.percentage}%)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewingAttempt(null)}
                aria-label="Close result breakdown"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              {(reviewingAttempt.attempt.reviewBreakdown || []).map((item, idx) => (
                <div
                  key={item.questionId}
                  className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-xs space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-200">Question {idx + 1}</span>
                    <span
                      className={`font-mono font-semibold ${
                        item.isCorrect === true
                          ? 'text-emerald-300'
                          : item.isCorrect === false
                          ? 'text-rose-300'
                          : 'text-amber-300'
                      }`}
                    >
                      {item.marksAwarded} / {item.maxMarks} marks
                    </span>
                  </div>
                  <p className="text-sm text-slate-100">{item.prompt}</p>
                  <p className="text-slate-300">
                    <span className="text-slate-400">Your answer: </span>
                    {item.studentAnswer || 'Unanswered'}
                  </p>
                  {reviewingAttempt.exam.showExplanations && (
                    <>
                      <p className="text-cyan-300">
                        <span className="text-slate-400">Expected answer: </span>
                        {item.correctAnswerLabel}
                      </p>
                      {item.explanation && <p className="text-slate-400">{item.explanation}</p>}
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setReviewingAttempt(null)}
                className="rounded-xl bg-sky-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Close Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
