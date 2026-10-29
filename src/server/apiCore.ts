import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import firebaseAppletConfig from '../../firebase-applet-config.json';
import type { ExamQuestionFull, RankBoardEntry } from '../types/platform';
import {
  buildAnonymizedCandidateCode,
  calculateExamTotalMarks,
  computeCompetitionRankings,
  evaluateCodeRateLimit,
  gradeExamSubmission,
  isValidSixDigitCode,
  sanitizeQuestionsForPublic,
} from '../utils/platformLogic';

export interface NormalizedApiRequest {
  method: string;
  pathname: string;
  query: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  rawBody: Buffer;
  jsonBody?: Record<string, unknown> | null;
  ip: string;
}

export interface NormalizedApiResponse {
  status: number;
  headers: Record<string, string>;
  body: string | Buffer;
  isBinary?: boolean;
}

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const BOOTSTRAPPED_ADMIN_EMAIL = 'hiranyaudakara2@gmail.com';
const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const DATA_DIR = path.resolve(process.cwd(), '.data');
const UPLOAD_DIR = path.resolve(DATA_DIR, 'uploads');
const IMAGE_DIR = path.resolve(DATA_DIR, 'images');
const MASTER_KEY_PATH = path.resolve(DATA_DIR, 'exam-master.key');
const RANK_LEDGER_PATH = path.resolve(DATA_DIR, 'verified-rank-ledger.json');

const IS_NETLIFY_OR_SERVERLESS = Boolean(
  process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.VERCEL ||
    process.env.FUNCTION_TARGET
);

