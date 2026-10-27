import React, { useEffect, useMemo, useState } from 'react';
import { Bell, ChevronDown, ChevronUp, X } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { ResilientImage } from './SharedUI';
import { formatColomboDateTime } from '../utils/platformLogic';
import { markAnnouncementAsRead } from '../services/platformService';
import type { Announcement } from '../types/platform';

interface ImportantNoticePopupProps {
  onNavigateToAnnouncements?: () => void;
}

function getDismissKey(ann: Announcement): string {
  return `smart_tech_notice_dismissed_${ann.id}_${ann.updatedAtMs || ann.createdAtMs}`;
}

export function ImportantNoticePopup({ onNavigateToAnnouncements }: ImportantNoticePopupProps) {
  const { publishedAnnouncements, dataLoading, firebaseUser } = usePlatform();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const featuredNotice = useMemo<Announcement | null>(() => {
    if (!publishedAnnouncements || publishedAnnouncements.length === 0) return null;
    const importantList = publishedAnnouncements.filter(
      (a) => a.published && (a.isImportant || a.category === 'Important Announcement' || a.priority === 'urgent')
    );
    const pool = importantList.length > 0 ? importantList : publishedAnnouncements.filter((a) => a.published);
    if (pool.length === 0) return null;
    return [...pool].sort(
      (a, b) => (b.publishedAtMs || b.createdAtMs) - (a.publishedAtMs || a.createdAtMs)
    )[0];
  }, [publishedAnnouncements]);

  const currentStorageKey = featuredNotice ? getDismissKey(featuredNotice) : null;

  const isAlreadyDismissed = useMemo(() => {
    if (!currentStorageKey) return true;
    if (dismissedKey === currentStorageKey) return true;
    try {
      return window.sessionStorage.getItem(currentStorageKey) === '1';
    } catch {
      return false;
    }
  }, [currentStorageKey, dismissedKey]);

  useEffect(() => {
    setExpanded(false);
  }, [featuredNotice?.id]);

  if (dataLoading || !featuredNotice || isAlreadyDismissed) {
    return null;
  }

  const handleClose = () => {
    if (currentStorageKey) {
      try {
        window.sessionStorage.setItem(currentStorageKey, '1');
      } catch {
        // Ignore storage quota issues
      }
      setDismissedKey(currentStorageKey);
    }
    if (firebaseUser) {
      markAnnouncementAsRead(firebaseUser.uid, featuredNotice.id).catch(() => undefined);
    }
  };

  const isLongMessage = featuredNotice.body.length > 220;
  const displayTime = formatColomboDateTime(
    featuredNotice.publishedAtMs || featuredNotice.createdAtMs
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="important-notice-popup-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm transition-opacity duration-200"
    >
      <div
        className={`glass-panel relative w-full max-w-xl overflow-hidden rounded-2xl border transition-transform duration-200 ${
          featuredNotice.isImportant || featuredNotice.priority === 'urgent'
            ? 'border-cyan-400/45 shadow-2xl shadow-cyan-950/50'
            : 'border-sky-400/25 shadow-xl'
        }`}
      >
        {/* Header Bar */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800/90 bg-[#081226]/90 px-6 py-4">
          <div className="flex items-center gap-2.5 text-xs">
            <Bell
              className={`h-4 w-4 shrink-0 ${
                featuredNotice.isImportant ? 'text-cyan-300' : 'text-sky-400'
              }`}
              aria-hidden="true"
            />
            <div className="flex flex-wrap items-center gap-1.5 text-slate-300">
              <span className="font-semibold text-cyan-300">
                {featuredNotice.isImportant
                  ? 'Important Administrator Notice'
                  : featuredNotice.category}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {displayTime}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close announcement popup"
            className="rounded-lg border border-slate-700/80 bg-slate-900/80 p-1.5 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Optional Notice Image */}
        {featuredNotice.imageUrl && (
          <div className="max-h-60 w-full overflow-hidden border-b border-slate-800/80 bg-[#060b18]">
            <ResilientImage
              src={featuredNotice.imageUrl}
              alt={featuredNotice.title}
              fallbackLabel={featuredNotice.category}
              className="max-h-60 w-full object-cover"
            />
          </div>
        )}

        {/* Body Content */}
        <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
          <h2
            id="important-notice-popup-title"
            className="font-display text-xl font-bold leading-snug text-slate-50"
          >
            {featuredNotice.title}
          </h2>

          <p
            className={`mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-200 ${
              !expanded && isLongMessage ? 'line-clamp-4' : ''
            }`}
          >
            {featuredNotice.body}
          </p>

          <p className="mt-4 text-xs text-slate-400">
            Published by {featuredNotice.authorName || 'Platform Administrator'}
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/90 bg-[#081226]/70 px-6 py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            {isLongMessage && (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
              >
                {expanded ? (
                  <>
                    Show Less
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    Read Full Message
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </>
                )}
              </button>
            )}

            {onNavigateToAnnouncements && (
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onNavigateToAnnouncements();
                }}
                className="text-xs font-medium text-slate-300 underline-offset-4 hover:text-white hover:underline whitespace-nowrap"
              >
                View All Announcements
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 whitespace-nowrap shrink-0"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
}
