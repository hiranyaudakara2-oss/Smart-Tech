import React, { useState } from 'react';
import { LogOut, Menu, User as UserIcon, X } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import type { NavRoute } from '../types/platform';

const NAV_ITEMS: Array<{ label: string; route: NavRoute }> = [
  { label: 'Home', route: 'home' },
  { label: 'Note', route: 'notes' },
  { label: 'paper', route: 'papers' },
  { label: 'Online paper', route: 'online-papers' },
  { label: 'Profile', route: 'profile' },
  { label: 'Admin', route: 'admin' },
];

export function Navbar() {
  const {
    route,
    navigate,
    firebaseUser,
    userProfile,
    unreadAnnouncementsCount,
    signInWithGoogle,
    signOutUser,
  } = usePlatform();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavClick = (target: NavRoute) => {
    navigate(target);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-sky-400/15 bg-[#060b18]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single-line Brand Logo & Wordmark */}
        <a
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            handleNavClick('home');
          }}
          className="group flex items-center gap-2.5 font-display text-sm font-bold tracking-[0.06em] text-slate-50 transition-colors hover:text-cyan-300 whitespace-nowrap shrink-0 sm:text-base"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-400/35 bg-sky-500/15 text-cyan-300 transition-colors group-hover:border-cyan-300/60"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="8.5" />
              <ellipse cx="12" cy="12" rx="8.5" ry="3.5" />
              <path d="M12 3.5v17" />
            </svg>
          </span>
          <span className="text-base font-bold tracking-wide sm:text-lg">Smart Tech</span>
        </a>

        {/* Zone 2: Exact Requested Single-Line Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium"
        >
          {NAV_ITEMS.map((item) => {
            const isActive =
              route === item.route || (item.route === 'profile' && route === 'dashboard' && false);
            return (
              <a
                key={item.route}
                href={item.route === 'home' ? '#/' : `#/${item.route}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick(item.route);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'text-cyan-300 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-cyan-400'
                    : 'text-slate-300 hover:text-slate-50'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Primary Account Action */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          {firebaseUser ? (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleNavClick('dashboard')}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  route === 'dashboard'
                    ? 'border-cyan-400/50 bg-sky-500/15 text-cyan-200'
                    : 'border-slate-700/80 bg-slate-900/80 text-slate-200 hover:border-sky-400/40 hover:text-white'
                }`}
                aria-label="Open personal student dashboard"
              >
                {userProfile?.photoURL ? (
                  <img
                    src={userProfile.photoURL}
                    alt={`${userProfile.displayName} avatar`}
                    referrerPolicy="no-referrer"
                    className="h-5 w-5 rounded-full object-cover"
                  />
                ) : (
                  <UserIcon className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                )}
                <span className="max-w-[130px] truncate">
                  {userProfile?.displayName || firebaseUser.displayName || 'Dashboard'}
                </span>
                {unreadAnnouncementsCount > 0 && (
                  <span
                    className="font-mono text-[11px] font-semibold text-cyan-300 tabular-nums"
                    title={`${unreadAnnouncementsCount} unread announcements`}
                  >
                    ({unreadAnnouncementsCount})
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={signOutUser}
                aria-label="Sign out"
                title="Sign out"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/70 text-slate-300 transition-colors hover:border-rose-500/40 hover:text-rose-300"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 whitespace-nowrap shrink-0"
            >
              Sign in with Google
            </button>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation-drawer"
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/80 text-slate-200 md:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Responsive Mobile Navigation Drawer */}
      {mobileOpen && (
        <div
          id="mobile-navigation-drawer"
          className="border-t border-slate-800/90 bg-[#081022] px-4 py-4 md:hidden"
        >
          <nav aria-label="Mobile navigation" className="flex flex-col space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = route === item.route;
              return (
                <a
                  key={item.route}
                  href={item.route === 'home' ? '#/' : `#/${item.route}`}
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavClick(item.route);
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-sky-500/15 text-cyan-300'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
            {firebaseUser && (
              <a
                href="#/dashboard"
                onClick={(e) => {
                  e.preventDefault();
                  handleNavClick('dashboard');
                }}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  route === 'dashboard'
                    ? 'bg-sky-500/15 text-cyan-300'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                Dashboard {unreadAnnouncementsCount > 0 ? `(${unreadAnnouncementsCount} unread)` : ''}
              </a>
            )}
          </nav>

          <div className="mt-4 border-t border-slate-800 pt-4">
            {firebaseUser ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">
                    {userProfile?.displayName || firebaseUser.displayName}
                  </p>
                  <p className="truncate text-xs text-slate-400">{firebaseUser.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    signOutUser();
                  }}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:border-rose-500/50 hover:text-rose-300 whitespace-nowrap shrink-0"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  signInWithGoogle();
                }}
                className="w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Sign in with Google
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
