import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStudentLearningProgress,
  computeCompetitionRankings,
  computeManualBoardRankings,
  evaluateCodeRateLimit,
  evaluateExamStatus,
  extractGoogleDriveFileId,
  filterAndSortNotes,
  filterAndSortPapers,
  formatCountdown,
  formatUtcMsToColomboLocalInput,
  generateRandomSixDigitCode,
  getResourceTargetUrl,
  gradeExamSubmission,
  isGoogleDriveResource,
  isValidDocumentId,
  isValidGoogleFormsUrl,
  isValidSixDigitCode,
  normalizeAnnouncementImageUrl,
  paginateItems,
  parseColomboLocalInputToUtcMs,
  parseTagsInput,
  sanitizeImageStorageFileName,
  sanitizeQuestionsForPublic,
  sanitizeStorageFileName,
  validateGoogleDriveUrl,
  validateNativeExamInput,
  validateOnlineExamInput,
  verifyImageMagicBytes,
  verifyPdfMagicBytes,
} from './platformLogic';
import type {
  ExamAttempt,
  ExamPaper,
  ExamQuestionFull,
  NoteResource,
  OnlineExam,
  UserActivity,
} from '../types/platform';

test('PDF magic byte verification accepts genuine %PDF- headers and rejects spoofed files', () => {
  const genuinePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const exeRenamedToPdf = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]);
  const htmlSpoof = new TextEncoder().encode('<!doctype html>');

  assert.equal(verifyPdfMagicBytes(genuinePdf), true);
  assert.equal(verifyPdfMagicBytes(exeRenamedToPdf), false);
  assert.equal(verifyPdfMagicBytes(htmlSpoof), false);
  assert.equal(verifyPdfMagicBytes(new Uint8Array([0x25, 0x50])), false);
});

test('Google Forms URL validator accepts official HTTPS forms and blocks phishing domains', () => {
  assert.equal(
    isValidGoogleFormsUrl('https://docs.google.com/forms/d/e/1FAIpQLSeSampleFormId/viewform'),
    true
  );
  assert.equal(isValidGoogleFormsUrl('https://forms.gle/AbCdEfGhIjKlMnOp12'), true);
  assert.equal(
    isValidGoogleFormsUrl('http://docs.google.com/forms/d/e/1FAIpQLSeSampleFormId/viewform'),
    false
  );
  assert.equal(
    isValidGoogleFormsUrl('https://evil-docs.google.com.attacker.org/forms/d/123'),
    false
  );
});

test('6-digit access password generator, validator, and rate limiter enforce security boundaries', () => {
  for (let i = 0; i < 10; i++) {
    const code = generateRandomSixDigitCode();
    assert.equal(isValidSixDigitCode(code), true);
  }
  assert.equal(isValidSixDigitCode('048291'), true);
  assert.equal(isValidSixDigitCode('12345'), false);
  assert.equal(isValidSixDigitCode('1234567'), false);
  assert.equal(isValidSixDigitCode('12a456'), false);

  const now = 1_730_000_000_000;
  const okLimit = evaluateCodeRateLimit([now - 10_000, now - 5_000], now);
  assert.equal(okLimit.blocked, false);

  const blockedLimit = evaluateCodeRateLimit(
    [now - 60_000, now - 50_000, now - 40_000, now - 30_000, now - 20_000],
    now
  );
  assert.equal(blockedLimit.blocked, true);
  assert.ok(blockedLimit.retryAfterSeconds > 0);
});

