'use client';

import { useEffect, useState } from 'react';
import {
  FALLBACK_TZ,
  detectSystemTimezone,
  getTimezoneAbbreviation,
  getUserTimezone,
  hasManualTimezone,
} from '@/lib/timezone';

/**
 * Reactive hook returning the user's effective timezone.
 *
 * Hydration strategy:
 * - First render returns FALLBACK_TZ to match the server (where localStorage
 *   and Intl are unavailable). This avoids the "Text content did not match"
 *   warning that you'd get if we read the real TZ during render.
 * - Inside useEffect we read the real value and re-render. From then on the
 *   component shows correct local time.
 * - We subscribe to the `fwc:tz-change` event dispatched by setUserTimezone,
 *   so flipping zones in the picker updates every Time consumer instantly.
 *
 * The returned `hasOverride` flag lets callers show a small "auto" hint
 * when the user is on system-detected zone.
 */
export function useUserTimezone(): {
  timezone: string;
  abbreviation: string;
  hasOverride: boolean;
  systemTimezone: string;
} {
  const [timezone, setTimezone] = useState<string>(FALLBACK_TZ);
  const [hasOverride, setHasOverride] = useState<boolean>(false);
  const [systemTimezone, setSystemTimezone] = useState<string>(FALLBACK_TZ);

  useEffect(() => {
    const sync = () => {
      setTimezone(getUserTimezone());
      setHasOverride(hasManualTimezone());
      setSystemTimezone(detectSystemTimezone());
    };
    sync();
    window.addEventListener('fwc:tz-change', sync);
    // Also re-sync if another tab changes the override.
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('fwc:tz-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return {
    timezone,
    abbreviation: getTimezoneAbbreviation(timezone),
    hasOverride,
    systemTimezone,
  };
}

/**
 * Re-render every `intervalMs` milliseconds. Used by countdown displays so
 * "in 2h 4m" ticks down on its own without forcing the parent to manage a
 * timer. Defaults to 60s, which is the natural granularity of the minute
 * counter; pass 1000 if you need seconds.
 *
 * The interval is cleared on unmount and pauses while the tab is hidden so
 * we don't burn CPU when the user isn't looking.
 */
export function useNow(intervalMs: number = 60_000): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      // Snap to the next minute boundary so all countdowns across the app
      // tick simultaneously — looks much nicer than stagger.
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  return now;
}
