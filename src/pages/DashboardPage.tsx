import React, { useMemo, useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  ExternalLink,
  Eye,
  LayoutDashboard,
  Loader2,
  Monitor,
  Play,
  Trophy,
  User,
  X,
} from 'lucide-react';
import type { NoteResource } from '../types/platform';
import {
  calculateStudentLearningProgress,
  evaluateExamSchedule,
  formatShortDate,
  getResourceTargetUrl,
  resolveResourcePreviewUrl,
  triggerCrossBrowserResourceDownload,
} from '../utils/platformLogic';
import {
  clearUserNoteCompletion,
  recordUserResourceActivity,
} from '../services/platformService';

type TaskStatusFilter = 'all' | 'pending' | 'completed';
type TaskCategoryFilter = 'all' | 'notes' | 'exams';

export function DashboardPage() {
  const {
    firebaseUser,
    userProfile,
    publishedNotes,
    publishedExams,
    myExamAttempts,
    userActivities,
    dataLoading,
    serverNowMs,
    signInWithGoogle,
    navigate,
    pushToast,
  } = usePlatform();

  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<TaskCategoryFilter>('all');
  const [togglingNoteId, setTogglingNoteId] = useState<string | null>(null);
  const [downloadingNoteId, setDownloadingNoteId] = useState<string | null>(null);
  const [activePreviewNote, setActivePreviewNote] = useState<NoteResource | null>(null);

  const availableSubjects = useMemo(() => {
    const subjects = new Set<string>();
    for (const note of publishedNotes) {
      if (note.subject) subjects.add(note.subject);
    }
    for (const exam of publishedExams) {
      if (exam.subject) subjects.add(exam.subject);
    }
    return Array.from(subjects).sort((a, b) => a.localeCompare(b));
  }, [publishedNotes, publishedExams]);

  const effectiveSubjectFilter =
    subjectFilter !== 'all' && !availableSubjects.includes(subjectFilter)
      ? 'all'
      : subjectFilter;

  const progress = useMemo(
    () =>
      calculateStudentLearningProgress({
        publishedNotes,
        publishedExams,
        examAttempts: myExamAttempts,
        userActivities,
        subjectFilter: effectiveSubjectFilter,
      }),
    [publishedNotes, publishedExams, myExamAttempts, userActivities, effectiveSubjectFilter]
  );

  const filteredTasks = useMemo(() => {
    type UnifiedTask =
      | {
          kind: 'note';
          id: string;
          completed: boolean;
          title: string;
          subject: string;
          grade: string;
          note: NoteResource;
          lastActivityAtMs: number;
        }
      | {
          kind: 'exam';
          id: string;
          completed: boolean;
          examStatus: 'completed' | 'in_progress' | 'pending';
          title: string;
          subject: string;
          grade: string;
          examItem: (typeof progress.examItems)[number];
        };

    const items: UnifiedTask[] = [];

    if (categoryFilter === 'all' || categoryFilter === 'notes') {
      for (const nItem of progress.noteItems) {
        if (statusFilter === 'pending' && nItem.completed) continue;
        if (statusFilter === 'completed' && !nItem.completed) continue;
        items.push({
          kind: 'note',
          id: `note_${nItem.note.id}`,
          completed: nItem.completed,
          title: nItem.note.title,
          subject: nItem.note.subject,
          grade: nItem.note.grade,
          note: nItem.note,
          lastActivityAtMs: nItem.lastActivityAtMs,
        });
      }
    }

    if (categoryFilter === 'all' || categoryFilter === 'exams') {
      for (const eItem of progress.examItems) {
        const isDone = eItem.status === 'completed';
        if (statusFilter === 'pending' && isDone) continue;
        if (statusFilter === 'completed' && !isDone) continue;
        items.push({
          kind: 'exam',
          id: `exam_${eItem.exam.id}`,
          completed: isDone,
          examStatus: eItem.status,
          title: eItem.exam.title,
          subject: eItem.exam.subject,
          grade: eItem.exam.grade,
          examItem: eItem,
        });
      }
    }

    // Show pending / in-progress tasks first so actionable work surfaces immediately
    return items.sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      if (a.kind === 'exam' && b.kind === 'exam') {
        if (a.examStatus === 'in_progress' && b.examStatus !== 'in_progress') return -1;
        if (b.examStatus === 'in_progress' && a.examStatus !== 'in_progress') return 1;
      }
      return a.title.localeCompare(b.title);
    });
  }, [progress, statusFilter, categoryFilter]);

  if (!firebaseUser) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center space-y-6">
        <User className="mx-auto h-12 w-12 text-slate-500" />
        <h2 className="text-2xl font-bold text-white">Sign In to View Your Learning Dashboard</h2>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Sign in with your Google account to track completion of assigned educational notes, online examination tasks, marks, and rank board progress.
        </p>
        <div>
          <button
            type="button"
            onClick={() => signInWithGoogle('dashboard')}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
          >
            <User className="h-4 w-4" />
            <span>Continue with Google</span>
          </button>
        </div>
      </div>
    );
  }

  const gradedAttempts = myExamAttempts.filter((a) => a.status === 'graded');
  const avgPercentage = gradedAttempts.length
    ? Math.round(gradedAttempts.reduce((s, a) => s + a.percentage, 0) / gradedAttempts.length)
    : 0;

  const pendingTotal = Math.max(0, progress.overallTotal - progress.overallCompleted);

  // Radial SVG ring geometry (r = 50 -> circumference = 314.16)
  const ringRadius = 50;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    ringCircumference - (progress.overallPercentage / 100) * ringCircumference;

  const handleToggleNoteCompletion = async (note: NoteResource, currentlyCompleted: boolean) => {
    if (togglingNoteId === note.id) return;
    setTogglingNoteId(note.id);
    try {
      if (currentlyCompleted) {
        await clearUserNoteCompletion({
          userId: firebaseUser.uid,
          noteId: note.id,
          existingActivities: userActivities,
        });
        pushToast('info', 'Note marked as pending', `"${note.title}" was moved back to pending tasks.`);
      } else {
        await recordUserResourceActivity({
          userId: firebaseUser.uid,
          resourceId: note.id,
          resourceType: 'note',
          resourceTitle: note.title,
          subject: note.subject,
          action: 'viewed',
        });
        pushToast('success', 'Note completed', `"${note.title}" has been added to your completed modules.`);
      }
    } catch (err) {
      pushToast(
        'error',
        'Unable to update progress',
        err instanceof Error ? err.message : 'Please check your connection and try again.'
      );
    } finally {
      setTogglingNoteId(null);
    }
  };

  const handlePreviewNote = (note: NoteResource, alreadyCompleted: boolean) => {
    setActivePreviewNote(note);
    if (!alreadyCompleted) {
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

  const handleDownloadNote = async (note: NoteResource) => {
    if (downloadingNoteId === note.id) return;
    setDownloadingNoteId(note.id);
    try {
      await triggerCrossBrowserResourceDownload(note);
      recordUserResourceActivity({
        userId: firebaseUser.uid,
        resourceId: note.id,
        resourceType: 'note',
        resourceTitle: note.title,
        subject: note.subject,
        action: 'downloaded',
      }).catch(() => undefined);
    } catch (err) {
      pushToast(
        'error',
        'Download unavailable',
        err instanceof Error ? err.message : 'Unable to download this note right now.'
      );
    } finally {
      setDownloadingNoteId(null);
    }
  };

  const previewUrl = activePreviewNote ? resolveResourcePreviewUrl(activePreviewNote) : '';
  const directTargetUrl = activePreviewNote ? getResourceTargetUrl(activePreviewNote) : '';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Top Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
            <LayoutDashboard className="h-8 w-8 text-cyan-400 shrink-0" />
            <span>Student Learning Dashboard</span>
          </h1>
          <p className="text-slate-300 text-sm">
            Welcome back, {userProfile?.displayName || firebaseUser.displayName || 'Student'}
            {userProfile?.grade ? ` · ${userProfile.grade}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => navigate('notes')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-cyan-400/50 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <BookOpen className="h-4 w-4 text-cyan-400" />
            <span>Study Notes</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('online-papers')}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
          >
            <Monitor className="h-4 w-4" />
            <span>Online Exams</span>
          </button>
        </div>
      </header>

      {/* Primary Curriculum & Examination Completion Progress Indicator */}
      <section
        aria-labelledby="learning-progress-heading"
        className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-b border-slate-800/80">
          <div className="space-y-0.5">
            <h2 id="learning-progress-heading" className="text-base font-bold text-white">
              Assigned Curriculum &amp; Examination Progress
            </h2>
            <p className="text-xs text-slate-400 tabular-nums">
              {progress.overallTotal === 0
                ? 'No educational notes or online examinations are currently assigned'
                : `${progress.overallCompleted} of ${progress.overallTotal} assigned tasks completed · ${pendingTotal} remaining`}
            </p>
          </div>

          {availableSubjects.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <label htmlFor="dashboard-subject-scope" className="text-xs text-slate-400 whitespace-nowrap">
                Subject scope:
              </label>
              <select
                id="dashboard-subject-scope"
                value={effectiveSubjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 focus:border-cyan-400 focus:outline-none"
              >
                <option value="all">All Assigned Subjects</option>
                {availableSubjects.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 lg:divide-x lg:divide-slate-800/80">
          {/* Overall Completion Radial Gauge */}
          <div className="lg:col-span-5 p-6 flex flex-col sm:flex-row items-center gap-6">
            <div
              role="progressbar"
              aria-label="Overall completion percentage of assigned notes and online exams"
              aria-valuenow={progress.overallPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
              className="relative flex h-32 w-32 shrink-0 items-center justify-center"
            >
              <svg className="h-32 w-32 -rotate-90 transform" viewBox="0 0 120 120" aria-hidden="true">
                <circle
                  cx="60"
                  cy="60"
                  r={ringRadius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="10"
                  className="text-slate-800"
                />
                <circle
                  cx="60"
                  cy="60"
                  r={ringRadius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  className={`transition-all duration-500 ease-out ${
                    progress.overallPercentage === 100
                      ? 'text-emerald-400'
                      : 'text-cyan-400'
                  }`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-extrabold text-white tabular-nums">
                  {progress.overallPercentage}%
                </span>
                <span className="text-[11px] font-medium text-slate-400">Complete</span>
              </div>
            </div>

            <div className="space-y-2 text-center sm:text-left min-w-0">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold">
                {progress.overallTotal === 0 ? (
                  <>
                    <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="text-slate-300">Awaiting Assigned Curriculum</span>
                  </>
                ) : progress.overallPercentage === 100 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-emerald-400">All Assigned Tasks Completed</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4 text-cyan-400 shrink-0" />
                    <span className="text-cyan-300 tabular-nums">
                      In Progress · {pendingTotal} {pendingTotal === 1 ? 'task' : 'tasks'} left
                    </span>
                  </>
                )}
              </div>

              <p className="text-sm text-slate-300 leading-relaxed tabular-nums">
                {progress.overallTotal === 0
                  ? 'Published educational notes and scheduled online examinations will automatically appear here.'
                  : `You have completed ${progress.notesCompleted} of ${progress.notesTotal} educational notes and ${progress.examsCompleted} of ${progress.examsTotal} online examinations.`}
              </p>
            </div>
          </div>

          {/* Category Progress Bars (Notes + Online Examinations) */}
          <div className="lg:col-span-7 divide-y divide-slate-800/80 border-t lg:border-t-0 border-slate-800/80">
            {/* Assigned Educational Notes Bar */}
            <div className="p-6 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen className="h-4 w-4 text-cyan-400 shrink-0" />
                  <span className="text-sm font-semibold text-white truncate">
                    Assigned Educational Notes
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 tabular-nums">
                  <span className="text-xs text-slate-400">
                    {progress.notesCompleted} / {progress.notesTotal}
                  </span>
                  <span className="text-sm font-bold text-cyan-300 w-11 text-right">
                    {progress.notesPercentage}%
                  </span>
                </div>
              </div>

              <div
                role="progressbar"
                aria-label="Assigned educational notes completion percentage"
                aria-valuenow={progress.notesPercentage}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800"
              >
                <svg
                  className="block h-full w-full"
                  viewBox="0 0 100 10"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <rect
                    x="0"
                    y="0"
                    width={progress.notesPercentage}
                    height="10"
                    className="fill-cyan-400 transition-all duration-500 ease-out"
                  />
                </svg>
              </div>

              <div className="flex items-center justify-between gap-4 text-xs text-slate-400">
                <span>
                  {progress.notesTotal === 0
                    ? 'No published notes in this scope yet'
                    : `${Math.max(0, progress.notesTotal - progress.notesCompleted)} note modules remaining to study`}
                </span>
                <button
                  type="button"
                  onClick={() => navigate('notes')}
                  className="text-cyan-400 hover:text-cyan-300 font-semibold whitespace-nowrap shrink-0"
                >
                  Open Notes →
                </button>
              </div>
            </div>

            {/* Online Examination Tasks Bar */}
            <div className="p-6 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Monitor className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span className="text-sm font-semibold text-white truncate">
                    Online Examination Tasks
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 tabular-nums">
                  <span className="text-xs text-slate-400">
                    {progress.examsCompleted} / {progress.examsTotal}
                  </span>
                  <span className="text-sm font-bold text-indigo-300 w-11 text-right">
                    {progress.examsPercentage}%
                  </span>
                </div>
              </div>

              <div
                role="progressbar"
                aria-label="Online examination tasks completion percentage"
                aria-valuenow={progress.examsPercentage}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800"
              >
                <svg
                  className="block h-full w-full"
                  viewBox="0 0 100 10"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <rect
                    x="0"
                    y="0"
                    width={progress.examsPercentage}
                    height="10"
                    className="fill-indigo-400 transition-all duration-500 ease-out"
                  />
                </svg>
              </div>

              <div className="flex items-center justify-between gap-4 text-xs text-slate-400">
                <span className="tabular-nums">
                  {progress.examsInProgress > 0
                    ? `${progress.examsInProgress} active examination attempt in progress — resume before timer closes`
                    : progress.examsTotal === 0
                    ? 'No online examinations published in this scope yet'
                    : `${Math.max(0, progress.examsTotal - progress.examsCompleted)} online examination tasks remaining`}
                </span>
                <button
                  type="button"
                  onClick={() => navigate('online-papers')}
                  className="text-indigo-300 hover:text-indigo-200 font-semibold whitespace-nowrap shrink-0"
                >
                  Open Exams →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quantitative Overview Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-1.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Overall Progress</span>
            <CheckCircle2 className="h-4 w-4 text-cyan-400 shrink-0" />
          </div>
          <div className="text-2xl font-extrabold text-white tabular-nums">
            {progress.overallPercentage}%
          </div>
          <p className="text-xs text-slate-400 tabular-nums">
            {progress.overallCompleted} of {progress.overallTotal} tasks done
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-1.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Notes Completed</span>
            <BookOpen className="h-4 w-4 text-cyan-400 shrink-0" />
          </div>
          <div className="text-2xl font-extrabold text-white tabular-nums">
            {progress.notesCompleted} / {progress.notesTotal}
          </div>
          <p className="text-xs text-slate-400 tabular-nums">
            {progress.notesPercentage}% of assigned notes
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-1.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Completed Exams</span>
            <Award className="h-4 w-4 text-indigo-400 shrink-0" />
          </div>
          <div className="text-2xl font-extrabold text-white tabular-nums">
            {progress.examsCompleted} / {progress.examsTotal}
          </div>
          <p className="text-xs text-slate-400 tabular-nums">
            {gradedAttempts.length} graded submissions
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-1.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Average Exam Score</span>
            <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
          </div>
          <div className="text-2xl font-extrabold text-white tabular-nums">
            {gradedAttempts.length > 0 ? `${avgPercentage}%` : '—'}
          </div>
          <p className="text-xs text-slate-400 tabular-nums">
            {gradedAttempts.length > 0
              ? `Across ${gradedAttempts.length} marked ${gradedAttempts.length === 1 ? 'paper' : 'papers'}`
              : 'Complete an exam to see average'}
          </p>
        </div>
      </div>

      {/* Interactive Assigned Tasks Checklist */}
      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-white">Assigned Notes &amp; Examination Tasks</h2>
            <p className="text-xs text-slate-400 pt-0.5">
              Preview or download study notes, mark completed modules, or launch scheduled online examinations directly.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-800 bg-slate-900/80 p-1">
              {(
                [
                  { id: 'all', label: `All (${progress.overallTotal})` },
                  { id: 'pending', label: `Pending (${pendingTotal})` },
                  { id: 'completed', label: `Completed (${progress.overallCompleted})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold tabular-nums whitespace-nowrap shrink-0 transition-colors ${
                    statusFilter === tab.id
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="inline-flex rounded-xl border border-slate-800 bg-slate-900/80 p-1">
              {(
                [
                  { id: 'all', label: 'All Types' },
                  { id: 'notes', label: 'Notes' },
                  { id: 'exams', label: 'Exams' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    categoryFilter === cat.id
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {dataLoading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 divide-y divide-slate-800/80">
            {[1, 2, 3].map((row) => (
              <div key={row} className="flex items-center justify-between gap-4 p-4 animate-pulse">
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-56 rounded bg-slate-800" />
                  <div className="h-3 w-40 rounded bg-slate-800/70" />
                </div>
                <div className="h-8 w-24 rounded-lg bg-slate-800" />
              </div>
            ))}
          </div>
        ) : progress.overallTotal === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center space-y-3">
            <p className="text-sm text-slate-300 font-medium">
              No assigned educational notes or online examinations are published yet.
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Once your instructor publishes study modules or scheduled online examinations, your completion percentage will update automatically here.
            </p>
            <div className="pt-1 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate('papers')}
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-400/50 hover:text-white whitespace-nowrap shrink-0"
              >
                Browse Past Papers
              </button>
            </div>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
            No tasks match your selected filter.{' '}
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setCategoryFilter('all');
              }}
              className="text-cyan-400 underline font-semibold hover:text-cyan-300"
            >
              Show all assigned tasks
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 divide-y divide-slate-800/80 overflow-hidden">
            {filteredTasks.map((task) => {
              if (task.kind === 'note') {
                const isToggling = togglingNoteId === task.note.id;
                const isDownloading = downloadingNoteId === task.note.id;
                return (
                  <div
                    key={task.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-5 py-4 hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <button
                        type="button"
                        disabled={isToggling}
                        onClick={() => handleToggleNoteCompletion(task.note, task.completed)}
                        aria-label={
                          task.completed
                            ? `Mark "${task.title}" as pending`
                            : `Mark "${task.title}" as completed`
                        }
                        className="mt-0.5 text-slate-400 hover:text-cyan-300 disabled:opacity-50 shrink-0"
                      >
                        {isToggling ? (
                          <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                        ) : task.completed ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        ) : (
                          <Circle className="h-5 w-5 text-slate-500" />
                        )}
                      </button>

                      <div className="min-w-0 space-y-1">
                        <h3 className="text-sm font-semibold text-white truncate">{task.title}</h3>
                        <p className="text-xs text-slate-400 tabular-nums">
                          Educational Note · {task.subject} · {task.grade}
                          {task.completed && task.lastActivityAtMs > 0
                            ? ` · Completed ${formatShortDate(task.lastActivityAtMs)}`
                            : ' · Pending study'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pl-8 sm:pl-0">
                      <button
                        type="button"
                        onClick={() => handlePreviewNote(task.note, task.completed)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400/50 hover:text-white transition-colors whitespace-nowrap shrink-0"
                      >
                        <Eye className="h-3.5 w-3.5 text-cyan-400" />
                        <span>Preview</span>
                      </button>

                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() => handleDownloadNote(task.note)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-400/50 hover:text-white disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                      >
                        {isDownloading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                        ) : (
                          <Download className="h-3.5 w-3.5 text-cyan-400" />
                        )}
                        <span>Download</span>
                      </button>

                      <button
                        type="button"
                        disabled={isToggling}
                        onClick={() => handleToggleNoteCompletion(task.note, task.completed)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          task.completed
                            ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                            : 'bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/25'
                        }`}
                      >
                        <span>{task.completed ? 'Completed' : 'Mark Read'}</span>
                      </button>
                    </div>
                  </div>
                );
              }

              // Online Exam Task Row
              const { exam, status, latestAttempt } = task.examItem;
              const schedule = evaluateExamSchedule(exam, serverNowMs);
              const scheduleLabel =
                schedule.state === 'open'
                  ? 'Open Now'
                  : schedule.state === 'upcoming'
                  ? 'Upcoming'
                  : 'Closed';

              return (
                <div
                  key={task.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-5 py-4 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      {status === 'completed' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                      ) : status === 'in_progress' ? (
                        <Clock className="h-5 w-5 text-amber-400" aria-hidden="true" />
                      ) : (
                        <Monitor className="h-5 w-5 text-indigo-400" aria-hidden="true" />
                      )}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <h3 className="text-sm font-semibold text-white truncate">{task.title}</h3>
                      <p className="text-xs text-slate-400 tabular-nums">
                        Online Exam · {task.subject} · {task.grade} · {scheduleLabel}
                        {status === 'completed' && latestAttempt
                          ? latestAttempt.status === 'pending_review'
                            ? ' · Submitted (Pending Review)'
                            : ` · Score ${latestAttempt.marksObtained}/${latestAttempt.totalMarks} (${latestAttempt.percentage}%)`
                          : status === 'completed'
                          ? ' · Completed'
                          : status === 'in_progress'
                          ? ' · Attempt In Progress'
                          : ` · ${exam.durationMinutes} mins`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 pl-8 sm:pl-0">
                    <button
                      type="button"
                      onClick={() => navigate('online-papers')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        status === 'completed'
                          ? 'border border-slate-700 bg-slate-950/70 text-slate-200 hover:border-indigo-400/50 hover:text-white'
                          : status === 'in_progress'
                          ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                          : 'bg-indigo-500 text-white hover:bg-indigo-400'
                      }`}
                    >
                      {status === 'completed' ? (
                        <>
                          <Eye className="h-3.5 w-3.5 text-indigo-300" />
                          <span>View Result</span>
                        </>
                      ) : status === 'in_progress' ? (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          <span>Resume Exam</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          <span>Start Exam</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Exam Attempts History Section */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Award className="h-5 w-5 text-cyan-400 shrink-0" />
          <span>My Examination History</span>
        </h2>

        {myExamAttempts.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-400 text-sm">
            You have not completed any online examinations yet.{' '}
            <button
              type="button"
              onClick={() => navigate('online-papers')}
              className="text-cyan-400 underline font-semibold hover:text-cyan-300"
            >
              Browse Examinations
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 divide-y divide-slate-800/80 overflow-hidden">
            {myExamAttempts.map((att) => (
              <div
                key={att.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <h3 className="font-semibold text-white truncate">{att.examTitle}</h3>
                  <p className="text-xs text-slate-400 pt-1 tabular-nums">
                    {att.subject} · Attempt #{att.attemptNumber}
                    {att.submittedAtMs > 0 ? ` · ${formatShortDate(att.submittedAtMs)}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-6 shrink-0">
                  <div className="sm:text-right tabular-nums">
                    {att.status === 'in_progress' ? (
                      <>
                        <div className="font-bold text-amber-300 text-sm">Attempt In Progress</div>
                        <span className="text-xs font-semibold text-slate-400">
                          Not yet submitted
                        </span>
                      </>
                    ) : att.status === 'pending_review' ? (
                      <>
                        <div className="font-bold text-white text-sm">Submitted</div>
                        <span className="text-xs font-semibold text-amber-300">
                          PENDING INSTRUCTOR REVIEW
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="font-bold text-white text-sm">
                          {att.marksObtained} / {att.totalMarks} ({att.percentage}%)
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            att.passed ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {att.passed ? 'PASSED' : 'REVISION NEEDED'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Inline Note Preview Modal */}
      {activePreviewNote && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${activePreviewNote.title}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 sm:p-6 backdrop-blur-md"
        >
          <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3.5">
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-white">
                  {activePreviewNote.title}
                </h2>
                <p className="truncate text-xs text-slate-400">
                  {activePreviewNote.subject} · {activePreviewNote.grade}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownloadNote(activePreviewNote)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download PDF</span>
                </button>
                {directTargetUrl && (
                  <a
                    href={directTargetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open Tab</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setActivePreviewNote(null)}
                  aria-label="Close note preview"
                  className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-950">
              {previewUrl ? (
                <iframe
                  title={`Note Preview: ${activePreviewNote.title}`}
                  src={previewUrl}
                  className="h-full w-full border-0"
                  allow="autoplay"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-sm text-slate-400">
                  Preview is unavailable for this document. Use the Download PDF button above.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
