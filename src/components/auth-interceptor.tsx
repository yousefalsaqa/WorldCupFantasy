'use client';

import { useEffect } from 'react';

/**
 * Tier 2 of the auth guard: catches the case where a user is already in
 * the app and their session goes bad mid-session – cookie expires
 * (default 7 days), admin deletes the account, JWT_SECRET rotates, etc.
 *
 * Tier 1 (the server-side check in dashboard/layout.tsx) only fires on
 * full page loads. If a user is sitting on /squad for 8 days and their
 * cookie expires while they're picking a captain, Tier 1 won't trip
 * because there's no navigation. The next API call they make would
 * silently return 401 and the UI would look broken.
 *
 * What this does:
 *   1. Wrap `window.fetch` so we can observe every response.
 *   2. If a response is 401 AND came from one of OUR API routes AND
 *      isn't an auth endpoint that legitimately 401s on bad creds,
 *      bounce to / (the marketing page — Sign In is right there).
 *   3. Best-effort POST /api/auth/logout first so the server clears
 *      the cookie cleanly. If that fails (offline, race), we still
 *      redirect – the login flow will overwrite the cookie anyway.
 *
 * Caveats:
 *   - We use `window.location.href` instead of `router.push` because
 *     the failed request likely left React state inconsistent; a hard
 *     reload is the safest reset.
 *   - The `redirecting` latch prevents a single bad session from
 *     firing the redirect repeatedly if multiple in-flight requests
 *     all return 401.
 *   - We only patch fetch ONCE per mount (the dashboard layout). The
 *     cleanup restores the original fetch so logout-and-relogin in the
 *     same browser session doesn't double-wrap.
 */

// Auth endpoints that legitimately respond 401 on bad input – we MUST
// NOT redirect on these, otherwise typing a wrong password would log
// you out of an already-logged-in tab.
const AUTH_ENDPOINTS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/me',
  '/api/auth/logout',
];

function isOurApi(url: string): boolean {
  // Same-origin /api/* path. Handles both "/api/foo" and absolute URLs
  // (some fetch call sites use full URLs in dev/test).
  try {
    if (url.startsWith('/api/')) return true;
    if (typeof window !== 'undefined') {
      const u = new URL(url, window.location.origin);
      return u.origin === window.location.origin && u.pathname.startsWith('/api/');
    }
  } catch {
    // Not a valid URL string – ignore.
  }
  return false;
}

function isAuthEndpoint(url: string): boolean {
  return AUTH_ENDPOINTS.some((p) => url.includes(p));
}

export default function AuthInterceptor({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const original = window.fetch;
    let redirecting = false;

    const patched: typeof fetch = async (input, init) => {
      const res = await original(input as RequestInfo, init);

      if (!redirecting && res.status === 401) {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
            ? input.href
            : input.url;

        if (isOurApi(url) && !isAuthEndpoint(url)) {
          redirecting = true;
          // Best-effort cookie clear. Swallow errors – we redirect either way.
          try {
            void original('/api/auth/logout', { method: 'POST' }).catch(() => {});
          } catch {
            /* noop */
          }
          window.location.href = '/';
        }
      }

      return res;
    };

    window.fetch = patched;
    return () => {
      // Only restore if our patched copy is still the active one –
      // protects against another component patching in between.
      if (window.fetch === patched) {
        window.fetch = original;
      }
    };
  }, []);

  return <>{children}</>;
}
