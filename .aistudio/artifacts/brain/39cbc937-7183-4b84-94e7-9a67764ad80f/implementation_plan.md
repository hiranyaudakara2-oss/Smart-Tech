# Smart Tech — Final Netlify Pre-Launch Hardening & GitHub Deployment Plan

Complete the final serverless media upgrade for Announcement & Popup Notice banner images, add a 1-click live deployment readiness verifier, and streamline the GitHub-to-Netlify + Firebase Console activation workflow so every student and administrator feature works reliably on any device and any web browser immediately after going live.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Your three pre-launch preferences are locked in below. No existing layouts, scroll animations, examination logic, or student/admin records will be removed or broken.

- **Confirmed Decision 1 — Cloud-Ready Announcement Banner Uploads**: Upgrade Announcement and Important Home Popup image uploads so selecting an image file uploads directly to Firebase Cloud Storage (with live progress tracking and local development fallback) and also normalizes shared Google Drive image links into embeddable HTTPS banner URLs—eliminating local disk errors on Netlify's stateless runtime.
- **Confirmed Decision 2 — Cross-Device Admin Write Authority via Google or Firebase Email/Password**: Keep strict cloud security rules intact; opening the Admin Panel on any phone, tablet, or computer supports instant Google Sign-In (`hiranyaudakara2@gmail.com`) as well as Admin Password login paired with one-time Firebase Email/Password synchronization for full database and storage write access.
- **Confirmed Decision 3 — GitHub-Connected Netlify Continuous Deployment**: Optimize the Guided Setup & Diagnostics view specifically for connecting your GitHub repository to Netlify, including copyable domain authorization helpers, optional Netlify environment secrets, and a live 1-click readiness check you can run right after your first deploy.

---

## 1. Overview & Core Concept

- **What It Does**: Closes the remaining local-disk dependency in the Announcement Banner uploader, adds Google Drive image link normalization alongside Firebase Cloud Storage image uploads, and equips the Setup & Diagnostics view with a live interactive Netlify health check plus tailored GitHub-to-Netlify launch steps.
- **Target Audience / Persona**:
  - *Students*: G.C.E. A/L Technology students signing in, downloading Notes and Past Papers, viewing Rank Boards, and sitting timed online examinations across Android phones, iPhones, iPads, laptops, and embedded social-app browsers.
  - *Platform Administrator*: Managing curriculum PDFs, Past Papers, timed MCQ/structured exams, grading, Rank Boards, and visual popup announcements from any mobile or desktop device.
- **Key Value**: Guarantees zero serverless disk errors (`501`) when publishing visual notices on Netlify, preserves full security rule enforcement, and gives the administrator instant visual confirmation on the live URL that server clocks, serverless API routes, PDF streaming, and cloud database connections are healthy.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Serverless Announcement Image Upload & Preview**: Inside the Admin Panel's Announcement modal, choosing a PNG, JPEG, or WebP banner image validates the file signature and streams it directly to Firebase Cloud Storage with a live percentage indicator (falling back to local storage only during offline local development), or accepts a pasted Google Drive image sharing link and automatically converts it into a clean HTTPS image preview URL. Both the Admin preview and the Student Important Popup Notice render a resilient fallback container if an external image is ever unreachable.
  2. **GitHub-to-Netlify Guided Activation & Live Self-Test**: Opening the Setup Guide displays a concise, ordered GitHub → Netlify → Firebase Console launch checklist (1. Connect GitHub Repo, 2. Authorize Live Netlify Domain in Firebase Auth, 3. Enable Email/Password & Sync Admin Password for password-only cloud writes, 4. Optional Cloud Storage / Drive media guidance) paired with a **Run Live Hosting Check** button that verifies the serverless clock, admin session service, stateless PDF generator, and Firestore connection in real time.
  3. **Seamless Student Exam & Download Experience (Preserved)**: Students continue to browse Notes and Past Papers with single-tap previews/downloads across desktop and mobile Safari/Chrome, authenticate with Google (popup with automatic mobile redirect recovery), and complete timed examinations in a two-zone distraction-free workspace.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Clean, authoritative EdTech assessment workspace preserving Smart Tech's established dark glassmorphic identity and staggered scroll reveals.
  - *Color Palette & 60-30-10 Budget*:
    - **60% Dominant Canvas**: Deep midnight slate (`--background`: `#060b18` / `#0F172A`) for comfortable long-session reading and exam focus.
    - **30% Structural Surfaces**: Translucent slate panels (`#0F172A` / `#1E293B` with subtle hairline borders) and crisp off-white/slate prose hierarchy.
    - **10% Semantic Focal Accents**: Cerulean/Cyan (`#0EA5E9`) for primary actions, Emerald (`#059669`) paired with explicit check icons and nominal text labels for verified states, and Amber/Coral (`#D97706` / `#DC2626`) paired with warning glyphs and descriptive text for action-required states (never hue-only signaling).
  - *Typography & Tabular Discipline*: Clear display headings with balanced line wrapping, high-legibility body copy, and monospace tabular numerals (`tabular-nums`) across countdown timers, upload progress percentages, and rank board scores.
  - *Cross-Device Spatial Ergonomics*: Mobile-safe dynamic viewport sizing (`100dvh`), touch targets $\ge 44\text{px}$ across upload buttons, checklist actions, and modal controls, and single-elevation cards without nested box clutter.
