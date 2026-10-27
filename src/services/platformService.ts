import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import type { User } from 'firebase/auth';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
  storage,
} from '../lib/firebase';
import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementPriority,
  AuditLogEntry,
  CustomRankBoard,
  CustomRankEntry,
  ExamAttempt,
  ExamAttemptStatus,
  ExamPaper,
  ExamQuestionFull,
  NoteResource,
  OnlineExam,
  QuestionGradingBreakdown,
  RankBoardCategory,
  RankLinkedItemType,
  ResourceSourceType,
  UserProfile,
} from '../types/platform';
import {
  computeCompetitionRankings,
  computeManualBoardRankings,
  generateRandomSixDigitCode,
  MAX_PDF_FILE_BYTES,
  sanitizeStorageFileName,
  validateGoogleDriveUrl,
  verifyPdfMagicBytes,
} from '../utils/platformLogic';
import { getDefaultSubjectThumbnail, VISUAL_ASSETS } from '../assets/visualCatalog';

export function timestampToMs(val: unknown): number {
  if (val instanceof Timestamp) {
    return val.toMillis();
  }
  if (val && typeof val === 'object' && 'seconds' in val) {
    return Number((val as { seconds: number }).seconds) * 1000;
  }
  if (typeof val === 'number') return val;
  return Date.now();
}

function makeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

async function getBearerHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required. Please sign in and try again.');
  }
  const idToken = await user.getIdToken();
  const sessionToken = window.sessionStorage.getItem('smart_tech_admin_session') || '';
  return {
    Authorization: `Bearer ${idToken}`,
    ...(sessionToken ? { 'X-Admin-Session': sessionToken } : {}),
    ...extra,
  };
}

