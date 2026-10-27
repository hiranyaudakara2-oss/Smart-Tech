import React, { useState } from 'react';
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogOut,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';

export function AdminLoginGate() {
  const {
    firebaseUser,
    isVerifiedAdmin,
    adminPassphraseRequired,
    verifyAdminOnServer,
    signInAdminWithEmailPassword,
    signInWithGoogle,
    logoutAdminSession,
    navigate,
    pushToast,
  } = usePlatform();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [providerDisabledHint, setProviderDisabledHint] = useState(false);

  // Case 1: Logged in with a non-admin student account
  if (firebaseUser && !isVerifiedAdmin) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="glass-panel rounded-2xl p-8">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 shrink-0 text-rose-400" aria-hidden="true" />
            <h1 className="font-display text-2xl font-bold text-slate-50">
              Administrator Access Restricted
            </h1>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            You are currently signed in as{' '}
            <strong className="text-slate-100">{firebaseUser.email}</strong>, which is registered as
            a student account and does not hold administrator privileges in{' '}
            <code className="font-mono text-xs text-slate-200">/admins/&#123;uid&#125;</code>.
            Ordinary accounts can never elevate their own privileges.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={logoutAdminSession}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Switch to Administrator Account
            </button>
            <button
              type="button"
              onClick={() => navigate('dashboard')}
              className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-white whitespace-nowrap"
            >
              Return to Student Dashboard
            </button>
            <button
              type="button"
              onClick={() => navigate('setup-guide')}
              className="text-xs font-medium text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
            >
              Admin Role Setup Guide →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: Signed in as verified Firebase Admin, awaiting server session / secondary passphrase
  if (firebaseUser && isVerifiedAdmin) {
    const handleVerifyServer = async (e: React.FormEvent) => {
      e.preventDefault();
      setErrorMessage(null);
      if (adminPassphraseRequired && !passphrase.trim()) {
        setErrorMessage('Enter the configured server administrator passphrase to continue.');
        return;
      }
      setBusy(true);
      const res = await verifyAdminOnServer(passphrase);
      setBusy(false);
      if (res.ok) {
        setPassphrase('');
        pushToast('success', 'Administrator session verified', 'Welcome to Smart Tech Admin.');
      } else {
        setErrorMessage(res.error || 'Server verification declined.');
      }
    };

    return (
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <form onSubmit={handleVerifyServer} className="glass-panel rounded-2xl p-8">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 shrink-0 text-cyan-300" aria-hidden="true" />
            <h1 className="font-display text-2xl font-bold text-slate-50">
              Confirm Administrator Session
            </h1>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Authenticated as verified administrator{' '}
            <strong className="text-slate-100">{firebaseUser.email}</strong>.
            {adminPassphraseRequired
              ? ' Enter your secondary server passphrase to unlock the Admin Dashboard.'
              : ' Confirm server role verification to open the Admin Dashboard.'}
          </p>

          {errorMessage && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/35 p-3.5 text-xs text-rose-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="mt-5">
            <label htmlFor="server-admin-passphrase" className="block text-xs font-medium text-slate-300">
              Secondary Server Passphrase {adminPassphraseRequired ? '(Required)' : '(Optional)'}
            </label>
            <div className="relative mt-1.5">
              <input
                id="server-admin-passphrase"
                type={showPassphrase ? 'text' : 'password'}
                autoComplete="current-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder={
                  adminPassphraseRequired
                    ? 'Enter secondary administrator passphrase...'
                    : 'Leave blank if no secondary passphrase is set'
                }
                className="w-full rounded-lg border border-slate-700 bg-[#060b18] py-2.5 pl-3.5 pr-10 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-400"
              />
              <button
                type="button"
                onClick={() => setShowPassphrase((s) => !s)}
                aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-100"
              >
                {showPassphrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={logoutAdminSession}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2.5 text-xs font-medium text-slate-300 hover:border-rose-500/40 hover:text-rose-200"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Logout
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {busy ? 'Verifying Session...' : 'Unlock Admin Dashboard'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Case 3: Dedicated Administrator Login Form (Email + Password with Show/Hide + Google Admin Auth)
  const handleEmailLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setProviderDisabledHint(false);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Administrator email address is required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage('Enter a valid email address format (e.g., admin@domain.com).');
      return;
    }
    if (!password) {
      setErrorMessage('Administrator password is required.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setBusy(true);
    const result = await signInAdminWithEmailPassword(trimmedEmail, password, passphrase);
    setBusy(false);

    if (!result.ok) {
      setErrorMessage(result.error || 'Administrator login failed.');
      if (result.providerDisabled) {
        setProviderDisabledHint(true);
      }
    } else {
      setPassword('');
      setPassphrase('');
    }
  };

  const handleGoogleAdminLogin = async () => {
    setErrorMessage(null);
    setGoogleBusy(true);
    try {
      await signInWithGoogle('admin');
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <div className="glass-panel rounded-2xl p-7 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/35 bg-sky-500/15 text-cyan-300">
            <Lock className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-cyan-300">Smart Tech Security Gate</p>
            <h1 className="font-display text-2xl font-bold text-slate-50">Administrator Login</h1>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          Authorized administrators only. Every session is verified against Firebase Authentication,
          server role tokens, and Cloud Firestore <code className="font-mono text-slate-300">/admins</code>{' '}
          rules.
        </p>

        {errorMessage && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/35 p-3.5 text-xs leading-relaxed text-rose-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
            <div>
              <p>{errorMessage}</p>
              {providerDisabledHint && (
                <p className="mt-1.5 text-slate-300">
                  To use Email &amp; Password login, open{' '}
                  <strong className="text-slate-100">
                    Firebase Console → Authentication → Sign-in method
                  </strong>{' '}
                  and enable <strong className="text-slate-100">Email/Password</strong>, or sign in
                  immediately below using your verified Google administrator account.
                </p>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleEmailLoginSubmit} noValidate className="mt-5 space-y-4">
          <div>
            <label htmlFor="admin-login-email" className="block text-xs font-medium text-slate-300">
              Administrator Email
            </label>
            <input
              id="admin-login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@institution.lk"
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-400"
            />
          </div>

          <div>
            <label htmlFor="admin-login-password" className="block text-xs font-medium text-slate-300">
              Password
            </label>
            <div className="relative mt-1.5">
              <input
                id="admin-login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter administrator password"
                className="w-full rounded-lg border border-slate-700 bg-[#060b18] py-2.5 pl-3.5 pr-11 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-slate-100"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {adminPassphraseRequired && (
            <div>
              <label
                htmlFor="admin-login-passphrase"
                className="block text-xs font-medium text-slate-300"
              >
                Secondary Server Passphrase
              </label>
              <input
                id="admin-login-passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter server passphrase"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-400"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={busy || googleBusy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? 'Authenticating Administrator...' : 'Sign In to Admin Dashboard'}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-800" />
          <span className="text-[11px] text-slate-400">Or verified Google Admin</span>
          <div className="h-px flex-1 bg-slate-800" />
        </div>

        <button
          type="button"
          disabled={busy || googleBusy}
          onClick={handleGoogleAdminLogin}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/90 px-4 py-2.5 text-xs font-semibold text-slate-100 transition-colors hover:border-sky-400/50 hover:bg-slate-800 disabled:opacity-50"
        >
          {googleBusy && <Loader2 className="h-4 w-4 animate-spin text-cyan-300" aria-hidden="true" />}
          {googleBusy ? 'Connecting Google Account...' : 'Continue with Verified Google Admin'}
        </button>

        <div className="mt-5 flex items-center justify-between border-t border-slate-800/80 pt-4 text-xs text-slate-400">
          <button
            type="button"
            onClick={() => navigate('home')}
            className="hover:text-slate-200"
          >
            ← Back to Home
          </button>
          <button
            type="button"
            onClick={() => navigate('setup-guide')}
            className="text-cyan-300 hover:text-cyan-200"
          >
            Auth &amp; Role Setup Guide
          </button>
        </div>
      </div>
    </div>
  );
}