function ensureWritableDirs(): boolean {
  if (IS_NETLIFY_OR_SERVERLESS) return false;
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

const LOCAL_DISK_WRITABLE = ensureWritableDirs();

interface FirebaseRuntimeConfig {
  projectId: string;
  apiKey: string;
  appId: string;
  firestoreDatabaseId: string;
}

function getFirebaseRuntimeConfig(): FirebaseRuntimeConfig {
  return {
    projectId:
      process.env.FIREBASE_PROJECT_ID ||
      process.env.VITE_FIREBASE_PROJECT_ID ||
      firebaseAppletConfig.projectId ||
      '',
    apiKey:
      process.env.FIREBASE_API_KEY ||
      process.env.VITE_FIREBASE_API_KEY ||
      firebaseAppletConfig.apiKey ||
      '',
    appId:
      process.env.FIREBASE_APP_ID ||
      process.env.VITE_FIREBASE_APP_ID ||
      firebaseAppletConfig.appId ||
      '',
    firestoreDatabaseId:
      process.env.FIRESTORE_DATABASE_ID ||
      process.env.VITE_FIRESTORE_DATABASE_ID ||
      firebaseAppletConfig.firestoreDatabaseId ||
      '(default)',
  };
}

function resolveMasterKey(): Buffer {
  const envSecret = (
    process.env.EXAM_HMAC_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_ACCESS_PASSPHRASE ||
    ''
  ).trim();

  if (envSecret.length >= 16) {
    return crypto.createHash('sha256').update(envSecret, 'utf8').digest();
  }

  if (!IS_NETLIFY_OR_SERVERLESS) {
    try {
      if (fs.existsSync(MASTER_KEY_PATH)) {
        const hex = fs.readFileSync(MASTER_KEY_PATH, 'utf8').trim();
        if (/^[0-9a-f]{64}$/i.test(hex)) {
          return Buffer.from(hex, 'hex');
        }
      }
    } catch {
      // Fall through to deterministic derivation
    }
  }

  // Deterministic project-scoped key ensures Netlify serverless cold starts always
  // derive the exact same 256-bit key even before optional env secrets are added.
  const cfg = getFirebaseRuntimeConfig();
  const seed = `smart-tech-exam-seal-v1:${cfg.projectId}:${cfg.appId}:${cfg.firestoreDatabaseId}`;
  const derived = crypto
    .createHmac('sha256', 'smart-tech-platform-deterministic-root-v1')
    .update(seed, 'utf8')
    .digest();

  if (LOCAL_DISK_WRITABLE) {
    try {
      if (!fs.existsSync(MASTER_KEY_PATH)) {
        fs.writeFileSync(MASTER_KEY_PATH, derived.toString('hex'), { mode: 0o600 });
      }
    } catch {
      // Ignore read-only filesystem
    }
  }

  return derived;
}

const MASTER_KEY = resolveMasterKey();
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

let MEMORY_RANK_LEDGER: VerifiedRankLedger = { exams: {}, submissions: {} };

function readRankLedger(): VerifiedRankLedger {
  if (!IS_NETLIFY_OR_SERVERLESS) {
    try {
      if (fs.existsSync(RANK_LEDGER_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(RANK_LEDGER_PATH, 'utf8')) as VerifiedRankLedger;
        MEMORY_RANK_LEDGER = {
          exams: { ...MEMORY_RANK_LEDGER.exams, ...(parsed.exams || {}) },
          submissions: { ...MEMORY_RANK_LEDGER.submissions, ...(parsed.submissions || {}) },
        };
      }
    } catch {
      // Use in-memory ledger
    }
  }
  return MEMORY_RANK_LEDGER;
}

function writeRankLedger(ledger: VerifiedRankLedger): void {
  MEMORY_RANK_LEDGER = ledger;
  if (LOCAL_DISK_WRITABLE) {
    try {
      fs.writeFileSync(RANK_LEDGER_PATH, JSON.stringify(ledger, null, 2), { mode: 0o600 });
    } catch {
      // Safe no-op on read-only serverless filesystems
    }
  }
}

function detectImageSignature(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

function hasPdfMagicHeader(buf: Buffer): boolean {
  return buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-';
}

function sanitizePdfFileName(rawName: string): string {
  const base = path.basename(rawName).replace(/[^a-zA-Z0-9_\-.]/g, '_');
  const clean = base.replace(/\.pdf$/i, '');
  return `${clean.slice(0, 60)}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.pdf`;
}

export function buildCurriculumPdfBuffer(title: string, subtitle: string, lines: string[]): Buffer {
  const sanitizeStr = (s: string) => s.replace(/[()\\]/g, '\\$&');
  let streamText = `BT\n/F1 16 Tf\n50 740 Td\n(${sanitizeStr(title)}) Tj\nET\n`;
  streamText += `BT\n/F1 10 Tf\n50 720 Td\n(${sanitizeStr(subtitle)}) Tj\nET\n`;
  let y = 680;
  for (const line of lines) {
    streamText += `BT\n/F1 10 Tf\n50 ${y} Td\n(${sanitizeStr(line)}) Tj\nET\n`;
    y -= 18;
  }
  const streamLen = Buffer.byteLength(streamText, 'utf8');

  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
4 0 obj
<< /Length ${streamLen} >>
stream
${streamText}endstream
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000280 00000 n 
0000000225 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${350 + streamLen}
%%EOF`;

  return Buffer.from(pdfContent, 'utf8');
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
  const sig = crypto
    .createHmac('sha256', MASTER_KEY)
    .update(`permit:${encoded}`, 'utf8')
    .digest('hex');
  return `${encoded}.${sig}`;
}

function verifyAttemptPermit(token: string): AttemptPermitPayload | null {
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expected = crypto
      .createHmac('sha256', MASTER_KEY)
      .update(`permit:${encoded}`, 'utf8')
      .digest('hex');
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AttemptPermitPayload;
  } catch {
    return null;
  }
}

function issueAdminSessionToken(subjectId: string): { token: string; issuedAtMs: number } {
  const issuedAtMs = Date.now();
  const payload = `${subjectId}:${issuedAtMs}`;
  const signature = crypto.createHmac('sha256', MASTER_KEY).update(payload, 'utf8').digest('hex');
  return { token: `${payload}:${signature}`, issuedAtMs };
}

function verifyAdminSessionToken(token: string): { valid: boolean; subjectId: string } {
  if (!token || REVOKED_ADMIN_TOKENS.has(token)) {
    return { valid: false, subjectId: '' };
  }
  const parts = token.split(':');
  if (parts.length !== 3) {
    return { valid: false, subjectId: '' };
  }
  const [subjectId, issuedStr, sig] = parts;
  const issuedAt = Number(issuedStr);
  if (!subjectId || !Number.isFinite(issuedAt)) {
    return { valid: false, subjectId: '' };
  }
  if (Date.now() - issuedAt > ADMIN_SESSION_TTL_MS || issuedAt > Date.now() + 60_000) {
    return { valid: false, subjectId: '' };
  }
  const payload = `${subjectId}:${issuedStr}`;
  const expected = crypto.createHmac('sha256', MASTER_KEY).update(payload, 'utf8').digest('hex');
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false, subjectId: '' };
    }
    return { valid: true, subjectId };
  } catch {
    return { valid: false, subjectId: '' };
  }
}

// Optional Service Account OAuth2 Minter for Serverless Admin Operations
let cachedServiceAccountToken: { accessToken: string; expiresAtMs: number } | null = null;

async function getOptionalServiceAccountToken(): Promise<string | null> {
  const rawJson = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!rawJson) return null;

  if (cachedServiceAccountToken && cachedServiceAccountToken.expiresAtMs > Date.now() + 120_000) {
    return cachedServiceAccountToken.accessToken;
  }

  try {
    const sa = JSON.parse(rawJson) as {
      client_email?: string;
      private_key?: string;
      token_uri?: string;
    };
    if (!sa.client_email || !sa.private_key) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claimSet = Buffer.from(
      JSON.stringify({
        iss: sa.client_email,
        scope:
          'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/userinfo.email',
        aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
        iat: nowSec,
        exp: nowSec + 3600,
      })
    ).toString('base64url');

    const unsigned = `${header}.${claimSet}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsigned);
    const signature = signer.sign(sa.private_key).toString('base64url');
    const assertion = `${unsigned}.${signature}`;

    const resp = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });

    if (!resp.ok) return null;
    const data = (await resp.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    cachedServiceAccountToken = {
      accessToken: data.access_token,
      expiresAtMs: Date.now() + Number(data.expires_in || 3600) * 1000,
    };
    return data.access_token;
  } catch {
    return null;
  }
}