export async function syncAuthenticatedUserProfile(user: User): Promise<{
  profile: UserProfile;
  isVerifiedAdmin: boolean;
}> {
  const userRef = doc(db, 'users', user.uid);
  const adminRef = doc(db, 'admins', user.uid);
  const statsRef = doc(db, 'stats', 'platform');

  let existingSnap;
  try {
    existingSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
  }

  let isInAdminsCollection = false;
  try {
    const adminSnap = await getDoc(adminRef);
    isInAdminsCollection = adminSnap.exists();
  } catch {
    isInAdminsCollection = false;
  }

  const isBootstrapped =
    Boolean(user.emailVerified) &&
    (user.email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
  const isVerifiedAdmin = isBootstrapped || (Boolean(user.emailVerified) && isInAdminsCollection);

  const safeDisplayName = (user.displayName || user.email?.split('@')[0] || 'Student').slice(0, 100);
  const safeEmail = (user.email || '').slice(0, 254);
  const safePhoto = (user.photoURL || '').slice(0, 1024);

  if (!existingSnap.exists()) {
    let statsSnap;
    try {
      statsSnap = await getDoc(statsRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'stats/platform');
    }

    const batch = writeBatch(db);
    const assignedRole: 'student' | 'admin' = isVerifiedAdmin ? 'admin' : 'student';

    batch.set(userRef, {
      uid: user.uid,
      displayName: safeDisplayName,
      email: safeEmail,
      photoURL: safePhoto,
      role: assignedRole,
      grade: 'G.C.E. A/L Technology',
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (!statsSnap.exists()) {
      batch.set(statsRef, {
        totalUsers: 1,
        totalNotes: 0,
        totalPapers: 0,
        totalPdfs: 0,
        totalExams: 0,
        updatedAt: serverTimestamp(),
      });
    } else {
      const currentUsers = Number(statsSnap.data()?.totalUsers || 0);
      batch.update(statsRef, {
        totalUsers: currentUsers + 1,
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }

    const now = Date.now();
    return {
      profile: {
        uid: user.uid,
        displayName: safeDisplayName,
        email: safeEmail,
        photoURL: safePhoto,
        role: assignedRole,
        grade: 'G.C.E. A/L Technology',
        createdAtMs: now,
        lastLoginAtMs: now,
        updatedAtMs: now,
      },
      isVerifiedAdmin,
    };
  }

  const data = existingSnap.data();
  try {
    await updateDoc(userRef, {
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
  }

  return {
    profile: {
      uid: data.uid,
      displayName: data.displayName,
      email: data.email,
      photoURL: data.photoURL || '',
      role: data.role === 'admin' ? 'admin' : 'student',
      grade: data.grade || '',
      createdAtMs: timestampToMs(data.createdAt),
      lastLoginAtMs: Date.now(),
      updatedAtMs: Date.now(),
    },
    isVerifiedAdmin,
  };
}

export async function updatePermittedUserProfile(
  uid: string,
  updates: { displayName: string; grade: string }
): Promise<void> {
  const cleanName = updates.displayName.trim().slice(0, 100);
  const cleanGrade = updates.grade.trim().slice(0, 40);
  if (cleanName.length < 1) {
    throw new Error('Display name cannot be empty.');
  }
  const userRef = doc(db, 'users', uid);
  try {
    await updateDoc(userRef, {
      displayName: cleanName,
      grade: cleanGrade,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function recordUserResourceActivity(params: {
  userId: string;
  resourceId: string;
  resourceType: 'note' | 'paper' | 'exam';
  resourceTitle: string;
  subject: string;
  action: 'viewed' | 'downloaded' | 'opened_exam' | 'submitted_exam';
}): Promise<void> {
  const activityId = makeDocId('act');
  try {
    await setDoc(doc(db, 'userActivities', activityId), {
      userId: params.userId,
      resourceId: params.resourceId,
      resourceType: params.resourceType,
      resourceTitle: params.resourceTitle.slice(0, 160),
      subject: params.subject.slice(0, 80),
      action: params.action,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `userActivities/${activityId}`);
  }
}

export async function markAnnouncementAsRead(
  userId: string,
  announcementId: string
): Promise<void> {
  const readId = `${userId}_${announcementId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  try {
    const refDoc = doc(db, 'announcementReads', readId);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) {
      await setDoc(refDoc, {
        userId,
        announcementId,
        readAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `announcementReads/${readId}`);
  }
}

async function writeAuditLog(params: {
  action: string;
  targetType: AuditLogEntry['targetType'];
  targetId: string;
  summary: string;
}): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.email) return;
  const logId = makeDocId('log');
  await setDoc(doc(db, 'auditLogs', logId), {
    actorUid: currentUser.uid,
    actorEmail: currentUser.email.slice(0, 254),
    action: params.action.slice(0, 80),
    targetType: params.targetType,
    targetId: params.targetId.slice(0, 128),
    summary: params.summary.slice(0, 500),
    createdAt: serverTimestamp(),
  });
}

export async function reconcilePlatformStats(): Promise<void> {
  const [notesSnap, papersSnap, examsSnap] = await Promise.all([
    getDocs(query(collection(db, 'notes'), where('published', '==', true))),
    getDocs(query(collection(db, 'papers'), where('published', '==', true))),
    getDocs(query(collection(db, 'exams'), where('published', '==', true))),
  ]);

  let totalUsers = 1;
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    totalUsers = usersSnap.size;
  } catch {
    const existingStats = await getDoc(doc(db, 'stats', 'platform'));
    if (existingStats.exists()) {
      totalUsers = Number(existingStats.data()?.totalUsers || 1);
    }
  }

  let completedAttempts = 0;
  let publishedResults = 0;
  try {
    const attemptsSnap = await getDocs(collection(db, 'examAttempts'));
    attemptsSnap.forEach((s) => {
      const d = s.data();
      if (d.status !== 'in_progress') completedAttempts += 1;
      if (d.status === 'graded' && d.resultsPublished === true) publishedResults += 1;
    });
  } catch {
    // Non-primary co-admin fallback
  }

  let publishedCustomEntriesCount = 0;
  try {
    const customRankSnap = await getDocs(
      query(collection(db, 'rankBoardEntries'), where('boardPublished', '==', true))
    );
    publishedCustomEntriesCount = customRankSnap.size;
  } catch {
    publishedCustomEntriesCount = 0;
  }

  const totalNotes = notesSnap.size;
  const totalPapers = papersSnap.size;
  const totalExams = examsSnap.size;
  const totalPdfs = totalNotes + totalPapers;
  publishedResults += publishedCustomEntriesCount;

  try {
    await setDoc(doc(db, 'stats', 'platform'), {
      totalUsers,
      totalNotes,
      totalPapers,
      totalPdfs,
      totalExams,
      completedAttempts,
      publishedResults,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'stats/platform');
  }
}

export async function uploadValidatedPdfFile(
  file: File,
  folder: 'notes' | 'papers',
  onProgress: (percent: number) => void
): Promise<{ pdfUrl: string; storagePath: string; fileName: string; fileSize: number }> {
  if (!file || file.size === 0) {
    throw new Error('Please select a non-empty PDF file.');
  }
  if (file.size > MAX_PDF_FILE_BYTES) {
    throw new Error('PDF file exceeds the 25 MB maximum upload limit.');
  }

  const headerSlice = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (!verifyPdfMagicBytes(headerSlice)) {
    throw new Error(
      'File signature check failed: the selected file is not a genuine binary PDF (%PDF- header required).'
    );
  }

  const cleanFileName = `${Date.now()}_${sanitizeStorageFileName(file.name)}`;
  const storagePath = `${folder}/${cleanFileName}`;

  const tryFirebaseStorage = (): Promise<{
    pdfUrl: string;
    storagePath: string;
    fileName: string;
    fileSize: number;
  }> =>
    new Promise((resolve, reject) => {
      try {
        const storageRef = ref(storage, storagePath);
        const task = uploadBytesResumable(storageRef, file, {
          contentType: 'application/pdf',
        });

        let progressed = false;
        const stallTimer = window.setTimeout(() => {
          if (!progressed) {
            task.cancel();
            reject(new Error('Storage bucket stalled or unprovisioned'));
          }
        }, 4500);

        task.on(
          'state_changed',
          (snapshot) => {
            if (snapshot.bytesTransferred > 0) {
              progressed = true;
              window.clearTimeout(stallTimer);
            }
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress(Math.min(99, Math.max(5, pct)));
          },
          (err) => {
            window.clearTimeout(stallTimer);
            reject(err);
          },
          async () => {
            window.clearTimeout(stallTimer);
            try {
              const downloadUrl = await getDownloadURL(task.snapshot.ref);
              onProgress(100);
              resolve({
                pdfUrl: downloadUrl,
                storagePath,
                fileName: cleanFileName,
                fileSize: file.size,
              });
            } catch (urlErr) {
              reject(urlErr);
            }
          }
        );
      } catch (initErr) {
        reject(initErr);
      }
    });

  try {
    return await tryFirebaseStorage();
  } catch {
    const headers = await getBearerHeaders({
      'Content-Type': 'application/pdf',
      'X-File-Name': cleanFileName,
    });

    return await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/files/upload');
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const pct = Math.round((evt.loaded / evt.total) * 100);
          onProgress(pct);
        }
      };

      xhr.onload = () => {
        try {
          const parsed = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300 && parsed.pdfUrl) {
            onProgress(100);
            resolve({
              pdfUrl: parsed.pdfUrl,
              storagePath: parsed.storagePath,
              fileName: parsed.fileName,
              fileSize: parsed.fileSize,
            });
          } else {
            reject(new Error(parsed.error || 'Server rejected PDF upload.'));
          }
        } catch {
          reject(new Error('Unexpected response from PDF upload service.'));
        }
      };

      xhr.onerror = () => reject(new Error('Network error while uploading PDF file.'));
      xhr.send(file);
    });
  }
}

export async function uploadNoticeImageFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (!file || file.size === 0) {
    throw new Error('Select a valid image file.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Notice image must not exceed 5 MB.');
  }
  const allowedMimes = ['image/png', 'image/jpeg', 'image/webp'];
  const mime = allowedMimes.includes(file.type) ? file.type : 'image/png';
  const headers = await getBearerHeaders({ 'Content-Type': mime });

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/images/upload');
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && parsed.imageUrl) {
          onProgress?.(100);
          resolve(String(parsed.imageUrl));
        } else {
          reject(new Error(parsed.error || 'Notice image upload failed.'));
        }
      } catch {
        reject(new Error('Unexpected response from image upload endpoint.'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error while uploading notice image.'));
    xhr.send(file);
  });
}

export async function deleteStoredPdfAsset(storagePath: string): Promise<void> {
  if (!storagePath) return;
  if (storagePath.startsWith('server:')) {
    const fileName = storagePath.slice('server:'.length);
    const headers = await getBearerHeaders().catch(() => null);
    if (!headers) return;
    await fetch(`/api/files/${encodeURIComponent(fileName)}`, {
      method: 'DELETE',
      headers,
    }).catch(() => undefined);
    return;
  }
  if (storagePath.startsWith('notes/') || storagePath.startsWith('papers/')) {
    await deleteObject(ref(storage, storagePath)).catch(() => undefined);
  }
}

export async function createNoteDocument(input: {
  title: string;
  subject: string;
  grade: string;
  description: string;
  tags?: string[];
  sourceType?: ResourceSourceType;
  driveUrl?: string;
  pdfUrl: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  thumbnailUrl?: string;
  published: boolean;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const noteId = makeDocId('note');
  const thumb = (input.thumbnailUrl?.trim() || getDefaultSubjectThumbnail(input.subject)).slice(0, 1000);
  const cleanTags = (input.tags || []).map((t) => t.trim().slice(0, 32)).filter(Boolean).slice(0, 10);

  const sourceType: ResourceSourceType = input.sourceType === 'drive' ? 'drive' : 'pdf';
  let cleanDriveUrl = '';
  let cleanPdfUrl = input.pdfUrl.trim().slice(0, 1500);
  let cleanStoragePath = input.storagePath.slice(0, 500);
  let cleanFileName = input.fileName.slice(0, 200) || 'document.pdf';
  let cleanFileSize = Math.max(0, Math.floor(input.fileSize));

  if (sourceType === 'drive') {
    const check = validateGoogleDriveUrl(input.driveUrl || input.pdfUrl);
    if (!check.valid) {
      throw new Error(check.error || 'Invalid Google Drive sharing link.');
    }
    cleanDriveUrl = check.normalizedUrl.slice(0, 1500);
    cleanPdfUrl = cleanDriveUrl;
    cleanStoragePath = '';
    cleanFileName = 'Google Drive Document';
    cleanFileSize = 0;
  }

  try {
    await setDoc(doc(db, 'notes', noteId), {
      title: input.title.trim().slice(0, 160),
      subject: input.subject.trim().slice(0, 80),
      grade: input.grade.trim().slice(0, 40),
      description: input.description.trim().slice(0, 2000),
      tags: cleanTags,
      sourceType,
      driveUrl: cleanDriveUrl,
      pdfUrl: cleanPdfUrl,
      storagePath: cleanStoragePath,
      fileName: cleanFileName,
      fileSize: cleanFileSize,
      thumbnailUrl: thumb,
      published: input.published,
      authorId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'CREATE_NOTE',
      targetType: 'note',
      targetId: noteId,
      summary: `Added ${sourceType === 'drive' ? 'Google Drive' : 'PDF'} note "${input.title.trim()}" (${input.subject.trim()})`,
    });
    return noteId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `notes/${noteId}`);
  }
}

export async function updateNoteDocument(
  note: NoteResource,
  updates: Partial<{
    title: string;
    subject: string;
    grade: string;
    description: string;
    tags: string[];
    sourceType: ResourceSourceType;
    driveUrl: string;
    pdfUrl: string;
    storagePath: string;
    fileName: string;
    fileSize: number;
    thumbnailUrl: string;
    published: boolean;
  }>
): Promise<void> {
  const cleanTags = (updates.tags ?? note.tags ?? [])
    .map((t) => t.trim().slice(0, 32))
    .filter(Boolean)
    .slice(0, 10);

  const nextSourceType: ResourceSourceType =
    updates.sourceType ?? note.sourceType ?? 'pdf';
  let nextDriveUrl = (updates.driveUrl ?? note.driveUrl ?? '').trim().slice(0, 1500);
  let nextPdfUrl = (updates.pdfUrl ?? note.pdfUrl).trim().slice(0, 1500);
  let nextStoragePath = (updates.storagePath ?? note.storagePath).slice(0, 500);
  let nextFileName = (updates.fileName ?? note.fileName).slice(0, 200) || 'document.pdf';
  let nextFileSize = Math.max(0, Math.floor(updates.fileSize ?? note.fileSize));

  if (nextSourceType === 'drive') {
    const check = validateGoogleDriveUrl(nextDriveUrl || nextPdfUrl);
    if (!check.valid) {
      throw new Error(check.error || 'Invalid Google Drive sharing link.');
    }
    nextDriveUrl = check.normalizedUrl.slice(0, 1500);
    nextPdfUrl = nextDriveUrl;
    nextStoragePath = '';
    nextFileName = 'Google Drive Document';
    nextFileSize = 0;
  } else {
    nextDriveUrl = '';
  }

  const nextTitle = (updates.title ?? note.title).trim().slice(0, 160);
  const nextSubject = (updates.subject ?? note.subject).trim().slice(0, 80);

  try {
    await updateDoc(doc(db, 'notes', note.id), {
      title: nextTitle,
      subject: nextSubject,
      grade: (updates.grade ?? note.grade).trim().slice(0, 40),
      description: (updates.description ?? note.description).trim().slice(0, 2000),
      tags: cleanTags,
      sourceType: nextSourceType,
      driveUrl: nextDriveUrl,
      pdfUrl: nextPdfUrl,
      storagePath: nextStoragePath,
      fileName: nextFileName,
      fileSize: nextFileSize,
      thumbnailUrl: (updates.thumbnailUrl ?? note.thumbnailUrl).slice(0, 1000),
      published: updates.published ?? note.published,
      updatedAt: serverTimestamp(),
    });
    if (nextSourceType === 'drive' && note.storagePath) {
      await deleteStoredPdfAsset(note.storagePath);
    }
    await syncLinkedRankBoardItemsOnResourceUpdate('note', note.id, nextTitle, nextSubject);
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'UPDATE_NOTE',
      targetType: 'note',
      targetId: note.id,
      summary: `Updated note "${nextTitle}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notes/${note.id}`);
  }
}

export async function deleteNoteDocument(
  note: NoteResource
): Promise<{ removedRankEntries: number }> {
  try {
    await deleteDoc(doc(db, 'notes', note.id));
    await deleteStoredPdfAsset(note.storagePath);
    const removedRankEntries = await removeLinkedRankEntriesOnResourceDelete('note', note.id);
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'DELETE_NOTE',
      targetType: 'note',
      targetId: note.id,
      summary: `Deleted note "${note.title}"${removedRankEntries > 0 ? ` and ${removedRankEntries} linked rank entries` : ''}`,
    });
    return { removedRankEntries };
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `notes/${note.id}`);
  }
}

export async function createPaperDocument(input: {
  title: string;
  subject: string;
  category?: string;
  year: number;
  grade: string;
  examType: string;
  language: string;
  description: string;
  sourceType?: ResourceSourceType;
  driveUrl?: string;
  pdfUrl: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  published: boolean;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const paperId = makeDocId('paper');

  const sourceType: ResourceSourceType = input.sourceType === 'drive' ? 'drive' : 'pdf';
  let cleanDriveUrl = '';
  let cleanPdfUrl = input.pdfUrl.trim().slice(0, 1500);
  let cleanStoragePath = input.storagePath.slice(0, 500);
  let cleanFileName = input.fileName.slice(0, 200) || 'paper.pdf';
  let cleanFileSize = Math.max(0, Math.floor(input.fileSize));

  if (sourceType === 'drive') {
    const check = validateGoogleDriveUrl(input.driveUrl || input.pdfUrl);
    if (!check.valid) {
      throw new Error(check.error || 'Invalid Google Drive sharing link.');
    }
    cleanDriveUrl = check.normalizedUrl.slice(0, 1500);
    cleanPdfUrl = cleanDriveUrl;
    cleanStoragePath = '';
    cleanFileName = 'Google Drive Document';
    cleanFileSize = 0;
  }

  try {
    await setDoc(doc(db, 'papers', paperId), {
      title: input.title.trim().slice(0, 160),
      subject: input.subject.trim().slice(0, 80),
      category: (input.category || input.examType || 'Past Paper').trim().slice(0, 60),
      year: Math.floor(input.year),
      grade: input.grade.trim().slice(0, 40),
      examType: input.examType.trim().slice(0, 60),
      language: input.language.trim().slice(0, 40),
      description: input.description.trim().slice(0, 1500),
      fileFormat: 'PDF',
      sourceType,
      driveUrl: cleanDriveUrl,
      pdfUrl: cleanPdfUrl,
      storagePath: cleanStoragePath,
      fileName: cleanFileName,
      fileSize: cleanFileSize,
      published: input.published,
      authorId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'CREATE_PAPER',
      targetType: 'paper',
      targetId: paperId,
      summary: `Added ${sourceType === 'drive' ? 'Google Drive' : 'PDF'} past paper "${input.title.trim()}" (${input.year})`,
    });
    return paperId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `papers/${paperId}`);
  }
}

export async function updatePaperDocument(
  paper: ExamPaper,
  updates: Partial<{
    title: string;
    subject: string;
    category: string;
    year: number;
    grade: string;
    examType: string;
    language: string;
    description: string;
    sourceType: ResourceSourceType;
    driveUrl: string;
    pdfUrl: string;
    storagePath: string;
    fileName: string;
    fileSize: number;
    published: boolean;
  }>
): Promise<void> {
  const nextSourceType: ResourceSourceType =
    updates.sourceType ?? paper.sourceType ?? 'pdf';
  let nextDriveUrl = (updates.driveUrl ?? paper.driveUrl ?? '').trim().slice(0, 1500);
  let nextPdfUrl = (updates.pdfUrl ?? paper.pdfUrl).trim().slice(0, 1500);
  let nextStoragePath = (updates.storagePath ?? paper.storagePath).slice(0, 500);
  let nextFileName = (updates.fileName ?? paper.fileName).slice(0, 200) || 'paper.pdf';
  let nextFileSize = Math.max(0, Math.floor(updates.fileSize ?? paper.fileSize));

  if (nextSourceType === 'drive') {
    const check = validateGoogleDriveUrl(nextDriveUrl || nextPdfUrl);
    if (!check.valid) {
      throw new Error(check.error || 'Invalid Google Drive sharing link.');
    }
    nextDriveUrl = check.normalizedUrl.slice(0, 1500);
    nextPdfUrl = nextDriveUrl;
    nextStoragePath = '';
    nextFileName = 'Google Drive Document';
    nextFileSize = 0;
  } else {
    nextDriveUrl = '';
  }

  const nextTitle = (updates.title ?? paper.title).trim().slice(0, 160);
  const nextSubject = (updates.subject ?? paper.subject).trim().slice(0, 80);

  try {
    await updateDoc(doc(db, 'papers', paper.id), {
      title: nextTitle,
      subject: nextSubject,
      category: (updates.category ?? paper.category ?? paper.examType).trim().slice(0, 60),
      year: Math.floor(updates.year ?? paper.year),
      grade: (updates.grade ?? paper.grade).trim().slice(0, 40),
      examType: (updates.examType ?? paper.examType).trim().slice(0, 60),
      language: (updates.language ?? paper.language).trim().slice(0, 40),
      description: (updates.description ?? paper.description).trim().slice(0, 1500),
      sourceType: nextSourceType,
      driveUrl: nextDriveUrl,
      pdfUrl: nextPdfUrl,
      storagePath: nextStoragePath,
      fileName: nextFileName,
      fileSize: nextFileSize,
      published: updates.published ?? paper.published,
      updatedAt: serverTimestamp(),
    });
    if (nextSourceType === 'drive' && paper.storagePath) {
      await deleteStoredPdfAsset(paper.storagePath);
    }
    await syncLinkedRankBoardItemsOnResourceUpdate('paper', paper.id, nextTitle, nextSubject);
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'UPDATE_PAPER',
      targetType: 'paper',
      targetId: paper.id,
      summary: `Updated past paper "${nextTitle}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `papers/${paper.id}`);
  }
}

export async function deletePaperDocument(
  paper: ExamPaper
): Promise<{ removedRankEntries: number }> {
  try {
    await deleteDoc(doc(db, 'papers', paper.id));
    await deleteStoredPdfAsset(paper.storagePath);
    const removedRankEntries = await removeLinkedRankEntriesOnResourceDelete('paper', paper.id);
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'DELETE_PAPER',
      targetType: 'paper',
      targetId: paper.id,
      summary: `Deleted past paper "${paper.title}"${removedRankEntries > 0 ? ` and ${removedRankEntries} linked rank entries` : ''}`,
    });
    return { removedRankEntries };
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `papers/${paper.id}`);
  }
}

// ============================================================================
// Google Forms Exam Operations (Backward-Compatible)
// ============================================================================

export async function createOnlineExamAtomic(input: {
  title: string;
  subject: string;
  grade: string;
  description: string;
  instructions: string;
  formUrl: string;
  opensAtMs: number;
  closesAtMs: number;
  published: boolean;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const examId = makeDocId('exam');

  const batch = writeBatch(db);
  batch.set(doc(db, 'exams', examId), {
    title: input.title.trim().slice(0, 160),
    subject: input.subject.trim().slice(0, 80),
    grade: input.grade.trim().slice(0, 40),
    description: input.description.trim().slice(0, 2000),
    instructions: input.instructions.trim().slice(0, 2000),
    opensAt: Timestamp.fromMillis(input.opensAtMs),
    closesAt: Timestamp.fromMillis(input.closesAtMs),
    timezone: 'Asia/Colombo',
    examMode: 'google_form',
    accessCodeProtected: false,
    published: input.published,
    authorId: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'examLinks', examId), {
    examId,
    formUrl: input.formUrl.trim().slice(0, 1500),
    authorId: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'CREATE_EXAM',
      targetType: 'exam',
      targetId: examId,
      summary: `Scheduled Google Forms exam "${input.title.trim()}"`,
    });
    return examId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `exams/${examId}`);
  }
}

export async function updateOnlineExamScheduleOrDetails(
  exam: OnlineExam,
  updates: Partial<{
    title: string;
    subject: string;
    grade: string;
    description: string;
    instructions: string;
    opensAtMs: number;
    closesAtMs: number;
    published: boolean;
    formUrl: string;
  }>
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'exams', exam.id), {
    title: (updates.title ?? exam.title).trim().slice(0, 160),
    subject: (updates.subject ?? exam.subject).trim().slice(0, 80),
    grade: (updates.grade ?? exam.grade).trim().slice(0, 40),
    description: (updates.description ?? exam.description).trim().slice(0, 2000),
    instructions: (updates.instructions ?? exam.instructions).trim().slice(0, 2000),
    opensAt: Timestamp.fromMillis(updates.opensAtMs ?? exam.opensAtMs),
    closesAt: Timestamp.fromMillis(updates.closesAtMs ?? exam.closesAtMs),
    published: updates.published ?? exam.published,
    updatedAt: serverTimestamp(),
  });

  if (updates.formUrl) {
    batch.update(doc(db, 'examLinks', exam.id), {
      formUrl: updates.formUrl.trim().slice(0, 1500),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    await syncLinkedRankBoardItemsOnResourceUpdate(
      'exam',
      exam.id,
      (updates.title ?? exam.title).trim().slice(0, 160),
      (updates.subject ?? exam.subject).trim().slice(0, 80)
    );
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'UPDATE_EXAM',
      targetType: 'exam',
      targetId: exam.id,
      summary: `Updated schedule/details for exam "${updates.title ?? exam.title}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `exams/${exam.id}`);
  }
}

// ============================================================================
// Native Interactive Online Exam Operations (6-Digit Password + Auto-Marking)
// ============================================================================

export interface NativeExamUpsertInput {
  title: string;
  subject: string;
  grade: string;
  description: string;
  instructions: string;
  opensAtMs: number;
  closesAtMs: number;
  durationMinutes: number;
  passingMarks: number;
  maxAttempts: number;
  accessCode: string;
  keepExistingCode?: boolean;
  codeRevoked?: boolean;
  showExplanations: boolean;
  resultsPublished: boolean;
  rankBoardPublished: boolean;
  anonymizeRankBoard: boolean;
  published: boolean;
  questions: ExamQuestionFull[];
}

export async function createNativeOnlineExamAtomic(input: NativeExamUpsertInput): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const examId = makeDocId('exam');

  const headers = await getBearerHeaders({ 'Content-Type': 'application/json' });
  const sealResp = await fetch('/api/admin/exams/seal', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      examId,
      accessCode: input.accessCode.trim(),
      codeRevoked: Boolean(input.codeRevoked),
      questions: input.questions,
    }),
  });

  const sealed = await sealResp.json();
  if (!sealResp.ok) {
    throw new Error(sealed.error || 'Failed to seal examination configuration on server.');
  }

  const batch = writeBatch(db);
  batch.set(doc(db, 'exams', examId), {
    title: input.title.trim().slice(0, 160),
    subject: input.subject.trim().slice(0, 80),
    grade: input.grade.trim().slice(0, 40),
    description: input.description.trim().slice(0, 2000),
    instructions: input.instructions.trim().slice(0, 2000),
    opensAt: Timestamp.fromMillis(input.opensAtMs),
    closesAt: Timestamp.fromMillis(input.closesAtMs),
    timezone: 'Asia/Colombo',
    examMode: 'native',
    durationMinutes: Math.max(1, Math.min(360, Math.floor(input.durationMinutes))),
    totalMarks: Number(sealed.totalMarks || 0),
    passingMarks: Math.max(1, Math.floor(input.passingMarks)),
    maxAttempts: Math.max(1, Math.min(10, Math.floor(input.maxAttempts))),
    questionCount: Number(sealed.questionCount || input.questions.length),
    questions: sealed.sanitizedQuestions,
    showExplanations: Boolean(input.showExplanations),
    resultsPublished: Boolean(input.resultsPublished),
    rankBoardPublished: Boolean(input.rankBoardPublished),
    anonymizeRankBoard: Boolean(input.anonymizeRankBoard),
    accessCodeProtected: true,
    published: Boolean(input.published),
    authorId: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'examConfigs', examId), {
    examId,
    codeMac: sealed.codeMac,
    sealedAccessCode: sealed.sealedAccessCode,
    codeRevoked: Boolean(sealed.codeRevoked),
    sealedAnswerKey: sealed.sealedAnswerKey,
    authorId: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    await fetch('/api/admin/rank-board/visibility', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        examId,
        examTitle: input.title.trim(),
        subject: input.subject.trim(),
        resultsPublished: input.resultsPublished,
        rankBoardPublished: input.rankBoardPublished,
        anonymizeRankBoard: input.anonymizeRankBoard,
      }),
    }).catch(() => undefined);

    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'CREATE_NATIVE_EXAM',
      targetType: 'exam',
      targetId: examId,
      summary: `Created native exam "${input.title.trim()}" (${sealed.questionCount} questions, ${sealed.totalMarks} marks)`,
    });
    return examId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `exams/${examId}`);
  }
}