test('Native exam validation, public question sanitization, and auto-marking work accurately', () => {
  const sampleQuestions: ExamQuestionFull[] = [
    {
      id: 'q1',
      type: 'mcq',
      prompt: 'Which gate outputs 1 only when both inputs are 1?',
      options: ['OR Gate', 'AND Gate', 'XOR Gate', 'NOT Gate'],
      marks: 10,
      correctOptionIndex: 1,
      explanation: 'An AND gate outputs logic HIGH only when all inputs are HIGH.',
    },
    {
      id: 'q2',
      type: 'true_false',
      prompt: 'TCP is a connection-oriented transport protocol.',
      options: ['True', 'False'],
      marks: 10,
      correctBoolean: true,
      explanation: 'TCP establishes a 3-way handshake prior to data transfer.',
    },
  ];

  const badCodeErr = validateNativeExamInput({
    title: 'ICT Mock Test',
    subject: 'ICT',
    grade: 'Grade 13',
    description: 'Timed assessment.',
    instructions: 'Answer all questions.',
    durationMinutes: 30,
    passingMarks: 10,
    maxAttempts: 2,
    accessCode: '1234',
    requireAccessCode: true,
    opensAtMs: 1000,
    closesAtMs: 5000,
    questions: sampleQuestions,
  });
  assert.match(badCodeErr || '', /6-digit/);

  const validErr = validateNativeExamInput({
    title: 'ICT Mock Test',
    subject: 'ICT',
    grade: 'Grade 13',
    description: 'Timed assessment.',
    instructions: 'Answer all questions.',
    durationMinutes: 30,
    passingMarks: 10,
    maxAttempts: 2,
    accessCode: '482910',
    requireAccessCode: true,
    opensAtMs: 1000,
    closesAtMs: 5000,
    questions: sampleQuestions,
  });
  assert.equal(validErr, null);

  const sanitized = sanitizeQuestionsForPublic(sampleQuestions);
  assert.equal('correctOptionIndex' in sanitized[0], false);
  assert.equal('correctBoolean' in sanitized[1], false);

  const gradedObjective = gradeExamSubmission(
    sampleQuestions,
    { q1: '1', q2: 'false' },
    10
  );
  assert.equal(gradedObjective.status, 'graded');
  assert.equal(gradedObjective.marksObtained, 10);
  assert.equal(gradedObjective.totalMarks, 20);
  assert.equal(gradedObjective.percentage, 50);
  assert.equal(gradedObjective.passed, true);

  const withShortAnswer = gradeExamSubmission(
    [
      ...sampleQuestions,
      {
        id: 'q3',
        type: 'short_answer',
        prompt: 'Define Karnaugh map.',
        options: [],
        marks: 10,
        sampleAnswer: 'Truth-table simplification grid',
      },
    ],
    { q1: '1', q2: 'true', q3: 'A grid method for Boolean simplification' },
    20
  );
  assert.equal(withShortAnswer.status, 'pending_review');
  assert.equal(withShortAnswer.hasManualQuestions, true);
  assert.equal(withShortAnswer.marksObtained, 20);
});