- **Interactive Feedback & Motion**:
  - Compositor-friendly opacity/transform transitions ($\le 200\text{ms}$) on upload progress bars, live diagnostic check rows, and copy-to-clipboard confirmations, while preserving all existing section scroll-reveal animations.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Firebase Cloud Storage Primary + Google Drive Link Normalization for Notice Images**:
  - *Chosen Approach*: Stream uploaded PNG/JPEG/WebP announcement banners directly to Firebase Cloud Storage (`notices/` path) and automatically normalize pasted Google Drive file-sharing links into direct HTTPS image URLs, keeping local API upload strictly as a local-dev fallback.
  - *Why*: Netlify Serverless Functions use an ephemeral, read-only filesystem where local disk uploads cannot persist, and Firestore documents enforce a strict 1,500-character URL limit (and 1 MB document ceiling) that forbids base64 image blobs inside documents. Supporting both Cloud Storage uploads and free Google Drive image links ensures visual announcements work whether or not Cloud Storage is enabled.
  - *Alternatives Considered*: Storing base64 data URLs inside Firestore documents was rejected because it violates Firestore security rule length bounds and degrades real-time listener performance for students on mobile networks.
- **Decision 2 — Firebase Auth Identity for Cloud Writes (Google Login + Synced Email/Password)**:
  - *Chosen Approach*: Maintain verified Firebase Authentication (`hiranyaudakara2@gmail.com`) as the gatekeeper for client-side Firestore and Cloud Storage writes, surfacing clear 1-click links in both the Admin banner and Setup Guide to enable Firebase Email/Password and sync the Admin Password once.
  - *Why*: Allows opening AND editing the Admin Panel from any browser or phone using either Google Sign-In or the Admin Password while keeping Zero-Trust Firestore security rules intact without storing service-account private keys in the repository.
  - *Alternatives Considered*: Weakening Firestore rules to allow unauthenticated writes was rejected as a severe security risk.
- **Decision 3 — In-Browser Post-Deploy Readiness Verifier**:
  - *Chosen Approach*: Add an interactive diagnostic runner inside the Setup Guide that tests live `/api/server-time`, `/api/admin/session-status`, `/api/curriculum-pdf/*`, and live Cloud Firestore reachability directly from whichever device/domain the admin opens.
  - *Why*: Directly answers "Did everything deploy properly?" in two seconds right after connecting GitHub to Netlify, catching any domain or environment misconfiguration immediately.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                 Universal Browser Client (Desktop & Mobile)                  │
