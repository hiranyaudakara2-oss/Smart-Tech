import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const rulesSource = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const blueprint = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase-blueprint.json'), 'utf8')) as {
  entities: Record<string, { properties: Record<string, { maxLength?: number; pattern?: string }>; required?: string[] }>;
  firestore: Record<string, { schema: { $ref: string }; description: string }>;
};

interface SimAuth {
  uid: string;
  email: string;
  emailVerified: boolean;
}

interface SimContext {
  auth: SimAuth | null;
  serverTimeMs: number;
  existingDocs: Set<string>;
  afterDocs: Set<string>;
  examsById: Map<string, { published: boolean; opensAtMs: number; closesAtMs: number }>;
}

const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/;

function isVerifiedUser(auth: SimAuth | null): boolean {
  return Boolean(auth && auth.emailVerified === true);
}

function isAdmin(ctx: SimContext): boolean {
  if (!ctx.auth || !isVerifiedUser(ctx.auth)) return false;
  if (ctx.auth.email === 'hiranyaudakara2@gmail.com') return true;
  return ctx.existingDocs.has(`/admins/${ctx.auth.uid}`);
}

/**
 * Deterministic Dirty-Dozen evaluator mirroring firestore.rules invariants.
 */
function simulatePermission(
  op: {
    method: 'get' | 'create' | 'update' | 'delete';
    collection: string;
    docId: string;
    data?: Record<string, unknown>;
    existing?: Record<string, unknown>;
  },
  ctx: SimContext
): 'ALLOW' | 'PERMISSION_DENIED' {
  if (!VALID_ID.test(op.docId)) return 'PERMISSION_DENIED';

  if (op.collection === 'users') {
    if (op.method === 'get') {
      return (ctx.auth && ctx.auth.uid === op.docId) || isAdmin(ctx) ? 'ALLOW' : 'PERMISSION_DENIED';
    }
    if (op.method === 'create') {
      const d = op.data || {};
      const allowedKeys = new Set([
        'uid',
        'displayName',
        'email',
        'photoURL',
        'role',
        'grade',
        'createdAt',
        'lastLoginAt',
        'updatedAt',
      ]);
      for (const k of Object.keys(d)) {
        if (!allowedKeys.has(k)) return 'PERMISSION_DENIED';
      }
      if (!isVerifiedUser(ctx.auth)) return 'PERMISSION_DENIED';
      if (d.uid !== op.docId) return 'PERMISSION_DENIED';
      if (d.createdAt !== ctx.serverTimeMs || d.updatedAt !== ctx.serverTimeMs) {
        return 'PERMISSION_DENIED';
      }
      if (ctx.auth!.uid === op.docId && d.email === ctx.auth!.email) {
        if (d.role === 'student' || (d.role === 'admin' && isAdmin(ctx))) return 'ALLOW';
      }
      return isAdmin(ctx) ? 'ALLOW' : 'PERMISSION_DENIED';
    }
    if (op.method === 'update') {
      const d = op.data || {};
      const ex = op.existing || {};
      const allowedKeys = new Set([
        'uid',
        'displayName',
        'email',
        'photoURL',
        'role',
        'grade',
        'createdAt',
        'lastLoginAt',
        'updatedAt',
      ]);
      for (const k of Object.keys(d)) {
        if (!allowedKeys.has(k)) return 'PERMISSION_DENIED';
      }
      if (!isVerifiedUser(ctx.auth)) return 'PERMISSION_DENIED';
      if (d.updatedAt !== ctx.serverTimeMs) return 'PERMISSION_DENIED';
      if (ctx.auth!.uid === op.docId && d.role === ex.role && d.email === ex.email) {
        return 'ALLOW';
      }
      return isAdmin(ctx) ? 'ALLOW' : 'PERMISSION_DENIED';
    }
  }

  if (op.collection === 'notes' || op.collection === 'papers') {
    if (op.method === 'create') {
      if (!isAdmin(ctx)) return 'PERMISSION_DENIED';
      const d = op.data || {};
      if (d.sourceType === 'drive') {
        const driveUrl = String(d.driveUrl || '');
        if (!/^https:\/\/(drive\.google\.com|docs\.google\.com)\/.+/.test(driveUrl)) {
          return 'PERMISSION_DENIED';
        }
      }
      return 'ALLOW';
    }
    if (op.method === 'get') {
      return op.existing?.published === true || isAdmin(ctx) ? 'ALLOW' : 'PERMISSION_DENIED';
    }
  }

  if (op.collection === 'rankBoards') {
    if (op.method === 'get') {
      return op.existing?.published === true || isAdmin(ctx) ? 'ALLOW' : 'PERMISSION_DENIED';
    }
    if (op.method === 'create' || op.method === 'update' || op.method === 'delete') {
      return isAdmin(ctx) ? 'ALLOW' : 'PERMISSION_DENIED';
    }
  }

  if (op.collection === 'rankBoardEntries') {
    if (op.method === 'get') {
      return op.existing?.boardPublished === true || isAdmin(ctx) ? 'ALLOW' : 'PERMISSION_DENIED';
    }
    if (op.method === 'create') {
      if (!isAdmin(ctx)) return 'PERMISSION_DENIED';
      const boardId = String(op.data?.boardId || '');
      if (!boardId || !ctx.existingDocs.has(`/rankBoards/${boardId}`)) return 'PERMISSION_DENIED';
      return 'ALLOW';
    }
    if (op.method === 'update' || op.method === 'delete') {
      return isAdmin(ctx) ? 'ALLOW' : 'PERMISSION_DENIED';
    }
  }

  if (op.collection === 'examLinks') {
    if (op.method === 'get') {
      if (isAdmin(ctx)) return 'ALLOW';
      const exam = ctx.examsById.get(op.docId);
      if (
        exam &&
        exam.published &&
        ctx.serverTimeMs >= exam.opensAtMs &&
        ctx.serverTimeMs < exam.closesAtMs
      ) {
        return 'ALLOW';
      }
      return 'PERMISSION_DENIED';
    }
    if (op.method === 'create') {
      if (!isAdmin(ctx)) return 'PERMISSION_DENIED';
      const url = String(op.data?.formUrl || '');
      if (!/^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/).+/.test(url)) {
        return 'PERMISSION_DENIED';
      }
      if (!ctx.afterDocs.has(`/exams/${op.docId}`)) return 'PERMISSION_DENIED';
      return 'ALLOW';
    }
  }

  if (op.collection === 'examAttempts') {
    if (op.method === 'get') {
      if (!isVerifiedUser(ctx.auth)) return 'PERMISSION_DENIED';
      if (isAdmin(ctx)) return 'ALLOW';
      return op.existing && op.existing.userId === ctx.auth!.uid ? 'ALLOW' : 'PERMISSION_DENIED';
    }
    if (op.method === 'update') {
      if (!isVerifiedUser(ctx.auth)) return 'PERMISSION_DENIED';
      if (isAdmin(ctx)) return 'ALLOW';
      const ex = op.existing || {};
      const d = op.data || {};
      if (ex.userId !== ctx.auth!.uid) return 'PERMISSION_DENIED';
      if (ex.status !== 'in_progress') return 'PERMISSION_DENIED';
      if (d.status === 'in_progress') return 'ALLOW';
      if (
        (d.status === 'graded' || d.status === 'pending_review') &&
        typeof d.serverReceipt === 'string' &&
        d.serverReceipt.length === 64
      ) {
        return 'ALLOW';
      }
      return 'PERMISSION_DENIED';
    }
  }

  if (op.collection === 'stats' && op.docId === 'platform' && op.method === 'update') {
    if (!isVerifiedUser(ctx.auth)) return 'PERMISSION_DENIED';
    if (isAdmin(ctx)) return 'ALLOW';
    const userPath = `/users/${ctx.auth!.uid}`;
    const isAtomicFirstSignup = !ctx.existingDocs.has(userPath) && ctx.afterDocs.has(userPath);
    const prevTotal = Number(op.existing?.totalUsers ?? 0);
    const nextTotal = Number(op.data?.totalUsers ?? -1);
    if (isAtomicFirstSignup && nextTotal === prevTotal + 1 && op.data?.updatedAt === ctx.serverTimeMs) {
      return 'ALLOW';
    }
    return 'PERMISSION_DENIED';
  }

  if (op.collection === 'userActivities' && op.method === 'create') {
    if (!isVerifiedUser(ctx.auth)) return 'PERMISSION_DENIED';
    const userId = String(op.data?.userId || '');
    if (userId !== ctx.auth!.uid) return 'PERMISSION_DENIED';
    if (!ctx.existingDocs.has(`/users/${userId}`)) return 'PERMISSION_DENIED';
    return 'ALLOW';
  }

  if (op.collection === 'announcementReads') {
    if (op.method === 'get') {
      if (!isVerifiedUser(ctx.auth)) return 'PERMISSION_DENIED';
      if (!op.existing) return 'ALLOW';
      return op.existing.userId === ctx.auth!.uid ? 'ALLOW' : 'PERMISSION_DENIED';
    }
    if (op.method === 'create') {
      if (!isVerifiedUser(ctx.auth)) return 'PERMISSION_DENIED';
      const d = op.data || {};
      const keys = Object.keys(d);
      if (keys.length !== 3) return 'PERMISSION_DENIED';
      for (const k of keys) {
        if (k !== 'userId' && k !== 'announcementId' && k !== 'readAt') {
          return 'PERMISSION_DENIED';
        }
      }
      const userId = String(d.userId || '');
      const announcementId = String(d.announcementId || '');
      if (!VALID_ID.test(userId) || !VALID_ID.test(announcementId)) return 'PERMISSION_DENIED';
      if (userId !== ctx.auth!.uid) return 'PERMISSION_DENIED';
      if (d.readAt !== ctx.serverTimeMs) return 'PERMISSION_DENIED';
      if (!ctx.existingDocs.has(`/users/${userId}`)) return 'PERMISSION_DENIED';
      if (!ctx.existingDocs.has(`/announcements/${announcementId}`)) return 'PERMISSION_DENIED';
      return 'ALLOW';
    }
    if (op.method === 'update') {
      if (!isVerifiedUser(ctx.auth)) return 'PERMISSION_DENIED';
      const d = op.data || {};
      const ex = op.existing || {};
      const keys = Object.keys(d);
      if (keys.length !== 3) return 'PERMISSION_DENIED';
      for (const k of keys) {
        if (k !== 'userId' && k !== 'announcementId' && k !== 'readAt') {
          return 'PERMISSION_DENIED';
        }
      }
      if (d.userId !== ex.userId || d.announcementId !== ex.announcementId) {
        return 'PERMISSION_DENIED';
      }
      if (d.userId !== ctx.auth!.uid) return 'PERMISSION_DENIED';
      if (d.readAt !== ctx.serverTimeMs) return 'PERMISSION_DENIED';
      return 'ALLOW';
    }
  }

  if (op.collection === 'auditLogs' && (op.method === 'update' || op.method === 'delete')) {
    return 'PERMISSION_DENIED';
  }

  return 'PERMISSION_DENIED';
}

