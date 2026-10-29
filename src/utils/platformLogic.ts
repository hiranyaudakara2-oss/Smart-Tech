import type {
  CustomRankEntry,
  ExamAttempt,
  ExamAttemptStatus,
  ExamPaper,
  ExamQuestionFull,
  ExamQuestionPublic,
  NoteResource,
  OnlineExam,
  QuestionGradingBreakdown,
  RankBoardCategory,
  UserActivity,
} from '../types/platform';

export const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
export const SIX_DIGIT_CODE_REGEX = /^\d{6}$/;
export const GOOGLE_FORMS_URL_REGEX = /^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/).+/;
export const GOOGLE_DRIVE_URL_REGEX = /^https:\/\/(drive\.google\.com|docs\.google\.com)\/.+/;
export const MAX_PDF_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_NOTICE_IMAGE_BYTES = 5 * 1024 * 1024;
export const COLOMBO_OFFSET_MINUTES = 330; // UTC+05:30 (Asia/Colombo has no DST)

export type ExamScheduleState = 'upcoming' | 'open' | 'closed';

export interface ExamEvaluation {
  state: ExamScheduleState;
  statusMessage: string;
  remainingMs: number;
  canAccessForm: boolean;
}

export function isValidDocumentId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && VALID_ID_REGEX.test(id);
}

export function isValidSixDigitCode(code: string): boolean {
  return typeof code === 'string' && SIX_DIGIT_CODE_REGEX.test(code.trim());
}

export function generateRandomSixDigitCode(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    globalThis.crypto.getRandomValues(arr);
    const num = arr[0] % 1_000_000;
    return String(num).padStart(6, '0');
  }
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}

export function isValidGoogleFormsUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length < 24 || trimmed.length > 1500) return false;
  if (!GOOGLE_FORMS_URL_REGEX.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'docs.google.com' || parsed.hostname === 'forms.gle')
    );
  } catch {
    return false;
  }
}

export interface GoogleDriveValidationResult {
  valid: boolean;
  normalizedUrl: string;
  error: string | null;
}

export function validateGoogleDriveUrl(rawUrl: string): GoogleDriveValidationResult {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Please enter a Google Drive sharing link.',
    };
  }
  const trimmed = rawUrl.trim();
  if (trimmed.length > 1500) {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Google Drive link is too long (maximum 1,500 characters).',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalizedUrl: '',
      error:
        'Invalid URL format. Enter a full HTTPS Google Drive sharing link (e.g., https://drive.google.com/file/d/.../view?usp=sharing).',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Google Drive link must use secure HTTPS (starting with https://).',
    };
  }

  if (parsed.hostname !== 'drive.google.com' && parsed.hostname !== 'docs.google.com') {
    return {
      valid: false,
      normalizedUrl: '',
      error:
        'Only official Google Drive or Google Docs sharing links (drive.google.com or docs.google.com) are accepted.',
    };
  }

  const pathname = parsed.pathname || '';
  const hasFileOrFolderPath =
    /^\/file\/d\/[a-zA-Z0-9_-]{8,}/.test(pathname) ||
    /^\/drive\/(u\/\d+\/)?folders\/[a-zA-Z0-9_-]{8,}/.test(pathname) ||
    /^\/(document|spreadsheets|presentation)\/d\/[a-zA-Z0-9_-]{8,}/.test(pathname);
  const hasIdParam =
    (pathname === '/open' || pathname === '/uc' || pathname.startsWith('/file')) &&
    (parsed.searchParams.get('id') || '').trim().length >= 8;

  if (!hasFileOrFolderPath && !hasIdParam) {
    return {
      valid: false,
      normalizedUrl: '',
      error:
        'Include a complete Google Drive sharing link to a specific document or folder (for example: https://drive.google.com/file/d/<FILE_ID>/view?usp=sharing).',
    };
  }

  if (trimmed.length < 20 || !GOOGLE_DRIVE_URL_REGEX.test(trimmed)) {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Enter a valid Google Drive sharing URL.',
    };
  }

  return {
    valid: true,
    normalizedUrl: parsed.toString(),
    error: null,
  };
}

export function isValidGoogleDriveUrl(url: string): boolean {
  return validateGoogleDriveUrl(url).valid;
}

export function isGoogleDriveResource(item: {
  sourceType?: string;
  driveUrl?: string;
  pdfUrl: string;
}): boolean {
  if (item.sourceType === 'drive') return true;
  if (item.driveUrl && GOOGLE_DRIVE_URL_REGEX.test(item.driveUrl.trim())) return true;
  return GOOGLE_DRIVE_URL_REGEX.test((item.pdfUrl || '').trim());
}

export function getResourceTargetUrl(item: {
  sourceType?: string;
  driveUrl?: string;
  pdfUrl: string;
}): string {
  if (item.driveUrl && GOOGLE_DRIVE_URL_REGEX.test(item.driveUrl.trim())) {
    return item.driveUrl.trim();
  }
  return (item.pdfUrl || '').trim();
}

