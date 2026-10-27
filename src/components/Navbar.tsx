import React, { useMemo, useState } from 'react';
import { LogOut, Menu, Search as SearchIcon, User as UserIcon, X } from 'lucide-react';
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
    publishedNotes,
    publishedPapers,
    publishedExams,
  } = usePlatform();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { notes: [], papers: [], exams: [] };
    const notes = publishedNotes
      .filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.subject.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
      )
      .slice(0, 5);
    const papers = publishedPapers
      .filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.subject.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          String(p.year).includes(q)
      )
      .slice(0, 5);
    const exams = publishedExams
      .filter(
        (ex) =>
          ex.title.toLowerCase().includes(q) ||
          ex.subject.toLowerCase().includes(q) ||
          ex.description.toLowerCase().includes(q)
      )
      .slice(0, 5);
    return { notes, papers, exams };
  }, [searchQuery, publishedNotes, publishedPapers, publishedExams]);

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
          className="hidden md:flex items-center gap-5 text-sm font-medium"
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

        {/* Global Search Bar */}
        <div className="relative hidden lg:block flex-1 max-w-xs mx-4">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
              <SearchIcon className="h-4 w-4" aria-hidden="true" />
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 200)}
              placeholder="Search notes, papers, exams..."
              className="w-full rounded-lg border border-slate-700/80 bg-[#060b18] py-1.5 pl-9 pr-3 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {searchFocused && searchQuery.trim().length > 0 && (
            <div className="absolute left-0 right-0 mt-2 rounded-xl border border-sky-400/30 bg-[#060b18]/95 p-2 shadow-2xl backdrop-blur-md z-50 max-h-80 overflow-y-auto">
              {searchResults.notes.length === 0 &&
              searchResults.papers.length === 0 &&
              searchResults.exams.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400">
                  No matching educational notes or past papers found.
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.notes.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                        Notes ({searchResults.notes.length})
                      </p>
                      {searchResults.notes.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setSearchFocused(false);
                            handleNavClick('notes');
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800/80 hover:text-cyan-300"
                        >
                          <span className="truncate">{n.title}</span>
                          <span className="shrink-0 font-mono text-[10px] text-slate-400">{n.subject}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.papers.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                        Papers ({searchResults.papers.length})
                      </p>
                      {searchResults.papers.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setSearchFocused(false);
                            handleNavClick('papers');
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800/80 hover:text-cyan-300"
                        >
                          <span className="truncate">{p.title}</span>
                          <span className="shrink-0 font-mono text-[10px] text-slate-400">{p.year}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.exams.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                        Online Exams ({searchResults.exams.length})
                      </p>
                      {searchResults.exams.map((ex) => (
                        <button
                          key={ex.id}
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setSearchFocused(false);
                            handleNavClick('online-papers');
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800/80 hover:text-cyan-300"
                        >
                          <span className="truncate">{ex.title}</span>
                          <span className="shrink-0 font-mono text-[10px] text-slate-400">{ex.subject}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

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