test('Competition rank board enforces 1, 1, 3 tie-ranking and best-attempt deduplication', () => {
  const ranked = computeCompetitionRankings([
    {
      attemptId: 'a1',
      userId: 'u_alice',
      studentName: 'Alice Perera',
      examId: 'ex1',
      examTitle: 'ICT Paper I',
      subject: 'ICT',
      marksObtained: 92,
      totalMarks: 100,
      percentage: 92,
      passed: true,
      isFinalized: true,
      submittedAtMs: 2000,
      serverReceipt: 'r1',
    },
    {
      attemptId: 'a1_older_lower',
      userId: 'u_alice',
      studentName: 'Alice Perera',
      examId: 'ex1',
      examTitle: 'ICT Paper I',
      subject: 'ICT',
      marksObtained: 75,
      totalMarks: 100,
      percentage: 75,
      passed: true,
      isFinalized: true,
      submittedAtMs: 1000,
      serverReceipt: 'r0',
    },
    {
      attemptId: 'a2',
      userId: 'u_kasun',
      studentName: 'Kasun Silva',
      examId: 'ex1',
      examTitle: 'ICT Paper I',
      subject: 'ICT',
      marksObtained: 92,
      totalMarks: 100,
      percentage: 92,
      passed: true,
      isFinalized: true,
      submittedAtMs: 1500,
      serverReceipt: 'r2',
    },
    {
      attemptId: 'a3',
      userId: 'u_nimali',
      studentName: 'Nimali Fernando',
      examId: 'ex1',
      examTitle: 'ICT Paper I',
      subject: 'ICT',
      marksObtained: 85,
      totalMarks: 100,
      percentage: 85,
      passed: true,
      isFinalized: true,
      submittedAtMs: 1800,
      serverReceipt: 'r3',
    },
    {
      attemptId: 'a4_pending',
      userId: 'u_pending',
      studentName: 'Pending Candidate',
      examId: 'ex1',
      examTitle: 'ICT Paper I',
      subject: 'ICT',
      marksObtained: 99,
      totalMarks: 100,
      percentage: 99,
      passed: false,
      isFinalized: false,
      submittedAtMs: 1200,
      serverReceipt: 'r4',
    },
  ]);

  // Pending candidate excluded when finalizedOnly=true; Alice deduplicated to her 92 best attempt
  assert.equal(ranked.length, 3);
  assert.deepEqual(
    ranked.map((r) => ({ name: r.studentName, rank: r.rankPosition, marks: r.marksObtained })),
    [
      { name: 'Kasun Silva', rank: 1, marks: 92 },
      { name: 'Alice Perera', rank: 1, marks: 92 },
      { name: 'Nimali Fernando', rank: 3, marks: 85 },
    ]
  );
  assert.match(ranked[0].anonymizedCode, /^CAND-[0-9A-F]{6}$/);
});

test('Exam schedule state machine and Asia/Colombo datetime round-trip work accurately', () => {
  const opensAt = 1_700_000_000_000;
  const closesAt = opensAt + 3600_000;

  const before = evaluateExamStatus(opensAt, closesAt, opensAt - 60_000);
  assert.equal(before.state, 'upcoming');
  assert.equal(before.canAccessForm, false);
  assert.equal(formatCountdown(before.remainingMs), '00:01:00');

  const during = evaluateExamStatus(opensAt, closesAt, opensAt + 1000);
  assert.equal(during.state, 'open');
  assert.equal(during.canAccessForm, true);

  const after = evaluateExamStatus(opensAt, closesAt, closesAt);
  assert.equal(after.state, 'closed');
  assert.equal(after.canAccessForm, false);

  const localInput = '2026-11-15T09:30';
  const utcMs = parseColomboLocalInputToUtcMs(localInput);
  assert.notEqual(utcMs, null);
  assert.equal(new Date(utcMs!).toISOString(), '2026-11-15T04:00:00.000Z');
  assert.equal(formatUtcMsToColomboLocalInput(utcMs!), localInput);
});

test('Online exam validation rejects inverted schedules and non-Google Form URLs', () => {
  const errInverted = validateOnlineExamInput({
    title: 'Engineering Technology Mock Exam',
    subject: 'Engineering Technology',
    grade: 'Grade 13',
    description: 'Timed multiple-choice paper.',
    instructions: 'Submit before closing time.',
    formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSdExampleExam/viewform',
    opensAtMs: 2000,
    closesAtMs: 1000,
  });
  assert.match(errInverted || '', /strictly later/);
});

