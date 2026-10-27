import React from 'react';
import { usePlatform } from '../context/PlatformContext';

export function Footer() {
  const { navigate } = usePlatform();

  return (
    <footer className="mt-20 border-t border-slate-800/80 bg-[#050914]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="font-display text-lg font-bold tracking-wide text-slate-100">
              Smart Tech
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
              Structured digital learning hub for Engineering Technology, Biosystems Technology,
              Science for Technology, and ICT students. Access verified PDF study notes, past
              examination papers, and scheduled online assessments.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold tracking-wider text-slate-200">
              Academic Library
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-400">
              <li>
                <a
                  href="#/notes"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('notes');
                  }}
                  className="hover:text-cyan-300 transition-colors"
                >
                  Note Library
                </a>
              </li>
              <li>
                <a
                  href="#/papers"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('papers');
                  }}
                  className="hover:text-cyan-300 transition-colors"
                >
                  Past Examination Papers
                </a>
              </li>
              <li>
                <a
                  href="#/online-papers"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('online-papers');
                  }}
                  className="hover:text-cyan-300 transition-colors"
                >
                  Online Examinations
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold tracking-wider text-slate-200">
              Account & Governance
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-400">
              <li>
                <a
                  href="#/dashboard"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('dashboard');
                  }}
                  className="hover:text-cyan-300 transition-colors"
                >
                  Student Dashboard
                </a>
              </li>
              <li>
                <a
                  href="#/profile"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('profile');
                  }}
                  className="hover:text-cyan-300 transition-colors"
                >
                  User Profile
                </a>
              </li>
              <li>
                <a
                  href="#/setup-guide"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('setup-guide');
                  }}
                  className="hover:text-cyan-300 transition-colors"
                >
                  Firebase & Deployment Guide
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-slate-800/70 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Smart Tech. All rights reserved.</p>
          <p>Standard Time Zone: Asia/Colombo (UTC+05:30)</p>
        </div>
      </div>
    </footer>
  );
}
