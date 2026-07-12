'use client';

// ============================================
// PlayerDetailModal — the popup that opens when a user taps a player
// card. Used in TWO places:
//
//   1. /squad — for the user's own team. `actions` mode shows the
//      Sub / Captain / V-Captain buttons + admin Undo on Adjustments.
//
//   2. /leagues/team/[teamId] — for someone ELSE's team. `readOnly`
//      mode replaces the action buttons with status badges (CAPTAIN /
//      VICE / STARTING / BENCH) so the team-view is purely look-but-
//      don't-touch. The admin Undo is still surfaced (an admin can
//      legitimately want to revert an emergency override applied to
//      another user's player).
//
// What the modal owns end-to-end:
//   - Body scroll lock while open.
//   - Fetching `/api/players/[id]/performances` for Match History +
//     points breakdown + recent Adjustments.
//   - Click-to-expand a perf row for the per-category breakdown.
//   - Admin-only Undo on Adjustment rows (DELETE /api/admin/override).
//
// What the modal does NOT own (passed in by the parent):
//   - Whether THIS player is captain / vice (parent has the canonical
//     captaincy state via captainId / viceCaptainId).
//   - The Sub / Captain / V-Captain callbacks in interactive mode.
//   - The `isAdmin` flag (parent already fetches /api/auth/me once on
//     mount; re-fetching here would double the call).
// ============================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import Kit from '@/components/kit';
import { getFlagUrl } from '@/lib/flags';
import { fdrPill, getFixtureDifficulty } from '@/lib/fdr';
import { getNextWcOpponent, getNextWcFixture, getNextWcFixtures } from '@/lib/world-cup-fixtures';

// Per-match performance payload. Mirrors the GET /api/players/[id]/performances
// response shape one-for-one — kept here so both call sites import
// the same authoritative type.
export interface BreakdownLine {
  label: string;
  points: number;
  detail?: string;
}
export interface PlayerPerformancePayload {
  id: string;
  matchId: string;
  isLive: boolean;
  lastUpdated: string | null;
  /** Finished match the player's nation played but he didn't feature in
   * (0 minutes, or no perf row at all). Rendered as a muted "DNP" row. */
  didNotPlay?: boolean;
  match: {
    id: string;
    stageId: string;
    stageName: string;
    kickoffTime: string;
    homeNation: { code: string; name: string };
    awayNation: { code: string; name: string };
    homeScore: number | null;
    awayScore: number | null;
    isFinished: boolean;
    isStarted: boolean;
    currentMinute: number | null;
  };
  stats: {
    minutesPlayed: number;
    goals: number;
    assists: number;
    cleanSheet: boolean;
    goalsConceeded: number;
    saves: number;
    penaltiesSaved: number;
    penaltiesMissed: number;
    yellowCards: number;
    redCards: number;
    ownGoals: number;
    defensiveActions: number;
    bonusPoints: number;
  };
  breakdown: { lines: BreakdownLine[]; total: number };
  totalPoints: number;
}

export interface PlayerAdjustmentPayload {
  id: string;
  action: string;
  createdAt: string;
  pointsAdded?: number;
  reason?: string;
  matchId: string | null;
}

export interface ModalPlayer {
  id: string;
  displayName: string;
  position: string;
  shirtNumber: number | null;
  photoUrl?: string | null;
  /** Raw per-player points (live perf added in by the caller). */
  points?: number;
  /** True when this player's nation is currently playing — drives the LIVE pill. */
  nation?: {
    code: string;
    name: string;
    kitColor1: string;
    kitColor2: string;
  };
  stats?: {
    goals: number;
    assists: number;
    passAccuracy: number;
    interceptions: number;
    tackles: number;
    dribbles: number;
  };
}

interface BaseProps {
  player: ModalPlayer;
  isCaptain: boolean;
  isViceCaptain: boolean;
  /** True if player is in the starting XI. Drives the read-only status badge. */
  isStarting: boolean;
  /** Admin flag — controls visibility of the per-adjustment Undo button. */
  isAdmin: boolean;
  onClose: () => void;
  /**
   * Called after a successful admin Undo so the parent page can refresh
   * its own squad/team data (pills, totals, etc.). The modal already
   * refreshes its OWN performances + adjustments internally — this
   * hook is purely for the parent's side effects (e.g. re-pulling
   * /api/squad/get so the green pill on each player card decrements).
   */
  onAdjustmentReverted?: () => void;
}