test('Notes and past papers filtering, tags, categories, sorting, and pagination work deterministically', () => {
  assert.deepEqual(parseTagsInput(' Boolean, Logic Gates, boolean , Combinational '), [
    'Boolean',
    'Logic Gates',
    'Combinational',
  ]);

  const sampleNotes: NoteResource[] = [
    {
      id: 'n1',
      title: 'Digital Logic Gates & Boolean Algebra',
      subject: 'ICT',
      grade: 'Grade 12',
      description: 'Combinational circuits',
      tags: ['Logic Gates', 'Boolean'],
      pdfUrl: '/api/curriculum-pdf/logic.pdf',
      storagePath: '',
      fileName: 'logic.pdf',
      fileSize: 102400,
      thumbnailUrl: '',
      published: true,
      authorId: 'admin_1',
      createdAtMs: 1000,
      updatedAtMs: 1000,
    },
    {
      id: 'n2',
      title: 'Thermodynamics & Heat Engines',
      subject: 'Engineering Technology',
      grade: 'Grade 13',
      description: 'Carnot cycle and efficiency',
      tags: ['Thermodynamics'],
      pdfUrl: '/api/curriculum-pdf/thermo.pdf',
      storagePath: '',
      fileName: 'thermo.pdf',
      fileSize: 204800,
      thumbnailUrl: '',
      published: true,
      authorId: 'admin_1',
      createdAtMs: 5000,
      updatedAtMs: 5000,
    },
  ];

  const ictOnly = filterAndSortNotes(sampleNotes, {
    query: 'boolean',
    subject: 'ICT',
    grade: 'all',
    tag: 'Logic Gates',
    sortOrder: 'newest',
  });
  assert.equal(ictOnly.length, 1);
  assert.equal(ictOnly[0].id, 'n1');

  const samplePapers: ExamPaper[] = [
    {
      id: 'p1',
      title: 'G.C.E. A/L ICT Past Paper 2024',
      subject: 'ICT',
      category: 'National Past Paper',
      year: 2024,
      grade: 'Grade 13',
      examType: 'National A/L',
      language: 'English',
      description: 'Paper I & II',
      fileFormat: 'PDF',
      pdfUrl: '/api/curriculum-pdf/ict2024.pdf',
      storagePath: '',
      fileName: 'ict2024.pdf',
      fileSize: 300000,
      published: true,
      authorId: 'admin_1',
      createdAtMs: 2000,
      updatedAtMs: 2000,
    },
    {
      id: 'p2',
      title: 'Provincial Term Paper 2025',
      subject: 'Biosystems Technology',
      category: 'Provincial Term Paper',
      year: 2025,
      grade: 'Grade 12',
      examType: 'Term Test',
      language: 'Sinhala',
      description: 'Western Province',
      fileFormat: 'PDF',
      pdfUrl: '/api/curriculum-pdf/bst2025.pdf',
      storagePath: '',
      fileName: 'bst2025.pdf',
      fileSize: 250000,
      published: true,
      authorId: 'admin_1',
      createdAtMs: 3000,
      updatedAtMs: 3000,
    },
  ];

  const filteredPapers = filterAndSortPapers(samplePapers, {
    query: '',
    subject: 'all',
    category: 'Provincial Term Paper',
    year: '2025',
    grade: 'all',
    examType: 'Term Test',
    language: 'Sinhala',
    sortOrder: 'newest',
  });
  assert.equal(filteredPapers.length, 1);
  assert.equal(filteredPapers[0].id, 'p2');

  const paged = paginateItems([1, 2, 3, 4, 5], 2, 2);
  assert.deepEqual(paged.slice, [3, 4]);
  assert.equal(paged.totalPages, 3);

  assert.equal(isValidDocumentId('valid_doc-123'), true);
  assert.equal(isValidDocumentId('bad/slash'), false);
  assert.equal(sanitizeStorageFileName('My Lecture Notes (Final)!.exe'), 'My_Lecture_Notes_Final_.exe.pdf');
});

