'use client';

// ============================================
// LeagueTeamViewPage — read-only mirror of /squad for OTHER managers.
//
// The user opens this from /leagues/[id] (clicking a row in the table).
// It uses the SAME PlayerCard component and the SAME PlayerDetailModal
// as /squad so we don't drift visually. The differences vs. /squad are:
//
//   1. Read-only: the modal opens in `readOnly` mode → no Sub / Captain /
//      V-Capt buttons; status badges instead.
//   2. No transfer mode, no chip activation, no formation/captaincy
//      mutations. The header strips the cogs and shows total points only.
//   3. Captain ×2 / ×3 visual badge surfaces this team's chip state, so
//      a friend's Triple Captain shows ×3 even though it's not the
//      viewer's team. This was the user-reported bug ("calculator was
//      right but team view showed ×1").
//   4. Live polling: every 60s while `anyMatchLive`, re-pull the squad
//      endpoint so pills tick up in real time.
// ============================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import { PlayerCard } from '@/components/kit';
import PlayerDetailModal, { type ModalPlayer } from '@/components/player-detail-modal';
import { getFixtureDifficulty, type FDR } from '@/lib/fdr';
import { getNextWcFixtures } from '@/lib/world-cup-fixtures';

interface ApiPlayer {
  id: string;
  displayName: string;
  position: string;
  shirtNumber: number | null;
  photoUrl?: string | null;
  /** Finalized points (written at FT). */
  points: number;
  /** Finalized + in-progress points; used as the pill value while a
   * match is live. Falls back to `points` if absent. */
  livePoints?: number;
  isStarting: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  benchOrder: number | null;
  nation: {
    name: string;
    code: string;
    kitColor1: string;
    kitColor2: string;
    flagUrl: string;
  };
}

interface TeamData {
  teamId: string;
  teamName: string;
  managerName: string;
  totalPoints: number;
  /** Banked + in-progress points (server-computed, chip-aware). Falls
   * back to `totalPoints` if absent; equals it when nothing is live. */
  liveTotalPoints?: number;
  starting: ApiPlayer[];
  bench: ApiPlayer[];
  activeChips?: string[];
  tripleCaptainActive?: boolean;
  benchBoostActive?: boolean;
  anyMatchLive?: boolean;
  /** Joined after the active stage's deadline: player points show but the
   * total/rank are frozen this stage. */
  isLate?: boolean;
  lockedStageName?: string | null;
  nextCountingStageName?: string | null;
}

// Convert the API row → the shape PlayerCard expects. Centralized so
// the pitch + bench + modal all see exactly the same data.
function toCardPlayer(p: ApiPlayer) {
  return {
    id: p.id,
    displayName: p.displayName,
    position: p.position,
    shirtNumber: p.shirtNumber,
    photoUrl: p.photoUrl,
    nation: {
      code: p.nation.code,
      name: p.nation.name,
      kitColor1: p.nation.kitColor1,
      kitColor2: p.nation.kitColor2,
    },
  };
}

function toModalPlayer(p: ApiPlayer): ModalPlayer {
  return {
    id: p.id,
    displayName: p.displayName,
    position: p.position,
    shirtNumber: p.shirtNumber,
    photoUrl: p.photoUrl,
    // Use the live-overlay value so the modal's points tile shows what
    // the pill on the pitch is showing. The Match History panel inside
    // the modal pulls real per-match perfs separately.
    points: p.livePoints ?? p.points,
    nation: {
      code: p.nation.code,
      name: p.nation.name,
      kitColor1: p.nation.kitColor1,
      kitColor2: p.nation.kitColor2,
    },
  };
}

