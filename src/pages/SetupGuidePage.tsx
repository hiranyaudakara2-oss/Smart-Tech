import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import {
  ShieldCheck,
  Server,
  Database,
  Lock,
  CheckCircle2,
  AlertCircle,
  Clock,
  Globe,
  Copy,
  ExternalLink,
  Smartphone,
  KeyRound,
  Loader2,
  FolderGit2,
  HardDrive,
} from 'lucide-react';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  probeFirestoreRoundTrip,
} from '../lib/firebase';
import { formatColomboDateTime, verifyPdfMagicBytes } from '../utils/platformLogic';

type ProbeState = 'idle' | 'checking' | 'verified' | 'action_needed';

interface SubsystemCheck {
  id: 'clock' | 'session' | 'pdf' | 'firestore';
  label: string;
  endpoint: string;
  state: ProbeState;
  latencyMs: number | null;
  detail: string;
}

const INITIAL_CHECKS: SubsystemCheck[] = [
  {
    id: 'clock',
    label: 'Serverless Exam Clock & API Routing',
    endpoint: 'GET /api/server-time',
    state: 'idle',
    latencyMs: null,
    detail: 'Verifies Netlify Functions route /api/* cleanly without HTML fallback.',
  },
  {
    id: 'session',
    label: 'Stateless Admin Session Service',
    endpoint: 'GET /api/admin/session-status',
    state: 'idle',
    latencyMs: null,
    detail: 'Confirms cryptographic HMAC session verification is active.',
  },
  {
    id: 'pdf',
    label: 'Stateless Curriculum PDF Streamer',
    endpoint: 'GET /api/curriculum-pdf/readiness-check.pdf',
    state: 'idle',
    latencyMs: null,
    detail: 'Confirms binary %PDF- documents stream without local disk dependency.',
  },
  {
    id: 'firestore',
    label: 'Cloud Firestore Live Database',
    endpoint: 'stats/platform',
    state: 'idle',
    latencyMs: null,
    detail: 'Tests live TLS round-trip connectivity to your Firebase database.',
  },
];

