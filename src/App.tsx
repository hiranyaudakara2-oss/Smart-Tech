import React, { useEffect, useState } from 'react';
import { PlatformProvider, usePlatform } from './context/PlatformContext';
import { LoadingScreen } from './components/LoadingScreen';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ToastViewport } from './components/SharedUI';
import { HomePage } from './pages/HomePage';
import { NotesPage } from './pages/NotesPage';
import { PapersPage } from './pages/PapersPage';
import { OnlinePapersPage } from './pages/OnlinePapersPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { SetupGuidePage } from './pages/SetupGuidePage';
import { FIREBASE_PROJECT_ID } from './lib/firebase';
import { AlertTriangle, Copy, ExternalLink, X } from 'lucide-react';

function AppShell() {
  const {
    route,
    navigate,
    bootReady,
    quotaErrorUrl,
    authDomainErrorHost,
    dismissAuthDomainError,
    pushToast,
  } = usePlatform();
  const [introComplete, setIntroComplete] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1';
  });

  // Global Scroll Animation Observer with Staggered Child Data-Delay Support
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const targetEl = entry.target as HTMLElement;

            // Handle explicit data-delay on the target element
            const selfDelay = targetEl.getAttribute('data-delay');
            if (selfDelay) {
              targetEl.style.transitionDelay = `${selfDelay}ms`;
            }

            targetEl.classList.add('is-visible');

            // Stagger animation for children within sections or cards
            const children = targetEl.querySelectorAll<HTMLElement>(
              '[data-delay], .scroll-reveal-child, .glass-panel, .glass-surface'
            );
            children.forEach((child, index) => {
              const childDataDelay = child.getAttribute('data-delay');
              const computedDelay = childDataDelay ? `${childDataDelay}ms` : `${(index + 1) * 75}ms`;
              child.style.transitionDelay = computedDelay;
              child.classList.add('is-visible');
            });
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
    );

    const elements = document.querySelectorAll('.scroll-reveal, section, .glass-panel');
    elements.forEach((el) => {
      if (!el.classList.contains('scroll-reveal')) {
        el.classList.add('scroll-reveal');
      }
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, [route, introComplete]);

  const handleCopyHostname = async (host: string) => {
    try {
      await navigator.clipboard.writeText(host);
      pushToast('success', 'Domain copied', `Copied "${host}" to clipboard.`);
    } catch {
      pushToast('info', 'Domain hostname', host);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#060b18] text-slate-100">
      {!introComplete && (
        <LoadingScreen ready={bootReady} onFinished={() => setIntroComplete(true)} />
      )}

      <Navbar />

      {authDomainErrorHost && (
        <div
          role="alert"
          className="border-b border-rose-500/40 bg-rose-950/50 px-4 py-3 text-xs text-rose-100"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <div>
                <span className="font-semibold text-white">
                  One-time Netlify Domain Setup Needed for Google Sign-In:
                </span>{' '}
                Add{' '}
                <code className="rounded bg-slate-950/80 px-1.5 py-0.5 font-mono text-cyan-300">
                  {authDomainErrorHost}
                </code>{' '}
                under <strong>Firebase Console → Authentication → Settings → Authorized domains</strong>.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopyHostname(authDomainErrorHost)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-1.5 font-medium text-slate-100 hover:border-cyan-400"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy Domain
              </button>
              <a
                href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 font-semibold text-slate-950 hover:bg-cyan-400"
              >
                <span>Open Firebase Settings</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                onClick={() => navigate('setup-guide')}
                className="rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-1.5 font-medium text-slate-200 hover:text-white"
              >
                Setup Guide
              </button>
              <button
                type="button"
                onClick={dismissAuthDomainError}
                aria-label="Dismiss domain notice"
                className="rounded p-1 text-slate-300 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {quotaErrorUrl && (
        <div
          role="alert"
          className="border-b border-amber-500/30 bg-amber-950/40 px-4 py-2.5 text-center text-xs text-amber-200"
        >
          Daily free-tier Cloud Firestore read quota has been reached and resets tomorrow.{' '}
          <a
            href={quotaErrorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline hover:text-white"
          >
            Manage Firestore Database Plan
          </a>
        </div>
      )}

      <main id="main-content" className="flex-1">
        {route === 'home' && <HomePage />}
        {route === 'notes' && <NotesPage />}
        {route === 'papers' && <PapersPage />}
        {route === 'online-papers' && <OnlinePapersPage />}
        {route === 'dashboard' && <DashboardPage />}
        {route === 'profile' && <ProfilePage />}
        {route === 'admin' && <AdminPage />}
        {route === 'setup-guide' && <SetupGuidePage />}
      </main>

      <Footer />
      <ToastViewport />
    </div>
  );
}

export default function App() {
  return (
    <PlatformProvider>
      <AppShell />
    </PlatformProvider>
  );
}
