export type NavRoute =
  | 'home'
  | 'notes'
  | 'papers'
  | 'online-papers'
  | 'dashboard'
  | 'profile'
  | 'admin'
  | 'setup-guide';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  role: 'student' | 'admin';
  grade?: string;
  createdAtMs: number;
  lastLoginAtMs: number;
  updatedAtMs: number;
}

export interface PlatformStats {
  totalUsers: number;
  totalNotes: number;
  totalPapers: number;
  totalPdfs: number;
  totalExams: number;
  completedAttempts?: number;
  publishedResults?: number;
  updatedAtMs: number;
}

export type ResourceSourceType = 'drive' | 'pdf';

export interface NoteResource {
  id: string;
  title: string;
  subject: string;
  grade: string;
  description: string;
  tags: string[];
  sourceType?: ResourceSourceType;
  driveUrl?: string;
  pdfUrl: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  thumbnailUrl: string;
  published: boolean;
  authorId: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ExamPaper {
  id: string;
  title: string;
  subject: string;
  category: string;
  year: number;
  grade: string;
  examType: string;
  language: string;
  description: string;
  fileFormat: 'PDF';
  sourceType?: ResourceSourceType;
  driveUrl?: string;
  pdfUrl: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  published: boolean;
  authorId: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type QuestionType = 'mcq' | 'true_false' | 'short_answer';

export interface ExamQuestionPublic {
  id: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  marks: number;
}

export interface ExamQuestionFull extends ExamQuestionPublic {
  correctOptionIndex?: number;
  correctBoolean?: boolean;
  sampleAnswer?: string;
  explanation?: string;
}

export interface OnlineExam {
  id: string;
  title: string;
  subject: string;
  grade: string;
  description: string;
  instructions: string;
  opensAtMs: number;
  closesAtMs: number;
  timezone: 'Asia/Colombo';
  examMode: 'native' | 'google_form';
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number;
  maxAttempts: number;
  questionCount: number;
  questions: ExamQuestionPublic[];
  showExplanations: boolean;
  resultsPublished: boolean;
  rankBoardPublished: boolean;
  anonymizeRankBoard: boolean;
  accessCodeProtected: boolean;
  published: boolean;
  authorId: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type ExamAttemptStatus = 'in_progress' | 'pending_review' | 'graded';

export interface QuestionGradingBreakdown {
  questionId: string;
  prompt: string;
  type: QuestionType;
  studentAnswer: string;
  correctAnswerLabel: string;
  explanation: string;
  marksAwarded: number;
  maxMarks: number;
  isCorrect: boolean | null;
}

export interface ExamAttempt {
  id: string;
  examId: string;
  examTitle: string;
  subject: string;
  userId: string;
  studentName: string;
  studentEmail: string;
  attemptNumber: number;
  status: ExamAttemptStatus;
  answers: Record<string, string>;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  passed: boolean;
  resultsPublished: boolean;
  reviewBreakdown?: QuestionGradingBreakdown[];
  serverReceipt: string;
  startedAtMs: number;
  expiresAtMs: number;
  submittedAtMs: number;
  updatedAtMs: number;
}

export interface RankBoardEntry {
  id: string;
  examId: string;
  examTitle: string;
  subject: string;
  attemptId: string;
  rankPosition: number;
  studentDisplayName: string;
  anonymizedCode: string;
  anonymizeNames: boolean;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  passed: boolean;
  isFinalized: boolean;
  published: boolean;
  serverReceipt: string;
  updatedAtMs: number;
}

export type RankBoardCategory =
  | 'Subject'
  | 'Examination'
  | 'Past Paper'
  | 'Class'
  | 'Competition';

export type RankLinkedItemType = 'none' | 'paper' | 'exam' | 'note';

export interface CustomRankBoard {
  id: string;
  title: string;
  category: RankBoardCategory;
  subject: string;
  targetGroup: string;
  description: string;
  rankingMode: 'auto' | 'manual';
  linkedItemType: RankLinkedItemType;
  linkedItemId: string;
  linkedItemTitle: string;
  published: boolean;
  authorId: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface CustomRankEntry {
  id: string;
  boardId: string;
  boardTitle: string;
  boardCategory: RankBoardCategory;
  boardPublished: boolean;
  studentName: string;
  marks: number;
  maxMarks: number;
  percentage: number;
  rankPosition: number;
  isManualRank: boolean;
  displayOrder: number;
  subject: string;
  linkedItemType: RankLinkedItemType;
  linkedItemId: string;
  linkedItemTitle: string;
  authorId: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export type AnnouncementCategory =
  | 'General Notice'
  | 'Exam Notice'
  | 'New Upload'
  | 'Important Announcement';

export type AnnouncementPriority = 'normal' | 'high' | 'urgent';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  isImportant: boolean;
  imageUrl: string;
  publishedAtMs: number;
  published: boolean;
  authorId: string;
  authorName: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface UserActivity {
  id: string;
  userId: string;
  resourceId: string;
  resourceType: 'note' | 'paper' | 'exam';
  resourceTitle: string;
  subject: string;
  action: 'viewed' | 'downloaded' | 'opened_exam' | 'submitted_exam';
  createdAtMs: number;
}

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  targetType:
    | 'note'
    | 'paper'
    | 'exam'
    | 'announcement'
    | 'user'
    | 'admin'
    | 'stats'
    | 'result'
    | 'rankboard'
    | 'settings';
  targetId: string;
  summary: string;
  createdAtMs: number;
}

export interface AdminRoleRecord {
  uid: string;
  email: string;
  grantedBy: string;
  createdAtMs: number;
}

export interface ToastNotice {
  id: string;
  tone: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}
