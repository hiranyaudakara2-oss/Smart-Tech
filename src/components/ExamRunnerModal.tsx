import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import {
  formatCountdown,
  isValidSixDigitCode,
} from '../utils/platformLogic';
import {
  saveStudentExamDraftAnswers,
  startStudentExamSession,
  submitStudentExamAttempt,
} from '../services/platformService';
import type {
  ExamAttemptStatus,
  OnlineExam,
  QuestionGradingBreakdown,
} from '../types/platform';

interface ExamRunnerModalProps {
  open: boolean;
  exam: OnlineExam | null;
  onClose: () => void;
  onOpenRankBoard?: () => void;
}

type RunnerStage = 'password_gate' | 'active_runner' | 'submitted_summary';

export function ExamRunnerModal({
  open,
  exam,
  onClose,
  onOpenRankBoard,
}: ExamRunnerModalProps) {
  const {
    userProfile,
    myExamAttempts,
    serverNowMs,
    refreshRankBoard,
    pushToast,
  } = usePlatform();

  const [stage, setStage] = useState<RunnerStage>('password_gate');
  const [accessCode, setAccessCode] = useState('');
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  const [attemptId, setAttemptId] = useState('');
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [attemptPermit, setAttemptPermit] = useState('');
  const [expiresAtMs, setExpiresAtMs] = useState(0);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [submissionResult, setSubmissionResult] = useState<{
    status: ExamAttemptStatus;
    marksObtained: number;
    totalMarks: number;
    percentage: number;
    passed: boolean;
    resultsPublished: boolean;
    reviewBreakdown: QuestionGradingBreakdown[];
    serverReceipt: string;
    autoSubmittedByTimer?: boolean;
  } | null>(null);

  const autoSubmitTriggeredRef = useRef(false);
  const latestAnswersRef = useRef<Record<string, string>>({});
  latestAnswersRef.current = answers;

  useEffect(() => {
    if (!open || !exam) {
      setStage('password_gate');
      setAccessCode('');
      setGateError(null);
      setGateBusy(false);
      setAttemptId('');
      setAttemptPermit('');
      setAnswers({});
      setCurrentIdx(0);
      setConfirmSubmitOpen(false);
      setSubmitting(false);
      setSubmissionResult(null);
      autoSubmitTriggeredRef.current = false;
    }
  }, [open, exam?.id]);

  const completedCountForExam = useMemo(() => {
    if (!exam) return 0;
    return myExamAttempts.filter(
      (a) => a.examId === exam.id && a.status !== 'in_progress'
    ).length;
  }, [exam, myExamAttempts]);

  const activeDraftAttempt = useMemo(() => {
    if (!exam) return null;
    return (
      myExamAttempts.find(
        (a) =>
          a.examId === exam.id &&
          a.status === 'in_progress' &&
          a.expiresAtMs > serverNowMs
      ) || null
    );
  }, [exam, myExamAttempts, serverNowMs]);

  const executeFinalSubmit = useCallback(
    async (isAutoTimer: boolean) => {
      if (!exam || !userProfile || !attemptId || !attemptPermit) return;
      if (submitting) return;

      setSubmitting(true);
      setConfirmSubmitOpen(false);
      try {
        const res = await submitStudentExamAttempt({
          exam,
          attemptId,
          attemptPermit,
          answers: latestAnswersRef.current,
          studentProfile: userProfile,
        });

        try {
          window.localStorage.removeItem(`smart_tech_exam_draft_${attemptId}`);
        } catch {
          // Ignore storage error
        }

        await refreshRankBoard();
        setSubmissionResult({
          ...res,
          autoSubmittedByTimer: isAutoTimer,
        });
        setStage('submitted_summary');
        pushToast(
          'success',
          isAutoTimer
            ? 'Time expired — examination submitted automatically'
            : 'Examination submitted successfully',
          res.status === 'graded' && res.resultsPublished
            ? `Score: ${res.marksObtained}/${res.totalMarks} (${res.percentage}%)`
            : 'Your answers have been recorded securely.'
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to submit examination.';
        pushToast('error', 'Submission error', msg);
        autoSubmitTriggeredRef.current = false;
      } finally {
        setSubmitting(false);
      }
    },
    [attemptId, attemptPermit, exam, pushToast, refreshRankBoard, submitting, userProfile]
  );

  // Automatic timer submission when countdown hits 00:00
  const remainingTimerMs = stage === 'active_runner' ? Math.max(0, expiresAtMs - serverNowMs) : 0;

  useEffect(() => {
    if (stage !== 'active_runner' || !expiresAtMs) return;
    if (serverNowMs >= expiresAtMs && !autoSubmitTriggeredRef.current) {
      autoSubmitTriggeredRef.current = true;
      executeFinalSubmit(true);
    }
  }, [stage, expiresAtMs, serverNowMs, executeFinalSubmit]);

  // Periodic background draft sync to Firestore while taking the exam
  useEffect(() => {
    if (stage !== 'active_runner' || !attemptId) return;
    const syncTimer = window.setInterval(() => {
      saveStudentExamDraftAnswers(attemptId, latestAnswersRef.current).catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(syncTimer);
  }, [stage, attemptId]);

  if (!open || !exam || !userProfile) return null;

  const questions = exam.questions || [];
  const currentQuestion = questions[currentIdx] || null;
  const answeredCount = questions.filter((q) => {
    const v = answers[q.id];
    return typeof v === 'string' && v.trim().length > 0;
  }).length;
  const unansweredCount = Math.max(0, questions.length - answeredCount);

  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateError(null);

    const requiresCode = exam.accessCodeProtected !== false;
    const trimmedCode = accessCode.trim();
    if (requiresCode && !isValidSixDigitCode(trimmedCode)) {
      setGateError('Enter a valid 6-digit numeric examination password (e.g., 482731).');
      return;
    }

    setGateBusy(true);
    try {
      const session = await startStudentExamSession(exam, trimmedCode, userProfile);
      let restoredAnswers: Record<string, string> = { ...(session.savedAnswers || {}) };
      try {
        const localRaw = window.localStorage.getItem(
          `smart_tech_exam_draft_${session.attemptId}`
        );
        if (localRaw) {
          const parsed = JSON.parse(localRaw) as Record<string, string>;
          restoredAnswers = { ...restoredAnswers, ...parsed };
        }
      } catch {
        // Ignore corrupt local draft
      }

      setAttemptId(session.attemptId);
      setAttemptNumber(session.attemptNumber);
      setAttemptPermit(session.attemptPermit);
      setExpiresAtMs(session.expiresAtMs);
      setAnswers(restoredAnswers);
      setCurrentIdx(0);
      autoSubmitTriggeredRef.current = false;
      setStage('active_runner');

      if (session.resumed) {
        pushToast('info', 'Examination session resumed', 'Saved answers and remaining timer restored.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to start examination.';
      setGateError(msg);
    } finally {
      setGateBusy(false);
    }
  };

  const updateAnswerForQuestion = (questionId: string, value: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: value };
      if (attemptId) {
        try {
          window.localStorage.setItem(
            `smart_tech_exam_draft_${attemptId}`,
            JSON.stringify(next)
          );
        } catch {
          // Ignore storage error
        }
      }
      return next;
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Online Examination: ${exam.title}`}
      className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-[#040915]/95 backdrop-blur-md"
    >
      {/* Top Bar */}
      <div className="border-b border-slate-800/90 bg-[#071022] px-4 py-3.5 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-cyan-300">
              {exam.subject} · {exam.grade}
            </p>
            <h2 className="truncate font-display text-base font-bold text-slate-50 sm:text-lg">
              {exam.title}
            </h2>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {stage === 'active_runner' && (
              <div
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 font-mono text-sm font-semibold tabular-nums ${
                  remainingTimerMs <= 120_000
                    ? 'border-rose-500/50 bg-rose-950/40 text-rose-200'
                    : 'border-sky-400/35 bg-sky-500/10 text-cyan-200'
                }`}
              >
                <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {remainingTimerMs <= 120_000 ? 'Time Critical: ' : 'Time Left: '}
                  {formatCountdown(remainingTimerMs)}
                </span>
              </div>
            )}

            {stage !== 'active_runner' && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close examination window"
                className="rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 hover:border-slate-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {stage === 'active_runner' && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  saveStudentExamDraftAnswers(attemptId, answers).catch(() => undefined);
                  onClose();
                }}
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white whitespace-nowrap"
              >
                Save Draft &amp; Exit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Scrollable Stage */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {/* STAGE 1: 6-DIGIT ACCESS PASSWORD GATE */}
        {stage === 'password_gate' && (
          <div className="mx-auto max-w-xl py-4">
            <form onSubmit={handleStartExam} className="glass-panel rounded-2xl p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/35 bg-sky-500/15 text-cyan-300">
                  <KeyRound className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-medium text-cyan-300">
                    {exam.accessCodeProtected !== false
                      ? 'Protected Online Examination'
                      : 'Timed Online Examination'}
                  </p>
                  <h3 className="font-display text-xl font-bold text-slate-50">
                    {exam.accessCodeProtected !== false
                      ? 'Enter 6-Digit Examination Password'
                      : 'Review Instructions & Start Exam'}
                  </h3>
                </div>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-[#060b18]/80 p-4 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-slate-400">Questions</dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                    {exam.questionCount || questions.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Total Marks</dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                    {exam.totalMarks}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Pass Marks</dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                    {exam.passingMarks}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Duration</dt>
                  <dd className="mt-0.5 font-mono text-sm font-semibold text-cyan-300 tabular-nums">
                    {exam.durationMinutes} min
                  </dd>
                </div>
              </dl>

              <div className="mt-4 rounded-xl border border-slate-800/90 bg-[#060b18]/65 p-4 text-xs leading-relaxed text-slate-300">
                <p className="font-semibold text-slate-100">Examination Instructions</p>
                <p className="mt-1">{exam.instructions}</p>
                <p className="mt-2 font-mono text-[11px] text-slate-400 tabular-nums">
                  Candidate: {userProfile.displayName} · Completed Attempts: {completedCountForExam}{' '}
                  / {exam.maxAttempts}
                </p>
                {activeDraftAttempt && (
                  <p className="mt-1.5 font-medium text-cyan-300">
                    Active session detected: entering the password will resume your in-progress
                    attempt.
                  </p>
                )}
              </div>

              {gateError && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/35 p-3.5 text-xs text-rose-200"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
                  <span>{gateError}</span>
                </div>
              )}

              {exam.accessCodeProtected !== false && (
                <div className="mt-5">
                  <label
                    htmlFor="exam-six-digit-code"
                    className="block text-xs font-medium text-slate-200"
                  >
                    6-Digit Examination Access Password
                  </label>
                  <input
                    id="exam-six-digit-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="mt-1.5 w-full rounded-xl border border-slate-700 bg-[#050a16] px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.35em] text-cyan-300 placeholder-slate-700 focus:border-sky-400 tabular-nums"
                  />
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    Enter the exact 6-digit code shared by your instructor. Repeated failed attempts
                    are rate-limited on the server.
                  </p>
                </div>
              )}

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-700 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800/70"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    gateBusy || (exam.accessCodeProtected !== false && accessCode.length !== 6)
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50"
                >
                  {gateBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {gateBusy
                    ? 'Starting Session...'
                    : activeDraftAttempt
                    ? exam.accessCodeProtected !== false
                      ? 'Verify & Resume Exam'
                      : 'Resume Timed Exam'
                    : exam.accessCodeProtected !== false
                    ? 'Verify & Start Timed Exam'
                    : 'Start Timed Exam'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STAGE 2: DISTRACTION-FREE INTERACTIVE RUNNER */}
        {stage === 'active_runner' && currentQuestion && (
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Question Canvas (8 Cols) */}
            <div className="lg:col-span-8">
              <div className="glass-panel rounded-2xl p-6 sm:p-8">
                {/* Progress Bar */}
                <div className="mb-5">
                  <div className="flex items-center justify-between text-xs text-slate-400 tabular-nums">
                    <span>
                      Question {currentIdx + 1} of {questions.length} · Attempt #{attemptNumber}
                    </span>
                    <span className="font-mono text-cyan-300">
                      {answeredCount} / {questions.length} answered
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-sky-500 transition-transform duration-150"
                      style={{
                        transform: `scaleX(${
                          questions.length > 0 ? answeredCount / questions.length : 0
                        })`,
                        transformOrigin: 'left center',
                      }}
                    />
                  </div>
                </div>

                {/* Question Prompt */}
                <div className="flex items-baseline justify-between gap-4 border-b border-slate-800/80 pb-4">
                  <span className="text-xs font-medium text-cyan-300">
                    {currentQuestion.type === 'mcq'
                      ? 'Multiple Choice Question'
                      : currentQuestion.type === 'true_false'
                      ? 'True / False Statement'
                      : 'Structured Short Answer'}
                  </span>
                  <span className="font-mono text-xs font-semibold text-slate-200 tabular-nums whitespace-nowrap">
                    {currentQuestion.marks} {currentQuestion.marks === 1 ? 'Mark' : 'Marks'}
                  </span>
                </div>

                <h3 className="mt-5 whitespace-pre-line text-base font-semibold leading-relaxed text-slate-50 sm:text-lg">
                  {currentIdx + 1}. {currentQuestion.prompt}
                </h3>

                {/* Answer Controls */}
                <div className="mt-6 space-y-3">
                  {currentQuestion.type === 'mcq' &&
                    currentQuestion.options.map((opt, optIdx) => {
                      const selected = answers[currentQuestion.id] === String(optIdx);
                      const letter = String.fromCharCode(65 + optIdx);
                      return (
                        <button
                          key={`${currentQuestion.id}_opt_${optIdx}`}
                          type="button"
                          onClick={() =>
                            updateAnswerForQuestion(currentQuestion.id, String(optIdx))
                          }
                          className={`flex w-full items-start gap-3.5 rounded-xl border p-4 text-left text-sm transition-colors ${
                            selected
                              ? 'border-cyan-400/70 bg-sky-500/15 text-slate-50'
                              : 'border-slate-800 bg-[#060b18]/80 text-slate-200 hover:border-slate-600'
                          }`}
                        >
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold ${
                              selected
                                ? 'bg-cyan-400 text-slate-950'
                                : 'border border-slate-700 bg-slate-900 text-slate-300'
                            }`}
                          >
                            {letter}
                          </span>
                          <span className="pt-0.5 leading-relaxed">{opt}</span>
                        </button>
                      );
                    })}

                  {currentQuestion.type === 'true_false' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {(['true', 'false'] as const).map((boolStr) => {
                        const selected =
                          (answers[currentQuestion.id] || '').toLowerCase() === boolStr;
                        return (
                          <button
                            key={boolStr}
                            type="button"
                            onClick={() => updateAnswerForQuestion(currentQuestion.id, boolStr)}
                            className={`flex items-center justify-between rounded-xl border px-5 py-4 text-sm font-semibold transition-colors ${
                              selected
                                ? 'border-cyan-400/70 bg-sky-500/15 text-cyan-200'
                                : 'border-slate-800 bg-[#060b18]/80 text-slate-200 hover:border-slate-600'
                            }`}
                          >
                            <span>{boolStr === 'true' ? 'True' : 'False'}</span>
                            {selected && (
                              <CheckCircle2 className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {currentQuestion.type === 'short_answer' && (
                    <div>
                      <label
                        htmlFor={`short-ans-${currentQuestion.id}`}
                        className="block text-xs font-medium text-slate-300"
                      >
                        Your Written Response
                      </label>
                      <textarea
                        id={`short-ans-${currentQuestion.id}`}
                        rows={5}
                        maxLength={2000}
                        value={answers[currentQuestion.id] || ''}
                        onChange={(e) =>
                          updateAnswerForQuestion(currentQuestion.id, e.target.value)
                        }
                        placeholder="Type your clear, concise technical answer here..."
                        className="mt-2 w-full rounded-xl border border-slate-700 bg-[#060b18] p-4 text-sm leading-relaxed text-slate-100 placeholder-slate-500 focus:border-sky-400"
                      />
                      <p className="mt-1.5 text-right font-mono text-[11px] text-slate-500 tabular-nums">
                        {(answers[currentQuestion.id] || '').length} / 2000 characters
                      </p>
                    </div>
                  )}
                </div>

                {/* Prev / Clear / Next Controls */}
                <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-5">
                  <button
                    type="button"
                    disabled={currentIdx <= 0}
                    onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    Previous
                  </button>

                  {answers[currentQuestion.id] && (
                    <button
                      type="button"
                      onClick={() => updateAnswerForQuestion(currentQuestion.id, '')}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Clear response
                    </button>
                  )}

                  {currentIdx < questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                    >
                      Next Question
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmSubmitOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                      Review &amp; Submit Exam
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right Control & Navigator Deck (4 Cols) */}
            <div className="lg:col-span-4">
              <div className="glass-surface rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-100">Question Navigator</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Select any number to jump directly to a question.
                </p>

                <div className="mt-4 grid grid-cols-5 gap-2">
                  {questions.map((q, idx) => {
                    const isCurrent = idx === currentIdx;
                    const isAnswered = Boolean(answers[q.id]?.trim());
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setCurrentIdx(idx)}
                        aria-label={`Question ${idx + 1}${isAnswered ? ', answered' : ', unanswered'}`}
                        className={`h-10 rounded-lg font-mono text-xs font-semibold transition-colors tabular-nums ${
                          isCurrent
                            ? 'border-2 border-cyan-300 bg-sky-500/25 text-white'
                            : isAnswered
                            ? 'border border-emerald-500/40 bg-emerald-950/35 text-emerald-200 hover:border-emerald-400'
                            : 'border border-slate-800 bg-[#060b18] text-slate-400 hover:border-slate-600 hover:text-slate-200'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 space-y-1.5 border-t border-slate-800/80 pt-4 text-xs text-slate-400 tabular-nums">
                  <div className="flex justify-between">
                    <span>Answered questions</span>
                    <span className="font-mono font-semibold text-emerald-300">{answeredCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Unanswered questions</span>
                    <span className="font-mono font-semibold text-amber-300">
                      {unansweredCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total marks</span>
                    <span className="font-mono font-semibold text-slate-200">
                      {exam.totalMarks}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setConfirmSubmitOpen(true)}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden="true" />
                  )}
                  {submitting ? 'Submitting Answers...' : 'Submit Final Examination'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STAGE 3: SUBMISSION & AUTO-GRADING SUMMARY */}
        {stage === 'submitted_summary' && submissionResult && (
          <div className="mx-auto max-w-3xl py-4">
            <div className="glass-panel rounded-2xl p-6 sm:p-8">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" aria-hidden="true" />
                <div>
                  <p className="text-xs font-medium text-emerald-300">
                    {submissionResult.autoSubmittedByTimer
                      ? 'Timer Expired · Automatic Submission Recorded'
                      : 'Verified Examination Submission Complete'}
                  </p>
                  <h3 className="mt-1 font-display text-2xl font-bold text-slate-50">
                    {exam.title}
                  </h3>
                  <p className="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">
                    Verification Receipt: {submissionResult.serverReceipt.slice(0, 24)}...
                  </p>
                </div>
              </div>

              {submissionResult.status === 'pending_review' ? (
                <div className="mt-6 rounded-xl border border-amber-500/35 bg-amber-950/25 p-5 text-sm text-amber-100">
                  <p className="font-semibold">Pending Administrator Marking</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">
                    Your objective responses have been scored automatically, and your written
                    short-answer responses have been queued for instructor evaluation. Final marks
                    and rank standings will appear once grading is finalized.
                  </p>
                </div>
              ) : !submissionResult.resultsPublished ? (
                <div className="mt-6 rounded-xl border border-sky-400/30 bg-sky-950/25 p-5 text-sm text-slate-100">
                  <p className="font-semibold text-cyan-300">Submission Sealed &amp; Recorded</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">
                    Your paper has been graded on the server. Scores and rankings will become
                    visible in <strong className="text-slate-100">My Examination Results</strong>{' '}
                    as soon as the administrator releases results for this examination.
                  </p>
                </div>
              ) : (
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-800 bg-[#060b18]/85 p-4">
                    <p className="text-xs text-slate-400">Marks Obtained</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-slate-50 tabular-nums">
                      {submissionResult.marksObtained} / {submissionResult.totalMarks}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-[#060b18]/85 p-4">
                    <p className="text-xs text-slate-400">Percentage</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-cyan-300 tabular-nums">
                      {submissionResult.percentage}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-[#060b18]/85 p-4">
                    <p className="text-xs text-slate-400">Outcome</p>
                    <p
                      className={`mt-1 text-lg font-bold ${
                        submissionResult.passed ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {submissionResult.passed ? 'Passed' : 'Below Pass Threshold'}
                    </p>
                  </div>
                </div>
              )}

              {/* Question-by-Question Review when published */}
              {submissionResult.resultsPublished &&
                submissionResult.reviewBreakdown.length > 0 && (
                  <div className="mt-7">
                    <h4 className="text-sm font-semibold text-slate-100">
                      Question-by-Question Marking Breakdown
                    </h4>
                    <div className="mt-3 space-y-3">
                      {submissionResult.reviewBreakdown.map((item, idx) => (
                        <div
                          key={item.questionId}
                          className="rounded-xl border border-slate-800/90 bg-[#060b18]/80 p-4 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-slate-400">
                            <span className="font-semibold text-slate-200">
                              Question {idx + 1}
                            </span>
                            <span
                              className={`font-mono font-semibold tabular-nums ${
                                item.isCorrect === true
                                  ? 'text-emerald-300'
                                  : item.isCorrect === false
                                  ? 'text-rose-300'
                                  : 'text-amber-300'
                              }`}
                            >
                              {item.marksAwarded} / {item.maxMarks} marks ·{' '}
                              {item.isCorrect === true
                                ? 'Correct'
                                : item.isCorrect === false
                                ? 'Incorrect'
                                : 'Pending Review'}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm text-slate-100">{item.prompt}</p>
                          <p className="mt-2 text-slate-300">
                            <span className="text-slate-400">Your answer: </span>
                            {item.studentAnswer}
                          </p>
                          {exam.showExplanations && (
                            <>
                              <p className="mt-1 text-cyan-300">
                                <span className="text-slate-400">Expected answer: </span>
                                {item.correctAnswerLabel}
                              </p>
                              {item.explanation && (
                                <p className="mt-1 text-slate-400">{item.explanation}</p>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              <div className="mt-7 flex flex-wrap items-center justify-end gap-3 border-t border-slate-800 pt-5">
                {exam.rankBoardPublished && onOpenRankBoard && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenRankBoard();
                    }}
                    className="rounded-lg border border-sky-400/40 bg-sky-500/15 px-4 py-2.5 text-xs font-semibold text-cyan-200 hover:bg-sky-500/25"
                  >
                    View Official Rank Board
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-sky-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  Done &amp; Return to Portal
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Final Submit Confirmation Dialog */}
      {confirmSubmitOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-exam-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
        >
          <div className="glass-panel w-full max-w-md rounded-2xl p-6">
            <h3 id="submit-exam-confirm-title" className="text-lg font-semibold text-slate-50">
              Submit Final Examination Answers?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              You have answered{' '}
              <strong className="font-mono text-slate-100 tabular-nums">
                {answeredCount} of {questions.length}
              </strong>{' '}
              questions.
              {unansweredCount > 0
                ? ` ${unansweredCount} question(s) are still unanswered.`
                : ' All questions have a recorded response.'}{' '}
              Once submitted, this attempt is locked permanently for grading.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmSubmitOpen(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                Continue Reviewing
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => executeFinalSubmit(false)}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {submitting ? 'Submitting...' : 'Confirm & Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