export async function updateNativeOnlineExamAtomic(
  exam: OnlineExam,
  input: NativeExamUpsertInput
): Promise<void> {
  const headers = await getBearerHeaders({ 'Content-Type': 'application/json' });
  const sealResp = await fetch('/api/admin/exams/seal', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      examId: exam.id,
      accessCode: input.accessCode.trim(),
      keepExistingCode: Boolean(input.keepExistingCode),
      codeRevoked: Boolean(input.codeRevoked),
      questions: input.questions,
    }),
  });

  const sealed = await sealResp.json();
  if (!sealResp.ok) {
    throw new Error(sealed.error || 'Failed to seal updated examination configuration.');
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'exams', exam.id), {
    title: input.title.trim().slice(0, 160),
    subject: input.subject.trim().slice(0, 80),
    grade: input.grade.trim().slice(0, 40),
    description: input.description.trim().slice(0, 2000),
    instructions: input.instructions.trim().slice(0, 2000),
    opensAt: Timestamp.fromMillis(input.opensAtMs),
    closesAt: Timestamp.fromMillis(input.closesAtMs),
    examMode: 'native',
    durationMinutes: Math.max(1, Math.min(360, Math.floor(input.durationMinutes))),
    totalMarks: Number(sealed.totalMarks || 0),
    passingMarks: Math.max(1, Math.floor(input.passingMarks)),
    maxAttempts: Math.max(1, Math.min(10, Math.floor(input.maxAttempts))),
    questionCount: Number(sealed.questionCount || input.questions.length),
    questions: sealed.sanitizedQuestions,
    showExplanations: Boolean(input.showExplanations),
    resultsPublished: Boolean(input.resultsPublished),
    rankBoardPublished: Boolean(input.rankBoardPublished),
    anonymizeRankBoard: Boolean(input.anonymizeRankBoard),
    accessCodeProtected: true,
    published: Boolean(input.published),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'examConfigs', exam.id), {
    codeMac: sealed.codeMac,
    sealedAccessCode: sealed.sealedAccessCode,
    codeRevoked: Boolean(sealed.codeRevoked),
    sealedAnswerKey: sealed.sealedAnswerKey,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    await fetch('/api/admin/rank-board/visibility', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        examId: exam.id,
        examTitle: input.title.trim(),
        subject: input.subject.trim(),
        resultsPublished: input.resultsPublished,
        rankBoardPublished: input.rankBoardPublished,
        anonymizeRankBoard: input.anonymizeRankBoard,
      }),
    }).catch(() => undefined);

    await syncLinkedRankBoardItemsOnResourceUpdate(
      'exam',
      exam.id,
      input.title.trim().slice(0, 160),
      input.subject.trim().slice(0, 80)
    );
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'UPDATE_NATIVE_EXAM',
      targetType: 'exam',
      targetId: exam.id,
      summary: `Updated native exam "${input.title.trim()}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `exams/${exam.id}`);
  }
}

export async function revealNativeExamSecretConfig(examId: string): Promise<{
  accessCode: string;
  codeRevoked: boolean;
  questions: ExamQuestionFull[];
}> {
  const headers = await getBearerHeaders();
  const resp = await fetch(`/api/admin/exams/${encodeURIComponent(examId)}/reveal`, {
    headers,
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Unable to retrieve sealed examination configuration.');
  }
  return {
    accessCode: String(data.accessCode || ''),
    codeRevoked: Boolean(data.codeRevoked),
    questions: Array.isArray(data.questions) ? (data.questions as ExamQuestionFull[]) : [],
  };
}

export async function deleteOnlineExamAtomic(exam: OnlineExam): Promise<void> {
  const user = auth.currentUser;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'exams', exam.id));
  if (exam.examMode === 'native') {
    batch.delete(doc(db, 'examConfigs', exam.id));
  } else {
    batch.delete(doc(db, 'examLinks', exam.id));
  }

  // Clean up official native exam rankEntries belonging exclusively to this deleted exam
  if (user) {
    const isPrimaryOwner =
      (user.email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
    const nativeRankQuery = isPrimaryOwner
      ? query(collection(db, 'rankEntries'), where('examId', '==', exam.id))
      : query(collection(db, 'rankEntries'), where('authorId', '==', user.uid));
    const nativeSnap = await getDocs(nativeRankQuery).catch(() => null);
    nativeSnap?.forEach((docSnap) => {
      if (docSnap.data()?.examId === exam.id) {
        batch.delete(docSnap.ref);
      }
    });
  }

  try {
    await batch.commit();
    await removeLinkedRankEntriesOnResourceDelete('exam', exam.id);
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'DELETE_EXAM',
      targetType: 'exam',
      targetId: exam.id,
      summary: `Deleted online exam "${exam.title}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `exams/${exam.id}`);
  }
}

