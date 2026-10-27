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

function AppShell() {
  const { route, bootReady, quotaErrorUrl } = usePlatform();
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

  return (
    <div className="flex min-h-screen flex-col bg-[#060b18] text-slate-100">
      {!introComplete && (
        <LoadingScreen ready={bootReady} onFinished={() => setIntroComplete(true)} />
      )}

      <Navbar />

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
