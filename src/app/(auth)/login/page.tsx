'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Crest from '@/components/crest';

export default function LoginPage() {
  // `identifier` accepts either an email or a username. We disambiguate
  // server-side by checking for "@" so the user doesn't have to pick.
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Set when the user arrived here because their session went bad (Tier 1
  // server redirect or Tier 2 client 401 interceptor). We read it from
  // window.location.search in an effect to avoid pulling in Suspense
  // boundaries for useSearchParams in Next 14.
  const [sessionExpired, setSessionExpired] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setSessionExpired(params.get('reason') === 'session_expired');
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSessionExpired(false); // they're actively retrying; hide the stale banner
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      // Server might return HTML (timeout / 5xx page) instead of JSON. Parse
      // defensively so we don't crash into the bare "Something went wrong".
      let data: { error?: string } = {};
      try {
        data = await res.json();
      } catch {
        // ignore – we'll fall back to a status-based message below
      }

      if (!res.ok) {
        const msg =
          data.error ||
          (res.status === 504 || res.status === 408
            ? 'Server timed out – please try again.'
            : res.status >= 500
            ? 'Server error – please try again in a moment.'
            : 'Login failed');
        setError(msg);
        setLoading(false);
        return;
      }

      router.push('/dashboard');
    } catch (err) {
      // Logging the actual error makes future "something went wrong" reports
      // debuggable from the browser console without needing server access.
      console.error('Login request failed:', err);
      const aborted =
        err instanceof DOMException && err.name === 'AbortError';
      setError(
        aborted
          ? 'Login was cancelled.'
          : 'Could not reach the server. Check your connection and try again.',
      );
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0e17] relative overflow-hidden flex items-center justify-center px-4 pt-safe pb-safe">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(125deg,#0a0e17_0%,#0a0e17_40%,#1a1025_50%,#0a0e17_60%,#0a0e17_100%)]"></div>
        <div className="absolute top-0 right-0 w-1/2 h-full bg-[linear-gradient(to_left,rgba(220,38,38,0.05),transparent)]"></div>
        <div className="absolute bottom-0 left-0 w-1/2 h-full bg-[linear-gradient(to_right,rgba(37,99,235,0.05),transparent)]"></div>
      </div>
      
      {/* Spotlight */}
      <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.04)_0%,transparent_60%)]"></div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-3 mb-8">
          <Crest size={44} />
          <div className="flex flex-col">
            <span className="font-black text-white text-lg tracking-tight leading-none">FANTASY</span>
            <span className="font-medium text-white/50 text-xs tracking-wider">WORLD CUP</span>
          </div>
        </Link>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-white">Welcome Back</h1>
            <p className="text-white/40 text-sm mt-1">Sign in to manage your squad</p>
          </div>

          {sessionExpired && !error && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 px-4 py-3 rounded-xl text-sm mb-6">
              Your session expired. Please sign in again to continue.
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
                Username or email
              </label>
              <input
                // `type="text"` (not "email") so the browser doesn't reject
                // usernames as malformed. We do our own validation server-side.
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:border-white/30 focus:bg-white/10 outline-none transition-all"
                placeholder="you@example.com or yourname"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:border-white/30 focus:bg-white/10 outline-none transition-all"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-[#0a0e17] font-black py-3.5 rounded-xl hover:bg-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-white/40 text-sm">
              No account?{' '}
              <Link href="/register" className="text-white font-semibold hover:underline">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