export async function fetchAuthorizedExamFormUrl(examId: string): Promise<string> {
  try {
    const snap = await getDoc(doc(db, 'examLinks', examId));
    if (!snap.exists()) {
      throw new Error('Examination form link record was not found.');
    }
    return String(snap.data()?.formUrl || '');
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
      throw new Error(
        'Access denied by server schedule policy: this examination is outside its permitted opening window.'
      );
    }
    handleFirestoreError(error, OperationType.GET, `examLinks/${examId}`);
  }
}

// ============================================================================
// Student Exam Runner Operations (Start, Auto-Save Draft, Submit)
// ============================================================================

export async function startStudentExamSession(
  exam: OnlineExam,
  accessCode: string,
  studentProfile: UserProfile
): Promise<{
  resumed: boolean;
  attemptId: string;
  attemptNumber: number;
  startedAtMs: number;
  expiresAtMs: number;
  savedAnswers: Record<string, string>;
  attemptPermit: string;
}> {
  const headers = await getBearerHeaders({ 'Content-Type': 'application/json' });
  const resp = await fetch(`/api/exams/${encodeURIComponent(exam.id)}/start`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ accessCode: accessCode.trim() }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Could not start examination session.');
  }

  const attemptId = String(data.attemptId);
  const resumed = Boolean(data.resumed);
  const attemptNumber = Number(data.attemptNumber || 1);
  const startedAtMs = Number(data.startedAtMs || Date.now());
  const expiresAtMs = Number(data.expiresAtMs || Date.now() + exam.durationMinutes * 60_000);
  const savedAnswers = (data.savedAnswers as Record<string, string>) || {};
  const attemptPermit = String(data.attemptPermit);

  if (!resumed) {
    try {
      await setDoc(doc(db, 'examAttempts', attemptId), {
        examId: exam.id,
        examTitle: exam.title.slice(0, 160),
        subject: exam.subject.slice(0, 80),
        userId: studentProfile.uid,
        studentName: studentProfile.displayName.slice(0, 100),
        studentEmail: studentProfile.email.slice(0, 254),
        attemptNumber,
        status: 'in_progress',
        answers: {},
        marksObtained: 0,
        totalMarks: Math.max(1, exam.totalMarks),
        percentage: 0,
        passed: false,
        resultsPublished: false,
        reviewBreakdown: [],
        serverReceipt: '',
        startedAt: Timestamp.fromMillis(startedAtMs),
        expiresAt: Timestamp.fromMillis(expiresAtMs),
        submittedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `examAttempts/${attemptId}`);
    }

    await recordUserResourceActivity({
      userId: studentProfile.uid,
      resourceId: exam.id,
      resourceType: 'exam',
      resourceTitle: exam.title,
      subject: exam.subject,
      action: 'opened_exam',
    }).catch(() => undefined);
  }

  return {
    resumed,
    attemptId,
    attemptNumber,
    startedAtMs,
    expiresAtMs,
    savedAnswers,
    attemptPermit,
  };
}

