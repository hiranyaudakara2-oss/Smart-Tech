import React from 'react';
import { CheckCircle2, Lock, Server, Shield } from 'lucide-react';
import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from '../lib/firebase';

export function SetupGuidePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl font-bold text-slate-50">
        Firebase Configuration, Security & Deployment Guide
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
        Complete reference covering active Firebase services, Email/Password administrator sign-in,
        6-digit examination password sealing, automatic server marking, Official Rank Board, and
        production deployment steps.
      </p>

      {/* Feature Readiness Matrix */}
      <section className="glass-surface mt-8 rounded-2xl p-6">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-slate-50">
            1. Live Feature Availability Matrix
          </h2>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-[#060b18]/80 p-4">
            <h3 className="text-sm font-semibold text-emerald-300">Works Immediately (Live Now)</h3>
            <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-slate-300">
              <li>• Google Sign-In via Firebase Authentication (`signInWithPopup`).</li>
              <li>• Real-time Cloud Firestore (`{FIREBASE_PROJECT_ID}`) across 14 hardened collections for users, notes, PDF papers, online exams, attempts, rank board, announcements, and audit logs.</li>
              <li>• Native Interactive Online Exams (`mcq`, `true_false`, `short_answer`) with AES-256-GCM sealed 6-digit access passwords, server-synchronized timers, draft saving, and instant automatic server marking.</li>
              <li>• Automatic Competition Rank Board (`1, 1, 3` tie-ranking, best finalized attempt per student, optional `CAND-XXXXXX` anonymization).</li>
              <li>• PDF `%PDF-` signature validation and image upload (`PNG/JPEG/WEBP/GIF`) with progress indicators.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#060b18]/80 p-4">
            <h3 className="text-sm font-semibold text-cyan-300">
              Administrator Email/Password & Cloud Storage
            </h3>
            <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-slate-300">
              <li>• <strong className="text-slate-100">Email/Password Admin Login:</strong> Enable <strong className="text-slate-100">Email/Password</strong> in Firebase Console → Authentication → Sign-in method, create an admin user, verify their email, and register `/admins/&#123;uid&#125;`. Until enabled, verified Google Admin Sign-In works immediately.</li>
              <li>• <strong className="text-slate-100">Secondary Admin Passphrase:</strong> Configure inside <strong className="text-slate-100">Admin → Admin Settings</strong> (scrypt-hashed on the server) or via `ADMIN_ACCESS_PASSPHRASE` env var.</li>
              <li>• <strong className="text-slate-100">Firebase Cloud Storage:</strong> `storage.rules` is included; enabling Cloud Storage stores PDFs/images in GCS, with automatic Express binary storage fallback.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#060b18]/80 p-4">
            <h3 className="text-sm font-semibold text-amber-300">
              Google Forms & Workspace Settings
            </h3>
            <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-slate-300">
              <li>• Closing a Google Forms exam blocks `/examLinks/&#123;examId&#125;` retrieval, while Native Platform Exams enforce strict server-side schedule & 6-digit password verification on `/api/exams/:id/start` and `/submit`.</li>
              <li>• Toggle <strong className="text-slate-100">Accepting responses</strong> inside external Google Forms or use Native Platform Exams for built-in automatic grading and instant Rank Board updates.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Step-by-Step Setup & Deployment Instructions */}
      <section className="glass-surface mt-6 rounded-2xl p-6">
        <div className="flex items-center gap-2.5">
          <Server className="h-5 w-5 text-cyan-300" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-slate-50">
            2. Step-by-Step Firebase Setup & CLI Deployment
          </h2>
        </div>

        <div className="mt-4 space-y-4 text-xs leading-relaxed text-slate-300">
          <div>
            <p className="font-semibold text-slate-100">
              Step 1 — Client Configuration (`firebase-applet-config.json`)
            </p>
            <p className="mt-1 text-slate-400">
              Connected to project <code className="font-mono text-cyan-300">{FIREBASE_PROJECT_ID}</code> and Enterprise Firestore database <code className="font-mono text-cyan-300">{FIRESTORE_DATABASE_ID}</code>.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-100">
              Step 2 — Enable Google & Email/Password Sign-In Providers
            </p>
            <p className="mt-1 text-slate-400">
              In <strong className="text-slate-200">Firebase Console → Authentication → Sign-in method</strong>, ensure <strong className="text-slate-200">Google</strong> is enabled for students and enable <strong className="text-slate-200">Email/Password</strong> if you wish to sign in to the dedicated Administrator Login form using an email and password. Add your production domain under Authorized Domains.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-100">
              Step 3 — Granting Administrator Privileges
            </p>
            <p className="mt-1 text-slate-400">
              Administrator authorization is enforced on the server and in <code className="font-mono text-slate-200">firestore.rules</code> via <code className="font-mono text-slate-200">/admins/&#123;uid&#125;</code> (with verified email check) plus the bootstrapped primary administrator account. Existing administrators can promote or revoke accounts from <strong className="text-slate-200">Admin → User Management</strong>.
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-100">
              Step 4 — Deploy Rules & Production Bundle
            </p>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-slate-800 bg-[#050914] p-4 font-mono text-[11px] text-slate-200">
{`# Validate Firestore Security Rules & Unit Tests
npx eslint firestore.rules
npm test

# Build Production Frontend Bundle
npm run build

# Start Full-Stack Express + Vite Production Server
npm start`}
            </pre>
          </div>
        </div>
      </section>

      <section className="glass-surface mt-6 rounded-2xl p-6">
        <div className="flex items-center gap-2.5">
          <Shield className="h-5 w-5 text-cyan-300" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-slate-50">
            3. Security Architecture Summary
          </h2>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          All 14 Firestore collections enforce default-deny catch-all rules, verified-email write checks,
          PII isolation on <code className="font-mono text-slate-200">/users/&#123;userId&#125;</code>,
          admin-only access on <code className="font-mono text-slate-200">/examSecrets/&#123;examId&#125;</code> (storing AES-256-GCM sealed answer keys & 6-digit exam passwords),
          HMAC-verified server receipts on finalized <code className="font-mono text-slate-200">/examAttempts</code> and <code className="font-mono text-slate-200">/rankBoardEntries</code>, and
          append-only audit logs in <code className="font-mono text-slate-200">/auditLogs</code>. Before
          sharing broadly in production, please review and harden <code className="font-mono text-slate-200">firestore.rules</code> and <code className="font-mono text-slate-200">storage.rules</code> against your institution's policies.
        </p>
      </section>
    </div>
  );
}
