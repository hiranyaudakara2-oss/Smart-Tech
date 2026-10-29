import React, { useMemo, useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { AdminLoginGate } from '../components/AdminLoginGate';
import { AdminExamManager, AdminExamResultsPanel } from '../components/AdminExamManager';
import { AdminRankBoardManager } from '../components/AdminRankBoardManager';
import { ConfirmDialog, ResilientImage } from '../components/SharedUI';
import {
  ShieldCheck,
  BookOpen,
  FileText,
  Monitor,
  Bell,
  Trophy,
  Plus,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  Search,
  CheckCircle2,
  AlertCircle,
  Upload,
  Link as LinkIcon,
  KeyRound,
  Loader2,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import {
  createAnnouncementDocument,
  createNoteDocument,
  createPaperDocument,
  deleteAnnouncementDocument,
  deleteNoteDocument,
  deletePaperDocument,
  grantAdminPrivilege,
  linkAdminPasswordToGoogleAccount,
  revokeAdminPrivilege,
  seedStarterCurriculumByAdmin,
  updateAnnouncementDocument,
  updateNoteDocument,
  updatePaperDocument,
  uploadNoticeImageFile,
  uploadValidatedPdfFile,
} from '../services/platformService';
import {
  formatBytes,
  isGoogleDriveResource,
  normalizeAnnouncementImageUrl,
  parseTagsInput,
  validateGoogleDriveUrl,
} from '../utils/platformLogic';
import { BOOTSTRAPPED_ADMIN_EMAIL, FIREBASE_PROJECT_ID } from '../lib/firebase';
import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementPriority,
  ExamPaper,
  NoteResource,
} from '../types/platform';

type AdminTab = 'notes' | 'papers' | 'exams' | 'announcements' | 'rankboards' | 'security';

type PendingDeleteTarget =
  | { kind: 'note'; item: NoteResource }
  | { kind: 'paper'; item: ExamPaper }
  | { kind: 'announcement'; item: Announcement }
  | null;

const SUBJECT_OPTIONS = [
  'Engineering Technology',
  'Biosystems Technology',
  'ICT',
  'Science for Technology',
  'Science',
  'Mathematics',
];

const ANNOUNCEMENT_CATEGORIES: AnnouncementCategory[] = [
  'Important Announcement',
  'Exam Notice',
  'New Upload',
  'General Notice',
];

export function AdminPage() {
  const {
    firebaseUser,
    isVerifiedAdmin,
    adminServerVerified,
    signInWithGoogle,
    navigate,
    allNotes,
    allPapers,
    allAnnouncements,
    allUsers,
    allAdmins,
    auditLogs,
    pushToast,
  } = usePlatform();

  const [activeTab, setActiveTab] = useState<AdminTab>('notes');
  const [searchTerm, setSearchTerm] = useState('');
  const [savingModal, setSavingModal] = useState(false);
  const [seedingBusy, setSeedingBusy] = useState(false);

  // Shared Delete Confirm Dialog state (replaces window.confirm across all browsers/iframes)
  const [deleteTarget, setDeleteTarget] = useState<PendingDeleteTarget>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Note Modal state
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteResource | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteSubject, setNoteSubject] = useState('Engineering Technology');
  const [noteGrade, setNoteGrade] = useState('Grade 13 (G.C.E. A/L)');
  const [noteDesc, setNoteDesc] = useState('');
  const [noteTags, setNoteTags] = useState('');
  const [noteSourceType, setNoteSourceType] = useState<'pdf' | 'drive'>('pdf');
  const [noteDriveUrl, setNoteDriveUrl] = useState('');
  const [notePdfUrl, setNotePdfUrl] = useState('');
  const [noteStoragePath, setNoteStoragePath] = useState('');
  const [noteFileName, setNoteFileName] = useState('');
  const [noteFileSize, setNoteFileSize] = useState(0);
  const [noteUploadProgress, setNoteUploadProgress] = useState<number | null>(null);
  const [notePublished, setNotePublished] = useState(true);

  // Paper Modal state
  const [showPaperModal, setShowPaperModal] = useState(false);
  const [editingPaper, setEditingPaper] = useState<ExamPaper | null>(null);
  const [paperTitle, setPaperTitle] = useState('');
  const [paperSubject, setPaperSubject] = useState('Engineering Technology');
  const [paperYear, setPaperYear] = useState(new Date().getFullYear());
  const [paperCategory, setPaperCategory] = useState('National Past Paper');
  const [paperGrade, setPaperGrade] = useState('Grade 13 (G.C.E. A/L)');
  const [paperLanguage, setPaperLanguage] = useState('English');
  const [paperDesc, setPaperDesc] = useState('');
  const [paperSourceType, setPaperSourceType] = useState<'pdf' | 'drive'>('pdf');
  const [paperDriveUrl, setPaperDriveUrl] = useState('');
  const [paperPdfUrl, setPaperPdfUrl] = useState('');
  const [paperStoragePath, setPaperStoragePath] = useState('');
  const [paperFileName, setPaperFileName] = useState('');
  const [paperFileSize, setPaperFileSize] = useState(0);
  const [paperUploadProgress, setPaperUploadProgress] = useState<number | null>(null);
  const [paperPublished, setPaperPublished] = useState(true);

  // Announcement Modal state
  const [showAnnModal, setShowAnnModal] = useState(false);
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annCategory, setAnnCategory] = useState<AnnouncementCategory>('Important Announcement');
  const [annPriority, setAnnPriority] = useState<AnnouncementPriority>('normal');
  const [annIsImportant, setAnnIsImportant] = useState(true);
  const [annImageUrl, setAnnImageUrl] = useState('');
  const [annImageUploading, setAnnImageUploading] = useState(false);
  const [annImageUploadProgress, setAnnImageUploadProgress] = useState<number | null>(null);
  const [annPublished, setAnnPublished] = useState(true);

  // Cross-Device Admin Password Sync state
  const [syncPassword, setSyncPassword] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [roleBusyUid, setRoleBusyUid] = useState<string | null>(null);

  const normalizedQuery = searchTerm.trim().toLowerCase();

  const filteredNotes = useMemo(() => {
    if (!normalizedQuery) return allNotes;
    return allNotes.filter(
      (n) =>
        n.title.toLowerCase().includes(normalizedQuery) ||
        n.subject.toLowerCase().includes(normalizedQuery) ||
        n.description.toLowerCase().includes(normalizedQuery) ||
        n.tags.some((t) => t.toLowerCase().includes(normalizedQuery))
    );
  }, [allNotes, normalizedQuery]);

  const filteredPapers = useMemo(() => {
    if (!normalizedQuery) return allPapers;
    return allPapers.filter(
      (p) =>
        p.title.toLowerCase().includes(normalizedQuery) ||
        p.subject.toLowerCase().includes(normalizedQuery) ||
        p.category.toLowerCase().includes(normalizedQuery) ||
        String(p.year).includes(normalizedQuery)
    );
  }, [allPapers, normalizedQuery]);

  const filteredAnnouncements = useMemo(() => {
    if (!normalizedQuery) return allAnnouncements;
    return allAnnouncements.filter(
      (a) =>
        a.title.toLowerCase().includes(normalizedQuery) ||
        a.body.toLowerCase().includes(normalizedQuery) ||
        a.category.toLowerCase().includes(normalizedQuery)
    );
  }, [allAnnouncements, normalizedQuery]);

  if (!isVerifiedAdmin || !adminServerVerified) {
    return <AdminLoginGate />;
  }

  const isPrimaryOwnerSignedIn =
    (firebaseUser?.email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  // ============================================================================
  // Note Handlers
  // ============================================================================
  const handleOpenNoteModal = (note?: NoteResource) => {
    setNoteUploadProgress(null);
    if (note) {
      const isDrive = isGoogleDriveResource(note);
      setEditingNote(note);
      setNoteTitle(note.title);
      setNoteSubject(note.subject);
      setNoteGrade(note.grade);
      setNoteDesc(note.description);
      setNoteTags(note.tags.join(', '));
      setNoteSourceType(isDrive ? 'drive' : 'pdf');
      setNoteDriveUrl(note.driveUrl || (isDrive ? note.pdfUrl : ''));
      setNotePdfUrl(isDrive ? '' : note.pdfUrl || '');
      setNoteStoragePath(note.storagePath || '');
      setNoteFileName(note.fileName || '');
      setNoteFileSize(note.fileSize || 0);
      setNotePublished(note.published);
    } else {
      setEditingNote(null);
      setNoteTitle('');
      setNoteSubject('Engineering Technology');
      setNoteGrade('Grade 13 (G.C.E. A/L)');
      setNoteDesc('');
      setNoteTags('');
      setNoteSourceType('pdf');
      setNoteDriveUrl('');
      setNotePdfUrl('/api/curriculum-pdf/study-module.pdf?title=Study+Module');
      setNoteStoragePath('');
      setNoteFileName('study-module.pdf');
      setNoteFileSize(0);
      setNotePublished(true);
    }
    setShowNoteModal(true);
  };

  const handleNoteFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setNoteUploadProgress(5);
    try {
      const uploaded = await uploadValidatedPdfFile(file, 'notes', (pct) =>
        setNoteUploadProgress(pct)
      );
      setNoteSourceType('pdf');
      setNotePdfUrl(uploaded.pdfUrl);
      setNoteStoragePath(uploaded.storagePath);
      setNoteFileName(uploaded.fileName);
      setNoteFileSize(uploaded.fileSize);
      if (!noteTitle.trim()) {
        setNoteTitle(file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '));
      }
      pushToast('success', 'PDF Uploaded', `${file.name} (${formatBytes(uploaded.fileSize)}) ready.`);
    } catch (err) {
      pushToast(
        'error',
        'PDF Upload Failed',
        err instanceof Error ? err.message : 'Unable to upload PDF.'
      );
    } finally {
      setNoteUploadProgress(null);
    }
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (noteSourceType === 'drive') {
      const check = validateGoogleDriveUrl(noteDriveUrl);
      if (!check.valid) {
        pushToast('error', 'Invalid Google Drive Link', check.error || 'Check the link format.');
        return;
      }
    } else if (!notePdfUrl.trim()) {
      pushToast('error', 'Missing PDF', 'Upload a PDF file or enter a valid PDF URL.');
      return;
    }

    setSavingModal(true);
    try {
      const tagsArr = parseTagsInput(noteTags);
      if (editingNote) {
        await updateNoteDocument(editingNote, {
          title: noteTitle,
          subject: noteSubject,
          grade: noteGrade,
          description: noteDesc,
          tags: tagsArr,
          sourceType: noteSourceType,
          driveUrl: noteSourceType === 'drive' ? noteDriveUrl : '',
          pdfUrl: noteSourceType === 'drive' ? noteDriveUrl : notePdfUrl,
          storagePath: noteSourceType === 'drive' ? '' : noteStoragePath,
          fileName: noteSourceType === 'drive' ? 'Google Drive Document' : noteFileName,
          fileSize: noteSourceType === 'drive' ? 0 : noteFileSize,
          published: notePublished,
        });
        pushToast('success', 'Note Updated', `Successfully updated note "${noteTitle}"`);
      } else {
        await createNoteDocument({
          title: noteTitle,
          subject: noteSubject,
          grade: noteGrade,
          description: noteDesc,
          tags: tagsArr,
          sourceType: noteSourceType,
          driveUrl: noteSourceType === 'drive' ? noteDriveUrl : '',
          pdfUrl: noteSourceType === 'drive' ? noteDriveUrl : notePdfUrl,
          storagePath: noteSourceType === 'drive' ? '' : noteStoragePath,
          fileName: noteSourceType === 'drive' ? 'Google Drive Document' : noteFileName,
          fileSize: noteSourceType === 'drive' ? 0 : noteFileSize,
          published: notePublished,
        });
        pushToast('success', 'Note Created', `Successfully created note "${noteTitle}"`);
      }
      setShowNoteModal(false);
    } catch (err: any) {
      pushToast('error', 'Operation Failed', err?.message || 'Failed to save note.');
    } finally {
      setSavingModal(false);
    }
  };

  const handleToggleNotePublish = async (note: NoteResource) => {
    try {
      await updateNoteDocument(note, { published: !note.published });
      pushToast(
        'info',
        note.published ? 'Note Unpublished' : 'Note Published',
        `"${note.title}" is now ${note.published ? 'hidden as draft' : 'live for students'}.`
      );
    } catch (err: any) {
      pushToast('error', 'Update Failed', err?.message || 'Could not update note visibility.');
    }
  };

  // ============================================================================
  // Paper Handlers
  // ============================================================================
  const handleOpenPaperModal = (paper?: ExamPaper) => {
    setPaperUploadProgress(null);
    if (paper) {
      const isDrive = isGoogleDriveResource(paper);
      setEditingPaper(paper);
      setPaperTitle(paper.title);
      setPaperSubject(paper.subject);
      setPaperYear(paper.year);
      setPaperCategory(paper.category);
      setPaperGrade(paper.grade);
      setPaperLanguage(paper.language || 'English');
      setPaperDesc(paper.description);
      setPaperSourceType(isDrive ? 'drive' : 'pdf');
      setPaperDriveUrl(paper.driveUrl || (isDrive ? paper.pdfUrl : ''));
      setPaperPdfUrl(isDrive ? '' : paper.pdfUrl || '');
      setPaperStoragePath(paper.storagePath || '');
      setPaperFileName(paper.fileName || '');
      setPaperFileSize(paper.fileSize || 0);
      setPaperPublished(paper.published);
    } else {
      setEditingPaper(null);
      setPaperTitle('');
      setPaperSubject('Engineering Technology');
      setPaperYear(new Date().getFullYear());
      setPaperCategory('National Past Paper');
      setPaperGrade('Grade 13 (G.C.E. A/L)');
      setPaperLanguage('English');
      setPaperDesc('');
      setPaperSourceType('pdf');
      setPaperDriveUrl('');
      setPaperPdfUrl('/api/curriculum-pdf/past-paper.pdf?title=Past+Paper');
      setPaperStoragePath('');
      setPaperFileName('past-paper.pdf');
      setPaperFileSize(0);
      setPaperPublished(true);
    }
    setShowPaperModal(true);
  };

  const handlePaperFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPaperUploadProgress(5);
    try {
      const uploaded = await uploadValidatedPdfFile(file, 'papers', (pct) =>
        setPaperUploadProgress(pct)
      );
      setPaperSourceType('pdf');
      setPaperPdfUrl(uploaded.pdfUrl);
      setPaperStoragePath(uploaded.storagePath);
      setPaperFileName(uploaded.fileName);
      setPaperFileSize(uploaded.fileSize);
      if (!paperTitle.trim()) {
        setPaperTitle(file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '));
      }
      pushToast(
        'success',
        'Paper PDF Uploaded',
        `${file.name} (${formatBytes(uploaded.fileSize)}) ready.`
      );
    } catch (err) {
      pushToast(
        'error',
        'PDF Upload Failed',
        err instanceof Error ? err.message : 'Unable to upload PDF.'
      );
    } finally {
      setPaperUploadProgress(null);
    }
  };

  const handleSavePaper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paperSourceType === 'drive') {
      const check = validateGoogleDriveUrl(paperDriveUrl);
      if (!check.valid) {
        pushToast('error', 'Invalid Google Drive Link', check.error || 'Check the link format.');
        return;
      }
    } else if (!paperPdfUrl.trim()) {
      pushToast('error', 'Missing PDF', 'Upload a PDF file or enter a valid PDF URL.');
      return;
    }

    setSavingModal(true);
    try {
      if (editingPaper) {
        await updatePaperDocument(editingPaper, {
          title: paperTitle,
          subject: paperSubject,
          year: paperYear,
          category: paperCategory,
          grade: paperGrade,
          language: paperLanguage,
          description: paperDesc,
          sourceType: paperSourceType,
          driveUrl: paperSourceType === 'drive' ? paperDriveUrl : '',
          pdfUrl: paperSourceType === 'drive' ? paperDriveUrl : paperPdfUrl,
          storagePath: paperSourceType === 'drive' ? '' : paperStoragePath,
          fileName: paperSourceType === 'drive' ? 'Google Drive Document' : paperFileName,
          fileSize: paperSourceType === 'drive' ? 0 : paperFileSize,
          published: paperPublished,
        });
        pushToast('success', 'Paper Updated', `Successfully updated past paper "${paperTitle}"`);
      } else {
        await createPaperDocument({
          title: paperTitle,
          subject: paperSubject,
          year: paperYear,
          category: paperCategory,
          grade: paperGrade,
          language: paperLanguage,
          description: paperDesc,
          sourceType: paperSourceType,
          driveUrl: paperSourceType === 'drive' ? paperDriveUrl : '',
          pdfUrl: paperSourceType === 'drive' ? paperDriveUrl : paperPdfUrl,
          storagePath: paperSourceType === 'drive' ? '' : paperStoragePath,
          fileName: paperSourceType === 'drive' ? 'Google Drive Document' : paperFileName,
          fileSize: paperSourceType === 'drive' ? 0 : paperFileSize,
          published: paperPublished,
        });
        pushToast('success', 'Paper Created', `Successfully added past paper "${paperTitle}"`);
      }
      setShowPaperModal(false);
    } catch (err: any) {
      pushToast('error', 'Operation Failed', err?.message || 'Failed to save past paper.');
    } finally {
      setSavingModal(false);
    }
  };

  const handleTogglePaperPublish = async (paper: ExamPaper) => {
    try {
      await updatePaperDocument(paper, { published: !paper.published });
      pushToast(
        'info',
        paper.published ? 'Paper Unpublished' : 'Paper Published',
        `"${paper.title}" is now ${paper.published ? 'hidden as draft' : 'live for students'}.`
      );
    } catch (err: any) {
      pushToast('error', 'Update Failed', err?.message || 'Could not update paper visibility.');
    }
  };

  // ============================================================================
  // Announcement Handlers
  // ============================================================================
  const handleOpenAnnModal = (ann?: Announcement) => {
    if (ann) {
      setEditingAnn(ann);
      setAnnTitle(ann.title);
      setAnnBody(ann.body);
      setAnnCategory(ann.category);
      setAnnPriority(ann.priority);
      setAnnIsImportant(ann.isImportant);
      setAnnImageUrl(ann.imageUrl || '');
      setAnnPublished(ann.published);
    } else {
      setEditingAnn(null);
      setAnnTitle('');
      setAnnBody('');
      setAnnCategory('Important Announcement');
      setAnnPriority('high');
      setAnnIsImportant(true);
      setAnnImageUrl('');
      setAnnPublished(true);
    }
    setAnnImageUploadProgress(null);
    setShowAnnModal(true);
  };

  const handleAnnImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAnnImageUploading(true);
    setAnnImageUploadProgress(5);
    try {
      const url = await uploadNoticeImageFile(file, (pct) => setAnnImageUploadProgress(pct));
      setAnnImageUrl(url);
      pushToast('success', 'Banner Image Uploaded', 'Notice banner attached successfully.');
    } catch (err) {
      pushToast(
        'error',
        'Image Upload Failed',
        err instanceof Error ? err.message : 'Could not upload notice image.'
      );
    } finally {
      setAnnImageUploading(false);
      setAnnImageUploadProgress(null);
    }
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingModal(true);
    try {
      if (editingAnn) {
        await updateAnnouncementDocument(editingAnn, {
          title: annTitle,
          body: annBody,
          category: annCategory,
          priority: annPriority,
          isImportant: annIsImportant,
          imageUrl: annImageUrl,
          published: annPublished,
        });
        pushToast('success', 'Notice Updated', `Updated "${annTitle}"`);
      } else {
        await createAnnouncementDocument({
          title: annTitle,
          body: annBody,
          category: annCategory,
          priority: annPriority,
          isImportant: annIsImportant,
          imageUrl: annImageUrl,
          published: annPublished,
        });
        pushToast('success', 'Notice Published', `Published "${annTitle}"`);
      }
      setShowAnnModal(false);
    } catch (err: any) {
      pushToast('error', 'Save Failed', err?.message || 'Unable to save announcement.');
    } finally {
      setSavingModal(false);
    }
  };

  const handleToggleAnnPublish = async (ann: Announcement) => {
    try {
      await updateAnnouncementDocument(ann, { published: !ann.published });
      pushToast(
        'info',
        ann.published ? 'Notice Hidden' : 'Notice Published',
        `"${ann.title}" visibility updated.`
      );
    } catch (err: any) {
      pushToast('error', 'Update Failed', err?.message || 'Could not update notice.');
    }
  };

  // ============================================================================
  // Shared Confirm Delete Execution
  // ============================================================================
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      if (deleteTarget.kind === 'note') {
        await deleteNoteDocument(deleteTarget.item);
        pushToast('success', 'Note Deleted', `Deleted note "${deleteTarget.item.title}"`);
      } else if (deleteTarget.kind === 'paper') {
        await deletePaperDocument(deleteTarget.item);
        pushToast('success', 'Paper Deleted', `Deleted past paper "${deleteTarget.item.title}"`);
      } else if (deleteTarget.kind === 'announcement') {
        await deleteAnnouncementDocument(deleteTarget.item);
        pushToast('success', 'Notice Deleted', `Deleted notice "${deleteTarget.item.title}"`);
      }
      setDeleteTarget(null);
    } catch (err: any) {
      pushToast('error', 'Delete Failed', err?.message || 'Operation could not be completed.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleSeedStarterContent = async () => {
    setSeedingBusy(true);
    try {
      const { sampleExamCode } = await seedStarterCurriculumByAdmin();
      pushToast(
        'success',
        'Starter Curriculum Seeded',
        `Sample notes, papers, announcement, and online exam created (6-digit exam password: ${sampleExamCode}).`
      );
    } catch (err: any) {
      pushToast('error', 'Seeding Failed', err?.message || 'Unable to seed starter content.');
    } finally {
      setSeedingBusy(false);
    }
  };

  const handleSyncAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSyncBusy(true);
    try {
      await linkAdminPasswordToGoogleAccount(syncPassword);
      setSyncPassword('');
      pushToast(
        'success',
        'Cross-Device Password Synced',
        'Logging in with your Admin Password on any browser or phone now automatically grants full cloud write authority.'
      );
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/operation-not-allowed') {
        pushToast(
          'error',
          'Enable Email/Password in Firebase Console',
          'Open Firebase Console → Authentication → Sign-in method → Enable "Email/Password", then click Sync Password again.'
        );
      } else if (code === 'auth/requires-recent-login') {
        pushToast(
          'info',
          'Fresh Google Sign-In Required',
          'Click Sign Out and Sign In with Google once, then sync your password.'
        );
      } else {
        pushToast('error', 'Password Sync Failed', err?.message || 'Could not link password.');
      }
    } finally {
      setSyncBusy(false);
    }
  };

  const showSearchToolbar =
    activeTab === 'notes' || activeTab === 'papers' || activeTab === 'announcements';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Administrator Control Panel
            </h1>
            <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-300">
              Authorized Admin
            </span>
          </div>
          <p className="text-slate-300 text-sm pt-1">
            Full content management system, online examination builder, announcements, and rank board manager.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {allNotes.length === 0 && allPapers.length === 0 && firebaseUser && (
            <button
              type="button"
              disabled={seedingBusy}
              onClick={handleSeedStarterContent}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-3.5 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50"
            >
              {seedingBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>Seed Starter Curriculum</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('setup-guide')}
            className="rounded-xl border border-slate-700 bg-slate-900/80 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white"
          >
            Netlify &amp; Hosting Guide
          </button>
        </div>
      </header>

      {/* Password-Only Session Cloud Write Helper Banner */}
      {!firebaseUser && (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-950/30 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div className="text-xs leading-relaxed text-amber-100/90">
              <p className="font-bold text-amber-200">
                Admin Password Session Active — Connect Cloud Write Identity
              </p>
              <p className="mt-0.5 text-slate-300">
                To create, upload, edit, or delete Firestore &amp; Cloud Storage records from this browser, tap{' '}
                <strong className="text-white">Authorize with Google</strong> once (or sync your Admin Password under{' '}
                <button
                  type="button"
                  onClick={() => setActiveTab('security')}
                  className="font-semibold text-cyan-300 underline hover:text-cyan-200"
                >
                  Audit Logs &amp; Security
                </button>{' '}
                for 1-step password-only writes on every device).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => signInWithGoogle('admin')}
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-300 transition-colors"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Authorize with Google</span>
          </button>
        </div>
      )}

      {/* Admin Tab Buttons */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('notes')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            activeTab === 'notes'
              ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>Notes ({allNotes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('papers')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            activeTab === 'papers'
              ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Past Papers ({allPapers.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('exams')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            activeTab === 'exams'
              ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Monitor className="h-4 w-4" />
          <span>Online Exams &amp; Grading</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('announcements')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            activeTab === 'announcements'
              ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Bell className="h-4 w-4" />
          <span>Notices ({allAnnouncements.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rankboards')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            activeTab === 'rankboards'
              ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Trophy className="h-4 w-4" />
          <span>Rank Boards</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
            activeTab === 'security'
              ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>Audit Logs &amp; Security</span>
        </button>
      </div>

      {/* Quick Search Bar for Notes / Papers / Announcements */}
      {showSearchToolbar && (
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Filter ${activeTab} by title, subject, or keyword...`}
            className="w-full rounded-xl border border-slate-700 bg-slate-900/80 pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-400 focus:border-cyan-400 focus:outline-none"
          />
        </div>
      )}

      {/* Tab 1: Educational Notes Management */}
      {activeTab === 'notes' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-white">Educational Notes Management</h2>
            <button
              type="button"
              onClick={() => handleOpenNoteModal()}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-400 shadow-md shadow-cyan-500/20"
            >
              <Plus className="h-4 w-4" />
              <span>Add Educational Note</span>
            </button>
          </div>

          {filteredNotes.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
              No educational notes found. Click <strong className="text-slate-200">Add Educational Note</strong> to upload a PDF or link Google Drive.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredNotes.map((note) => (
                <div
                  key={note.id}
                  className="glass-panel flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-5 space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                      <span className="font-semibold text-cyan-300">{note.subject}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-semibold ${
                          note.published
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        {note.published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <h3 className="font-bold text-white">{note.title}</h3>
                    <p className="text-xs text-slate-300 line-clamp-2 pt-1">{note.description}</p>
                    <p className="text-[11px] text-slate-500 pt-2">
                      {isGoogleDriveResource(note) ? 'Google Drive Link' : 'PDF Document'} ·{' '}
                      {note.grade}
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleToggleNotePublish(note)}
                      title={note.published ? 'Unpublish' : 'Publish'}
                      className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
                    >
                      {note.published ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4 text-emerald-300" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenNoteModal(note)}
                      title="Edit note"
                      className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ kind: 'note', item: note })}
                      title="Delete note"
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300 hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Past Papers Management */}
      {activeTab === 'papers' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-white">Past Papers Management</h2>
            <button
              type="button"
              onClick={() => handleOpenPaperModal()}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-400 shadow-md shadow-cyan-500/20"
            >
              <Plus className="h-4 w-4" />
              <span>Add Past Paper</span>
            </button>
          </div>

          {filteredPapers.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
              No past papers found. Click <strong className="text-slate-200">Add Past Paper</strong> to upload a PDF or attach a Google Drive link.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPapers.map((paper) => (
                <div
                  key={paper.id}
                  className="glass-panel flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-5 space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                      <span className="font-semibold text-sky-300">
                        {paper.category} ({paper.year})
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-semibold ${
                          paper.published
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        {paper.published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <h3 className="font-bold text-white">{paper.title}</h3>
                    <p className="text-xs text-slate-300 line-clamp-2 pt-1">{paper.description}</p>
                    <p className="text-[11px] text-slate-500 pt-2">
                      {isGoogleDriveResource(paper) ? 'Google Drive Link' : 'PDF Document'} ·{' '}
                      {paper.subject} · {paper.language}
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleTogglePaperPublish(paper)}
                      title={paper.published ? 'Unpublish' : 'Publish'}
                      className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
                    >
                      {paper.published ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4 text-emerald-300" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenPaperModal(paper)}
                      title="Edit paper"
                      className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ kind: 'paper', item: paper })}
                      title="Delete paper"
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300 hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Online Exams & Student Grading */}
      {activeTab === 'exams' && (
        <div className="space-y-12">
          <AdminExamManager />
          <div className="border-t border-slate-800 pt-10">
            <AdminExamResultsPanel />
          </div>
        </div>
      )}

      {/* Tab 4: Announcements & Home Popup Notices */}
      {activeTab === 'announcements' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">Announcements &amp; Important Notices</h2>
              <p className="text-xs text-slate-400 pt-0.5">
                Important notices automatically appear as a home popup for students on any device.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenAnnModal()}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-400 shadow-md shadow-cyan-500/20"
            >
              <Plus className="h-4 w-4" />
              <span>Publish Announcement</span>
            </button>
          </div>

          {filteredAnnouncements.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
              No announcements created yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAnnouncements.map((ann) => (
                <div
                  key={ann.id}
                  className="glass-panel flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-5 space-y-4"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
                      <span className="font-semibold text-amber-300">{ann.category}</span>
                      <div className="flex items-center gap-1.5">
                        {ann.isImportant && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                            Popup
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold ${
                            ann.published
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {ann.published ? 'Published' : 'Draft'}
                        </span>
                      </div>
                    </div>
                    <h3 className="font-bold text-white line-clamp-2">{ann.title}</h3>
                    <p className="text-xs text-slate-300 line-clamp-3 pt-1">{ann.body}</p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleToggleAnnPublish(ann)}
                      title={ann.published ? 'Unpublish' : 'Publish'}
                      className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
                    >
                      {ann.published ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4 text-emerald-300" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenAnnModal(ann)}
                      title="Edit announcement"
                      className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ kind: 'announcement', item: ann })}
                      title="Delete announcement"
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300 hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Rank Boards */}
      {activeTab === 'rankboards' && <AdminRankBoardManager />}

      {/* Tab 6: Security, Cross-Device Password Sync & Audit Logs */}
      {activeTab === 'security' && (
        <div className="space-y-8">
          {/* Cross-Device Admin Password Sync Card */}
          <div className="glass-panel rounded-2xl border border-sky-400/25 bg-slate-900/80 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-sky-500/15 p-2.5 text-cyan-300 border border-sky-400/30">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  Cross-Device Admin Password Cloud Write Sync
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed mt-1">
                  Link your Admin Password directly to <code className="font-mono text-cyan-300">{BOOTSTRAPPED_ADMIN_EMAIL}</code> in Firebase Authentication so signing in with your password on any mobile device, tablet, or desktop browser grants instant Firestore &amp; Cloud Storage write authority without needing Google Sign-In.
                </p>
              </div>
            </div>

            {isPrimaryOwnerSignedIn ? (
              <form
                onSubmit={handleSyncAdminPassword}
                className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 pt-2"
              >
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Admin Password to Sync (matches your Admin Login Password)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={syncPassword}
                    onChange={(e) => setSyncPassword(e.target.value)}
                    placeholder="Enter your Admin Password (e.g. Hirusa@#123)"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={syncBusy || syncPassword.length < 6}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                >
                  {syncBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>{syncBusy ? 'Syncing...' : 'Sync Cross-Device Password'}</span>
                </button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-300">
                <span>
                  Sign in once with Google as <strong className="text-white">{BOOTSTRAPPED_ADMIN_EMAIL}</strong> to link your cross-device password.
                </span>
                <button
                  type="button"
                  onClick={() => signInWithGoogle('admin')}
                  className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  Sign In with Google
                </button>
              </div>
            )}

            <p className="text-[11px] text-slate-400">
              Prerequisite: Ensure <strong className="text-slate-200">Email/Password</strong> sign-in is enabled in{' '}
              <a
                href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/providers`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-300 underline hover:text-cyan-200"
              >
                Firebase Console → Authentication → Sign-in method
              </a>
              .
            </p>
          </div>

          {/* Co-Administrator Access Management */}
          {isPrimaryOwnerSignedIn && allUsers.length > 0 && (
            <div className="glass-panel rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <Users className="h-5 w-5 text-cyan-400" />
                <h2 className="text-lg font-bold text-white">Administrator Privilege Directory</h2>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {allUsers.slice(0, 30).map((u) => {
                  const isOwner =
                    u.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
                  const isAdminRole =
                    isOwner ||
                    u.role === 'admin' ||
                    allAdmins.some((a) => a.uid === u.uid);
                  return (
                    <div
                      key={u.uid}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-100">{u.displayName}</p>
                        <p className="font-mono text-slate-400">{u.email}</p>
                      </div>
                      {isOwner ? (
                        <span className="rounded-full bg-amber-500/15 px-3 py-1 font-semibold text-amber-300">
                          Primary Owner
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={roleBusyUid === u.uid}
                          onClick={async () => {
                            setRoleBusyUid(u.uid);
                            try {
                              if (isAdminRole) {
                                await revokeAdminPrivilege(u.uid, u.email);
                                pushToast('info', 'Admin Revoked', `Revoked ${u.email}`);
                              } else {
                                await grantAdminPrivilege(u.uid, u.email);
                                pushToast('success', 'Admin Granted', `Granted ${u.email}`);
                              }
                            } catch (err: any) {
                              pushToast('error', 'Role Change Failed', err?.message || '');
                            } finally {
                              setRoleBusyUid(null);
                            }
                          }}
                          className={`rounded-lg px-3 py-1.5 font-semibold ${
                            isAdminRole
                              ? 'border border-rose-500/40 bg-rose-950/40 text-rose-200 hover:bg-rose-900/50'
                              : 'border border-sky-400/40 bg-sky-500/15 text-cyan-200 hover:bg-sky-500/25'
                          }`}
                        >
                          {isAdminRole ? 'Revoke Admin' : 'Grant Co-Admin'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Security Audit Logs */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">Audit Logs &amp; Security History</h2>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-4">
              {auditLogs.length === 0 ? (
                <p className="text-sm text-slate-400">No security audit log entries recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl bg-slate-950/60 p-3 text-xs border border-slate-800/80 gap-2"
                    >
                      <div>
                        <span className="font-bold text-cyan-300">{log.action}</span>
                        <span className="text-slate-300 ml-2">{log.summary}</span>
                      </div>
                      <span className="text-slate-500 font-mono">
                        {new Date(log.createdAtMs).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Note Create / Edit Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveNote}
            className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 max-h-[92dvh] overflow-y-auto"
          >
            <h3 className="text-lg font-bold text-white">
              {editingNote ? 'Edit Educational Note' : 'Create Educational Note'}
            </h3>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Note Title</label>
              <input
                type="text"
                required
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="e.g. Microcontroller Interfacing & PWM Control"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Subject</label>
                <select
                  value={noteSubject}
                  onChange={(e) => setNoteSubject(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-cyan-400"
                >
                  {SUBJECT_OPTIONS.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Grade Level</label>
                <input
                  type="text"
                  required
                  value={noteGrade}
                  onChange={(e) => setNoteGrade(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Description</label>
              <textarea
                rows={3}
                required
                value={noteDesc}
                onChange={(e) => setNoteDesc(e.target.value)}
                placeholder="Concise summary of topics covered in this study module..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white focus:border-cyan-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                Topic Tags (comma-separated)
              </label>
              <input
                type="text"
                value={noteTags}
                onChange={(e) => setNoteTags(e.target.value)}
                placeholder="e.g. Logic Gates, ADC, Networking"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white focus:border-cyan-400"
              />
            </div>

            {/* Source Type Toggle: Cloud PDF Upload vs Google Drive Link */}
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNoteSourceType('pdf')}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors ${
                    noteSourceType === 'pdf'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'border border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>PDF Upload / URL</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNoteSourceType('drive')}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors ${
                    noteSourceType === 'drive'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'border border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  <span>Google Drive Link</span>
                </button>
              </div>

              {noteSourceType === 'pdf' ? (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3.5 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25">
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload PDF to Cloud Storage</span>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={handleNoteFileSelect}
                        className="hidden"
                      />
                    </label>
                    {noteFileSize > 0 && (
                      <span className="text-[11px] font-mono text-emerald-300">
                        {noteFileName} ({formatBytes(noteFileSize)})
                      </span>
                    )}
                  </div>

                  {noteUploadProgress !== null && (
                    <div className="space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full bg-cyan-400 transition-all"
                          style={{ width: `${noteUploadProgress}%` }}
                        />
                      </div>
                      <p className="text-[11px] font-mono text-cyan-300">
                        Uploading PDF... {noteUploadProgress}%
                      </p>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">
                      Direct PDF URL (populated automatically on upload)
                    </label>
                    <input
                      type="text"
                      value={notePdfUrl}
                      onChange={(e) => setNotePdfUrl(e.target.value)}
                      placeholder="https://firebasestorage.googleapis.com/... or /api/curriculum-pdf/..."
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white focus:border-cyan-400"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Google Drive Sharing Link (Anyone with the link can view)
                  </label>
                  <input
                    type="url"
                    required
                    value={noteDriveUrl}
                    onChange={(e) => setNoteDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white focus:border-cyan-400"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="notePub"
                checked={notePublished}
                onChange={(e) => setNotePublished(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-cyan-500"
              />
              <label htmlFor="notePub" className="text-xs text-slate-300">
                Publish immediately on Home &amp; Notes pages
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                disabled={savingModal}
                onClick={() => setShowNoteModal(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingModal || noteUploadProgress !== null}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2 text-xs font-semibold text-white hover:bg-cyan-400 disabled:opacity-50"
              >
                {savingModal && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Save Educational Note</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Paper Create / Edit Modal */}
      {showPaperModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSavePaper}
            className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 max-h-[92dvh] overflow-y-auto"
          >
            <h3 className="text-lg font-bold text-white">
              {editingPaper ? 'Edit Past Paper' : 'Add Past Paper'}
            </h3>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Paper Title</label>
              <input
                type="text"
                required
                value={paperTitle}
                onChange={(e) => setPaperTitle(e.target.value)}
                placeholder="e.g. G.C.E. A/L Engineering Technology 2025 — Paper I & II"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Subject</label>
                <select
                  value={paperSubject}
                  onChange={(e) => setPaperSubject(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-cyan-400"
                >
                  {SUBJECT_OPTIONS.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Year</label>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  required
                  value={paperYear}
                  onChange={(e) => setPaperYear(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Category</label>
                <input
                  type="text"
                  required
                  value={paperCategory}
                  onChange={(e) => setPaperCategory(e.target.value)}
                  placeholder="National Past Paper"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Grade</label>
                <input
                  type="text"
                  required
                  value={paperGrade}
                  onChange={(e) => setPaperGrade(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Medium / Language</label>
                <select
                  value={paperLanguage}
                  onChange={(e) => setPaperLanguage(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-400"
                >
                  <option value="English">English</option>
                  <option value="Sinhala">Sinhala</option>
                  <option value="Tamil">Tamil</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Description</label>
              <textarea
                rows={2}
                required
                value={paperDesc}
                onChange={(e) => setPaperDesc(e.target.value)}
                placeholder="Structured, MCQ, or marking scheme details..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white focus:border-cyan-400"
              />
            </div>

            {/* Source Type Toggle: Cloud PDF Upload vs Google Drive Link */}
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaperSourceType('pdf')}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors ${
                    paperSourceType === 'pdf'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'border border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>PDF Upload / URL</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaperSourceType('drive')}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors ${
                    paperSourceType === 'drive'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'border border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  <span>Google Drive Link</span>
                </button>
              </div>

              {paperSourceType === 'pdf' ? (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3.5 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25">
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload Paper PDF to Cloud Storage</span>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={handlePaperFileSelect}
                        className="hidden"
                      />
                    </label>
                    {paperFileSize > 0 && (
                      <span className="text-[11px] font-mono text-emerald-300">
                        {paperFileName} ({formatBytes(paperFileSize)})
                      </span>
                    )}
                  </div>

                  {paperUploadProgress !== null && (
                    <div className="space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full bg-cyan-400 transition-all"
                          style={{ width: `${paperUploadProgress}%` }}
                        />
                      </div>
                      <p className="text-[11px] font-mono text-cyan-300">
                        Uploading PDF... {paperUploadProgress}%
                      </p>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">
                      Direct PDF URL (populated automatically on upload)
                    </label>
                    <input
                      type="text"
                      value={paperPdfUrl}
                      onChange={(e) => setPaperPdfUrl(e.target.value)}
                      placeholder="https://firebasestorage.googleapis.com/... or /api/curriculum-pdf/..."
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white focus:border-cyan-400"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Google Drive Sharing Link (Anyone with the link can view)
                  </label>
                  <input
                    type="url"
                    required
                    value={paperDriveUrl}
                    onChange={(e) => setPaperDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white focus:border-cyan-400"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="paperPub"
                checked={paperPublished}
                onChange={(e) => setPaperPublished(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-cyan-500"
              />
              <label htmlFor="paperPub" className="text-xs text-slate-300">
                Publish immediately on Home &amp; Past Papers pages
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                disabled={savingModal}
                onClick={() => setShowPaperModal(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingModal || paperUploadProgress !== null}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2 text-xs font-semibold text-white hover:bg-cyan-400 disabled:opacity-50"
              >
                {savingModal && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Save Past Paper</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Announcement Create / Edit Modal */}
      {showAnnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveAnnouncement}
            className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 max-h-[92dvh] overflow-y-auto"
          >
            <h3 className="text-lg font-bold text-white">
              {editingAnn ? 'Edit Announcement' : 'Publish Platform Announcement'}
            </h3>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Announcement Headline</label>
              <input
                type="text"
                required
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="e.g. 2026 Model Examination Schedule Released"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Category</label>
                <select
                  value={annCategory}
                  onChange={(e) => setAnnCategory(e.target.value as AnnouncementCategory)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-cyan-400"
                >
                  {ANNOUNCEMENT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Priority Level</label>
                <select
                  value={annPriority}
                  onChange={(e) => setAnnPriority(e.target.value as AnnouncementPriority)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-cyan-400"
                >
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Message Details</label>
              <textarea
                rows={4}
                required
                value={annBody}
                onChange={(e) => setAnnBody(e.target.value)}
                placeholder="Write the full announcement details for students..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white focus:border-cyan-400"
              />
            </div>

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-300">
                  Optional Banner Image (Cloud Upload or Google Drive Link)
                </label>
                <div className="flex items-center gap-2">
                  {annImageUrl.trim() && (
                    <button
                      type="button"
                      onClick={() => setAnnImageUrl('')}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:border-slate-500 hover:text-white whitespace-nowrap shrink-0"
                    >
                      <X className="h-3 w-3" />
                      <span>Clear</span>
                    </button>
                  )}
                  <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg border border-sky-400/35 bg-sky-500/15 px-3 py-1.5 text-[11px] font-semibold text-cyan-200 hover:bg-sky-500/25 whitespace-nowrap shrink-0">
                    {annImageUploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    <span>{annImageUploading ? 'Uploading...' : 'Upload Image'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={annImageUploading}
                      onChange={handleAnnImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {annImageUploadProgress !== null && (
                <div className="space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-cyan-400 transition-all duration-150"
                      style={{ width: `${annImageUploadProgress}%` }}
                    />
                  </div>
                  <p className="text-[11px] font-mono tabular-nums text-cyan-300">
                    Uploading banner image... {annImageUploadProgress}%
                  </p>
                </div>
              )}

              <input
                type="text"
                value={annImageUrl}
                onChange={(e) => setAnnImageUrl(e.target.value)}
                onBlur={() => setAnnImageUrl((prev) => normalizeAnnouncementImageUrl(prev))}
                placeholder="https://drive.google.com/file/d/.../view?usp=sharing or https://..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white focus:border-cyan-400 focus:outline-none"
              />
              <p className="text-[11px] text-slate-400">
                Supports PNG, JPG, or WebP up to 5 MB via Firebase Cloud Storage, or paste any shared Google Drive image link.
              </p>

              {annImageUrl.trim() && (
                <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                  <ResilientImage
                    src={normalizeAnnouncementImageUrl(annImageUrl)}
                    alt={annTitle || 'Announcement banner preview'}
                    fallbackLabel="Banner preview unavailable — ensure link sharing is set to Anyone with the link"
                    className="max-h-44 w-full object-cover"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={annIsImportant}
                  onChange={(e) => setAnnIsImportant(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-cyan-500"
                />
                <span>Display as Important Home Popup Notice for unread students</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={annPublished}
                  onChange={(e) => setAnnPublished(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-cyan-500"
                />
                <span>Publish immediately</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                disabled={savingModal}
                onClick={() => setShowAnnModal(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingModal || annImageUploading}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2 text-xs font-semibold text-white hover:bg-cyan-400 disabled:opacity-50"
              >
                {savingModal && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Save Announcement</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Universal Cross-Browser Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={
          deleteTarget?.kind === 'note'
            ? 'Delete Educational Note'
            : deleteTarget?.kind === 'paper'
            ? 'Delete Past Paper'
            : 'Delete Announcement'
        }
        description={
          deleteTarget
            ? `Are you sure you want to permanently delete "${deleteTarget.item.title}"? This action cannot be undone.`
            : ''
        }
        busy={deleteBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