export async function saveStudentExamDraftAnswers(
  attemptId: string,
  answers: Record<string, string>
): Promise<void> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers).slice(0, 50)) {
    clean[k] = String(v).slice(0, 2000);
  }
  try {
    await updateDoc(doc(db, 'examAttempts', attemptId), {
      answers: clean,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal during transient network blips; localStorage remains active
  }
}

export async function submitStudentExamAttempt(params: {
  exam: OnlineExam;
  attemptId: string;
  attemptPermit: string;
  answers: Record<string, string>;
  studentProfile: UserProfile;
}): Promise<{
  status: ExamAttemptStatus;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  passed: boolean;
  resultsPublished: boolean;
  reviewBreakdown: QuestionGradingBreakdown[];
  serverReceipt: string;
}> {
  const cleanAnswers: Record<string, string> = {};
  for (const [k, v] of Object.entries(params.answers).slice(0, 50)) {
    cleanAnswers[k] = String(v).slice(0, 2000);
  }

  const headers = await getBearerHeaders({ 'Content-Type': 'application/json' });
  const resp = await fetch(`/api/exams/${encodeURIComponent(params.exam.id)}/submit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      attemptPermit: params.attemptPermit,
      answers: cleanAnswers,
      studentName: params.studentProfile.displayName,
    }),
  });

  const graded = await resp.json();
  if (!resp.ok) {
    throw new Error(graded.error || 'Examination submission could not be graded.');
  }

  try {
    await updateDoc(doc(db, 'examAttempts', params.attemptId), {
      answers: cleanAnswers,
      status: graded.status,
      marksObtained: Number(graded.marksObtained || 0),
      totalMarks: Math.max(1, Number(graded.totalMarks || params.exam.totalMarks || 1)),
      percentage: Number(graded.percentage || 0),
      passed: Boolean(graded.passed),
      resultsPublished: Boolean(graded.resultsPublished),
      reviewBreakdown: Array.isArray(graded.reviewBreakdown) ? graded.reviewBreakdown : [],
      serverReceipt: String(graded.serverReceipt || ''),
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `examAttempts/${params.attemptId}`);
  }

  await recordUserResourceActivity({
    userId: params.studentProfile.uid,
    resourceId: params.exam.id,
    resourceType: 'exam',
    resourceTitle: params.exam.title,
    subject: params.exam.subject,
    action: 'submitted_exam',
  }).catch(() => undefined);

  return {
    status: graded.status as ExamAttemptStatus,
    marksObtained: Number(graded.marksObtained || 0),
    totalMarks: Number(graded.totalMarks || params.exam.totalMarks || 1),
    percentage: Number(graded.percentage || 0),
    passed: Boolean(graded.passed),
    resultsPublished: Boolean(graded.resultsPublished),
    reviewBreakdown: Array.isArray(graded.reviewBreakdown) ? graded.reviewBreakdown : [],
    serverReceipt: String(graded.serverReceipt || ''),
  };
}

// ============================================================================
// Admin Grading, Result Publishing & Official Rank Board Synchronization
// ============================================================================

export async function gradeOrAdjustStudentAttemptByAdmin(params: {
  attempt: ExamAttempt;
  exam: OnlineExam;
  updatedBreakdown: QuestionGradingBreakdown[];
  status: ExamAttemptStatus;
  resultsPublished: boolean;
}): Promise<void> {
  const marksObtained = params.updatedBreakdown.reduce(
    (sum, item) => sum + Math.max(0, Math.min(item.maxMarks, Math.floor(item.marksAwarded))),
    0
  );
  const totalMarks = Math.max(1, params.attempt.totalMarks);
  const percentage = Math.min(100, Math.max(0, Math.round((marksObtained / totalMarks) * 100)));
  const passed = params.status === 'graded' && marksObtained >= params.exam.passingMarks;

  const headers = await getBearerHeaders({ 'Content-Type': 'application/json' });
  const signResp = await fetch('/api/admin/results/sign', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      attemptId: params.attempt.id,
      examId: params.exam.id,
      examTitle: params.exam.title,
      subject: params.exam.subject,
      userId: params.attempt.userId,
      studentName: params.attempt.studentName,
      status: params.status,
      marksObtained,
      totalMarks,
      passed,
      submittedAtMs: params.attempt.submittedAtMs,
    }),
  });

  const signed = await signResp.json();
  if (!signResp.ok) {
    throw new Error(signed.error || 'Failed to sign graded result on server.');
  }

  try {
    await updateDoc(doc(db, 'examAttempts', params.attempt.id), {
      status: params.status,
      marksObtained,
      percentage,
      passed,
      resultsPublished: params.resultsPublished,
      reviewBreakdown: params.updatedBreakdown,
      serverReceipt: String(signed.serverReceipt),
      updatedAt: serverTimestamp(),
    });
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'GRADE_ATTEMPT',
      targetType: 'result',
      targetId: params.attempt.id,
      summary: `Graded ${params.attempt.studentName} on "${params.exam.title}": ${marksObtained}/${totalMarks} (${percentage}%)`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `examAttempts/${params.attempt.id}`);
  }
}

export async function syncExamRankBoardAndPublicationByAdmin(params: {
  exam: OnlineExam;
  resultsPublished: boolean;
  rankBoardPublished: boolean;
  anonymizeRankBoard: boolean;
  allAttemptsForExam: ExamAttempt[];
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');

  const headers = await getBearerHeaders({ 'Content-Type': 'application/json' });
  await fetch('/api/admin/rank-board/visibility', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      examId: params.exam.id,
      examTitle: params.exam.title,
      subject: params.exam.subject,
      resultsPublished: params.resultsPublished,
      rankBoardPublished: params.rankBoardPublished,
      anonymizeRankBoard: params.anonymizeRankBoard,
    }),
  });

  const batch = writeBatch(db);
  batch.update(doc(db, 'exams', params.exam.id), {
    resultsPublished: params.resultsPublished,
    rankBoardPublished: params.rankBoardPublished,
    anonymizeRankBoard: params.anonymizeRankBoard,
    updatedAt: serverTimestamp(),
  });

  for (const att of params.allAttemptsForExam) {
    if (att.status !== 'in_progress' && att.resultsPublished !== params.resultsPublished) {
      batch.update(doc(db, 'examAttempts', att.id), {
        resultsPublished: params.resultsPublished,
        updatedAt: serverTimestamp(),
      });
    }
  }

  // Recompute 1, 1, 3 standard competition rankings across finalized attempts with valid receipts
  const ranked = computeCompetitionRankings(
    params.allAttemptsForExam
      .filter((a) => a.status === 'graded' && a.serverReceipt.length >= 16)
      .map((a) => ({
        attemptId: a.id,
        userId: a.userId,
        studentName: a.studentName,
        examId: a.examId,
        examTitle: params.exam.title,
        subject: params.exam.subject,
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

  // Clean up old rankEntries for this exam and write fresh ranked entries
  const existingRankSnap = await getDocs(
    query(collection(db, 'rankEntries'), where('examId', '==', params.exam.id))
  ).catch(() => null);

  const activeIds = new Set<string>();
  for (const r of ranked) {
    const entryId = `rk_${params.exam.id.slice(-16)}_${r.attemptId.slice(-24)}`.replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    );
    activeIds.add(entryId);
    batch.set(doc(db, 'rankEntries', entryId), {
      examId: params.exam.id,
      examTitle: params.exam.title.slice(0, 160),
      subject: params.exam.subject.slice(0, 80),
      attemptId: r.attemptId,
      rankPosition: r.rankPosition,
      studentDisplayName: (params.anonymizeRankBoard ? r.anonymizedCode : r.studentName).slice(
        0,
        100
      ),
      anonymizedCode: r.anonymizedCode,
      anonymizeNames: params.anonymizeRankBoard,
      marksObtained: r.marksObtained,
      totalMarks: r.totalMarks,
      percentage: r.percentage,
      passed: r.passed,
      isFinalized: true,
      published: params.rankBoardPublished,
      serverReceipt: r.serverReceipt,
      authorId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  existingRankSnap?.forEach((docSnap) => {
    if (!activeIds.has(docSnap.id)) {
      batch.delete(docSnap.ref);
    }
  });

  try {
    await batch.commit();
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'UPDATE_RANKBOARD',
      targetType: 'rankboard',
      targetId: params.exam.id,
      summary: `Updated publication & rank board for "${params.exam.title}" (Results: ${
        params.resultsPublished ? 'Published' : 'Hidden'
      }, Rank Board: ${params.rankBoardPublished ? 'Published' : 'Hidden'})`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rankEntries/${params.exam.id}`);
  }
}

// ============================================================================
// Announcements & Important Home Popup Notices
// ============================================================================

