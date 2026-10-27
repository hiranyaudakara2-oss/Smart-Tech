import React, { useState } from 'react';
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
