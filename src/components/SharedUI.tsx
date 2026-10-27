import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Info,
  X,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';

export function ToastViewport() {
  const { toasts, dismissToast } = usePlatform();
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0"
    >
      {toasts.map((t) => {
        const Icon =
          t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? AlertTriangle : Info;
        const accent =
          t.tone === 'success'
            ? 'border-emerald-500/40 text-emerald-300'
            : t.tone === 'error'
            ? 'border-rose-500/45 text-rose-300'
            : 'border-sky-400/40 text-cyan-300';

        return (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`glass-panel flex items-start gap-3 rounded-xl p-4 shadow-xl ${accent}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-100">{t.title}</p>
              {t.message && <p className="mt-0.5 text-xs text-slate-300">{t.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
              className="rounded p-1 text-slate-400 hover:text-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm Delete',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div className="glass-panel w-full max-w-md rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
          <div>
            <h2 id="confirm-dialog-title" className="text-lg font-semibold text-slate-50">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{description}</p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800/70"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {busy ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PdfViewerModalProps {
  open: boolean;
  title: string;
  subtitle: string;
  pdfUrl: string;
  fileName: string;
  onClose: () => void;
  onDownloadTriggered?: () => void;
}

export function PdfViewerModal({
  open,
  title,
  subtitle,
  pdfUrl,
  fileName,
  onClose,
  onDownloadTriggered,
}: PdfViewerModalProps) {
  if (!open) return null;

  const downloadHref = pdfUrl.startsWith('/api/')
    ? `${pdfUrl}${pdfUrl.includes('?') ? '&' : '?'}download=1`
    : pdfUrl;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`PDF Reader: ${title}`}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 p-3 sm:p-6 backdrop-blur-sm"
    >
      <div className="glass-panel mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-50">{title}</h2>
            <p className="truncate text-xs text-slate-400">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <a
              href={downloadHref}
              download={fileName || 'resource.pdf'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onDownloadTriggered}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download PDF
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close PDF preview"
              className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="relative flex-1 bg-slate-900">
          <iframe
            title={`PDF Document: ${title}`}
            src={pdfUrl}
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  );
}

interface ExamPortalModalProps {
  open: boolean;
  title: string;
  subject: string;
  formUrl: string;
  onClose: () => void;
}

export function ExamPortalModal({
  open,
  title,
  subject,
  formUrl,
  onClose,
}: ExamPortalModalProps) {
  if (!open) return null;

  const embedUrl =
    formUrl.includes('viewform') && !formUrl.includes('embedded=true')
      ? `${formUrl}${formUrl.includes('?') ? '&' : '?'}embedded=true`
      : formUrl;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Online Examination: ${title}`}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 p-3 sm:p-6 backdrop-blur-sm"
    >
      <div className="glass-panel mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-50">{title}</h2>
            <p className="truncate text-xs text-slate-400">
              {subject} · Official Google Forms Examination View
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <a
              href={formUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Open Google Form in New Tab
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close examination window"
              className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-950 p-4">
          <div className="mb-3 rounded-xl border border-sky-400/20 bg-sky-950/30 px-4 py-2.5 text-xs text-slate-300">
            If the external Google Form restricts iframe embedding by organization policy, use the{' '}
            <strong className="text-slate-100">Open Google Form in New Tab</strong> button above to
            complete and submit your answers before the closing time.
          </div>
          <iframe
            title={`Google Form: ${title}`}
            src={embedUrl}
            className="h-[calc(100%-3.5rem)] w-full rounded-xl border border-slate-800 bg-white"
          />
        </div>
      </div>
    </div>
  );
}

export function ResilientImage({
  src,
  alt,
  fallbackLabel,
  className = '',
}: {
  src: string;
  alt: string;
  fallbackLabel: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#0d1b36] via-[#091326] to-[#071f2e] p-4 text-center ${className}`}
      >
        <FileText className="h-7 w-7 text-sky-400/80" aria-hidden="true" />
        <span className="mt-2 line-clamp-2 text-xs font-medium text-slate-300">
          {fallbackLabel}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
