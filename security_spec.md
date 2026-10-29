# Smart Tech Platform — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants (All 17 Blueprint Collections)

1. **Default-Deny Catch-All**: `match /{document=**} { allow read, write: if false; }` is the first block in `firestore.rules`.
2. **Identity & Privilege Escalation Guard (`/users`, `/admins`)**:
   - Standard write operations mandate `request.auth.token.email_verified == true`.
   - Bootstrapped administrator (`hiranyaudakara2@gmail.com`) requires `email_verified == true`; co-admins are verified via `exists(/databases/$(database)/documents/admins/$(request.auth.uid))`.
   - Students can never set `role: 'admin'` during `/users/{userId}` registration or profile update.
3. **PII Isolation (`/users`, `/examAttempts`, `/rankEntries`, `/rankBoardEntries`)**:
   - `/users/{userId}` and `/examAttempts/{attemptId}` contain `email` / private answers and are strictly isolated to `isOwner` or `isAdmin`.
   - `/rankEntries/{entryId}` and `/rankBoardEntries/{entryId}` are sanitized (contain zero email or raw student UID) so published competition rankings expose no PII.
4. **Google Drive Sharing Link & PDF Resource Validation (`/notes`, `/papers`)**:
   - Only verified administrators (`isAdmin()`) can create, update, or delete `/notes/{noteId}` and `/papers/{paperId}`.
   - When `sourceType == 'drive'`, `driveUrl` is strictly validated against `^https://(drive\.google\.com|docs\.google\.com)/.+` to prevent non-HTTPS or phishing domain injection.
5. **Dynamic & Manual Rank Boards (`/rankBoards`, `/rankBoardEntries`)**:
   - Only verified administrators (`isAdmin()`) can create, update, reorder, publish/unpublish, or delete `/rankBoards/{boardId}` and `/rankBoardEntries/{entryId}`.
   - Normal users and guests can only read (`get`/`list`) `/rankBoards` where `published == true` and `/rankBoardEntries` where `boardPublished == true`.
   - Creating a `/rankBoardEntries/{entryId}` document requires `exists(/databases/$(database)/documents/rankBoards/$(incoming().boardId))` to prevent orphaned rank entries.
6. **Sealed Examination Secrets (`/exams`, `/examLinks`, `/examConfigs`)**:
   - Public `/exams/{examId}` documents store only sanitized question prompts (`['id', 'type', 'prompt', 'options', 'marks']`), never answer keys or 6-digit access codes.
   - `/examConfigs/{examId}` stores AES-256-GCM encrypted `sealedAccessCode` & `sealedAnswerKey` plus keyed `codeMac`, atomically paired with `/exams/{examId}` via `existsAfter()`.
   - `/examLinks/{examId}` enforces server-time-locked Google Forms URL access (`request.time >= opensAt && request.time < closesAt`).
7. **Terminal State Locking (`/examAttempts`)**:
   - Student attempts start with `status: 'in_progress'` and zeroed score fields.
   - Once an attempt transitions from `'in_progress'` to `'graded'` or `'pending_review'`, student updates are permanently locked (`existing().status == 'in_progress'` fails); only verified administrators (`isAdmin()`) may adjust marks or publish results.
8. **Cost-Optimized List Enforcement**:
   - Zero `get()` or `exists()` lookups appear inside any `allow list:` expression across all 17 collections.
9. **Per-User Announcement Read Receipts (`/announcementReads`)**:
   - Existing read receipts are isolated strictly to `existing().userId == request.auth.uid` (non-existent document probes return empty snapshot without leaking cross-user data).
   - Creation and idempotent re-acknowledgment updates require `isVerifiedUser()`, `isValidId(readId)`, `isValidAnnouncementRead(incoming())`, `incoming().userId == request.auth.uid`, strict server timestamp `incoming().readAt == request.time`, and existence of both `/users/$(incoming().userId)` and `/announcements/$(incoming().announcementId)` on creation; updates strictly lock `userId` and `announcementId` as immutable and restrict `affectedKeys().hasOnly(['readAt'])`.
