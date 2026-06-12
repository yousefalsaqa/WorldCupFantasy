'use client';

// ============================================
// ADMIN — PREDICTED LINEUPS
//
// Manual probable-XI entry (transcribed from editorial sources like
// FotMob). Pick a fixture, paste 11 names per side (one per line), hit
// Preview to see how each name resolved against that nation's squad,
// then Save. The fixture modal shows the prediction in its Lineups tab
// until API-Football publishes the official team sheets.
//
// Matching is server-side (shared with scripts/set-predicted-lineup.ts);
// ambiguous or unknown names block saving so a typo can't publish a
// 10-man lineup.
// ============================================

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface AdminMatch {
  id: string;
  kickoffTime: string;
  isStarted: boolean;
  isFinished: boolean;
  predictedLineups: string | null;
  homeNation: { name: string; code: string };
  awayNation: { name: string; code: string };
  stage: { name: string };
}

interface SideResult {
  nation: string;
  matched: Array<{ name: string; number: number | null; pos: string }>;
  unmatched: Array<{ name: string; reason: string }>;
}

export default function PredictedLineupsAdmin() {
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [matchId, setMatchId] = useState('');
  const [homeNames, setHomeNames] = useState('');
  const [awayNames, setAwayNames] = useState('');
  const [homeFormation, setHomeFormation] = useState('');
  const [awayFormation, setAwayFormation] = useState('');
  const [result, setResult] = useState<{ saved: boolean; home: SideResult; away: SideResult; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/fixtures');
        if (!res.ok) {
          setLoadError(res.status === 401 ? 'Admin access required' : 'Failed to load fixtures');
          return;
        }
        const data = await res.json();
        setMatches(data.matches || []);
      } catch {
        setLoadError('Failed to load fixtures');
      }
    })();
  }, []);

  // Upcoming first — that's what you set predictions for. Finished games
  // at the bottom in case a correction is ever needed.
  const sorted = useMemo(() => {
    const upcoming = matches.filter((m) => !m.isStarted);
    const past = matches.filter((m) => m.isStarted);
    return [...upcoming, ...past];
  }, [matches]);

  const selected = matches.find((m) => m.id === matchId) || null;

  const splitNames = (s: string) =>
    s.split('\n').map((l) => l.trim()).filter(Boolean);

  async function submit(dryRun: boolean) {
    if (!matchId) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/predicted-lineup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          home: { formation: homeFormation.trim() || undefined, names: splitNames(homeNames) },
          away: { formation: awayFormation.trim() || undefined, names: splitNames(awayNames) },
          dryRun,
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.saved) {
        // refresh the has-prediction indicator
        setMatches((prev) => prev.map((m) => m.id === matchId ? { ...m, predictedLineups: 'set' } : m));
      }
    } catch {
      setResult({ saved: false, error: 'Request failed', home: { nation: '', matched: [], unmatched: [] }, away: { nation: '', matched: [], unmatched: [] } });
    } finally {
      setBusy(false);
    }
  }

  async function clearPrediction() {
    if (!matchId || !confirm('Clear the saved prediction for this match?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/predicted-lineup?matchId=${encodeURIComponent(matchId)}`, { method: 'DELETE' });
      if (res.ok) {
        setMatches((prev) => prev.map((m) => m.id === matchId ? { ...m, predictedLineups: null } : m));
        setResult(null);
      }
    } finally {
      setBusy(false);
    }
  }

  function sideBox(label: string, names: string, setNames: (v: string) => void, formation: string, setFormation: (v: string) => void) {
    const count = splitNames(names).length;
    return (
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-white/60">{label}</span>
          <span className={`text-[10px] font-black ${count === 11 ? 'text-emerald-400' : 'text-amber-400'}`}>{count}/11</span>
        </div>
        <input
          value={formation}
          onChange={(e) => setFormation(e.target.value)}
          placeholder="Formation e.g. 4-3-3 (optional)"
          className="w-full mb-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-white/30 focus:outline-none focus:border-white/30"
        />
        <textarea
          value={names}
          onChange={(e) => setNames(e.target.value)}
          rows={12}
          placeholder={'One name per line, GK first:\nWilliams\nMudau\nSibisi\n…'}
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/25 focus:outline-none focus:border-white/30 font-mono"
        />
      </div>
    );
  }

  function resultBox(side: SideResult, label: string) {
    return (
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white/60 mb-1">{label} — {side.nation}</p>
        {side.matched.length > 0 && (
          <ul className="space-y-0.5 mb-2">
            {side.matched.map((p, i) => (
              <li key={i} className="text-xs text-emerald-300">
                ✓ <span className="text-white/40 font-mono">{p.number ?? '–'}</span> {p.name} <span className="text-white/30">{p.pos}</span>
              </li>
            ))}
          </ul>
        )}
        {side.unmatched.map((u, i) => (
          <p key={i} className="text-xs text-red-300">✗ {u.name} — {u.reason}</p>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin" className="text-white/40 text-sm hover:text-white">← Admin</Link>
        <h1 className="text-2xl font-black text-white mt-2">Predicted Lineups</h1>
        <p className="text-white/40 text-sm">
          Paste a probable XI per side (from FotMob etc.). Shown in the fixture modal until the official lineups drop.
        </p>
      </div>

      {loadError ? (
        <p className="text-red-300">{loadError}</p>
      ) : (
        <div className="space-y-4">
          <select
            value={matchId}
            onChange={(e) => { setMatchId(e.target.value); setResult(null); }}
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm cursor-pointer"
          >
            <option value="" className="bg-slate-900">Select a fixture…</option>
            {sorted.map((m) => (
              <option key={m.id} value={m.id} className="bg-slate-900">
                {m.homeNation.code} vs {m.awayNation.code} — {new Date(m.kickoffTime).toLocaleString()} ({m.stage.name})
                {m.predictedLineups ? ' ✓ has prediction' : ''}{m.isStarted ? ' [started]' : ''}
              </option>
            ))}
          </select>

          {selected && (
            <>
              <div className="flex flex-col sm:flex-row gap-4">
                {sideBox(`${selected.homeNation.name} (home)`, homeNames, setHomeNames, homeFormation, setHomeFormation)}
                {sideBox(`${selected.awayNation.name} (away)`, awayNames, setAwayNames, awayFormation, setAwayFormation)}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => submit(true)}
                  disabled={busy}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-bold disabled:opacity-40"
                >
                  Preview matching
                </button>
                <button
                  onClick={() => submit(false)}
                  disabled={busy}
                  className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 text-sm font-bold disabled:opacity-40"
                >
                  Save prediction
                </button>
                {selected.predictedLineups && (
                  <button
                    onClick={clearPrediction}
                    disabled={busy}
                    className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-300 text-sm font-bold disabled:opacity-40"
                  >
                    Clear saved prediction
                  </button>
                )}
              </div>
            </>
          )}

          {result && (
            <div className={`p-4 rounded-xl border ${result.saved ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-white/5 border-white/10'}`}>
              <p className={`text-sm font-bold mb-3 ${result.saved ? 'text-emerald-300' : result.error ? 'text-red-300' : 'text-white/70'}`}>
                {result.saved ? '✓ Prediction saved — live in the fixture modal now' : result.error || 'Preview (nothing saved yet)'}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                {resultBox(result.home, 'Home')}
                {resultBox(result.away, 'Away')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
