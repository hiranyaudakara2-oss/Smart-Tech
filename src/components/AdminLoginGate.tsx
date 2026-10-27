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
    signInAdminWithEmailPassword,
    signInWithGoogle,
    logoutAdminSession,
    navigate,
    pushToast,
  } = usePlatform();

  const [email, setEmail] = useState('hiranyaudakara2@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Case 1: Signed in with a regular non-admin user account
  if (firebaseUser && !isVerifiedAdmin) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="glass-panel rounded-2xl p-8 sm:p-10 border border-rose-500/30 bg-[#060b18]/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3.5">
            <ShieldAlert className="h-7 w-7 shrink-0 text-rose-400" aria-hidden="true" />
            <h1 className="font-display text-2xl font-bold text-slate-50">
              Access Denied: Unauthorized Administrator
            </h1>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            You are currently authenticated as <strong className="text-slate-100">{firebaseUser.email}</strong>. 
            Administrator privileges are strictly restricted to <strong className="text-cyan-300 font-semibold">hiranyaudakara2@gmail.com</strong>.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={logoutAdminSession}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 whitespace-nowrap shadow-md shadow-sky-500/20"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign Out &amp; Use Authorized Admin Account
            </button>
            <button
              type="button"
              onClick={() => navigate('home')}
              className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-white whitespace-nowrap"
            >
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: Credentials Login (Email + Password)
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Administrator email address is required.');
      return;
    }
    if (!password) {
      setErrorMessage('Administrator password is required.');
      return;
    }

    setBusy(true);
    const result = await signInAdminWithEmailPassword(trimmedEmail, password);
    setBusy(false);

    if (!result.ok) {
      setErrorMessage(result.error || 'Access Denied: Incorrect email address or password.');
    } else {
      setPassword('');
      pushToast('success', 'Admin session active', 'Welcome to Smart Tech Admin Dashboard.');
    }
  };

  // Case 3: Google Admin Login
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

  return (
    <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <div className="glass-panel rounded-2xl p-7 sm:p-9 shadow-2xl border border-sky-400/30 bg-[#060b18]/95 backdrop-blur-xl">
        <div className="flex items-center gap-3.5">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-sky-400/40 bg-sky-500/15 text-cyan-300 shadow-inner">
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
          Authorized access only. Sign in with <strong className="text-slate-200">hiranyaudakara2@gmail.com</strong> using Google Sign-In or admin credentials.
        </p>

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

        {/* Method 1: Google Sign-In */}
        <div className="mt-6">
          <button
            type="button"
            disabled={busy || googleBusy}
            onClick={handleGoogleAdminLogin}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-sky-500 px-5 py-3 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50 shadow-lg shadow-sky-500/20"
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
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Or Login with Password</span>
          <div className="h-px flex-1 bg-slate-800" />
        </div>

        {/* Method 2: Email & Password Form */}
        <form onSubmit={handleLoginSubmit} noValidate className="space-y-4">


          <div>
            <label htmlFor="admin-login-password" className="block text-xs font-medium text-slate-300 mb-1.5">
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
                className="w-full rounded-lg border border-slate-700/80 bg-[#060b18] py-2.5 pl-3.5 pr-11 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:text-slate-100"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || googleBusy}
            className="w-full rounded-lg border border-slate-700/80 bg-slate-900/90 px-4 py-2.5 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? 'Authenticating Credentials...' : 'Sign In with Password'}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between border-t border-slate-800/80 pt-4 text-xs text-slate-400">
          <button
            type="button"
            onClick={() => navigate('home')}
            className="hover:text-slate-200 transition-colors"
          >
            ← Return to Home
          </button>
          <button
            type="button"
            onClick={logoutAdminSession}
            className="text-slate-400 hover:text-rose-300 transition-colors"
          >
            Clear Session
          </button>
        </div>
      </div>
    </div>
  );
}
