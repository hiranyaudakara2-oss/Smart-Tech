import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  googleProvider,
  handleFirestoreError,
  isFirestoreOfflineOrTransientError,
  OperationType,
  validateFirestoreConnection,
} from '../lib/firebase';
import { safeParseJsonResponse } from '../utils/platformLogic';
import {
  clearSavedAdminSessionToken,
  getSavedAdminSessionToken,
  saveAdminSessionToken,
  syncAuthenticatedUserProfile,
  timestampToMs,
} from '../services/platformService';
import type {
  AdminRoleRecord,
  Announcement,
  AuditLogEntry,
  CustomRankBoard,
  CustomRankEntry,
  ExamAttempt,
  ExamPaper,
  ExamQuestionPublic,
  NavRoute,
  NoteResource,
  OnlineExam,
  PlatformStats,
  QuestionGradingBreakdown,
  RankBoardCategory,
  RankBoardEntry,
  RankLinkedItemType,
  ToastNotice,
  UserActivity,
  UserProfile,
} from '../types/platform';

interface PlatformContextValue {
  route: NavRoute;
  navigate: (next: NavRoute) => void;
  bootReady: boolean;
  authReady: boolean;
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  isVerifiedAdmin: boolean;
  adminServerVerified: boolean;
  verifyAdminOnServer: () => Promise<{ ok: boolean; error?: string }>;
  signInAdminWithEmailPassword: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string; providerDisabled?: boolean }>;
  signInWithGoogle: (redirectRoute?: NavRoute) => Promise<void>;
  signOutUser: () => Promise<void>;
  logoutAdminSession: () => Promise<void>;
  refreshProfileState: (partial: Partial<UserProfile>) => void;

  // Live Firestore Data
  dataLoading: boolean;
  quotaErrorUrl: string | null;
  authDomainErrorHost: string | null;
  dismissAuthDomainError: () => void;
  stats: PlatformStats;
  publishedNotes: NoteResource[];
  publishedPapers: ExamPaper[];
  publishedExams: OnlineExam[];
  publishedAnnouncements: Announcement[];
  publishedRankEntries: RankBoardEntry[];
  publishedRankBoards: CustomRankBoard[];
  publishedCustomRankEntries: CustomRankEntry[];
  refreshRankBoard: () => Promise<void>;

  // Student Private Data
  userActivities: UserActivity[];
  myExamAttempts: ExamAttempt[];
  readAnnouncementIds: Set<string>;
  unreadAnnouncementsCount: number;

  // Admin-only full collections
  allNotes: NoteResource[];
  allPapers: ExamPaper[];
  allExams: OnlineExam[];
  allAnnouncements: Announcement[];
  allExamAttempts: ExamAttempt[];
  allRankEntries: RankBoardEntry[];
  allRankBoards: CustomRankBoard[];
  allCustomRankEntries: CustomRankEntry[];
  allUsers: UserProfile[];
  allAdmins: AdminRoleRecord[];
  auditLogs: AuditLogEntry[];

  // Authoritative Server Clock
  serverNowMs: number;

  // Global Toast Notifications
  toasts: ToastNotice[];
  pushToast: (tone: ToastNotice['tone'], title: string, message?: string) => void;
  dismissToast: (id: string) => void;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

const PENDING_AUTH_ROUTE_KEY = 'smart_tech_pending_auth_route';

function isEmbeddedInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|Line\/|WhatsApp|TikTok|Snapchat|wv\)/i.test(ua);
}

function routeFromLocation(): NavRoute {
  const valid: NavRoute[] = [
    'home',
    'notes',
    'papers',
    'online-papers',
    'dashboard',
    'profile',
    'admin',
    'setup-guide',
  ];
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '');
  if (valid.includes(hash as NavRoute)) {
    return hash as NavRoute;
  }
  const pathClean = window.location.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (valid.includes(pathClean as NavRoute)) {
    return pathClean as NavRoute;
  }
  return 'home';
}

function mapDocToNote(id: string, d: Record<string, unknown>): NoteResource {
  return {
    id,
    title: String(d.title || ''),
    subject: String(d.subject || ''),
    grade: String(d.grade || ''),
    description: String(d.description || ''),
    tags: Array.isArray(d.tags) ? d.tags.map((t) => String(t)) : [],
    sourceType: d.sourceType === 'drive' ? 'drive' : 'pdf',
    driveUrl: String(d.driveUrl || ''),
    pdfUrl: String(d.pdfUrl || ''),
    storagePath: String(d.storagePath || ''),
    fileName: String(d.fileName || ''),
    fileSize: Number(d.fileSize || 0),
    thumbnailUrl: String(d.thumbnailUrl || ''),
    published: Boolean(d.published),
    authorId: String(d.authorId || ''),
    createdAtMs: timestampToMs(d.createdAt),
    updatedAtMs: timestampToMs(d.updatedAt),
  };
}

function mapDocToPaper(id: string, d: Record<string, unknown>): ExamPaper {
  return {
    id,
    title: String(d.title || ''),
    subject: String(d.subject || ''),
    category: String(d.category || d.examType || 'Past Paper'),
    year: Number(d.year || new Date().getFullYear()),
    grade: String(d.grade || ''),
    examType: String(d.examType || ''),
    language: String(d.language || ''),
    description: String(d.description || ''),
    fileFormat: 'PDF',
    sourceType: d.sourceType === 'drive' ? 'drive' : 'pdf',
    driveUrl: String(d.driveUrl || ''),
    pdfUrl: String(d.pdfUrl || ''),
    storagePath: String(d.storagePath || ''),
    fileName: String(d.fileName || ''),
    fileSize: Number(d.fileSize || 0),
    published: Boolean(d.published),
    authorId: String(d.authorId || ''),
    createdAtMs: timestampToMs(d.createdAt),
    updatedAtMs: timestampToMs(d.updatedAt),
  };
}