10. **Per-User Educational Note Bookmarks (`/noteBookmarks`)**:
   - Saved "My Library" bookmarks are strictly isolated per authenticated verified user (`existing().userId == request.auth.uid` on `get`, `list`, and `delete`; non-existent document `get` probes return empty snapshots safely).
   - Creation requires `isVerifiedUser()`, `isValidId(bookmarkId)`, `isValidNoteBookmark(incoming())`, `incoming().userId == request.auth.uid`, `incoming().createdAt == request.time`, `exists(/databases/$(database)/documents/users/$(incoming().userId))`, and `exists(/databases/$(database)/documents/notes/$(incoming().noteId))` with published note check (`published == true || isAdmin()`).
   - Idempotent updates wrap in `isValidNoteBookmark(incoming())`, lock `userId` and `noteId` as immutable, enforce `incoming().createdAt == request.time`, and restrict `affectedKeys().hasOnly(['createdAt']) || isAdmin()`.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Self-Assigned Admin Role on Registration**: Authenticated student creates `/users/attacker_1` with `"role": "admin"` -> `PERMISSION_DENIED`.
2. **Shadow Field Injection on Profile Update**: Student updates `/users/student_1` with unauthorized key `"isSuperAdmin": true` -> `PERMISSION_DENIED`.
3. **Unverified Bootstrapped Admin Email Spoof**: Attacker signs in with unverified `"hiranyaudakara2@gmail.com"` (`email_verified: false`) and writes `/notes/note_1` -> `PERMISSION_DENIED`.
4. **Cross-User PII Read**: Student `student_2` attempts `get` on `/users/student_1` -> `PERMISSION_DENIED`.
5. **Client Timestamp Forgery**: Student creates `/users/student_3` with forged `createdAt` != `request.time` -> `PERMISSION_DENIED`.
6. **Premature Exam Link Extraction**: Student reads `/examLinks/exam_future` before `opensAt` -> `PERMISSION_DENIED`.
7. **Expired Exam Link Extraction**: Student reads `/examLinks/exam_past` after `closesAt` -> `PERMISSION_DENIED`.
8. **Phishing URL in Exam Link or Google Drive Paper**: Admin attempts to store `"https://evil-phishing.example.com/form"` in `/examLinks/exam_1` or `"https://evil.example.com/file.pdf"` as `driveUrl` in `/papers/paper_1` -> `PERMISSION_DENIED`.
9. **Path Variable Poisoning (>128 chars)**: Client queries `/notes/<140-char-id>` -> `PERMISSION_DENIED`.
10. **Stats Counter Inflation**: Student updates `/stats/platform` with `"totalUsers": 999999` outside atomic signup -> `PERMISSION_DENIED`.
11. **Terminal Exam Attempt Tampering & Non-Admin Rank Board Mutation**: Student attempts to update `/examAttempts/att_1` after `status == 'graded'` OR create `/rankBoards/rboard_1` or read unpublished `/rankBoards/rboard_draft` -> `PERMISSION_DENIED`.
12. **Audit Log Deletion by Admin & Orphaned Rank Entry Creation**: Admin attempts `delete` on `/auditLogs/log_1` OR creates `/rankBoardEntries/rentry_1` pointing to a non-existent `boardId` -> `PERMISSION_DENIED`.

---

## 3. Automated Test Runner

Verified via `src/security/firestore.rules.test.ts` (`npm test`), confirming:
- Every collection in `firebase-blueprint.json` (all 17 collections) has a matching `match` block in `firestore.rules`.
- Zero `get()` or `exists()` calls exist inside `allow list:` rules.
- All Dirty Dozen payloads and `noteBookmarks` cross-user/ghost-field/timestamp-forgery payloads evaluate to `PERMISSION_DENIED`.
