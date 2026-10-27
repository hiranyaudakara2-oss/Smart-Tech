# Smart Tech — Setup & Deployment Guide

## 1. Feature Availability Overview

### Works Immediately (Active Out-of-the-Box)
- **Firebase Authentication (Google Sign-In + Admin Email/Password Gate)**: Live `signInWithPopup` Google authentication for students and admins, plus dedicated Administrator Login (`signInWithEmailAndPassword` with show/hide password toggle and optional server-verified secondary passphrase).
- **Live Cloud Firestore Database & 14 Deployed Security Rule Collections**: Real-time counts and collections across `/users`, `/admins`, `/stats/platform`, `/notes`, `/papers`, `/exams`, `/examLinks`, `/examSecrets`, `/examAttempts`, `/rankBoardEntries`, `/announcements`, `/userActivities`, `/announcementReads`, and `/auditLogs`.
- **Native Interactive Online Examinations & 6-Digit Access Passwords**: Supports `mcq`, `true_false`, and `short_answer` questions, AES-256-GCM sealed answer keys & 6-digit numeric access codes in `/examSecrets/{examId}`, `Asia/Colombo` server-synchronized countdown timers, automatic draft saving, auto-submit on timeout, and automatic server marking (`POST /api/exams/:examId/submit`).
- **Automatic Competition Rank Board**: Computes `1, 1, 3` standard tie-ranking on the best finalized attempt per student with optional `CAND-XXXXXX` anonymization.
- **PDF & Notice Image Uploads**: Validates `%PDF-` magic header bytes (`<= 25 MB`) and image signatures (`PNG/JPEG/WEBP/GIF`, `<= 8 MB`) with Firebase Storage upload and automatic Express binary storage fallback.

### Enabling Email/Password Admin Login & Optional Cloud Storage
- **Firebase Console Email/Password Provider**: To sign in via the Administrator Email + Password form, open **Firebase Console → Authentication → Sign-in method**, enable **Email/Password**, create your admin account with a verified email, and add `/admins/{uid}` (or promote via **Admin → User Management**). Verified Google Admin Sign-In works immediately.
- **Firebase Cloud Storage**: Run `firebase deploy --only storage` after enabling Cloud Storage in Firebase Console to store PDFs/images in GCS instead of local server storage.
- **Secondary Server Admin Passphrase**: Configure directly inside **Admin → Admin Settings** (scrypt-hashed) or set `ADMIN_ACCESS_PASSPHRASE` in environment secrets.

### Google Forms & Google Workspace Considerations
- Closing a Google Forms exam blocks `/examLinks/{examId}` outside the permitted schedule, whereas Native Platform Exams strictly enforce schedule windows and 6-digit access codes on the server before unsealing questions or grading submissions.
- Toggle **Accepting responses** inside external Google Forms settings if using external forms.

## 2. Commands

```bash
# Run unit tests & security rule invariant checks
npm test
npx eslint firestore.rules

# Start full-stack development server (port 3000)
npm run dev

# Build production assets
npm run build

# Start production server
npm start
```
