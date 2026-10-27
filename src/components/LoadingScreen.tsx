import React, { useEffect, useState } from 'react';

interface LoadingScreenProps {
  ready: boolean;
  onFinished: () => void;
}

export function LoadingScreen({ ready, onFinished }: LoadingScreenProps) {
  const [progress, setProgress] = useState(12);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (params.get('autostart') === '1' || prefersReducedMotion) {
      setProgress(100);
      onFinished();
      return;
    }

    const interval = window.setInterval(() => {
      setProgress((prev) => {
        if (ready) {
          return Math.min(100, prev + 11);
        }
        return Math.min(86, prev + 7);
      });
    }, 75);

    return () => window.clearInterval(interval);
  }, [ready, onFinished]);

  useEffect(() => {
    if (progress >= 100 && !exiting) {
      setExiting(true);
      const timer = window.setTimeout(() => {
        onFinished();
      }, 240);
      return () => window.clearTimeout(timer);
    }
  }, [progress, exiting, onFinished]);

  const progressWidthClass =
    progress >= 100
      ? 'w-full'
      : progress >= 90
      ? 'w-11/12'
      : progress >= 80
      ? 'w-4/5'
      : progress >= 68
      ? 'w-2/3'
      : progress >= 52
      ? 'w-1/2'
      : progress >= 35
      ? 'w-1/3'
      : progress >= 20
      ? 'w-1/5'
      : 'w-1/12';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading Smart Tech"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#060b18] px-6 transition-opacity duration-200 ${
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Subtle geometric circuit grid backdrop */}
      <div
        aria-hidden="true"
        className="circuit-grid-backdrop pointer-events-none absolute inset-0 opacity-25"
      />

      {/* Animated Digital Globe, Circuit Lines & Floating Geometric Nodes */}
      <div className="relative mb-8 flex h-48 w-48 items-center justify-center" aria-hidden="true">
        <svg viewBox="0 0 220 220" className="h-full w-full">
          <defs>
            <linearGradient id="globeStroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>

          {/* Glowing Blue Circuit Trace Connectors */}
          <path
            d="M12 110 H36 L48 98 M208 110 H184 L172 122 M110 10 V30 M110 210 V190"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.2"
            opacity="0.45"
          />

          {/* Floating Geometric Elements & Particles */}
          <g className="float-node">
            <polygon points="28,44 35,38 42,44 35,50" fill="none" stroke="#22d3ee" strokeWidth="1.2" />
            <rect x="178" y="38" width="9" height="9" rx="1.5" fill="none" stroke="#38bdf8" strokeWidth="1.2" />
            <circle cx="34" cy="174" r="3" fill="#22d3ee" />
            <polygon points="184,170 191,182 177,182" fill="none" stroke="#38bdf8" strokeWidth="1.2" />
          </g>

          {/* Outer Orbital Circuit Ring */}
          <g className="orbit-slow">
            <circle
              cx="110"
              cy="110"
              r="94"
              fill="none"
              stroke="url(#globeStroke)"
              strokeWidth="1.3"
              strokeDasharray="18 10 4 10"
              opacity="0.7"
            />
            <circle cx="110" cy="16" r="3.5" fill="#22d3ee" />
            <circle cx="204" cy="110" r="3" fill="#38bdf8" />
          </g>

          {/* Counter-Rotating Telemetry Ring */}
          <g className="orbit-reverse">
            <circle
              cx="110"
              cy="110"
              r="76"
              fill="none"
              stroke="#0ea5e9"
              strokeWidth="1.1"
              strokeDasharray="36 16"
              opacity="0.55"
            />
            <rect x="106" y="30" width="8" height="8" rx="1.5" fill="#38bdf8" opacity="0.85" />
          </g>

          {/* Digital Wireframe Globe Core */}
          <circle
            cx="110"
            cy="110"
            r="54"
            fill="rgba(14, 165, 233, 0.1)"
            stroke="url(#globeStroke)"
            strokeWidth="1.6"
          />
          <ellipse
            cx="110"
            cy="110"
            rx="54"
            ry="21"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1"
            opacity="0.6"
          />
          <ellipse
            cx="110"
            cy="110"
            rx="23"
            ry="54"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1"
            opacity="0.6"
          />
          <line x1="56" y1="110" x2="164" y2="110" stroke="#38bdf8" strokeWidth="0.9" opacity="0.5" />
          <line x1="110" y1="56" x2="110" y2="164" stroke="#38bdf8" strokeWidth="0.9" opacity="0.5" />
          <circle cx="110" cy="110" r="6" fill="#22d3ee" />
        </svg>
      </div>

      {/* Platform Title */}
      <h1 className="text-center font-display text-2xl font-bold tracking-wider text-slate-50 sm:text-3xl">
        Smart Tech
      </h1>
      <p className="mt-2 text-center text-sm text-slate-400">
        Preparing notes archive, examination schedules, and learning workspace
      </p>

      {/* Progress Bar & Tabular Percentage */}
      <div className="mt-7 w-full max-w-xs">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/90">
          <div
            className={`h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-150 ease-out ${progressWidthClass}`}
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between font-mono text-xs text-slate-400 tabular-nums">
          <span>Synchronizing resources</span>
          <span className="text-cyan-300">{progress}%</span>
        </div>
      </div>
    </div>
  );
}
