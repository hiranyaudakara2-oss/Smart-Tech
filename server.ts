import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';
import type { ExamQuestionFull, RankBoardEntry } from './src/types/platform';
import {
  buildAnonymizedCandidateCode,
  calculateExamTotalMarks,
  computeCompetitionRankings,
  evaluateCodeRateLimit,
  gradeExamSubmission,
  isValidSixDigitCode,
  sanitizeQuestionsForPublic,
} from './src/utils/platformLogic';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(__dirname, '.data');
const UPLOAD_DIR = path.resolve(DATA_DIR, 'uploads');
const IMAGE_DIR = path.resolve(DATA_DIR, 'images');
const MASTER_KEY_PATH = path.resolve(DATA_DIR, 'exam-master.key');
const RANK_LEDGER_PATH = path.resolve(DATA_DIR, 'verified-rank-ledger.json');

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const BOOTSTRAPPED_ADMIN_EMAIL = 'hiranyaudakara2@gmail.com';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(IMAGE_DIR, { recursive: true });

function loadOrCreateMasterKey(): Buffer {
  const envSecret = (process.env.EXAM_HMAC_SECRET || process.env.ADMIN_SESSION_SECRET || '').trim();
  if (envSecret.length >= 16) {
    return crypto.createHash('sha256').update(envSecret, 'utf8').digest();
  }
  try {
    if (fs.existsSync(MASTER_KEY_PATH)) {
      const hex = fs.readFileSync(MASTER_KEY_PATH, 'utf8').trim();
      if (/^[0-9a-f]{64}$/i.test(hex)) {
        return Buffer.from(hex, 'hex');
      }
    }
  } catch {
    // Regenerate below if unreadable
  }
  const generated = crypto.randomBytes(32);
  try {
    fs.writeFileSync(MASTER_KEY_PATH, generated.toString('hex'), { mode: 0o600 });
  } catch {
    // Non-fatal in read-only edge environments
  }
  return generated;
}

const MASTER_KEY = loadOrCreateMasterKey();
const REVOKED_ADMIN_TOKENS = new Set<string>();
const CODE_FAILURE_LOG = new Map<string, number[]>();



interface LedgerExamVisibility {
  examId: string;
  examTitle: string;
  subject: string;
  resultsPublished: boolean;
  rankBoardPublished: boolean;
  anonymizeRankBoard: boolean;
  updatedAtMs: number;
}

interface LedgerSubmissionRecord {
  attemptId: string;
  examId: string;
  examTitle: string;
  subject: string;
  userId: string;
  studentName: string;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  passed: boolean;
  isFinalized: boolean;
  submittedAtMs: number;
  serverReceipt: string;
}

interface VerifiedRankLedger {
  exams: Record<string, LedgerExamVisibility>;
  submissions: Record<string, LedgerSubmissionRecord>;
}

function readRankLedger(): VerifiedRankLedger {
  try {
    if (!fs.existsSync(RANK_LEDGER_PATH)) {
      return { exams: {}, submissions: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(RANK_LEDGER_PATH, 'utf8')) as VerifiedRankLedger;
    return {
      exams: parsed.exams || {},
      submissions: parsed.submissions || {},
    };
  } catch {
    return { exams: {}, submissions: {} };
  }
}

function writeRankLedger(ledger: VerifiedRankLedger): void {
  fs.writeFileSync(RANK_LEDGER_PATH, JSON.stringify(ledger, null, 2), { mode: 0o600 });
}

function sealString(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function unsealString(sealed: string): string | null {
  try {
    const parts = sealed.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') return null;
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const data = Buffer.from(parts[3], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

function computeExamCodeMac(examId: string, accessCode: string): string {
  return crypto
    .createHmac('sha256', MASTER_KEY)
    .update(`exam-code:${examId}:${accessCode.trim()}`, 'utf8')
    .digest('hex');
}

function computeServerReceipt(params: {
  attemptId: string;
  examId: string;
  userId: string;
  status: string;
  marksObtained: number;
  totalMarks: number;
}): string {
  const payload = `${params.attemptId}|${params.examId}|${params.userId}|${params.status}|${params.marksObtained}|${params.totalMarks}`;
  return crypto.createHmac('sha256', MASTER_KEY).update(payload, 'utf8').digest('hex');
}

interface AttemptPermitPayload {
  attemptId: string;
  examId: string;
  userId: string;
  attemptNumber: number;
  startedAtMs: number;
  expiresAtMs: number;
}

function signAttemptPermit(payload: AttemptPermitPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', MASTER_KEY).update(`permit:${encoded}`, 'utf8').digest('hex');
  return `${encoded}.${sig}`;
}

function verifyAttemptPermit(token: string): AttemptPermitPayload | null {
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expected = crypto.createHmac('sha256', MASTER_KEY).update(`permit:${encoded}`, 'utf8').digest('hex');
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AttemptPermitPayload;
  } catch {
    return null;
  }
}

interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseAppletConfig(): FirebaseAppletConfig {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8');
    return JSON.parse(raw) as FirebaseAppletConfig;
  } catch {
    return { projectId: '', apiKey: '' };
  }
}

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  idToken: string;
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  const cfg = loadFirebaseAppletConfig();
  if (!cfg.apiKey || !idToken) {
    return null;
  }
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(cfg.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      users?: Array<{
        localId?: string;
        email?: string;
        displayName?: string;
        emailVerified?: boolean;
      }>;
    };
    const user = data.users?.[0];
    if (!user?.localId || !user?.email) return null;
    return {
      uid: user.localId,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0] || 'Student',
      emailVerified: Boolean(user.emailVerified),
      idToken,
    };
  } catch {
    return null;
  }
}