export async function createAnnouncementDocument(input: {
  title: string;
  body: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  isImportant?: boolean;
  imageUrl?: string;
  publishedAtMs?: number;
  published: boolean;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const id = makeDocId('ann');

  try {
    await setDoc(doc(db, 'announcements', id), {
      title: input.title.trim().slice(0, 160),
      body: input.body.trim().slice(0, 3000),
      category: input.category,
      priority: input.priority,
      isImportant: Boolean(input.isImportant ?? input.category === 'Important Announcement'),
      imageUrl: (input.imageUrl || '').trim().slice(0, 1500),
      publishedAt: input.publishedAtMs
        ? Timestamp.fromMillis(input.publishedAtMs)
        : serverTimestamp(),
      published: input.published,
      authorId: user.uid,
      authorName: (user.displayName || user.email || 'Administrator').slice(0, 100),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      action: 'CREATE_ANNOUNCEMENT',
      targetType: 'announcement',
      targetId: id,
      summary: `Published ${input.category}: "${input.title.trim()}"`,
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `announcements/${id}`);
  }
}

export async function updateAnnouncementDocument(
  ann: Announcement,
  updates: Partial<{
    title: string;
    body: string;
    category: AnnouncementCategory;
    priority: AnnouncementPriority;
    isImportant: boolean;
    imageUrl: string;
    publishedAtMs: number;
    published: boolean;
  }>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'announcements', ann.id), {
      title: (updates.title ?? ann.title).trim().slice(0, 160),
      body: (updates.body ?? ann.body).trim().slice(0, 3000),
      category: updates.category ?? ann.category,
      priority: updates.priority ?? ann.priority,
      isImportant: updates.isImportant ?? ann.isImportant,
      imageUrl: (updates.imageUrl ?? ann.imageUrl ?? '').trim().slice(0, 1500),
      publishedAt: Timestamp.fromMillis(updates.publishedAtMs ?? ann.publishedAtMs ?? ann.createdAtMs),
      published: updates.published ?? ann.published,
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      action: 'UPDATE_ANNOUNCEMENT',
      targetType: 'announcement',
      targetId: ann.id,
      summary: `Updated announcement "${updates.title ?? ann.title}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `announcements/${ann.id}`);
  }
}

export async function deleteAnnouncementDocument(ann: Announcement): Promise<void> {
  try {
    await deleteDoc(doc(db, 'announcements', ann.id));
    await writeAuditLog({
      action: 'DELETE_ANNOUNCEMENT',
      targetType: 'announcement',
      targetId: ann.id,
      summary: `Deleted announcement "${ann.title}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `announcements/${ann.id}`);
  }
}

// ============================================================================
// Admin Role & Security Settings Operations
// ============================================================================

export async function grantAdminPrivilege(targetUid: string, targetEmail: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Administrator authentication required.');
  const batch = writeBatch(db);
  batch.set(doc(db, 'admins', targetUid), {
    uid: targetUid,
    email: targetEmail.slice(0, 254),
    grantedBy: currentUser.uid,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', targetUid), {
    role: 'admin',
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
    await writeAuditLog({
      action: 'GRANT_ADMIN',
      targetType: 'admin',
      targetId: targetUid,
      summary: `Granted administrator role to ${targetEmail}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `admins/${targetUid}`);
  }
}

export async function revokeAdminPrivilege(targetUid: string, targetEmail: string): Promise<void> {
  if (targetEmail.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    throw new Error('The primary bootstrapped owner account cannot be revoked.');
  }
  const batch = writeBatch(db);
  batch.delete(doc(db, 'admins', targetUid));
  batch.update(doc(db, 'users', targetUid), {
    role: 'student',
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
    await writeAuditLog({
      action: 'REVOKE_ADMIN',
      targetType: 'admin',
      targetId: targetUid,
      summary: `Revoked administrator role from ${targetEmail}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `admins/${targetUid}`);
  }
}

export async function fetchAdminSecuritySettingsStatus(): Promise<{
  secondaryPassphraseActive: boolean;
  managedViaEnv: boolean;
  updatedAtMs: number | null;
  updatedByEmail: string | null;
}> {
  const headers = await getBearerHeaders();
  const resp = await fetch('/api/admin/settings/status', { headers });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Unable to load administrator security settings.');
  }
  return data;
}

export async function configureAdminSecondaryPassphrase(
  action: 'set' | 'clear',
  newPassphrase?: string
): Promise<void> {
  const headers = await getBearerHeaders({ 'Content-Type': 'application/json' });
  const resp = await fetch('/api/admin/settings/passphrase', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, newPassphrase: newPassphrase || '' }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Failed to update secondary administrator passphrase.');
  }
  await writeAuditLog({
    action: action === 'clear' ? 'CLEAR_ADMIN_PASSPHRASE' : 'SET_ADMIN_PASSPHRASE',
    targetType: 'settings',
    targetId: 'admin_passphrase',
    summary:
      action === 'clear'
        ? 'Cleared secondary server administrator passphrase'
        : 'Updated secondary server administrator passphrase',
  });
}

// ============================================================================
// Starter Curriculum & Native Exam Seeder (Admin-Triggered)
// ============================================================================

export async function seedStarterCurriculumByAdmin(): Promise<{ sampleExamCode: string }> {
  const now = Date.now();
  const sampleExamCode = generateRandomSixDigitCode();

  await createNoteDocument({
    title: 'Embedded Microcontroller Architecture & Digital Interfacing',
    subject: 'Engineering Technology',
    grade: 'Grade 13 (G.C.E. A/L)',
    description:
      'Comprehensive lecture notes covering microcontroller GPIO registers, PWM actuator control, ADC sensor conditioning, and combinational logic design.',
    tags: ['Microcontrollers', 'GPIO', 'PWM', 'ADC'],
    pdfUrl:
      '/api/curriculum-pdf/embedded-microcontrollers.pdf?title=Embedded+Microcontroller+Architecture&subject=Engineering+Technology&grade=Grade+13',
    storagePath: '',
    fileName: 'embedded-microcontrollers.pdf',
    fileSize: 482000,
    thumbnailUrl: VISUAL_ASSETS.thumbEngineeringTech,
    published: true,
  });

  await createNoteDocument({
    title: 'Precision Hydroponics, Bioreactors & Automated pH Telemetry',
    subject: 'Biosystems Technology',
    grade: 'Grade 12 (G.C.E. A/L)',
    description:
      'Structured study module on controlled-environment agriculture, dissolved oxygen sensing, nutrient dosing loops, and post-harvest quality instrumentation.',
    tags: ['Bioreactors', 'Hydroponics', 'Instrumentation'],
    pdfUrl:
      '/api/curriculum-pdf/biosystems-telemetry.pdf?title=Precision+Biosystems+Telemetry&subject=Biosystems+Technology&grade=Grade+12',
    storagePath: '',
    fileName: 'biosystems-telemetry.pdf',
    fileSize: 518000,
    thumbnailUrl: VISUAL_ASSETS.thumbBiosystemsTech,
    published: true,
  });

  await createNoteDocument({
    title: 'OSI Network Topology, Subnetting & Relational Database Normalization',
    subject: 'ICT',
    grade: 'Grade 13 (G.C.E. A/L)',
    description:
      'Complete revision guide with IPv4 CIDR calculation tables, 1NF–3NF schema decomposition examples, SQL joins, and transport-layer security fundamentals.',
    tags: ['Networking', 'CIDR', 'SQL', 'Normalization'],
    pdfUrl:
      '/api/curriculum-pdf/ict-networking-databases.pdf?title=Networking+and+Database+Systems&subject=ICT&grade=Grade+13',
    storagePath: '',
    fileName: 'ict-networking-databases.pdf',
    fileSize: 612000,
    thumbnailUrl: VISUAL_ASSETS.thumbIctSystems,
    published: true,
  });

  await createPaperDocument({
    title: 'G.C.E. Advanced Level Engineering Technology — Paper I & II',
    subject: 'Engineering Technology',
    category: 'National Past Paper',
    year: 2025,
    grade: 'Grade 13 (G.C.E. A/L)',
    examType: 'National A/L',
    language: 'English',
    description:
      'Full structured and essay examination paper covering civil, mechanical, and electrical technology units.',
    pdfUrl:
      '/api/curriculum-pdf/et-al-2025.pdf?title=GCE+AL+Engineering+Technology+2025&subject=Engineering+Technology&grade=Grade+13',
    storagePath: '',
    fileName: 'et-al-2025.pdf',
    fileSize: 740000,
    published: true,
  });

  await createPaperDocument({
    title: 'Western Province Term Evaluation — Information & Communication Technology',
    subject: 'ICT',
    category: 'Provincial Term Paper',
    year: 2025,
    grade: 'Grade 12 (G.C.E. A/L)',
    examType: 'Provincial Term Test',
    language: 'Sinhala',
    description:
      'Provincial 3-hour examination paper on Python programming, logic gates, and operating system scheduling.',
    pdfUrl:
      '/api/curriculum-pdf/ict-wp-2025.pdf?title=Western+Province+ICT+Term+Paper+2025&subject=ICT&grade=Grade+12',
    storagePath: '',
    fileName: 'ict-wp-2025.pdf',
    fileSize: 590000,
    published: true,
  });

  await createNativeOnlineExamAtomic({
    title: 'National ICT & Engineering Technology Timed Diagnostic Paper I',
    subject: 'ICT',
    grade: 'Grade 13 (G.C.E. A/L)',
    description:
      'Interactive auto-graded examination covering digital logic gates, IPv4 CIDR subnetting, database normalization, and embedded sensor interfacing.',
    instructions:
      'Enter the 6-digit examination password issued by your instructor. Once started, the server timer runs continuously and automatically submits your answers at 00:00.',
    opensAtMs: now - 15 * 60 * 1000,
    closesAtMs: now + 7 * 24 * 60 * 60 * 1000,
    durationMinutes: 25,
    passingMarks: 50,
    maxAttempts: 2,
    accessCode: sampleExamCode,
    showExplanations: true,
    resultsPublished: true,
    rankBoardPublished: true,
    anonymizeRankBoard: false,
    published: true,
    questions: [
      {
        id: 'q_logic_1',
        type: 'mcq',
        prompt: 'Which two logic gates are universally complete (capable of implementing any Boolean function)?',
        options: ['AND and OR', 'NAND and NOR', 'XOR and XNOR', 'AND and NOT'],
        marks: 20,
        correctOptionIndex: 1,
        explanation: 'Both NAND and NOR gates are universal logic gates.',
      },
      {
        id: 'q_net_2',
        type: 'mcq',
        prompt: 'How many usable host IPv4 addresses are available in a /26 subnet?',
        options: ['30', '62', '64', '126'],
        marks: 20,
        correctOptionIndex: 1,
        explanation: 'A /26 subnet leaves 6 host bits: 2^6 - 2 = 62 usable host addresses.',
      },
      {
        id: 'q_db_3',
        type: 'true_false',
        prompt: 'A relation in Second Normal Form (2NF) has no partial dependencies of non-key attributes on a composite primary key.',
        options: ['True', 'False'],
        marks: 20,
        correctBoolean: true,
        explanation: '2NF eliminates partial functional dependencies on composite candidate keys.',
      },
      {
        id: 'q_mcu_4',
        type: 'mcq',
        prompt: 'An 10-bit Analog-to-Digital Converter (ADC) maps an input voltage into how many discrete digital levels?',
        options: ['256', '512', '1024', '4096'],
        marks: 20,
        correctOptionIndex: 2,
        explanation: 'A 10-bit ADC provides 2^10 = 1,024 quantization levels (0 to 1023).',
      },
      {
        id: 'q_os_5',
        type: 'true_false',
        prompt: 'UDP guarantees in-order packet delivery and automatic retransmission at the transport layer.',
        options: ['True', 'False'],
        marks: 20,
        correctBoolean: false,
        explanation: 'UDP is connectionless and unreliable; TCP provides sequencing and retransmission.',
      },
    ],
  });

  await createAnnouncementDocument({
    title: '2026 Smart Tech Online Examination Schedule & Official Rank Board Activated',
    body: 'Students can now sit interactive timed online examinations using the 6-digit examination password provided by their instructor, receive instant automatic marking on objective papers, and view verified standings on the Official Rank Board.',
    category: 'Important Announcement',
    priority: 'urgent',
    isImportant: true,
    published: true,
  });

  return { sampleExamCode };
}

// ============================================================================
// Dynamic & Manual Rank Board Operations + Linked Item Cascading Sync
// ============================================================================

function isCurrentUserPrimaryOwner(): boolean {
  const email = auth.currentUser?.email || '';
  return email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
}

export async function recalculateCustomRankBoard(boardId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !boardId) return;

  let boardSnap;
  try {
    boardSnap = await getDoc(doc(db, 'rankBoards', boardId));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `rankBoards/${boardId}`);
  }
  if (!boardSnap || !boardSnap.exists()) return;

  const boardData = boardSnap.data();
  const rankingMode: 'auto' | 'manual' =
    boardData.rankingMode === 'manual' ? 'manual' : 'auto';
  const boardTitle = String(boardData.title || '').slice(0, 160);
  const boardCategory = (boardData.category as RankBoardCategory) || 'Examination';
  const boardPublished = Boolean(boardData.published);

  const entriesQuery = isCurrentUserPrimaryOwner()
    ? query(collection(db, 'rankBoardEntries'), where('boardId', '==', boardId))
    : query(collection(db, 'rankBoardEntries'), where('authorId', '==', user.uid));

  let entriesSnap;
  try {
    entriesSnap = await getDocs(entriesQuery);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'rankBoardEntries');
  }

  const rawEntries = (entriesSnap?.docs || [])
    .filter((d) => d.data()?.boardId === boardId)
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        marks: Number(data.marks || 0),
        maxMarks: Math.max(1, Number(data.maxMarks || 100)),
        percentage: Number(data.percentage || 0),
        rankPosition: Math.max(1, Number(data.rankPosition || 1)),
        isManualRank: Boolean(data.isManualRank),
        displayOrder: Number(data.displayOrder ?? 0),
        boardTitle: String(data.boardTitle || ''),
        boardCategory: String(data.boardCategory || ''),
        boardPublished: Boolean(data.boardPublished),
      };
    });

  if (rawEntries.length === 0) return;

  const computed = computeManualBoardRankings(rawEntries, rankingMode);
  const batch = writeBatch(db);
  let hasChanges = false;

  for (const item of computed) {
    if (
      item.rankPosition !== item.computedRank ||
      item.displayOrder !== item.computedOrder ||
      item.percentage !== item.computedPercentage ||
      item.boardTitle !== boardTitle ||
      item.boardCategory !== boardCategory ||
      item.boardPublished !== boardPublished
    ) {
      hasChanges = true;
      batch.update(doc(db, 'rankBoardEntries', item.id), {
        rankPosition: item.computedRank,
        displayOrder: item.computedOrder,
        percentage: item.computedPercentage,
        boardTitle,
        boardCategory,
        boardPublished,
        updatedAt: serverTimestamp(),
      });
    }
  }

  if (hasChanges) {
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `rankBoardEntries/${boardId}`);
    }
  }
}

