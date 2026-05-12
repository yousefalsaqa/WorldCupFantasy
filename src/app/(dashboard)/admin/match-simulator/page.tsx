'use client';

// ============================================
// ADMIN — MATCH SIMULATOR
//
// Drives /api/admin/match-simulator to mark any Match as live, seed
// fake PlayerPerformance rows, tick to bump stats, then finish to flow
// points into SquadPlayer.points + Team.totalPoints. Lets us test the
// full live → FT flow + the /squad live pill + the player modal
// breakdowns WITHOUT touching API-Football.
//
// Workflow:
//   1. Pick a match from the dropdown.
//   2. Click "Seed lineup" — auto-fills 5 home-nation + 5 away-nation
//      players from the admin's own squad if any play for those nations
//      (so the green pill actually shows up on /squad). Otherwise picks
//      any 10 players for the two nations.
//   3. Click "Go LIVE" — flips Match.isStarted=true, creates perf rows.
//   4. Click "Tick (random)" — adds 1 minute, randomly bumps stats for
//      seeded players. Repeat as many times as you want.
//   5. Click "Finish" — flips to FT, triggers updateSquadPoints flow.
//   6. Click "Reset" — wipes perf rows + match flags so you can re-run.
// ============================================

import { useCallback, useEffect, useMemo, useState } from 'react';

interface SimMatch {
  id: string;
  stageId: string;
  stageName: string;
  homeNation: { code: string; name: string };
  awayNation: { code: string; name: string };
  kickoffTime: string;
  homeScore: number | null;
  awayScore: number | null;
  isStarted: boolean;
  isFinished: boolean;
  performanceCount: number;
  liveCount: number;
}
interface SimPlayer {
  id: string;
  displayName: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  nationCode: string | null;
  nationName: string | null;
}
interface AdminSquadEntry {
  playerId: string;
  displayName: string;
  position: string;
  nationCode?: string;
  isStarting: boolean;
  isCaptain: boolean;
  points: number;
}