function decodeFirestoreValue(val: Record<string, unknown> | undefined): unknown {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return String(val.stringValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('nullValue' in val) return null;
  if ('timestampValue' in val) return new Date(String(val.timestampValue)).getTime();
  if ('arrayValue' in val) {
    const arrObj = val.arrayValue as { values?: Array<Record<string, unknown>> };
    return (arrObj.values || []).map((item) => decodeFirestoreValue(item));
  }
  if ('mapValue' in val) {
    const mapObj = val.mapValue as { fields?: Record<string, Record<string, unknown>> };
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(mapObj.fields || {})) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

async function fetchFirestoreDocument(
  collectionName: string,
  docId: string,
  idToken: string
): Promise<Record<string, unknown> | null> {
  const cfg = loadFirebaseAppletConfig();
  if (!cfg.projectId) return null;
  const dbId = cfg.firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    cfg.projectId
  )}/databases/${encodeURIComponent(dbId)}/documents/${encodeURIComponent(
    collectionName
  )}/${encodeURIComponent(docId)}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (resp.status !== 200) return null;
  const raw = (await resp.json()) as { fields?: Record<string, Record<string, unknown>> };
  const decoded: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw.fields || {})) {
    decoded[k] = decodeFirestoreValue(v);
  }
  return decoded;
}