export function SetupGuidePage() {
  const { pushToast, navigate } = usePlatform();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [runningChecks, setRunningChecks] = useState(false);
  const [checks, setChecks] = useState<SubsystemCheck[]>(INITIAL_CHECKS);
  const [lastCheckedAtMs, setLastCheckedAtMs] = useState<number | null>(null);

  const currentDomain =
    typeof window !== 'undefined' ? window.location.hostname : 'your-site.netlify.app';
  const firebaseAuthSettingsUrl = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`;
  const firebaseProvidersUrl = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/providers`;
  const firebaseStorageUrl = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/storage`;

  const copyText = async (key: string, value: string, toastTitle: string, toastMessage: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value).catch(() => undefined);
      setCopiedKey(key);
      pushToast('info', toastTitle, toastMessage);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2400);
    }
  };

  const updateCheck = (id: SubsystemCheck['id'], patch: Partial<SubsystemCheck>) => {
    setChecks((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const handleRunReadinessCheck = async () => {
    if (runningChecks) return;
    setRunningChecks(true);
    setChecks((prev) =>
      prev.map((c) => ({
        ...c,
        state: 'checking',
        latencyMs: null,
        detail: 'Running live diagnostic probe...',
      }))
    );

    let allPassed = true;

    // 1. Serverless Clock & Routing (/api/server-time)
    try {
      const t0 = performance.now();
      const resp = await fetch('/api/server-time', { cache: 'no-store' });
      const latencyMs = Math.max(1, Math.round(performance.now() - t0));
      const contentType = resp.headers.get('content-type') || '';
      const rawText = await resp.text();
      if (!resp.ok || !contentType.includes('application/json')) {
        allPassed = false;
        updateCheck('clock', {
          state: 'action_needed',
          latencyMs,
          detail: rawText.trim().startsWith('<')
            ? 'Received HTML instead of JSON. Ensure netlify.toml and netlify/functions/api.ts are deployed.'
            : `Unexpected HTTP ${resp.status} response from /api/server-time.`,
        });
      } else {
        const parsed = JSON.parse(rawText) as { serverNowMs?: number };
        const clockText = parsed.serverNowMs
          ? formatColomboDateTime(parsed.serverNowMs)
          : 'Synchronized';
        updateCheck('clock', {
          state: 'verified',
          latencyMs,
          detail: `Live JSON verified · Colombo Clock: ${clockText}`,
        });
      }
    } catch (err) {
      allPassed = false;
      updateCheck('clock', {
        state: 'action_needed',
        latencyMs: null,
        detail: err instanceof Error ? err.message : 'Unable to reach /api/server-time.',
      });
    }

    // 2. Stateless Admin Session Service (/api/admin/session-status)
    try {
      const t0 = performance.now();
      const resp = await fetch('/api/admin/session-status', { cache: 'no-store' });
      const latencyMs = Math.max(1, Math.round(performance.now() - t0));
      const contentType = resp.headers.get('content-type') || '';
      if (!resp.ok || !contentType.includes('application/json')) {
        allPassed = false;
        updateCheck('session', {
          state: 'action_needed',
          latencyMs,
          detail: `Admin session endpoint returned HTTP ${resp.status}.`,
        });
      } else {
        const parsed = (await resp.json()) as { verified?: boolean };
        updateCheck('session', {
          state: 'verified',
          latencyMs,
          detail: parsed.verified
            ? 'Stateless HMAC session service active (current browser authorized).'
            : 'Stateless HMAC session service active and ready for Admin login.',
        });
      }
    } catch (err) {
      allPassed = false;
      updateCheck('session', {
        state: 'action_needed',
        latencyMs: null,
        detail: err instanceof Error ? err.message : 'Unable to reach /api/admin/session-status.',
      });
    }

    // 3. Stateless Curriculum PDF Streamer (/api/curriculum-pdf/readiness-check.pdf)
    try {
      const t0 = performance.now();
      const resp = await fetch(
        '/api/curriculum-pdf/readiness-check.pdf?title=Readiness%20Verification&subject=ICT',
        { cache: 'no-store' }
      );
      const latencyMs = Math.max(1, Math.round(performance.now() - t0));
      const buf = new Uint8Array(await resp.arrayBuffer());
      if (resp.ok && verifyPdfMagicBytes(buf.slice(0, 5))) {
        updateCheck('pdf', {
          state: 'verified',
          latencyMs,
          detail: `Binary %PDF- stream verified (${Math.max(1, Math.round(buf.byteLength / 1024))} KB generated in memory).`,
        });
      } else {
        allPassed = false;
        updateCheck('pdf', {
          state: 'action_needed',
          latencyMs,
          detail: 'PDF endpoint did not return a valid %PDF- binary header.',
        });
      }
    } catch (err) {
      allPassed = false;
      updateCheck('pdf', {
        state: 'action_needed',
        latencyMs: null,
        detail: err instanceof Error ? err.message : 'Unable to test stateless PDF generator.',
      });
    }

    // 4. Cloud Firestore Live Round-Trip
    const firestoreResult = await probeFirestoreRoundTrip();
    if (firestoreResult.ok) {
      updateCheck('firestore', {
        state: 'verified',
        latencyMs: firestoreResult.latencyMs,
        detail: firestoreResult.detail,
      });
    } else {
      allPassed = false;
      updateCheck('firestore', {
        state: 'action_needed',
        latencyMs: firestoreResult.latencyMs,
        detail: firestoreResult.detail,
      });
    }

    setLastCheckedAtMs(Date.now());
    setRunningChecks(false);

    if (allPassed) {
      pushToast(
        'success',
        'All Hosting Subsystems Verified',
        'Serverless API routes, PDF streaming, and Cloud Firestore are healthy on this domain.'
      );
    } else {
      pushToast(
        'error',
        'Diagnostic Attention Needed',
        'Review any flagged item in the Live Hosting Readiness table.'
      );
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      <header className="space-y-3">
        <h1 className="font-display text-3xl font-extrabold text-white flex items-center gap-3 [text-wrap:balance]">
          <Server className="h-8 w-8 text-cyan-400 shrink-0" />
          <span>GitHub to Netlify Launch &amp; Cross-Device Readiness</span>
        </h1>
        <p className="text-slate-300 text-sm sm:text-base max-w-3xl leading-relaxed">
          Complete pre-launch verification and activation checklist for deploying from your GitHub repository to Netlify—ensuring student Google Sign-In, PDF &amp; Google Drive downloads, timed online exams, Rank Boards, and cross-device Admin Panel access work on every browser.
        </p>
      </header>

      {/* Interactive Live Hosting Readiness Verifier */}
      <section className="glass-panel rounded-2xl border border-sky-400/25 bg-slate-900/85 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
              <ShieldCheck className="h-6 w-6 text-cyan-400 shrink-0" />
              <span>Live Hosting &amp; Serverless Readiness Check</span>
            </h2>
            <p className="text-xs text-slate-300">
              Run this 1-click self-test here or immediately after your first Netlify deploy to confirm serverless API routes, PDF streaming, and live Firestore connectivity.
              {lastCheckedAtMs && (
                <span className="font-mono tabular-nums text-slate-400">
                  {' '}· Last verified {formatColomboDateTime(lastCheckedAtMs)}
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            disabled={runningChecks}
            onClick={handleRunReadinessCheck}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            {runningChecks ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <span>{runningChecks ? 'Testing Subsystems...' : 'Run Live Hosting Check'}</span>
          </button>
        </div>

        <div className="divide-y divide-slate-800/90 rounded-xl border border-slate-800 bg-slate-950/70">
          {checks.map((item) => {
            const StatusIcon =
              item.state === 'verified'
                ? CheckCircle2
                : item.state === 'action_needed'
                ? AlertCircle
                : item.state === 'checking'
                ? Loader2
                : Clock;

            const statusColor =
              item.state === 'verified'
                ? 'text-emerald-300'
                : item.state === 'action_needed'
                ? 'text-amber-300'
                : item.state === 'checking'
                ? 'text-cyan-300'
                : 'text-slate-400';

            const statusText =
              item.state === 'verified'
                ? 'Verified'
                : item.state === 'action_needed'
                ? 'Action Needed'
                : item.state === 'checking'
                ? 'Checking'
                : 'Ready to Test';

            return (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-slate-100 font-semibold">
                    <span>{item.label}</span>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <code className="font-mono text-[11px] font-normal text-cyan-300">
                      {item.endpoint}
                    </code>
                  </div>
                  <p className="text-slate-400 leading-relaxed">{item.detail}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {item.latencyMs !== null && (
                    <span className="font-mono tabular-nums text-[11px] text-slate-400">
                      {item.latencyMs} ms
                    </span>
                  )}
                  <div className={`inline-flex items-center gap-1.5 font-semibold whitespace-nowrap ${statusColor}`}>
                    <StatusIcon
                      className={`h-4 w-4 shrink-0 ${item.state === 'checking' ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    <span>{statusText}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 01. GitHub to Netlify Continuous Deployment */}
      <section className="glass-panel rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
          <FolderGit2 className="h-6 w-6 text-cyan-400 shrink-0" />
          <span>01. Connect Your GitHub Repository to Netlify</span>
        </h2>

        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          Push this codebase to GitHub, then in Netlify choose <strong className="text-white">Add new site → Import an existing project → GitHub</strong>. Your repository already includes <code className="font-mono text-cyan-300">netlify.toml</code> and <code className="font-mono text-cyan-300">public/_redirects</code>, so Netlify automatically configures the build:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-1">
            <p className="text-slate-400">Build Command</p>
            <p className="font-mono font-bold text-white">npm run build</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-1">
            <p className="text-slate-400">Publish Directory</p>
            <p className="font-mono font-bold text-white">dist</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-1">
            <p className="text-slate-400">Serverless Functions</p>
            <p className="font-mono font-bold text-cyan-300">netlify/functions (Node 20)</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs space-y-2">
          <p className="font-semibold text-slate-200">
            Optional Netlify Environment Variables (Site configuration → Environment variables)
          </p>
          <p className="text-slate-400 leading-relaxed">
            The app works immediately out of the box with deterministic project keys. If you want a custom exam sealing secret or a custom direct Admin Password on Netlify, add either variable before or after deploying:
          </p>
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() =>
                copyText(
                  'hmac',
                  'EXAM_HMAC_SECRET',
                  'Variable Name Copied',
                  'Set EXAM_HMAC_SECRET to any random 32+ character secret in Netlify Environment Variables.'
                )
              }
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs text-cyan-300 hover:border-slate-500 whitespace-nowrap"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>{copiedKey === 'hmac' ? 'Copied EXAM_HMAC_SECRET' : 'EXAM_HMAC_SECRET'}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                copyText(
                  'admin_pw',
                  'ADMIN_DIRECT_PASSWORD',
                  'Variable Name Copied',
                  'Set ADMIN_DIRECT_PASSWORD in Netlify Environment Variables to customize your admin password.'
                )
              }
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs text-cyan-300 hover:border-slate-500 whitespace-nowrap"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>
                {copiedKey === 'admin_pw' ? 'Copied ADMIN_DIRECT_PASSWORD' : 'ADMIN_DIRECT_PASSWORD'}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* 02. Authorize Your Netlify Domain in Firebase */}
      <section className="glass-panel rounded-2xl border border-amber-500/30 bg-slate-900/85 p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Globe className="h-6 w-6 text-amber-400 shrink-0" />
            <span>02. Authorize Your Live Netlify Domain in Firebase</span>
          </h2>
          <span className="text-xs font-semibold text-amber-300">
            Required Once After First Deploy
          </span>
        </div>

        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          For student and administrator Google Sign-In to work on Chrome, Safari, iOS, Android, and mobile webviews when hosted on Netlify, add your live <code className="font-mono text-cyan-300">.netlify.app</code> (or custom domain) under <strong className="text-white">Firebase Console → Authentication → Settings → Authorized domains</strong>:
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div>
            <p className="text-xs text-slate-400">Current Active Hostname</p>
            <p className="font-mono text-sm font-bold text-cyan-300 pt-0.5">{currentDomain}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                copyText(
                  'domain',
                  currentDomain,
                  'Domain Copied',
                  `Add "${currentDomain}" under Authorized domains in Firebase Console.`
                )
              }
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>{copiedKey === 'domain' ? 'Copied!' : 'Copy Domain'}</span>
            </button>
            <a
              href={firebaseAuthSettingsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap shrink-0"
            >
              <span>Open Firebase Authorized Domains</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* 03. Cross-Device Admin Panel Access & Cloud Write Authority */}
      <section className="glass-panel rounded-2xl border border-sky-400/20 bg-slate-900/80 p-6 space-y-5">
        <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
          <KeyRound className="h-6 w-6 text-cyan-400 shrink-0" />
          <span>03. Opening &amp; Saving in the Admin Panel From Any Device</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800 space-y-2">
            <p className="font-bold text-cyan-300 text-sm">Method A · Google Sign-In (Recommended)</p>
            <p className="text-slate-300 leading-relaxed">
              Open <strong className="text-white">/admin</strong> (or tap the Admin button in the navigation bar) on any phone, tablet, or laptop and sign in with Google using{' '}
              <code className="font-mono text-cyan-300">{BOOTSTRAPPED_ADMIN_EMAIL}</code>. Mobile webviews and strict browsers automatically fall back to redirect sign-in and grant full Firestore &amp; Cloud Storage write authority.
            </p>
          </div>

          <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800 space-y-2">
            <p className="font-bold text-emerald-300 text-sm">
              Method B · Admin Password + Firebase Sync
            </p>
            <p className="text-slate-300 leading-relaxed">
              To allow password-only logins on brand-new devices to save changes directly to Firestore &amp; Cloud Storage without Google login, enable{' '}
              <a
                href={firebaseProvidersUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-300 underline hover:text-cyan-200"
              >
                Email/Password in Firebase Sign-in Method
              </a>{' '}
              and click <strong className="text-white">Sync Cross-Device Password</strong> once inside{' '}
              <button
                type="button"
                onClick={() => navigate('admin')}
                className="text-cyan-300 underline hover:text-cyan-200 font-semibold"
              >
                Admin Panel → Audit Logs &amp; Security
              </button>
              .
            </p>
          </div>
        </div>
      </section>

      {/* 04. Cloud Storage & Google Drive Media Uploads */}
      <section className="glass-panel rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <HardDrive className="h-6 w-6 text-indigo-400 shrink-0" />
            <span>04. Serverless PDF &amp; Notice Banner Uploads</span>
          </h2>
          <a
            href={firebaseStorageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
          >
            <span>Open Firebase Storage Console</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          Netlify Functions run on a read-only filesystem, so Smart Tech streams binary uploads directly to cloud storage and supports Google Drive sharing links everywhere:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800 space-y-1.5">
            <div className="flex items-center gap-2 text-slate-200 font-bold">
              <Lock className="h-4 w-4 text-amber-400 shrink-0" />
              <span>Primary Admin Owner</span>
            </div>
            <div className="font-mono text-cyan-300 break-all">{BOOTSTRAPPED_ADMIN_EMAIL}</div>
            <p className="text-slate-400 text-[11px]">
              Verified across Netlify Functions &amp; Zero-Trust Firestore Security Rules.
            </p>
          </div>

          <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800 space-y-1.5">
            <div className="flex items-center gap-2 text-slate-200 font-bold">
              <Database className="h-4 w-4 text-indigo-400 shrink-0" />
              <span>Cloud Project &amp; Storage</span>
            </div>
            <div className="font-mono text-emerald-400 truncate" title={FIRESTORE_DATABASE_ID}>
              {FIREBASE_PROJECT_ID}
            </div>
            <p className="text-slate-400 text-[11px]">
              Direct uploads for Notes (<code className="font-mono text-slate-300">notes/</code>), Papers (<code className="font-mono text-slate-300">papers/</code>), and Notice Banners (<code className="font-mono text-slate-300">notices/</code>).
            </p>
          </div>

          <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800 space-y-1.5">
            <div className="flex items-center gap-2 text-slate-200 font-bold">
              <Smartphone className="h-4 w-4 text-cyan-400 shrink-0" />
              <span>Zero-Cost Drive Fallback</span>
            </div>
            <div className="font-mono text-slate-200">PDFs &amp; Notice Images</div>
            <p className="text-slate-400 text-[11px]">
              Paste any shared Google Drive link for Notes, Past Papers, or Popup Notice Banners—normalized automatically.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