test('Google Drive sharing link validator accepts official Drive/Docs file & folder links and blocks invalid URLs', () => {
  const validFile = validateGoogleDriveUrl(
    'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/view?usp=sharing'
  );
  assert.equal(validFile.valid, true);
  assert.equal(validFile.error, null);

  const validFolder = validateGoogleDriveUrl(
    'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz123456?usp=drive_link'
  );
  assert.equal(validFolder.valid, true);

  const validOpenId = validateGoogleDriveUrl(
    'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz123456'
  );
  assert.equal(validOpenId.valid, true);

  const validDocs = validateGoogleDriveUrl(
    'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/edit?usp=sharing'
  );
  assert.equal(validDocs.valid, true);

  const invalidHttp = validateGoogleDriveUrl(
    'http://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/view'
  );
  assert.equal(invalidHttp.valid, false);
  assert.match(invalidHttp.error || '', /HTTPS/);

  const invalidDomain = validateGoogleDriveUrl(
    'https://drive.google.com.attacker.org/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/view'
  );
  assert.equal(invalidDomain.valid, false);

  const bareHomepage = validateGoogleDriveUrl('https://drive.google.com/');
  assert.equal(bareHomepage.valid, false);

  assert.equal(
    isGoogleDriveResource({
      sourceType: 'drive',
      driveUrl: validFile.normalizedUrl,
      pdfUrl: validFile.normalizedUrl,
    }),
    true
  );
  assert.equal(
    getResourceTargetUrl({
      sourceType: 'drive',
      driveUrl: validFile.normalizedUrl,
      pdfUrl: '/api/fallback.pdf',
    }),
    validFile.normalizedUrl
  );
});

test('Manual & Automatic Rank Board engine handles descending marks, 1-1-3 ties, manual rank overrides, and reordering', () => {
  const autoRanked = computeManualBoardRankings(
    [
      {
        id: 'e1',
        marks: 88,
        maxMarks: 100,
        rankPosition: 1,
        isManualRank: false,
        displayOrder: 0,
      },
      {
        id: 'e2',
        marks: 96,
        maxMarks: 100,
        rankPosition: 1,
        isManualRank: false,
        displayOrder: 2,
      },
      {
        id: 'e3',
        marks: 96,
        maxMarks: 100,
        rankPosition: 1,
        isManualRank: false,
        displayOrder: 1,
      },
      {
        id: 'e4',
        marks: 75,
        maxMarks: 100,
        rankPosition: 2,
        isManualRank: true,
        displayOrder: 3,
      },
    ],
    'auto'
  );

  // e3 and e2 tie at 96 marks -> both Rank 1 (e3 first due to lower displayOrder=1);
  // e4 has explicit manual override Rank 2; e1 (88 marks) receives standard competition Rank 3 (since two tied at 96 before 88)
  assert.deepEqual(
    autoRanked.map((r) => ({ id: r.id, rank: r.computedRank, order: r.computedOrder })),
    [
      { id: 'e3', rank: 1, order: 0 },
      { id: 'e2', rank: 1, order: 1 },
      { id: 'e4', rank: 2, order: 2 },
      { id: 'e1', rank: 3, order: 3 },
    ]
  );

  const manualModeRanked = computeManualBoardRankings(
    [
      {
        id: 'm1',
        marks: 80,
        maxMarks: 100,
        rankPosition: 1,
        isManualRank: false,
        displayOrder: 1,
      },
      {
        id: 'm2',
        marks: 90,
        maxMarks: 100,
        rankPosition: 1,
        isManualRank: false,
        displayOrder: 0,
      },
    ],
    'manual'
  );
  assert.deepEqual(
    manualModeRanked.map((r) => ({ id: r.id, rank: r.computedRank })),
    [
      { id: 'm2', rank: 1 },
      { id: 'm1', rank: 2 },
    ]
  );
});

