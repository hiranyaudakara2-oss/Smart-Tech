import React from 'react';
import { usePlatform } from '../context/PlatformContext';
import { User, Shield, LogOut, CheckCircle2, Lock } from 'lucide-react';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../lib/firebase';

export function ProfilePage() {
  const { firebaseUser, userProfile, isVerifiedAdmin, signInWithGoogle, signOutUser } = usePlatform();

  const isPrimaryAdmin =
    (firebaseUser?.email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
          <User className="h-8 w-8 text-cyan-400" />
          <span>User Profile & Account Security</span>
        </h1>
        <p className="text-slate-300 text-sm">
          Manage your Google Sign-In session, user identity, and role authorization.
        </p>
      </header>

      {firebaseUser ? (
        <div className="glass-panel rounded-2xl border border-sky-400/20 bg-slate-900/80 p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-center gap-6 border-b border-slate-800 pb-6">
            {firebaseUser.photoURL ? (
              <img
                src={firebaseUser.photoURL}
                alt={firebaseUser.displayName || 'User profile'}
                className="h-20 w-20 rounded-2xl border-2 border-cyan-400/40 object-cover shadow-lg"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-slate-700 bg-slate-800 text-2xl font-bold text-cyan-300">
                {(firebaseUser.displayName || firebaseUser.email || 'U')[0].toUpperCase()}
              </div>
            )}

            <div className="text-center sm:text-left space-y-1">
              <h2 className="text-xl font-bold text-white">
                {userProfile?.displayName || firebaseUser.displayName || 'Authenticated User'}
              </h2>
              <p className="text-sm font-mono text-cyan-300">{firebaseUser.email}</p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                    isVerifiedAdmin
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  <Shield className="h-3.5 w-3.5" />
                  <span>{isVerifiedAdmin ? 'Authorized Administrator' : 'Regular Student Account'}</span>
                </span>
                {isPrimaryAdmin && (
                  <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-300 border border-cyan-500/30">
                    Primary Administrator
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              Authentication Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-300">
              <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800 space-y-1">
                <div className="text-slate-400">Unique User ID (UID)</div>
                <div className="font-mono text-slate-200 truncate">{firebaseUser.uid}</div>
              </div>
              <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800 space-y-1">
                <div className="text-slate-400">Login Provider</div>
                <div className="font-semibold text-cyan-300">Google OAuth (Firebase Auth)</div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end">
            <button
              onClick={() => signOutUser()}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out Account</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center space-y-6">
          <Lock className="mx-auto h-12 w-12 text-slate-500" />
          <h2 className="text-2xl font-bold text-white">Not Signed In</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Sign in with Google to access student records, educational downloads, and examination results.
          </p>
          <button
            onClick={() => signInWithGoogle('profile')}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-white hover:bg-cyan-400 shadow-lg shadow-cyan-500/20"
          >
            <User className="h-4 w-4" />
            <span>Continue with Google</span>
          </button>
        </div>
      )}
    </div>
  );
}
