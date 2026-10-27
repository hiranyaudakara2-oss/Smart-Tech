import React, { useEffect, useState } from 'react';
import { LogOut, Save, Shield, User as UserIcon } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { updatePermittedUserProfile } from '../services/platformService';
import { formatColomboDateTime } from '../utils/platformLogic';

export function ProfilePage() {
  const {
    authReady,
    firebaseUser,
    userProfile,
    isVerifiedAdmin,
    signInWithGoogle,
    signOutUser,
    navigate,
    refreshProfileState,
    pushToast,
  } = usePlatform();

  const [displayName, setDisplayName] = useState('');
  const [grade, setGrade] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName);
      setGrade(userProfile.grade || 'Grade 13 (G.C.E. A/L)');
    }
  }, [userProfile]);

  if (!authReady) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="glass-surface h-64 animate-pulse rounded-2xl p-8" />
      </div>
    );
  }

  if (!firebaseUser || !userProfile) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="glass-panel rounded-2xl p-8 text-center">
          <UserIcon className="mx-auto h-10 w-10 text-cyan-300" aria-hidden="true" />
          <h1 className="mt-4 font-display text-2xl font-bold text-slate-50">
            Student Account & Profile
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Authenticate securely with Google Sign-In via Firebase Authentication to view your
            account details, manage your display preferences, and access your personalized learning
            dashboard.
          </p>
          <button
            type="button"
            onClick={() => signInWithGoogle()}
            className="mt-6 rounded-lg bg-sky-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = displayName.trim();
    if (!trimmedName || trimmedName.length > 100) {
      pushToast('error', 'Validation error', 'Display name must be between 1 and 100 characters.');
      return;
    }

    setSaving(true);
    try {
      await updatePermittedUserProfile(firebaseUser.uid, {
        displayName: trimmedName,
        grade: grade.trim().slice(0, 40),
      });
      refreshProfileState({
        displayName: trimmedName,
        grade: grade.trim().slice(0, 40),
      });
      pushToast('success', 'Profile updated', 'Your permitted profile preferences were saved.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update profile.';
      pushToast('error', 'Profile update failed', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-50">Account Profile</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Verified Google identity and personal study preferences.
          </p>
        </div>

        <button
          type="button"
          onClick={signOutUser}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-900/40 whitespace-nowrap"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Sign out securely
        </button>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-6 md:grid-cols-12">
        {/* Identity Summary Card */}
        <div className="glass-surface rounded-2xl p-6 md:col-span-5">
          <div className="flex items-center gap-4">
            {userProfile.photoURL ? (
              <img
                src={userProfile.photoURL}
                alt={`${userProfile.displayName} avatar`}
                referrerPolicy="no-referrer"
                className="h-16 w-16 rounded-full border border-sky-400/40 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-sky-400/30 bg-sky-950/60">
                <UserIcon className="h-7 w-7 text-cyan-300" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-slate-50">
                {userProfile.displayName}
              </h2>
              <p className="truncate text-xs text-slate-400">{userProfile.email}</p>
            </div>
          </div>

          <dl className="mt-6 space-y-3 border-t border-slate-800/80 pt-4 text-xs">
            <div>
              <dt className="text-slate-400">Verified Role</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-slate-100">
                <Shield className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
                {isVerifiedAdmin ? 'Verified Platform Administrator' : 'Registered Student'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Account Created</dt>
              <dd className="mt-0.5 font-mono text-slate-200 tabular-nums">
                {formatColomboDateTime(userProfile.createdAtMs)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Firebase UID</dt>
              <dd className="mt-0.5 break-all font-mono text-[11px] text-slate-400">
                {userProfile.uid}
              </dd>
            </div>
          </dl>

          <div className="mt-6 border-t border-slate-800/80 pt-4">
            <p className="text-xs font-medium text-slate-300">Workspace Shortcuts</p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => navigate('dashboard')}
                className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white"
              >
                My Dashboard
              </button>
              <button
                type="button"
                onClick={() => navigate('notes')}
                className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white"
              >
                Browse Notes
              </button>
              <button
                type="button"
                onClick={() => navigate('papers')}
                className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white"
              >
                Past Papers
              </button>
              <button
                type="button"
                onClick={() => navigate('online-papers')}
                className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-white"
              >
                Online Exams
              </button>
            </div>
          </div>
        </div>

        {/* Permitted Preferences Form */}
        <form
          onSubmit={handleSaveProfile}
          className="glass-surface rounded-2xl p-6 md:col-span-7"
        >
          <h2 className="text-lg font-semibold text-slate-50">Update Permitted Preferences</h2>
          <p className="mt-1 text-xs text-slate-400">
            Verified email identity and administrator privileges are read-only and enforced by
            Firestore Security Rules.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="profile-display-name" className="block text-xs font-medium text-slate-300">
                Display Name
              </label>
              <input
                id="profile-display-name"
                type="text"
                required
                maxLength={100}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100 focus:border-sky-400"
              />
            </div>

            <div>
              <label htmlFor="profile-grade" className="block text-xs font-medium text-slate-300">
                Academic Level / Technology Stream
              </label>
              <select
                id="profile-grade"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#060b18] px-3.5 py-2 text-sm text-slate-100 focus:border-sky-400"
              >
                <option value="Grade 12 (G.C.E. A/L)">Grade 12 (G.C.E. A/L)</option>
                <option value="Grade 13 (G.C.E. A/L)">Grade 13 (G.C.E. A/L)</option>
                <option value="Engineering Technology">Engineering Technology</option>
                <option value="Biosystems Technology">Biosystems Technology</option>
                <option value="Information & Communication Technology">
                  Information & Communication Technology
                </option>
                <option value="Undergraduate / Instructor">Undergraduate / Instructor</option>
              </select>
            </div>

            <div>
              <label htmlFor="profile-email-readonly" className="block text-xs font-medium text-slate-400">
                Verified Google Email (Read-only)
              </label>
              <input
                id="profile-email-readonly"
                type="email"
                readOnly
                disabled
                value={userProfile.email}
                className="mt-1.5 w-full cursor-not-allowed rounded-lg border border-slate-800 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-400"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              {saving ? 'Saving Changes...' : 'Save Profile Preferences'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