export function verifyPdfMagicBytes(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

export function sanitizeStorageFileName(rawName: string): string {
  const cleaned = (rawName || 'document.pdf')
    .trim()
    .replace(/[^a-zA-Z0-9_\-.]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
  if (!cleaned.toLowerCase().endsWith('.pdf')) {
    return `${cleaned || 'document'}.pdf`;
  }
  return cleaned.length > 4 ? cleaned : `document_${cleaned}`;
}

export interface ImageSignatureResult {
  valid: boolean;
  ext: 'png' | 'jpg' | 'webp';
  mime: string;
}

export function verifyImageMagicBytes(bytes: Uint8Array): ImageSignatureResult {
  if (!bytes || bytes.length < 3) {
    return { valid: false, ext: 'png', mime: '' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { valid: true, ext: 'png', mime: 'image/png' };
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, ext: 'jpg', mime: 'image/jpeg' };
  }
  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { valid: true, ext: 'webp', mime: 'image/webp' };
  }
  return { valid: false, ext: 'png', mime: '' };
}

export function sanitizeImageStorageFileName(
  rawName: string,
  ext: 'png' | 'jpg' | 'webp'
): string {
  const withoutExt = (rawName || 'notice_banner')
    .trim()
    .replace(/\.(png|jpe?g|webp)$/i, '');
  const cleaned = withoutExt
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
  return `${cleaned || 'notice_banner'}.${ext}`;
}

export function normalizeAnnouncementImageUrl(rawUrl: string): string {
  if (typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (GOOGLE_DRIVE_URL_REGEX.test(trimmed)) {
    const driveFileId = extractGoogleDriveFileId(trimmed);
    if (driveFileId) {
      return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1600`.slice(0, 1500);
    }
  }
  return trimmed.slice(0, 1500);
}

export function parseTagsInput(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(',')) {
    const clean = part.trim().slice(0, 32);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
    if (result.length >= 10) break;
  }
  return result;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function evaluateExamStatus(
  opensAtMs: number,
  closesAtMs: number,
  serverNowMs: number
): ExamEvaluation {
  if (serverNowMs < opensAtMs) {
    return {
      state: 'upcoming',
      statusMessage: 'This examination has not opened yet.',
      remainingMs: Math.max(0, opensAtMs - serverNowMs),
      canAccessForm: false,
    };
  }
  if (serverNowMs >= closesAtMs) {
    return {
      state: 'closed',
      statusMessage: 'This examination is now closed.',
      remainingMs: 0,
      canAccessForm: false,
    };
  }
  return {
    state: 'open',
    statusMessage: 'Examination is currently open.',
    remainingMs: Math.max(0, closesAtMs - serverNowMs),
    canAccessForm: true,
  };
}

export function evaluateExamSchedule(
  exam: { opensAtMs: number; closesAtMs: number },
  serverNowMs: number
): ExamEvaluation {
  return evaluateExamStatus(exam.opensAtMs, exam.closesAtMs, serverNowMs);
}

export function formatCountdown(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (days > 0) {
    return `${days}d ${hh}h ${mm}m ${ss}s`;
  }
  return `${hh}:${mm}:${ss}`;
}

export function parseColomboLocalInputToUtcMs(localDateTime: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localDateTime.trim());
  if (!match) return null;
  const [, yearStr, monthStr, dayStr, hourStr, minStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minStr);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }
  const utcEquivalent = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  return utcEquivalent - COLOMBO_OFFSET_MINUTES * 60 * 1000;
}

export function formatUtcMsToColomboLocalInput(utcMs: number): string {
  const shifted = new Date(utcMs + COLOMBO_OFFSET_MINUTES * 60 * 1000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const min = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function formatColomboDateTime(utcMs: number): string {
  if (!utcMs || !Number.isFinite(utcMs)) return '—';
  return `${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(utcMs))} (Asia/Colombo)`;
}

export function formatShortDate(utcMs: number): string {
  if (!utcMs || !Number.isFinite(utcMs)) return 'Just now';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(utcMs));
}

export interface NoteValidationInput {
  title: string;
  subject: string;
  grade: string;
  description: string;
}

export function validateNoteFormInput(input: NoteValidationInput): string | null {
  const title = input.title.trim();
  const subject = input.subject.trim();
  const grade = input.grade.trim();
  const description = input.description.trim();

  if (title.length < 2 || title.length > 160) {
    return 'Note title must be between 2 and 160 characters.';
  }
  if (subject.length < 2 || subject.length > 80) {
    return 'Subject or technology stream must be between 2 and 80 characters.';
  }
  if (grade.length < 1 || grade.length > 40) {
    return 'Academic level / grade is required (up to 40 characters).';
  }
  if (description.length < 4 || description.length > 2000) {
    return 'Description must be between 4 and 2,000 characters.';
  }
  return null;
}

export interface PaperValidationInput {
  title: string;
  subject: string;
  category?: string;
  year: number;
  grade: string;
  examType: string;
  language: string;
  description: string;
}

export function validatePaperFormInput(input: PaperValidationInput): string | null {
  if (input.title.trim().length < 2 || input.title.trim().length > 160) {
    return 'Paper title must be between 2 and 160 characters.';
  }
  if (input.subject.trim().length < 2 || input.subject.trim().length > 80) {
    return 'Subject must be between 2 and 80 characters.';
  }
  if (input.category !== undefined && input.category.trim().length > 60) {
    return 'Category must not exceed 60 characters.';
  }
  if (!Number.isInteger(input.year) || input.year < 1990 || input.year > 2100) {
    return 'Examination year must be a valid integer between 1990 and 2100.';
  }
  if (input.grade.trim().length < 1 || input.grade.trim().length > 40) {
    return 'Grade / academic level is required.';
  }
  if (input.examType.trim().length < 2 || input.examType.trim().length > 60) {
    return 'Examination type is required.';
  }
  if (input.language.trim().length < 2 || input.language.trim().length > 40) {
    return 'Language is required.';
  }
  if (input.description.trim().length > 1500) {
    return 'Description must not exceed 1,500 characters.';
  }
  return null;
}

export interface ExamValidationInput {
  title: string;
  subject: string;
  grade: string;
  description: string;
  instructions: string;
  formUrl: string;
  opensAtMs: number | null;
  closesAtMs: number | null;
}

export function validateOnlineExamInput(input: ExamValidationInput): string | null {
  if (input.title.trim().length < 2 || input.title.trim().length > 160) {
    return 'Examination title must be between 2 and 160 characters.';
  }
  if (input.subject.trim().length < 2 || input.subject.trim().length > 80) {
    return 'Subject must be between 2 and 80 characters.';
  }
  if (input.grade.trim().length < 1 || input.grade.trim().length > 40) {
    return 'Eligible grade or student group is required.';
  }
  if (input.description.trim().length < 4 || input.description.trim().length > 2000) {
    return 'Description must be between 4 and 2,000 characters.';
  }
  if (input.instructions.trim().length < 4 || input.instructions.trim().length > 2000) {
    return 'Candidate instructions must be between 4 and 2,000 characters.';
  }
  if (!isValidGoogleFormsUrl(input.formUrl)) {
    return 'Enter a valid HTTPS Google Forms URL (https://docs.google.com/forms/... or https://forms.gle/...).';
  }
  if (input.opensAtMs === null || input.closesAtMs === null) {
    return 'Both scheduled opening and closing date/time values are required.';
  }
  if (input.closesAtMs <= input.opensAtMs) {
    return 'Scheduled closing time must be strictly later than the opening time.';
  }
  return null;
}

export function calculateExamTotalMarks(questions: Array<{ marks: number }>): number {
  return questions.reduce((sum, q) => sum + (Number.isFinite(q.marks) && q.marks > 0 ? Math.floor(q.marks) : 0), 0);
}

export function sanitizeQuestionsForPublic(questions: ExamQuestionFull[]): ExamQuestionPublic[] {
  return questions.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt.trim().slice(0, 1000),
    options:
      q.type === 'true_false'
        ? ['True', 'False']
        : q.type === 'mcq'
        ? q.options.map((o) => o.trim().slice(0, 300)).slice(0, 6)
        : [],
    marks: Math.max(1, Math.min(100, Math.floor(q.marks))),
  }));
}

export interface NativeExamValidationInput {
  title: string;
  subject: string;
  grade: string;
  description: string;
  instructions: string;
  durationMinutes: number;
  passingMarks: number;
  maxAttempts: number;
  accessCode: string;
  requireAccessCode: boolean;
  opensAtMs: number | null;
  closesAtMs: number | null;
  questions: ExamQuestionFull[];
}

export function validateNativeExamInput(input: NativeExamValidationInput): string | null {
  if (input.title.trim().length < 2 || input.title.trim().length > 160) {
    return 'Examination title must be between 2 and 160 characters.';
  }
  if (input.subject.trim().length < 2 || input.subject.trim().length > 80) {
    return 'Subject must be between 2 and 80 characters.';
  }
  if (input.grade.trim().length < 1 || input.grade.trim().length > 40) {
    return 'Eligible grade or student group is required.';
  }
  if (input.description.trim().length < 4 || input.description.trim().length > 2000) {
    return 'Description must be between 4 and 2,000 characters.';
  }
  if (input.instructions.trim().length < 4 || input.instructions.trim().length > 2000) {
    return 'Examination instructions must be between 4 and 2,000 characters.';
  }
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 360) {
    return 'Examination duration must be between 1 and 360 minutes.';
  }
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 10) {
    return 'Maximum attempts must be between 1 and 10.';
  }
  if (input.requireAccessCode && !isValidSixDigitCode(input.accessCode)) {
    return 'Every online examination must have a valid 6-digit numeric access password (e.g., 482731).';
  }
  if (input.opensAtMs === null || input.closesAtMs === null) {
    return 'Both start and end date/time values are required.';
  }
  if (input.closesAtMs <= input.opensAtMs) {
    return 'End date/time must be strictly later than start date/time.';
  }
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    return 'Add at least one question to the examination.';
  }
  if (input.questions.length > 50) {
    return 'An examination may contain up to 50 questions.';
  }

  for (let i = 0; i < input.questions.length; i++) {
    const q = input.questions[i];
    if (!q.prompt || q.prompt.trim().length < 2) {
      return `Question ${i + 1}: Question text is required.`;
    }
    if (!Number.isInteger(q.marks) || q.marks < 1 || q.marks > 100) {
      return `Question ${i + 1}: Marks must be an integer between 1 and 100.`;
    }
    if (q.type === 'mcq') {
      const validOpts = (q.options || []).map((o) => o.trim()).filter(Boolean);
      if (validOpts.length < 2 || validOpts.length > 6) {
        return `Question ${i + 1}: Multiple-choice questions require 2 to 6 non-empty options.`;
      }
      if (
        typeof q.correctOptionIndex !== 'number' ||
        q.correctOptionIndex < 0 ||
        q.correctOptionIndex >= q.options.length ||
        !q.options[q.correctOptionIndex]?.trim()
      ) {
        return `Question ${i + 1}: Select a valid correct answer option.`;
      }
    } else if (q.type === 'true_false') {
      if (typeof q.correctBoolean !== 'boolean') {
        return `Question ${i + 1}: Select True or False as the correct answer.`;
      }
    }
  }

  const totalMarks = calculateExamTotalMarks(input.questions);
  if (!Number.isInteger(input.passingMarks) || input.passingMarks < 1 || input.passingMarks > totalMarks) {
    return `Passing marks must be between 1 and total marks (${totalMarks}).`;
  }

  return null;
}

export interface AutoGradingResult {
  status: ExamAttemptStatus;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  passed: boolean;
  hasManualQuestions: boolean;
  breakdown: QuestionGradingBreakdown[];
}

export function gradeExamSubmission(
  questions: ExamQuestionFull[],
  answers: Record<string, string>,
  passingMarks: number
): AutoGradingResult {
  let marksObtained = 0;
  let totalMarks = 0;
  let hasManualQuestions = false;
  const breakdown: QuestionGradingBreakdown[] = [];

  for (const q of questions) {
    const maxMarks = Math.max(1, Math.floor(q.marks));
    totalMarks += maxMarks;
    const rawAns = String(answers[q.id] ?? '').trim();

    if (q.type === 'mcq') {
      const chosenIdx = rawAns === '' ? -1 : Number(rawAns);
      const correctIdx = typeof q.correctOptionIndex === 'number' ? q.correctOptionIndex : 0;
      const isCorrect = Number.isInteger(chosenIdx) && chosenIdx === correctIdx;
      const awarded = isCorrect ? maxMarks : 0;
      marksObtained += awarded;
      breakdown.push({
        questionId: q.id,
        prompt: q.prompt,
        type: 'mcq',
        studentAnswer: chosenIdx >= 0 && q.options[chosenIdx] ? q.options[chosenIdx] : 'Unanswered',
        correctAnswerLabel: q.options[correctIdx] || `Option ${correctIdx + 1}`,
        explanation: q.explanation || '',
        marksAwarded: awarded,
        maxMarks,
        isCorrect,
      });
    } else if (q.type === 'true_false') {
      const normalized = rawAns.toLowerCase();
      const expected = q.correctBoolean ? 'true' : 'false';
      const isCorrect = normalized === expected;
      const awarded = isCorrect ? maxMarks : 0;
      marksObtained += awarded;
      breakdown.push({
        questionId: q.id,
        prompt: q.prompt,
        type: 'true_false',
        studentAnswer:
          normalized === 'true' ? 'True' : normalized === 'false' ? 'False' : 'Unanswered',
        correctAnswerLabel: q.correctBoolean ? 'True' : 'False',
        explanation: q.explanation || '',
        marksAwarded: awarded,
        maxMarks,
        isCorrect,
      });
    } else {
      hasManualQuestions = true;
      breakdown.push({
        questionId: q.id,
        prompt: q.prompt,
        type: 'short_answer',
        studentAnswer: rawAns || 'Unanswered',
        correctAnswerLabel: q.sampleAnswer || 'Evaluated by administrator rubric',
        explanation: q.explanation || '',
        marksAwarded: 0,
        maxMarks,
        isCorrect: null,
      });
    }
  }

  const percentage = totalMarks > 0 ? Math.round((marksObtained / totalMarks) * 100) : 0;
  const passed = !hasManualQuestions && marksObtained >= passingMarks;

  return {
    status: hasManualQuestions ? 'pending_review' : 'graded',
    marksObtained,
    totalMarks,
    percentage,
    passed,
    hasManualQuestions,
    breakdown,
  };
}

export interface RankableSubmission {
  attemptId: string;
  userId: string;
  studentName: string;
  examId: string;
  examTitle: string;
  subject: string;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  passed: boolean;
  isFinalized: boolean;
  submittedAtMs: number;
  serverReceipt: string;
}

export interface RankedCandidate extends RankableSubmission {
  rankPosition: number;
  anonymizedCode: string;
}

export function buildAnonymizedCandidateCode(userId: string, examId: string): string {
  const src = `${userId}:${examId}`;
  let hash = 2166136261;
  for (let i = 0; i < src.length; i++) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 6);
  return `CAND-${hex}`;
}

/**
 * Computes standard competition rankings ("1224" / "1, 1, 3" rule):
 * - Deduplicates multiple attempts per student on the same exam by keeping their highest finalized score.
 * - Sorts from highest to lowest marksObtained (tie-broken for display order by submittedAtMs, while
 *   equal marksObtained receive the exact same rankPosition, and the next distinct score receives index + 1).
 */
export function computeCompetitionRankings(
  submissions: RankableSubmission[],
  options?: { finalizedOnly?: boolean }
): RankedCandidate[] {
  const finalizedOnly = options?.finalizedOnly ?? true;
  const eligible = finalizedOnly ? submissions.filter((s) => s.isFinalized) : [...submissions];

  // Keep best attempt per (examId, userId)
  const bestByUserExam = new Map<string, RankableSubmission>();
  for (const sub of eligible) {
    const key = `${sub.examId}::${sub.userId}`;
    const prev = bestByUserExam.get(key);
    if (
      !prev ||
      sub.marksObtained > prev.marksObtained ||
      (sub.marksObtained === prev.marksObtained && sub.submittedAtMs < prev.submittedAtMs)
    ) {
      bestByUserExam.set(key, sub);
    }
  }

  const deduped = Array.from(bestByUserExam.values()).sort((a, b) => {
    if (b.marksObtained !== a.marksObtained) {
      return b.marksObtained - a.marksObtained;
    }
    if (b.percentage !== a.percentage) {
      return b.percentage - a.percentage;
    }
    return a.submittedAtMs - b.submittedAtMs;
  });

  const ranked: RankedCandidate[] = [];
  for (let idx = 0; idx < deduped.length; idx++) {
    const current = deduped[idx];
    let rankPosition = idx + 1;
    if (idx > 0 && current.marksObtained === deduped[idx - 1].marksObtained) {
      rankPosition = ranked[idx - 1].rankPosition;
    }
    ranked.push({
      ...current,
      rankPosition,
      anonymizedCode: buildAnonymizedCandidateCode(current.userId, current.examId),
    });
  }

  return ranked;
}

export function evaluateCodeRateLimit(
  failureTimestampsMs: number[],
  nowMs: number,
  windowMs = 10 * 60 * 1000,
  maxFailures = 5
): { blocked: boolean; retryAfterSeconds: number; recentFailures: number[] } {
  const recentFailures = failureTimestampsMs.filter((ts) => nowMs - ts < windowMs);
  if (recentFailures.length >= maxFailures) {
    const oldestInWindow = Math.min(...recentFailures);
    const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + windowMs - nowMs) / 1000));
    return { blocked: true, retryAfterSeconds, recentFailures };
  }
  return { blocked: false, retryAfterSeconds: 0, recentFailures };
}

export function filterAndSortNotes(
  notes: NoteResource[],
  opts: {
    query: string;
    subject: string;
    grade: string;
    tag?: string;
    sortOrder: 'newest' | 'oldest';
  }
): NoteResource[] {
  const q = opts.query.trim().toLowerCase();
  const filtered = notes.filter((n) => {
    if (opts.subject !== 'all' && n.subject !== opts.subject) return false;
    if (opts.grade !== 'all' && n.grade !== opts.grade) return false;
    if (opts.tag && opts.tag !== 'all' && !(n.tags || []).includes(opts.tag)) return false;
    if (q) {
      const hay = `${n.title} ${n.subject} ${n.grade} ${n.description} ${(n.tags || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) =>
    opts.sortOrder === 'newest' ? b.createdAtMs - a.createdAtMs : a.createdAtMs - b.createdAtMs
  );
}

export function filterAndSortPapers(
  papers: ExamPaper[],
  opts: {
    query: string;
    subject: string;
    category?: string;
    year: string;
    grade: string;
    examType: string;
    language: string;
    sortOrder: 'newest' | 'oldest';
  }
): ExamPaper[] {
  const q = opts.query.trim().toLowerCase();
  const filtered = papers.filter((p) => {
    if (opts.subject !== 'all' && p.subject !== opts.subject) return false;
    if (opts.category && opts.category !== 'all' && p.category !== opts.category) return false;
    if (opts.year !== 'all' && String(p.year) !== opts.year) return false;
    if (opts.grade !== 'all' && p.grade !== opts.grade) return false;
    if (opts.examType !== 'all' && p.examType !== opts.examType) return false;
    if (opts.language !== 'all' && p.language !== opts.language) return false;
    if (q) {
      const hay = `${p.title} ${p.subject} ${p.category || ''} ${p.year} ${p.examType} ${p.language}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    if (b.year !== a.year) {
      return opts.sortOrder === 'newest' ? b.year - a.year : a.year - b.year;
    }
    return opts.sortOrder === 'newest'
      ? b.createdAtMs - a.createdAtMs
      : a.createdAtMs - b.createdAtMs;
  });
}

export function paginateItems<T>(items: T[], page: number, pageSize: number): {
  slice: T[];
  totalPages: number;
  safePage: number;
} {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    slice: items.slice(start, start + pageSize),
    totalPages,
    safePage,
  };
}

export interface RankBoardValidationInput {
  title: string;
  category: RankBoardCategory;
  subject: string;
  targetGroup?: string;
  description?: string;
}

export function validateCustomRankBoardInput(input: RankBoardValidationInput): string | null {
  const title = input.title.trim();
  const subject = input.subject.trim();
  if (title.length < 2 || title.length > 160) {
    return 'Rank Board title must be between 2 and 160 characters.';
  }
  if (subject.length < 2 || subject.length > 80) {
    return 'Subject or examination stream must be between 2 and 80 characters.';
  }
  if ((input.targetGroup || '').trim().length > 80) {
    return 'Class / target group must not exceed 80 characters.';
  }
  if ((input.description || '').trim().length > 1000) {
    return 'Description must not exceed 1,000 characters.';
  }
  return null;
}

export interface RankEntryValidationInput {
  studentName: string;
  marks: number;
  maxMarks: number;
  subject: string;
  isManualRank: boolean;
  rankPosition?: number;
}

export function validateCustomRankEntryInput(input: RankEntryValidationInput): string | null {
  const name = input.studentName.trim();
  const subject = input.subject.trim();
  if (name.length < 1 || name.length > 100) {
    return 'Student name must be between 1 and 100 characters.';
  }
  if (subject.length < 1 || subject.length > 120) {
    return 'Relevant subject or examination is required (up to 120 characters).';
  }
  if (!Number.isFinite(input.maxMarks) || input.maxMarks <= 0 || input.maxMarks > 10000) {
    return 'Maximum marks must be a positive number up to 10,000.';
  }
  if (!Number.isFinite(input.marks) || input.marks < 0 || input.marks > input.maxMarks) {
    return `Marks / score must be between 0 and maximum marks (${input.maxMarks}).`;
  }
  if (
    input.isManualRank &&
    (!Number.isInteger(input.rankPosition) ||
      (input.rankPosition ?? 0) < 1 ||
      (input.rankPosition ?? 0) > 100000)
  ) {
    return 'Manual rank override must be a whole number starting from 1.';
  }
  return null;
}

/**
 * Computes rankings for a CustomRankBoard:
 * - In 'auto' mode: sorts entries in descending order of marks (tie-broken by displayOrder ascending),
 *   applies standard competition tie-ranking ("1, 1, 3") for automatic entries, preserves explicit
 *   manual rank overrides (isManualRank === true), and outputs entries ordered with Rank 1 at the top.
 * - In 'manual' mode: preserves administrator displayOrder, assigns standard competition ranks for
 *   non-overridden entries, and preserves explicit manual rank overrides.
 */
export function computeManualBoardRankings<
  T extends Pick<
    CustomRankEntry,
    'id' | 'marks' | 'maxMarks' | 'rankPosition' | 'isManualRank' | 'displayOrder'
  >
>(
  entries: T[],
  rankingMode: 'auto' | 'manual' = 'auto'
): Array<T & { computedRank: number; computedOrder: number; computedPercentage: number }> {
  if (entries.length === 0) return [];

  const withPct = entries.map((e, idx) => {
    const safeMax = e.maxMarks > 0 ? e.maxMarks : 100;
    const pct = Math.min(100, Math.max(0, Math.round((e.marks / safeMax) * 100)));
    const safeOrder = Number.isFinite(e.displayOrder) ? e.displayOrder : idx;
    return {
      ...e,
      safeOrder,
      computedPercentage: pct,
    };
  });

  if (rankingMode === 'manual') {
    const manualOrdered = [...withPct].sort((a, b) => {
      if (a.safeOrder !== b.safeOrder) return a.safeOrder - b.safeOrder;
      return b.marks - a.marks;
    });

    let prevAutoMarks: number | null = null;
    let prevAutoRank = 1;

    return manualOrdered.map((item, idx) => {
      let autoRank = idx + 1;
      if (prevAutoMarks !== null && item.marks === prevAutoMarks) {
        autoRank = prevAutoRank;
      } else {
        prevAutoMarks = item.marks;
        prevAutoRank = autoRank;
      }

      const finalRank =
        item.isManualRank && Number.isInteger(item.rankPosition) && item.rankPosition >= 1
          ? item.rankPosition
          : autoRank;

      return {
        ...item,
        computedRank: finalRank,
        computedOrder: idx,
        computedPercentage: item.computedPercentage,
      };
    });
  }

  // Automatic ranking mode: sort by marks descending, percentage descending, displayOrder ascending
  const scoreSorted = [...withPct].sort((a, b) => {
    if (b.marks !== a.marks) return b.marks - a.marks;
    if (b.computedPercentage !== a.computedPercentage) {
      return b.computedPercentage - a.computedPercentage;
    }
    return a.safeOrder - b.safeOrder;
  });

  const autoRanked = scoreSorted.map((item, idx) => {
    let autoRank = idx + 1;
    if (idx > 0 && item.marks === scoreSorted[idx - 1].marks) {
      // Standard competition tie-ranking ("1, 1, 3")
      // Find first matching score index
      let firstIdx = idx - 1;
      while (firstIdx > 0 && scoreSorted[firstIdx - 1].marks === item.marks) {
        firstIdx -= 1;
      }
      autoRank = firstIdx + 1;
    }

    const finalRank =
      item.isManualRank && Number.isInteger(item.rankPosition) && item.rankPosition >= 1
        ? item.rankPosition
        : autoRank;

    return {
      ...item,
      computedRank: finalRank,
    };
  });

  // Ensure Rank 1 is always at the top, followed by descending marks, then displayOrder
  const finalSorted = [...autoRanked].sort((a, b) => {
    if (a.computedRank !== b.computedRank) return a.computedRank - b.computedRank;
    if (b.marks !== a.marks) return b.marks - a.marks;
    return a.safeOrder - b.safeOrder;
  });

  return finalSorted.map((item, idx) => ({
    ...item,
    computedRank: item.computedRank,
    computedOrder: idx,
    computedPercentage: item.computedPercentage,
  }));
}

export async function safeParseJsonResponse<T = Record<string, unknown>>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      res.status >= 400
        ? `Server returned HTTP status ${res.status}`
        : 'Server returned a non-JSON response.'
    );
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error('Unable to parse JSON payload from server.');
  }
}

export function extractGoogleDriveFileId(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  const fileMatch = /\/(?:file|document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]{8,})/.exec(
    trimmed
  );
  if (fileMatch?.[1]) return fileMatch[1];
  try {
    const parsed = new URL(trimmed);
    const idParam = parsed.searchParams.get('id');
    if (idParam && /^[a-zA-Z0-9_-]{8,}$/.test(idParam.trim())) {
      return idParam.trim();
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveResourcePreviewUrl(item: {
  sourceType?: string;
  driveUrl?: string;
  pdfUrl: string;
}): string {
  const target = getResourceTargetUrl(item);
  if (!target) return '';
  if (isGoogleDriveResource(item)) {
    const fileId = extractGoogleDriveFileId(target);
    if (fileId) {
      return `https://drive.google.com/file/d/${fileId}/preview`;
    }
  }
  return target;
}

function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function clickAnchorSafely(href: string, opts?: { downloadName?: string; newTab?: boolean }): void {
  if (typeof document === 'undefined') return;
  const anchor = document.createElement('a');
  anchor.href = href;
  if (opts?.downloadName) {
    anchor.download = opts.downloadName;
  }
  if (opts?.newTab) {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    if (anchor.parentNode) {
      anchor.parentNode.removeChild(anchor);
    }
  }, 200);
}

export async function triggerCrossBrowserResourceDownload(item: {
  title: string;
  fileName?: string;
  sourceType?: string;
  driveUrl?: string;
  pdfUrl: string;
}): Promise<void> {
  const targetUrl = getResourceTargetUrl(item);
  if (!targetUrl) {
    throw new Error('No document URL is configured for this resource.');
  }

  const safeDownloadName = sanitizeStorageFileName(item.fileName || `${item.title || 'document'}.pdf`);

  if (isGoogleDriveResource(item)) {
    const fileId = extractGoogleDriveFileId(targetUrl);
    const driveHref = fileId
      ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`
      : targetUrl;
    clickAnchorSafely(driveHref, { newTab: true });
    return;
  }

  // Same-origin /api/ PDF endpoints support ?download=1 Content-Disposition: attachment
  if (targetUrl.startsWith('/api/')) {
    const sep = targetUrl.includes('?') ? '&' : '?';
    const downloadUrl = targetUrl.includes('download=1') ? targetUrl : `${targetUrl}${sep}download=1`;
    clickAnchorSafely(downloadUrl, {
      downloadName: safeDownloadName,
      newTab: isIosBrowser(),
    });
    return;
  }

  // Cross-origin HTTPS PDF (e.g., Firebase Cloud Storage):
  // On iOS Safari, opening in a new tab invokes the native PDF viewer with "Save to Files".
  if (isIosBrowser()) {
    clickAnchorSafely(targetUrl, { newTab: true });
    return;
  }

  // On Desktop & Android browsers, try fetching as a Blob so the browser saves directly with the exact filename;
  // fall back cleanly to opening the HTTPS PDF link if CORS blocks direct fetch.
  try {
    const resp = await fetch(targetUrl, { mode: 'cors' });
    if (resp.ok) {
      const blob = await resp.blob();
      if (blob.size > 0) {
        const blobUrl = URL.createObjectURL(blob);
        clickAnchorSafely(blobUrl, { downloadName: safeDownloadName });
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 15_000);
        return;
      }
    }
  } catch {
    // Fall back to direct anchor open below
  }

  clickAnchorSafely(targetUrl, { downloadName: safeDownloadName, newTab: true });
}

export interface StudentNoteProgressItem {
  note: NoteResource;
  completed: boolean;
  lastActivityAtMs: number;
  lastAction: UserActivity['action'] | null;
}

export interface StudentExamProgressItem {
  exam: OnlineExam;
  status: 'completed' | 'in_progress' | 'pending';
  latestAttempt: ExamAttempt | null;
  completedAtMs: number;
}

export interface StudentLearningProgress {
  notesCompleted: number;
  notesTotal: number;
  notesPercentage: number;
  examsCompleted: number;
  examsInProgress: number;
  examsTotal: number;
  examsPercentage: number;
  overallCompleted: number;
  overallTotal: number;
  overallPercentage: number;
  noteItems: StudentNoteProgressItem[];
  examItems: StudentExamProgressItem[];
}

export function calculateStudentLearningProgress(params: {
  publishedNotes: NoteResource[];
  publishedExams: OnlineExam[];
  examAttempts: ExamAttempt[];
  userActivities: UserActivity[];
  subjectFilter?: string;
  gradeFilter?: string;
}): StudentLearningProgress {
  const subjectFilter = (params.subjectFilter || 'all').trim();
  const gradeFilter = (params.gradeFilter || 'all').trim();

  const matchesScope = (item: { subject: string; grade: string }): boolean => {
    if (subjectFilter !== 'all' && item.subject !== subjectFilter) {
      return false;
    }
    if (gradeFilter !== 'all' && item.grade !== gradeFilter) {
      return false;
    }
    return true;
  };

  const assignedNotes = params.publishedNotes.filter(
    (n) => n.published !== false && matchesScope(n)
  );
  const assignedExams = params.publishedExams.filter(
    (e) => e.published !== false && matchesScope(e)
  );

  // Map latest valid note completion activity by resourceId
  const noteCompletionMap = new Map<
    string,
    { lastActivityAtMs: number; lastAction: UserActivity['action'] }
  >();
  for (const act of params.userActivities) {
    if (
      act.resourceType === 'note' &&
      (act.action === 'viewed' || act.action === 'downloaded') &&
      act.resourceId
    ) {
      const existing = noteCompletionMap.get(act.resourceId);
      if (!existing || act.createdAtMs >= existing.lastActivityAtMs) {
        noteCompletionMap.set(act.resourceId, {
          lastActivityAtMs: act.createdAtMs,
          lastAction: act.action,
        });
      }
    }
  }

  // Map exam activity records by resourceId (used for Google Form exams or explicit exam submissions)
  const examActivityMap = new Map<
    string,
    { hasSubmitted: boolean; hasOpened: boolean; latestMs: number }
  >();
  for (const act of params.userActivities) {
    if (
      act.resourceType === 'exam' &&
      (act.action === 'submitted_exam' || act.action === 'opened_exam') &&
      act.resourceId
    ) {
      const prev = examActivityMap.get(act.resourceId) || {
        hasSubmitted: false,
        hasOpened: false,
        latestMs: 0,
      };
      examActivityMap.set(act.resourceId, {
        hasSubmitted: prev.hasSubmitted || act.action === 'submitted_exam',
        hasOpened: prev.hasOpened || act.action === 'opened_exam',
        latestMs: Math.max(prev.latestMs, act.createdAtMs),
      });
    }
  }

  // Group exam attempts by examId
  const attemptsByExamId = new Map<string, ExamAttempt[]>();
  for (const att of params.examAttempts) {
    if (!att.examId) continue;
    const list = attemptsByExamId.get(att.examId) || [];
    list.push(att);
    attemptsByExamId.set(att.examId, list);
  }

  const noteItems: StudentNoteProgressItem[] = assignedNotes.map((note) => {
    const match = noteCompletionMap.get(note.id);
    return {
      note,
      completed: Boolean(match),
      lastActivityAtMs: match?.lastActivityAtMs ?? 0,
      lastAction: match?.lastAction ?? null,
    };
  });

  const examItems: StudentExamProgressItem[] = assignedExams.map((exam) => {
    const attempts = (attemptsByExamId.get(exam.id) || []).slice().sort((a, b) => {
      const timeB = b.submittedAtMs || b.startedAtMs || 0;
      const timeA = a.submittedAtMs || a.startedAtMs || 0;
      return timeB - timeA;
    });

    const submittedAttempt =
      attempts.find((a) => a.status === 'graded' || a.status === 'pending_review') || null;
    const inProgressAttempt = attempts.find((a) => a.status === 'in_progress') || null;
    const activity = examActivityMap.get(exam.id);

    const isCompleted =
      exam.examMode === 'google_form'
        ? Boolean(submittedAttempt || activity?.hasSubmitted || activity?.hasOpened)
        : Boolean(submittedAttempt || activity?.hasSubmitted);

    if (isCompleted) {
      return {
        exam,
        status: 'completed',
        latestAttempt: submittedAttempt || attempts[0] || null,
        completedAtMs: submittedAttempt?.submittedAtMs || activity?.latestMs || 0,
      };
    }

    if (inProgressAttempt) {
      return {
        exam,
        status: 'in_progress',
        latestAttempt: inProgressAttempt,
        completedAtMs: 0,
      };
    }

    return {
      exam,
      status: 'pending',
      latestAttempt: null,
      completedAtMs: 0,
    };
  });

  const notesCompleted = noteItems.filter((item) => item.completed).length;
  const notesTotal = noteItems.length;
  const notesPercentage =
    notesTotal > 0 ? Math.min(100, Math.max(0, Math.round((notesCompleted / notesTotal) * 100))) : 0;

  const examsCompleted = examItems.filter((item) => item.status === 'completed').length;
  const examsInProgress = examItems.filter((item) => item.status === 'in_progress').length;
  const examsTotal = examItems.length;
  const examsPercentage =
    examsTotal > 0 ? Math.min(100, Math.max(0, Math.round((examsCompleted / examsTotal) * 100))) : 0;

  const overallCompleted = notesCompleted + examsCompleted;
  const overallTotal = notesTotal + examsTotal;
  const overallPercentage =
    overallTotal > 0
      ? Math.min(100, Math.max(0, Math.round((overallCompleted / overallTotal) * 100)))
      : 0;

  return {
    notesCompleted,
    notesTotal,
    notesPercentage,
    examsCompleted,
    examsInProgress,
    examsTotal,
    examsPercentage,
    overallCompleted,
    overallTotal,
    overallPercentage,
    noteItems,
    examItems,
  };
}