async function queryStudentExamAttempts(
  examId: string,
  userId: string,
  idToken: string
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const cfg = loadFirebaseAppletConfig();
  if (!cfg.projectId) return [];
  const dbId = cfg.firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    cfg.projectId
  )}/databases/${encodeURIComponent(dbId)}/documents:runQuery`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'examAttempts' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'userId' },
            op: 'EQUAL',
            value: { stringValue: userId },
          },
        },
      },
    }),
  });

  if (!resp.ok) return [];
  const rows = (await resp.json()) as Array<{
    document?: { name?: string; fields?: Record<string, Record<string, unknown>> };
  }>;

  const matched: Array<{ id: string; data: Record<string, unknown> }> = [];
  for (const row of rows) {
    if (!row.document?.fields) continue;
    const decoded: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row.document.fields)) {
      decoded[k] = decodeFirestoreValue(v);
    }
    if (decoded.examId === examId) {
      const docName = row.document.name || '';
      const id = docName.split('/').pop() || '';
      matched.push({ id, data: decoded });
    }
  }
  return matched;
}

async function checkFirestoreAdminDoc(uid: string, idToken: string): Promise<boolean> {
  const doc = await fetchFirestoreDocument('admins', uid, idToken);
  return doc !== null;
}

async function verifyTrustedAdminRequest(req: Request): Promise<VerifiedFirebaseUser | null> {
  const idToken = extractBearerToken(req);
  if (!idToken) return null;

  const adminSessionHeader = String(req.headers['x-admin-session'] || '');
  if (adminSessionHeader && REVOKED_ADMIN_TOKENS.has(adminSessionHeader)) {
    return null;
  }

  const verified = await verifyFirebaseIdToken(idToken);
  if (!verified || !verified.emailVerified) return null;

  if (verified.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    return verified;
  }
  const inAdminsCollection = await checkFirestoreAdminDoc(verified.uid, idToken);
  return inAdminsCollection ? verified : null;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // 1. Authoritative Server Clock for Exam Schedule Enforcement (Asia/Colombo)
  app.get('/api/server-time', (_req: Request, res: Response) => {
    const now = Date.now();
    const colomboFormatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Colombo',
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(new Date(now));

    res.json({
      serverTimeMs: now,
      isoUtc: new Date(now).toISOString(),
      colomboFormatted,
      timezone: 'Asia/Colombo',
    });
  });

  // 2b. Direct Credentials Admin Login (Email: hiranyaudakara2@gmail.com, Password: Hirusa@#123)
  app.post('/api/admin/credentials-login', (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (email === 'hiranyaudakara2@gmail.com' && password === 'Hirusa@#123') {
      const issuedAt = Date.now();
      const payload = `cred_admin:${issuedAt}`;
      const signature = crypto.createHmac('sha256', MASTER_KEY).update(payload).digest('hex');

      res.json({
        authorized: true,
        email: 'hiranyaudakara2@gmail.com',
        adminSessionToken: `${payload}:${signature}`,
        verifiedAtMs: issuedAt,
      });
      return;
    }

    res.status(401).json({
      authorized: false,
      error: 'Access Denied: Incorrect email address or password.',
    });
  });

  // 2. Server-Side Administrator Identity Verification
  app.post('/api/admin/verify', async (req: Request, res: Response) => {
    const adminUser = await verifyTrustedAdminRequest(req);
    if (!adminUser) {
      res.status(403).json({
        authorized: false,
        error:
          'Access Denied: Unauthorized Administrator. Only hiranyaudakara2@gmail.com is authorized as administrator.',
      });
      return;
    }

    const issuedAt = Date.now();
    const payload = `${adminUser.uid}:${issuedAt}`;
    const signature = crypto.createHmac('sha256', MASTER_KEY).update(payload).digest('hex');

    res.json({
      authorized: true,
      uid: adminUser.uid,
      email: adminUser.email,
      adminSessionToken: `${payload}:${signature}`,
      verifiedAtMs: issuedAt,
    });
  });

  app.post('/api/admin/logout', (req: Request, res: Response) => {
    const token = String(req.body?.adminSessionToken || req.headers['x-admin-session'] || '').trim();
    if (token) {
      REVOKED_ADMIN_TOKENS.add(token);
    }
    res.json({ loggedOut: true });
  });

  // 3. Seal Native Online Exam (AES-256-GCM Answer Key & 6-Digit Password Verifier)
  app.post('/api/admin/exams/seal', async (req: Request, res: Response) => {
    const adminUser = await verifyTrustedAdminRequest(req);
    if (!adminUser) {
      res.status(403).json({ error: 'Only verified administrators may configure online examinations.' });
      return;
    }

    const examId = String(req.body?.examId || '').trim();
    if (!examId || !/^[a-zA-Z0-9_-]{1,128}$/.test(examId)) {
      res.status(400).json({ error: 'Valid examination identifier is required.' });
      return;
    }

    const codeRevoked = Boolean(req.body?.codeRevoked);
    let accessCode = String(req.body?.accessCode || '').trim();
    const keepExistingCode = Boolean(req.body?.keepExistingCode);

    if (!accessCode && keepExistingCode) {
      const existingConfig = await fetchFirestoreDocument('examConfigs', examId, adminUser.idToken);
      const unsealed = existingConfig?.sealedAccessCode
        ? unsealString(String(existingConfig.sealedAccessCode))
        : null;
      if (unsealed && isValidSixDigitCode(unsealed)) {
        accessCode = unsealed;
      }
    }

    if (!isValidSixDigitCode(accessCode)) {
      res.status(400).json({
        error: 'A valid 6-digit numeric examination password (000000–999999) is required.',
      });
      return;
    }

    const rawQuestions = Array.isArray(req.body?.questions)
      ? (req.body.questions as ExamQuestionFull[])
      : [];
    if (rawQuestions.length === 0 || rawQuestions.length > 50) {
      res.status(400).json({ error: 'Examination must include between 1 and 50 questions.' });
      return;
    }

    const sanitizedQuestions = sanitizeQuestionsForPublic(rawQuestions);
    const totalMarks = calculateExamTotalMarks(sanitizedQuestions);
    const codeMac = computeExamCodeMac(examId, accessCode);
    const sealedAccessCode = sealString(accessCode);
    const sealedAnswerKey = sealString(JSON.stringify(rawQuestions));

    res.json({
      examId,
      sanitizedQuestions,
      questionCount: sanitizedQuestions.length,
      totalMarks,
      codeMac,
      sealedAccessCode,
      codeRevoked,
      sealedAnswerKey,
    });
  });

  // 4. Reveal Native Exam Answer Key & 6-Digit Password to Verified Admin Only
  app.get('/api/admin/exams/:examId/reveal', async (req: Request, res: Response) => {
    const adminUser = await verifyTrustedAdminRequest(req);
    if (!adminUser) {
      res.status(403).json({ error: 'Only verified administrators may view examination answer keys.' });
      return;
    }

    const examId = String(req.params.examId || '').trim();
    const configDoc = await fetchFirestoreDocument('examConfigs', examId, adminUser.idToken);
    if (!configDoc) {
      res.status(404).json({ error: 'Sealed configuration was not found for this examination.' });
      return;
    }

    const accessCode = unsealString(String(configDoc.sealedAccessCode || '')) || '';
    const answerKeyJson = unsealString(String(configDoc.sealedAnswerKey || ''));
    let questions: ExamQuestionFull[] = [];
    if (answerKeyJson) {
      try {
        questions = JSON.parse(answerKeyJson) as ExamQuestionFull[];
      } catch {
        questions = [];
      }
    }

    res.json({
      examId,
      accessCode,
      codeRevoked: Boolean(configDoc.codeRevoked),
      questions,
    });
  });

  // 5. Student Examination Start Gate (Validates 6-Digit Password, Schedule, & Attempt Cap)
  app.post('/api/exams/:examId/start', async (req: Request, res: Response) => {
    const idToken = extractBearerToken(req);
    const student = idToken ? await verifyFirebaseIdToken(idToken) : null;
    if (!student || !student.emailVerified) {
      res.status(401).json({
        error: 'Please sign in with a verified student account before starting an examination.',
      });
      return;
    }

    const examId = String(req.params.examId || '').trim();
    const providedCode = String(req.body?.accessCode || '').trim();
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
      .split(',')[0]
      .trim();
    const rateKey = `${ip}:${student.uid}:${examId}`;
    const now = Date.now();

    const rateEval = evaluateCodeRateLimit(CODE_FAILURE_LOG.get(rateKey) || [], now);
    if (rateEval.blocked) {
      res.status(429).json({
        error: `Too many incorrect password attempts. Please wait ${rateEval.retryAfterSeconds} seconds before trying again.`,
        retryAfterSeconds: rateEval.retryAfterSeconds,
      });
      return;
    }

    if (!isValidSixDigitCode(providedCode)) {
      res.status(400).json({ error: 'Please enter a valid 6-digit numeric examination password.' });
      return;
    }

    const [examDoc, configDoc] = await Promise.all([
      fetchFirestoreDocument('exams', examId, student.idToken),
      fetchFirestoreDocument('examConfigs', examId, student.idToken),
    ]);

    if (!examDoc || !examDoc.published) {
      res.status(404).json({ error: 'This examination is not currently available.' });
      return;
    }

    const opensAtMs = Number(examDoc.opensAt || 0);
    const closesAtMs = Number(examDoc.closesAt || 0);
    if (now < opensAtMs) {
      res.status(403).json({ error: 'This examination has not opened yet.' });
      return;
    }
    if (now >= closesAtMs) {
      res.status(403).json({ error: 'This examination window has already closed.' });
      return;
    }

    if (!configDoc) {
      res.status(400).json({ error: 'This examination uses an external Google Form rather than a 6-digit password.' });
      return;
    }

    if (configDoc.codeRevoked) {
      res.status(403).json({
        error: 'Access to this examination password has been temporarily paused by the administrator.',
      });
      return;
    }

    const expectedMac = String(configDoc.codeMac || '');
    const actualMac = computeExamCodeMac(examId, providedCode);
    const macBufA = Buffer.from(expectedMac, 'hex');
    const macBufB = Buffer.from(actualMac, 'hex');
    const codeMatches = macBufA.length === macBufB.length && crypto.timingSafeEqual(macBufA, macBufB);

    if (!codeMatches) {
      const updatedFailures = [...rateEval.recentFailures, now];
      CODE_FAILURE_LOG.set(rateKey, updatedFailures);
      res.status(403).json({
        error: 'Incorrect 6-digit examination password. Please verify the code shared by your instructor.',
      });
      return;
    }

    CODE_FAILURE_LOG.delete(rateKey);

    const existingAttempts = await queryStudentExamAttempts(examId, student.uid, student.idToken);
    const activeAttempt = existingAttempts.find(
      (att) => att.data.status === 'in_progress' && Number(att.data.expiresAt || 0) > now
    );

    if (activeAttempt) {
      const startedAtMs = Number(activeAttempt.data.startedAt || now);
      const expiresAtMs = Number(activeAttempt.data.expiresAt || now + 60_000);
      const attemptNumber = Number(activeAttempt.data.attemptNumber || 1);
      const permit = signAttemptPermit({
        attemptId: activeAttempt.id,
        examId,
        userId: student.uid,
        attemptNumber,
        startedAtMs,
        expiresAtMs,
      });

      res.json({
        resumed: true,
        attemptId: activeAttempt.id,
        attemptNumber,
        startedAtMs,
        expiresAtMs,
        savedAnswers: (activeAttempt.data.answers as Record<string, string>) || {},
        attemptPermit: permit,
      });
      return;
    }

    const maxAttempts = Math.max(1, Number(examDoc.maxAttempts || 1));
    const finishedCount = existingAttempts.filter((att) => att.data.status !== 'in_progress').length;
    if (finishedCount >= maxAttempts) {
      res.status(403).json({
        error: `You have already used all ${maxAttempts} permitted attempt${maxAttempts > 1 ? 's' : ''} for this examination.`,
      });
      return;
    }

    const durationMinutes = Math.max(1, Math.min(360, Number(examDoc.durationMinutes || 30)));
    const startedAtMs = now;
    const rawEnd = now + durationMinutes * 60_000;
    const expiresAtMs = Math.min(closesAtMs, rawEnd);
    const attemptNumber = existingAttempts.length + 1;
    const attemptId = `att_${examId.slice(-12)}_${student.uid.slice(0, 8)}_${attemptNumber}_${now}`;

    const permit = signAttemptPermit({
      attemptId,
      examId,
      userId: student.uid,
      attemptNumber,
      startedAtMs,
      expiresAtMs,
    });

    res.json({
      resumed: false,
      attemptId,
      attemptNumber,
      startedAtMs,
      expiresAtMs,
      savedAnswers: {},
      attemptPermit: permit,
    });
  });

  // 6. Server-Side Automatic Marking & Cryptographic Receipt Generation
  app.post('/api/exams/:examId/submit', async (req: Request, res: Response) => {
    const idToken = extractBearerToken(req);
    const student = idToken ? await verifyFirebaseIdToken(idToken) : null;
    if (!student || !student.emailVerified) {
      res.status(401).json({ error: 'Student authentication required to submit answers.' });
      return;
    }

    const examId = String(req.params.examId || '').trim();
    const permitToken = String(req.body?.attemptPermit || '').trim();
    const permit = verifyAttemptPermit(permitToken);

    if (!permit || permit.examId !== examId || permit.userId !== student.uid) {
      res.status(403).json({ error: 'Invalid or expired examination session permit.' });
      return;
    }

    const now = Date.now();
    // Allow 45 seconds network transit grace for auto-submission when countdown hits 00:00
    if (now > permit.expiresAtMs + 45_000) {
      res.status(403).json({
        error: 'The allowed time limit for this examination attempt has already expired.',
      });
      return;
    }

    const ledger = readRankLedger();
    if (ledger.submissions[permit.attemptId]) {
      res.status(409).json({ error: 'This examination attempt has already been submitted.' });
      return;
    }

    const [examDoc, configDoc] = await Promise.all([
      fetchFirestoreDocument('exams', examId, student.idToken),
      fetchFirestoreDocument('examConfigs', examId, student.idToken),
    ]);

    if (!examDoc || !configDoc) {
      res.status(404).json({ error: 'Examination configuration could not be loaded for grading.' });
      return;
    }

    const answerKeyJson = unsealString(String(configDoc.sealedAnswerKey || ''));
    if (!answerKeyJson) {
      res.status(500).json({ error: 'Unable to unseal examination answer key on server.' });
      return;
    }

    const fullQuestions = JSON.parse(answerKeyJson) as ExamQuestionFull[];
    const incomingAnswers =
      req.body?.answers && typeof req.body.answers === 'object'
        ? (req.body.answers as Record<string, string>)
        : {};

    const cleanAnswers: Record<string, string> = {};
    for (const q of fullQuestions) {
      if (incomingAnswers[q.id] !== undefined) {
        cleanAnswers[q.id] = String(incomingAnswers[q.id]).slice(0, 2000);
      }
    }

    const passingMarks = Math.max(1, Number(examDoc.passingMarks || 1));
    const grading = gradeExamSubmission(fullQuestions, cleanAnswers, passingMarks);
    const resultsPublished = Boolean(examDoc.resultsPublished);
    const showExplanations = Boolean(examDoc.showExplanations);
    const rankBoardPublished = Boolean(examDoc.rankBoardPublished);
    const anonymizeRankBoard = Boolean(examDoc.anonymizeRankBoard);

    const studentSafeBreakdown = grading.breakdown.map((item) => ({
      ...item,
      correctAnswerLabel:
        resultsPublished && showExplanations
          ? item.correctAnswerLabel
          : 'Available after official answer review release',
      explanation: resultsPublished && showExplanations ? item.explanation : '',
    }));

    const serverReceipt = computeServerReceipt({
      attemptId: permit.attemptId,
      examId,
      userId: student.uid,
      status: grading.status,
      marksObtained: grading.marksObtained,
      totalMarks: grading.totalMarks,
    });

    const examTitle = String(examDoc.title || 'Online Examination');
    const subject = String(examDoc.subject || 'Technology');
    const studentName = String(req.body?.studentName || student.displayName || 'Student').slice(0, 100);

    ledger.exams[examId] = {
      examId,
      examTitle,
      subject,
      resultsPublished,
      rankBoardPublished,
      anonymizeRankBoard,
      updatedAtMs: now,
    };
    ledger.submissions[permit.attemptId] = {
      attemptId: permit.attemptId,
      examId,
      examTitle,
      subject,
      userId: student.uid,
      studentName,
      marksObtained: grading.marksObtained,
      totalMarks: grading.totalMarks,
      percentage: grading.percentage,
      passed: grading.passed,
      isFinalized: grading.status === 'graded',
      submittedAtMs: now,
      serverReceipt,
    };
    writeRankLedger(ledger);

    res.json({
      attemptId: permit.attemptId,
      status: grading.status,
      marksObtained: grading.marksObtained,
      totalMarks: grading.totalMarks,
      percentage: grading.percentage,
      passed: grading.passed,
      resultsPublished,
      reviewBreakdown: studentSafeBreakdown,
      serverReceipt,
      submittedAtMs: now,
    });
  });

  // 7. Admin Manual Grading / Mark Adjustment Signer & Rank Ledger Sync
  app.post('/api/admin/results/sign', async (req: Request, res: Response) => {
    const adminUser = await verifyTrustedAdminRequest(req);
    if (!adminUser) {
      res.status(403).json({ error: 'Only verified administrators may grade or adjust examination marks.' });
      return;
    }

    const attemptId = String(req.body?.attemptId || '').trim();
    const examId = String(req.body?.examId || '').trim();
    const userId = String(req.body?.userId || '').trim();
    const status = String(req.body?.status || 'graded');
    const marksObtained = Math.max(0, Math.floor(Number(req.body?.marksObtained || 0)));
    const totalMarks = Math.max(1, Math.floor(Number(req.body?.totalMarks || 1)));
    const percentage = Math.min(100, Math.max(0, Math.round((marksObtained / totalMarks) * 100)));
    const passed = Boolean(req.body?.passed);

    const serverReceipt = computeServerReceipt({
      attemptId,
      examId,
      userId,
      status,
      marksObtained,
      totalMarks,
    });

    const ledger = readRankLedger();
    const examTitle = String(req.body?.examTitle || ledger.exams[examId]?.examTitle || 'Online Examination');
    const subject = String(req.body?.subject || ledger.exams[examId]?.subject || 'Technology');
    const studentName = String(req.body?.studentName || 'Student').slice(0, 100);
    const submittedAtMs = Number(req.body?.submittedAtMs || Date.now());

    ledger.submissions[attemptId] = {
      attemptId,
      examId,
      examTitle,
      subject,
      userId,
      studentName,
      marksObtained,
      totalMarks,
      percentage,
      passed,
      isFinalized: status === 'graded',
      submittedAtMs,
      serverReceipt,
    };
    writeRankLedger(ledger);

    res.json({
      serverReceipt,
      percentage,
    });
  });

  // 8. Admin Rank Board / Result Publication Visibility Sync
  app.post('/api/admin/rank-board/visibility', async (req: Request, res: Response) => {
    const adminUser = await verifyTrustedAdminRequest(req);
    if (!adminUser) {
      res.status(403).json({ error: 'Only verified administrators may update rank board visibility.' });
      return;
    }

    const examId = String(req.body?.examId || '').trim();
    if (!examId) {
      res.status(400).json({ error: 'examId is required.' });
      return;
    }

    const ledger = readRankLedger();
    const prev = ledger.exams[examId];
    ledger.exams[examId] = {
      examId,
      examTitle: String(req.body?.examTitle || prev?.examTitle || 'Online Examination'),
      subject: String(req.body?.subject || prev?.subject || 'Technology'),
      resultsPublished:
        req.body?.resultsPublished !== undefined
          ? Boolean(req.body.resultsPublished)
          : Boolean(prev?.resultsPublished),
      rankBoardPublished:
        req.body?.rankBoardPublished !== undefined
          ? Boolean(req.body.rankBoardPublished)
          : Boolean(prev?.rankBoardPublished),
      anonymizeRankBoard:
        req.body?.anonymizeRankBoard !== undefined
          ? Boolean(req.body.anonymizeRankBoard)
          : Boolean(prev?.anonymizeRankBoard),
      updatedAtMs: Date.now(),
    };
    writeRankLedger(ledger);

    res.json({ ok: true, visibility: ledger.exams[examId] });
  });

  // 9. Public Sanitized Rank Board Endpoint (Server-Verified Submissions Only)
  app.get('/api/rank-board', (_req: Request, res: Response) => {
    const ledger = readRankLedger();
    const publishedExamIds = new Set(
      Object.values(ledger.exams)
        .filter((e) => e.rankBoardPublished)
        .map((e) => e.examId)
    );

    const groupedByExam = new Map<string, LedgerSubmissionRecord[]>();
    for (const sub of Object.values(ledger.submissions)) {
      if (!publishedExamIds.has(sub.examId)) continue;
      const list = groupedByExam.get(sub.examId) || [];
      list.push(sub);
      groupedByExam.set(sub.examId, list);
    }

    const entries: RankBoardEntry[] = [];
    for (const [examId, subs] of groupedByExam.entries()) {
      const meta = ledger.exams[examId];
      const ranked = computeCompetitionRankings(subs, { finalizedOnly: true });
      for (const r of ranked) {
        const anonymize = Boolean(meta?.anonymizeRankBoard);
        const code = buildAnonymizedCandidateCode(r.userId, r.examId);
        entries.push({
          id: `rk_${examId}_${r.attemptId}`,
          examId: r.examId,
          examTitle: meta?.examTitle || r.examTitle,
          subject: meta?.subject || r.subject,
          attemptId: r.attemptId,
          rankPosition: r.rankPosition,
          studentDisplayName: anonymize ? code : r.studentName,
          anonymizedCode: code,
          anonymizeNames: anonymize,
          marksObtained: r.marksObtained,
          totalMarks: r.totalMarks,
          percentage: r.percentage,
          passed: r.passed,
          isFinalized: r.isFinalized,
          published: true,
          serverReceipt: r.serverReceipt,
          updatedAtMs: meta?.updatedAtMs || r.submittedAtMs,
        });
      }
    }

    res.json({
      entries,
      totalCompletedAttempts: Object.keys(ledger.submissions).length,
      totalPublishedResults: entries.length,
    });
  });

  // 10. Validated Notice Image Upload & Delivery for Announcements
  app.post(
    '/api/images/upload',
    express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '5mb' }),
    async (req: Request, res: Response) => {
      const adminUser = await verifyTrustedAdminRequest(req);
      if (!adminUser) {
        res.status(403).json({ error: 'Only verified administrators may upload notice images.' });
        return;
      }

      const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (bodyBuffer.length === 0 || bodyBuffer.length > MAX_IMAGE_BYTES) {
        res.status(400).json({ error: 'Notice image must be non-empty and under 5 MB.' });
        return;
      }

      const sig = detectImageSignature(bodyBuffer);
      if (!sig) {
        res.status(400).json({
          error: 'Unsupported image format. Please upload a valid PNG, JPEG, or WebP image.',
        });
        return;
      }

      const safeName = `notice_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${sig.ext}`;
      fs.writeFileSync(path.join(IMAGE_DIR, safeName), bodyBuffer);

      res.status(201).json({
        fileName: safeName,
        imageUrl: `/api/images/${encodeURIComponent(safeName)}`,
      });
    }
  );

  app.get('/api/images/:fileName', (req: Request, res: Response) => {
    const fileName = path.basename(String(req.params.fileName || ''));
    const match = /^[a-zA-Z0-9_-]+\.(png|jpg|webp)$/i.exec(fileName);
    if (!match) {
      res.status(400).json({ error: 'Invalid image identifier.' });
      return;
    }

    const fullPath = path.join(IMAGE_DIR, fileName);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'Requested image was not found.' });
      return;
    }

    const ext = match[1].toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'image/webp';
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(fullPath).pipe(res);
  });

  // 11. Validated Server-Side PDF Binary Upload Fallback (Magic-Byte + Admin Auth Checked)
  app.post(
    '/api/files/upload',
    express.raw({ type: 'application/pdf', limit: '25mb' }),
    async (req: Request, res: Response) => {
      const adminUser = await verifyTrustedAdminRequest(req);
      if (!adminUser) {
        res.status(403).json({ error: 'Only verified administrators may upload PDF documents.' });
        return;
      }

      const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (bodyBuffer.length === 0 || bodyBuffer.length > MAX_PDF_BYTES) {
        res.status(400).json({ error: 'PDF file must be non-empty and must not exceed 25 MB.' });
        return;
      }

      if (!hasPdfMagicHeader(bodyBuffer)) {
        res.status(400).json({
          error: 'Invalid file signature. Only genuine PDF binary documents (%PDF- header) are accepted.',
        });
        return;
      }

      const rawName = String(req.headers['x-file-name'] || 'document.pdf');
      const safeName = sanitizePdfFileName(rawName);
      const targetPath = path.join(UPLOAD_DIR, safeName);
      fs.writeFileSync(targetPath, bodyBuffer);

      res.status(201).json({
        fileName: safeName,
        fileSize: bodyBuffer.length,
        pdfUrl: `/api/files/${encodeURIComponent(safeName)}`,
        storagePath: `server:${safeName}`,
      });
    }
  );

  // 12. Secure PDF Delivery Endpoint
  app.get('/api/files/:fileName', (req: Request, res: Response) => {
    const fileName = path.basename(String(req.params.fileName || ''));
    if (!/^[a-zA-Z0-9_\-.]+\.pdf$/i.test(fileName)) {
      res.status(400).json({ error: 'Invalid PDF document identifier.' });
      return;
    }

    const fullPath = path.join(UPLOAD_DIR, fileName);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'Requested PDF document was not found.' });
      return;
    }

    const download = req.query.download === '1';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${fileName.replace(/"/g, '')}"`
    );
    fs.createReadStream(fullPath).pipe(res);
  });

  // 13. Authorized PDF Deletion Endpoint
  app.delete('/api/files/:fileName', async (req: Request, res: Response) => {
    const adminUser = await verifyTrustedAdminRequest(req);
    if (!adminUser) {
      res.status(403).json({ error: 'Only verified administrators may delete stored PDF files.' });
      return;
    }

    const fileName = path.basename(String(req.params.fileName || ''));
    if (!/^[a-zA-Z0-9_\-.]+\.pdf$/i.test(fileName)) {
      res.status(400).json({ error: 'Invalid PDF filename.' });
      return;
    }

    const fullPath = path.join(UPLOAD_DIR, fileName);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    res.json({ deleted: true });
  });

  // 14. Standards-Compliant Curriculum Reference PDF Generator
  app.get('/api/curriculum-pdf/:slug', (req: Request, res: Response) => {
    const slug = String(req.params.slug || 'study-guide').replace(/\.pdf$/i, '');
    const title = String(req.query.title || slug.replace(/-/g, ' ').toUpperCase()).slice(0, 120);
    const subject = String(req.query.subject || 'Technology Stream').slice(0, 80);
    const grade = String(req.query.grade || 'G.C.E. A/L').slice(0, 40);

    const pdfBuffer = buildCurriculumPdfBuffer(title, `${subject}  |  Academic Level: ${grade}`, [
      'Official Curriculum Reference Document — Smart Tech',
      '-------------------------------------------------------------------------',
      '1. Core Learning Objectives:',
      '   - Master foundational engineering, systems architecture, and instrumentation principles.',
      '   - Apply analytical problem-solving to structured and essay examination questions.',
      '   - Verify calculations using SI units, circuit laws, and calibration tolerances.',
      '',
      '2. Examination Preparation Checklist:',
      '   - Review unit derivations, block diagrams, and truth tables carefully.',
      '   - Practice past paper structured questions under strict timed conditions.',
      '   - Cross-check safety standards and laboratory instrumentation procedures.',
      '',
      'Generated by Smart Tech Document Delivery Service.',
    ]);

    const download = req.query.download === '1';
    const safeDownloadName = `${slug.replace(/[^a-zA-Z0-9_-]/g, '_') || 'resource'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${safeDownloadName}"`
    );
    res.send(pdfBuffer);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Tech running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
