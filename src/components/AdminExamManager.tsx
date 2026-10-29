import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Trophy,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { ConfirmDialog } from './SharedUI';
import { RankBoardView } from './RankBoardView';
import {
  calculateExamTotalMarks,
  computeCompetitionRankings,
  evaluateExamStatus,
  formatColomboDateTime,
  formatShortDate,
  formatUtcMsToColomboLocalInput,
  generateRandomSixDigitCode,
  parseColomboLocalInputToUtcMs,
  validateNativeExamInput,
  validateOnlineExamInput,
} from '../utils/platformLogic';
import {
  createNativeOnlineExamAtomic,
  createOnlineExamAtomic,
  deleteOnlineExamAtomic,
  fetchAuthorizedExamFormUrl,
  gradeOrAdjustStudentAttemptByAdmin,
  revealNativeExamSecretConfig,
  syncExamRankBoardAndPublicationByAdmin,
  updateNativeOnlineExamAtomic,
  updateOnlineExamScheduleOrDetails,
} from '../services/platformService';
import type {
  ExamAttempt,
  ExamQuestionFull,
  OnlineExam,
  QuestionGradingBreakdown,
  QuestionType,
  RankBoardEntry,
} from '../types/platform';

function makeQuestionDraft(index: number, type: QuestionType = 'mcq'): ExamQuestionFull {
  const id = `q_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`;
  if (type === 'true_false') {
    return {
      id,
      type: 'true_false',
      prompt: '',
      options: ['True', 'False'],
      marks: 10,
      correctBoolean: true,
      explanation: '',
    };
  }
  if (type === 'short_answer') {
    return {
      id,
      type: 'short_answer',
      prompt: '',
      options: [],
      marks: 10,
      sampleAnswer: '',
      explanation: '',
    };
  }
  return {
    id,
    type: 'mcq',
    prompt: '',
    options: ['', '', '', ''],
    marks: 10,
    correctOptionIndex: 0,
    explanation: '',
  };
}

