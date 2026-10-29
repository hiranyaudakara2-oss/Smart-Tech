import React, { useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogOut,
  ShieldAlert,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { BOOTSTRAPPED_ADMIN_EMAIL, FIREBASE_PROJECT_ID } from '../lib/firebase';

export function AdminLoginGate() {
  const {
    firebaseUser,
    isVerifiedAdmin,
    authDomainErrorHost,
    signInAdminWithEmailPassword,
    signInWithGoogle,
    logoutAdminSession,
    navigate,
    pushToast,
  } = usePlatform();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!password) {
      setErrorMessage('Administrator password is required.');
      return;
    }

    setBusy(true);
    const result = await signInAdminWithEmailPassword(BOOTSTRAPPED_ADMIN_EMAIL, password);
    setBusy(false);

    if (!result.ok) {
      setErrorMessage(result.error || 'Access Denied: Incorrect administrator password.');
    } else {
      setPassword('');
      pushToast('success', 'Admin session active', 'Welcome to Smart Tech Admin Dashboard.');
    }
  };

  const handleGoogleAdminLogin = async () => {
    setErrorMessage(null);
    setGoogleBusy(true);
    try {
      await signInWithGoogle('admin');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Google authentication failed.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const signedInNonAdmin =
    Boolean(firebaseUser) &&
    !isVerifiedAdmin &&
    (firebaseUser?.email || '').toLowerCase() !== BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6 sm:py-14">
      <div className="glass-panel rounded-2xl border border-sky-400/30 bg-[#060b18]/95 p-6 shadow-2xl backdrop-blur-xl sm:p-9">
        <div className="flex items-center gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-sky-400/40 bg-sky-500/15 text-cyan-300 shadow-inner">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
              Smart Tech Security Gate
            </p>
            <h1 className="font-display text-2xl font-bold text-slate-50">Administrator Login</h1>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          Authorized access on any device. Sign in with{' '}
          <strong className="text-slate-200">{BOOTSTRAPPED_ADMIN_EMAIL}</strong> via Google Sign-In
          or enter your administrator password below.
        </p>

        {signedInNonAdmin && (
          <div className="mt-4 rounded-xl border border-amber-500/35 bg-amber-950/30 p-3.5 text-xs leading-relaxed text-amber-100">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <div className="space-y-2">
                <p>
                  Currently signed in as{' '}
                  <strong className="text-white">{firebaseUser?.email}</strong>. Switch to{' '}
                  <strong className="text-cyan-300">{BOOTSTRAPPED_ADMIN_EMAIL}</strong> or enter the
                  administrator password below.
                </p>
                <button
                  type="button"
                  onClick={logoutAdminSession}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold text-amber-200 hover:bg-slate-900"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  Sign Out Student Account
                </button>
              </div>
            </div>
          </div>
        )}

        {authDomainErrorHost && (
          <div className="mt-4 rounded-xl border border-cyan-500/35 bg-sky-950/35 p-3.5 text-xs leading-relaxed text-slate-200">
            <p className="font-semibold text-cyan-300">
              Add Netlify Domain to Firebase Authorized Domains
            </p>
            <p className="mt-1 text-slate-300">
              To enable Google Sign-In on <code className="font-mono text-white">{authDomainErrorHost}</code>,
              add it in Firebase Authentication settings (or sign in immediately with your password below).
            </p>
            <a
              href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 font-semibold text-cyan-300 underline hover:text-white"
            >
              <span>Open Firebase Authorized Domains</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/35 p-3.5 text-xs leading-relaxed text-rose-200 shadow-lg"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
            <div>
              <p className="font-bold">Access Denied</p>
              <p className="mt-0.5 text-slate-300">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Method 1: Google Sign-In (Popup with Mobile Redirect Fallback) */}
        <div className="mt-6">
          <button
            type="button"
            disabled={busy || googleBusy}
            onClick={handleGoogleAdminLogin}
            className="flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-lg bg-sky-500 px-5 py-3 text-xs font-semibold text-slate-950 shadow-lg shadow-sky-500/20 transition-colors hover:bg-cyan-400 disabled:opacity-50"
          >
            {googleBusy ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-950" aria-hidden="true" />
            ) : (
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            {googleBusy ? 'Verifying Google Account...' : 'Continue with Google'}
          </button>
        </div>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-800" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Or Login with Password
          </span>
          <div className="h-px flex-1 bg-slate-800" />
        </div>

        {/* Method 2: Password Form (Email input removed per design preference) */}
        <form onSubmit={handleLoginSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="admin-login-password"
              className="mb-1.5 block text-xs font-medium text-slate-300"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="admin-login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="min-h-[44px] w-full rounded-lg border border-slate-700/80 bg-[#060b18] py-2.5 pl-3.5 pr-11 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:text-slate-100"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || googleBusy}
            className="min-h-[44px] w-full rounded-lg border border-slate-700/80 bg-slate-900/90 px-4 py-2.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? 'Authenticating Credentials...' : 'Sign In with Password'}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between border-t border-slate-800/80 pt-4 text-xs text-slate-400">
          <button
            type="button"
            onClick={() => navigate('home')}
            className="py-1 transition-colors hover:text-slate-200"
          >
            ← Return to Home
          </button>
          <button
            type="button"
            onClick={() => navigate('setup-guide')}
            className="py-1 text-cyan-400 transition-colors hover:text-cyan-300"
          >
            Netlify Setup Guide
          </button>
        </div>
      </div>
    </div>
  );
}