test('Notice banner image magic bytes and filename sanitizer validate PNG, JPEG, and WebP cleanly', () => {
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const jpgHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const webpHeader = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  const htmlSpoof = new TextEncoder().encode('<!DOCTYPE html>');

  assert.deepEqual(verifyImageMagicBytes(pngHeader), {
    valid: true,
    ext: 'png',
    mime: 'image/png',
  });
  assert.deepEqual(verifyImageMagicBytes(jpgHeader), {
    valid: true,
    ext: 'jpg',
    mime: 'image/jpeg',
  });
  assert.deepEqual(verifyImageMagicBytes(webpHeader), {
    valid: true,
    ext: 'webp',
    mime: 'image/webp',
  });
  assert.equal(verifyImageMagicBytes(htmlSpoof).valid, false);

  assert.equal(
    sanitizeImageStorageFileName('2026 Exam Schedule Banner!!.jpeg', 'jpg'),
    '2026_Exam_Schedule_Banner.jpg'
  );
  assert.equal(sanitizeImageStorageFileName('   .png', 'png'), 'notice_banner.png');
});

test('Announcement banner URL normalizer converts Google Drive file links into embeddable HTTPS thumbnails', () => {
  const driveShare =
    'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/view?usp=sharing';
  const driveOpen = 'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz123456';

  assert.equal(extractGoogleDriveFileId(driveShare), '1AbCdEfGhIjKlMnOpQrStUvWxYz123456');
  assert.equal(extractGoogleDriveFileId(driveOpen), '1AbCdEfGhIjKlMnOpQrStUvWxYz123456');

  assert.equal(
    normalizeAnnouncementImageUrl(driveShare),
    'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUvWxYz123456&sz=w1600'
  );
  assert.equal(
    normalizeAnnouncementImageUrl('  https://firebasestorage.googleapis.com/v0/b/app/o/banner.png  '),
    'https://firebasestorage.googleapis.com/v0/b/app/o/banner.png'
  );
  assert.equal(normalizeAnnouncementImageUrl('   '), '');
});