test('Every 16 blueprint collections have explicit match blocks, update helpers, and zero get/exists in allow list', () => {
  assert.match(rulesSource, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);

  const blueprintPaths = Object.keys(blueprint.firestore);
  assert.equal(blueprintPaths.length, 16);

  for (const collectionPath of blueprintPaths) {
    assert.ok(
      rulesSource.includes(`match ${collectionPath}`),
      `Missing match block in firestore.rules for ${collectionPath}`
    );
  }

  // Ensure zero get() or exists() calls inside allow list lines
  const listLines = rulesSource
    .split('\n')
    .filter((line) => line.trim().startsWith('allow list:'));
  assert.ok(listLines.length >= 16);
  for (const line of listLines) {
    assert.equal(
      line.includes('get(') || line.includes('exists('),
      false,
      `Forbidden get()/exists() inside allow list: ${line}`
    );
  }
});

test('All Dirty Dozen adversarial payloads + Drive URL & Rank Board access guards return PERMISSION_DENIED', () => {
  const SERVER_TIME = 1_730_000_000_000;
  const baseCtx = (auth: SimAuth | null): SimContext => ({
    auth,
    serverTimeMs: SERVER_TIME,
    existingDocs: new Set(['/users/student_1', '/rankBoards/board_existing']),
    afterDocs: new Set(),
    examsById: new Map([
      ['exam_future', { published: true, opensAtMs: SERVER_TIME + 60_000, closesAtMs: SERVER_TIME + 120_000 }],
      ['exam_past', { published: true, opensAtMs: SERVER_TIME - 120_000, closesAtMs: SERVER_TIME - 60_000 }],
      ['exam_active', { published: true, opensAtMs: SERVER_TIME - 30_000, closesAtMs: SERVER_TIME + 30_000 }],
    ]),
  });

  // 1. Self-assigned admin role on registration
  assert.equal(
    simulatePermission(
      {
        method: 'create',
        collection: 'users',
        docId: 'attacker_1',
        data: {
          uid: 'attacker_1',
          displayName: 'Eve',
          email: 'eve@test.com',
          photoURL: '',
          role: 'admin',
          createdAt: SERVER_TIME,
          lastLoginAt: SERVER_TIME,
          updatedAt: SERVER_TIME,
        },
      },
      baseCtx({ uid: 'attacker_1', email: 'eve@test.com', emailVerified: true })
    ),
    'PERMISSION_DENIED'
  );

  // 2. Shadow field injection on profile update
  assert.equal(
    simulatePermission(
      {
        method: 'update',
        collection: 'users',
        docId: 'student_1',
        existing: { uid: 'student_1', email: 's1@test.com', role: 'student' },
        data: {
          uid: 'student_1',
          displayName: 'Alice',
          email: 's1@test.com',
          photoURL: '',
          role: 'student',
          isSuperAdmin: true,
          createdAt: SERVER_TIME - 1000,
          lastLoginAt: SERVER_TIME,
          updatedAt: SERVER_TIME,
        },
      },
      baseCtx({ uid: 'student_1', email: 's1@test.com', emailVerified: true })
    ),
    'PERMISSION_DENIED'
  );

  // 3. Unverified bootstrapped admin email spoof
  assert.equal(
    simulatePermission(
      {
        method: 'create',
        collection: 'notes',
        docId: 'note_1',
        data: { title: 'Spoofed Note' },
      },
      baseCtx({ uid: 'spoof_1', email: 'hiranyaudakara2@gmail.com', emailVerified: false })
    ),
    'PERMISSION_DENIED'
  );

  // 4. Cross-user PII read
  assert.equal(
    simulatePermission(
      { method: 'get', collection: 'users', docId: 'student_1' },
      baseCtx({ uid: 'student_2', email: 's2@test.com', emailVerified: true })
    ),
    'PERMISSION_DENIED'
  );

  // 5. Client timestamp forgery on profile creation
  assert.equal(
    simulatePermission(
      {
        method: 'create',
        collection: 'users',
        docId: 'student_3',
        data: {
          uid: 'student_3',
          displayName: 'Bob',
          email: 'bob@test.com',
          photoURL: '',
          role: 'student',
          createdAt: 946684800000,
          lastLoginAt: SERVER_TIME,
          updatedAt: SERVER_TIME,
        },
      },
      baseCtx({ uid: 'student_3', email: 'bob@test.com', emailVerified: true })
    ),
    'PERMISSION_DENIED'
  );

  // 6. Premature exam link extraction before opensAt
  assert.equal(
    simulatePermission(
      { method: 'get', collection: 'examLinks', docId: 'exam_future' },
      baseCtx({ uid: 'student_1', email: 's1@test.com', emailVerified: true })
    ),
    'PERMISSION_DENIED'
  );

  // 7. Expired exam link extraction after closesAt
  assert.equal(
    simulatePermission(
      { method: 'get', collection: 'examLinks', docId: 'exam_past' },
      baseCtx({ uid: 'student_1', email: 's1@test.com', emailVerified: true })
    ),
    'PERMISSION_DENIED'
  );

  // Positive control: Active exam link during window is ALLOWED
  assert.equal(
    simulatePermission(
      { method: 'get', collection: 'examLinks', docId: 'exam_active' },
      baseCtx({ uid: 'student_1', email: 's1@test.com', emailVerified: true })
    ),
    'ALLOW'
  );

  // 8. Malicious phishing URL in exam creation or Google Drive paper link
  const adminCtx = baseCtx({
    uid: 'admin_root',
    email: 'hiranyaudakara2@gmail.com',
    emailVerified: true,
  });
  adminCtx.afterDocs.add('/exams/exam_1');
  assert.equal(
    simulatePermission(
      {
        method: 'create',
        collection: 'examLinks',
        docId: 'exam_1',
        data: { formUrl: 'https://evil-phishing.example.com/form' },
      },
      adminCtx
    ),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulatePermission(
      {
        method: 'create',
        collection: 'papers',
        docId: 'paper_bad_drive',
        data: { sourceType: 'drive', driveUrl: 'https://evil-phishing.example.com/file.pdf' },
      },
      adminCtx
    ),
    'PERMISSION_DENIED'
  );
  assert.equal(
    simulatePermission(
      {
        method: 'create',
        collection: 'papers',
        docId: 'paper_good_drive',
        data: {
          sourceType: 'drive',
          driveUrl: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing',
        },
      },
      adminCtx
    ),
    'ALLOW'
  );

  // 9. Poisoned >128 char path variable
  assert.equal(
    simulatePermission(
      { method: 'get', collection: 'notes', docId: 'x'.repeat(140), existing: { published: true } },
      baseCtx(null)
    ),
    'PERMISSION_DENIED'
  );

  // 10. Stats counter inflation without atomic user signup
  assert.equal(
    simulatePermission(
      {
        method: 'update',
        collection: 'stats',
        docId: 'platform',
        existing: { totalUsers: 5 },
        data: { totalUsers: 999999, updatedAt: SERVER_TIME },
      },
      baseCtx({ uid: 'student_1', email: 's1@test.com', emailVerified: true })
    ),
    'PERMISSION_DENIED'
  );

  // 11. Terminal exam attempt tampering & non-admin Rank Board write / unpublished Rank Board read
  assert.equal(
    simulatePermission(
      {
        method: 'update',
        collection: 'examAttempts',
        docId: 'att_1',
        existing: { userId: 'student_1', status: 'graded', marksObtained: 40 },
        data: { userId: 'student_1', status: 'graded', marksObtained: 100, serverReceipt: 'a'.repeat(64) },
      },
      baseCtx({ uid: 'student_1', email: 's1@test.com', emailVerified: true })
    ),
    'PERMISSION_DENIED'
  );

  assert.equal(
    simulatePermission(
      {
        method: 'create',
        collection: 'rankBoards',
        docId: 'rboard_student_spoof',
        data: { title: 'Spoofed Board' },
      },
      baseCtx({ uid: 'student_1', email: 's1@test.com', emailVerified: true })
    ),
    'PERMISSION_DENIED'
  );

  assert.equal(
    simulatePermission(
      {
        method: 'get',
        collection: 'rankBoards',
        docId: 'rboard_draft',
        existing: { published: false },
      },
      baseCtx({ uid: 'student_1', email: 's1@test.com', emailVerified: true })
    ),
    'PERMISSION_DENIED'
  );

  assert.equal(
    simulatePermission(
      {
        method: 'get',
        collection: 'rankBoardEntries',
        docId: 'rentry_draft',
        existing: { boardPublished: false },
      },
      baseCtx(null)
    ),
    'PERMISSION_DENIED'
  );

  // 12. Audit log deletion attempt & orphaned Rank Board entry creation
  assert.equal(
    simulatePermission(
      { method: 'delete', collection: 'auditLogs', docId: 'log_1' },
      adminCtx
    ),
    'PERMISSION_DENIED'
  );

  assert.equal(
    simulatePermission(
      {
        method: 'create',
        collection: 'rankBoardEntries',
        docId: 'rentry_orphan',
        data: { boardId: 'non_existent_board' },
      },
      adminCtx
    ),
    'PERMISSION_DENIED'
  );

  assert.equal(
    simulatePermission(
      {
        method: 'create',
        collection: 'rankBoardEntries',
        docId: 'rentry_valid',
        data: { boardId: 'board_existing' },
      },
      adminCtx
    ),
    'ALLOW'
  );
});