export default function MatchSimulatorPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [matches, setMatches] = useState<SimMatch[]>([]);
  const [adminSquad, setAdminSquad] = useState<AdminSquadEntry[]>([]);
  const [allPlayers, setAllPlayers] = useState<SimPlayer[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');

  // Local seed lineup (10 players, 5 per nation) that's about to be
  // written to the DB when admin clicks "Go LIVE".
  const [seedLineup, setSeedLineup] = useState<SimPlayer[]>([]);

  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) ?? null,
    [matches, selectedMatchId]
  );

  const loadContext = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/admin/match-simulator?action=context', { credentials: 'include' });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setMatches(data.matches || []);
      setAdminSquad(data.adminSquad || []);
      setAllPlayers(data.allPlayers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadContext(); }, [loadContext]);

  // After every action we just reload the context (cheap) so the
  // match dropdown reflects new perf counts + live status. Per-player
  // breakdowns are visible in the squad page modal, not here.
  const refresh = useCallback(async () => {
    await loadContext();
  }, [loadContext]);

  const onMatchChange = (id: string) => {
    setSelectedMatchId(id);
    setSeedLineup([]);
  };

  // Build a sensible default lineup: first 5 admin-squad players from
  // each nation if available, otherwise top-N players by alphabetical
  // order from the all-players list (filtered by nation).
  const seedDefaultLineup = () => {
    if (!selectedMatch) return;
    const home = selectedMatch.homeNation.code;
    const away = selectedMatch.awayNation.code;

    const adminByNation = (code: string) => {
      const ids = new Set(
        adminSquad
          .filter((sp) => sp.nationCode === code)
          .map((sp) => sp.playerId)
      );
      return allPlayers.filter((p) => ids.has(p.id));
    };

    const fillFromNation = (code: string): SimPlayer[] => {
      const fromAdmin = adminByNation(code);
      if (fromAdmin.length >= 5) return fromAdmin.slice(0, 5);
      const rest = allPlayers
        .filter((p) => p.nationCode === code && !fromAdmin.find((a) => a.id === p.id))
        .slice(0, 5 - fromAdmin.length);
      return [...fromAdmin, ...rest];
    };

    setSeedLineup([...fillFromNation(home), ...fillFromNation(away)]);
    setStatusMsg(`Seeded ${10} players — ${fillFromNation(home).filter((p) => adminSquad.find((sp) => sp.playerId === p.id)).length} from your squad`);
  };

  // Send a POST to the simulator endpoint with given body.
  const post = async (body: Record<string, unknown>): Promise<unknown> => {
    const res = await fetch('/api/admin/match-simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Status ${res.status}`);
    }
    return res.json();
  };

  const onGoLive = async () => {
    if (!selectedMatchId || seedLineup.length === 0) return;
    setStatusMsg('Starting match...');
    try {
      // Seed each player with 1 minute played, no stats yet. We'll
      // build them up via ticks.
      const seeds = seedLineup.map((p) => ({
        playerId: p.id,
        minutesPlayed: 1,
      }));
      await post({ action: 'start', matchId: selectedMatchId, seeds, currentMinute: 1 });
      setStatusMsg('Match is LIVE. Click Tick to bump stats.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start');
    }
  };

  const onTick = async () => {
    if (!selectedMatchId || seedLineup.length === 0) return;
    setStatusMsg('Ticking...');
    try {
      // Bump minutesPlayed by 5 for everyone, and randomly hand out 1-2
      // stat events to a couple of players. Keeps the demo lively
      // without overwhelming the breakdown.
      const eventTargets = [...seedLineup].sort(() => Math.random() - 0.5).slice(0, 3);
      const deltas = seedLineup.map((p) => {
        const base: Record<string, unknown> = { playerId: p.id, minutesPlayed: 5 };
        if (eventTargets.includes(p)) {
          // Random event by position
          const roll = Math.random();
          if (p.position === 'FWD' && roll < 0.5) {
            base.goals = 1;
          } else if (p.position === 'MID' && roll < 0.4) {
            base.assists = 1;
          } else if ((p.position === 'DEF' || p.position === 'GK') && roll < 0.7) {
            base.defensiveActions = Math.floor(Math.random() * 3) + 1;
          } else if (roll < 0.15) {
            base.yellowCards = 1;
          } else if (p.position === 'GK') {
            base.saves = Math.floor(Math.random() * 2) + 1;
          }
        }
        return base;
      });

      const currentMinute = Math.min((selectedMatch?.homeScore ?? 0) + 5, 90); // mostly ignored, just for visual
      await post({
        action: 'tick',
        matchId: selectedMatchId,
        deltas,
        currentMinute: ((selectedMatch?.kickoffTime ? 0 : 0) + 5),
      });
      setStatusMsg('Tick complete. Refresh the squad page to see live pill update.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to tick');
    }
  };

  const onFinish = async () => {
    if (!selectedMatchId) return;
    setStatusMsg('Finishing match...');
    try {
      await post({ action: 'finish', matchId: selectedMatchId });
      setStatusMsg('Match FT. Points banked to SquadPlayer.points + Team.totalPoints.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finish');
    }
  };

  const onReset = async () => {
    if (!selectedMatchId) return;
    if (!confirm('Wipe all PlayerPerformance rows for this match and reset its flags?\n\nNote: This does NOT roll back SquadPlayer.points that were already banked by a previous Finish.')) {
      return;
    }
    setStatusMsg('Resetting...');
    try {
      await post({ action: 'reset', matchId: selectedMatchId });
      setStatusMsg('Match reset to pre-kickoff.');
      setSeedLineup([]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-black">Match Simulator</h1>
          <p className="text-white/50 text-sm mt-1">
            Fake a live match end-to-end. Pick a match, seed a lineup, tick stats, finish to bank points. Zero API-Football quota used.
          </p>
        </header>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-200 text-sm">{error}</div>
        )}
        {statusMsg && (
          <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/40 text-sky-200 text-sm">{statusMsg}</div>
        )}

        <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white/60">1 · Pick a match</h2>
          {loading ? (
            <div className="text-white/40 text-sm">Loading matches…</div>
          ) : (
            <select
              value={selectedMatchId}
              onChange={(e) => onMatchChange(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— Select a match —</option>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  [{m.stageId}] {m.homeNation.code} vs {m.awayNation.code} · {new Date(m.kickoffTime).toLocaleDateString()}
                  {m.isFinished ? ' · FT' : m.isStarted ? ` · LIVE (${m.liveCount}/${m.performanceCount})` : ''}
                </option>
              ))}
            </select>
          )}

          {selectedMatch && (
            <div className="flex items-center gap-3 text-xs text-white/60 pt-2">
              <span>{selectedMatch.stageName}</span>
              <span>·</span>
              <span className={`font-bold ${
                selectedMatch.isFinished ? 'text-amber-400' :
                selectedMatch.isStarted ? 'text-emerald-400' : 'text-white/40'
              }`}>
                {selectedMatch.isFinished ? 'FT' : selectedMatch.isStarted ? 'LIVE' : 'Not started'}
              </span>
              {selectedMatch.homeScore != null && (
                <>
                  <span>·</span>
                  <span className="font-mono">{selectedMatch.homeScore} - {selectedMatch.awayScore}</span>
                </>
              )}
              <span>·</span>
              <span>{selectedMatch.performanceCount} perf rows ({selectedMatch.liveCount} live)</span>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white/60">2 · Seed lineup</h2>
          <p className="text-white/50 text-xs">
            Auto-picks 5 players per nation. Prefers players from your own squad so the green
            livePoints pill on /squad lights up.
          </p>
          <button
            type="button"
            onClick={seedDefaultLineup}
            disabled={!selectedMatch}
            className="px-3 py-2 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-200 text-sm font-bold hover:bg-sky-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Seed lineup
          </button>

          {seedLineup.length > 0 && (
            <div className="rounded-lg border border-white/10 divide-y divide-white/5 overflow-hidden mt-2">
              {seedLineup.map((p) => {
                const inSquad = adminSquad.some((sp) => sp.playerId === p.id);
                return (
                  <div key={p.id} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                    <span className="font-mono text-white/40 w-6">{p.position}</span>
                    <span className="font-mono text-white/40 w-8">{p.nationCode}</span>
                    <span className="text-white flex-1 truncate">{p.displayName}</span>
                    {inSquad && (
                      <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">In your squad</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setSeedLineup((prev) => prev.filter((x) => x.id !== p.id))}
                      className="text-white/30 hover:text-rose-400 text-xs"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white/60">3 · Run the match</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onGoLive}
              disabled={!selectedMatchId || seedLineup.length === 0 || (selectedMatch?.isStarted ?? false)}
              className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 font-bold hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Go LIVE
            </button>
            <button
              type="button"
              onClick={onTick}
              disabled={!selectedMatch?.isStarted || (selectedMatch?.isFinished ?? false)}
              className="px-4 py-2 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-200 font-bold hover:bg-sky-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Tick (random events)
            </button>
            <button
              type="button"
              onClick={onFinish}
              disabled={!selectedMatch?.isStarted || (selectedMatch?.isFinished ?? false)}
              className="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 font-bold hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Finish (bank points)
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={!selectedMatchId}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white/60 font-bold hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset
            </button>
          </div>

          <p className="text-white/40 text-xs leading-relaxed">
            After Go LIVE → open /squad in another tab and watch the green pill appear on seeded players.
            Click a player card → see the live match in their history with a clickable points breakdown.
            Click Finish → the pill stops pulsing and the points lock into SquadPlayer.points.
          </p>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white/60">4 · Multiple simultaneous matches</h2>
          <p className="text-white/50 text-xs">
            Start one match, leave it on LIVE, then come back here, pick a SECOND match (different stage or
            nations), and Go LIVE on it too. The /squad page polls all live matches at once — the live pill
            on each player will reflect their contributions across all live matches their nation is in.
          </p>
        </section>
      </div>
    </div>
  );
}