export async function syncLinkedRankBoardItemsOnResourceUpdate(
  itemType: 'paper' | 'exam' | 'note',
  itemId: string,
  nextTitle: string,
  nextSubject: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !itemId) return;

  const primary = isCurrentUserPrimaryOwner();
  const boardsQuery = primary
    ? query(collection(db, 'rankBoards'), where('linkedItemId', '==', itemId))
    : query(collection(db, 'rankBoards'), where('authorId', '==', user.uid));
  const entriesQuery = primary
    ? query(collection(db, 'rankBoardEntries'), where('linkedItemId', '==', itemId))
    : query(collection(db, 'rankBoardEntries'), where('authorId', '==', user.uid));

  const [boardsSnap, entriesSnap] = await Promise.all([
    getDocs(boardsQuery).catch(() => null),
    getDocs(entriesQuery).catch(() => null),
  ]);

  const batch = writeBatch(db);
  let touched = false;
  const cleanTitle = nextTitle.trim().slice(0, 160);
  const cleanBoardSubject = nextSubject.trim().slice(0, 80);
  const cleanEntrySubject = nextSubject.trim().slice(0, 120);

  boardsSnap?.forEach((docSnap) => {
    const d = docSnap.data();
    if (d.linkedItemType === itemType && d.linkedItemId === itemId) {
      touched = true;
      batch.update(docSnap.ref, {
        linkedItemTitle: cleanTitle,
        subject: cleanBoardSubject || String(d.subject || 'Technology').slice(0, 80),
        updatedAt: serverTimestamp(),
      });
    }
  });

  entriesSnap?.forEach((docSnap) => {
    const d = docSnap.data();
    if (d.linkedItemType === itemType && d.linkedItemId === itemId) {
      touched = true;
      batch.update(docSnap.ref, {
        linkedItemTitle: cleanTitle,
        subject: cleanEntrySubject || String(d.subject || cleanTitle).slice(0, 120),
        updatedAt: serverTimestamp(),
      });
    }
  });

  if (touched) {
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'rankBoardEntries');
    }
  }
}

export async function removeLinkedRankEntriesOnResourceDelete(
  itemType: 'paper' | 'exam' | 'note',
  itemId: string
): Promise<number> {
  const user = auth.currentUser;
  if (!user || !itemId) return 0;

  const primary = isCurrentUserPrimaryOwner();
  const entriesQuery = primary
    ? query(collection(db, 'rankBoardEntries'), where('linkedItemId', '==', itemId))
    : query(collection(db, 'rankBoardEntries'), where('authorId', '==', user.uid));
  const boardsQuery = primary
    ? query(collection(db, 'rankBoards'), where('linkedItemId', '==', itemId))
    : query(collection(db, 'rankBoards'), where('authorId', '==', user.uid));

  const [entriesSnap, boardsSnap] = await Promise.all([
    getDocs(entriesQuery).catch(() => null),
    getDocs(boardsQuery).catch(() => null),
  ]);

  const batch = writeBatch(db);
  const affectedBoardIds = new Set<string>();
  let removedCount = 0;
  let batchTouched = false;

  // Delete ONLY Rank Board entries explicitly associated with this specific item
  entriesSnap?.forEach((docSnap) => {
    const d = docSnap.data();
    if (d.linkedItemType === itemType && d.linkedItemId === itemId) {
      batch.delete(docSnap.ref);
      removedCount += 1;
      batchTouched = true;
      if (typeof d.boardId === 'string' && d.boardId) {
        affectedBoardIds.add(d.boardId);
      }
    }
  });

  // Clear stale link pointer on any Rank Board header without deleting unrelated entries
  boardsSnap?.forEach((docSnap) => {
    const d = docSnap.data();
    if (d.linkedItemType === itemType && d.linkedItemId === itemId) {
      batch.update(docSnap.ref, {
        linkedItemType: 'none',
        linkedItemId: '',
        linkedItemTitle: '',
        updatedAt: serverTimestamp(),
      });
      batchTouched = true;
    }
  });

  if (batchTouched) {
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'rankBoardEntries');
    }
  }

  for (const boardId of affectedBoardIds) {
    await recalculateCustomRankBoard(boardId);
  }

  return removedCount;
}

export async function createCustomRankBoard(input: {
  title: string;
  category: RankBoardCategory;
  subject: string;
  targetGroup?: string;
  description?: string;
  rankingMode: 'auto' | 'manual';
  linkedItemType?: RankLinkedItemType;
  linkedItemId?: string;
  linkedItemTitle?: string;
  published: boolean;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const boardId = makeDocId('rboard');

  const linkedType: RankLinkedItemType =
    input.linkedItemType && input.linkedItemId ? input.linkedItemType : 'none';
  const linkedId = linkedType === 'none' ? '' : (input.linkedItemId || '').trim().slice(0, 128);
  const linkedTitle =
    linkedType === 'none' ? '' : (input.linkedItemTitle || '').trim().slice(0, 160);

  try {
    await setDoc(doc(db, 'rankBoards', boardId), {
      title: input.title.trim().slice(0, 160),
      category: input.category,
      subject: input.subject.trim().slice(0, 80),
      targetGroup: (input.targetGroup || '').trim().slice(0, 80),
      description: (input.description || '').trim().slice(0, 1000),
      rankingMode: input.rankingMode === 'manual' ? 'manual' : 'auto',
      linkedItemType: linkedType,
      linkedItemId: linkedId,
      linkedItemTitle: linkedTitle,
      published: Boolean(input.published),
      authorId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      action: 'CREATE_RANK_BOARD',
      targetType: 'rankboard',
      targetId: boardId,
      summary: `Created ${input.category} Rank Board "${input.title.trim()}" (${input.published ? 'Published' : 'Unpublished'})`,
    });
    return boardId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `rankBoards/${boardId}`);
  }
}