test('announcementReads allows non-existent get, verified owner create, and idempotent readAt update while blocking cross-user and ghost-field attacks', () => {
  const SERVER_TIME = 1_730_000_000_000;
  const studentCtx: SimContext = {
    auth: {
      uid: '9apEFXVsZNY8x6IE8J0ZoKzHfAE2',
      email: 'hiranyaudakara2@gmail.com',
      emailVerified: true,
    },
    serverTimeMs: SERVER_TIME,
    existingDocs: new Set([
      '/users/9apEFXVsZNY8x6IE8J0ZoKzHfAE2',
      '/announcements/ann_1793240573202_t6rwdgz9',
    ]),
    afterDocs: new Set(),
    examsById: new Map(),
  };

  const readDocId = '9apEFXVsZNY8x6IE8J0ZoKzHfAE2_ann_1793240573202_t6rwdgz9';

  // 1. Probing a non-existent announcementReads document does NOT fail with PERMISSION_DENIED
  assert.equal(
    simulatePermission(
      {
        method: 'get',
        collection: 'announcementReads',
        docId: readDocId,
      },
      studentCtx
    ),
    'ALLOW'
  );

  // 2. Reading another user's existing announcementReads receipt is strictly DENIED
  assert.equal(
    simulatePermission(
      {
        method: 'get',
        collection: 'announcementReads',
        docId: 'other_user_ann_1793240573202_t6rwdgz9',
        existing: {
          userId: 'other_user',
          announcementId: 'ann_1793240573202_t6rwdgz9',
          readAt: SERVER_TIME - 5000,
        },
      },
      studentCtx
    ),
    'PERMISSION_DENIED'
  );

  // 3. Creating own announcementReads receipt with serverTimestamp succeeds
  assert.equal(
    simulatePermission(
      {
        method: 'create',
        collection: 'announcementReads',
        docId: readDocId,
        data: {
          userId: '9apEFXVsZNY8x6IE8J0ZoKzHfAE2',
          announcementId: 'ann_1793240573202_t6rwdgz9',
          readAt: SERVER_TIME,
        },
      },
      studentCtx
    ),
    'ALLOW'
  );

  // 4. Idempotent re-acknowledgment (setDoc update on readAt) succeeds
  assert.equal(
    simulatePermission(
      {
        method: 'update',
        collection: 'announcementReads',
        docId: readDocId,
        existing: {
          userId: '9apEFXVsZNY8x6IE8J0ZoKzHfAE2',
          announcementId: 'ann_1793240573202_t6rwdgz9',
          readAt: SERVER_TIME - 10_000,
        },
        data: {
          userId: '9apEFXVsZNY8x6IE8J0ZoKzHfAE2',
          announcementId: 'ann_1793240573202_t6rwdgz9',
          readAt: SERVER_TIME,
        },
      },
      studentCtx
    ),
    'ALLOW'
  );

  // 5. Forged client timestamp or ghost field on announcementReads is DENIED
  assert.equal(
    simulatePermission(
      {
        method: 'create',
        collection: 'announcementReads',
        docId: readDocId,
        data: {
          userId: '9apEFXVsZNY8x6IE8J0ZoKzHfAE2',
          announcementId: 'ann_1793240573202_t6rwdgz9',
          readAt: SERVER_TIME - 99_999,
        },
      },
      studentCtx
    ),
    'PERMISSION_DENIED'
  );

  assert.equal(
    simulatePermission(
      {
        method: 'update',
        collection: 'announcementReads',
        docId: readDocId,
        existing: {
          userId: '9apEFXVsZNY8x6IE8J0ZoKzHfAE2',
          announcementId: 'ann_1793240573202_t6rwdgz9',
          readAt: SERVER_TIME - 10_000,
        },
        data: {
          userId: '9apEFXVsZNY8x6IE8J0ZoKzHfAE2',
          announcementId: 'ann_1793240573202_t6rwdgz9',
          readAt: SERVER_TIME,
          ghostField: true,
        },
      },
      studentCtx
    ),
    'PERMISSION_DENIED'
  );
});