interface VerifiedAdminContext {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  idToken: string;
  authMode: 'firebase' | 'session';
}

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  idToken: string;
}

function getHeader(headers: Record<string, string | undefined>, name: string): string {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower && typeof v === 'string') {
      return v;
    }
  }
  return '';
}

function extractBearerToken(headers: Record<string, string | undefined>): string | null {
  const authHeader = getHeader(headers, 'authorization');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  const cfg = getFirebaseRuntimeConfig();
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
  bearerToken?: string
): Promise<Record<string, unknown> | null> {
  const cfg = getFirebaseRuntimeConfig();
  if (!cfg.projectId) return null;
  const dbId = cfg.firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    cfg.projectId
  )}/databases/${encodeURIComponent(dbId)}/documents/${encodeURIComponent(
    collectionName
  )}/${encodeURIComponent(docId)}`;

  const effectiveBearer = bearerToken || (await getOptionalServiceAccountToken()) || '';
  const headers: Record<string, string> = {};
  if (effectiveBearer) {
    headers.Authorization = `Bearer ${effectiveBearer}`;
  }

  const resp = await fetch(url, { headers });
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
  const cfg = getFirebaseRuntimeConfig();
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

async function verifyTrustedAdminRequest(
  headers: Record<string, string | undefined>
): Promise<VerifiedAdminContext | null> {
  const adminSessionHeader = getHeader(headers, 'x-admin-session').trim();
  if (adminSessionHeader && REVOKED_ADMIN_TOKENS.has(adminSessionHeader)) {
    return null;
  }

  const idToken = extractBearerToken(headers);
  if (idToken) {
    const verified = await verifyFirebaseIdToken(idToken);
    if (verified) {
      const isPrimaryEmail =
        verified.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
      // Primary bootstrapped admin accepted when emailVerified is true OR accompanied by valid HMAC admin session
      const sessionCheck = adminSessionHeader
        ? verifyAdminSessionToken(adminSessionHeader)
        : { valid: false, subjectId: '' };

      if (isPrimaryEmail && (verified.emailVerified || sessionCheck.valid)) {
        return {
          ...verified,
          emailVerified: true,
          authMode: 'firebase',
        };
      }

      if (verified.emailVerified) {
        const adminDoc = await fetchFirestoreDocument('admins', verified.uid, idToken);
        if (adminDoc !== null) {
          return {
            ...verified,
            authMode: 'firebase',
          };
        }
      }
    }
  }

  // Fallback: Verified HMAC Admin Session Token (e.g., direct Admin Password login on any device)
  if (adminSessionHeader) {
    const sessionCheck = verifyAdminSessionToken(adminSessionHeader);
    if (sessionCheck.valid) {
      const saToken = (await getOptionalServiceAccountToken()) || '';
      return {
        uid: sessionCheck.subjectId === 'cred_admin' ? 'bootstrapped_admin' : sessionCheck.subjectId,
        email: BOOTSTRAPPED_ADMIN_EMAIL,
        displayName: 'Administrator',
        emailVerified: true,
        idToken: saToken,
        authMode: 'session',
      };
    }
  }

  return null;
}

function jsonResponse(
  status: number,
  payload: unknown,
  extraHeaders?: Record<string, string>
): NormalizedApiResponse {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(payload),
    isBinary: false,
  };
}

function parseJsonBody(req: NormalizedApiRequest): Record<string, unknown> {
  if (req.jsonBody && typeof req.jsonBody === 'object') {
    return req.jsonBody;
  }
  if (!req.rawBody || req.rawBody.length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(req.rawBody.toString('utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function safeTimingEqualStrings(a: string, b: string): boolean {
  const hashA = crypto.createHmac('sha256', MASTER_KEY).update(a, 'utf8').digest();
  const hashB = crypto.createHmac('sha256', MASTER_KEY).update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export async function handleSmartTechApiRequest(
  req: NormalizedApiRequest
): Promise<NormalizedApiResponse> {
  const method = req.method.toUpperCase();
  // Normalize Netlify function path prefix if present
  let pathname = req.pathname || '/';
  if (pathname.startsWith('/.netlify/functions/api')) {
    const rest = pathname.slice('/.netlify/functions/api'.length);
    pathname = rest.startsWith('/api/') ? rest : `/api${rest.startsWith('/') ? '' : '/'}${rest}`;
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  if (method === 'OPTIONS') {
    return {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Session, X-File-Name',
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
      body: '',
    };
  }

  // 1. Authoritative Server Clock for Exam Schedule Enforcement (Asia/Colombo)
  if (method === 'GET' && pathname === '/api/server-time') {
    const now = Date.now();
    const colomboFormatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Colombo',
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(new Date(now));

    return jsonResponse(200, {
      serverTimeMs: now,
      isoUtc: new Date(now).toISOString(),
      colomboFormatted,
      timezone: 'Asia/Colombo',
    });
  }

  // 2a. Admin Session Status Check (Restores verified session across page reloads on any device)
  if (method === 'GET' && pathname === '/api/admin/session-status') {
    const adminCtx = await verifyTrustedAdminRequest(req.headers);
    if (!adminCtx) {
      return jsonResponse(200, {
        authorized: false,
      });
    }
    return jsonResponse(200, {
      authorized: true,
      email: adminCtx.email,
      authMode: adminCtx.authMode,
      hasServerFirestoreToken: Boolean(adminCtx.idToken),
    });
  }

  // 2b. Direct Credentials Admin Login (Email: hiranyaudakara2@gmail.com + Admin Password)
  if (method === 'POST' && pathname === '/api/admin/credentials-login') {
    const body = parseJsonBody(req);
    const email = String(body.email || BOOTSTRAPPED_ADMIN_EMAIL).trim().toLowerCase();
    const password = String(body.password || '');
    const expectedPassword = process.env.ADMIN_DIRECT_PASSWORD || 'Hirusa@#123';

    if (
      email === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() &&
      password.length > 0 &&
      safeTimingEqualStrings(password, expectedPassword)
    ) {
      const issued = issueAdminSessionToken('cred_admin');
      return jsonResponse(200, {
        authorized: true,
        email: BOOTSTRAPPED_ADMIN_EMAIL,
        adminSessionToken: issued.token,
        verifiedAtMs: issued.issuedAtMs,
      });
    }

    return jsonResponse(401, {
      authorized: false,
      error: 'Access Denied: Incorrect administrator password.',
    });
  }

  // 2c. Server-Side Administrator Identity Verification
  if (method === 'POST' && pathname === '/api/admin/verify') {
    const adminUser = await verifyTrustedAdminRequest(req.headers);
    if (!adminUser) {
      return jsonResponse(403, {
        authorized: false,
        error:
          'Access Denied: Unauthorized Administrator. Only hiranyaudakara2@gmail.com is authorized as administrator.',
      });
    }

    const issued = issueAdminSessionToken(adminUser.uid);
    return jsonResponse(200, {
      authorized: true,
      uid: adminUser.uid,
      email: adminUser.email,
      adminSessionToken: issued.token,
      verifiedAtMs: issued.issuedAtMs,
    });
  }

  // 2d. Admin Logout
  if (method === 'POST' && pathname === '/api/admin/logout') {
    const body = parseJsonBody(req);
    const token = String(body.adminSessionToken || getHeader(req.headers, 'x-admin-session') || '').trim();
    if (token) {
      REVOKED_ADMIN_TOKENS.add(token);
    }
    return jsonResponse(200, { loggedOut: true });
  }

  // 3. Seal Native Online Exam (AES-256-GCM Answer Key & 6-Digit Password Verifier)
  if (method === 'POST' && pathname === '/api/admin/exams/seal') {
    const adminUser = await verifyTrustedAdminRequest(req.headers);
    if (!adminUser) {
      return jsonResponse(403, {
        error: 'Only verified administrators may configure online examinations.',
      });
    }

    const body = parseJsonBody(req);
    const examId = String(body.examId || '').trim();
    if (!examId || !/^[a-zA-Z0-9_-]{1,128}$/.test(examId)) {
      return jsonResponse(400, { error: 'Valid examination identifier is required.' });
    }

    const codeRevoked = Boolean(body.codeRevoked);
    let accessCode = String(body.accessCode || '').trim();
    const keepExistingCode = Boolean(body.keepExistingCode);

    if (!accessCode && keepExistingCode && adminUser.idToken) {
      const existingConfig = await fetchFirestoreDocument('examConfigs', examId, adminUser.idToken);
      const unsealed = existingConfig?.sealedAccessCode
        ? unsealString(String(existingConfig.sealedAccessCode))
        : null;
      if (unsealed && isValidSixDigitCode(unsealed)) {
        accessCode = unsealed;
      }
    }

    if (!isValidSixDigitCode(accessCode)) {
      return jsonResponse(400, {
        error: 'A valid 6-digit numeric examination password (000000–999999) is required.',
      });
    }

    const rawQuestions = Array.isArray(body.questions)
      ? (body.questions as ExamQuestionFull[])
      : [];
    if (rawQuestions.length === 0 || rawQuestions.length > 50) {
      return jsonResponse(400, { error: 'Examination must include between 1 and 50 questions.' });
    }

    const sanitizedQuestions = sanitizeQuestionsForPublic(rawQuestions);
    const totalMarks = calculateExamTotalMarks(sanitizedQuestions);
    const codeMac = computeExamCodeMac(examId, accessCode);
    const sealedAccessCode = sealString(accessCode);
    const sealedAnswerKey = sealString(JSON.stringify(rawQuestions));

    return jsonResponse(200, {
      examId,
      sanitizedQuestions,
      questionCount: sanitizedQuestions.length,
      totalMarks,
      codeMac,
      sealedAccessCode,
      codeRevoked,
      sealedAnswerKey,
    });
  }

  // 4. Reveal Native Exam Answer Key & 6-Digit Password to Verified Admin Only
  const revealMatch = /^\/api\/admin\/exams\/([a-zA-Z0-9_-]{1,128})\/reveal$/.exec(pathname);
  if (method === 'GET' && revealMatch) {
    const adminUser = await verifyTrustedAdminRequest(req.headers);
    if (!adminUser) {
      return jsonResponse(403, {
        error: 'Only verified administrators may view examination answer keys.',
      });
    }

    const examId = revealMatch[1];
    if (!adminUser.idToken) {
      return jsonResponse(403, {
        error:
          'Connect your Google administrator account once on this device to decrypt stored cloud examination keys.',
      });
    }

    const configDoc = await fetchFirestoreDocument('examConfigs', examId, adminUser.idToken);
    if (!configDoc) {
      return jsonResponse(404, {
        error: 'Sealed configuration was not found for this examination.',
      });
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

    return jsonResponse(200, {
      examId,
      accessCode,
      codeRevoked: Boolean(configDoc.codeRevoked),
      questions,
    });
  }

  // 5. Student Examination Start Gate (Validates 6-Digit Password, Schedule, & Attempt Cap)
  const startMatch = /^\/api\/exams\/([a-zA-Z0-9_-]{1,128})\/start$/.exec(pathname);
  if (method === 'POST' && startMatch) {
    const idToken = extractBearerToken(req.headers);
    const student = idToken ? await verifyFirebaseIdToken(idToken) : null;
    if (!student || !student.emailVerified) {
      return jsonResponse(401, {
        error: 'Please sign in with a verified Google student account before starting an examination.',
      });
    }

    const examId = startMatch[1];
    const body = parseJsonBody(req);
    const providedCode = String(body.accessCode || '').trim();
    const rateKey = `${req.ip}:${student.uid}:${examId}`;
    const now = Date.now();

    const rateEval = evaluateCodeRateLimit(CODE_FAILURE_LOG.get(rateKey) || [], now);
    if (rateEval.blocked) {
      return jsonResponse(429, {
        error: `Too many incorrect password attempts. Please wait ${rateEval.retryAfterSeconds} seconds before trying again.`,
        retryAfterSeconds: rateEval.retryAfterSeconds,
      });
    }

    const [examDoc, configDoc] = await Promise.all([
      fetchFirestoreDocument('exams', examId, student.idToken),
      fetchFirestoreDocument('examConfigs', examId, student.idToken),
    ]);

    if (!examDoc || !examDoc.published) {
      return jsonResponse(404, { error: 'This examination is not currently available.' });
    }

    const opensAtMs = Number(examDoc.opensAt || 0);
    const closesAtMs = Number(examDoc.closesAt || 0);
    if (now < opensAtMs) {
      return jsonResponse(403, { error: 'This examination has not opened yet.' });
    }
    if (now >= closesAtMs) {
      return jsonResponse(403, { error: 'This examination window has already closed.' });
    }

    if (!configDoc) {
      return jsonResponse(400, {
        error: 'This examination uses an external Google Form rather than the interactive runner.',
      });
    }

    if (configDoc.codeRevoked) {
      return jsonResponse(403, {
        error: 'Access to this examination password has been temporarily paused by the administrator.',
      });
    }

    const requiresAccessCode = examDoc.accessCodeProtected !== false;
    if (requiresAccessCode) {
      if (!isValidSixDigitCode(providedCode)) {
        return jsonResponse(400, {
          error: 'Please enter a valid 6-digit numeric examination password.',
        });
      }

      const expectedMac = String(configDoc.codeMac || '');
      const actualMac = computeExamCodeMac(examId, providedCode);
      const macBufA = Buffer.from(expectedMac, 'hex');
      const macBufB = Buffer.from(actualMac, 'hex');
      const codeMatches =
        macBufA.length > 0 &&
        macBufA.length === macBufB.length &&
        crypto.timingSafeEqual(macBufA, macBufB);

      if (!codeMatches) {
        const updatedFailures = [...rateEval.recentFailures, now];
        CODE_FAILURE_LOG.set(rateKey, updatedFailures);
        return jsonResponse(403, {
          error:
            'Incorrect 6-digit examination password. Please verify the code shared by your instructor.',
        });
      }
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

      return jsonResponse(200, {
        resumed: true,
        attemptId: activeAttempt.id,
        attemptNumber,
        startedAtMs,
        expiresAtMs,
        savedAnswers: (activeAttempt.data.answers as Record<string, string>) || {},
        attemptPermit: permit,
      });
    }

    const maxAttempts = Math.max(1, Number(examDoc.maxAttempts || 1));
    const finishedCount = existingAttempts.filter((att) => att.data.status !== 'in_progress').length;
    if (finishedCount >= maxAttempts) {
      return jsonResponse(403, {
        error: `You have already used all ${maxAttempts} permitted attempt${maxAttempts > 1 ? 's' : ''} for this examination.`,
      });
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

    return jsonResponse(200, {
      resumed: false,
      attemptId,
      attemptNumber,
      startedAtMs,
      expiresAtMs,
      savedAnswers: {},
      attemptPermit: permit,
    });
  }

  // 6. Server-Side Automatic Marking & Cryptographic Receipt Generation
  const submitMatch = /^\/api\/exams\/([a-zA-Z0-9_-]{1,128})\/submit$/.exec(pathname);
  if (method === 'POST' && submitMatch) {
    const idToken = extractBearerToken(req.headers);
    const student = idToken ? await verifyFirebaseIdToken(idToken) : null;
    if (!student || !student.emailVerified) {
      return jsonResponse(401, { error: 'Student authentication required to submit answers.' });
    }

    const examId = submitMatch[1];
    const body = parseJsonBody(req);
    const permitToken = String(body.attemptPermit || '').trim();
    const permit = verifyAttemptPermit(permitToken);

    if (!permit || permit.examId !== examId || permit.userId !== student.uid) {
      return jsonResponse(403, { error: 'Invalid or expired examination session permit.' });
    }

    const now = Date.now();
    // Allow 60 seconds network transit grace for auto-submission when mobile countdown hits 00:00
    if (now > permit.expiresAtMs + 60_000) {
      return jsonResponse(403, {
        error: 'The allowed time limit for this examination attempt has already expired.',
      });
    }

    const ledger = readRankLedger();
    if (ledger.submissions[permit.attemptId]) {
      return jsonResponse(409, { error: 'This examination attempt has already been submitted.' });
    }

    // Check Firestore attempt status too so duplicate submissions across serverless containers are prevented
    const existingAttemptDoc = await fetchFirestoreDocument(
      'examAttempts',
      permit.attemptId,
      student.idToken
    );
    if (existingAttemptDoc && existingAttemptDoc.status && existingAttemptDoc.status !== 'in_progress') {
      return jsonResponse(409, { error: 'This examination attempt has already been submitted.' });
    }

    const [examDoc, configDoc] = await Promise.all([
      fetchFirestoreDocument('exams', examId, student.idToken),
      fetchFirestoreDocument('examConfigs', examId, student.idToken),
    ]);

    if (!examDoc || !configDoc) {
      return jsonResponse(404, {
        error: 'Examination configuration could not be loaded for grading.',
      });
    }

    const answerKeyJson = unsealString(String(configDoc.sealedAnswerKey || ''));
    if (!answerKeyJson) {
      return jsonResponse(500, {
        error:
          'Unable to unseal examination answer key. If you changed EXAM_HMAC_SECRET recently, re-save the examination in the Admin Exam Builder to re-seal its key.',
      });
    }

    const fullQuestions = JSON.parse(answerKeyJson) as ExamQuestionFull[];
    const incomingAnswers =
      body.answers && typeof body.answers === 'object'
        ? (body.answers as Record<string, string>)
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
    const studentName = String(body.studentName || student.displayName || 'Student').slice(0, 100);

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

    return jsonResponse(200, {
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
  }

  // 7. Admin Manual Grading / Mark Adjustment Signer & Rank Ledger Sync
  if (method === 'POST' && pathname === '/api/admin/results/sign') {
    const adminUser = await verifyTrustedAdminRequest(req.headers);
    if (!adminUser) {
      return jsonResponse(403, {
        error: 'Only verified administrators may grade or adjust examination marks.',
      });
    }

    const body = parseJsonBody(req);
    const attemptId = String(body.attemptId || '').trim();
    const examId = String(body.examId || '').trim();
    const userId = String(body.userId || '').trim();
    const status = String(body.status || 'graded');
    const marksObtained = Math.max(0, Math.floor(Number(body.marksObtained || 0)));
    const totalMarks = Math.max(1, Math.floor(Number(body.totalMarks || 1)));
    const percentage = Math.min(100, Math.max(0, Math.round((marksObtained / totalMarks) * 100)));
    const passed = Boolean(body.passed);

    const serverReceipt = computeServerReceipt({
      attemptId,
      examId,
      userId,
      status,
      marksObtained,
      totalMarks,
    });

    const ledger = readRankLedger();
    const examTitle = String(
      body.examTitle || ledger.exams[examId]?.examTitle || 'Online Examination'
    );
    const subject = String(body.subject || ledger.exams[examId]?.subject || 'Technology');
    const studentName = String(body.studentName || 'Student').slice(0, 100);
    const submittedAtMs = Number(body.submittedAtMs || Date.now());

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

    return jsonResponse(200, {
      serverReceipt,
      percentage,
    });
  }

  // 8. Admin Rank Board / Result Publication Visibility Sync
  if (method === 'POST' && pathname === '/api/admin/rank-board/visibility') {
    const adminUser = await verifyTrustedAdminRequest(req.headers);
    if (!adminUser) {
      return jsonResponse(403, {
        error: 'Only verified administrators may update rank board visibility.',
      });
    }

    const body = parseJsonBody(req);
    const examId = String(body.examId || '').trim();
    if (!examId) {
      return jsonResponse(400, { error: 'examId is required.' });
    }

    const ledger = readRankLedger();
    const prev = ledger.exams[examId];
    ledger.exams[examId] = {
      examId,
      examTitle: String(body.examTitle || prev?.examTitle || 'Online Examination'),
      subject: String(body.subject || prev?.subject || 'Technology'),
      resultsPublished:
        body.resultsPublished !== undefined
          ? Boolean(body.resultsPublished)
          : Boolean(prev?.resultsPublished),
      rankBoardPublished:
        body.rankBoardPublished !== undefined
          ? Boolean(body.rankBoardPublished)
          : Boolean(prev?.rankBoardPublished),
      anonymizeRankBoard:
        body.anonymizeRankBoard !== undefined
          ? Boolean(body.anonymizeRankBoard)
          : Boolean(prev?.anonymizeRankBoard),
      updatedAtMs: Date.now(),
    };
    writeRankLedger(ledger);

    return jsonResponse(200, { ok: true, visibility: ledger.exams[examId] });
  }

  // 9. Public Sanitized Rank Board Endpoint
  if (method === 'GET' && pathname === '/api/rank-board') {
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

    return jsonResponse(200, {
      entries,
      totalCompletedAttempts: Object.keys(ledger.submissions).length,
      totalPublishedResults: entries.length,
    });
  }

  // 10. Validated Notice Image Upload & Delivery
  if (method === 'POST' && pathname === '/api/images/upload') {
    const adminUser = await verifyTrustedAdminRequest(req.headers);
    if (!adminUser) {
      return jsonResponse(403, { error: 'Only verified administrators may upload notice images.' });
    }

    if (!LOCAL_DISK_WRITABLE) {
      return jsonResponse(501, {
        error:
          'Local disk image storage is disabled on serverless hosting. Please upload via Firebase Cloud Storage or paste an HTTPS image link.',
      });
    }

    const bodyBuffer = req.rawBody || Buffer.alloc(0);
    if (bodyBuffer.length === 0 || bodyBuffer.length > MAX_IMAGE_BYTES) {
      return jsonResponse(400, { error: 'Notice image must be non-empty and under 5 MB.' });
    }

    const sig = detectImageSignature(bodyBuffer);
    if (!sig) {
      return jsonResponse(400, {
        error: 'Unsupported image format. Please upload a valid PNG, JPEG, or WebP image.',
      });
    }

    const safeName = `notice_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${sig.ext}`;
    fs.writeFileSync(path.join(IMAGE_DIR, safeName), bodyBuffer);

    return jsonResponse(201, {
      fileName: safeName,
      imageUrl: `/api/images/${encodeURIComponent(safeName)}`,
    });
  }

  const imageGetMatch = /^\/api\/images\/([^/]+)$/.exec(pathname);
  if (method === 'GET' && imageGetMatch) {
    const fileName = path.basename(decodeURIComponent(imageGetMatch[1]));
    const match = /^[a-zA-Z0-9_-]+\.(png|jpg|webp)$/i.exec(fileName);
    if (!match) {
      return jsonResponse(400, { error: 'Invalid image identifier.' });
    }

    const fullPath = path.join(IMAGE_DIR, fileName);
    if (!fs.existsSync(fullPath)) {
      return jsonResponse(404, { error: 'Requested image was not found.' });
    }

    const ext = match[1].toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'image/webp';
    return {
      status: 200,
      headers: {
        'Content-Type': mime,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=86400',
      },
      body: fs.readFileSync(fullPath),
      isBinary: true,
    };
  }

  // 11. Validated Server-Side PDF Binary Upload Fallback (Local Node Dev Server Only)
  if (method === 'POST' && pathname === '/api/files/upload') {
    const adminUser = await verifyTrustedAdminRequest(req.headers);
    if (!adminUser) {
      return jsonResponse(403, { error: 'Only verified administrators may upload PDF documents.' });
    }

    if (!LOCAL_DISK_WRITABLE) {
      return jsonResponse(501, {
        error:
          'Serverless environment detected: local disk uploads are disabled on Netlify. Sign in with your Google Admin account to upload directly to Firebase Cloud Storage, or attach a Google Drive link.',
      });
    }

    const bodyBuffer = req.rawBody || Buffer.alloc(0);
    if (bodyBuffer.length === 0 || bodyBuffer.length > MAX_PDF_BYTES) {
      return jsonResponse(400, {
        error: 'PDF file must be non-empty and must not exceed 25 MB.',
      });
    }

    if (!hasPdfMagicHeader(bodyBuffer)) {
      return jsonResponse(400, {
        error:
          'Invalid file signature. Only genuine PDF binary documents (%PDF- header) are accepted.',
      });
    }

    const rawName = getHeader(req.headers, 'x-file-name') || 'document.pdf';
    const safeName = sanitizePdfFileName(rawName);
    const targetPath = path.join(UPLOAD_DIR, safeName);
    fs.writeFileSync(targetPath, bodyBuffer);

    return jsonResponse(201, {
      fileName: safeName,
      fileSize: bodyBuffer.length,
      pdfUrl: `/api/files/${encodeURIComponent(safeName)}`,
      storagePath: `server:${safeName}`,
    });
  }

  // 12 & 13. Secure PDF Delivery & Deletion Endpoints
  const fileMatch = /^\/api\/files\/([^/]+)$/.exec(pathname);
  if (fileMatch && method === 'GET') {
    const fileName = path.basename(decodeURIComponent(fileMatch[1]));
    if (!/^[a-zA-Z0-9_\-.]+\.pdf$/i.test(fileName)) {
      return jsonResponse(400, { error: 'Invalid PDF document identifier.' });
    }

    const fullPath = path.join(UPLOAD_DIR, fileName);
    if (!fs.existsSync(fullPath)) {
      return jsonResponse(404, { error: 'Requested PDF document was not found.' });
    }

    const download = req.query.download === '1';
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${fileName.replace(
          /"/g,
          ''
        )}"`,
      },
      body: fs.readFileSync(fullPath),
      isBinary: true,
    };
  }

  if (fileMatch && method === 'DELETE') {
    const adminUser = await verifyTrustedAdminRequest(req.headers);
    if (!adminUser) {
      return jsonResponse(403, {
        error: 'Only verified administrators may delete stored PDF files.',
      });
    }

    const fileName = path.basename(decodeURIComponent(fileMatch[1]));
    if (!/^[a-zA-Z0-9_\-.]+\.pdf$/i.test(fileName)) {
      return jsonResponse(400, { error: 'Invalid PDF filename.' });
    }

    if (LOCAL_DISK_WRITABLE) {
      const fullPath = path.join(UPLOAD_DIR, fileName);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
    return jsonResponse(200, { deleted: true });
  }

  // 14. Stateless Standards-Compliant Curriculum Reference PDF Generator (Works on Netlify & Express)
  const curriculumMatch = /^\/api\/curriculum-pdf\/([^/]+)$/.exec(pathname);
  if (method === 'GET' && curriculumMatch) {
    const rawSlug = decodeURIComponent(curriculumMatch[1]);
    const slug = String(rawSlug || 'study-guide').replace(/\.pdf$/i, '');
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

    return {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=3600',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeDownloadName}"`,
      },
      body: pdfBuffer,
      isBinary: true,
    };
  }

  return jsonResponse(404, {
    error: `API endpoint not found: ${method} ${pathname}`,
  });
}