// Badge styling for every chip the read-only ribbon can surface. Previously
// only TC + BB were rendered, so a stacked 3-chip round (e.g. + Wildcard or
// Free Hit) showed as two. Driven off the team's full `activeChips` array.
const RIBBON_CHIPS: Record<string, { label: string; cls: string }> = {
  TRIPLE_CAPTAIN: { label: 'TRIPLE CAPTAIN ×3', cls: 'bg-amber-400/15 text-amber-300 ring-amber-400/40' },
  BENCH_BOOST: { label: 'BENCH BOOST', cls: 'bg-violet-400/15 text-violet-300 ring-violet-400/40' },
  WILDCARD_1: { label: 'WILDCARD', cls: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/40' },
  WILDCARD_2: { label: 'WILDCARD', cls: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/40' },
  FREE_HIT: { label: 'FREE HIT', cls: 'bg-sky-400/15 text-sky-300 ring-sky-400/40' },
};

export default function LeagueTeamViewPage({
  params,
}: {
  params: { teamId: string };
}) {
  // Next 14 passes params synchronously. (Next 15 wraps it in a Promise
  // and needs `use(params)`; revisit this when we upgrade.)
  const { teamId } = params;

  const [team, setTeam] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApiPlayer | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Poll state — we want a stable ref to the latest "is anything live"
  // signal so the interval callback doesn't re-bind on every fetch.
  const anyMatchLiveRef = useRef(false);

  // Fetch once on mount + retain a single shared fetcher for the poll.
  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch(`/api/team/${teamId}/squad`, { credentials: 'include' });
      if (!res.ok) {
        setError(res.status === 404 ? 'Team not found' : 'Failed to load team');
        return;
      }
      const data: TeamData = await res.json();
      setTeam(data);
      anyMatchLiveRef.current = data.anyMatchLive === true;
      setError(null);
    } catch (err) {
      console.error('Failed to fetch team:', err);
      setError('Failed to load team');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  // One-shot admin check — surfaces the per-adjustment Undo button
  // inside the shared modal. Failure is silent (defaults to non-admin).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        setIsAdmin(Boolean(data?.user?.isAdmin));
      } catch { /* non-fatal */ }
    })();
  }, []);

  // 60s live poll — gated by `anyMatchLive`. Mirrors the cadence on
  // /squad so the two pages stay in sync without hammering the DB.
  // We keep the poll lightweight (no abort controller because the
  // endpoint is idempotent and we don't care about over-fetch races —
  // newest response wins via setState).
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (!anyMatchLiveRef.current) return;
      try {
        const res = await fetch(`/api/team/${teamId}/squad`, { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data: TeamData = await res.json();
        setTeam(data);
        anyMatchLiveRef.current = data.anyMatchLive === true;
      } catch { /* non-fatal */ }
    };
    const id = setInterval(tick, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [teamId]);

  // Captain multiplier — ×3 if this team's TC chip is active, else ×2.
  // The /squad page applies the SAME logic to the same PlayerCard so
  // the pill values match across both views (this was the user's
  // friend's bug: TC was active but the team view defaulted to ×1).
  const captainMultiplier = team?.tripleCaptainActive ? 3 : 2;
  const tripleCaptainActive = team?.tripleCaptainActive === true;

  // Pre-compute the four position rows so the JSX below stays clean.
  const rows = useMemo(() => {
    if (!team) return { gks: [], defs: [], mids: [], fwds: [] };
    return {
      gks: team.starting.filter((p) => p.position === 'GK'),
      defs: team.starting.filter((p) => p.position === 'DEF'),
      mids: team.starting.filter((p) => p.position === 'MID'),
      fwds: team.starting.filter((p) => p.position === 'FWD'),
    };
  }, [team]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/60">Loading team…</p>
      </div>
    );
  }
  if (error || !team) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-white/60">{error ?? 'Team not found'}</p>
        <Link href="/leagues" className="text-emerald-400 underline text-sm">Back to leagues</Link>
      </div>
    );
  }

  // Render a single player's card on the pitch. Extracted so the four
  // position rows can call it uniformly and the modal-open click goes
  // through one path. Mirrors the renderPitchPlayer helper on /squad.
  const renderPitchPlayer = (p: ApiPlayer) => {
    const nextFixtures = getNextWcFixtures(p.nation.code, 1).map((fx) => ({
      ...fx,
      difficulty: getFixtureDifficulty(p.nation.code, fx.opponent) as FDR,
    }));
    const rawPoints = p.livePoints ?? p.points;
    const displayPoints = p.isCaptain ? rawPoints * captainMultiplier : rawPoints;
    return (
      <div key={p.id} className="flex-shrink-0 relative">
        <PlayerCard
          player={toCardPlayer(p)}
          nextFixtures={nextFixtures}
          livePoints={displayPoints}
          isCaptain={p.isCaptain}
          isViceCaptain={p.isViceCaptain}
          size="xs"
          onClick={() => setSelected(p)}
        />
        {p.isCaptain && rawPoints > 0 && (
          <span
            className={`absolute top-3 -left-1 z-20 px-1 h-[14px] rounded-full text-[8px] font-black tracking-tight flex items-center justify-center shadow ring-1 ${
              tripleCaptainActive
                ? 'bg-amber-400 text-amber-950 ring-amber-200'
                : 'bg-yellow-500 text-yellow-950 ring-yellow-300/70'
            }`}
            aria-label={tripleCaptainActive ? 'Triple Captain ×3' : 'Captain ×2'}
          >
            ×{captainMultiplier}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-0 sm:px-4" style={{ overflowX: 'visible' }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-rose-500 to-pink-500 p-4 flex items-center justify-between rounded-t-2xl">
        <Link
          href="/leagues"
          className="flex items-center gap-1 text-white hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back</span>
        </Link>

        <div className="text-center min-w-0 px-2">
          <h1 className="text-base sm:text-xl font-bold text-white truncate">{team.teamName}</h1>
          <p className="text-white/80 text-xs sm:text-sm truncate">@{team.managerName}</p>
        </div>

        <div className={`rounded-lg px-3 py-1 shrink-0 flex items-center gap-1.5 ${
          (team.liveTotalPoints ?? team.totalPoints) > team.totalPoints
            ? 'bg-emerald-500/25 ring-1 ring-emerald-400/50'
            : 'bg-white/20'
        }`}>
          {(team.liveTotalPoints ?? team.totalPoints) > team.totalPoints && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
          )}
          <span className="text-white font-bold text-sm">
            {team.liveTotalPoints ?? team.totalPoints} pts
          </span>
        </div>
      </div>

      {/* Read-only ribbon — communicates intent + surfaces any active
          chip badges (e.g. ×3 Triple Captain, Bench Boost) so the
          viewer understands the multipliers shown on the pitch. */}
      <div className="bg-slate-900/80 border-x border-white/10 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider font-bold text-white/40">
          Read-only view
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Every active chip — driven off the full activeChips array so a
              stacked round (TC + BB + Wildcard/Free Hit) shows all of them.
              Falls back to the TC/BB booleans if activeChips is absent. */}
          {(team.activeChips && team.activeChips.length > 0
            ? team.activeChips
            : [
                ...(tripleCaptainActive ? ['TRIPLE_CAPTAIN'] : []),
                ...(team.benchBoostActive ? ['BENCH_BOOST'] : []),
              ]
          ).map((c) => {
            const b = RIBBON_CHIPS[c];
            return b ? (
              <span key={c} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ring-1 ${b.cls}`}>
                {b.label}
              </span>
            ) : null;
          })}
          {team.anyMatchLive && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold ring-1 ring-emerald-400/40">
              <span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" />
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* Late-joiner note — explains why a team with scoring players still
          shows a 0 total this round (player points are provisional). */}
      {team.isLate && (
        <div className="bg-amber-500/10 border-x border-amber-500/30 px-3 py-2 flex items-start gap-2">
          <Lock className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" strokeWidth={2.5} />
          <p className="text-amber-100/80 text-[11px] leading-snug">
            <span className="font-bold text-amber-200">
              Joined late{team.lockedStageName ? ` — after the ${team.lockedStageName} deadline` : ''}.
            </span>{' '}
            Player points are shown but don&apos;t count toward the total or league rank this round
            {team.nextCountingStageName ? ` — they start counting from ${team.nextCountingStageName}` : ''}.
          </p>
        </div>
      )}

      {/* Pitch — single scroll container at the outer wrapper. We
          intentionally DO NOT put `overflow-x-auto` on each row: when
          both axes are set the browser clips Y too, which chops the
          top of the points pill that sits above each kit. Padding of
          `p-2 sm:p-6` mirrors /squad and gives the pill room to breathe. */}
      <div className="bg-gradient-to-b from-green-700 via-green-600 to-green-700 relative">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-16 border-2 border-white border-t-0" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-16 border-2 border-white border-b-0" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border-2 border-white rounded-full" />
          <div className="absolute top-1/2 left-0 right-0 border-t border-white" />
        </div>

        <div
          className="relative z-10 p-2 sm:p-6 space-y-4 sm:space-y-6 overflow-x-auto scrollbar-hide"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <PitchRow players={rows.fwds} renderPlayer={renderPitchPlayer} />
          <PitchRow players={rows.mids} renderPlayer={renderPitchPlayer} />
          <PitchRow players={rows.defs} renderPlayer={renderPitchPlayer} />
          <PitchRow players={rows.gks} renderPlayer={renderPitchPlayer} />
        </div>
      </div>

      {/* Bench — uses the shared PlayerCard at xs size for visual parity
          with the pitch but laid out in a 2-col grid like the legacy
          BenchCard. Tapping a bench card opens the same read-only modal. */}
      <div className={`p-3 sm:p-4 ${
        team.benchBoostActive
          ? 'bg-violet-500/10 border-2 border-violet-400/60 rounded-2xl mt-2 shadow-[0_0_22px_-6px_rgba(167,139,250,0.55)]'
          : 'bg-slate-900/50 border border-white/10 rounded-b-2xl'
      }`}>
        <h3 className="text-white/80 text-sm font-semibold mb-3 flex items-center gap-2">
          Substitutes
          {team.benchBoostActive && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-200 text-[9px] font-black ring-1 ring-violet-400/40">
              BENCH BOOST ON
            </span>
          )}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {team.bench.map((p, i) => {
            const rawPoints = p.livePoints ?? p.points;
            return (
              <div key={p.id} className="flex flex-col items-center gap-1 p-2 bg-white/5 rounded-xl">
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">
                  Sub {i + 1}
                </span>
                <PlayerCard
                  player={toCardPlayer(p)}
                  nextFixtures={getNextWcFixtures(p.nation.code, 1).map((fx) => ({
                    ...fx,
                    difficulty: getFixtureDifficulty(p.nation.code, fx.opponent) as FDR,
                  }))}
                  livePoints={rawPoints}
                  isCaptain={p.isCaptain}
                  isViceCaptain={p.isViceCaptain}
                  size="xs"
                  onClick={() => setSelected(p)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Shared read-only player detail modal. Same code path as /squad
          so any future changes to the modal (e.g. xG breakdowns) light
          up on this page automatically. */}
      {selected && (
        <PlayerDetailModal
          readOnly
          player={toModalPlayer(selected)}
          isCaptain={selected.isCaptain}
          isViceCaptain={selected.isViceCaptain}
          isStarting={selected.isStarting}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onAdjustmentReverted={fetchTeam}
        />
      )}
    </div>
  );
}

// Small wrapper around a pitch row. Kept inline because it's only used
// here and inlining made the JSX above hard to read. The `flex-shrink-0`
// + horizontal scroll behavior matches the /squad page exactly.
function PitchRow({
  players,
  renderPlayer,
}: {
  players: ApiPlayer[];
  renderPlayer: (p: ApiPlayer) => React.ReactNode;
}) {
  return (
    // NO overflow on the row itself — the outer pitch wrapper owns the
    // horizontal scroll. `min-w-max` lets the row grow wider than the
    // viewport on small screens (so the outer wrapper actually has
    // something to scroll) while staying centered on desktop.
    <div className="flex justify-center gap-1.5 sm:gap-6 min-w-max sm:min-w-0">
      {players.map(renderPlayer)}
    </div>
  );
}