│  ┌────────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │ Student Portal & Exams │  │ Admin CMS & Uploader │  │ Setup & SelfTest │  │
│  │ • Timed Runner (100dvh)│  │ • Notes / Papers     │  │ • GitHub Steps   │  │
│  │ • PDF & Drive Download │  │ • Exams & RankBoards │  │ • Domain Copy    │  │
│  │ • Popup Notice Modal   │  │ • Cloud Image Upload │  │ • Live API Probe │  │
│  └───────────┬────────────┘  └──────────┬───────────┘  └────────┬─────────┘  │
└──────────────┼──────────────────────────┼───────────────────────┼────────────┘
               │ /api/* HTTPS             │ Client SDK (TLS)      │ Diagnostic
               ▼                          ▼                       ▼ Probes
┌─────────────────────────────────┐  ┌─────────────────────────────────────────┐
│   Netlify CDN & Serverless Fn   │  │          Firebase Cloud Suite           │
│  • Auto-Deploy from GitHub Repo │  │  • Auth: Google + Synced Email/Password │
│  • /api/* ➔ Stateless Handler   │  │  • Firestore: Live Collections & Rules  │
│  • /*     ➔ SPA Entry Fallback  │  │  • Cloud Storage: PDFs & Notice Banners │
│  • Deterministic Crypto Sealing │  │  • Google Drive Normalized Media Links  │
└──────────────┬──────────────────┘  └────────────────────▲────────────────────┘
               │ Token & Exam Config Verification         │
               └──────────────────────────────────────────┘
```

### Data Model & State

- **Announcements (`announcements` collection)**: Continues using the existing validated schema (`title`, `body`, `category`, `priority`, `isImportant`, `imageUrl` $\le 1500$ chars, `publishedAt`, `published`, `authorId`, `authorName`, `createdAt`, `updatedAt`). `imageUrl` stores either a Firebase Cloud Storage download URL, a normalized Google Drive image URL, or a standard HTTPS URL—requiring zero breaking schema or security rule changes.
- **Cloud Storage Hierarchy**: Organizes binary uploads cleanly under `notes/`, `papers/`, and `notices/` with sanitized timestamped filenames and strict client-side magic-byte signature verification (`%PDF-` for PDFs; PNG/JPEG/WebP headers for notice images).
- **Live Readiness State (Transient UI State)**: Tracks pass/warn/error status and latency for four real-time checks: Serverless Clock API, Admin Session API, Stateless PDF Streamer, and Cloud Firestore Connectivity.

### Interactive Component & State Mapping

| Interactive Surface | User Action & State Transition | Recovery & Cross-Browser Guarantee |
| :--- | :--- | :--- |
| **Announcement Image Uploader (Admin Modal)** | Selecting a PNG/JPEG/WebP validates header bytes $\to$ streams to Firebase Cloud Storage (`notices/`) with live `0–100%` progress $\to$ populates `imageUrl` preview; pasting a Google Drive image link normalizes it on input/save. | If Cloud Storage is not yet enabled on Netlify, surfaces a clear actionable message to paste a Google Drive / HTTPS image link or enable Firebase Storage; renders broken-image fallback safely. |
| **Important Notice Popup & Cards** | Renders announcement banner image with `referrerPolicy="no-referrer"` and error state tracking. | Automatically collapses broken image frames into a clean styled visual header if an external image link expires. |
| **GitHub-to-Netlify Setup & Live Verifier** | Clicking **Run Live Hosting Check** sequentially probes `/api/server-time`, `/api/admin/session-status`, `/api/curriculum-pdf/check.pdf`, and Firestore, updating each row from `Checking` to `Verified` or `Action Needed`. | Works identically on localhost preview and live `.netlify.app` / custom domains across mobile and desktop browsers. |
| **Admin Cloud-Write Guidance Banner** | Detects when Admin Panel is unlocked via password without an active Firebase Auth user session and provides 1-tap Google Sign-In or Firebase Email/Password sync instructions. | Prevents unexpected permission errors when creating or editing records from a brand-new phone or browser. |