export async function updateCustomRankBoard(
  board: CustomRankBoard,
  updates: Partial<{
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
  }>
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');

  const nextTitle = (updates.title ?? board.title).trim().slice(0, 160);
  const nextCategory = updates.category ?? board.category;
  const nextSubject = (updates.subject ?? board.subject).trim().slice(0, 80);
  const nextTargetGroup = (updates.targetGroup ?? board.targetGroup).trim().slice(0, 80);
  const nextDescription = (updates.description ?? board.description).trim().slice(0, 1000);
  const nextRankingMode = updates.rankingMode ?? board.rankingMode;
  const rawLinkedType = updates.linkedItemType ?? board.linkedItemType;
  const rawLinkedId = (updates.linkedItemId ?? board.linkedItemId).trim().slice(0, 128);
  const nextLinkedType: RankLinkedItemType =
    rawLinkedType !== 'none' && rawLinkedId ? rawLinkedType : 'none';
  const nextLinkedId = nextLinkedType === 'none' ? '' : rawLinkedId;
  const nextLinkedTitle =
    nextLinkedType === 'none'
      ? ''
      : (updates.linkedItemTitle ?? board.linkedItemTitle).trim().slice(0, 160);
  const nextPublished = updates.published ?? board.published;

  const entriesQuery = isCurrentUserPrimaryOwner()
    ? query(collection(db, 'rankBoardEntries'), where('boardId', '==', board.id))
    : query(collection(db, 'rankBoardEntries'), where('authorId', '==', user.uid));

  const entriesSnap = await getDocs(entriesQuery).catch(() => null);
  const batch = writeBatch(db);

  batch.update(doc(db, 'rankBoards', board.id), {
    title: nextTitle,
    category: nextCategory,
    subject: nextSubject,
    targetGroup: nextTargetGroup,
    description: nextDescription,
    rankingMode: nextRankingMode,
    linkedItemType: nextLinkedType,
    linkedItemId: nextLinkedId,
    linkedItemTitle: nextLinkedTitle,
    published: nextPublished,
    updatedAt: serverTimestamp(),
  });

  entriesSnap?.forEach((docSnap) => {
    if (docSnap.data()?.boardId === board.id) {
      batch.update(docSnap.ref, {
        boardTitle: nextTitle,
        boardCategory: nextCategory,
        boardPublished: nextPublished,
        updatedAt: serverTimestamp(),
      });
    }
  });

  try {
    await batch.commit();
    if (nextRankingMode !== board.rankingMode) {
      await recalculateCustomRankBoard(board.id);
    }
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'UPDATE_RANK_BOARD',
      targetType: 'rankboard',
      targetId: board.id,
      summary: `Updated Rank Board "${nextTitle}" (${nextPublished ? 'Published' : 'Unpublished'})`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rankBoards/${board.id}`);
  }
}

export async function deleteCustomRankBoard(board: CustomRankBoard): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');

  const entriesQuery = isCurrentUserPrimaryOwner()
    ? query(collection(db, 'rankBoardEntries'), where('boardId', '==', board.id))
    : query(collection(db, 'rankBoardEntries'), where('authorId', '==', user.uid));

  const entriesSnap = await getDocs(entriesQuery).catch(() => null);
  const batch = writeBatch(db);

  batch.delete(doc(db, 'rankBoards', board.id));
  let deletedEntries = 0;
  entriesSnap?.forEach((docSnap) => {
    if (docSnap.data()?.boardId === board.id) {
      batch.delete(docSnap.ref);
      deletedEntries += 1;
    }
  });

  try {
    await batch.commit();
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'DELETE_RANK_BOARD',
      targetType: 'rankboard',
      targetId: board.id,
      summary: `Deleted Rank Board "${board.title}" and ${deletedEntries} associated entries`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `rankBoards/${board.id}`);
  }
}

export async function upsertCustomRankEntry(params: {
  board: CustomRankBoard;
  existingEntry?: CustomRankEntry | null;
  studentName: string;
  marks: number;
  maxMarks: number;
  subject: string;
  isManualRank: boolean;
  rankPosition?: number;
  displayOrder?: number;
  linkedItemType?: RankLinkedItemType;
  linkedItemId?: string;
  linkedItemTitle?: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');

  const safeMax = Math.max(1, Math.min(10000, Number(params.maxMarks) || 100));
  const safeMarks = Math.max(0, Math.min(safeMax, Number(params.marks) || 0));
  const percentage = Math.min(100, Math.max(0, Math.round((safeMarks / safeMax) * 100)));
  const manualRankFlag = Boolean(params.isManualRank);
  const safeRankPos =
    manualRankFlag && Number.isInteger(params.rankPosition) && (params.rankPosition ?? 0) >= 1
      ? Math.min(100000, Math.floor(params.rankPosition!))
      : params.existingEntry?.rankPosition || 1;

  const rawLinkType =
    params.linkedItemType ?? params.existingEntry?.linkedItemType ?? params.board.linkedItemType;
  const rawLinkId = (
    params.linkedItemId ??
    params.existingEntry?.linkedItemId ??
    params.board.linkedItemId ??
    ''
  )
    .trim()
    .slice(0, 128);
  const linkedType: RankLinkedItemType =
    rawLinkType !== 'none' && rawLinkId ? rawLinkType : 'none';
  const linkedId = linkedType === 'none' ? '' : rawLinkId;
  const linkedTitle =
    linkedType === 'none'
      ? ''
      : (
          params.linkedItemTitle ??
          params.existingEntry?.linkedItemTitle ??
          params.board.linkedItemTitle ??
          ''
        )
          .trim()
          .slice(0, 160);

  const safeOrder =
    typeof params.displayOrder === 'number' && Number.isFinite(params.displayOrder)
      ? Math.max(0, Math.floor(params.displayOrder))
      : params.existingEntry?.displayOrder ?? 9999;

  if (params.existingEntry) {
    const entryId = params.existingEntry.id;
    try {
      await updateDoc(doc(db, 'rankBoardEntries', entryId), {
        boardTitle: params.board.title.trim().slice(0, 160),
        boardCategory: params.board.category,
        boardPublished: Boolean(params.board.published),
        studentName: params.studentName.trim().slice(0, 100),
        marks: safeMarks,
        maxMarks: safeMax,
        percentage,
        rankPosition: safeRankPos,
        isManualRank: manualRankFlag,
        displayOrder: safeOrder,
        subject: params.subject.trim().slice(0, 120),
        linkedItemType: linkedType,
        linkedItemId: linkedId,
        linkedItemTitle: linkedTitle,
        updatedAt: serverTimestamp(),
      });
      await recalculateCustomRankBoard(params.board.id);
      await reconcilePlatformStats();
      await writeAuditLog({
        action: 'UPDATE_RANK_ENTRY',
        targetType: 'rankboard',
        targetId: entryId,
        summary: `Updated ranking entry for ${params.studentName.trim()} on "${params.board.title}"`,
      });
      return entryId;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rankBoardEntries/${entryId}`);
    }
  }

  const entryId = makeDocId('rentry');
  try {
    await setDoc(doc(db, 'rankBoardEntries', entryId), {
      boardId: params.board.id,
      boardTitle: params.board.title.trim().slice(0, 160),
      boardCategory: params.board.category,
      boardPublished: Boolean(params.board.published),
      studentName: params.studentName.trim().slice(0, 100),
      marks: safeMarks,
      maxMarks: safeMax,
      percentage,
      rankPosition: safeRankPos,
      isManualRank: manualRankFlag,
      displayOrder: safeOrder,
      subject: params.subject.trim().slice(0, 120),
      linkedItemType: linkedType,
      linkedItemId: linkedId,
      linkedItemTitle: linkedTitle,
      authorId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await recalculateCustomRankBoard(params.board.id);
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'CREATE_RANK_ENTRY',
      targetType: 'rankboard',
      targetId: entryId,
      summary: `Added ${params.studentName.trim()} (${safeMarks}/${safeMax}) to "${params.board.title}"`,
    });
    return entryId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `rankBoardEntries/${entryId}`);
  }
}

export async function deleteCustomRankEntry(entry: CustomRankEntry): Promise<void> {
  try {
    await deleteDoc(doc(db, 'rankBoardEntries', entry.id));
    await recalculateCustomRankBoard(entry.boardId);
    await reconcilePlatformStats();
    await writeAuditLog({
      action: 'DELETE_RANK_ENTRY',
      targetType: 'rankboard',
      targetId: entry.id,
      summary: `Removed ${entry.studentName} from Rank Board "${entry.boardTitle}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `rankBoardEntries/${entry.id}`);
  }
}

export async function reorderCustomRankEntry(params: {
  board: CustomRankBoard;
  orderedEntries: CustomRankEntry[];
  entryId: string;
  direction: 'up' | 'down';
}): Promise<void> {
  const idx = params.orderedEntries.findIndex((e) => e.id === params.entryId);
  if (idx < 0) return;
  const swapIdx = params.direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= params.orderedEntries.length) return;

  const reordered = [...params.orderedEntries];
  const [moved] = reordered.splice(idx, 1);
  reordered.splice(swapIdx, 0, moved);

  // If moving across non-tied scores while board is in 'auto' mode, switch board to 'manual' order mode
  // so the administrator's custom reordering is preserved visually.
  const crossedDifferentScores =
    params.orderedEntries[idx].marks !== params.orderedEntries[swapIdx].marks;
  const nextMode: 'auto' | 'manual' =
    params.board.rankingMode === 'auto' && crossedDifferentScores
      ? 'manual'
      : params.board.rankingMode;

  const computed = computeManualBoardRankings(
    reordered.map((e, i) => ({
      ...e,
      displayOrder: i,
    })),
    nextMode
  );

  const batch = writeBatch(db);
  if (nextMode !== params.board.rankingMode) {
    batch.update(doc(db, 'rankBoards', params.board.id), {
      rankingMode: nextMode,
      updatedAt: serverTimestamp(),
    });
  }

  for (const item of computed) {
    batch.update(doc(db, 'rankBoardEntries', item.id), {
      displayOrder: item.computedOrder,
      rankPosition: item.computedRank,
      percentage: item.computedPercentage,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    await writeAuditLog({
      action: 'REORDER_RANK_ENTRIES',
      targetType: 'rankboard',
      targetId: params.board.id,
      summary: `Reordered ranking entry "${moved.studentName}" (${params.direction}) on "${params.board.title}"`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rankBoardEntries/${params.board.id}`);
  }
}