type InteractiveProps = BaseProps & {
  readOnly?: false;
  /** Tapped player ID if a sub-swap is in progress, for the swap hint. */
  subTargetName?: string | null;
  /** Highlighted when this player IS the swap target. */
  isSubTarget?: boolean;
  onSub: () => void;
  onSetCaptain: () => void;
  onSetViceCaptain: () => void;
  onCancelSub?: () => void;
};

type ReadOnlyProps = BaseProps & {
  readOnly: true;
  /** Hide the Role/Capt/V-Capt badges. For players inspected from the
   * squad-builder picker, who aren't in any squad — a "BENCH" role badge
   * there would be nonsense (it describes fantasy-squad role, not
   * real-life selection). */
  hideRole?: boolean;
};

export type PlayerDetailModalProps = InteractiveProps | ReadOnlyProps;

export default function PlayerDetailModal(props: PlayerDetailModalProps) {
  const { player, isCaptain, isViceCaptain, isStarting, isAdmin, onClose, onAdjustmentReverted } = props;
  const readOnly = props.readOnly === true;

  const [performances, setPerformances] = useState<PlayerPerformancePayload[] | null>(null);
  // Upcoming (not-finished) matches for this player's nation, from the DB.
  // Authoritative for the NEXT badge + Upcoming strip — covers confirmed
  // knockout games the static fixture lib can't resolve. Null until loaded.
  const [upcoming, setUpcoming] = useState<
    Array<{ matchId: string; opponent: string; isHome: boolean; kickoff: string; stageId: string; stageName: string }> | null
  >(null);
  const [adjustments, setAdjustments] = useState<PlayerAdjustmentPayload[]>([]);
  // Nation tournament-progress state, captured from the performances fetch
  // (player.nation carries isEliminated + eliminatedAt). Drives the journey track.
  const [nationElim, setNationElim] = useState<{ isEliminated: boolean; eliminatedAt: string | null }>(
    { isEliminated: false, eliminatedAt: null },
  );
  const [nationGroup, setNationGroup] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  // Body scroll lock while open. Keep it minimal — the previous
  // `position:fixed + scrollTo` dance was a known iOS Safari freeze
  // trigger, so we stick with `overflow:hidden`.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Fetch performances + adjustments whenever the player changes.
  // Endpoint already handles permissioning (it's a per-player read,
  // not auth-against-this-player) so it works for any team's player.
  const reloadPerfs = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExpandedId(null);
    try {
      const res = await fetch(`/api/players/${player.id}/performances`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setPerformances(data.performances || []);
      setUpcoming(data.upcoming || []);
      setAdjustments(data.adjustments || []);
      setNationElim({
        isEliminated: Boolean(data.player?.nation?.isEliminated),
        eliminatedAt: data.player?.nation?.eliminatedAt ?? null,
      });
      setNationGroup(data.player?.nation?.group ?? null);
    } catch (err) {
      console.error('Failed to load performances:', err);
      setError('Failed to load match history');
      setPerformances([]);
      setUpcoming(null);
      setAdjustments([]);
    } finally {
      setLoading(false);
    }
  }, [player.id]);

  useEffect(() => { reloadPerfs(); }, [reloadPerfs]);

  // Season-aggregate stats are derived from the same PlayerPerformance
  // rows we already fetch for the Match History table below — no extra
  // network call needed. While performances are still loading we show
  // em-dashes so the tiles don't flash 0 → real.
  const seasonStats = useMemo(() => {
    const perfs = performances ?? [];
    const sum = (k: 'goals' | 'assists' | 'defensiveActions' | 'minutesPlayed') =>
      perfs.reduce((n, p) => n + (p.stats[k] || 0), 0);
    return {
      goals: sum('goals'),
      assists: sum('assists'),
      apps: perfs.filter((p) => p.stats.minutesPlayed > 0).length,
      minutes: sum('minutesPlayed'),
      defensiveActions: sum('defensiveActions'),
      cleanSheets: perfs.filter((p) => p.stats.cleanSheet).length,
    };
  }, [performances]);
  const statsLoading = loading && performances === null;

  const handleUndoAdjustment = async (auditId: string) => {
    if (undoingId) return;
    if (!confirm('Reverse this points adjustment? The player + team totals will be decremented.')) return;
    setUndoingId(auditId);
    try {
      const res = await fetch(`/api/admin/override?auditId=${encodeURIComponent(auditId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        alert((data as { error?: string }).error || `Failed to undo (status ${res.status})`);
        return;
      }
      // Pull fresh — the DELETE writes a paired REVERTED audit row
      // server-side, but the endpoint also filters reverted rows out
      // so we get a clean current-state list.
      await reloadPerfs();
      // Let the parent know so it can re-pull its squad/team data and
      // refresh the per-card pills. Squad page repulls /api/squad/get;
      // league team-view repulls /api/team/[teamId]/squad.
      onAdjustmentReverted?.();
    } catch (err) {
      console.error('Undo failed:', err);
      alert('Undo failed — check your connection and try again.');
    } finally {
      setUndoingId(null);
    }
  };

  const nationCode = player.nation?.code || '';
  // Prefer the DB's upcoming matches (authoritative — resolves confirmed
  // knockout opponents the static lib can't). Fall back to the static fixture
  // lib while the fetch is in flight or if it returned nothing (so group-stage
  // behaviour is unchanged on first paint).
  //
  // getNextWcOpponent falls back to the LAST fixture it can match by nation
  // code when it finds no future one — correct for a genuinely eliminated
  // team (their last opponent is meaningful), but wrong mid-tournament: the
  // static file stores knockout rounds as bracket placeholders ("W M99")
  // that never match a real code, so a still-alive team whose next-round
  // fixture just hasn't synced to the DB yet would show its OLD (already
  // played) opponent as "Next". Only use that fallback once the nation is
  // confirmed eliminated; otherwise show nothing until the DB has it.
  const dbUpcoming = upcoming && upcoming.length > 0 ? upcoming : null;
  const opponent = dbUpcoming
    ? dbUpcoming[0].opponent
    : nationElim.isEliminated
      ? getNextWcOpponent(nationCode)
      : null;
  const fdr = opponent ? getFixtureDifficulty(nationCode, opponent) : null;
  // Kickoff of the next fixture, shown in the viewer's local timezone.
  // null when the nation has no upcoming game (opponent then falls back
  // to the LAST opponent faced — a date would be misleading there).
  const nextKickoff = dbUpcoming
    ? new Date(dbUpcoming[0].kickoff)
    : (getNextWcFixture(nationCode)?.kickoff ?? null);
  // Next few fixtures for the "Upcoming" run strip — opponent + FDR each.
  const nextFixtures = (
    dbUpcoming
      ? dbUpcoming.map((m) => ({ opponent: m.opponent, isHome: m.isHome }))
      : getNextWcFixtures(nationCode)
  ).map((fx) => ({
    ...fx,
    difficulty: getFixtureDifficulty(nationCode, fx.opponent),
  }));

  // ---- Tournament-journey track states (GR → R32 → … → 🏆) ----
  const reached = new Set<number>([0]); // groups always reached
  (performances || []).forEach((p) => {
    const idx = toTrackIdx(p.match?.stageId);
    if (idx >= 0) reached.add(idx);
  });
  (upcoming || []).forEach((u) => {
    const idx = toTrackIdx(u.stageId);
    if (idx >= 0) reached.add(idx);
  });
  const furthestIdx = Math.max(...Array.from(reached));
  const upcomingIdxs = (upcoming || []).map((u) => toTrackIdx(u.stageId)).filter((i) => i >= 0);
  const nextIdx = upcomingIdxs.length ? Math.min(...upcomingIdxs) : null;

  const trackStates: PipState[] = (() => {
    if (nationElim.isEliminated) {
      const exit = nationElim.eliminatedAt;
      const lastDone = exit && exit.startsWith('GR') ? 0 : (toTrackIdx(exit) >= 0 ? toTrackIdx(exit) : furthestIdx);
      const outIdx = Math.min(lastDone + 1, TRACK_IDS.length - 1);
      return TRACK_IDS.map((_, i) => (i <= lastDone ? 'done' : i === outIdx ? 'out' : 'future'));
    }
    const current = nextIdx != null ? nextIdx : furthestIdx;
    return TRACK_IDS.map((_, i) => (i < current ? 'done' : i === current ? 'current' : 'future'));
  })();

  return (
    <div
      className="fixed inset-0 bg-black/80 z-[9999] backdrop-blur-sm flex items-start sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        // Anchor to the top (below the sticky nav) on phones so the header
        // never clips when the modal GROWS — e.g. expanding a match-history
        // row, or iOS collapsing the address bar. A centered modal grew
        // symmetrically and pushed its top off-screen. Desktop re-centers.
        paddingTop: 'calc(env(safe-area-inset-top) + 4.5rem)',
        paddingLeft: '16px',
        paddingRight: '16px',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
        overflow: 'hidden',
      }}
    >
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl max-h-[82dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 p-4 rounded-t-2xl overflow-hidden">
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.06) 0 8%, rgba(0,0,0,0.10) 8% 16%)',
            }}
          />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 text-white bg-black/70 hover:bg-black p-2 rounded-full transition-all touch-manipulation shadow-lg"
            style={{ minWidth: '36px', minHeight: '36px', WebkitTapHighlightColor: 'transparent' }}
          >
            <X className="w-4 h-4" />
          </button>

          <div className="relative flex items-center gap-3 pr-10">
            {player.photoUrl ? (
              <div
                className="relative w-14 h-14 rounded-xl p-[2px] shrink-0 shadow-[0_4px_14px_rgba(0,0,0,0.4)]"
                style={{
                  background: `linear-gradient(160deg, ${player.nation?.kitColor1 || '#334155'} 0%, ${player.nation?.kitColor2 || '#0f172a'} 110%)`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={player.photoUrl}
                  alt=""
                  className="w-full h-full rounded-[10px] object-cover object-top bg-slate-800"
                />
                {(isCaptain || isViceCaptain) && (
                  <div className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full flex items-center justify-center ring-2 shadow-lg ${
                    isCaptain
                      ? 'bg-gradient-to-br from-yellow-300 to-amber-500 ring-yellow-200/80'
                      : 'bg-gradient-to-br from-gray-200 to-gray-400 ring-white/70'
                  }`}>
                    <span className="text-[10px] font-black text-black">{isCaptain ? 'C' : 'V'}</span>
                  </div>
                )}
              </div>
            ) : (
              <Kit
                primaryColor={player.nation?.kitColor1 || '#FFF'}
                secondaryColor={player.nation?.kitColor2 || '#000'}
                number={player.shirtNumber}
                nationCode={player.nation?.code || ''}
                size="xs"
                isCaptain={isCaptain}
                isViceCaptain={isViceCaptain}
              />
            )}
            <div className="text-white flex-1 min-w-0">
              <h2 className="text-lg font-black leading-tight truncate">{player.displayName}</h2>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="inline-flex items-center gap-1 px-1.5 py-[2px] rounded-md bg-white/10 ring-1 ring-white/15">
                  <img src={getFlagUrl(player.nation?.code || '')} alt="" className="w-3.5 h-2.5 rounded-[1px] object-cover" />
                  <span className="text-white text-[10px] font-bold">{player.nation?.code}</span>
                </span>
                {nationGroup && (
                  <span className="px-1.5 py-[2px] rounded-md text-[10px] font-bold bg-white/10 ring-1 ring-white/15 text-white/80">
                    Group {nationGroup}
                  </span>
                )}
                <span className={`px-1.5 py-[2px] rounded-md text-[10px] font-black ${
                  player.position === 'GK' ? 'bg-amber-500/30 text-amber-200 ring-1 ring-amber-400/40' :
                  player.position === 'DEF' ? 'bg-sky-500/30 text-sky-200 ring-1 ring-sky-400/40' :
                  player.position === 'MID' ? 'bg-emerald-500/30 text-emerald-200 ring-1 ring-emerald-400/40' :
                  'bg-rose-500/30 text-rose-200 ring-1 ring-rose-400/40'
                }`}>{player.position}</span>
                {opponent && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-[2px] rounded-md bg-black/30 ring-1 ring-white/10">
                    <span className="text-white/70 text-[9px] font-bold uppercase">Next</span>
                    <img src={getFlagUrl(opponent)} alt={opponent} className="w-3.5 h-2.5 rounded-[1px] object-cover" />
                    <span className="text-white text-[10px] font-bold">{opponent}</span>
                    <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm text-[9px] font-black ${fdrPill(fdr!)}`}>{fdr}</span>
                    {nextKickoff && (
                      <span className="text-white/60 text-[9px] font-semibold whitespace-nowrap pl-0.5">
                        {nextKickoff.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Action row OR read-only status badges */}
          {readOnly ? (
            (props as ReadOnlyProps).hideRole ? null : (
              <div className="grid grid-cols-4 gap-2">
                <ReadOnlyBadge
                  label="Role"
                  value={isStarting ? 'STARTING' : 'BENCH'}
                  tone={isStarting ? 'emerald' : 'slate'}
                />
                <ReadOnlyBadge
                  label="Capt"
                  value={isCaptain ? 'YES' : '—'}
                  tone={isCaptain ? 'yellow' : 'mute'}
                />
                <ReadOnlyBadge
                  label="V-Capt"
                  value={isViceCaptain ? 'YES' : '—'}
                  tone={isViceCaptain ? 'silver' : 'mute'}
                />
                <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-white/5 border border-white/10 text-emerald-400">
                  <span className="text-sm font-bold mb-0.5">{player.points ?? 0}</span>
                  <span className="text-[9px] font-bold text-white/40">Points</span>
                </div>
              </div>
            )
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={(props as InteractiveProps).onSub}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all text-xs ${
                    (props as InteractiveProps).isSubTarget
                      ? 'bg-amber-500/20 border-amber-500 text-amber-500'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <span className="text-sm mb-0.5">🔄</span>
                  <span className="text-[9px] font-bold">Sub</span>
                </button>
                <button
                  onClick={(props as InteractiveProps).onSetCaptain}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all text-xs ${
                    isCaptain
                      ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <span className="text-sm font-black mb-0.5">C</span>
                  <span className="text-[9px] font-bold">Capt</span>
                </button>
                <button
                  onClick={(props as InteractiveProps).onSetViceCaptain}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all text-xs ${
                    isViceCaptain
                      ? 'bg-gray-400/20 border-gray-400 text-gray-400'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <span className="text-sm font-black mb-0.5">V</span>
                  <span className="text-[9px] font-bold">V-Capt</span>
                </button>
                <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-white/5 border border-white/10 text-emerald-400">
                  <span className="text-sm font-bold mb-0.5">{player.points ?? 0}</span>
                  <span className="text-[9px] font-bold text-white/40">Points</span>
                </div>
              </div>
              {(props as InteractiveProps).subTargetName && !(props as InteractiveProps).isSubTarget && (
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-center">
                  <p className="text-amber-500 text-xs font-medium">
                    Select player to swap with{' '}
                    <span className="font-bold">{(props as InteractiveProps).subTargetName}</span>
                  </p>
                  {(props as InteractiveProps).onCancelSub && (
                    <button
                      onClick={(props as InteractiveProps).onCancelSub}
                      className="mt-1 text-[10px] text-amber-500 underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Upcoming fixtures — the next few games with FDR difficulty so
              you can read the run, not just the immediate next match shown in
              the header. The first chip (next game) is ringed. */}
          {nextFixtures.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Upcoming</h3>
              <div className="flex gap-1.5">
                {nextFixtures.map((fx, i) => (
                  <div
                    key={i}
                    className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-lg bg-white/5 border ${
                      i === 0 ? 'border-white/25 ring-1 ring-white/15' : 'border-white/10'
                    }`}
                  >
                    <span className="text-white/40 text-[9px] font-bold">vs</span>
                    <img src={getFlagUrl(fx.opponent)} alt="" className="w-3.5 h-2.5 rounded-[1px] object-cover" />
                    <span className="text-white text-[10px] font-bold">{fx.opponent}</span>
                    <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm text-[9px] font-black ${fdrPill(fx.difficulty)}`}>
                      {fx.difficulty}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tournament journey — the nation's run through the rounds. */}
          <div>
            <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Run</h3>
            <StageTrack states={trackStates} />
          </div>

          {/* Season-aggregate stats — derived from the same per-match
              PlayerPerformance rows we fetch for the Match History
              table below. Labels mirror what the scoring engine
              actually stores; "DC" matches the column header used
              one row down for consistency. */}
          <div>
            <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Stats</h3>
            <div className="grid grid-cols-6 gap-1.5">
              <StatTile label="Gls" value={statsLoading ? '—' : seasonStats.goals} />
              <StatTile label="Ast" value={statsLoading ? '—' : seasonStats.assists} />
              <StatTile label="Apps" value={statsLoading ? '—' : seasonStats.apps} />
              <StatTile label="Min" value={statsLoading ? '—' : seasonStats.minutes} />
              <StatTile label="DC" value={statsLoading ? '—' : seasonStats.defensiveActions} />
              <StatTile label="CS" value={statsLoading ? '—' : seasonStats.cleanSheets} />
            </div>
          </div>

          {/* Match History — real per-match performances. Click a row to
              expand the points breakdown (per-category contributions). */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Match History</h3>
              {loading && <span className="text-[9px] text-white/30">Loading…</span>}
            </div>
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <div className="grid grid-cols-12 gap-1 bg-white/5 px-2 py-1.5 text-[9px] font-bold text-white/40 uppercase tracking-wider items-center">
                <div className="col-span-4">Match</div>
                <div className="col-span-2 text-center">Min</div>
                <div className="col-span-1 text-center">G</div>
                <div className="col-span-1 text-center">A</div>
                <div className="col-span-1 text-center">DC</div>
                <div className="col-span-3 text-right">Pts</div>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {error && (
                  <div className="text-center text-rose-400 text-[11px] py-3">{error}</div>
                )}
                {!error && performances && performances.length === 0 && (
                  <div className="text-center text-white/30 text-xs py-3">No matches yet</div>
                )}
                {(performances || []).map((perf) => {
                  const playerNation = player.nation?.code || '';
                  const isHome = perf.match.homeNation.code === playerNation;
                  const opp = isHome ? perf.match.awayNation : perf.match.homeNation;
                  const isExpanded = expandedId === perf.id;
                  const score = perf.match.homeScore != null && perf.match.awayScore != null
                    ? `${perf.match.homeScore}-${perf.match.awayScore}`
                    : '–';

                  // Did-not-play: nation played, player didn't feature. Render
                  // a muted, non-expandable row so the match is visible without
                  // masquerading as a 0-point appearance.
                  if (perf.didNotPlay) {
                    return (
                      <div key={perf.id} className="border-t border-white/5 grid grid-cols-12 gap-1 px-2 py-1.5 items-center opacity-40">
                        <div className="col-span-4 flex items-center gap-1.5 min-w-0">
                          <img
                            src={getFlagUrl(opp.code)}
                            alt={opp.code}
                            className="w-4 h-3 rounded-sm object-cover ring-1 ring-white/10 shrink-0 grayscale"
                          />
                          <span className="text-[10px] text-white/70 font-medium truncate">
                            vs {opp.code}
                          </span>
                          <span className="text-[9px] text-white/40 ml-auto shrink-0">{score}</span>
                        </div>
                        <div className="col-span-5 text-center text-[9px] text-white/40 font-bold uppercase tracking-wider">
                          Did not play
                        </div>
                        <div className="col-span-3 text-right text-[10px] text-white/30 font-medium pr-[14px]">—</div>
                      </div>
                    );
                  }

                  return (
                    <div key={perf.id} className="border-t border-white/5">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : perf.id)}
                        className={`w-full grid grid-cols-12 gap-1 px-2 py-1.5 items-center text-left hover:bg-white/5 transition-colors ${perf.isLive ? 'bg-emerald-500/5' : ''}`}
                      >
                        <div className="col-span-4 flex items-center gap-1.5 min-w-0">
                          <img
                            src={getFlagUrl(opp.code)}
                            alt={opp.code}
                            className="w-4 h-3 rounded-sm object-cover ring-1 ring-white/10 shrink-0"
                          />
                          <span className="text-[10px] text-white/80 font-medium truncate">
                            vs {opp.code}
                          </span>
                          <span className="text-[9px] text-white/40 ml-auto shrink-0">{score}</span>
                          {perf.isLive && (
                            <span className="inline-flex items-center gap-1 px-1 py-[1px] rounded bg-emerald-500/20 text-emerald-300 text-[8px] font-bold ring-1 ring-emerald-400/40">
                              <span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" />
                              LIVE
                            </span>
                          )}
                        </div>
                        <div className="col-span-2 text-center text-[10px] text-white/60 font-medium">{perf.stats.minutesPlayed}'</div>
                        <div className="col-span-1 text-center">
                          <span className={`text-[10px] font-bold ${perf.stats.goals > 0 ? 'text-emerald-400' : 'text-white/40'}`}>{perf.stats.goals}</span>
                        </div>
                        <div className="col-span-1 text-center">
                          <span className={`text-[10px] font-bold ${perf.stats.assists > 0 ? 'text-emerald-400' : 'text-white/40'}`}>{perf.stats.assists}</span>
                        </div>
                        <div className="col-span-1 text-center">
                          <span className={`text-[10px] font-bold ${perf.stats.defensiveActions > 0 ? 'text-sky-300' : 'text-white/40'}`}>{perf.stats.defensiveActions}</span>
                        </div>
                        <div className="col-span-3 text-right flex items-center justify-end gap-1">
                          <span className={`text-[11px] font-black ${perf.totalPoints > 0 ? 'text-emerald-400' : perf.totalPoints < 0 ? 'text-rose-400' : 'text-white/50'}`}>
                            {perf.totalPoints}
                          </span>
                          <span className={`text-white/30 text-[10px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>›</span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="bg-black/30 px-3 py-2 border-t border-white/5">
                          <div className="text-[9px] font-bold text-white/40 uppercase tracking-wider mb-1.5">
                            {perf.match.stageName} · {new Date(perf.match.kickoffTime).toLocaleDateString()}
                          </div>
                          {perf.breakdown.lines.length === 0 ? (
                            <div className="text-[10px] text-white/30 italic">No scoring events yet.</div>
                          ) : (
                            <div className="space-y-1">
                              {perf.breakdown.lines.map((line, idx) => (
                                <div key={idx} className="flex items-center justify-between gap-2 text-[10px]">
                                  <span className="text-white/70 truncate">
                                    {line.label}
                                    {line.detail && <span className="text-white/30 ml-1">({line.detail})</span>}
                                  </span>
                                  <span className={`font-bold tabular-nums ${
                                    line.points > 0 ? 'text-emerald-400' :
                                    line.points < 0 ? 'text-rose-400' : 'text-white/40'
                                  }`}>
                                    {line.points > 0 ? `+${line.points}` : line.points}
                                  </span>
                                </div>
                              ))}
                              <div className="flex items-center justify-between gap-2 text-[10px] pt-1 mt-1 border-t border-white/10">
                                <span className="text-white/80 font-bold uppercase tracking-wider">Total</span>
                                <span className={`font-black tabular-nums ${
                                  perf.breakdown.total > 0 ? 'text-emerald-400' :
                                  perf.breakdown.total < 0 ? 'text-rose-400' : 'text-white/60'
                                }`}>
                                  {perf.breakdown.total > 0 ? `+${perf.breakdown.total}` : perf.breakdown.total}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Manual Adjustments — emergency overrides. Admin sees an
              Undo button per row regardless of which team's player they
              opened (Undo is server-side admin-gated). */}
          {adjustments.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Adjustments</h3>
              <div className="rounded-lg border border-white/10 overflow-hidden divide-y divide-white/5">
                {adjustments.slice(0, 5).map((adj) => (
                  <div key={adj.id} className="px-2 py-1.5 flex items-center gap-2 text-[10px]">
                    <span className={`font-bold tabular-nums shrink-0 ${
                      (adj.pointsAdded ?? 0) > 0 ? 'text-emerald-400' :
                      (adj.pointsAdded ?? 0) < 0 ? 'text-rose-400' : 'text-white/50'
                    }`}>
                      {(adj.pointsAdded ?? 0) > 0 ? '+' : ''}{adj.pointsAdded ?? 0}
                    </span>
                    <span className="text-white/70 truncate flex-1">
                      {adj.reason || (adj.action === 'MANUAL_OVERRIDE_MATCH' ? 'Match adjustment' : 'Total adjustment')}
                    </span>
                    <span className="text-white/30 text-[9px] shrink-0">
                      {new Date(adj.createdAt).toLocaleDateString()}
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleUndoAdjustment(adj.id)}
                        disabled={undoingId === adj.id}
                        className="shrink-0 px-1.5 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[9px] font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Undo this adjustment (admin only)"
                      >
                        {undoingId === adj.id ? '…' : 'Undo'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Tournament-journey track: GR → R32 → R16 → QF → SF → 🏆. Completed rounds
// filled, the current round glows, future rounds faint; an eliminated nation
// caps with a grey "OUT" at the round it exited.
const TRACK_IDS = ['GR', 'R32', 'R16', 'QF', 'SF', 'F'] as const;
const TRACK_LABELS: Record<string, string> = { GR: 'GR', R32: 'R32', R16: 'R16', QF: 'QF', SF: 'SF', F: '🏆' };

function toTrackIdx(stageId: string | null | undefined): number {
  if (!stageId) return -1;
  if (stageId.startsWith('GR')) return 0;
  if (stageId === '3RD') return 4; // play-off sits at SF depth
  return TRACK_IDS.indexOf(stageId as typeof TRACK_IDS[number]);
}

type PipState = 'done' | 'current' | 'out' | 'future';

function StageTrack({ states }: { states: PipState[] }) {
  const pip = (s: PipState) => {
    switch (s) {
      case 'done': return 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-500/40';
      case 'current': return 'bg-emerald-500 text-white ring-2 ring-emerald-300/80 shadow-[0_0_10px_rgba(16,185,129,0.6)] animate-pulse';
      case 'out': return 'bg-rose-500/15 text-rose-300/90 ring-1 ring-rose-500/30';
      default: return 'bg-white/5 text-white/25 ring-1 ring-white/10';
    }
  };
  return (
    <div className="flex items-center gap-1">
      {TRACK_IDS.map((id, i) => (
        <div
          key={id}
          className={`flex-1 min-w-0 text-center rounded-md py-1 text-[9px] font-black tracking-tight ${pip(states[i])}`}
        >
          {states[i] === 'out' ? 'OUT' : TRACK_LABELS[id]}
        </div>
      ))}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/5 rounded-md px-1.5 py-1 border border-white/5 text-center">
      <p className="text-sm font-black text-white leading-none">{value}</p>
      <p className="text-[8px] font-bold text-white/35 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

// Read-only badge replacing the Sub/Capt/V-Capt action buttons when the
// modal is opened from someone else's team. Tones are picked to match
// the interactive buttons' active states so the visual language is
// consistent across the two modes.
function ReadOnlyBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'emerald' | 'yellow' | 'silver' | 'slate' | 'mute';
}) {
  const cls =
    tone === 'emerald' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' :
    tone === 'yellow' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' :
    tone === 'silver' ? 'bg-gray-400/20 border-gray-400 text-gray-300' :
    tone === 'slate' ? 'bg-slate-500/15 border-slate-500/40 text-slate-300' :
    'bg-white/5 border-white/10 text-white/40';
  return (
    <div className={`flex flex-col items-center justify-center p-2 rounded-lg border ${cls}`}>
      <span className="text-[10px] font-black mb-0.5 leading-none">{value}</span>
      <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">{label}</span>
    </div>
  );
}
