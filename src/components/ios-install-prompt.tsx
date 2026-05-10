'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const DISMISSED_KEY = 'wc26-ios-install-dismissed';

/**
 * Bottom-sheet hint that walks iPhone Safari users through "Add to Home
 * Screen". Only shown when:
 *   - We detect iOS Safari (not iPad-as-desktop, not Chrome-on-iOS)
 *   - The app is NOT already running standalone (i.e. user hasn't installed)
 *   - The user hasn't dismissed it before (localStorage flag)
 *
 * Android Chrome handles install prompts natively via beforeinstallprompt,
 * so we don't compete with it there.
 */
export default function IosInstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ua = window.navigator.userAgent;
    const isIos = /iPhone|iPod/.test(ua) || (/iPad/.test(ua) && !('MSStream' in window));
    if (!isIos) return;

    // Already running as a home-screen app.
    const standalone =
      'standalone' in window.navigator && (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // Previously dismissed.
    try {
      if (window.localStorage.getItem(DISMISSED_KEY) === '1') return;
    } catch {
      // localStorage can throw in private mode – just show the prompt.
    }

    // Slight delay so it doesn't appear during the noisy first paint.
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  if (!show) return null;

  return (
    <div
      className="fixed left-0 right-0 px-4 pointer-events-none"
      style={{
        // Sit above iPhone's home indicator using safe-area-inset.
        bottom: 'max(env(safe-area-inset-bottom), 12px)',
        zIndex: 2147483646,
      }}
    >
      <div
        className="pointer-events-auto mx-auto max-w-sm bg-[#070a12] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 p-4 flex items-start gap-3 animate-fade-in"
        style={{ transform: 'translateZ(0)' }}
      >
        <img
          src="/icons/apple-touch-icon.png"
          alt=""
          width={44}
          height={44}
          className="w-11 h-11 rounded-lg flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm leading-tight">
            Install WC26 Fantasy
          </p>
          <p className="text-white/60 text-xs mt-1 leading-snug">
            Tap{' '}
            <span className="inline-flex items-center align-text-bottom mx-0.5">
              <ShareIcon />
            </span>{' '}
            then <span className="text-white font-semibold">Add to Home Screen</span> for the
            full app experience.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-white/40 hover:text-white p-1 -m-1 flex-shrink-0"
          aria-label="Dismiss install prompt"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Apple's "Share" glyph – 16×16, white. Rendered inline so it's a real
// vector and matches whatever font size it sits in.
function ShareIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-sky-400"
      aria-hidden
    >
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