function mapDocToExam(id: string, d: Record<string, unknown>): OnlineExam {
  const examMode = d.examMode === 'native' ? 'native' : 'google_form';
  const rawQuestions = Array.isArray(d.questions) ? (d.questions as ExamQuestionPublic[]) : [];
  return {
    id,
    title: String(d.title || ''),
    subject: String(d.subject || ''),
    grade: String(d.grade || ''),
    description: String(d.description || ''),
    instructions: String(d.instructions || ''),
    opensAtMs: timestampToMs(d.opensAt),
    closesAtMs: timestampToMs(d.closesAt),
    timezone: 'Asia/Colombo',
    examMode,
    durationMinutes: Number(d.durationMinutes || 30),
    totalMarks: Number(d.totalMarks || 100),
    passingMarks: Number(d.passingMarks || 50),
    maxAttempts: Math.max(1, Number(d.maxAttempts || 1)),
    questionCount: Number(d.questionCount ?? rawQuestions.length),
    questions: rawQuestions,
    showExplanations: Boolean(d.showExplanations ?? true),
    resultsPublished: Boolean(d.resultsPublished ?? false),
    rankBoardPublished: Boolean(d.rankBoardPublished ?? false),
    anonymizeRankBoard: Boolean(d.anonymizeRankBoard ?? false),
    accessCodeProtected: Boolean(d.accessCodeProtected ?? examMode === 'native'),
    published: Boolean(d.published),
    authorId: String(d.authorId || ''),
    createdAtMs: timestampToMs(d.createdAt),
    updatedAtMs: timestampToMs(d.updatedAt),
  };
}

function mapDocToAnnouncement(id: string, d: Record<string, unknown>): Announcement {
  const category = (d.category as Announcement['category']) || 'General Notice';
  return {
    id,
    title: String(d.title || ''),
    body: String(d.body || ''),
    category,
    priority: (d.priority as Announcement['priority']) || 'normal',
    isImportant: Boolean(d.isImportant ?? category === 'Important Announcement'),
    imageUrl: String(d.imageUrl || ''),
    publishedAtMs: d.publishedAt ? timestampToMs(d.publishedAt) : timestampToMs(d.createdAt),
    published: Boolean(d.published),
    authorId: String(d.authorId || ''),
    authorName: String(d.authorName || 'Administrator'),
    createdAtMs: timestampToMs(d.createdAt),
    updatedAtMs: timestampToMs(d.updatedAt),
  };
}

function mapDocToAttempt(id: string, d: Record<string, unknown>): ExamAttempt {
  return {
    id,
    examId: String(d.examId || ''),
    examTitle: String(d.examTitle || ''),
    subject: String(d.subject || ''),
    userId: String(d.userId || ''),
    studentName: String(d.studentName || ''),
    studentEmail: String(d.studentEmail || ''),
    attemptNumber: Number(d.attemptNumber || 1),
    status:
      d.status === 'graded' || d.status === 'pending_review' ? d.status : 'in_progress',
    answers:
      d.answers && typeof d.answers === 'object'
        ? (d.answers as Record<string, string>)
        : {},
    marksObtained: Number(d.marksObtained || 0),
    totalMarks: Math.max(1, Number(d.totalMarks || 100)),
    percentage: Number(d.percentage || 0),
    passed: Boolean(d.passed),
    resultsPublished: Boolean(d.resultsPublished),
    reviewBreakdown: Array.isArray(d.reviewBreakdown)
      ? (d.reviewBreakdown as QuestionGradingBreakdown[])
      : [],
    serverReceipt: String(d.serverReceipt || ''),
    startedAtMs: timestampToMs(d.startedAt),
    expiresAtMs: timestampToMs(d.expiresAt),
    submittedAtMs: timestampToMs(d.submittedAt),
    updatedAtMs: timestampToMs(d.updatedAt),
  };
}

function mapDocToRankEntry(id: string, d: Record<string, unknown>): RankBoardEntry {
  const anonymizeNames = Boolean(d.anonymizeNames);
  const anonymizedCode = String(d.anonymizedCode || 'CAND-000000');
  const rawName = String(d.studentDisplayName || anonymizedCode);
  return {
    id,
    examId: String(d.examId || ''),
    examTitle: String(d.examTitle || ''),
    subject: String(d.subject || ''),
    attemptId: String(d.attemptId || ''),
    rankPosition: Number(d.rankPosition || 1),
    studentDisplayName: anonymizeNames ? anonymizedCode : rawName,
    anonymizedCode,
    anonymizeNames,
    marksObtained: Number(d.marksObtained || 0),
    totalMarks: Math.max(1, Number(d.totalMarks || 100)),
    percentage: Number(d.percentage || 0),
    passed: Boolean(d.passed),
    isFinalized: Boolean(d.isFinalized ?? true),
    published: Boolean(d.published),
    serverReceipt: String(d.serverReceipt || ''),
    updatedAtMs: timestampToMs(d.updatedAt),
  };
}

function mapDocToCustomRankBoard(id: string, d: Record<string, unknown>): CustomRankBoard {
  const validCategories: RankBoardCategory[] = [
    'Subject',
    'Examination',
    'Past Paper',
    'Class',
    'Competition',
  ];
  const rawCategory = String(d.category || 'Examination') as RankBoardCategory;
  const rawLinkType = String(d.linkedItemType || 'none') as RankLinkedItemType;
  return {
    id,
    title: String(d.title || ''),
    category: validCategories.includes(rawCategory) ? rawCategory : 'Examination',
    subject: String(d.subject || ''),
    targetGroup: String(d.targetGroup || ''),
    description: String(d.description || ''),
    rankingMode: d.rankingMode === 'manual' ? 'manual' : 'auto',
    linkedItemType:
      rawLinkType === 'paper' || rawLinkType === 'exam' || rawLinkType === 'note'
        ? rawLinkType
        : 'none',
    linkedItemId: String(d.linkedItemId || ''),
    linkedItemTitle: String(d.linkedItemTitle || ''),
    published: Boolean(d.published),
    authorId: String(d.authorId || ''),
    createdAtMs: timestampToMs(d.createdAt),
    updatedAtMs: timestampToMs(d.updatedAt),
  };
}

