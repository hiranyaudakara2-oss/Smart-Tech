import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { RankBoardView } from '../components/RankBoardView';
import { ImportantNoticePopup } from '../components/ImportantNoticePopup';
import { BookOpen, FileText, Monitor, Trophy, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

export function HomePage() {
  const {
    navigate,
    stats,
    publishedAnnouncements,
    publishedNotes,
    publishedPapers,
    publishedExams,
    publishedRankEntries,
  } = usePlatform();

  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any | null>(null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl border border-sky-400/20 bg-gradient-to-br from-slate-900 via-sky-950/40 to-slate-950 p-8 sm:p-12 shadow-2xl glass-panel">
        <div className="relative z-10 max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3.5 py-1.5 text-xs font-semibold text-cyan-300">
            <Sparkles className="h-4 w-4" />
            <span>Sri Lanka Tech Education Platform</span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Master Technology & Innovation with <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-300 bg-clip-text text-transparent">Smart Tech</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
            Access curated G.C.E. A/L educational notes, download past papers, sit timed online examinations with instant results, and view verified positions on official rank boards.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              onClick={() => navigate('online-papers')}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all hover:scale-105 hover:shadow-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              <Monitor className="h-4 w-4" />
              <span>Start Online Exam</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate('papers')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-6 py-3.5 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              <FileText className="h-4 w-4" />
              <span>Download Past Papers</span>
            </button>
          </div>
        </div>
      </section>

      {/* Stats Counter Bar */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="glass-panel rounded-2xl border border-sky-400/15 bg-slate-900/60 p-5 text-center transition-all hover:border-sky-400/30">
          <BookOpen className="mx-auto h-6 w-6 text-cyan-400 mb-2" />
          <div className="text-2xl font-bold text-white">{stats.totalNotes || publishedNotes.length}</div>
          <div className="text-xs text-slate-400">Educational Notes</div>
        </div>
        <div className="glass-panel rounded-2xl border border-sky-400/15 bg-slate-900/60 p-5 text-center transition-all hover:border-sky-400/30">
          <FileText className="mx-auto h-6 w-6 text-sky-400 mb-2" />
          <div className="text-2xl font-bold text-white">{stats.totalPapers || publishedPapers.length}</div>
          <div className="text-xs text-slate-400">Available Past Papers</div>
        </div>
        <div className="glass-panel rounded-2xl border border-sky-400/15 bg-slate-900/60 p-5 text-center transition-all hover:border-sky-400/30">
          <Monitor className="mx-auto h-6 w-6 text-indigo-400 mb-2" />
          <div className="text-2xl font-bold text-white">{stats.totalExams || publishedExams.length}</div>
          <div className="text-xs text-slate-400">Online Examinations</div>
        </div>
        <div className="glass-panel rounded-2xl border border-sky-400/15 bg-slate-900/60 p-5 text-center transition-all hover:border-sky-400/30">
          <Trophy className="mx-auto h-6 w-6 text-amber-400 mb-2" />
          <div className="text-2xl font-bold text-white">{stats.totalUsers || 150}+</div>
          <div className="text-xs text-slate-400">Active Students</div>
        </div>
      </section>

      {/* Published Announcements Banner */}
      {publishedAnnouncements.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <span>Latest Announcements</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {publishedAnnouncements.slice(0, 3).map((ann) => (
              <div
                key={ann.id}
                onClick={() => setSelectedAnnouncement(ann)}
                className="cursor-pointer glass-panel rounded-2xl border border-amber-500/20 bg-slate-900/80 p-5 hover:border-amber-500/40 transition-all space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                    {ann.category}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(ann.publishedAtMs || ann.createdAtMs).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="font-semibold text-white line-clamp-1">{ann.title}</h3>
                <p className="text-xs text-slate-300 line-clamp-2">{ann.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Official Rank Board Preview */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-400" />
          <span>Official Rank Leaderboard</span>
        </h2>
        <RankBoardView entries={publishedRankEntries} />
      </section>

      {/* Automatic Important Notice Popup + Clicked Announcement Modal */}
      {selectedAnnouncement ? (
        <ImportantNoticePopup
          announcement={selectedAnnouncement}
          onClose={() => setSelectedAnnouncement(null)}
        />
      ) : (
        <ImportantNoticePopup />
      )}
    </div>
  );
}