test('Student learning progress indicator calculates notes, exams, overall percentage, deduplication, and filters', () => {
  // 1. Empty curriculum state returns 0% with zero NaN
  const emptyProgress = calculateStudentLearningProgress({
    publishedNotes: [],
    publishedExams: [],
    examAttempts: [],
    userActivities: [],
  });
  assert.equal(emptyProgress.notesCompleted, 0);
  assert.equal(emptyProgress.notesTotal, 0);
  assert.equal(emptyProgress.notesPercentage, 0);
  assert.equal(emptyProgress.examsCompleted, 0);
  assert.equal(emptyProgress.examsTotal, 0);
  assert.equal(emptyProgress.examsPercentage, 0);
  assert.equal(emptyProgress.overallCompleted, 0);
  assert.equal(emptyProgress.overallTotal, 0);
  assert.equal(emptyProgress.overallPercentage, 0);

  const sampleNotes: NoteResource[] = [
    {
      id: 'n1',
      title: 'GPIO Interfacing',
      subject: 'Engineering Technology',
      grade: 'Grade 13 (G.C.E. A/L)',
      description: 'GPIO module',
      tags: ['GPIO'],
      pdfUrl: '/api/n1.pdf',
      storagePath: '',
      fileName: 'n1.pdf',
      fileSize: 1024,
      thumbnailUrl: '',
      published: true,
      authorId: 'admin1',
      createdAtMs: 1000,
      updatedAtMs: 1000,
    },
    {
      id: 'n2',
      title: 'CIDR Subnetting',
      subject: 'ICT',
      grade: 'Grade 13 (G.C.E. A/L)',
      description: 'Subnetting module',
      tags: ['CIDR'],
      pdfUrl: '/api/n2.pdf',
      storagePath: '',
      fileName: 'n2.pdf',
      fileSize: 1024,
      thumbnailUrl: '',
      published: true,
      authorId: 'admin1',
      createdAtMs: 2000,
      updatedAtMs: 2000,
    },
    {
      id: 'n3',
      title: 'Hydroponics Sensors',
      subject: 'Biosystems Technology',
      grade: 'Grade 12 (G.C.E. A/L)',
      description: 'Sensors module',
      tags: ['Sensors'],
      pdfUrl: '/api/n3.pdf',
      storagePath: '',
      fileName: 'n3.pdf',
      fileSize: 1024,
      thumbnailUrl: '',
      published: true,
      authorId: 'admin1',
      createdAtMs: 3000,
      updatedAtMs: 3000,
    },
  ];

  const sampleExams: OnlineExam[] = [
    {
      id: 'ex_native_done',
      title: 'ICT Timed Diagnostic',
      subject: 'ICT',
      grade: 'Grade 13 (G.C.E. A/L)',
      description: 'Timed exam',
      instructions: 'Answer all',
      timezone: 'Asia/Colombo',
      examMode: 'native',
      opensAtMs: 1000,
      closesAtMs: 90000,
      durationMinutes: 25,
      totalMarks: 100,
      passingMarks: 50,
      questionCount: 5,
      maxAttempts: 2,
      accessCodeProtected: true,
      showExplanations: true,
      resultsPublished: true,
      rankBoardPublished: true,
      anonymizeRankBoard: false,
      questions: [],
      published: true,
      authorId: 'admin1',
      createdAtMs: 1000,
      updatedAtMs: 1000,
    },
    {
      id: 'ex_native_inprog',
      title: 'ET Mid-Term Assessment',
      subject: 'Engineering Technology',
      grade: 'Grade 13 (G.C.E. A/L)',
      description: 'Timed exam',
      instructions: 'Answer all',
      timezone: 'Asia/Colombo',
      examMode: 'native',
      opensAtMs: 1000,
      closesAtMs: 90000,
      durationMinutes: 30,
      totalMarks: 100,
      passingMarks: 50,
      questionCount: 5,
      maxAttempts: 1,
      accessCodeProtected: true,
      showExplanations: true,
      resultsPublished: false,
      rankBoardPublished: false,
      anonymizeRankBoard: false,
      questions: [],
      published: true,
      authorId: 'admin1',
      createdAtMs: 2000,
      updatedAtMs: 2000,
    },
    {
      id: 'ex_form_done',
      title: 'BST External Practical Quiz',
      subject: 'Biosystems Technology',
      grade: 'Grade 12 (G.C.E. A/L)',
      description: 'Form exam',
      instructions: 'Complete form',
      timezone: 'Asia/Colombo',
      examMode: 'google_form',
      opensAtMs: 1000,
      closesAtMs: 90000,
      durationMinutes: 20,
      totalMarks: 50,
      passingMarks: 25,
      questionCount: 10,
      maxAttempts: 1,
      accessCodeProtected: false,
      showExplanations: false,
      resultsPublished: false,
      rankBoardPublished: false,
      anonymizeRankBoard: false,
      questions: [],
      published: true,
      authorId: 'admin1',
      createdAtMs: 3000,
      updatedAtMs: 3000,
    },
  ];

  const activities: UserActivity[] = [
    // Duplicate views + downloads of n1 should count once
    {
      id: 'act1',
      userId: 'u1',
      resourceId: 'n1',
      resourceType: 'note',
      resourceTitle: 'GPIO Interfacing',
      subject: 'Engineering Technology',
      action: 'viewed',
      createdAtMs: 4000,
    },
    {
      id: 'act2',
      userId: 'u1',
      resourceId: 'n1',
      resourceType: 'note',
      resourceTitle: 'GPIO Interfacing',
      subject: 'Engineering Technology',
      action: 'downloaded',
      createdAtMs: 5000,
    },
    // Deleted/unpublished note activity must be ignored
    {
      id: 'act_orphan',
      userId: 'u1',
      resourceId: 'deleted_note_99',
      resourceType: 'note',
      resourceTitle: 'Old Note',
      subject: 'ICT',
      action: 'downloaded',
      createdAtMs: 6000,
    },
    // Google form exam opened
    {
      id: 'act_form',
      userId: 'u1',
      resourceId: 'ex_form_done',
      resourceType: 'exam',
      resourceTitle: 'BST External Practical Quiz',
      subject: 'Biosystems Technology',
      action: 'opened_exam',
      createdAtMs: 7000,
    },
  ];

  const attempts: ExamAttempt[] = [
    {
      id: 'att1',
      examId: 'ex_native_done',
      examTitle: 'ICT Timed Diagnostic',
      subject: 'ICT',
      userId: 'u1',
      studentName: 'Nimal',
      studentEmail: 'nimal@example.com',
      attemptNumber: 1,
      status: 'graded',
      startedAtMs: 2000,
      expiresAtMs: 3500,
      submittedAtMs: 3200,
      updatedAtMs: 3200,
      answers: {},
      marksObtained: 80,
      totalMarks: 100,
      percentage: 80,
      passed: true,
      resultsPublished: true,
      serverReceipt: 'rcpt_1234567890abcdef',
      reviewBreakdown: [],
    },
    {
      id: 'att2_dup',
      examId: 'ex_native_done',
      examTitle: 'ICT Timed Diagnostic',
      subject: 'ICT',
      userId: 'u1',
      studentName: 'Nimal',
      studentEmail: 'nimal@example.com',
      attemptNumber: 2,
      status: 'graded',
      startedAtMs: 4000,
      expiresAtMs: 5500,
      submittedAtMs: 5200,
      updatedAtMs: 5200,
      answers: {},
      marksObtained: 95,
      totalMarks: 100,
      percentage: 95,
      passed: true,
      resultsPublished: true,
      serverReceipt: 'rcpt_abcdef1234567890',
      reviewBreakdown: [],
    },
    {
      id: 'att3_inprog',
      examId: 'ex_native_inprog',
      examTitle: 'ET Mid-Term Assessment',
      subject: 'Engineering Technology',
      userId: 'u1',
      studentName: 'Nimal',
      studentEmail: 'nimal@example.com',
      attemptNumber: 1,
      status: 'in_progress',
      startedAtMs: 8000,
      expiresAtMs: 99000,
      submittedAtMs: 0,
      updatedAtMs: 8000,
      answers: {},
      marksObtained: 0,
      totalMarks: 100,
      percentage: 0,
      passed: false,
      resultsPublished: false,
      serverReceipt: '',
      reviewBreakdown: [],
    },
  ];

  // 2. Full curriculum calculation: 1/3 notes (33%), 2/3 exams (67%), 1 exam in_progress, 3/6 overall (50%)
  const progress = calculateStudentLearningProgress({
    publishedNotes: sampleNotes,
    publishedExams: sampleExams,
    examAttempts: attempts,
    userActivities: activities,
  });

  assert.equal(progress.notesCompleted, 1);
  assert.equal(progress.notesTotal, 3);
  assert.equal(progress.notesPercentage, 33);
  assert.equal(progress.examsCompleted, 2);
  assert.equal(progress.examsInProgress, 1);
  assert.equal(progress.examsTotal, 3);
  assert.equal(progress.examsPercentage, 67);
  assert.equal(progress.overallCompleted, 3);
  assert.equal(progress.overallTotal, 6);
  assert.equal(progress.overallPercentage, 50);

  // 3. Subject filter: ICT has 0/1 notes (0%) and 1/1 exams (100%) -> 1/2 overall (50%)
  const ictProgress = calculateStudentLearningProgress({
    publishedNotes: sampleNotes,
    publishedExams: sampleExams,
    examAttempts: attempts,
    userActivities: activities,
    subjectFilter: 'ICT',
  });
  assert.equal(ictProgress.notesCompleted, 0);
  assert.equal(ictProgress.notesTotal, 1);
  assert.equal(ictProgress.examsCompleted, 1);
  assert.equal(ictProgress.examsTotal, 1);
  assert.equal(ictProgress.overallCompleted, 1);
  assert.equal(ictProgress.overallTotal, 2);
  assert.equal(ictProgress.overallPercentage, 50);
});