// ============================================================================
// 6. ONLINE EXAM MANAGEMENT PANEL
// ============================================================================
export function AdminOnlineExamManagementPanel() {
  const { allExams, serverNowMs, refreshRankBoard, pushToast } = usePlatform();

  const defaultOpen = formatUtcMsToColomboLocalInput(Date.now() - 5 * 60 * 1000);
  const defaultClose = formatUtcMsToColomboLocalInput(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [editingExam, setEditingExam] = useState<OnlineExam | null>(null);
  const [examMode, setExamMode] = useState<'native' | 'google_form'>('native');

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Engineering Technology');
  const [grade, setGrade] = useState('Grade 13 (G.C.E. A/L)');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState(
    'Enter the 6-digit examination password issued by your instructor. Complete and submit all questions before the countdown timer reaches 00:00.'
  );
  const [opensLocal, setOpensLocal] = useState(defaultOpen);
  const [closesLocal, setClosesLocal] = useState(defaultClose);
  const [published, setPublished] = useState(true);

  // Native-specific fields
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [passingMarks, setPassingMarks] = useState(10);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [accessCode, setAccessCode] = useState(() => generateRandomSixDigitCode());
  const [codeRevoked, setCodeRevoked] = useState(false);
  const [showExplanations, setShowExplanations] = useState(true);
  const [resultsPublished, setResultsPublished] = useState(true);
  const [rankBoardPublished, setRankBoardPublished] = useState(true);
  const [anonymizeRankBoard, setAnonymizeRankBoard] = useState(false);
  const [questions, setQuestions] = useState<ExamQuestionFull[]>(() => [
    makeQuestionDraft(1, 'mcq'),
  ]);

  // Google Forms specific field
  const [formUrl, setFormUrl] = useState('');

  const [busy, setBusy] = useState(false);
  const [loadingRevealId, setLoadingRevealId] = useState<string | null>(null);
  const [revealedCodesMap, setRevealedCodesMap] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<OnlineExam | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const totalMarks = useMemo(() => calculateExamTotalMarks(questions), [questions]);

  const resetBuilder = () => {
    setEditingExam(null);
    setExamMode('native');
    setTitle('');
    setSubject('Engineering Technology');
    setGrade('Grade 13 (G.C.E. A/L)');
    setDescription('');
    setInstructions(
      'Enter the 6-digit examination password issued by your instructor. Complete and submit all questions before the countdown timer reaches 00:00.'
    );
    setOpensLocal(formatUtcMsToColomboLocalInput(Date.now() - 5 * 60 * 1000));
    setClosesLocal(formatUtcMsToColomboLocalInput(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setPublished(true);
    setDurationMinutes(30);
    setPassingMarks(10);
    setMaxAttempts(1);
    setAccessCode(generateRandomSixDigitCode());
    setCodeRevoked(false);
    setShowExplanations(true);
    setResultsPublished(true);
    setRankBoardPublished(true);
    setAnonymizeRankBoard(false);
    setQuestions([makeQuestionDraft(1, 'mcq')]);
    setFormUrl('');
  };

  const handleLoadExamForEdit = async (exam: OnlineExam) => {
    setEditingExam(exam);
    setExamMode(exam.examMode);
    setTitle(exam.title);
    setSubject(exam.subject);
    setGrade(exam.grade);
    setDescription(exam.description);
    setInstructions(exam.instructions);
    setOpensLocal(formatUtcMsToColomboLocalInput(exam.opensAtMs));
    setClosesLocal(formatUtcMsToColomboLocalInput(exam.closesAtMs));
    setPublished(exam.published);

    if (exam.examMode === 'native') {
      setDurationMinutes(exam.durationMinutes);
      setPassingMarks(exam.passingMarks);
      setMaxAttempts(exam.maxAttempts);
      setShowExplanations(exam.showExplanations);
      setResultsPublished(exam.resultsPublished);
      setRankBoardPublished(exam.rankBoardPublished);
      setAnonymizeRankBoard(exam.anonymizeRankBoard);

      setLoadingRevealId(exam.id);
      try {
        const secret = await revealNativeExamSecretConfig(exam.id);
        setAccessCode(secret.accessCode || generateRandomSixDigitCode());
        setCodeRevoked(secret.codeRevoked);
        if (secret.questions.length > 0) {
          setQuestions(secret.questions);
        }
        setRevealedCodesMap((prev) => ({ ...prev, [exam.id]: secret.accessCode }));
      } catch (err) {
        pushToast(
          'error',
          'Could not unseal answer key',
          err instanceof Error ? err.message : ''
        );
      } finally {
        setLoadingRevealId(null);
      }
    } else {
      setFormUrl('');
      try {
        const url = await fetchAuthorizedExamFormUrl(exam.id);
        setFormUrl(url);
      } catch {
        setFormUrl('');
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRevealRowCode = async (examId: string) => {
    setLoadingRevealId(examId);
    try {
      const secret = await revealNativeExamSecretConfig(examId);
      setRevealedCodesMap((prev) => ({ ...prev, [examId]: secret.accessCode }));
      if (navigator.clipboard?.writeText && secret.accessCode) {
        await navigator.clipboard.writeText(secret.accessCode).catch(() => undefined);
      }
      pushToast(
        'info',
        `6-Digit Exam Password: ${secret.accessCode}`,
        'Copied to your clipboard for student distribution.'
      );
    } catch (err) {
      pushToast('error', 'Failed to reveal code', err instanceof Error ? err.message : '');
    } finally {
      setLoadingRevealId(null);
    }
  };

  const handleAddQuestion = (type: QuestionType) => {
    if (questions.length >= 50) {
      pushToast('error', 'Limit reached', 'Up to 50 questions can be added per examination.');
      return;
    }
    setQuestions((prev) => [...prev, makeQuestionDraft(prev.length + 1, type)]);
  };

  const handleUpdateQuestion = (idx: number, patch: Partial<ExamQuestionFull>) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, ...patch } : q))
    );
  };

  const handleMoveQuestion = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= questions.length) return;
    setQuestions((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      copy.splice(target, 0, moved);
      return copy;
    });
  };

  const handleRemoveQuestion = (idx: number) => {
    if (questions.length <= 1) {
      pushToast('error', 'Minimum 1 question', 'An examination requires at least one question.');
      return;
    }
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    const opensAtMs = parseColomboLocalInputToUtcMs(opensLocal);
    const closesAtMs = parseColomboLocalInputToUtcMs(closesLocal);

    if (examMode === 'native') {
      const safePassing = Math.min(Math.max(1, Math.floor(passingMarks)), Math.max(1, totalMarks));
      const err = validateNativeExamInput({
        title,
        subject,
        grade,
        description,
        instructions,
        durationMinutes: Number(durationMinutes),
        passingMarks: safePassing,
        maxAttempts: Number(maxAttempts),
        accessCode,
        requireAccessCode: true,
        opensAtMs,
        closesAtMs,
        questions,
      });
      if (err) {
        pushToast('error', 'Validation error', err);
        return;
      }

      setBusy(true);
      try {
        if (editingExam && editingExam.examMode === 'native') {
          await updateNativeOnlineExamAtomic(editingExam, {
            title,
            subject,
            grade,
            description,
            instructions,
            opensAtMs: opensAtMs!,
            closesAtMs: closesAtMs!,
            durationMinutes: Number(durationMinutes),
            passingMarks: safePassing,
            maxAttempts: Number(maxAttempts),
            accessCode,
            codeRevoked,
            showExplanations,
            resultsPublished,
            rankBoardPublished,
            anonymizeRankBoard,
            published,
            questions,
          });
          setRevealedCodesMap((prev) => ({ ...prev, [editingExam.id]: accessCode }));
          pushToast(
            'success',
            'Online examination updated',
            `Password ${accessCode} & ${questions.length} questions sealed on server.`
          );
        } else {
          const newId = await createNativeOnlineExamAtomic({
            title,
            subject,
            grade,
            description,
            instructions,
            opensAtMs: opensAtMs!,
            closesAtMs: closesAtMs!,
            durationMinutes: Number(durationMinutes),
            passingMarks: safePassing,
            maxAttempts: Number(maxAttempts),
            accessCode,
            codeRevoked,
            showExplanations,
            resultsPublished,
            rankBoardPublished,
            anonymizeRankBoard,
            published,
            questions,
          });
          setRevealedCodesMap((prev) => ({ ...prev, [newId]: accessCode }));
          pushToast(
            'success',
            'Native online examination created',
            `Share 6-digit password ${accessCode} with eligible students.`
          );
        }
        await refreshRankBoard();
        resetBuilder();
      } catch (saveErr) {
        pushToast(
          'error',
          'Failed to save examination',
          saveErr instanceof Error ? saveErr.message : ''
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    // Google Forms mode
    const formErr = validateOnlineExamInput({
      title,
      subject,
      grade,
      description,
      instructions,
      formUrl,
      opensAtMs,
      closesAtMs,
    });
    if (formErr) {
      pushToast('error', 'Validation error', formErr);
      return;
    }

    setBusy(true);
    try {
      if (editingExam && editingExam.examMode === 'google_form') {
        await updateOnlineExamScheduleOrDetails(editingExam, {
          title,
          subject,
          grade,
          description,
          instructions,
          opensAtMs: opensAtMs!,
          closesAtMs: closesAtMs!,
          published,
          formUrl,
        });
        pushToast('success', 'Google Forms schedule updated');
      } else {
        await createOnlineExamAtomic({
          title,
          subject,
          grade,
          description,
          instructions,
          formUrl,
          opensAtMs: opensAtMs!,
          closesAtMs: closesAtMs!,
          published,
        });
        pushToast('success', 'Google Forms examination scheduled');
      }
      resetBuilder();
    } catch (saveErr) {
      pushToast(
        'error',
        'Failed to save Google Forms exam',
        saveErr instanceof Error ? saveErr.message : ''
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Builder Form */}
      <form onSubmit={handleSaveExam} className="glass-surface rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/90 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">
              {editingExam ? `Editing Examination: ${editingExam.title}` : 'Create Online Examination'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Build native auto-graded examinations protected by a 6-digit password or schedule
              external Google Forms papers.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!editingExam && (
              <div className="flex rounded-lg border border-slate-800 bg-[#060b18] p-1">
                <button
                  type="button"
                  onClick={() => setExamMode('native')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    examMode === 'native'
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Native Exam (6-Digit Password + Auto-Mark)
                </button>
                <button
                  type="button"
                  onClick={() => setExamMode('google_form')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    examMode === 'google_form'
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Google Forms Link
                </button>
              </div>
            )}
            {editingExam && (
              <button
                type="button"
                onClick={resetBuilder}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white"
              >
                Cancel Editing
              </button>
            )}
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="adm-exam-title" className="block text-xs font-medium text-slate-300">
              Examination Title
            </label>
            <input
              id="adm-exam-title"
              type="text"
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Engineering Technology Unit 04 — Digital Electronics Quiz"
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="adm-exam-subject" className="block text-xs font-medium text-slate-300">
              Subject / Stream
            </label>
            <input
              id="adm-exam-subject"
              type="text"
              required
              maxLength={80}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="adm-exam-grade" className="block text-xs font-medium text-slate-300">
              Grade / Eligible Cohort
            </label>
            <input
              id="adm-exam-grade"
              type="text"
              required
              maxLength={40}
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="adm-exam-opens" className="block text-xs font-medium text-slate-300">
              Start Date &amp; Time (Asia/Colombo)
            </label>
            <input
              id="adm-exam-opens"
              type="datetime-local"
              required
              value={opensLocal}
              onChange={(e) => setOpensLocal(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 font-mono text-xs text-slate-100 tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="adm-exam-closes" className="block text-xs font-medium text-slate-300">
              End Date &amp; Time (Asia/Colombo)
            </label>
            <input
              id="adm-exam-closes"
              type="datetime-local"
              required
              value={closesLocal}
              onChange={(e) => setClosesLocal(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 font-mono text-xs text-slate-100 tabular-nums"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label htmlFor="adm-exam-desc" className="block text-xs font-medium text-slate-300">
              Overview / Syllabus Coverage
            </label>
            <textarea
              id="adm-exam-desc"
              rows={2}
              required
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe topics tested in this online paper..."
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label htmlFor="adm-exam-inst" className="block text-xs font-medium text-slate-300">
              Candidate Instructions
            </label>
            <textarea
              id="adm-exam-inst"
              rows={2}
              required
              maxLength={2000}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
            />
          </div>
        </div>

        {/* Native Mode Controls: Duration, Marks, 6-Digit Password & Question Editor */}
        {examMode === 'native' ? (
          <div className="mt-6 space-y-6 border-t border-slate-800/90 pt-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label htmlFor="adm-exam-duration" className="block text-xs font-medium text-slate-300">
                  Duration (Minutes)
                </label>
                <input
                  id="adm-exam-duration"
                  type="number"
                  min={1}
                  max={360}
                  required
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 font-mono text-sm text-slate-100 tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Total Marks (Auto)
                </label>
                <div className="mt-1.5 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 font-mono text-sm font-semibold text-cyan-300 tabular-nums">
                  {totalMarks}
                </div>
              </div>

              <div>
                <label htmlFor="adm-exam-passing" className="block text-xs font-medium text-slate-300">
                  Passing Marks
                </label>
                <input
                  id="adm-exam-passing"
                  type="number"
                  min={1}
                  max={Math.max(1, totalMarks)}
                  required
                  value={passingMarks}
                  onChange={(e) => setPassingMarks(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 font-mono text-sm text-slate-100 tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="adm-exam-attempts" className="block text-xs font-medium text-slate-300">
                  Maximum Attempts
                </label>
                <input
                  id="adm-exam-attempts"
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 font-mono text-sm text-slate-100 tabular-nums"
                />
              </div>
            </div>

            {/* 6-Digit Examination Access Password Box */}
            <div className="rounded-2xl border border-sky-400/25 bg-[#060d1f] p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-50">
                      6-Digit Examination Access Password
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Encrypted with AES-256-GCM on the server. Students must enter this exact
                      6-digit code to start or resume the paper.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    aria-label="6-digit examination access password"
                    value={accessCode}
                    onChange={(e) =>
                      setAccessCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="000000"
                    className="w-36 rounded-lg border border-sky-400/40 bg-[#040915] px-3 py-2 text-center font-mono text-lg font-bold tracking-[0.25em] text-cyan-300 tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => setAccessCode(generateRandomSixDigitCode())}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white whitespace-nowrap"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Auto-Generate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(accessCode).catch(() => undefined);
                      pushToast('info', '6-Digit Password Copied', `Code ${accessCode} copied.`);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-cyan-300 hover:border-cyan-400/50 whitespace-nowrap"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Copy
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-6 border-t border-slate-800/80 pt-3.5 text-xs text-slate-300">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={codeRevoked}
                    onChange={(e) => setCodeRevoked(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Temporarily revoke / lock password entry
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={resultsPublished}
                    onChange={(e) => setResultsPublished(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Publish marks immediately after auto-grading
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rankBoardPublished}
                    onChange={(e) => setRankBoardPublished(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Update Official Public Rank Board automatically
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showExplanations}
                    onChange={(e) => setShowExplanations(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Show answer explanations after results release
                </label>
              </div>
            </div>

            {/* Question Editor */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-50">
                    Examination Questions ({questions.length})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Correct answers are stripped from public Firestore documents and sealed on the
                    server.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddQuestion('mcq')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-sky-500/25 whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add MCQ
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddQuestion('true_false')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add True / False
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddQuestion('short_answer')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add Short Answer
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                {questions.map((q, qIdx) => (
                  <div
                    key={q.id}
                    className="rounded-xl border border-slate-800/90 bg-[#060b18]/90 p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-mono text-xs font-semibold text-cyan-300 tabular-nums">
                        Question #{qIdx + 1} ·{' '}
                        {q.type === 'mcq'
                          ? 'Multiple Choice'
                          : q.type === 'true_false'
                          ? 'True / False'
                          : 'Short Answer (Instructor Graded)'}
                      </span>

                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-slate-400">
                          Marks:
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={q.marks}
                            onChange={(e) =>
                              handleUpdateQuestion(qIdx, {
                                marks: Math.max(1, Number(e.target.value || 1)),
                              })
                            }
                            className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-100 tabular-nums"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={qIdx === 0}
                          onClick={() => handleMoveQuestion(qIdx, -1)}
                          aria-label="Move question up"
                          className="rounded border border-slate-800 p-1.5 text-slate-400 hover:text-white disabled:opacity-30"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={qIdx === questions.length - 1}
                          onClick={() => handleMoveQuestion(qIdx, 1)}
                          aria-label="Move question down"
                          className="rounded border border-slate-800 p-1.5 text-slate-400 hover:text-white disabled:opacity-30"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(qIdx)}
                          aria-label="Remove question"
                          className="rounded border border-slate-800 p-1.5 text-rose-400 hover:border-rose-500/40 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <textarea
                        rows={2}
                        required
                        maxLength={1000}
                        value={q.prompt}
                        onChange={(e) => handleUpdateQuestion(qIdx, { prompt: e.target.value })}
                        placeholder="Enter question statement..."
                        className="w-full rounded-lg border border-slate-700 bg-[#040915] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500"
                      />
                    </div>

                    {q.type === 'mcq' && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-slate-400">
                          Answer Options (select the radio button next to the correct answer):
                        </p>
                        {q.options.map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-2.5">
                            <input
                              type="radio"
                              name={`correct_${q.id}`}
                              checked={q.correctOptionIndex === optIdx}
                              onChange={() =>
                                handleUpdateQuestion(qIdx, { correctOptionIndex: optIdx })
                              }
                              aria-label={`Mark option ${optIdx + 1} as correct`}
                            />
                            <input
                              type="text"
                              required
                              maxLength={300}
                              value={opt}
                              onChange={(e) => {
                                const nextOpts = [...q.options];
                                nextOpts[optIdx] = e.target.value;
                                handleUpdateQuestion(qIdx, { options: nextOpts });
                              }}
                              placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                              className="flex-1 rounded-lg border border-slate-800 bg-[#040915] px-3 py-1.5 text-xs text-slate-100"
                            />
                            {q.options.length > 2 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const nextOpts = q.options.filter((_, idx) => idx !== optIdx);
                                  const nextCorrect =
                                    (q.correctOptionIndex || 0) >= nextOpts.length
                                      ? 0
                                      : q.correctOptionIndex;
                                  handleUpdateQuestion(qIdx, {
                                    options: nextOpts,
                                    correctOptionIndex: nextCorrect,
                                  });
                                }}
                                className="text-xs text-slate-500 hover:text-rose-300"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                        {q.options.length < 6 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateQuestion(qIdx, { options: [...q.options, ''] })
                            }
                            className="text-xs font-medium text-cyan-300 hover:text-cyan-200"
                          >
                            + Add Option
                          </button>
                        )}
                      </div>
                    )}

                    {q.type === 'true_false' && (
                      <div className="mt-3 flex items-center gap-4 text-xs text-slate-200">
                        <span className="text-slate-400">Correct Answer:</span>
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`tf_${q.id}`}
                            checked={q.correctBoolean === true}
                            onChange={() => handleUpdateQuestion(qIdx, { correctBoolean: true })}
                          />
                          True
                        </label>
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`tf_${q.id}`}
                            checked={q.correctBoolean === false}
                            onChange={() => handleUpdateQuestion(qIdx, { correctBoolean: false })}
                          />
                          False
                        </label>
                      </div>
                    )}

                    {q.type === 'short_answer' && (
                      <div className="mt-3">
                        <input
                          type="text"
                          maxLength={500}
                          value={q.sampleAnswer || ''}
                          onChange={(e) =>
                            handleUpdateQuestion(qIdx, { sampleAnswer: e.target.value })
                          }
                          placeholder="Reference marking rubric / model answer for instructor grading..."
                          className="w-full rounded-lg border border-slate-800 bg-[#040915] px-3 py-1.5 text-xs text-slate-200"
                        />
                      </div>
                    )}

                    <div className="mt-3">
                      <input
                        type="text"
                        maxLength={500}
                        value={q.explanation || ''}
                        onChange={(e) =>
                          handleUpdateQuestion(qIdx, { explanation: e.target.value })
                        }
                        placeholder="Optional explanation shown to students when results are published..."
                        className="w-full rounded-lg border border-slate-800/80 bg-[#040915] px-3 py-1.5 text-xs text-slate-300"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 border-t border-slate-800/90 pt-5">
            <label htmlFor="adm-exam-form-url" className="block text-xs font-medium text-slate-300">
              Protected Google Forms HTTPS URL
            </label>
            <input
              id="adm-exam-form-url"
              type="url"
              required
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://docs.google.com/forms/d/e/.../viewform"
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800/90 pt-5">
          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="rounded border-slate-600 bg-slate-900"
            />
            Publish examination to Online paper portal
          </label>

          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {busy
              ? 'Sealing & Saving...'
              : editingExam
              ? 'Save Updated Examination'
              : 'Create & Seal Examination'}
          </button>
        </div>
      </form>

      {/* Existing Examinations Table */}
      <div className="glass-surface rounded-2xl p-6">
        <h3 className="text-base font-semibold text-slate-50">
          Scheduled &amp; Published Online Examinations ({allExams.length})
        </h3>
        {allExams.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            No online examinations created yet. Use the builder above or seed the starter
            curriculum.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-800/80">
            {allExams.map((exam) => {
              const ev = evaluateExamStatus(exam.opensAtMs, exam.closesAtMs, serverNowMs);
              const revealedCode = revealedCodesMap[exam.id];

              return (
                <div
                  key={exam.id}
                  className="flex flex-col justify-between gap-4 py-4 lg:flex-row lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                      <span className="text-cyan-300">{exam.subject}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {exam.examMode === 'native'
                          ? `Native Timed (${exam.questionCount} Q · ${exam.totalMarks} Marks · ${exam.durationMinutes}m)`
                          : 'Google Forms'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          ev.state === 'open'
                            ? 'text-emerald-300'
                            : ev.state === 'upcoming'
                            ? 'text-amber-300'
                            : 'text-slate-400'
                        }
                      >
                        {ev.state === 'open'
                          ? 'Active Window'
                          : ev.state === 'upcoming'
                          ? 'Upcoming'
                          : 'Closed'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{exam.published ? 'Published' : 'Draft'}</span>
                    </div>
                    <h4 className="mt-1 truncate text-sm font-semibold text-slate-100">
                      {exam.title}
                    </h4>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                      {formatColomboDateTime(exam.opensAtMs)} →{' '}
                      {formatColomboDateTime(exam.closesAtMs)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {exam.examMode === 'native' && (
                      <button
                        type="button"
                        disabled={loadingRevealId === exam.id}
                        onClick={() => handleRevealRowCode(exam.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/35 bg-sky-500/10 px-3 py-1.5 font-mono text-xs font-semibold text-cyan-300 hover:bg-sky-500/20 tabular-nums whitespace-nowrap"
                      >
                        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                        {loadingRevealId === exam.id
                          ? 'Revealing...'
                          : revealedCode
                          ? `Code: ${revealedCode}`
                          : 'Reveal 6-Digit Code'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleLoadExamForEdit(exam)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white"
                    >
                      <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(exam)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-medium text-rose-300 hover:border-rose-500/50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Online Examination"
        description={
          deleteTarget
            ? `Permanently delete "${deleteTarget.title}" and its sealed security configuration?`
            : ''
        }
        busy={deleteBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleteBusy(true);
          try {
            await deleteOnlineExamAtomic(deleteTarget);
            pushToast('info', 'Examination deleted');
            setDeleteTarget(null);
          } catch (err) {
            pushToast('error', 'Delete failed', err instanceof Error ? err.message : '');
          } finally {
            setDeleteBusy(false);
          }
        }}
      />
    </div>
  );
}

// ============================================================================
// 7. EXAMINATION RESULTS & GRADING PANEL
// ============================================================================
export function AdminExamResultsPanel() {
  const { allExamAttempts, allExams, refreshRankBoard, pushToast } = usePlatform();

  const [examFilter, setExamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'graded' | 'pending_review' | 'in_progress'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [inspectingAttempt, setInspectingAttempt] = useState<ExamAttempt | null>(null);
  const [editableBreakdown, setEditableBreakdown] = useState<QuestionGradingBreakdown[]>([]);
  const [publishOnSave, setPublishOnSave] = useState(true);
  const [savingGrade, setSavingGrade] = useState(false);

  const filteredAttempts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allExamAttempts.filter((a) => {
      if (examFilter !== 'all' && a.examId !== examFilter) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (q) {
        const hay = `${a.studentName} ${a.studentEmail} ${a.examTitle} ${a.subject}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allExamAttempts, examFilter, statusFilter, searchQuery]);

  const openGradingModal = (att: ExamAttempt) => {
    setInspectingAttempt(att);
    setEditableBreakdown(
      (att.reviewBreakdown || []).map((item) => ({ ...item }))
    );
    setPublishOnSave(att.resultsPublished || true);
  };

  const handleSaveManualGrading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectingAttempt) return;
    const parentExam = allExams.find((ex) => ex.id === inspectingAttempt.examId);
    if (!parentExam) {
      pushToast('error', 'Parent examination record was not found.');
      return;
    }

    setSavingGrade(true);
    try {
      const normalizedBreakdown = editableBreakdown.map((b) => ({
        ...b,
        isCorrect: b.marksAwarded >= b.maxMarks ? true : b.marksAwarded === 0 ? false : true,
      }));
      await gradeOrAdjustStudentAttemptByAdmin({
        attempt: inspectingAttempt,
        exam: parentExam,
        updatedBreakdown: normalizedBreakdown,
        status: 'graded',
        resultsPublished: publishOnSave,
      });
      await refreshRankBoard();
      pushToast('success', 'Student attempt finalized & signed');
      setInspectingAttempt(null);
    } catch (err) {
      pushToast('error', 'Grading update failed', err instanceof Error ? err.message : '');
    } finally {
      setSavingGrade(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-surface rounded-2xl p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="res-search" className="block text-xs font-medium text-slate-300">
              Search Student or Email
            </label>
            <input
              id="res-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by candidate name or email..."
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
            />
          </div>

          <div>
            <label htmlFor="res-exam" className="block text-xs font-medium text-slate-300">
              Filter by Examination
            </label>
            <select
              id="res-exam"
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
            >
              <option value="all">All Examinations</option>
              {allExams
                .filter((e) => e.examMode === 'native')
                .map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label htmlFor="res-status" className="block text-xs font-medium text-slate-300">
              Grading Status
            </label>
            <select
              id="res-status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as 'all' | 'graded' | 'pending_review' | 'in_progress'
                )
              }
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
            >
              <option value="all">All Statuses</option>
              <option value="graded">Graded &amp; Finalized</option>
              <option value="pending_review">Pending Short-Answer Review</option>
              <option value="in_progress">Currently In Progress</option>
            </select>
          </div>
        </div>
      </div>

      {filteredAttempts.length === 0 ? (
        <div className="glass-surface rounded-2xl p-8 text-center text-sm text-slate-400">
          No student examination attempts match your current filters.
        </div>
      ) : (
        <div className="glass-surface overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-[#070f20] text-xs text-slate-400">
                  <th className="px-4 py-3 font-medium">Candidate</th>
                  <th className="px-4 py-3 font-medium">Examination</th>
                  <th className="px-4 py-3 text-right font-medium">Marks</th>
                  <th className="px-4 py-3 text-right font-medium">%</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Submitted</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredAttempts.map((att) => (
                  <tr key={att.id} className="hover:bg-sky-500/[0.03]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-100">{att.studentName}</p>
                      <p className="text-xs text-slate-400">{att.studentEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-xs truncate text-slate-200">{att.examTitle}</p>
                      <p className="text-xs text-cyan-300">
                        {att.subject} · Attempt #{att.attemptNumber}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-100 tabular-nums whitespace-nowrap">
                      {att.marksObtained} / {att.totalMarks}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-cyan-300 tabular-nums">
                      {att.percentage}%
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <span
                        className={
                          att.status === 'graded'
                            ? 'text-emerald-300'
                            : att.status === 'pending_review'
                            ? 'text-amber-300'
                            : 'text-slate-400'
                        }
                      >
                        {att.status === 'graded'
                          ? att.passed
                            ? 'Graded · Passed'
                            : 'Graded · Below Pass'
                          : att.status === 'pending_review'
                          ? 'Pending Review'
                          : 'In Progress'}
                      </span>
                      <span className="text-slate-500">
                        {' '}
                        · {att.resultsPublished ? 'Published' : 'Hidden'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400 tabular-nums whitespace-nowrap">
                      {formatShortDate(att.submittedAtMs)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {att.status !== 'in_progress' && (
                        <button
                          type="button"
                          onClick={() => openGradingModal(att)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:border-cyan-400/50 hover:text-white whitespace-nowrap"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          Inspect / Grade
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inspect / Grade Attempt Modal */}
      {inspectingAttempt && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={handleSaveManualGrading}
            className="glass-panel flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
          >
            <div className="border-b border-slate-800 px-6 py-4">
              <p className="text-xs text-cyan-300">{inspectingAttempt.examTitle}</p>
              <h3 className="text-lg font-semibold text-slate-50">
                Candidate Submission: {inspectingAttempt.studentName} ({inspectingAttempt.studentEmail})
              </h3>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {editableBreakdown.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No itemized question breakdown recorded on this attempt.
                </p>
              ) : (
                editableBreakdown.map((item, idx) => (
                  <div
                    key={item.questionId}
                    className="rounded-xl border border-slate-800 bg-[#060b18]/90 p-4 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-200">
                        Q{idx + 1} ({item.type})
                      </span>
                      <label className="flex items-center gap-2 text-slate-300">
                        Marks Awarded:
                        <input
                          type="number"
                          min={0}
                          max={item.maxMarks}
                          value={item.marksAwarded}
                          onChange={(e) => {
                            const val = Math.max(
                              0,
                              Math.min(item.maxMarks, Number(e.target.value || 0))
                            );
                            setEditableBreakdown((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, marksAwarded: val } : row
                              )
                            );
                          }}
                          className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-cyan-300 tabular-nums"
                        />
                        <span className="font-mono text-slate-400 tabular-nums">
                          / {item.maxMarks}
                        </span>
                      </label>
                    </div>
                    <p className="mt-2 text-sm text-slate-100">{item.prompt}</p>
                    <p className="mt-2 text-slate-300">
                      <span className="text-slate-400">Student response: </span>
                      {item.studentAnswer}
                    </p>
                    <p className="mt-1 text-cyan-300">
                      <span className="text-slate-400">Expected / Rubric: </span>
                      {item.correctAnswerLabel}
                    </p>
                  </div>
                ))
              )}

              <label className="inline-flex items-center gap-2 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={publishOnSave}
                  onChange={(e) => setPublishOnSave(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-900"
                />
                Publish finalized result to student dashboard
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-6 py-4">
              <button
                type="button"
                onClick={() => setInspectingAttempt(null)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingGrade}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
              >
                {savingGrade && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {savingGrade ? 'Signing & Saving...' : 'Finalize Marks & Sign Receipt'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 8. AUTOMATIC RANK BOARD MANAGEMENT PANEL
// ============================================================================
export function AdminRankBoardPanel() {
  const { allExams, allExamAttempts, refreshRankBoard, pushToast } = usePlatform();

  const nativeExams = useMemo(
    () => allExams.filter((e) => e.examMode === 'native'),
    [allExams]
  );

  const [selectedExamId, setSelectedExamId] = useState<string>(
    () => nativeExams[0]?.id || ''
  );
  const [syncBusy, setSyncBusy] = useState(false);

  const activeExam = useMemo(
    () => nativeExams.find((e) => e.id === selectedExamId) || nativeExams[0] || null,
    [nativeExams, selectedExamId]
  );

  const [resultsPub, setResultsPub] = useState<boolean>(activeExam?.resultsPublished ?? true);
  const [rankPub, setRankPub] = useState<boolean>(activeExam?.rankBoardPublished ?? true);
  const [anonNames, setAnonNames] = useState<boolean>(activeExam?.anonymizeRankBoard ?? false);

  const handleSelectExam = (id: string) => {
    setSelectedExamId(id);
    const found = nativeExams.find((e) => e.id === id);
    if (found) {
      setResultsPub(found.resultsPublished);
      setRankPub(found.rankBoardPublished);
      setAnonNames(found.anonymizeRankBoard);
    }
  };

  const previewRankEntries = useMemo<RankBoardEntry[]>(() => {
    if (!activeExam) return [];
    const examAttempts = allExamAttempts.filter(
      (a) => a.examId === activeExam.id && a.status === 'graded'
    );
    const ranked = computeCompetitionRankings(
      examAttempts.map((a) => ({
        attemptId: a.id,
        userId: a.userId,
        studentName: a.studentName,
        examId: a.examId,
        examTitle: activeExam.title,
        subject: activeExam.subject,
        marksObtained: a.marksObtained,
        totalMarks: a.totalMarks,
        percentage: a.percentage,
        passed: a.passed,
        isFinalized: true,
        submittedAtMs: a.submittedAtMs,
        serverReceipt: a.serverReceipt,
      })),
      { finalizedOnly: true }
    );

    return ranked.map((r) => ({
      id: `preview_${r.attemptId}`,
      examId: activeExam.id,
      examTitle: activeExam.title,
      subject: activeExam.subject,
      attemptId: r.attemptId,
      rankPosition: r.rankPosition,
      studentDisplayName: anonNames ? r.anonymizedCode : r.studentName,
      anonymizedCode: r.anonymizedCode,
      anonymizeNames: anonNames,
      marksObtained: r.marksObtained,
      totalMarks: r.totalMarks,
      percentage: r.percentage,
      passed: r.passed,
      isFinalized: true,
      published: rankPub,
      serverReceipt: r.serverReceipt,
      updatedAtMs: r.submittedAtMs,
    }));
  }, [activeExam, allExamAttempts, anonNames, rankPub]);

  const handleSyncRankBoard = async () => {
    if (!activeExam) return;
    setSyncBusy(true);
    try {
      const attemptsForExam = allExamAttempts.filter((a) => a.examId === activeExam.id);
      await syncExamRankBoardAndPublicationByAdmin({
        exam: activeExam,
        resultsPublished: resultsPub,
        rankBoardPublished: rankPub,
        anonymizeRankBoard: anonNames,
        allAttemptsForExam: attemptsForExam,
      });
      await refreshRankBoard();
      pushToast(
        'success',
        'Official Rank Board Synchronized',
        `${previewRankEntries.length} ranked standings updated with 1, 1, 3 tie-ranking.`
      );
    } catch (err) {
      pushToast('error', 'Rank board sync failed', err instanceof Error ? err.message : '');
    } finally {
      setSyncBusy(false);
    }
  };

  if (nativeExams.length === 0) {
    return (
      <div className="glass-surface rounded-2xl p-8 text-center">
        <Trophy className="mx-auto h-8 w-8 text-cyan-300" aria-hidden="true" />
        <h3 className="mt-3 text-base font-semibold text-slate-100">
          No native online examinations created yet
        </h3>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-400">
          Create a native online examination in Online Exam Management to compute automatic
          competition rankings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="glass-surface rounded-2xl p-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-5">
            <label htmlFor="rb-admin-exam" className="block text-xs font-medium text-slate-300">
              Select Examination
            </label>
            <select
              id="rb-admin-exam"
              value={activeExam?.id || ''}
              onChange={(e) => handleSelectExam(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2.5 text-sm text-slate-100"
            >
              {nativeExams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title} ({ex.subject})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-5 text-xs text-slate-200 lg:col-span-5">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={resultsPub}
                onChange={(e) => setResultsPub(e.target.checked)}
                className="rounded border-slate-600 bg-slate-900"
              />
              Publish student results
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={rankPub}
                onChange={(e) => setRankPub(e.target.checked)}
                className="rounded border-slate-600 bg-slate-900"
              />
              Show public Rank Board
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={anonNames}
                onChange={(e) => setAnonNames(e.target.checked)}
                className="rounded border-slate-600 bg-slate-900"
              />
              Anonymize names (CAND-XXXXXX)
            </label>
          </div>

          <div className="lg:col-span-2 lg:text-right">
            <button
              type="button"
              disabled={syncBusy}
              onClick={handleSyncRankBoard}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
            >
              {syncBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {syncBusy ? 'Syncing...' : 'Save & Publish'}
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
          <span>
            Live Competition Rank Preview (Standard 1, 1, 3 tie-ranking · Best finalized attempt per
            student)
          </span>
          <span className="font-mono text-cyan-300 tabular-nums">
            {previewRankEntries.length} ranked candidate(s)
          </span>
        </div>

        <RankBoardView
          entries={previewRankEntries}
          compact={false}
          emptyTitle="No graded attempts for this examination yet"
          emptyDescription="As students submit answers using the 6-digit password, rankings are calculated here automatically."
        />
      </div>
    </div>
  );
}

export const AdminExamManager = AdminOnlineExamManagementPanel;
