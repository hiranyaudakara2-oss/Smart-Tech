import React, { useEffect, useMemo, useState } from 'react';
import { Bell, ChevronDown, ChevronUp, X } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { ResilientImage } from './SharedUI';
import { formatColomboDateTime } from '../utils/platformLogic';
import { markAnnouncementAsRead } from '../services/platformService';
import type { Announcement } from '../types/platform';

interface ImportantNoticePopupProps {
  onNavigateToAnnouncements?: () => void;
  announcement?: Announcement | null;
  onClose?: () => void;
}

function getDismissKey(ann: Announcement): string {
  return `smart_tech_notice_dismissed_${ann.id}_${ann.updatedAtMs || ann.createdAtMs}`;
}

export function ImportantNoticePopup({
  onNavigateToAnnouncements,
  announcement,
  onClose,
}: ImportantNoticePopupProps) {
  const { publishedAnnouncements, dataLoading, firebaseUser, readAnnouncementIds } = usePlatform();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const autoFeaturedNotice = useMemo<Announcement | null>(() => {
    if (!publishedAnnouncements || publishedAnnouncements.length === 0) return null;
    const importantList = publishedAnnouncements.filter(
      (a) =>
        a.published &&
        (a.isImportant || a.category === 'Important Announcement' || a.priority === 'urgent')
    );
    if (importantList.length === 0) return null;
    return [...importantList].sort(
      (a, b) => (b.publishedAtMs || b.createdAtMs) - (a.publishedAtMs || a.createdAtMs)
    )[0];
  }, [publishedAnnouncements]);

  const activeNotice = announcement !== undefined ? announcement : autoFeaturedNotice;
  const isManualSelection = announcement !== undefined && announcement !== null;
  const currentStorageKey = activeNotice ? getDismissKey(activeNotice) : null;

  const isAlreadyDismissed = useMemo(() => {
    if (isManualSelection) return false;
    if (!currentStorageKey) return true;
    if (dismissedKey === currentStorageKey) return true;
    try {
      return window.sessionStorage.getItem(currentStorageKey) === '1';
    } catch {
      return false;
    }
  }, [currentStorageKey, dismissedKey, isManualSelection]);

  useEffect(() => {
    setExpanded(Boolean(isManualSelection));
  }, [activeNotice?.id, isManualSelection]);

  if ((!isManualSelection && dataLoading) || !activeNotice || isAlreadyDismissed) {
    return null;
  }

  const handleClose = () => {
    if (!isManualSelection && currentStorageKey) {
      try {
        window.sessionStorage.setItem(currentStorageKey, '1');
      } catch {
        // Ignore storage quota issues
      }
      setDismissedKey(currentStorageKey);
    }
    if (firebaseUser && firebaseUser.emailVerified && !readAnnouncementIds.has(activeNotice.id)) {
      markAnnouncementAsRead(firebaseUser.uid, activeNotice.id).catch(() => undefined);
    }
    onClose?.();
  };

  const isLongMessage = activeNotice.body.length > 220;
  const displayTime = formatColomboDateTime(
    activeNotice.publishedAtMs || activeNotice.createdAtMs
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
          activeNotice.isImportant || activeNotice.priority === 'urgent'
            ? 'border-cyan-400/45 shadow-2xl shadow-cyan-950/50'
            : 'border-sky-400/25 shadow-xl'
        }`}
      >
        {/* Header Bar */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800/90 bg-[#081226]/90 px-6 py-4">
          <div className="flex items-center gap-2.5 text-xs">
            <Bell
              className={`h-4 w-4 shrink-0 ${
                activeNotice.isImportant ? 'text-cyan-300' : 'text-sky-400'
              }`}
              aria-hidden="true"
            />
            <div className="flex flex-wrap items-center gap-1.5 text-slate-300">
              <span className="font-semibold text-cyan-300">
                {activeNotice.isImportant
                  ? 'Important Administrator Notice'
                  : activeNotice.category}
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
        {activeNotice.imageUrl && (
          <div className="max-h-60 w-full overflow-hidden border-b border-slate-800/80 bg-[#060b18]">
            <ResilientImage
              src={activeNotice.imageUrl}
              alt={activeNotice.title}
              fallbackLabel={activeNotice.category}
              className="max-h-60 w-full object-cover"
            />
          </div>
        )}

        {/* Body Content */}
        <div className="max-h-[65dvh] overflow-y-auto px-6 py-5">
          <h2
            id="important-notice-popup-title"
            className="font-display text-xl font-bold leading-snug text-slate-50"
          >
            {activeNotice.title}
          </h2>

          <p
            className={`mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-200 ${
              !expanded && isLongMessage ? 'line-clamp-4' : ''
            }`}
          >
            {activeNotice.body}
          </p>

          <p className="mt-4 text-xs text-slate-400">
            Published by {activeNotice.authorName || 'Platform Administrator'}
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/90 bg-[#081226]/70 px-6 py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            {isLongMessage && (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-cyan-300 hover:text-cyan-200"
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
                className="whitespace-nowrap text-xs font-medium text-slate-300 underline-offset-4 hover:text-white hover:underline"
              >
                View All Announcements
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="min-h-[40px] shrink-0 whitespace-nowrap rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
          >
            Acknowledge &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}