function mapDocToCustomRankEntry(id: string, d: Record<string, unknown>): CustomRankEntry {
  const validCategories: RankBoardCategory[] = [
    'Subject',
    'Examination',
    'Past Paper',
    'Class',
    'Competition',
  ];
  const rawCategory = String(d.boardCategory || 'Examination') as RankBoardCategory;
  const rawLinkType = String(d.linkedItemType || 'none') as RankLinkedItemType;
  return {
    id,
    boardId: String(d.boardId || ''),
    boardTitle: String(d.boardTitle || ''),
    boardCategory: validCategories.includes(rawCategory) ? rawCategory : 'Examination',
    boardPublished: Boolean(d.boardPublished),
    studentName: String(d.studentName || ''),
    marks: Number(d.marks || 0),
    maxMarks: Math.max(1, Number(d.maxMarks || 100)),
    percentage: Number(d.percentage || 0),
    rankPosition: Math.max(1, Number(d.rankPosition || 1)),
    isManualRank: Boolean(d.isManualRank),
    displayOrder: Number(d.displayOrder ?? 0),
    subject: String(d.subject || ''),
    linkedItemType:
      rawLinkType === 'paper' || rawLinkType === 'exam' || rawLinkType === 'note'
        ? rawLinkType
        : 'none',
    linkedItemId: String(d.linkedItemId || ''),
    linkedItemTitle: String(d.linkedItemTitle || ''),
    authorId: String(d.authorId || ''),
    createdAtMs: timestampToMs(d.createdAt),
    updatedAtMs: timestampToMs(d.updatedAt),
  };
}

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<NavRoute>(() => routeFromLocation());
  const [bootReady, setBootReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isVerifiedAdmin, setIsVerifiedAdmin] = useState(false);
  const [adminServerVerified, setAdminServerVerified] = useState(false);

  const [dataLoading, setDataLoading] = useState(true);
  const [quotaErrorUrl, setQuotaErrorUrl] = useState<string | null>(null);
  const [authDomainErrorHost, setAuthDomainErrorHost] = useState<string | null>(null);

  const [rawStats, setRawStats] = useState<PlatformStats | null>(null);
  const [publishedNotes, setPublishedNotes] = useState<NoteResource[]>([]);
  const [publishedPapers, setPublishedPapers] = useState<ExamPaper[]>([]);
  const [publishedExams, setPublishedExams] = useState<OnlineExam[]>([]);
  const [publishedAnnouncements, setPublishedAnnouncements] = useState<Announcement[]>([]);
  const [firestoreRankEntries, setFirestoreRankEntries] = useState<RankBoardEntry[]>([]);
  const [serverRankEntries, setServerRankEntries] = useState<RankBoardEntry[]>([]);
  const [publishedRankBoards, setPublishedRankBoards] = useState<CustomRankBoard[]>([]);
  const [publishedCustomRankEntries, setPublishedCustomRankEntries] = useState<CustomRankEntry[]>(
    []
  );
  const [serverAttemptMetrics, setServerAttemptMetrics] = useState<{
    completed: number;
    published: number;
  }>({ completed: 0, published: 0 });

  const [userActivities, setUserActivities] = useState<UserActivity[]>([]);
  const [myExamAttempts, setMyExamAttempts] = useState<ExamAttempt[]>([]);
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<Set<string>>(new Set());

  const [allNotes, setAllNotes] = useState<NoteResource[]>([]);
  const [allPapers, setAllPapers] = useState<ExamPaper[]>([]);
  const [allExams, setAllExams] = useState<OnlineExam[]>([]);
  const [allAnnouncements, setAllAnnouncements] = useState<Announcement[]>([]);
  const [allExamAttempts, setAllExamAttempts] = useState<ExamAttempt[]>([]);
  const [allRankEntries, setAllRankEntries] = useState<RankBoardEntry[]>([]);
  const [allRankBoards, setAllRankBoards] = useState<CustomRankBoard[]>([]);
  const [allCustomRankEntries, setAllCustomRankEntries] = useState<CustomRankEntry[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allAdmins, setAllAdmins] = useState<AdminRoleRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [serverNowMs, setServerNowMs] = useState(() => Date.now());
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  const pushToast = useCallback(
    (tone: ToastNotice['tone'], title: string, message?: string) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, tone, title, message }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4800);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const inspectQuotaError = useCallback((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Quota exceeded')) {
      setQuotaErrorUrl(
        `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/databases/${FIRESTORE_DATABASE_ID}/data?openUpgradeDialog=true`
      );
    }
  }, []);

  const handleListenerError = useCallback(
    (error: unknown, operationType: OperationType, path: string) => {
      inspectQuotaError(error);
      if (isFirestoreOfflineOrTransientError(error)) {
        return;
      }
      const code = (error as { code?: string })?.code || '';
      const msg = error instanceof Error ? error.message : String(error);
      if (
        code === 'permission-denied' ||
        msg.includes('Missing or insufficient permissions')
      ) {
        try {
          handleFirestoreError(error, operationType, path);
        } catch {
          // Structured FirestoreErrorInfo logged for diagnostics without unmounting UI
        }
      }
    },
    [inspectQuotaError]
  );

  const dismissAuthDomainError = useCallback(() => {
    setAuthDomainErrorHost(null);
  }, []);

  const navigate = useCallback((next: NavRoute) => {
    setRoute(next);
    const nextHash = next === 'home' ? '#/' : `#/${next}`;
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, '', nextHash);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onPopState);
    };
  }, []);

  const refreshRankBoard = useCallback(async () => {
    try {
      const resp = await fetch('/api/rank-board');
      if (!resp.ok) return;
      const data = await safeParseJsonResponse<{
        entries?: RankBoardEntry[];
        totalCompletedAttempts?: number;
        totalPublishedResults?: number;
      }>(resp);
      if (Array.isArray(data.entries)) {
        setServerRankEntries(data.entries);
      }
      setServerAttemptMetrics({
        completed: Number(data.totalCompletedAttempts || 0),
        published: Number(data.totalPublishedResults || 0),
      });
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    refreshRankBoard();
    const interval = window.setInterval(refreshRankBoard, 30_000);
    return () => window.clearInterval(interval);
  }, [refreshRankBoard]);

  // Sync authoritative server time for Asia/Colombo exam enforcement
  useEffect(() => {
    let active = true;
    const syncClock = async () => {
      try {
        const t0 = Date.now();
        const res = await fetch('/api/server-time');
        if (!res.ok) return;
        const payload = await safeParseJsonResponse<{ serverTimeMs?: number }>(res);
        const t1 = Date.now();
        if (active && typeof payload.serverTimeMs === 'number') {
          const rttHalf = Math.round((t1 - t0) / 2);
          const offset = payload.serverTimeMs + rttHalf - t1;
          setClockOffsetMs(offset);
          setServerNowMs(Date.now() + offset);
        }
      } catch {
        // Fallback to local clock until next sync
      }
    };
    syncClock();
    const syncInterval = window.setInterval(syncClock, 60_000);
    return () => {
      active = false;
      window.clearInterval(syncInterval);
    };
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setServerNowMs(Date.now() + clockOffsetMs);
    }, 1000);
    return () => window.clearInterval(tick);
  }, [clockOffsetMs]);

  useEffect(() => {
    let settled = false;
    const finishBoot = () => {
      if (!settled) {
        settled = true;
        setBootReady(true);
      }
    };
    const guardTimer = window.setTimeout(finishBoot, 2500);
    validateFirestoreConnection().finally(() => {
      window.clearTimeout(guardTimer);
      finishBoot();
    });
    return () => window.clearTimeout(guardTimer);
  }, []);

  const verifyAdminOnServer = useCallback(
    async (): Promise<{ ok: boolean; error?: string }> => {
      const user = auth.currentUser;
      const savedToken = getSavedAdminSessionToken();
      if (!user && !savedToken) {
        return { ok: false, error: 'Authenticate with an administrator account first.' };
      }
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (user) {
          const idToken = await user.getIdToken();
          headers.Authorization = `Bearer ${idToken}`;
        }
        if (savedToken) {
          headers['X-Admin-Session'] = savedToken;
        }
        const resp = await fetch('/api/admin/verify', {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        });
        const data = await safeParseJsonResponse<{
          authorized?: boolean;
          adminSessionToken?: string;
          error?: string;
        }>(resp);
        if (resp.ok && data.authorized) {
          if (data.adminSessionToken) {
            saveAdminSessionToken(data.adminSessionToken);
          }
          setAdminServerVerified(true);
          setIsVerifiedAdmin(true);
          return { ok: true };
        }
        setAdminServerVerified(false);
        setIsVerifiedAdmin(false);
        return { ok: false, error: data.error || 'Access Denied: Unauthorized Administrator' };
      } catch {
        return { ok: false, error: 'Unable to reach server authorization service.' };
      }
    },
    []
  );

  const signInAdminWithEmailPassword = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ ok: boolean; error?: string; providerDisabled?: boolean }> => {
      const cleanEmail = (email || BOOTSTRAPPED_ADMIN_EMAIL).trim().toLowerCase();
      if (!password) {
        return { ok: false, error: 'Administrator password is required.' };
      }

      try {
        const resp = await fetch('/api/admin/credentials-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password }),
        });
        const data = await safeParseJsonResponse<{
          authorized?: boolean;
          adminSessionToken?: string;
          email?: string;
          error?: string;
        }>(resp);

        if (resp.ok && data.authorized && data.adminSessionToken) {
          saveAdminSessionToken(data.adminSessionToken);
          setAdminServerVerified(true);
          setIsVerifiedAdmin(true);

          // Also attempt Firebase Email/Password sign-in if linked in Firebase Auth,
          // unlocking full direct client-side Firestore & Storage writes on any device!
          let providerDisabled = false;
          if (
            !auth.currentUser ||
            (auth.currentUser.email || '').toLowerCase() !== BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
          ) {
            try {
              await signInWithEmailAndPassword(auth, BOOTSTRAPPED_ADMIN_EMAIL, password);
            } catch (fbErr: unknown) {
              const fbCode = (fbErr as { code?: string })?.code || '';
              if (
                fbCode === 'auth/operation-not-allowed' ||
                fbCode === 'auth/invalid-credential' ||
                fbCode === 'auth/user-not-found'
              ) {
                providerDisabled = true;
              }
            }
          }

          return { ok: true, providerDisabled };
        }

        return {
          ok: false,
          error: data.error || 'Access Denied: Incorrect administrator password.',
        };
      } catch {
        return {
          ok: false,
          error: 'Unable to reach server authentication service.',
        };
      }
    },
    []
  );

  // Recover mobile/redirect Google Sign-In results on startup
  useEffect(() => {
    getRedirectResult(auth)
      .then((cred) => {
        if (cred?.user) {
          let pendingRoute: NavRoute | null = null;
          try {
            const raw = window.localStorage.getItem(PENDING_AUTH_ROUTE_KEY);
            window.localStorage.removeItem(PENDING_AUTH_ROUTE_KEY);
            if (raw) pendingRoute = raw as NavRoute;
          } catch {
            // Ignore storage restriction
          }
          pushToast('success', 'Signed in successfully', 'Welcome back to Smart Tech.');
          if (pendingRoute) {
            navigate(pendingRoute);
          }
        }
      })
      .catch((err: unknown) => {
        const code = (err as { code?: string })?.code || '';
        if (code === 'auth/unauthorized-domain') {
          setAuthDomainErrorHost(window.location.hostname);
          pushToast(
            'error',
            'Authorize domain in Firebase Console',
            `Add "${window.location.hostname}" to Firebase Authentication → Settings → Authorized domains.`
          );
        }
      });
  }, [navigate, pushToast]);

  // Firebase Auth listener + Persistent Admin Session Restoration
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setUserProfile(null);
        setUserActivities([]);
        setMyExamAttempts([]);
        setReadAnnouncementIds(new Set());

        // Check if an active server-verified Admin Password session exists on this device
        const savedToken = getSavedAdminSessionToken();
        if (savedToken) {
          try {
            const statusResp = await fetch('/api/admin/session-status', {
              headers: { 'X-Admin-Session': savedToken },
            });
            if (statusResp.ok) {
              const statusData = await safeParseJsonResponse<{ authorized?: boolean }>(statusResp);
              if (statusData.authorized) {
                setIsVerifiedAdmin(true);
                setAdminServerVerified(true);
                setAuthReady(true);
                return;
              }
            }
          } catch {
            // Clear stale token below if invalid
          }
          clearSavedAdminSessionToken();
        }

        setIsVerifiedAdmin(false);
        setAdminServerVerified(false);
        setAuthReady(true);
        return;
      }

      try {
        const { profile, isVerifiedAdmin: verifiedAdmin } = await syncAuthenticatedUserProfile(user);
        setUserProfile(profile);
        const savedToken = getSavedAdminSessionToken();
        const isPrimaryEmail =
          (user.email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

        if (verifiedAdmin || isPrimaryEmail) {
          const idToken = await user.getIdToken();
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          };
          if (savedToken) {
            headers['X-Admin-Session'] = savedToken;
          }
          const resp = await fetch('/api/admin/verify', {
            method: 'POST',
            headers,
            body: JSON.stringify({}),
          }).catch(() => null);

          if (resp && resp.ok) {
            const payload = await safeParseJsonResponse<{
              authorized?: boolean;
              adminSessionToken?: string;
            }>(resp).catch(() => ({ authorized: false, adminSessionToken: '' }));
            if (payload.authorized) {
              if (payload.adminSessionToken) {
                saveAdminSessionToken(String(payload.adminSessionToken));
              }
              setIsVerifiedAdmin(true);
              setAdminServerVerified(true);
            } else {
              setIsVerifiedAdmin(false);
              setAdminServerVerified(false);
            }
          } else {
            setIsVerifiedAdmin(verifiedAdmin);
            setAdminServerVerified(false);
          }
        } else {
          setIsVerifiedAdmin(false);
          setAdminServerVerified(false);
        }
      } catch (err) {
        inspectQuotaError(err);
        pushToast('error', 'Profile synchronization failed', 'Please refresh and try again.');
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, [inspectQuotaError, pushToast]);

  // Public Firestore real-time listeners (safe for both visitors & students)
  useEffect(() => {
    let loadedCount = 0;
    const markPartLoaded = () => {
      loadedCount += 1;
      if (loadedCount >= 4) {
        setDataLoading(false);
      }
    };

    const loadingFallbackTimer = window.setTimeout(() => {
      setDataLoading(false);
    }, 3500);

    const unsubStats = onSnapshot(
      doc(db, 'stats', 'platform'),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setRawStats({
            totalUsers: Number(d.totalUsers || 0),
            totalNotes: Number(d.totalNotes || 0),
            totalPapers: Number(d.totalPapers || 0),
            totalPdfs: Number(d.totalPdfs || 0),
            totalExams: Number(d.totalExams || 0),
            completedAttempts: Number(d.completedAttempts || 0),
            publishedResults: Number(d.publishedResults || 0),
            updatedAtMs: timestampToMs(d.updatedAt),
          });
        } else {
          setRawStats(null);
        }
      },
      (err) => handleListenerError(err, OperationType.GET, 'stats/platform')
    );

    const unsubNotes = onSnapshot(
      query(collection(db, 'notes'), where('published', '==', true)),
      (snap) => {
        const list = snap.docs
          .map((docSnap) => mapDocToNote(docSnap.id, docSnap.data()))
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setPublishedNotes(list);
        markPartLoaded();
      },
      (err) => {
        handleListenerError(err, OperationType.LIST, 'notes');
        markPartLoaded();
      }
    );

    const unsubPapers = onSnapshot(
      query(collection(db, 'papers'), where('published', '==', true)),
      (snap) => {
        const list = snap.docs
          .map((docSnap) => mapDocToPaper(docSnap.id, docSnap.data()))
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setPublishedPapers(list);
        markPartLoaded();
      },
      (err) => {
        handleListenerError(err, OperationType.LIST, 'papers');
        markPartLoaded();
      }
    );

    const unsubExams = onSnapshot(
      query(collection(db, 'exams'), where('published', '==', true)),
      (snap) => {
        const list = snap.docs
          .map((docSnap) => mapDocToExam(docSnap.id, docSnap.data()))
          .sort((a, b) => a.opensAtMs - b.opensAtMs);
        setPublishedExams(list);
        markPartLoaded();
      },
      (err) => {
        handleListenerError(err, OperationType.LIST, 'exams');
        markPartLoaded();
      }
    );

    const unsubAnnouncements = onSnapshot(
      query(collection(db, 'announcements'), where('published', '==', true)),
      (snap) => {
        const list = snap.docs
          .map((docSnap) => mapDocToAnnouncement(docSnap.id, docSnap.data()))
          .sort((a, b) => b.publishedAtMs - a.publishedAtMs);
        setPublishedAnnouncements(list);
        markPartLoaded();
      },
      (err) => {
        handleListenerError(err, OperationType.LIST, 'announcements');
        markPartLoaded();
      }
    );

    const unsubRanks = onSnapshot(
      query(collection(db, 'rankEntries'), where('published', '==', true)),
      (snap) => {
        const list = snap.docs
          .map((docSnap) => mapDocToRankEntry(docSnap.id, docSnap.data()))
          .sort((a, b) => a.rankPosition - b.rankPosition);
        setFirestoreRankEntries(list);
      },
      (err) => handleListenerError(err, OperationType.LIST, 'rankEntries')
    );

    const unsubCustomBoards = onSnapshot(
      query(collection(db, 'rankBoards'), where('published', '==', true)),
      (snap) => {
        const list = snap.docs
          .map((docSnap) => mapDocToCustomRankBoard(docSnap.id, docSnap.data()))
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
        setPublishedRankBoards(list);
      },
      (err) => handleListenerError(err, OperationType.LIST, 'rankBoards')
    );

    const unsubCustomEntries = onSnapshot(
      query(collection(db, 'rankBoardEntries'), where('boardPublished', '==', true)),
      (snap) => {
        const list = snap.docs
          .map((docSnap) => mapDocToCustomRankEntry(docSnap.id, docSnap.data()))
          .sort((a, b) => {
            if (a.rankPosition !== b.rankPosition) return a.rankPosition - b.rankPosition;
            if (b.marks !== a.marks) return b.marks - a.marks;
            return a.displayOrder - b.displayOrder;
          });
        setPublishedCustomRankEntries(list);
      },
      (err) => handleListenerError(err, OperationType.LIST, 'rankBoardEntries')
    );

    return () => {
      window.clearTimeout(loadingFallbackTimer);
      unsubStats();
      unsubNotes();
      unsubPapers();
      unsubExams();
      unsubAnnouncements();
      unsubRanks();
      unsubCustomBoards();
      unsubCustomEntries();
    };
  }, [handleListenerError]);

  // Per-User Private Subscriptions
  useEffect(() => {
    if (!authReady || !firebaseUser || !userProfile) {
      setUserActivities([]);
      setMyExamAttempts([]);
      setReadAnnouncementIds(new Set());
      return;
    }

    const uid = firebaseUser.uid;
    const unsubAct = onSnapshot(
      query(collection(db, 'userActivities'), where('userId', '==', uid)),
      (snap) => {
        const items: UserActivity[] = snap.docs
          .map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              userId: d.userId,
              resourceId: d.resourceId,
              resourceType: d.resourceType,
              resourceTitle: d.resourceTitle,
              subject: d.subject,
              action: d.action,
              createdAtMs: timestampToMs(d.createdAt),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setUserActivities(items);
      },
      (err) => handleListenerError(err, OperationType.LIST, 'userActivities')
    );

    const unsubAttempts = onSnapshot(
      query(collection(db, 'examAttempts'), where('userId', '==', uid)),
      (snap) => {
        const items = snap.docs
          .map((docSnap) => mapDocToAttempt(docSnap.id, docSnap.data()))
          .sort((a, b) => b.submittedAtMs - a.submittedAtMs);
        setMyExamAttempts(items);
      },
      (err) => handleListenerError(err, OperationType.LIST, 'examAttempts')
    );

    const unsubReads = onSnapshot(
      query(collection(db, 'announcementReads'), where('userId', '==', uid)),
      (snap) => {
        const ids = new Set<string>();
        snap.docs.forEach((docSnap) => {
          const annId = docSnap.data()?.announcementId;
          if (typeof annId === 'string') ids.add(annId);
        });
        setReadAnnouncementIds(ids);
      },
      (err) => handleListenerError(err, OperationType.LIST, 'announcementReads')
    );

    return () => {
      unsubAct();
      unsubAttempts();
      unsubReads();
    };
  }, [authReady, firebaseUser, userProfile, handleListenerError]);

  // Verified Administrator Subscriptions
  useEffect(() => {
    if (!authReady || !isVerifiedAdmin || !adminServerVerified) {
      setAllNotes([]);
      setAllPapers([]);
      setAllExams([]);
      setAllAnnouncements([]);
      setAllExamAttempts([]);
      setAllRankEntries([]);
      setAllRankBoards([]);
      setAllCustomRankEntries([]);
      setAllUsers([]);
      setAllAdmins([]);
      setAuditLogs([]);
      return;
    }

    // If logged in via Admin Password on a device before Firebase Auth is linked,
    // mirror live published collections so the Admin Dashboard displays current resources immediately.
    if (!firebaseUser) {
      setAllNotes(publishedNotes);
      setAllPapers(publishedPapers);
      setAllExams(publishedExams);
      setAllAnnouncements(publishedAnnouncements);
      setAllRankEntries(firestoreRankEntries);
      setAllRankBoards(publishedRankBoards);
      setAllCustomRankEntries(publishedCustomRankEntries);
      return;
    }

    const uid = firebaseUser.uid;
    const isPrimaryOwner =
      (firebaseUser.email || '').toLowerCase() === 'hiranyaudakara2@gmail.com';

    const notesQ = isPrimaryOwner
      ? collection(db, 'notes')
      : query(collection(db, 'notes'), where('authorId', '==', uid));
    const papersQ = isPrimaryOwner
      ? collection(db, 'papers')
      : query(collection(db, 'papers'), where('authorId', '==', uid));
    const examsQ = isPrimaryOwner
      ? collection(db, 'exams')
      : query(collection(db, 'exams'), where('authorId', '==', uid));
    const annsQ = isPrimaryOwner
      ? collection(db, 'announcements')
      : query(collection(db, 'announcements'), where('authorId', '==', uid));
    const ranksQ = isPrimaryOwner
      ? collection(db, 'rankEntries')
      : query(collection(db, 'rankEntries'), where('authorId', '==', uid));
    const customBoardsQ = isPrimaryOwner
      ? collection(db, 'rankBoards')
      : query(collection(db, 'rankBoards'), where('authorId', '==', uid));
    const customEntriesQ = isPrimaryOwner
      ? collection(db, 'rankBoardEntries')
      : query(collection(db, 'rankBoardEntries'), where('authorId', '==', uid));

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        notesQ,
        (snap) => {
          setAllNotes(
            snap.docs
              .map((s) => mapDocToNote(s.id, s.data()))
              .sort((a, b) => b.createdAtMs - a.createdAtMs)
          );
        },
        (err) => handleListenerError(err, OperationType.LIST, 'notes')
      )
    );

    unsubs.push(
      onSnapshot(
        papersQ,
        (snap) => {
          setAllPapers(
            snap.docs
              .map((s) => mapDocToPaper(s.id, s.data()))
              .sort((a, b) => b.createdAtMs - a.createdAtMs)
          );
        },
        (err) => handleListenerError(err, OperationType.LIST, 'papers')
      )
    );

    unsubs.push(
      onSnapshot(
        examsQ,
        (snap) => {
          setAllExams(
            snap.docs
              .map((s) => mapDocToExam(s.id, s.data()))
              .sort((a, b) => b.createdAtMs - a.createdAtMs)
          );
        },
        (err) => handleListenerError(err, OperationType.LIST, 'exams')
      )
    );

    unsubs.push(
      onSnapshot(
        annsQ,
        (snap) => {
          setAllAnnouncements(
            snap.docs
              .map((s) => mapDocToAnnouncement(s.id, s.data()))
              .sort((a, b) => b.createdAtMs - a.createdAtMs)
          );
        },
        (err) => handleListenerError(err, OperationType.LIST, 'announcements')
      )
    );

    unsubs.push(
      onSnapshot(
        ranksQ,
        (snap) => {
          setAllRankEntries(
            snap.docs
              .map((s) => mapDocToRankEntry(s.id, s.data()))
              .sort((a, b) => a.rankPosition - b.rankPosition)
          );
        },
        (err) => handleListenerError(err, OperationType.LIST, 'rankEntries')
      )
    );

    unsubs.push(
      onSnapshot(
        customBoardsQ,
        (snap) => {
          setAllRankBoards(
            snap.docs
              .map((s) => mapDocToCustomRankBoard(s.id, s.data()))
              .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
          );
        },
        (err) => handleListenerError(err, OperationType.LIST, 'rankBoards')
      )
    );

    unsubs.push(
      onSnapshot(
        customEntriesQ,
        (snap) => {
          setAllCustomRankEntries(
            snap.docs
              .map((s) => mapDocToCustomRankEntry(s.id, s.data()))
              .sort((a, b) => {
                if (a.rankPosition !== b.rankPosition) return a.rankPosition - b.rankPosition;
                if (b.marks !== a.marks) return b.marks - a.marks;
                return a.displayOrder - b.displayOrder;
              })
          );
        },
        (err) => handleListenerError(err, OperationType.LIST, 'rankBoardEntries')
      )
    );

    if (isPrimaryOwner) {
      unsubs.push(
        onSnapshot(
          collection(db, 'examAttempts'),
          (snap) => {
            setAllExamAttempts(
              snap.docs
                .map((s) => mapDocToAttempt(s.id, s.data()))
                .sort((a, b) => b.submittedAtMs - a.submittedAtMs)
            );
          },
          (err) => handleListenerError(err, OperationType.LIST, 'examAttempts')
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'users'),
          (snap) => {
            setAllUsers(
              snap.docs
                .map((s) => {
                  const d = s.data();
                  return {
                    uid: d.uid,
                    displayName: d.displayName,
                    email: d.email,
                    photoURL: d.photoURL || '',
                    role: d.role === 'admin' ? ('admin' as const) : ('student' as const),
                    grade: d.grade || '',
                    createdAtMs: timestampToMs(d.createdAt),
                    lastLoginAtMs: timestampToMs(d.lastLoginAt),
                    updatedAtMs: timestampToMs(d.updatedAt),
                  };
                })
                .sort((a, b) => b.lastLoginAtMs - a.lastLoginAtMs)
            );
          },
          (err) => handleListenerError(err, OperationType.LIST, 'users')
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'admins'),
          (snap) => {
            setAllAdmins(
              snap.docs.map((s) => {
                const d = s.data();
                return {
                  uid: d.uid,
                  email: d.email,
                  grantedBy: d.grantedBy,
                  createdAtMs: timestampToMs(d.createdAt),
                };
              })
            );
          },
          (err) => handleListenerError(err, OperationType.LIST, 'admins')
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'auditLogs'),
          (snap) => {
            setAuditLogs(
              snap.docs
                .map((s) => {
                  const d = s.data();
                  return {
                    id: s.id,
                    actorUid: d.actorUid,
                    actorEmail: d.actorEmail,
                    action: d.action,
                    targetType: d.targetType,
                    targetId: d.targetId,
                    summary: d.summary,
                    createdAtMs: timestampToMs(d.createdAt),
                  };
                })
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
                .slice(0, 80)
            );
          },
          (err) => handleListenerError(err, OperationType.LIST, 'auditLogs')
        )
      );
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [
    authReady,
    firebaseUser,
    isVerifiedAdmin,
    adminServerVerified,
    handleListenerError,
    publishedNotes,
    publishedPapers,
    publishedExams,
    publishedAnnouncements,
    firestoreRankEntries,
    publishedRankBoards,
    publishedCustomRankEntries,
  ]);

  const signInWithGoogle = useCallback(
    async (redirectRoute?: NavRoute) => {
      setAuthDomainErrorHost(null);
      const targetRoute: NavRoute =
        redirectRoute ||
        (route === 'online-papers' || route === 'admin' ? route : 'dashboard');

      try {
        window.localStorage.setItem(PENDING_AUTH_ROUTE_KEY, targetRoute);
      } catch {
        // Ignore storage restriction
      }

      // Embedded in-app social webviews block window.open popups; use redirect flow directly
      if (isEmbeddedInAppBrowser()) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirErr: unknown) {
          const rCode = (redirErr as { code?: string })?.code || '';
          if (rCode === 'auth/unauthorized-domain') {
            setAuthDomainErrorHost(window.location.hostname);
            pushToast(
              'error',
              'Netlify domain not authorized yet in Firebase',
              `Add "${window.location.hostname}" in Firebase Console → Authentication → Settings → Authorized domains.`
            );
            return;
          }
        }
      }

      try {
        await signInWithPopup(auth, googleProvider);
        try {
          window.localStorage.removeItem(PENDING_AUTH_ROUTE_KEY);
        } catch {
          // Ignore
        }
        pushToast(
          'success',
          'Signed in successfully',
          redirectRoute === 'admin'
            ? 'Verifying administrator session.'
            : 'Welcome to Smart Tech.'
        );
        if (redirectRoute) {
          navigate(redirectRoute);
        } else if (route !== 'online-papers' && route !== 'admin') {
          navigate('dashboard');
        }
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code || '';
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          pushToast('info', 'Sign-in cancelled', 'You can continue browsing public resources anytime.');
          return;
        }
        if (code === 'auth/unauthorized-domain') {
          setAuthDomainErrorHost(window.location.hostname);
          pushToast(
            'error',
            'Authorize domain in Firebase Console',
            `Add "${window.location.hostname}" under Firebase Authentication → Settings → Authorized domains.`
          );
          return;
        }
        if (
          code === 'auth/popup-blocked' ||
          code === 'auth/operation-not-supported-in-this-environment' ||
          code === 'auth/web-storage-unsupported'
        ) {
          try {
            pushToast('info', 'Redirecting to Google Sign-In', 'Opening browser-compatible login...');
            await signInWithRedirect(auth, googleProvider);
            return;
          } catch (fallbackErr: unknown) {
            const fbCode = (fallbackErr as { code?: string })?.code || '';
            if (fbCode === 'auth/unauthorized-domain') {
              setAuthDomainErrorHost(window.location.hostname);
              pushToast(
                'error',
                'Authorize domain in Firebase Console',
                `Add "${window.location.hostname}" under Firebase Authentication → Settings → Authorized domains.`
              );
              return;
            }
          }
        }
        if (code === 'auth/network-request-failed') {
          pushToast('error', 'Network connection issue', 'Check your internet connection and retry.');
          return;
        }
        pushToast(
          'error',
          'Google Sign-In could not complete',
          'Check browser popup permissions or verify Authorized Domains in Setup Guide.'
        );
      }
    },
    [navigate, pushToast, route]
  );

  const signOutUser = useCallback(async () => {
    try {
      const sessionToken = getSavedAdminSessionToken();
      if (sessionToken) {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminSessionToken: sessionToken }),
        }).catch(() => undefined);
        clearSavedAdminSessionToken();
      }
      setIsVerifiedAdmin(false);
      setAdminServerVerified(false);
      await signOut(auth);
      pushToast('info', 'Signed out securely', 'Your session has been closed.');
      navigate('home');
    } catch {
      pushToast('error', 'Sign-out failed', 'Please try again.');
    }
  }, [navigate, pushToast]);

  const logoutAdminSession = useCallback(async () => {
    try {
      const sessionToken = getSavedAdminSessionToken();
      if (sessionToken) {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminSessionToken: sessionToken }),
        }).catch(() => undefined);
        clearSavedAdminSessionToken();
      }
      setIsVerifiedAdmin(false);
      setAdminServerVerified(false);
      await signOut(auth);
      pushToast('info', 'Administrator logged out', 'Your privileged session has been closed.');
      navigate('admin');
    } catch {
      pushToast('error', 'Logout failed', 'Please try again.');
    }
  }, [navigate, pushToast]);

  const refreshProfileState = useCallback((partial: Partial<UserProfile>) => {
    setUserProfile((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  // Merge Firestore published rank entries with verified server ledger entries without duplicates
  const publishedRankEntries: RankBoardEntry[] = useMemo(() => {
    const byAttempt = new Map<string, RankBoardEntry>();
    for (const item of serverRankEntries) {
      byAttempt.set(`${item.examId}:${item.attemptId}`, item);
    }
    for (const item of firestoreRankEntries) {
      byAttempt.set(`${item.examId}:${item.attemptId}`, item);
    }
    return Array.from(byAttempt.values()).sort((a, b) => {
      if (a.examId !== b.examId) return b.updatedAtMs - a.updatedAtMs;
      return a.rankPosition - b.rankPosition;
    });
  }, [firestoreRankEntries, serverRankEntries]);

  // Derive live statistics directly from real Firestore records + server verified counters
  const stats: PlatformStats = useMemo(() => {
    const totalNotes = publishedNotes.length;
    const totalPapers = publishedPapers.length;
    const totalExams = publishedExams.length;
    const totalPdfs = totalNotes + totalPapers;
    const totalUsers = Math.max(
      rawStats?.totalUsers ?? 0,
      allUsers.length,
      userProfile ? 1 : 0
    );
    const completedAttempts = Math.max(
      rawStats?.completedAttempts ?? 0,
      allExamAttempts.filter((a) => a.status !== 'in_progress').length,
      serverAttemptMetrics.completed
    );
    const publishedResults = Math.max(
      rawStats?.publishedResults ?? 0,
      publishedRankEntries.length + publishedCustomRankEntries.length,
      serverAttemptMetrics.published + publishedCustomRankEntries.length
    );
    return {
      totalUsers,
      totalNotes,
      totalPapers,
      totalPdfs,
      totalExams,
      completedAttempts,
      publishedResults,
      updatedAtMs: rawStats?.updatedAtMs || Date.now(),
    };
  }, [
    rawStats,
    publishedNotes.length,
    publishedPapers.length,
    publishedExams.length,
    allUsers.length,
    userProfile,
    allExamAttempts,
    serverAttemptMetrics,
    publishedRankEntries.length,
    publishedCustomRankEntries.length,
  ]);

  const unreadAnnouncementsCount = useMemo(() => {
    if (!firebaseUser) return publishedAnnouncements.length;
    return publishedAnnouncements.filter((a) => !readAnnouncementIds.has(a.id)).length;
  }, [firebaseUser, publishedAnnouncements, readAnnouncementIds]);

  const value: PlatformContextValue = {
    route,
    navigate,
    bootReady,
    authReady,
    firebaseUser,
    userProfile,
    isVerifiedAdmin,
    adminServerVerified,
    verifyAdminOnServer,
    signInAdminWithEmailPassword,
    signInWithGoogle,
    signOutUser,
    logoutAdminSession,
    refreshProfileState,
    dataLoading,
    quotaErrorUrl,
    authDomainErrorHost,
    dismissAuthDomainError,
    stats,
    publishedNotes,
    publishedPapers,
    publishedExams,
    publishedAnnouncements,
    publishedRankEntries,
    publishedRankBoards,
    publishedCustomRankEntries,
    refreshRankBoard,
    userActivities,
    myExamAttempts,
    readAnnouncementIds,
    unreadAnnouncementsCount,
    allNotes,
    allPapers,
    allExams,
    allAnnouncements,
    allExamAttempts,
    allRankEntries,
    allRankBoards,
    allCustomRankEntries,
    allUsers,
    allAdmins,
    auditLogs,
    serverNowMs,
    toasts,
    pushToast,
    dismissToast,
  };

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error('usePlatform must be used inside PlatformProvider');
  }
  return ctx;
}
