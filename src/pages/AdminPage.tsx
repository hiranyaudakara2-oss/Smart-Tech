import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  ClipboardCheck,
  Database,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  Trophy,
  Upload,
  Users,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { ConfirmDialog, ResilientImage } from '../components/SharedUI';
import { AdminLoginGate } from '../components/AdminLoginGate';
import {
  AdminExamResultsPanel,
  AdminOnlineExamManagementPanel,
} from '../components/AdminExamManager';
import { AdminRankBoardManager } from '../components/AdminRankBoardManager';
import { VISUAL_ASSETS } from '../assets/visualCatalog';
import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from '../lib/firebase';
import {
  formatBytes,
  formatColomboDateTime,
  formatShortDate,
  getResourceTargetUrl,
  isGoogleDriveResource,
  parseTagsInput,
  validateGoogleDriveUrl,
  validateNoteFormInput,
  validatePaperFormInput,
} from '../utils/platformLogic';
import {
  configureAdminSecondaryPassphrase,
  createAnnouncementDocument,
  createNoteDocument,
  createPaperDocument,
  deleteAnnouncementDocument,
  deleteNoteDocument,
  deletePaperDocument,
  fetchAdminSecuritySettingsStatus,
  grantAdminPrivilege,
  reconcilePlatformStats,
  revokeAdminPrivilege,
  seedStarterCurriculumByAdmin,
  updateAnnouncementDocument,
  updateNoteDocument,
  updatePaperDocument,
  uploadNoticeImageFile,
  uploadValidatedPdfFile,
} from '../services/platformService';
import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementPriority,
  ExamPaper,
  NoteResource,
  ResourceSourceType,
} from '../types/platform';

type AdminSectionId =
  | 'overview'
  | 'users'
  | 'announcements'
  | 'notes'
  | 'papers'
  | 'exams'
  | 'results'
  | 'rank-board'
  | 'statistics'
  | 'settings';

const SIDEBAR_SECTIONS: Array<{
  id: AdminSectionId;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'users', label: 'User Management', Icon: Users },
  { id: 'announcements', label: 'Messages and Announcements', Icon: Bell },
  { id: 'notes', label: 'Educational Notes', Icon: BookOpen },
  { id: 'papers', label: 'PDF Paper Management', Icon: FileText },
  { id: 'exams', label: 'Online Exam Management', Icon: ClipboardCheck },
  { id: 'results', label: 'Examination Results', Icon: FileSpreadsheet },
  { id: 'rank-board', label: 'Automatic Rank Board', Icon: Trophy },
  { id: 'statistics', label: 'Website Statistics', Icon: BarChart3 },
  { id: 'settings', label: 'Admin Settings', Icon: Settings },
];

