'use client';

import { useEffect } from 'react';

/**
 * Tears down the static #app-splash element once React has hydrated and the
 * first real frame of the app has painted.
 *
 * Why two requestAnimationFrames?
 *   Frame 1: React has just committed; the actual app DOM is in the tree but
 *            the browser hasn't drawn it yet.
 *   Frame 2: The new pixels are on screen. Now it's safe to fade the splash
 *            so the user never sees an empty interstitial.
 *
 * The element is *removed* (not just hidden) after the fade so it doesn't
 * stay around as an invisible top-layer overlay that can swallow taps in
 * edge cases.
 */
export default function SplashRemover() {
  useEffect(() => {
    const el = document.getElementById('app-splash');
    if (!el) return;

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        el.classList.add('is-leaving');
        // Match the 280ms CSS transition, plus a tiny buffer.
        window.setTimeout(() => {
          el.parentNode?.removeChild(el);
        }, 320);
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, []);

  return null;
}