export function AdminPage() {
  const {
    authReady,
    firebaseUser,
    isVerifiedAdmin,
    adminServerVerified,
    logoutAdminSession,
    stats,
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
    navigate,
    pushToast,
  } = usePlatform();

  const [activeSection, setActiveSection] = useState<AdminSectionId>('overview');
  const [seeding, setSeeding] = useState(false);
  const [seededSampleCode, setSeededSampleCode] = useState<string | null>(null);

  // User Management Search
  const [userSearch, setUserSearch] = useState('');

  // Announcements & Important Popup Notice Form State
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annCategory, setAnnCategory] = useState<AnnouncementCategory>('Important Announcement');
  const [annPriority, setAnnPriority] = useState<AnnouncementPriority>('urgent');
  const [annIsImportant, setAnnIsImportant] = useState(true);
  const [annImageUrl, setAnnImageUrl] = useState('');
  const [annImageUploadPct, setAnnImageUploadPct] = useState<number | null>(null);
  const [annPublished, setAnnPublished] = useState(true);
  const [annBusy, setAnnBusy] = useState(false);

  // Educational Notes Form State
  const [editingNote, setEditingNote] = useState<NoteResource | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteSubject, setNoteSubject] = useState('Engineering Technology');
  const [noteGrade, setNoteGrade] = useState('Grade 13 (G.C.E. A/L)');
  const [noteTagsInput, setNoteTagsInput] = useState('');
  const [noteDesc, setNoteDesc] = useState('');
  const [noteThumb, setNoteThumb] = useState<string>(VISUAL_ASSETS.thumbEngineeringTech);
  const [notePublished, setNotePublished] = useState(true);
  const [noteSourceType, setNoteSourceType] = useState<ResourceSourceType>('drive');
  const [noteDriveUrl, setNoteDriveUrl] = useState('');
  const [noteFile, setNoteFile] = useState<File | null>(null);
  const [noteUploadPct, setNoteUploadPct] = useState<number | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);

  // PDF Paper Management Form State
  const [editingPaper, setEditingPaper] = useState<ExamPaper | null>(null);
  const [paperTitle, setPaperTitle] = useState('');
  const [paperSubject, setPaperSubject] = useState('Engineering Technology');
  const [paperCategory, setPaperCategory] = useState('National Past Paper');
  const [paperYear, setPaperYear] = useState(new Date().getFullYear());
  const [paperGrade, setPaperGrade] = useState('Grade 13 (G.C.E. A/L)');
  const [paperType, setPaperType] = useState('National A/L');
  const [paperLang, setPaperLang] = useState('English');
  const [paperDesc, setPaperDesc] = useState('');
  const [paperPublished, setPaperPublished] = useState(true);
  const [paperSourceType, setPaperSourceType] = useState<ResourceSourceType>('drive');
  const [paperDriveUrl, setPaperDriveUrl] = useState('');
  const [paperFile, setPaperFile] = useState<File | null>(null);
  const [paperUploadPct, setPaperUploadPct] = useState<number | null>(null);
  const [paperError, setPaperError] = useState<string | null>(null);
  const [paperBusy, setPaperBusy] = useState(false);

  // Statistics State
  const [reconcilingStats, setReconcilingStats] = useState(false);

  // Delete Confirmation Modal
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    action: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const adminUidSet = useMemo(() => new Set(allAdmins.map((a) => a.uid)), [allAdmins]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter((u) =>
      `${u.displayName} ${u.email} ${u.grade || ''} ${u.role}`.toLowerCase().includes(q)
    );
  }, [allUsers, userSearch]);

  if (!authReady) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="glass-surface h-64 animate-pulse rounded-2xl p-8" />
      </div>
    );
  }

  // Enforce Dedicated Administrator Login Gate unless verified on both Firebase & Server
  if (!firebaseUser || !isVerifiedAdmin || !adminServerVerified) {
    return <AdminLoginGate />;
  }

  // =========================================================================
  // Verified Administrator Action Handlers
  // =========================================================================

  const handleSeedStarterData = async () => {
    setSeeding(true);
    try {
      const { sampleExamCode } = await seedStarterCurriculumByAdmin();
      setSeededSampleCode(sampleExamCode);
      pushToast(
        'success',
        'Starter curriculum & native exam published',
        `Sample 6-digit exam password: ${sampleExamCode}`
      );
    } catch (err) {
      pushToast('error', 'Curriculum seed failed', err instanceof Error ? err.message : '');
    } finally {
      setSeeding(false);
    }
  };

  // --- Announcements ---
  const resetAnnForm = () => {
    setEditingAnn(null);
    setAnnTitle('');
    setAnnBody('');
    setAnnCategory('Important Announcement');
    setAnnPriority('urgent');
    setAnnIsImportant(true);
    setAnnImageUrl('');
    setAnnImageUploadPct(null);
    setAnnPublished(true);
  };

  const handleNoticeImageUpload = async (file: File | null) => {
    if (!file) return;
    setAnnImageUploadPct(10);
    try {
      const uploadedUrl = await uploadNoticeImageFile(file, (pct) => setAnnImageUploadPct(pct));
      setAnnImageUrl(uploadedUrl);
      pushToast('success', 'Notice image uploaded');
    } catch (err) {
      pushToast('error', 'Image upload failed', err instanceof Error ? err.message : '');
    } finally {
      setAnnImageUploadPct(null);
    }
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (annTitle.trim().length < 2 || annBody.trim().length < 4) {
      pushToast('error', 'Validation error', 'Enter both an announcement title and message body.');
      return;
    }
    setAnnBusy(true);
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
        pushToast('success', 'Announcement updated');
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
        pushToast(
          'success',
          annPublished ? 'Announcement published live' : 'Announcement saved as draft'
        );
      }
      resetAnnForm();
    } catch (err) {
      pushToast('error', 'Announcement error', err instanceof Error ? err.message : '');
    } finally {
      setAnnBusy(false);
    }
  };

  // --- Educational Notes ---
  const resetNoteForm = () => {
    setEditingNote(null);
    setNoteTitle('');
    setNoteSubject('Engineering Technology');
    setNoteGrade('Grade 13 (G.C.E. A/L)');
    setNoteTagsInput('');
    setNoteDesc('');
    setNoteThumb(VISUAL_ASSETS.thumbEngineeringTech);
    setNotePublished(true);
    setNoteSourceType('drive');
    setNoteDriveUrl('');
    setNoteFile(null);
    setNoteUploadPct(null);
    setNoteError(null);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setNoteError(null);
    const valErr = validateNoteFormInput({
      title: noteTitle,
      subject: noteSubject,
      grade: noteGrade,
      description: noteDesc,
    });
    if (valErr) {
      setNoteError(valErr);
      return;
    }

    if (noteSourceType === 'drive') {
      const driveCheck = validateGoogleDriveUrl(noteDriveUrl);
      if (!driveCheck.valid) {
        setNoteError(driveCheck.error || 'Please enter a valid Google Drive sharing link.');
        return;
      }
    } else if ((!editingNote || isGoogleDriveResource(editingNote)) && !noteFile) {
      setNoteError('Please choose a PDF file (.pdf, max 25 MB) or switch to Google Drive Link.');
      return;
    }

    const parsedTags = parseTagsInput(noteTagsInput);
    setNoteBusy(true);
    try {
      if (editingNote) {
        if (noteSourceType === 'drive') {
          const driveCheck = validateGoogleDriveUrl(noteDriveUrl);
          await updateNoteDocument(editingNote, {
            title: noteTitle,
            subject: noteSubject,
            grade: noteGrade,
            description: noteDesc,
            tags: parsedTags,
            thumbnailUrl: noteThumb,
            published: notePublished,
            sourceType: 'drive',
            driveUrl: driveCheck.normalizedUrl,
            pdfUrl: driveCheck.normalizedUrl,
          });
          pushToast('success', 'Educational note updated with Google Drive link');
        } else {
          let filePatch: Partial<NoteResource> = { sourceType: 'pdf', driveUrl: '' };
          if (noteFile) {
            setNoteUploadPct(5);
            const up = await uploadValidatedPdfFile(noteFile, 'notes', (pct) =>
              setNoteUploadPct(pct)
            );
            filePatch = {
              sourceType: 'pdf',
              driveUrl: '',
              pdfUrl: up.pdfUrl,
              storagePath: up.storagePath,
              fileName: up.fileName,
              fileSize: up.fileSize,
            };
          }
          await updateNoteDocument(editingNote, {
            title: noteTitle,
            subject: noteSubject,
            grade: noteGrade,
            description: noteDesc,
            tags: parsedTags,
            thumbnailUrl: noteThumb,
            published: notePublished,
            ...filePatch,
          });
          pushToast('success', 'Educational note updated');
        }
      } else if (noteSourceType === 'drive') {
        const driveCheck = validateGoogleDriveUrl(noteDriveUrl);
        await createNoteDocument({
          title: noteTitle,
          subject: noteSubject,
          grade: noteGrade,
          description: noteDesc,
          tags: parsedTags,
          sourceType: 'drive',
          driveUrl: driveCheck.normalizedUrl,
          pdfUrl: driveCheck.normalizedUrl,
          storagePath: '',
          fileName: 'Google Drive Document',
          fileSize: 0,
          thumbnailUrl: noteThumb,
          published: notePublished,
        });
        pushToast('success', 'Google Drive note added to library');
      } else {
        setNoteUploadPct(5);
        const up = await uploadValidatedPdfFile(noteFile!, 'notes', (pct) =>
          setNoteUploadPct(pct)
        );
        await createNoteDocument({
          title: noteTitle,
          subject: noteSubject,
          grade: noteGrade,
          description: noteDesc,
          tags: parsedTags,
          sourceType: 'pdf',
          driveUrl: '',
          pdfUrl: up.pdfUrl,
          storagePath: up.storagePath,
          fileName: up.fileName,
          fileSize: up.fileSize,
          thumbnailUrl: noteThumb,
          published: notePublished,
        });
        pushToast('success', 'Educational note uploaded');
      }
      resetNoteForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save note.';
      setNoteError(msg);
      pushToast('error', 'Note save failed', msg);
    } finally {
      setNoteBusy(false);
      setNoteUploadPct(null);
    }
  };

  // --- PDF & Google Drive Paper Management ---
  const resetPaperForm = () => {
    setEditingPaper(null);
    setPaperTitle('');
    setPaperSubject('Engineering Technology');
    setPaperCategory('National Past Paper');
    setPaperYear(new Date().getFullYear());
    setPaperGrade('Grade 13 (G.C.E. A/L)');
    setPaperType('National A/L');
    setPaperLang('English');
    setPaperDesc('');
    setPaperPublished(true);
    setPaperSourceType('drive');
    setPaperDriveUrl('');
    setPaperFile(null);
    setPaperUploadPct(null);
    setPaperError(null);
  };

  const handleSavePaper = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaperError(null);
    const valErr = validatePaperFormInput({
      title: paperTitle,
      subject: paperSubject,
      category: paperCategory,
      year: Number(paperYear),
      grade: paperGrade,
      examType: paperType,
      language: paperLang,
      description: paperDesc,
    });
    if (valErr) {
      setPaperError(valErr);
      return;
    }

    if (paperSourceType === 'drive') {
      const driveCheck = validateGoogleDriveUrl(paperDriveUrl);
      if (!driveCheck.valid) {
        setPaperError(driveCheck.error || 'Please enter a valid Google Drive sharing link.');
        return;
      }
    } else if ((!editingPaper || isGoogleDriveResource(editingPaper)) && !paperFile) {
      setPaperError(
        'Please select a PDF examination paper file (.pdf, max 25 MB) or switch to Google Drive Link.'
      );
      return;
    }

    setPaperBusy(true);
    try {
      if (editingPaper) {
        if (paperSourceType === 'drive') {
          const driveCheck = validateGoogleDriveUrl(paperDriveUrl);
          await updatePaperDocument(editingPaper, {
            title: paperTitle,
            subject: paperSubject,
            category: paperCategory,
            year: Number(paperYear),
            grade: paperGrade,
            examType: paperType,
            language: paperLang,
            description: paperDesc,
            published: paperPublished,
            sourceType: 'drive',
            driveUrl: driveCheck.normalizedUrl,
            pdfUrl: driveCheck.normalizedUrl,
          });
          pushToast('success', 'Past paper updated with Google Drive link');
        } else {
          let filePatch: Partial<ExamPaper> = { sourceType: 'pdf', driveUrl: '' };
          if (paperFile) {
            setPaperUploadPct(5);
            const up = await uploadValidatedPdfFile(paperFile, 'papers', (pct) =>
              setPaperUploadPct(pct)
            );
            filePatch = {
              sourceType: 'pdf',
              driveUrl: '',
              pdfUrl: up.pdfUrl,
              storagePath: up.storagePath,
              fileName: up.fileName,
              fileSize: up.fileSize,
            };
          }
          await updatePaperDocument(editingPaper, {
            title: paperTitle,
            subject: paperSubject,
            category: paperCategory,
            year: Number(paperYear),
            grade: paperGrade,
            examType: paperType,
            language: paperLang,
            description: paperDesc,
            published: paperPublished,
            ...filePatch,
          });
          pushToast('success', 'Past examination paper updated');
        }
      } else if (paperSourceType === 'drive') {
        const driveCheck = validateGoogleDriveUrl(paperDriveUrl);
        await createPaperDocument({
          title: paperTitle,
          subject: paperSubject,
          category: paperCategory,
          year: Number(paperYear),
          grade: paperGrade,
          examType: paperType,
          language: paperLang,
          description: paperDesc,
          sourceType: 'drive',
          driveUrl: driveCheck.normalizedUrl,
          pdfUrl: driveCheck.normalizedUrl,
          storagePath: '',
          fileName: 'Google Drive Document',
          fileSize: 0,
          published: paperPublished,
        });
        pushToast('success', 'Google Drive past paper added to archive');
      } else {
        setPaperUploadPct(5);
        const up = await uploadValidatedPdfFile(paperFile!, 'papers', (pct) =>
          setPaperUploadPct(pct)
        );
        await createPaperDocument({
          title: paperTitle,
          subject: paperSubject,
          category: paperCategory,
          year: Number(paperYear),
          grade: paperGrade,
          examType: paperType,
          language: paperLang,
          description: paperDesc,
          sourceType: 'pdf',
          driveUrl: '',
          pdfUrl: up.pdfUrl,
          storagePath: up.storagePath,
          fileName: up.fileName,
          fileSize: up.fileSize,
          published: paperPublished,
        });
        pushToast('success', 'PDF examination paper uploaded');
      }
      resetPaperForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Paper save failed.';
      setPaperError(msg);
      pushToast('error', 'Paper save failed', msg);
    } finally {
      setPaperBusy(false);
      setPaperUploadPct(null);
    }
  };

  const activeSectionMeta =
    SIDEBAR_SECTIONS.find((s) => s.id === activeSection) || SIDEBAR_SECTIONS[0];

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Sidebar Navigation (11 Requested Sections including Logout) */}
        <aside className="lg:col-span-3 xl:col-span-3">
          <div className="glass-panel sticky top-20 rounded-2xl p-4">
            <div className="border-b border-slate-800/90 px-2 pb-3.5">
              <p className="text-[11px] font-medium text-cyan-300">Smart Tech Admin Console</p>
              <p className="mt-0.5 truncate text-xs text-slate-300">{firebaseUser.email}</p>
            </div>

            <nav aria-label="Administrator dashboard navigation" className="mt-3 space-y-1">
              {SIDEBAR_SECTIONS.map(({ id, label, Icon }) => {
                const isActive = activeSection === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveSection(id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-sky-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}

              {/* 11. Dedicated Logout Control */}
              <div className="border-t border-slate-800/90 pt-2">
                <button
                  type="button"
                  onClick={logoutAdminSession}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-950/40 hover:text-rose-200"
                >
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Logout</span>
                </button>
              </div>
            </nav>
          </div>
        </aside>

        {/* Main Workspace Canvas */}
        <div className="space-y-6 lg:col-span-9 xl:col-span-9">
          {/* Contextual Top Header */}
          <div className="glass-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl px-6 py-4">
            <div>
              <p className="text-xs text-slate-400">
                Admin Dashboard / <span className="text-cyan-300">{activeSectionMeta.label}</span>
              </p>
              <h1 className="mt-0.5 font-display text-2xl font-bold text-slate-50">
                {activeSectionMeta.label}
              </h1>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigate('setup-guide')}
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white whitespace-nowrap"
              >
                Security &amp; Setup Guide
              </button>
            </div>
          </div>

          {/* =============================================================== */}
          {/* SECTION 1: OVERVIEW */}
          {/* =============================================================== */}
          {activeSection === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
                <div className="glass-surface rounded-2xl p-4">
                  <p className="text-xs text-slate-400">Users</p>
                  <p className="mt-1 font-mono text-2xl font-semibold text-slate-50 tabular-nums">
                    {Math.max(stats.totalUsers, allUsers.length)}
                  </p>
                </div>
                <div className="glass-surface rounded-2xl p-4">
                  <p className="text-xs text-slate-400">Notes</p>
                  <p className="mt-1 font-mono text-2xl font-semibold text-slate-50 tabular-nums">
                    {allNotes.length}
                  </p>
                </div>
                <div className="glass-surface rounded-2xl p-4">
                  <p className="text-xs text-slate-400">PDF Papers</p>
                  <p className="mt-1 font-mono text-2xl font-semibold text-slate-50 tabular-nums">
                    {allPapers.length}
                  </p>
                </div>
                <div className="glass-surface rounded-2xl p-4">
                  <p className="text-xs text-slate-400">Online Exams</p>
                  <p className="mt-1 font-mono text-2xl font-semibold text-cyan-300 tabular-nums">
                    {allExams.length}
                  </p>
                </div>
                <div className="glass-surface rounded-2xl p-4">
                  <p className="text-xs text-slate-400">Submissions</p>
                  <p className="mt-1 font-mono text-2xl font-semibold text-emerald-300 tabular-nums">
                    {Math.max(stats.completedAttempts || 0, allExamAttempts.length)}
                  </p>
                </div>
                <div className="glass-surface rounded-2xl p-4">
                  <p className="text-xs text-slate-400">Rank Entries</p>
                  <p className="mt-1 font-mono text-2xl font-semibold text-amber-300 tabular-nums">
                    {Math.max(
                      stats.publishedResults || 0,
                      allRankEntries.length + allCustomRankEntries.length
                    )}
                  </p>
                </div>
              </div>

              {/* Starter Curriculum & Sample 6-Digit Exam Initializer */}
              <div className="glass-panel flex flex-col justify-between gap-4 rounded-2xl p-6 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-base font-semibold text-slate-50">
                    Quick Curriculum &amp; 6-Digit Online Exam Initializer
                  </h2>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-300">
                    Populate real Cloud Firestore Technology Stream PDF notes, past papers, an
                    Important Home Popup announcement, and a ready-to-sit 5-question Native Online
                    Examination with an encrypted 6-digit password.
                  </p>
                  {seededSampleCode && (
                    <p className="mt-2 font-mono text-xs font-semibold text-cyan-300 tabular-nums">
                      Generated Sample Exam 6-Digit Password: {seededSampleCode}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={seeding}
                  onClick={handleSeedStarterData}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Database className="h-3.5 w-3.5" aria-hidden="true" />
                  {seeding ? 'Writing Records...' : 'Seed Starter Curriculum'}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="glass-surface rounded-2xl p-6">
                  <h2 className="text-base font-semibold text-slate-50">Recent Resource Uploads</h2>
                  {allNotes.length === 0 && allPapers.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-400">No PDF resources uploaded yet.</p>
                  ) : (
                    <ul className="mt-4 divide-y divide-slate-800/80 text-xs">
                      {[...allNotes.slice(0, 3), ...allPapers.slice(0, 3)]
                        .sort((a, b) => b.createdAtMs - a.createdAtMs)
                        .slice(0, 6)
                        .map((item) => (
                          <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-100">{item.title}</p>
                              <p className="text-slate-400">
                                {item.subject} · {item.published ? 'Published' : 'Draft'}
                              </p>
                            </div>
                            <span className="shrink-0 font-mono text-slate-500 tabular-nums">
                              {formatShortDate(item.createdAtMs)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>

                <div className="glass-surface rounded-2xl p-6">
                  <h2 className="text-base font-semibold text-slate-50">
                    Recent Administrative Audit Activity
                  </h2>
                  {auditLogs.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-400">
                      Privileged operations are logged automatically as actions occur.
                    </p>
                  ) : (
                    <ul className="mt-4 divide-y divide-slate-800/80 text-xs">
                      {auditLogs.slice(0, 6).map((log) => (
                        <li key={log.id} className="py-3">
                          <div className="flex items-center justify-between gap-2 text-slate-400">
                            <span className="font-mono text-cyan-300">{log.action}</span>
                            <span className="font-mono tabular-nums">
                              {formatShortDate(log.createdAtMs)}
                            </span>
                          </div>
                          <p className="mt-1 text-slate-200">{log.summary}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* SECTION 2: USER MANAGEMENT */}
          {/* =============================================================== */}
          {activeSection === 'users' && (
            <div className="space-y-6">
              <div className="glass-surface rounded-2xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="w-full max-w-md">
                    <label htmlFor="adm-user-search" className="block text-xs font-medium text-slate-300">
                      Search Registered Accounts ({allUsers.length})
                    </label>
                    <input
                      id="adm-user-search"
                      type="search"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Filter by student name, email, or stream..."
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                    />
                  </div>
                  <p className="text-xs text-slate-400">
                    Role assignments write directly to <code className="font-mono text-slate-200">/admins/&#123;uid&#125;</code>.
                  </p>
                </div>
              </div>

              {filteredUsers.length === 0 ? (
                <div className="glass-surface rounded-2xl p-8 text-center text-sm text-slate-400">
                  No registered user profiles match your search criteria.
                </div>
              ) : (
                <div className="glass-surface overflow-hidden rounded-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 bg-[#070f20] text-xs text-slate-400">
                          <th className="px-4 py-3 font-medium">User</th>
                          <th className="px-4 py-3 font-medium">Academic Stream</th>
                          <th className="px-4 py-3 font-medium">Role</th>
                          <th className="px-4 py-3 font-medium">Last Active</th>
                          <th className="px-4 py-3 text-right font-medium">Privilege Control</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {filteredUsers.map((u) => {
                          const isOwner = u.email.toLowerCase() === 'hiranyaudakara2@gmail.com';
                          const holdsAdmin = isOwner || adminUidSet.has(u.uid) || u.role === 'admin';
                          return (
                            <tr key={u.uid} className="hover:bg-sky-500/[0.03]">
                              <td className="px-4 py-3">
                                <p className="font-medium text-slate-100">{u.displayName}</p>
                                <p className="text-xs text-slate-400">{u.email}</p>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-300">
                                {u.grade || 'Technology Stream'}
                              </td>
                              <td className="px-4 py-3 text-xs">
                                <span className={holdsAdmin ? 'font-semibold text-cyan-300' : 'text-slate-300'}>
                                  {isOwner
                                    ? 'Primary Owner Admin'
                                    : holdsAdmin
                                    ? 'Administrator'
                                    : 'Student'}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-400 tabular-nums whitespace-nowrap">
                                {formatShortDate(u.lastLoginAtMs)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {isOwner ? (
                                  <span className="text-xs text-slate-500">Protected Owner</span>
                                ) : holdsAdmin ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmState({
                                        title: 'Revoke Administrator Privileges',
                                        description: `Revoke administrator privileges from ${u.email}?`,
                                        confirmLabel: 'Revoke Role',
                                        action: async () => {
                                          await revokeAdminPrivilege(u.uid, u.email);
                                          pushToast('info', 'Admin privilege revoked');
                                        },
                                      })
                                    }
                                    className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-950/40"
                                  >
                                    Revoke Admin
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmState({
                                        title: 'Grant Administrator Privileges',
                                        description: `Grant full administrator privileges to ${u.email}?`,
                                        confirmLabel: 'Grant Admin Role',
                                        action: async () => {
                                          await grantAdminPrivilege(u.uid, u.email);
                                          pushToast('success', 'Administrator role granted');
                                        },
                                      })
                                    }
                                    className="rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-sky-500/20"
                                  >
                                    Grant Admin
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* SECTION 3: MESSAGES AND ANNOUNCEMENTS (WITH HOME POPUP PREVIEW) */}
          {/* =============================================================== */}
          {activeSection === 'announcements' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <form
                  onSubmit={handleSaveAnnouncement}
                  className="glass-surface rounded-2xl p-6 xl:col-span-7"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-slate-50">
                      {editingAnn ? 'Edit Official Message' : 'Publish Official Message / Home Popup'}
                    </h2>
                    {editingAnn && (
                      <button
                        type="button"
                        onClick={resetAnnForm}
                        className="text-xs text-slate-400 hover:text-white"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label htmlFor="ann-title" className="block text-xs font-medium text-slate-300">
                        Message Title
                      </label>
                      <input
                        id="ann-title"
                        type="text"
                        required
                        maxLength={160}
                        value={annTitle}
                        onChange={(e) => setAnnTitle(e.target.value)}
                        placeholder="e.g., Special Mock Examination Opens Friday at 8:00 AM"
                        className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="ann-cat" className="block text-xs font-medium text-slate-300">
                          Category
                        </label>
                        <select
                          id="ann-cat"
                          value={annCategory}
                          onChange={(e) =>
                            setAnnCategory(e.target.value as AnnouncementCategory)
                          }
                          className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
                        >
                          <option value="Important Announcement">Important Announcement</option>
                          <option value="Exam Notice">Exam Notice</option>
                          <option value="New Upload">New Upload</option>
                          <option value="General Notice">General Notice</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="ann-prio" className="block text-xs font-medium text-slate-300">
                          Priority Level
                        </label>
                        <select
                          id="ann-prio"
                          value={annPriority}
                          onChange={(e) =>
                            setAnnPriority(e.target.value as AnnouncementPriority)
                          }
                          className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
                        >
                          <option value="urgent">Urgent</option>
                          <option value="high">High</option>
                          <option value="normal">Normal</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="ann-body" className="block text-xs font-medium text-slate-300">
                        Message Content
                      </label>
                      <textarea
                        id="ann-body"
                        rows={4}
                        required
                        maxLength={3000}
                        value={annBody}
                        onChange={(e) => setAnnBody(e.target.value)}
                        placeholder="Write clear instructions, dates, or educational updates for students..."
                        className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300">
                        Optional Notice Banner Image (PNG / JPG / WebP, max 5 MB)
                      </label>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-cyan-300 hover:border-sky-400/50">
                          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          {annImageUploadPct !== null
                            ? `Uploading (${annImageUploadPct}%)...`
                            : 'Upload Notice Image'}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => handleNoticeImageUpload(e.target.files?.[0] || null)}
                            className="hidden"
                          />
                        </label>
                        {annImageUrl && (
                          <button
                            type="button"
                            onClick={() => setAnnImageUrl('')}
                            className="text-xs text-rose-300 hover:text-rose-200"
                          >
                            Remove attached image
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-6 pt-1 text-xs text-slate-300">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={annIsImportant}
                          onChange={(e) => setAnnIsImportant(e.target.checked)}
                          className="rounded border-slate-600 bg-slate-900"
                        />
                        Feature in Home Page Important Message Popup
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={annPublished}
                          onChange={(e) => setAnnPublished(e.target.checked)}
                          className="rounded border-slate-600 bg-slate-900"
                        />
                        Published (active to visitors &amp; students)
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={annBusy}
                      className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                    >
                      {annBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                      {annBusy
                        ? 'Saving...'
                        : editingAnn
                        ? 'Update Message'
                        : 'Publish Message'}
                    </button>
                  </div>
                </form>

                {/* Live Home Popup Preview */}
                <div className="glass-surface rounded-2xl p-6 xl:col-span-5">
                  <p className="text-xs font-medium text-cyan-300">Live Home Popup Preview</p>
                  <div className="mt-3 overflow-hidden rounded-2xl border border-cyan-400/35 bg-[#060c1b]">
                    <div className="border-b border-slate-800 px-4 py-3 text-xs text-cyan-300">
                      {annIsImportant ? 'Important Administrator Notice' : annCategory} ·{' '}
                      <span className="font-mono text-slate-400 tabular-nums">
                        {formatColomboDateTime(Date.now())}
                      </span>
                    </div>
                    {annImageUrl && (
                      <div className="h-36 w-full overflow-hidden border-b border-slate-800">
                        <ResilientImage
                          src={annImageUrl}
                          alt="Notice preview"
                          fallbackLabel="Notice Image"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="font-display text-base font-bold text-slate-50">
                        {annTitle.trim() || 'Announcement Title Preview'}
                      </h3>
                      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-300">
                        {annBody.trim() ||
                          'Your message content will appear here automatically on the Home page popup when published.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Existing Announcements List */}
              <div className="glass-surface rounded-2xl p-6">
                <h3 className="text-base font-semibold text-slate-50">
                  All Messages &amp; Announcements ({allAnnouncements.length})
                </h3>
                {allAnnouncements.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400">No announcements created yet.</p>
                ) : (
                  <div className="mt-4 divide-y divide-slate-800/80">
                    {allAnnouncements.map((ann) => (
                      <div
                        key={ann.id}
                        className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                            <span className="text-cyan-300">
                              {ann.isImportant ? 'Important Home Popup' : ann.category}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{ann.published ? 'Published' : 'Unpublished'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {formatColomboDateTime(ann.publishedAtMs || ann.createdAtMs)}
                            </span>
                          </div>
                          <h4 className="mt-1 truncate text-sm font-semibold text-slate-100">
                            {ann.title}
                          </h4>
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{ann.body}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              updateAnnouncementDocument(ann, {
                                published: !ann.published,
                              }).then(() =>
                                pushToast(
                                  'info',
                                  ann.published
                                    ? 'Announcement unpublished'
                                    : 'Announcement published'
                                )
                              )
                            }
                            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white"
                          >
                            {ann.published ? 'Unpublish' : 'Publish'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAnn(ann);
                              setAnnTitle(ann.title);
                              setAnnBody(ann.body);
                              setAnnCategory(ann.category);
                              setAnnPriority(ann.priority);
                              setAnnIsImportant(ann.isImportant);
                              setAnnImageUrl(ann.imageUrl || '');
                              setAnnPublished(ann.published);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:text-white"
                          >
                            <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmState({
                                title: 'Delete Announcement',
                                description: `Delete "${ann.title}" permanently? It will immediately stop appearing to visitors.`,
                                action: async () => {
                                  await deleteAnnouncementDocument(ann);
                                  pushToast('info', 'Announcement deleted');
                                },
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-medium text-rose-300 hover:border-rose-500/40"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* SECTION 4: EDUCATIONAL NOTES */}
          {/* =============================================================== */}
          {activeSection === 'notes' && (
            <div className="space-y-6">
              <form onSubmit={handleSaveNote} className="glass-surface rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-50">
                      {editingNote
                        ? `Edit Note: ${editingNote.title}`
                        : 'Add Educational Note (Google Drive Link or PDF)'}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Provide a Google Drive sharing URL or upload a binary PDF document directly.
                    </p>
                  </div>
                  {editingNote && (
                    <button
                      type="button"
                      onClick={resetNoteForm}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                {noteError && (
                  <div
                    role="alert"
                    className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/30 p-3.5 text-xs text-rose-200"
                  >
                    {noteError}
                  </div>
                )}

                {/* Document Source Mode Selector */}
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-[#060b18]/80 p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNoteSourceType('drive');
                      setNoteError(null);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                      noteSourceType === 'drive'
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Google Drive Sharing Link
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNoteSourceType('pdf');
                      setNoteError(null);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                      noteSourceType === 'pdf'
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    Upload PDF File Directly
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="adm-note-title" className="block text-xs font-medium text-slate-300">
                      Document Title
                    </label>
                    <input
                      id="adm-note-title"
                      type="text"
                      required
                      maxLength={160}
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      placeholder="e.g., Operational Amplifiers & Sensor Interfacing"
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="adm-note-subj" className="block text-xs font-medium text-slate-300">
                      Subject / Technology Stream
                    </label>
                    <input
                      id="adm-note-subj"
                      type="text"
                      required
                      maxLength={80}
                      value={noteSubject}
                      onChange={(e) => setNoteSubject(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="adm-note-grade" className="block text-xs font-medium text-slate-300">
                      Grade / Academic Level
                    </label>
                    <input
                      id="adm-note-grade"
                      type="text"
                      required
                      maxLength={40}
                      value={noteGrade}
                      onChange={(e) => setNoteGrade(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="adm-note-tags" className="block text-xs font-medium text-slate-300">
                      Topic Tags (comma-separated, up to 10 tags)
                    </label>
                    <input
                      id="adm-note-tags"
                      type="text"
                      value={noteTagsInput}
                      onChange={(e) => setNoteTagsInput(e.target.value)}
                      placeholder="e.g., Microcontrollers, PWM, Electronics, Unit 04"
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="adm-note-desc" className="block text-xs font-medium text-slate-300">
                      Description
                    </label>
                    <textarea
                      id="adm-note-desc"
                      rows={3}
                      required
                      maxLength={2000}
                      value={noteDesc}
                      onChange={(e) => setNoteDesc(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="adm-note-thumb" className="block text-xs font-medium text-slate-300">
                      Cover Preset
                    </label>
                    <select
                      id="adm-note-thumb"
                      value={noteThumb}
                      onChange={(e) => setNoteThumb(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
                    >
                      <option value={VISUAL_ASSETS.thumbEngineeringTech}>
                        Engineering &amp; Embedded Systems
                      </option>
                      <option value={VISUAL_ASSETS.thumbBiosystemsTech}>
                        Biosystems &amp; Instrumentation
                      </option>
                      <option value={VISUAL_ASSETS.thumbIctSystems}>
                        ICT &amp; Network Systems
                      </option>
                    </select>
                  </div>

                  {noteSourceType === 'drive' ? (
                    <div className="sm:col-span-2 rounded-xl border border-sky-400/25 bg-sky-950/15 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label
                          htmlFor="adm-note-drive-url"
                          className="block text-xs font-semibold text-cyan-300"
                        >
                          Google Drive Sharing URL
                        </label>
                        {noteDriveUrl.trim() && validateGoogleDriveUrl(noteDriveUrl).valid && (
                          <a
                            href={validateGoogleDriveUrl(noteDriveUrl).normalizedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            Test Google Drive Link
                          </a>
                        )}
                      </div>
                      <input
                        id="adm-note-drive-url"
                        type="url"
                        required={noteSourceType === 'drive'}
                        maxLength={1500}
                        value={noteDriveUrl}
                        onChange={(e) => {
                          setNoteDriveUrl(e.target.value);
                          if (noteError) setNoteError(null);
                        }}
                        placeholder="https://drive.google.com/file/d/1A2B3C4D5E6F/view?usp=sharing"
                        className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-400"
                      />
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                        Sharing permission check: in Google Drive, set General Access to{' '}
                        <strong className="text-cyan-300">
                          &ldquo;Anyone with the link &rarr; Viewer&rdquo;
                        </strong>{' '}
                        so students can open this note without requesting access.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="adm-note-file" className="block text-xs font-medium text-slate-300">
                        {editingNote && !isGoogleDriveResource(editingNote)
                          ? 'Replace PDF File (Optional)'
                          : 'Select PDF File (.pdf, max 25 MB)'}
                      </label>
                      <input
                        id="adm-note-file"
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(e) => setNoteFile(e.target.files?.[0] || null)}
                        className="mt-1.5 block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500/20 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-cyan-300"
                      />
                    </div>
                  )}
                </div>

                {noteUploadPct !== null && (
                  <p className="mt-3 font-mono text-xs text-cyan-300 tabular-nums">
                    Uploading validated PDF: {noteUploadPct}%
                  </p>
                )}

                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800/80 pt-4">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={notePublished}
                      onChange={(e) => setNotePublished(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-900"
                    />
                    Publish to Note library
                  </label>

                  <button
                    type="submit"
                    disabled={noteBusy}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {noteSourceType === 'drive' ? (
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {noteBusy
                      ? 'Saving Note...'
                      : editingNote
                      ? 'Save Note Changes'
                      : noteSourceType === 'drive'
                      ? 'Save Google Drive Note'
                      : 'Upload PDF Note'}
                  </button>
                </div>
              </form>

              {/* Notes Inventory */}
              <div className="glass-surface rounded-2xl p-6">
                <h3 className="text-base font-semibold text-slate-50">
                  Educational Notes Inventory ({allNotes.length})
                </h3>
                {allNotes.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400">No notes added yet.</p>
                ) : (
                  <div className="mt-4 divide-y divide-slate-800/80">
                    {allNotes.map((n) => {
                      const isDrive = isGoogleDriveResource(n);
                      const targetUrl = getResourceTargetUrl(n);
                      const linkedRankCount = allCustomRankEntries.filter(
                        (e) => e.linkedItemType === 'note' && e.linkedItemId === n.id
                      ).length;

                      return (
                        <div
                          key={n.id}
                          className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center"
                        >
                          <div className="min-w-0">
                            <p className="text-xs text-slate-400">
                              <span className="text-cyan-300">{n.subject}</span> · {n.grade} ·{' '}
                              <span className={isDrive ? 'text-sky-300 font-medium' : ''}>
                                {isDrive ? 'Google Drive Link' : formatBytes(n.fileSize)}
                              </span>{' '}
                              · {n.published ? 'Published' : 'Draft'}
                            </p>
                            <h4 className="mt-1 truncate text-sm font-semibold text-slate-100">
                              {n.title}
                            </h4>
                            {n.tags.length > 0 && (
                              <p className="mt-0.5 truncate text-xs text-slate-500">
                                {n.tags.join(' · ')}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {targetUrl && (
                              <a
                                href={targetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white"
                              >
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                Open
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNote(n);
                                setNoteTitle(n.title);
                                setNoteSubject(n.subject);
                                setNoteGrade(n.grade);
                                setNoteTagsInput((n.tags || []).join(', '));
                                setNoteDesc(n.description);
                                setNoteThumb(n.thumbnailUrl || VISUAL_ASSETS.thumbEngineeringTech);
                                setNotePublished(n.published);
                                const driveMode = isGoogleDriveResource(n);
                                setNoteSourceType(driveMode ? 'drive' : 'pdf');
                                setNoteDriveUrl(driveMode ? getResourceTargetUrl(n) : '');
                                setNoteFile(null);
                                setNoteError(null);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:text-white"
                            >
                              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmState({
                                  title: 'Delete Educational Note',
                                  description:
                                    linkedRankCount > 0
                                      ? `Permanently delete "${n.title}"? ${linkedRankCount} Rank Board ${
                                          linkedRankCount === 1 ? 'entry' : 'entries'
                                        } explicitly linked to this note will also be removed automatically. Unrelated Rank Board entries will not be affected.`
                                      : `Permanently delete "${n.title}" from the Educational Notes library?`,
                                  confirmLabel: 'Delete Note',
                                  action: async () => {
                                    const { removedRankEntries } = await deleteNoteDocument(n);
                                    pushToast(
                                      'info',
                                      'Educational note deleted',
                                      removedRankEntries > 0
                                        ? `Removed ${removedRankEntries} linked Rank Board ${
                                            removedRankEntries === 1 ? 'entry' : 'entries'
                                          }.`
                                        : undefined
                                    );
                                  },
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-medium text-rose-300 hover:border-rose-500/40"
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
            </div>
          )}

          {/* =============================================================== */}
          {/* SECTION 5: PAST PAPER MANAGEMENT (GOOGLE DRIVE OR PDF) */}
          {/* =============================================================== */}
          {activeSection === 'papers' && (
            <div className="space-y-6">
              <form onSubmit={handleSavePaper} className="glass-surface rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-50">
                      {editingPaper
                        ? `Edit Past Paper: ${editingPaper.title}`
                        : 'Add Past Examination Paper (Google Drive Link or PDF)'}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Provide a Google Drive sharing link or upload a PDF examination paper directly.
                    </p>
                  </div>
                  {editingPaper && (
                    <button
                      type="button"
                      onClick={resetPaperForm}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                {paperError && (
                  <div
                    role="alert"
                    className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/30 p-3.5 text-xs text-rose-200"
                  >
                    {paperError}
                  </div>
                )}

                {/* Document Source Mode Selector */}
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-[#060b18]/80 p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaperSourceType('drive');
                      setPaperError(null);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                      paperSourceType === 'drive'
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Google Drive Sharing Link
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaperSourceType('pdf');
                      setPaperError(null);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                      paperSourceType === 'pdf'
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    Upload PDF File Directly
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label htmlFor="adm-paper-title" className="block text-xs font-medium text-slate-300">
                      Document Title
                    </label>
                    <input
                      id="adm-paper-title"
                      type="text"
                      required
                      maxLength={160}
                      value={paperTitle}
                      onChange={(e) => setPaperTitle(e.target.value)}
                      placeholder="e.g., G.C.E. A/L Engineering Technology 2025 — Paper I & II"
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="adm-paper-subj" className="block text-xs font-medium text-slate-300">
                      Subject
                    </label>
                    <input
                      id="adm-paper-subj"
                      type="text"
                      required
                      maxLength={80}
                      value={paperSubject}
                      onChange={(e) => setPaperSubject(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="adm-paper-cat" className="block text-xs font-medium text-slate-300">
                      Category
                    </label>
                    <input
                      id="adm-paper-cat"
                      type="text"
                      required
                      maxLength={60}
                      value={paperCategory}
                      onChange={(e) => setPaperCategory(e.target.value)}
                      placeholder="National Past Paper / Model Paper"
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="adm-paper-year" className="block text-xs font-medium text-slate-300">
                      Examination Year
                    </label>
                    <input
                      id="adm-paper-year"
                      type="number"
                      required
                      min={1990}
                      max={2100}
                      value={paperYear}
                      onChange={(e) => setPaperYear(Number(e.target.value))}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 font-mono text-sm text-slate-100 tabular-nums"
                    />
                  </div>

                  <div>
                    <label htmlFor="adm-paper-grade" className="block text-xs font-medium text-slate-300">
                      Grade / Level
                    </label>
                    <input
                      id="adm-paper-grade"
                      type="text"
                      required
                      maxLength={40}
                      value={paperGrade}
                      onChange={(e) => setPaperGrade(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="adm-paper-type" className="block text-xs font-medium text-slate-300">
                      Examination Type
                    </label>
                    <select
                      id="adm-paper-type"
                      value={paperType}
                      onChange={(e) => setPaperType(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="National A/L">National A/L</option>
                      <option value="Provincial Term Test">Provincial Term Test</option>
                      <option value="Model Paper">Model Paper</option>
                      <option value="School Term Paper">School Term Paper</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="adm-paper-lang" className="block text-xs font-medium text-slate-300">
                      Language
                    </label>
                    <select
                      id="adm-paper-lang"
                      value={paperLang}
                      onChange={(e) => setPaperLang(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="English">English</option>
                      <option value="Sinhala">Sinhala</option>
                      <option value="Tamil">Tamil</option>
                    </select>
                  </div>

                  {paperSourceType === 'drive' ? (
                    <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-sky-400/25 bg-sky-950/15 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label
                          htmlFor="adm-paper-drive-url"
                          className="block text-xs font-semibold text-cyan-300"
                        >
                          Google Drive Sharing URL
                        </label>
                        {paperDriveUrl.trim() && validateGoogleDriveUrl(paperDriveUrl).valid && (
                          <a
                            href={validateGoogleDriveUrl(paperDriveUrl).normalizedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            Test Google Drive Link
                          </a>
                        )}
                      </div>
                      <input
                        id="adm-paper-drive-url"
                        type="url"
                        required={paperSourceType === 'drive'}
                        maxLength={1500}
                        value={paperDriveUrl}
                        onChange={(e) => {
                          setPaperDriveUrl(e.target.value);
                          if (paperError) setPaperError(null);
                        }}
                        placeholder="https://drive.google.com/file/d/1A2B3C4D5E6F/view?usp=sharing"
                        className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-400"
                      />
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                        Sharing permission check: in Google Drive, set General Access to{' '}
                        <strong className="text-cyan-300">
                          &ldquo;Anyone with the link &rarr; Viewer&rdquo;
                        </strong>{' '}
                        so intended users can open the past paper immediately.
                      </p>
                    </div>
                  ) : (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label htmlFor="adm-paper-file" className="block text-xs font-medium text-slate-300">
                        {editingPaper && !isGoogleDriveResource(editingPaper)
                          ? 'Replace PDF File (Optional)'
                          : 'Select PDF File (.pdf, max 25 MB)'}
                      </label>
                      <input
                        id="adm-paper-file"
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(e) => setPaperFile(e.target.files?.[0] || null)}
                        className="mt-1.5 block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500/20 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-cyan-300"
                      />
                    </div>
                  )}

                  <div className="sm:col-span-2 lg:col-span-3">
                    <label htmlFor="adm-paper-desc" className="block text-xs font-medium text-slate-300">
                      Description / Marking Notes
                    </label>
                    <textarea
                      id="adm-paper-desc"
                      rows={2}
                      maxLength={1500}
                      value={paperDesc}
                      onChange={(e) => setPaperDesc(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100"
                    />
                  </div>
                </div>

                {paperUploadPct !== null && (
                  <p className="mt-3 font-mono text-xs text-cyan-300 tabular-nums">
                    Uploading validated PDF: {paperUploadPct}%
                  </p>
                )}

                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800/80 pt-4">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={paperPublished}
                      onChange={(e) => setPaperPublished(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-900"
                    />
                    Publish to Past Papers archive
                  </label>

                  <button
                    type="submit"
                    disabled={paperBusy}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {paperSourceType === 'drive' ? (
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {paperBusy
                      ? 'Saving Paper...'
                      : editingPaper
                      ? 'Save Paper Changes'
                      : paperSourceType === 'drive'
                      ? 'Save Google Drive Paper'
                      : 'Upload PDF Paper'}
                  </button>
                </div>
              </form>

              <div className="glass-surface rounded-2xl p-6">
                <h3 className="text-base font-semibold text-slate-50">
                  Past Examination Papers Inventory ({allPapers.length})
                </h3>
                {allPapers.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400">No past papers added yet.</p>
                ) : (
                  <div className="mt-4 divide-y divide-slate-800/80">
                    {allPapers.map((p) => {
                      const isDrive = isGoogleDriveResource(p);
                      const targetUrl = getResourceTargetUrl(p);
                      const linkedRankCount = allCustomRankEntries.filter(
                        (e) => e.linkedItemType === 'paper' && e.linkedItemId === p.id
                      ).length;

                      return (
                        <div
                          key={p.id}
                          className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center"
                        >
                          <div className="min-w-0">
                            <p className="text-xs text-slate-400">
                              <span className="text-cyan-300">{p.subject}</span> · {p.year} ·{' '}
                              {p.category || p.examType} · {p.language} ·{' '}
                              <span className={isDrive ? 'text-sky-300 font-medium' : ''}>
                                {isDrive ? 'Google Drive Link' : formatBytes(p.fileSize)}
                              </span>{' '}
                              · {p.published ? 'Published' : 'Draft'}
                            </p>
                            <h4 className="mt-1 truncate text-sm font-semibold text-slate-100">
                              {p.title}
                            </h4>
                            {linkedRankCount > 0 && (
                              <p className="mt-0.5 text-[11px] text-amber-300">
                                {linkedRankCount} linked Rank Board{' '}
                                {linkedRankCount === 1 ? 'entry' : 'entries'}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {targetUrl && (
                              <a
                                href={targetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white"
                              >
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                Open
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPaper(p);
                                setPaperTitle(p.title);
                                setPaperSubject(p.subject);
                                setPaperCategory(p.category || p.examType);
                                setPaperYear(p.year);
                                setPaperGrade(p.grade);
                                setPaperType(p.examType);
                                setPaperLang(p.language);
                                setPaperDesc(p.description);
                                setPaperPublished(p.published);
                                const driveMode = isGoogleDriveResource(p);
                                setPaperSourceType(driveMode ? 'drive' : 'pdf');
                                setPaperDriveUrl(driveMode ? getResourceTargetUrl(p) : '');
                                setPaperFile(null);
                                setPaperError(null);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:text-white"
                            >
                              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmState({
                                  title: 'Delete Past Examination Paper',
                                  description:
                                    linkedRankCount > 0
                                      ? `Permanently delete "${p.title}"? ${linkedRankCount} Rank Board ${
                                          linkedRankCount === 1 ? 'entry' : 'entries'
                                        } explicitly linked to this Past Paper will also be automatically removed and remaining ranks recalculated. Unrelated Rank Board entries will remain untouched.`
                                      : `Permanently delete "${p.title}" from the Past Papers archive?`,
                                  confirmLabel: 'Delete Paper',
                                  action: async () => {
                                    const { removedRankEntries } = await deletePaperDocument(p);
                                    pushToast(
                                      'info',
                                      'Past paper deleted',
                                      removedRankEntries > 0
                                        ? `Automatically removed ${removedRankEntries} linked Rank Board ${
                                            removedRankEntries === 1 ? 'entry' : 'entries'
                                          }.`
                                        : undefined
                                    );
                                  },
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-medium text-rose-300 hover:border-rose-500/40"
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
            </div>
          )}

          {/* =============================================================== */}
          {/* SECTION 6: ONLINE EXAM MANAGEMENT */}
          {/* =============================================================== */}
          {activeSection === 'exams' && <AdminOnlineExamManagementPanel />}

          {/* =============================================================== */}
          {/* SECTION 7: EXAMINATION RESULTS */}
          {/* =============================================================== */}
          {activeSection === 'results' && <AdminExamResultsPanel />}

          {/* =============================================================== */}
          {/* SECTION 8: DYNAMIC & MANUAL RANK BOARD MANAGEMENT */}
          {/* =============================================================== */}
          {activeSection === 'rank-board' && <AdminRankBoardManager />}

          {/* =============================================================== */}
          {/* SECTION 9: WEBSITE STATISTICS */}
          {/* =============================================================== */}
          {activeSection === 'statistics' && (
            <div className="space-y-6">
              <div className="glass-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-50">
                    Real-Time Cloud Firestore Metrics
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Counters reflect live database documents with zero synthetic numbers.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={reconcilingStats}
                  onClick={async () => {
                    setReconcilingStats(true);
                    try {
                      await reconcilePlatformStats();
                      pushToast('success', 'Platform statistics synchronized');
                    } catch (err) {
                      pushToast(
                        'error',
                        'Failed to reconcile stats',
                        err instanceof Error ? err.message : ''
                      );
                    } finally {
                      setReconcilingStats(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${reconcilingStats ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  {reconcilingStats ? 'Reconciling...' : 'Reconcile Counters'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {[
                  { label: 'Total Registered Users', val: Math.max(stats.totalUsers, allUsers.length) },
                  { label: 'Published PDF Documents', val: stats.totalPdfs },
                  { label: 'Published Study Notes', val: stats.totalNotes },
                  { label: 'Published Past Papers', val: stats.totalPapers },
                  { label: 'Published Online Exams', val: stats.totalExams },
                  {
                    label: 'Completed Exam Attempts',
                    val: Math.max(stats.completedAttempts || 0, allExamAttempts.length),
                  },
                  {
                    label: 'Published Ranked Results',
                    val: Math.max(
                      stats.publishedResults || 0,
                      allRankEntries.length + allCustomRankEntries.length
                    ),
                  },
                  {
                    label: 'Published Rank Boards',
                    val: allRankBoards.filter((b) => b.published).length,
                  },
                  { label: 'Active Announcements', val: allAnnouncements.filter((a) => a.published).length },
                ].map((m) => (
                  <div key={m.label} className="glass-surface rounded-2xl p-5">
                    <p className="text-xs text-slate-400">{m.label}</p>
                    <p className="mt-1.5 font-mono text-2xl font-bold text-slate-50 tabular-nums">
                      {m.val.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* SECTION 10: ADMIN SETTINGS */}
          {/* =============================================================== */}
          {activeSection === 'settings' && (
            <div className="space-y-6">
              <div className="glass-surface rounded-2xl p-6 text-xs text-slate-300">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-cyan-300" aria-hidden="true" />
                  <div>
                    <h2 className="text-lg font-semibold text-slate-50">
                      Administrator Security &amp; Infrastructure
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      The administrator dashboard is securely authorized exclusively for <strong className="text-cyan-300">hiranyaudakara2@gmail.com</strong> via Firebase Google Sign-In and Cloud Firestore security rules.
                    </p>
                  </div>
                </div>
                <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 border-t border-slate-800 pt-4">
                  <div>
                    <dt className="text-slate-400">Firebase Project ID</dt>
                    <dd className="mt-0.5 font-mono text-cyan-300">{FIREBASE_PROJECT_ID}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Cloud Firestore Database ID</dt>
                    <dd className="mt-0.5 font-mono text-slate-200 break-all">
                      {FIRESTORE_DATABASE_ID}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || ''}
        description={confirmState?.description || ''}
        confirmLabel={confirmState?.confirmLabel}
        busy={confirmBusy}
        onCancel={() => setConfirmState(null)}
        onConfirm={async () => {
          if (!confirmState) return;
          setConfirmBusy(true);
          try {
            await confirmState.action();
            setConfirmState(null);
          } catch (err) {
            pushToast('error', 'Action failed', err instanceof Error ? err.message : '');
          } finally {
            setConfirmBusy(false);
          }
        }}
      />
    </div>
  );
}
