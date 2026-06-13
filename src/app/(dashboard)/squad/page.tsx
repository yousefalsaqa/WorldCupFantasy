'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PlayerCard, EmptySlot, PlayerFace } from '@/components/kit';
import PlayerDetailModal from '@/components/player-detail-modal';
import PitchBg from '@/components/pitch-bg';
import FormationPicker from '@/components/formation-picker';
import { getFlagUrl } from '@/lib/flags';
import { getFixtureDifficulty } from '@/lib/fdr';
import { useUnsavedChanges } from '@/contexts/unsaved-changes';
import { ArrowLeftRight, RotateCcw } from 'lucide-react';
import { useUserTimezone, useNow } from '@/hooks/useTimezone';
import {
  formatDateShort,
  formatTime,
  formatCountdown as fmtCountdown,
  formatDuration,
  deadlineFor,
  parseFixtureDateTime,
} from '@/lib/format-time';
import { Trophy, Wallet, Coins, Sparkles, Zap, RefreshCw, Crown, Users, Save, X, Search, Wand2, AlertTriangle, Lock } from 'lucide-react';
import {
  ALL_WC_FIXTURES,
  NATION_NAMES as WC_NATION_NAMES,
} from '@/lib/world-cup-fixtures';

// Chips
interface ChipData {
  id: string;
  name: string;
  description: string;
  used: boolean;
  available: boolean;
  active: boolean;
  canCancel?: boolean;
  cancelBlockedReason?: string;
}

// Types
interface Nation {
  id: string;
  name: string;
  code: string;
  kitColor1: string;
  kitColor2: string;
}

interface Player {
  id: string;
  displayName: string;
  position: string;
  currentPrice: number;
  shirtNumber: number | null;
  photoUrl?: string | null;
  nation: Nation;
  isAvailable?: boolean;
  availabilityNote?: string | null;
  /** Selection in his nation's most recent finished match (null = nation
   * hasn't played yet). Drives the Started/Sub/Unused picker chip. */
  lastMatch?: { played: boolean; started: boolean | null; minutes: number } | null;
  isStarting?: boolean;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  points?: number;
  stats?: {
    goals: number;
    assists: number;
    passAccuracy: number;
    interceptions: number;
    tackles: number;
    dribbles: number;
  };
}

type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

/**
 * Selection-history chip for picker rows: did this guy actually play his
 * nation's last match? Green = started, amber = bench cameo, gray = unused.
 * Nothing renders before a nation's first game (no history) or when the
 * red OUT badge is already showing (don't stack chips).
 */
function LastMatchChip({ player }: { player: Player }) {
  const lm = player.lastMatch;
  if (!lm || player.isAvailable === false) return null;
  if (!lm.played) {
    return (
      <span
        className="shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-white/5 text-white/35 ring-1 ring-white/10"
        title="Didn't play in his nation's last match"
      >
        Unused
      </span>
    );
  }
  if (lm.started === false) {
    return (
      <span
        className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
        title="Came off the bench in his nation's last match"
      >
        Sub {lm.minutes}&apos;
      </span>
    );
  }
  // started === true, or null on legacy rows (pre-backfill) — show minutes.
  // "Started 61'" not "✓ 61'" — the bare number read as "came on at 61'"
  // during user testing; minutes-played needs the word.
  return (
    <span
      className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
      title="Started his nation's last match (minutes played)"
    >
      {lm.started ? 'Started ' : ''}{lm.minutes}&apos;
    </span>
  );
}

// Lowercase + strip diacritics + trim, so search is accent-insensitive and
// survives iOS keyboard auto-capitalisation/trailing spaces.
function normSearch(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Per-match performance + adjustment types now live alongside the
// shared PlayerDetailModal (`src/components/player-detail-modal.tsx`).
// The squad page no longer owns the modal so it doesn't need them here.

// Local Fixture interface used by the squad page's "next fixture" tile and
// the per-player results modal. The actual fixture table is imported from
// `@/lib/world-cup-fixtures` (single source of truth); the played-game
// fields below are layered on at runtime when the API returns results.
interface Fixture {
  id: string;
  home: string;
  away: string;
  date: string;
  time: string;
  stage: string;
  isPlayed?: boolean;
  homeScore?: number;
  awayScore?: number;
  playerGoals?: number;
  playerAssists?: number;
  playerPoints?: number;
  playerMinutes?: number;
  playerSubbedOff?: boolean;
}

// All 104 World Cup matches (group + knockout). Source of truth lives in
// `src/lib/world-cup-fixtures.ts`. The cast drops the shared module's
// `stadium`/`group` fields which the squad page doesn't use.
const WORLD_CUP_FIXTURES: Fixture[] = ALL_WC_FIXTURES.map((f) => ({
  id: f.id,
  home: f.home,
  away: f.away,
  date: f.date,
  time: f.time,
  stage: f.stage,
}));

// Nation names re-exported from the shared fixture module so squad page,
// fixtures page and admin dashboards never disagree.
const NATION_NAMES = WC_NATION_NAMES;

// Get fixtures for a nation
function getNationFixtures(nationCode: string): Fixture[] {
  return WORLD_CUP_FIXTURES.filter(f => f.home === nationCode || f.away === nationCode)
    .sort(
      (a, b) =>
        parseFixtureDateTime(a.date, a.time).getTime() -
        parseFixtureDateTime(b.date, b.time).getTime(),
    );
}

// Get next opponent for a nation (first upcoming unplayed game)
function getNextOpponent(nationCode: string): string {
  const now = new Date();
  const fixtures = getNationFixtures(nationCode);
  
  // Find the next unplayed game
  const nextFixture = fixtures.find(f => {
    const fixtureDate = parseFixtureDateTime(f.date, f.time);
    return fixtureDate > now && !f.isPlayed;
  });
  
  if (!nextFixture) {
    // If no upcoming games, show last opponent or dash
    const lastFixture = fixtures[fixtures.length - 1];
    if (lastFixture) {
      const opponent = lastFixture.home === nationCode ? lastFixture.away : lastFixture.home;
      return opponent;
    }
    return '-';
  }
  
  const opponent = nextFixture.home === nationCode ? nextFixture.away : nextFixture.home;
  return opponent;
}

// Format a calendar date string (YYYY-MM-DD) for display. We anchor at noon
// to dodge timezone off-by-one errors — at midnight a UTC-shifted client can
// see "May 31" for "June 1" depending on the user's chosen zone.
function formatFixtureDate(dateStr: string, tz?: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return formatDateShort(date, tz);
}

// Position limits
const POSITION_LIMITS: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const MAX_PER_NATION = 3;

export default function SquadPage() {
  const router = useRouter();
  const { setDirty, forceClean } = useUnsavedChanges();
  // Reactive timezone + per-minute clock — drives the deadline tile, fixture
  // dates and chip countdowns so they all stay in lockstep when the user
  // changes their preferred zone.
  const { timezone } = useUserTimezone();
  const now = useNow(60_000);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'loading' | 'builder' | 'view'>('loading');

  // Local helpers to mark/unmark unsaved changes – wired into the layout-level
  // confirmation modal so users don't silently lose work when navigating away.
  const markDirty = useCallback(
    (label?: string) => setDirty(true, label),
    [setDirty]
  );
  const markClean = useCallback(() => setDirty(false), [setDirty]);

  // Always clean up the dirty flag if this page unmounts (e.g. after the user
  // confirmed leaving). Belt and suspenders – the modal already clears it.
  useEffect(() => {
    return () => setDirty(false);
  }, [setDirty]);
  
  // All available players (for builder)
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  
  // Squad state
  const [squad, setSquad] = useState<Player[]>([]);
  const [startingXI, setStartingXI] = useState<Player[]>([]);
  const [bench, setBench] = useState<Player[]>([]);
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [viceCaptainId, setViceCaptainId] = useState<string | null>(null);
  const [bankBalance, setBankBalance] = useState(100);
  const [teamValue, setTeamValue] = useState(0);
  const [formation, setFormation] = useState('4-4-2');
  
  // Builder state
  const [showModal, setShowModal] = useState(false);
  const [selectingPosition, setSelectingPosition] = useState<Position | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'price' | 'name'>('price');

  // View mode state
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  // Player being INSPECTED from a picker row (the little info button) —
  // opens the shared modal read-only without committing the swap/buy.
  const [pickerInfoPlayer, setPickerInfoPlayer] = useState<Player | null>(null);
  const [playerToSub, setPlayerToSub] = useState<Player | null>(null);
  // A starter→bench swap that needs a one-way-forfeit confirmation because
  // the outgoing player's match has already kicked off. Holds the pending
  // swap pair until the user confirms (then performSwap runs with confirmed).
  const [subOffWarning, setSubOffWarning] = useState<{ p1: Player; p2: Player } | null>(null);
  // Nations whose match in the active stage has kicked off (server-derived,
  // same gate as /api/squad/update). Played players can't enter the XI or
  // move bench slots — this drives the client-side grey-out so users don't
  // build an illegal sub and only find out on save.
  const [startedNations, setStartedNations] = useState<Set<string>>(new Set());
  // Subset of startedNations whose match is currently in progress (live), so
  // the sub-off warning can say "in play now" vs "already played" (finished).
  const [liveNations, setLiveNations] = useState<Set<string>>(new Set());

  // isAdmin drives the "Undo" button visibility on per-player adjustment
  // rows inside the shared PlayerDetailModal. We fetch it once on mount;
  // the modal itself is purely presentational and trusts this flag (the
  // DELETE /api/admin/override endpoint also re-validates server-side).
  const [isAdmin, setIsAdmin] = useState(false);

  // Transfer mode state
  //
  // Transfer mode is a sub-state of "view" mode — the team is built and we're
  // mid-tournament. Toggling `transferMode` switches the squad page to a
  // 15-on-pitch layout where users swap players via a picker. Until the user
  // confirms or discards, the underlying `squad` array is untouched; the
  // pending transfers live in `pendingTransfers` and are projected onto the
  // display via `transferDisplaySquad` below.
  const [transferMode, setTransferMode] = useState(false);
  const [freeTransfers, setFreeTransfers] = useState(0);
  // Mirrors the server-side rule in /api/transfers + /api/squad/get. When
  // true the transfer UI hides the "Hit" pill and "−X pts" labels so we
  // don't scare users with a deduction that won't be applied.
  const [unlimitedTransfers, setUnlimitedTransfers] = useState(false);
  // True iff at least one match is currently in progress. Drives the
  // 60-second `livePoints` polling effect below — when nothing's live we
  // don't burn DB cycles on a useless poll loop.
  const [anyMatchLive, setAnyMatchLive] = useState(false);
  const [pendingTransfers, setPendingTransfers] = useState<
    Array<{ playerOut: Player; playerIn: Player }>
  >([]);
  // Transfers already QUEUED on the server for next round (made while the
  // current round was locked). Shown as a card in view mode with per-row
  // cancel; applied automatically when the next stage starts.
  const [queuedTransfers, setQueuedTransfers] = useState<
    Array<{
      playerOut: { id: string; displayName: string; position: string; nationCode: string } | null;
      playerIn: { id: string; displayName: string; position: string; nationCode: string } | null;
      priceIn: number;
      priceOut: number;
      queuedAt: string;
    }>
  >([]);
  const [queueCancelling, setQueueCancelling] = useState<string | null>(null);
  // The squad player the user just tapped Replace on. Drives the picker
  // modal's position filter and refund math. Distinct from `selectedPlayer`
  // (view-mode player detail) and `selectingPosition` (builder slot).
  const [transferReplacingFor, setTransferReplacingFor] = useState<Player | null>(null);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  // True when the user has tapped Discard but we're waiting for confirmation.
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  // Chips state
  const [chips, setChips] = useState<ChipData[]>([]);
  const [chipConfirm, setChipConfirm] = useState<ChipData | null>(null);
  const [chipCancelConfirm, setChipCancelConfirm] = useState<ChipData | null>(null);
  const [chipLoading, setChipLoading] = useState(false);
  const [chipDeadline, setChipDeadline] = useState<string | null>(null);
  const [stageLocked, setStageLocked] = useState(false);

  const fetchChips = useCallback(async () => {
    try {
      const res = await fetch('/api/chips', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setChips(data.chips || []);
        setChipDeadline(data.deadlineTime ?? null);
        setStageLocked(Boolean(data.stageLocked));
      }
    } catch (err) {
      console.error('Failed to fetch chips:', err);
    }
  }, []);

  // Fire the chips fetch on mount IN PARALLEL with /api/squad/get
  // (which is what flips the page into 'view' mode). Previously this
  // was gated on `mode === 'view'`, which meant chips only started
  // loading AFTER squad-get resolved — a visible serial waterfall.
  // /api/chips is independent of squad state, so we can run it
  // immediately. If the user turns out to be in 'builder' mode the
  // chips card won't render, but the fetched payload is harmless to
  // sit in state.
  useEffect(() => {
    fetchChips();
  }, [fetchChips]);

  // The `now` value above (via useNow(60_000)) drives both the squad
  // deadline tile and the chip countdowns, so we don't need a second timer
  // here. 60s granularity is fine — chip cards show "Locks in 2h 5m", not
  // seconds, so a more frequent tick would just burn battery.

  const activateChip = async (chipId: string) => {
    setChipLoading(true);
    try {
      const res = await fetch('/api/chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ chipId }),
      });
      if (res.ok) {
        await fetchChips();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Failed to activate chip (status ${res.status})`);
      }
    } catch (err) {
      console.error('Activate chip error:', err);
      alert('Failed to activate chip \u2013 check your connection and try again.');
    } finally {
      setChipLoading(false);
      setChipConfirm(null);
    }
  };

  const cancelActiveChip = async () => {
    setChipLoading(true);
    const cancellingId = chipCancelConfirm?.id;
    try {
      const res = await fetch('/api/chips', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        // Free Hit cancellation reverts squad + bank + transfers, so reload to
        // resync. forceClean() removes the beforeunload guard synchronously
        // (state updates are async, which previously made the reload silently
        // abort if the user had any unsaved squad change).
        if (cancellingId === 'FREE_HIT') {
          forceClean();
          window.location.reload();
          return;
        }
        await fetchChips();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Failed to cancel chip (status ${res.status})`);
      }
    } catch (err) {
      console.error('Cancel chip error:', err);
      alert('Failed to cancel chip \u2013 check your connection and try again.');
    } finally {
      setChipLoading(false);
      setChipCancelConfirm(null);
    }
  };

  // One-shot fetch on mount to learn whether the viewer is an admin.
  // Drives visibility of the "Undo" button on Adjustment rows. We don't
  // gate any data access on this — the override DELETE endpoint
  // re-validates admin server-side. This is purely UI affordance.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setIsAdmin(Boolean(data?.user?.isAdmin));
      } catch {
        /* non-fatal — non-admins just don't see the Undo button */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Per-match performance fetching + body scroll lock now live INSIDE
  // the shared <PlayerDetailModal /> (src/components/player-detail-modal.tsx),
  // which both /squad and /leagues/team/[teamId] mount. Removing them
  // from this file means there's a single source of truth for the
  // Match History panel and the modal can't drift between the two
  // call sites.

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    // Manual timeout via AbortController (AbortSignal.timeout not supported on older iOS Safari)
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 20000);

    async function fetchWithRetry(url: string, init?: RequestInit, retries = 1): Promise<Response> {
      try {
        return await fetch(url, { ...init, signal: ctrl.signal });
      } catch (err) {
        if (retries > 0 && !cancelled) {
          await new Promise(r => setTimeout(r, 800));
          return fetchWithRetry(url, init, retries - 1);
        }
        throw err;
      }
    }

    async function fetchData() {
      setLoadError(null);
      try {
        // Only block on the squad endpoint. /api/players (~204 records) is
        // only used by the builder-mode picker and the transfer flow, so
        // there's no reason to delay first paint on it. We kick off the
        // players fetch in the background after the squad arrives, and
        // also lazy-fetch on demand if the user opens the picker first.
        const squadRes = await fetchWithRetry('/api/squad/get', { credentials: 'include' });
        if (cancelled) return;

        if (squadRes.ok) {
          const squadData = await squadRes.json();
          if (cancelled) return;

          if (squadData.squad && squadData.squad.length === 15) {
            // User has complete squad - VIEW mode
            setBankBalance(squadData.bankBalance || 0);
            setTeamValue(squadData.teamValue || 0);
            // Capture free transfers so the transfer mode UI can show the
            // correct "X free transfers" badge. The API may not return this
            // pre-tournament — fall back to 0 in that case.
            setFreeTransfers(squadData.freeTransfers ?? 0);
            setUnlimitedTransfers(Boolean(squadData.unlimitedTransfers));
            setAnyMatchLive(Boolean(squadData.anyMatchLive));
            setQueuedTransfers(squadData.queuedTransfers || []);
            setStartedNations(new Set<string>(squadData.startedNationCodes || []));
            setLiveNations(new Set<string>(squadData.liveNationCodes || []));

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const players: Player[] = squadData.squad.map((sp: any) => ({
              id: sp.player.id,
              displayName: sp.player.displayName,
              position: sp.player.position,
              currentPrice: sp.purchasePrice || sp.player.currentPrice,
              shirtNumber: sp.player.shirtNumber,
              photoUrl: sp.player.photoUrl,
              nation: sp.player.nation,
              isStarting: sp.isStarting,
              isCaptain: sp.isCaptain,
              isViceCaptain: sp.isViceCaptain,
              // Prefer the server-computed `livePoints` (raw stored + any
              // in-progress PlayerPerformance totals). Falls back to plain
              // `points` for partial squads / pre-tournament responses.
              points: sp.livePoints ?? sp.points ?? 0,
              stats: sp.stats || {
                goals: 0,
                assists: 0,
                passAccuracy: 0,
                interceptions: 0,
                tackles: 0,
                dribbles: 0,
              },
            }));
            
            setSquad(players);
            const starting = players.filter(p => p.isStarting);
            setStartingXI(starting);
            // /api/squad/get returns rows in DB order, not sub priority —
            // sort the bench by benchOrder (same rule as the league
            // team-view endpoint) or a saved reorder won't survive a reload.
            const benchOrderById = new Map<string, number>();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const sp of squadData.squad as any[]) {
              benchOrderById.set(sp.player.id, sp.benchOrder ?? 99);
            }
            setBench(
              players
                .filter(p => !p.isStarting)
                .sort((a, b) => (benchOrderById.get(a.id) ?? 99) - (benchOrderById.get(b.id) ?? 99))
            );
            
            // Set formation based on starting XI
            const defs = starting.filter(p => p.position === 'DEF').length;
            const mids = starting.filter(p => p.position === 'MID').length;
            const fwds = starting.filter(p => p.position === 'FWD').length;
            setFormation(`${defs}-${mids}-${fwds}`);
            
            const captain = players.find(p => p.isCaptain);
            const vice = players.find(p => p.isViceCaptain);
            if (captain) setCaptainId(captain.id);
            if (vice) setViceCaptainId(vice.id);
            
            setMode('view');
          } else if (squadData.squad && squadData.squad.length > 0) {
            // Partial squad - BUILDER mode with existing players
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const players: Player[] = squadData.squad.map((sp: any) => ({
              id: sp.player.id,
              displayName: sp.player.displayName,
              position: sp.player.position,
              currentPrice: sp.purchasePrice || sp.player.currentPrice,
              shirtNumber: sp.player.shirtNumber,
              photoUrl: sp.player.photoUrl,
              nation: sp.player.nation,
            }));
            setSquad(players);
            setBankBalance(squadData.bankBalance || 100);
            setMode('builder');
          } else {
            // No squad - BUILDER mode
            setMode('builder');
          }
        } else {
          setMode('builder');
        }

        // Kick off the players fetch in the background. Doesn't block render.
        // Builder mode needs it for the picker; view mode never needs it.
        if (!cancelled) {
          fetchWithRetry('/api/players')
            .then(async (res) => {
              if (!cancelled && res.ok) {
                const data = await res.json();
                const players = Array.isArray(data) ? data : (data.players || []);
                if (!cancelled) setAllPlayers(players);
              }
            })
            .catch(() => { /* non-fatal: picker will lazy-fetch if needed */ });
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to fetch data:', error);
        const aborted = (error as Error)?.name === 'AbortError';
        setLoadError(
          aborted
            ? 'The request took too long. Tap retry.'
            : 'Could not load your squad. Check your connection and try again.'
        );
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      ctrl.abort();
    };
  }, [loadAttempt]);

  // ============================================
  // LIVE POINTS POLLING
  // ============================================
  // Refetch /api/squad/get every 60s while a match is in progress so the
  // green points pill ticks up without the user needing to reload. We
  // intentionally only update `points` on the existing player rows (not
  // mode/formation/captain etc.) so polling doesn't disturb UI state
  // that the user may be actively manipulating (transfers, captaincy).
  //
  // The 60-second cadence matches API-Football's own update floor for
  // /fixtures/players (the upstream signal `/api/live/update` reads).
  // Going faster wouldn't surface any new data.
  useEffect(() => {
    if (!anyMatchLive) return;
    if (mode !== 'view') return; // builder mode doesn't display live points

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      try {
        const res = await fetch('/api/squad/get', { credentials: 'include' });
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setAnyMatchLive(Boolean(data.anyMatchLive));
        if (!Array.isArray(data.squad)) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const livePointsByPlayerId = new Map<string, number>();
        for (const sp of data.squad as Array<{ player: { id: string }; livePoints?: number; points?: number }>) {
          livePointsByPlayerId.set(sp.player.id, sp.livePoints ?? sp.points ?? 0);
        }
        const applyLive = (players: Player[]) =>
          players.map((p) => {
            const live = livePointsByPlayerId.get(p.id);
            return live !== undefined ? { ...p, points: live } : p;
          });
        setSquad((prev) => applyLive(prev));
        setStartingXI((prev) => applyLive(prev));
        setBench((prev) => applyLive(prev));
      } catch {
        // Network blips are non-fatal during polling — try again next tick.
      }
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [anyMatchLive, mode]);

  // Calculate squad stats
  const squadValue = useMemo(() => squad.reduce((sum, p) => sum + p.currentPrice, 0), [squad]);
  const remainingBudget = useMemo(() => 100 - squadValue, [squadValue]);
  
  const positionCounts = useMemo(() => {
    const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    squad.forEach(p => counts[p.position as Position]++);
    return counts;
  }, [squad]);

  const nationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    squad.forEach(p => {
      counts[p.nation?.id || ''] = (counts[p.nation?.id || ''] || 0) + 1;
    });
    return counts;
  }, [squad]);

  // ============================================
  // TRANSFER MODE — derived state
  // ============================================
  //
  // The "display squad" projects pending transfers onto the current 15-man
  // roster: each outgoing player is swapped for its incoming counterpart so
  // the pitch reflects what the team WILL look like after Confirm. Outgoing
  // players keep their slot but visually fade; we render the replacements
  // with an amber glow + Undo button instead.
  const transferDisplaySquad = useMemo(() => {
    if (!transferMode) return squad;
    return squad.map((sp) => {
      const t = pendingTransfers.find((pt) => pt.playerOut.id === sp.id);
      if (!t) return sp;
      // Project the incoming player onto the slot. We re-stamp `currentPrice`
      // as the *new* player's price so budget math downstream is correct;
      // `purchasePrice` (refund) stays on the original via t.playerOut.
      return { ...t.playerIn };
    });
  }, [transferMode, squad, pendingTransfers]);

  // True iff the given slot is showing an incoming pending transfer. Drives
  // the amber glow border and the Replace ↔ Undo button switch.
  const isPendingIncoming = useCallback(
    (playerId: string) =>
      pendingTransfers.some((t) => t.playerIn.id === playerId),
    [pendingTransfers],
  );

  const findOutgoingFor = useCallback(
    (incomingPlayerId: string) =>
      pendingTransfers.find((t) => t.playerIn.id === incomingPlayerId)
        ?.playerOut ?? null,
    [pendingTransfers],
  );

  // Net £m change after pending transfers. World Cup uses fixed prices so the
  // refund equals the original purchase price — same rule as the legacy
  // /transfers page.
  const transferBudgetImpact = useMemo(() => {
    let change = 0;
    for (const t of pendingTransfers) {
      change += t.playerOut.currentPrice - t.playerIn.currentPrice;
    }
    return change;
  }, [pendingTransfers]);

  const projectedBank = bankBalance + transferBudgetImpact;

  // Points hit cost = (transfers beyond freeTransfers) × 4. Matches the
  // server-side rule in /api/transfers. Forced to 0 when transfers are
  // unlimited (pre-tournament, wildcard, free hit) so the UI doesn't show
  // a deduction the API won't actually apply.
  const transferHitCost = useMemo(() => {
    // While the round is locked, transfers are QUEUED for next round and
    // hits aren't available — the count is capped at freeTransfers instead.
    if (unlimitedTransfers || stageLocked) return 0;
    const extra = Math.max(0, pendingTransfers.length - freeTransfers);
    return extra * 4;
  }, [pendingTransfers.length, freeTransfers, unlimitedTransfers, stageLocked]);

  // Queue mode (round in progress): you can only queue up to your remaining
  // free transfers. Mirrors the server-side cap in /api/transfers.
  const overQueueLimit = stageLocked && pendingTransfers.length > freeTransfers;

  // Nation counts after applying pending transfers, used by the picker to
  // grey out players who would breach the 3-per-nation cap. We start from
  // the CURRENT squad minus outs, then add ins.
  const projectedNationCounts = useMemo(() => {
    const out = new Set(pendingTransfers.map((t) => t.playerOut.id));
    const counts: Record<string, number> = {};
    squad.forEach((p) => {
      if (out.has(p.id)) return;
      const k = p.nation?.id || '';
      counts[k] = (counts[k] || 0) + 1;
    });
    pendingTransfers.forEach((t) => {
      const k = t.playerIn.nation?.id || '';
      counts[k] = (counts[k] || 0) + 1;
    });
    return counts;
  }, [squad, pendingTransfers]);

  // Keep the unsaved-changes guard in sync with pending transfers so the
  // user can't accidentally navigate away mid-flow.
  useEffect(() => {
    if (transferMode && pendingTransfers.length > 0) {
      setDirty(
        true,
        `You have ${pendingTransfers.length} pending transfer${pendingTransfers.length === 1 ? '' : 's'} that hasn\u2019t been confirmed.`,
      );
    }
    // We don't clear here — the discard handler / submit handler are
    // explicit about when the dirty flag goes away.
  }, [transferMode, pendingTransfers.length, setDirty]);

  // Open the picker for a squad slot. Stashes the player being replaced so
  // the picker can filter by position and refund correctly.
  const startReplace = useCallback(
    (squadPlayer: Player) => {
      setTransferReplacingFor(squadPlayer);
      setShowModal(true);
      setSelectingPosition(squadPlayer.position as Position);
      setSearchTerm('');
      // Defensive lazy-load identical to builder.openModal so the picker
      // isn't empty if /api/players hadn't resolved yet.
      if (allPlayers.length === 0) {
        fetch('/api/players')
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data) return;
            const players = Array.isArray(data) ? data : data.players || [];
            setAllPlayers(players);
          })
          .catch(() => {});
      }
    },
    [allPlayers.length],
  );

  // Undo a pending transfer — find the entry by incoming-player id and drop
  // it. Safe to call multiple times; idempotent if the entry's gone.
  const undoTransfer = useCallback((incomingPlayerId: string) => {
    setPendingTransfers((prev) =>
      prev.filter((t) => t.playerIn.id !== incomingPlayerId),
    );
  }, []);

  // Commit a replacement: replaces an existing pending transfer for this
  // slot if any (so users can change their mind mid-flow), otherwise pushes
  // a new entry.
  const commitTransfer = useCallback(
    (playerOut: Player, playerIn: Player) => {
      setPendingTransfers((prev) => {
        // If the slot was already being replaced (rare — would require
        // tapping Replace on an already-pending player, which we don't
        // render — defensive anyway), drop the prior entry first.
        const filtered = prev.filter((t) => t.playerOut.id !== playerOut.id);
        return [...filtered, { playerOut, playerIn }];
      });
      setTransferReplacingFor(null);
      setSelectingPosition(null);
      setShowModal(false);
      setSearchTerm('');
    },
    [],
  );

  const enterTransferMode = useCallback(() => {
    setTransferMode(true);
    setTransferError(null);
    setPendingTransfers([]);
  }, []);

  const exitTransferMode = useCallback(() => {
    setTransferMode(false);
    setPendingTransfers([]);
    setTransferReplacingFor(null);
    setTransferError(null);
    setDiscardConfirmOpen(false);
    setDirty(false);
  }, [setDirty]);

  // Cancel a transfer queued for next round (made while the current round
  // was locked). The server refunds the free transfer; we mirror both
  // changes locally so the card and counters update without a reload.
  const cancelQueuedTransfer = useCallback(async (playerInId: string) => {
    setQueueCancelling(playerInId);
    try {
      const res = await fetch('/api/transfers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerInId }),
      });
      if (res.ok) {
        setQueuedTransfers((prev) => prev.filter((t) => t.playerIn?.id !== playerInId));
        setFreeTransfers((prev) => prev + 1);
      }
    } catch (err) {
      console.error('Cancel queued transfer failed:', err);
    } finally {
      setQueueCancelling(null);
    }
  }, []);

  const submitTransfers = useCallback(async () => {
    if (pendingTransfers.length === 0) return;
    setTransferSubmitting(true);
    setTransferError(null);
    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          transfers: pendingTransfers.map((t) => ({
            playerOutId: t.playerOut.id,
            playerInId: t.playerIn.id,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTransferError(
          data.error || `Failed to confirm transfers (status ${res.status})`,
        );
        setTransferSubmitting(false);
        return;
      }
      // Drop the unsaved guard BEFORE reload — see /transfers for the reason.
      setPendingTransfers([]);
      forceClean();
      window.location.reload();
    } catch (err) {
      console.error('Submit transfers error:', err);
      setTransferError(
        'Could not reach the server. Check your connection and try again.',
      );
      setTransferSubmitting(false);
    }
  }, [pendingTransfers, forceClean]);

  // Filter available players for modal. Works for both the builder (no
  // `transferReplacingFor`) and the transfer-mode picker (set). In transfer
  // mode the math is different:
  //   - budget = current bank + (price of player being replaced)
  //     The world cup model uses fixed prices, so refund = purchase price.
  //   - the player being replaced is allowed to "reappear" (you can pick
  //     them back if you change your mind mid-tap), so we don't filter them
  //     out unconditionally — only their PRESENT-IN-SQUAD siblings.
  //   - the nation cap uses the projected count (squad minus all pending
  //     outs, plus all pending ins), which already excludes the slot being
  //     replaced.
  const availablePlayers = useMemo(() => {
    if (!selectingPosition) return [];

    const isTransferPicker = Boolean(transferReplacingFor);
    const squadIds = new Set(squad.map((p) => p.id));
    const pendingInIds = new Set(pendingTransfers.map((t) => t.playerIn.id));
    const pendingOutIds = new Set(pendingTransfers.map((t) => t.playerOut.id));

    const effectiveBudget = isTransferPicker
      ? bankBalance + (transferReplacingFor?.currentPrice ?? 0)
      : remainingBudget;

    const counts = isTransferPicker ? projectedNationCounts : nationCounts;

    return allPlayers
      .filter((p) => {
        if (p.position !== selectingPosition) return false;
        // Accent-insensitive search ("goncalo" must find "Gonçalo"; iOS
        // keyboards also sneak in capitals and trailing spaces). Matches
        // nation name too so "brazil" lists the whole squad.
        if (searchTerm) {
          const q = normSearch(searchTerm);
          if (!normSearch(p.displayName).includes(q) && !normSearch(p.nation?.name || '').includes(q)) {
            return false;
          }
        }
        if (isTransferPicker) {
          // Hide players that are STILL in the squad (and not on their way
          // out via a pending transfer) and players already lined up to come
          // in — these would create duplicates after Confirm.
          const inSquad = squadIds.has(p.id);
          const alreadyIncoming = pendingInIds.has(p.id);
          const goingOut = pendingOutIds.has(p.id);
          if (alreadyIncoming) return false;
          if (inSquad && !goingOut) return false;
        } else {
          if (squadIds.has(p.id)) return false;
        }
        if (p.currentPrice > effectiveBudget) return false;
        if ((counts[p.nation?.id || ''] || 0) >= MAX_PER_NATION) return false;
        return true;
      })
      .sort((a, b) =>
        sortBy === 'price'
          ? b.currentPrice - a.currentPrice
          : a.displayName.localeCompare(b.displayName),
      );
  }, [
    allPlayers,
    squad,
    selectingPosition,
    remainingBudget,
    nationCounts,
    searchTerm,
    sortBy,
    transferReplacingFor,
    pendingTransfers,
    bankBalance,
    projectedNationCounts,
  ]);

  // Add player to squad. Two distinct flows share this handler:
  //   - Builder mode: append to `squad` and mark page dirty.
  //   - Transfer-mode picker: commit a swap via commitTransfer(), no
  //     mutation of `squad` (only `pendingTransfers` changes).
  const addPlayer = (player: Player) => {
    if (transferReplacingFor) {
      commitTransfer(transferReplacingFor, player);
      return;
    }
    setSquad(prev => [...prev, player]);
    setShowModal(false);
    setSelectingPosition(null);
    setSearchTerm('');
    markDirty('You added a player to your squad but haven\u2019t saved yet.');
  };

  // Remove player from squad
  const removePlayer = (playerId: string) => {
    setSquad(prev => prev.filter(p => p.id !== playerId));
    markDirty('You removed a player from your squad but haven\u2019t saved yet.');
  };

  // Open modal for position
  const openModal = (position: Position) => {
    if (positionCounts[position] < POSITION_LIMITS[position]) {
      setSelectingPosition(position);
      setShowModal(true);
      // Defensive lazy-load: if the background fetch hasn't populated yet,
      // pull players now so the picker isn't empty.
      if (allPlayers.length === 0) {
        fetch('/api/players')
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!data) return;
            const players = Array.isArray(data) ? data : (data.players || []);
            setAllPlayers(players);
          })
          .catch(() => {});
      }
    }
  };

  // Save initial squad
  const saveSquad = async () => {
    if (squad.length !== 15) {
      alert('Please select all 15 players');
      return;
    }
    
    setSaving(true);
    try {
      // Auto-select starting 11 (4-4-2)
      const gks = squad.filter(p => p.position === 'GK');
      const defs = squad.filter(p => p.position === 'DEF');
      const mids = squad.filter(p => p.position === 'MID');
      const fwds = squad.filter(p => p.position === 'FWD');
      
      const starting: Player[] = [
        gks[0], // 1 GK
        ...defs.slice(0, 4), // 4 DEF
        ...mids.slice(0, 4), // 4 MID
        ...fwds.slice(0, 2), // 2 FWD
      ];
      
      const benchPlayers = squad.filter(p => !starting.includes(p));
      
      // Captain = highest priced, Vice = second highest
      const sortedByPrice = [...starting].sort((a, b) => b.currentPrice - a.currentPrice);
      const captain = sortedByPrice[0];
      const vice = sortedByPrice[1];
      
      const res = await fetch('/api/squad/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          players: squad.map(p => ({ playerId: p.id, purchasePrice: p.currentPrice })),
          startingXI: starting.map(p => p.id),
          bench: benchPlayers.map(p => p.id),
          captainId: captain.id,
          viceCaptainId: vice.id,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to save');
        return;
      }
      
      markClean();
      // Refresh to view mode
      window.location.reload();
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save squad');
    } finally {
      setSaving(false);
    }
  };

  // Has this player's nation already kicked off this round? Mirrors the
  // server gate in /api/squad/update — played players can't enter the XI
  // or have their bench slot moved (subbing them OUT is allowed, with
  // forfeit, handled server-side).
  const nationStarted = (p: Player) => startedNations.has(p.nation?.code || '');

  // Why a proposed swap is blocked by the played-this-round rules, or null
  // if it isn't. Split from isSwapValid so performSwap can show the right
  // message instead of the generic formation alert.
  const playedLockReason = (p1: Player, p2: Player): string | null => {
    if (p1.isStarting === p2.isStarting) {
      if (p1.isStarting) return null; // starter↔starter focus switch, no move
      const lockedOne = [p1, p2].find(nationStarted);
      return lockedOne
        ? `${lockedOne.displayName} already played this round — his bench slot is locked.`
        : null;
    }
    const incoming = p1.isStarting ? p2 : p1; // the bench player coming on
    return nationStarted(incoming)
      ? `${incoming.displayName} already played this round — you can't bring him into your XI now.`
      : null;
  };

  // Pure check: would swapping p1 and p2 produce a valid formation?
  const isSwapValid = (p1: Player, p2: Player): boolean => {
    if (p1.id === p2.id) return false;
    if (playedLockReason(p1, p2) !== null) return false;
    // Two bench players can always trade places — that's an auto-sub
    // priority reorder, not a formation change.
    if (p1.isStarting === p2.isStarting) return !p1.isStarting;

    const playerOut = p1.isStarting ? p1 : p2;
    const playerIn = p1.isStarting ? p2 : p1;

    const nextStarting = startingXI.map(p => p.id === playerOut.id ? { ...playerIn, isStarting: true } : p);
    const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    nextStarting.forEach(p => counts[p.position as Position]++);

    return (
      counts.GK === 1 &&
      counts.DEF >= 3 && counts.DEF <= 5 &&
      counts.MID >= 2 && counts.MID <= 5 &&
      counts.FWD >= 1 && counts.FWD <= 3
    );
  };

  // Set of valid swap target IDs given the currently picked player
  const validSwapTargets = useMemo(() => {
    if (!playerToSub) return new Set<string>();
    const out = new Set<string>();
    [...startingXI, ...bench].forEach(p => {
      if (isSwapValid(playerToSub, p)) out.add(p.id);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerToSub, startingXI, bench]);

  // Drag-and-drop ref (sync with state for HTML5 DnD)
  const draggingRef = useRef<Player | null>(null);

  // Core swap routine used by both tap-to-sub and drag-and-drop. `confirmed`
  // bypasses the sub-off-forfeit warning once the user has accepted it.
  const performSwap = (p1: Player, p2: Player, confirmed = false) => {
    const lockMsg = playedLockReason(p1, p2);
    if (lockMsg) {
      alert(lockMsg);
      setPlayerToSub(null);
      return;
    }
    if (!isSwapValid(p1, p2)) {
      alert('Invalid formation!\n\n• 1 Goalkeeper\n• 3–5 Defenders\n• 2–5 Midfielders\n• 1–3 Forwards');
      setPlayerToSub(null);
      return;
    }

    // Bench-to-bench: swap their slots in the priority list. Nothing about
    // the starting XI, formation, or armbands changes.
    if (!p1.isStarting && !p2.isStarting) {
      const a = bench.findIndex(p => p.id === p1.id);
      const b = bench.findIndex(p => p.id === p2.id);
      if (a !== -1 && b !== -1) {
        const next = [...bench];
        [next[a], next[b]] = [next[b], next[a]];
        setBench(next);
        markDirty('You reordered your bench but haven’t saved your lineup.');
      }
      setPlayerToSub(null);
      setSelectedPlayer(null);
      return;
    }

    const playerOut = p1.isStarting ? p1 : p2;
    const playerIn = p1.isStarting ? p2 : p1;

    // Subbing OFF a player whose match has already kicked off is one-way:
    // saving forfeits the round points he's banked, and the played-lock then
    // prevents bringing him back into the XI this round. Warn before it's
    // committed — tap-to-sub, drag-and-drop and the modal Sub button all
    // funnel through here, so this one guard covers every entry point.
    if (!confirmed && nationStarted(playerOut)) {
      setSubOffWarning({ p1, p2 });
      setPlayerToSub(null);
      setSelectedPlayer(null);
      return;
    }

    const nextStarting = startingXI.map(p => p.id === playerOut.id ? { ...playerIn, isStarting: true } : p);
    const nextBench = bench.map(p => p.id === playerIn.id ? { ...playerOut, isStarting: false } : p);

    setStartingXI(nextStarting);
    setBench(nextBench);

    // Captain / vice transfer rules
    // The armband stays with the starting slot — the incoming player inherits it.
    if (captainId === playerOut.id) {
      setCaptainId(playerIn.id);
    }
    if (viceCaptainId === playerOut.id) {
      setViceCaptainId(playerIn.id);
    }

    // Update formation string
    const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    nextStarting.forEach(p => counts[p.position as Position]++);
    setFormation(`${counts.DEF}-${counts.MID}-${counts.FWD}`);

    setPlayerToSub(null);
    setSelectedPlayer(null);
    markDirty('You made a substitution but haven\u2019t saved your lineup.');
  };

  // Tap-based selection: first tap selects, second tap swaps
  const swapPlayer = (player: Player) => {
    if (!playerToSub) {
      setPlayerToSub(player);
      return;
    }
    if (playerToSub.id === player.id) {
      setPlayerToSub(null);
      return;
    }
    if (playerToSub.isStarting && player.isStarting) {
      setPlayerToSub(player); // Two starters: just switch focus
      return;
    }
    performSwap(playerToSub, player);
  };

  // After an admin Undo inside the shared PlayerDetailModal, the
  // server-side DELETE already decremented PlayerPerformance,
  // SquadPlayer.points and Team.totalPoints. We just need to re-pull
  // /api/squad/get so the per-card pill on the pitch reflects the new
  // values. Mirrors the 60s live-poll path elsewhere in this file.
  const handleAdjustmentReverted = useCallback(async () => {
    try {
      const sres = await fetch('/api/squad/get', { credentials: 'include' });
      if (!sres.ok) return;
      const sdata = await sres.json();
      if (!Array.isArray(sdata.squad)) return;
      const livePointsByPlayerId = new Map<string, number>();
      for (const sp of sdata.squad as Array<{ player: { id: string }; livePoints?: number; points?: number }>) {
        livePointsByPlayerId.set(sp.player.id, sp.livePoints ?? sp.points ?? 0);
      }
      const apply = (players: Player[]) =>
        players.map((p) => {
          const v = livePointsByPlayerId.get(p.id);
          return v !== undefined ? { ...p, points: v } : p;
        });
      setSquad((prev) => apply(prev));
      setStartingXI((prev) => apply(prev));
      setBench((prev) => apply(prev));
    } catch { /* non-fatal */ }
  }, []);

  // Touch devices get a dedicated long-press gesture instead of HTML5
  // drag-and-drop. iOS Safari hijacks long-press on `draggable` elements
  // into a janky native drag (ghost image, no drop targets highlighted),
  // which is why holding-to-sub felt rough. So: on touch we disable
  // `draggable` entirely and arm sub mode ourselves after a 300ms hold.
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
  }, []);

  const longPress = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean; x: number; y: number }>({
    timer: null, fired: false, x: 0, y: 0,
  });
  const longPressHandlers = (player: Player) => ({
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      longPress.current.x = t.clientX;
      longPress.current.y = t.clientY;
      longPress.current.fired = false;
      longPress.current.timer = setTimeout(() => {
        longPress.current.fired = true;
        setPlayerToSub(player);
        // Light haptic tick where supported (Android Chrome; no-op on iOS)
        try { navigator.vibrate?.(15); } catch { /* unsupported */ }
      }, 300);
    },
    onTouchMove: (e: React.TouchEvent) => {
      // Finger drifted — user is scrolling, not holding. Abort the press.
      const t = e.touches[0];
      if (Math.abs(t.clientX - longPress.current.x) > 12 || Math.abs(t.clientY - longPress.current.y) > 12) {
        if (longPress.current.timer) clearTimeout(longPress.current.timer);
        longPress.current.timer = null;
      }
    },
    onTouchEnd: () => {
      if (longPress.current.timer) clearTimeout(longPress.current.timer);
      longPress.current.timer = null;
    },
  });
  // The click that follows a completed long-press must not run the normal
  // tap action (it would instantly toggle sub mode back off).
  const consumeLongPress = () => {
    if (longPress.current.fired) {
      longPress.current.fired = false;
      return true;
    }
    return false;
  };

  // Drag handlers
  const handleDragStart = (player: Player) => (e: React.DragEvent) => {
    draggingRef.current = player;
    setPlayerToSub(player);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', player.id);
  };
  const handleDragEnd = () => {
    draggingRef.current = null;
  };
  const handleDragOver = (target: Player) => (e: React.DragEvent) => {
    const dragged = draggingRef.current;
    if (!dragged || !isSwapValid(dragged, target)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDrop = (target: Player) => (e: React.DragEvent) => {
    e.preventDefault();
    const dragged = draggingRef.current;
    if (!dragged) return;
    performSwap(dragged, target);
    draggingRef.current = null;
  };

  const setCaptain = (playerId: string) => {
    if (viceCaptainId === playerId) setViceCaptainId(null);
    setCaptainId(playerId);
    markDirty('You changed the captain but haven\u2019t saved.');
  };

  const setViceCaptain = (playerId: string) => {
    if (captainId === playerId) setCaptainId(null);
    setViceCaptainId(playerId);
    markDirty('You changed the vice-captain but haven\u2019t saved.');
  };

  // Save squad changes (view mode)
  const saveChanges = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/squad/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          startingXI: startingXI.map(p => p.id),
          bench: bench.map(p => p.id),
          captainId,
          viceCaptainId,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to save');
        return;
      }

      markClean();
      alert('Squad saved!');
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading || mode === 'loading') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6">
        {loadError ? (
          <div className="max-w-sm w-full bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/20 flex items-center justify-center mb-3">
              <X className="w-6 h-6 text-rose-400" />
            </div>
            <div className="text-white font-semibold mb-1">Something went wrong</div>
            <div className="text-white/60 text-sm mb-4">{loadError}</div>
            <button
              onClick={() => {
                setLoading(true);
                setLoadError(null);
                setLoadAttempt(a => a + 1);
              }}
              className="w-full bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-semibold py-2.5 rounded-lg transition"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-white/20 border-t-rose-400 rounded-full animate-spin" />
            <div className="text-white/60 text-sm">Loading your squad…</div>
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // BUILDER MODE
  // ============================================
  if (mode === 'builder') {
    const gks = squad.filter(p => p.position === 'GK');
    const defs = squad.filter(p => p.position === 'DEF');
    const mids = squad.filter(p => p.position === 'MID');
    const fwds = squad.filter(p => p.position === 'FWD');

    const progress = (squad.length / 15) * 100;
    return (
      <div
        className="max-w-5xl mx-auto px-0 sm:px-4 py-4 sm:py-6 sm:pb-6"
        style={{
          overflowX: 'auto',
          overflowY: 'visible',
          width: '100%',
          // Reserve space for the mobile sticky bottom bar PLUS the iPhone
          // home indicator. 6rem covers the bar; env() adds the safe area.
          paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))',
        }}
      >
        {/* Header */}
        <div className="px-3 sm:px-0 mb-5 sm:mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-[0_0_20px_rgba(244,63,94,0.45)]">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Build Your Squad</h1>
              <p className="text-white/50 text-xs sm:text-sm">Pick 15 players within your £100m budget</p>
            </div>
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard icon={<Users className="w-4 h-4" />} label="Players" value={`${squad.length}/15`} accent="text-white" />
            <StatCard icon={<Wallet className="w-4 h-4" />} label="Budget" value={`£${remainingBudget.toFixed(1)}m`} accent={remainingBudget >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <StatCard icon={<Coins className="w-4 h-4" />} label="Spent" value={`£${squadValue.toFixed(1)}m`} accent="text-amber-300" />
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-500 via-rose-500 to-amber-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Pitch */}
        <div className="relative rounded-2xl mb-6 overflow-hidden shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
          <PitchBg />
          <div className="relative z-10 p-2 sm:p-6 space-y-4 sm:space-y-6 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* FWD row */}
            <div className="flex justify-center gap-1.5 sm:gap-6 min-w-max sm:min-w-0 animate-slide-down">
              {[...Array(3)].map((_, i) => (
                fwds[i] ? (
                  <div key={fwds[i].id} className="group cursor-pointer flex-shrink-0" onClick={() => removePlayer(fwds[i].id)}>
                    <PlayerCard player={fwds[i]} showOpponent={getNextOpponent(fwds[i].nation?.code || '')} difficulty={getFixtureDifficulty(fwds[i].nation?.code || '', getNextOpponent(fwds[i].nation?.code || ''))} size="xs" />
                  </div>
                ) : (
                  <div key={`fwd-${i}`} className="flex-shrink-0">
                    <EmptySlot position="FWD" onClick={() => openModal('FWD')} />
                  </div>
                )
              ))}
            </div>

            {/* MID row */}
            <div className="flex justify-center gap-1 sm:gap-4 min-w-max sm:min-w-0 animate-slide-down" style={{ animationDelay: '60ms' }}>
              {[...Array(5)].map((_, i) => (
                mids[i] ? (
                  <div key={mids[i].id} className="group cursor-pointer flex-shrink-0" onClick={() => removePlayer(mids[i].id)}>
                    <PlayerCard player={mids[i]} showOpponent={getNextOpponent(mids[i].nation?.code || '')} difficulty={getFixtureDifficulty(mids[i].nation?.code || '', getNextOpponent(mids[i].nation?.code || ''))} size="xs" />
                  </div>
                ) : (
                  <div key={`mid-${i}`} className="flex-shrink-0">
                    <EmptySlot position="MID" onClick={() => openModal('MID')} />
                  </div>
                )
              ))}
            </div>

            {/* DEF row */}
            <div className="flex justify-center gap-1 sm:gap-4 min-w-max sm:min-w-0 animate-slide-down" style={{ animationDelay: '120ms' }}>
              {[...Array(5)].map((_, i) => (
                defs[i] ? (
                  <div key={defs[i].id} className="group cursor-pointer flex-shrink-0" onClick={() => removePlayer(defs[i].id)}>
                    <PlayerCard player={defs[i]} showOpponent={getNextOpponent(defs[i].nation?.code || '')} difficulty={getFixtureDifficulty(defs[i].nation?.code || '', getNextOpponent(defs[i].nation?.code || ''))} size="xs" />
                  </div>
                ) : (
                  <div key={`def-${i}`} className="flex-shrink-0">
                    <EmptySlot position="DEF" onClick={() => openModal('DEF')} />
                  </div>
                )
              ))}
            </div>

            {/* GK row */}
            <div className="flex justify-center gap-2 sm:gap-6 min-w-max sm:min-w-0 animate-slide-down" style={{ animationDelay: '180ms' }}>
              {[...Array(2)].map((_, i) => (
                gks[i] ? (
                  <div key={gks[i].id} className="group cursor-pointer flex-shrink-0" onClick={() => removePlayer(gks[i].id)}>
                    <PlayerCard player={gks[i]} showOpponent={getNextOpponent(gks[i].nation?.code || '')} difficulty={getFixtureDifficulty(gks[i].nation?.code || '', getNextOpponent(gks[i].nation?.code || ''))} size="xs" />
                  </div>
                ) : (
                  <div key={`gk-${i}`} className="flex-shrink-0">
                    <EmptySlot position="GK" onClick={() => openModal('GK')} />
                  </div>
                )
              ))}
            </div>
          </div>
        </div>

        {/* Desktop actions */}
        <div className="hidden sm:flex items-center justify-between px-3 sm:px-0">
          <button
            onClick={() => {
              if (squad.length === 0) return;
              setSquad([]);
              markDirty('You cleared your squad but haven\u2019t saved.');
            }}
            className="px-4 py-2 text-white/60 hover:text-white transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={saveSquad}
            disabled={saving || squad.length !== 15 || remainingBudget < 0}
            className="px-8 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-bold hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_10px_30px_-10px_rgba(244,63,94,0.6)]"
          >
            {saving ? 'Saving...' : 'Save Squad'}
          </button>
        </div>

        {/* Mobile sticky bottom bar */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-white/10 px-3 pt-2.5 add-pb-safe flex items-center justify-between gap-3">
          <button
            onClick={() => {
              if (squad.length === 0) return;
              setSquad([]);
              markDirty('You cleared your squad but haven\u2019t saved.');
            }}
            className="px-3 py-2 text-white/60 hover:text-white text-sm font-medium"
          >
            Clear
          </button>
          <button
            onClick={saveSquad}
            disabled={saving || squad.length !== 15 || remainingBudget < 0}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-black text-sm hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : `Save Squad (${squad.length}/15)`}
          </button>
        </div>

        {/* Player Selection Modal */}
        {showModal && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-3 sm:p-4 animate-fade-in"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 4.5rem)' }}
          >
            <div className="bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[82dvh] overflow-hidden border border-white/10 shadow-2xl">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${
                    selectingPosition === 'GK' ? 'bg-amber-500/20 text-amber-300' :
                    selectingPosition === 'DEF' ? 'bg-sky-500/20 text-sky-300' :
                    selectingPosition === 'MID' ? 'bg-emerald-500/20 text-emerald-300' :
                    'bg-rose-500/20 text-rose-300'
                  }`}>
                    {selectingPosition}
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-white">Select {selectingPosition}</h2>
                    <p className="text-xs text-white/40">Budget remaining: £{remainingBudget.toFixed(1)}m</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setSelectingPosition(null);
                    setTransferReplacingFor(null);
                  }}
                  className="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/5"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Filters */}
              <div className="p-4 border-b border-white/10 flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search players..."
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="search"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors"
                  />
                </div>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as 'price' | 'name')}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm cursor-pointer"
                >
                  <option value="price">By Price</option>
                  <option value="name">By Name</option>
                </select>
              </div>

              {/* Player List */}
              <div className="h-[50dvh] sm:h-auto sm:max-h-[55dvh] overflow-y-auto">
                {availablePlayers.length === 0 ? (
                  <div className="p-8 text-center text-white/40">No players available</div>
                ) : (
                  availablePlayers.map(player => (
                    <button
                      key={player.id}
                      onClick={() => addPlayer(player)}
                      className="w-full px-3 py-2 sm:px-4 sm:py-2.5 flex items-center gap-3 hover:bg-white/5 border-b border-white/5 text-left group transition-colors"
                    >
                      <PlayerFace
                        photoUrl={player.photoUrl}
                        primaryColor={player.nation?.kitColor1 || '#FFF'}
                        secondaryColor={player.nation?.kitColor2 || '#000'}
                        number={player.shirtNumber}
                        nationCode={player.nation?.code || ''}
                        size="xs"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate flex items-center gap-1.5">
                          {player.displayName}
                          {player.isAvailable === false && (
                            <span
                              className="shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 ring-1 ring-red-500/40"
                              title={player.availabilityNote || 'Unavailable'}
                            >
                              {player.availabilityNote || 'OUT'}
                            </span>
                          )}
                          <LastMatchChip player={player} />
                        </p>
                        <p className="text-white/40 text-xs flex items-center gap-1.5">
                          <img src={getFlagUrl(player.nation?.code || '')} alt="" className="w-4 h-3 rounded-[2px] object-cover" />
                          {player.nation?.name}
                        </p>
                      </div>
                      <p className="text-emerald-400 text-sm font-bold whitespace-nowrap">£{player.currentPrice.toFixed(1)}m</p>
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); setPickerInfoPlayer(player); }}
                        className="shrink-0 w-6 h-6 rounded-full ring-1 ring-white/20 text-white/50 hover:text-white hover:ring-white/50 flex items-center justify-center text-[11px] font-serif italic font-bold cursor-pointer"
                        title="View player details"
                      >
                        i
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {pickerInfoPlayer && (
          <PlayerDetailModal
            player={pickerInfoPlayer}
            isCaptain={false}
            isViceCaptain={false}
            isStarting={false}
            isAdmin={isAdmin}
            readOnly
            hideRole
            onClose={() => setPickerInfoPlayer(null)}
          />
        )}
      </div>
    );
  }

  // ============================================
  // VIEW MODE (Starting 11 + Bench)
  // ============================================
  
  // All formations - we'll filter based on available players
  const ALL_FORMATIONS = [
    '4-4-2', '4-3-3', '4-5-1', '4-4-1-1', '4-2-3-1', '4-3-2-1', '4-1-2-3', '4-1-4-1', '4-2-2-2', '4-1-3-2',
    '3-5-2', '3-4-3', '3-4-2-1', '3-5-1-1', '3-4-1-2',
    '5-3-2', '5-4-1', '5-2-2-1', '5-3-1-1',
  ];
  
  // Parse formation to get DEF-MID-FWD counts
  const parseFormation = (f: string): { def: number; mid: number; fwd: number } => {
    const parts = f.split('-').map(Number);
    const def = parts[0];
    const fwd = parts[parts.length - 1];
    const mid = 10 - def - fwd;
    return { def, mid, fwd };
  };
  
  // Count available players by position (all 15 in squad)
  const allSquadPlayers = [...startingXI, ...bench];
  const availableGKs = allSquadPlayers.filter(p => p.position === 'GK').length;
  const availableDEFs = allSquadPlayers.filter(p => p.position === 'DEF').length;
  const availableMIDs = allSquadPlayers.filter(p => p.position === 'MID').length;
  const availableFWDs = allSquadPlayers.filter(p => p.position === 'FWD').length;
  
  // Filter formations that are possible with current squad
  const validFormations = ALL_FORMATIONS.filter(f => {
    const { def, mid, fwd } = parseFormation(f);
    return def <= availableDEFs && mid <= availableMIDs && fwd <= availableFWDs;
  });
  
  // Change formation
  const changeFormation = (newFormation: string) => {
    const { def, mid, fwd } = parseFormation(newFormation);
    
    const gkPlayers = allSquadPlayers.filter(p => p.position === 'GK');
    const defPlayers = allSquadPlayers.filter(p => p.position === 'DEF');
    const midPlayers = allSquadPlayers.filter(p => p.position === 'MID');
    const fwdPlayers = allSquadPlayers.filter(p => p.position === 'FWD');
    
    // Build new starting 11
    const newStarting: Player[] = [
      gkPlayers[0],
      ...defPlayers.slice(0, def),
      ...midPlayers.slice(0, mid),
      ...fwdPlayers.slice(0, fwd),
    ].filter(Boolean);
    
    // Everyone else goes to bench
    const startingIds = new Set(newStarting.map(p => p.id));
    const newBench = allSquadPlayers.filter(p => !startingIds.has(p.id));
    
    setStartingXI(newStarting.map(p => ({ ...p, isStarting: true })));
    setBench(newBench.map(p => ({ ...p, isStarting: false })));
    setFormation(newFormation);
    markDirty('You changed your formation but haven\u2019t saved.');
  };
  
  // Current players on pitch by position
  const gks = startingXI.filter(p => p.position === 'GK');
  const defs = startingXI.filter(p => p.position === 'DEF');
  const mids = startingXI.filter(p => p.position === 'MID');
  const fwds = startingXI.filter(p => p.position === 'FWD');

  // Render helper for pitch player cards (DRY) – includes drag/drop + highlight logic
  const renderPitchPlayer = (p: Player) => {
    const opponent = getNextOpponent(p.nation?.code || '');
    const difficulty = getFixtureDifficulty(p.nation?.code || '', opponent);
    const isSelected = playerToSub?.id === p.id;
    const isValid = !!playerToSub && !isSelected && validSwapTargets.has(p.id);
    const isDimmed = !!playerToSub && !isSelected && !validSwapTargets.has(p.id);
    return (
      <div
        key={p.id}
        className="flex-shrink-0 select-none [-webkit-touch-callout:none]"
        {...longPressHandlers(p)}
      >
        <PlayerCard
          player={p}
          onClick={() => {
            if (consumeLongPress()) return;
            if (playerToSub) {
              if (isValid || isSelected) {
                swapPlayer(p);
              } else {
                // Just refocus to a same-side selection – or open detail
                setSelectedPlayer(p);
              }
            } else {
              setSelectedPlayer(p);
            }
          }}
          showOpponent={opponent}
          difficulty={difficulty}
          livePoints={p.points}
          isCaptain={captainId === p.id}
          isViceCaptain={viceCaptainId === p.id}
          selectedForSub={isSelected}
          validTarget={isValid}
          dimmed={isDimmed}
          draggable={!isTouch}
          onDragStart={handleDragStart(p)}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver(p)}
          onDrop={handleDrop(p)}
          size="xs"
        />
      </div>
    );
  };

  // Total points across squad
  const totalPoints = allSquadPlayers.reduce((sum, p) => sum + (p.points || 0), 0);

  // Next gameweek countdown – first upcoming fixture across whole tournament.
  // parseFixtureDateTime anchors the schedule to Eastern Time so the cutoff
  // matches reality regardless of where the user (or our Vercel region) is.
  const nextFixture = WORLD_CUP_FIXTURES
    .map(f => ({ ...f, dt: parseFixtureDateTime(f.date, f.time) }))
    .filter(f => f.dt > new Date())
    .sort((a, b) => a.dt.getTime() - b.dt.getTime())[0];

  // Countdown to next kickoff. `formatDuration` returns "—" once we're past
  // kickoff (matchday window) which is the right thing to show in the tile.
  const countdownStr = nextFixture ? formatDuration(nextFixture.dt.getTime(), now) : '—';

  // Squad-lock deadline: 1 hour before the first match of the upcoming
  // gameweek (see DEADLINE_OFFSET_MS in @/lib/format-time). We approximate
  // "first match of the gameweek" as the next fixture in chronological
  // order – exactly right pre-tournament and during the gap between
  // matchdays. Once the tournament is in full swing we may want to anchor
  // this on the Stage record's `deadline` field instead.
  let deadlineDateShort = '—';
  let deadlineHint = '';
  if (nextFixture) {
    const dl = deadlineFor(nextFixture.dt);
    deadlineDateShort = formatDateShort(dl, timezone);
    const timeStr = formatTime(dl, timezone);
    const countdown = fmtCountdown(dl.getTime(), now, 'Locked');
    deadlineHint = `${timeStr} · ${countdown}`;
  }

  // ============================================
  // TRANSFER MODE — pitch layout for swaps
  // ============================================
  if (transferMode) {
    // Group the projected squad by position. We always show 2 GK / 5 DEF /
    // 5 MID / 3 FWD slots regardless of formation — transfer mode is
    // squad-level, not lineup-level.
    const tGks = transferDisplaySquad.filter((p) => p.position === 'GK');
    const tDefs = transferDisplaySquad.filter((p) => p.position === 'DEF');
    const tMids = transferDisplaySquad.filter((p) => p.position === 'MID');
    const tFwds = transferDisplaySquad.filter((p) => p.position === 'FWD');

    // Renders one player card as a single tap target.
    //
    // Earlier iterations rendered a 44×44pt SWAP/UNDO button overlapping
    // the bottom-right corner — on xs cards (~58px wide) that button was
    // larger than the card itself, crowded the name plate, AND overlapped
    // the SWAP button on the adjacent card thanks to the tight pitch
    // spacing. The fix:
    //   • The entire card is the button. Tapping a normal slot opens the
    //     replacement picker. Tapping a pending-incoming card reverts it.
    //   • The amber glow ring stays as the primary "this is pending"
    //     affordance, and a compact UNDO pill renders below the name
    //     plate so users can spot the action without poking around.
    //   • A small swap-arrows icon sits in the top-right corner of the
    //     kit (where the live-points pill normally lives, which is never
    //     shown in transfer mode) as a discoverability hint.
    const renderTransferCard = (p: Player) => {
      const incoming = isPendingIncoming(p.id);
      // Already queued OUT on the server (made in an earlier locked-round
      // session). Without the violet marker users re-sell the same player:
      // the server rejects it, but only after they've been through the
      // whole picker flow.
      const queuedOut = queuedTransfers.some((t) => t.playerOut?.id === p.id);
      return (
        <button
          key={p.id}
          type="button"
          onClick={() => {
            if (incoming) return undoTransfer(p.id);
            if (queuedOut) {
              alert(`${p.displayName} already has a transfer queued for next round.\n\nCancel it from the "Queued for next round" card on the squad page if you change your mind.`);
              return;
            }
            startReplace(p);
          }}
          aria-label={incoming ? `Undo swap for ${p.displayName}` : `Replace ${p.displayName}`}
          className="relative flex-shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 rounded-2xl"
        >
          <div
            className={
              incoming
                ? 'rounded-2xl ring-2 ring-amber-400 shadow-[0_0_22px_rgba(251,191,36,0.45)]'
                : queuedOut
                  ? 'rounded-2xl ring-2 ring-violet-400 shadow-[0_0_22px_rgba(167,139,250,0.45)]'
                  : 'rounded-2xl ring-1 ring-transparent group-active:ring-laliga-gold/40 transition'
            }
          >
            <PlayerCard
              player={p}
              showOpponent={getNextOpponent(p.nation?.code || '')}
              difficulty={getFixtureDifficulty(
                p.nation?.code || '',
                getNextOpponent(p.nation?.code || ''),
              )}
              size="xs"
            />
          </div>

          {/* Top-right corner affordance — sits inside the card, never
              spills past the kit edge, so adjacent cards never collide.
              The points-pill slot is unused in transfer mode so this
              never fights for space with anything else. */}
          <span
            className={`absolute -top-1 -right-1 z-20 w-[22px] h-[22px] rounded-full flex items-center justify-center shadow-md pointer-events-none ${
              incoming
                ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-200'
                : 'bg-laliga-gold text-laliga-dark ring-1 ring-amber-100/30'
            }`}
            aria-hidden="true"
          >
            {incoming ? (
              <RotateCcw className="w-3 h-3" />
            ) : (
              <ArrowLeftRight className="w-3 h-3" />
            )}
          </span>

          {/* Pending-incoming caption. Sits *below* the name plate so the
              card itself stays the same size — keeps the pitch layout
              identical between pending and clean states. */}
          {incoming && (
            <span
              className="mt-1 mx-auto block w-fit px-2 py-[2px] rounded-full bg-amber-400 text-amber-950 text-[9px] font-black tracking-wider shadow"
              aria-hidden="true"
            >
              UNDO
            </span>
          )}
          {queuedOut && !incoming && (
            <span
              className="mt-1 mx-auto block w-fit px-2 py-[2px] rounded-full bg-violet-400 text-violet-950 text-[9px] font-black tracking-wider shadow"
              aria-hidden="true"
            >
              QUEUED
            </span>
          )}
        </button>
      );
    };

    return (
      <div
        className="max-w-5xl mx-auto px-0 sm:px-4 py-4 sm:py-6"
        style={{
          // Reserve room for BOTH sticky bars (top + bottom) and iPhone
          // safe-area insets.
          paddingTop: 'calc(env(safe-area-inset-top))',
          paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))',
        }}
      >
        {/* Sticky top bar: budget / free / hits. We keep it inside the page
            container (not fixed) so it scrolls correctly above the pitch on
            short viewports. The sticky-position keeps it pinned during the
            "scroll the picker" interaction. */}
        <div className="sticky top-0 z-30 bg-[#0a0e17]/95 backdrop-blur-md border-b border-white/10 -mx-0 sm:-mx-4 px-3 sm:px-4 py-3 mb-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (pendingTransfers.length > 0) {
                    setDiscardConfirmOpen(true);
                  } else {
                    exitTransferMode();
                  }
                }}
                className="text-white/60 hover:text-white text-xs sm:text-sm font-medium px-2 py-1.5 rounded-lg hover:bg-white/5"
              >
                ← Back
              </button>
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">TRANSFERS</h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs">
              <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-white/50 mr-1">Bank</span>
                <span className={`font-black ${projectedBank < 0 ? 'text-red-400' : 'text-emerald-300'}`}>
                  £{projectedBank.toFixed(1)}m
                </span>
              </div>
              {/* Free-transfer counter. While transfers are unlimited
                  (pre-tournament + wildcard/free-hit weeks) we show ∞
                  rather than a number, and we drop the Hit pill entirely
                  below since no deduction can apply. */}
              <div className="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20">
                <span className="text-white/50 mr-1">Free</span>
                <span className="font-black text-sky-300">
                  {unlimitedTransfers
                    ? '∞'
                    : Math.max(0, freeTransfers - pendingTransfers.length)}
                </span>
              </div>
              {stageLocked ? (
                <div className="px-2.5 py-1 rounded-lg bg-violet-500/15 border border-violet-500/30">
                  <span className="font-black text-violet-300">Next round</span>
                </div>
              ) : (
                !unlimitedTransfers && (
                  <div
                    className={`px-2.5 py-1 rounded-lg border ${
                      transferHitCost > 0
                        ? 'bg-red-500/15 border-red-500/30'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <span className="text-white/50 mr-1">Hit</span>
                    <span
                      className={`font-black ${transferHitCost > 0 ? 'text-red-300' : 'text-white/70'}`}
                    >
                      {transferHitCost > 0 ? `-${transferHitCost}` : '0'}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
          <p className="text-[11px] text-white/40">
            Tap a player to{' '}
            <span className="text-laliga-gold font-bold">replace</span> them.
            Pending swaps glow amber — tap again to{' '}
            <span className="text-amber-300 font-bold">undo</span>.
          </p>
          {stageLocked && (
            <div className="mt-2 px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-500/30 text-[11px] sm:text-xs text-violet-200 leading-snug">
              This round is being played, so your current squad is locked in.
              Transfers you confirm now are <span className="font-bold">queued</span> and
              applied automatically the moment the next round starts.
              {overQueueLimit && (
                <span className="block mt-1 text-red-300 font-bold">
                  You only have {freeTransfers} free transfer{freeTransfers === 1 ? '' : 's'} to
                  queue — point hits aren&apos;t available mid-round.
                </span>
              )}
            </div>
          )}
        </div>

        {transferError && (
          <div className="mx-3 sm:mx-0 mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
            {transferError}
          </div>
        )}

        {/* Pitch */}
        <div className="relative rounded-2xl mb-6 overflow-hidden shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
          <PitchBg />
          <div
            className="relative z-10 p-2 sm:p-6 space-y-4 sm:space-y-6 overflow-x-auto scrollbar-hide"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="flex justify-center gap-1.5 sm:gap-6 min-w-max sm:min-w-0">
              {tFwds.map(renderTransferCard)}
            </div>
            <div className="flex justify-center gap-1 sm:gap-4 min-w-max sm:min-w-0">
              {tMids.map(renderTransferCard)}
            </div>
            <div className="flex justify-center gap-1 sm:gap-4 min-w-max sm:min-w-0">
              {tDefs.map(renderTransferCard)}
            </div>
            <div className="flex justify-center gap-2 sm:gap-6 min-w-max sm:min-w-0">
              {tGks.map(renderTransferCard)}
            </div>
          </div>
        </div>

        {/* Sticky bottom action bar — fixed at viewport bottom on mobile so
            it survives Safari address-bar collapse without jumping. iOS
            safe-area inset is added on top of the 1rem base padding. */}
        <div
          className="fixed bottom-0 left-0 right-0 z-30 bg-[#0a0e17]/95 backdrop-blur-md border-t border-white/10 px-3 sm:px-4 py-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-5xl mx-auto flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                if (pendingTransfers.length > 0) {
                  setDiscardConfirmOpen(true);
                } else {
                  exitTransferMode();
                }
              }}
              className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-sm font-bold border border-white/10"
            >
              {pendingTransfers.length > 0 ? 'Discard' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={submitTransfers}
              disabled={pendingTransfers.length === 0 || transferSubmitting || projectedBank < 0 || overQueueLimit}
              className={`flex-1 px-4 py-3 rounded-xl text-white font-black text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all ${
                stageLocked
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-400 hover:to-fuchsia-500'
                  : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500'
              }`}
            >
              {transferSubmitting
                ? stageLocked ? 'Queueing…' : 'Confirming…'
                : pendingTransfers.length === 0
                ? 'No transfers yet'
                : stageLocked
                ? `Queue ${pendingTransfers.length} transfer${pendingTransfers.length === 1 ? '' : 's'} for next round`
                : `Confirm ${pendingTransfers.length} transfer${pendingTransfers.length === 1 ? '' : 's'}${
                    !unlimitedTransfers && transferHitCost > 0
                      ? ` · -${transferHitCost} pts`
                      : ''
                  }`}
            </button>
          </div>
        </div>

        {/* Player Selection Modal — reuses the same modal markup as the
            builder. The transfer-mode branch is selected automatically
            because `transferReplacingFor` is set; addPlayer() forwards to
            commitTransfer() in that case. */}
        {showModal && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-3 sm:p-4 animate-fade-in"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 4.5rem)' }}
          >
            <div className="bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[82dvh] overflow-hidden border border-white/10 shadow-2xl">
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm flex-shrink-0 ${
                      selectingPosition === 'GK'
                        ? 'bg-amber-500/20 text-amber-300'
                        : selectingPosition === 'DEF'
                        ? 'bg-sky-500/20 text-sky-300'
                        : selectingPosition === 'MID'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {selectingPosition}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-white truncate">
                      Replace {transferReplacingFor?.displayName}
                    </h2>
                    {/* The previous "Budget after refund" copy read like a
                        post-transfer bank balance and was confusing — it's
                        actually the maximum price for a *single* replacement
                        (current bank + refund from the player going out). */}
                    <p className="text-xs text-white/40">
                      Bank £{bankBalance.toFixed(1)}m + refund £
                      {(transferReplacingFor?.currentPrice ?? 0).toFixed(1)}m ·
                      max £
                      {(
                        bankBalance + (transferReplacingFor?.currentPrice ?? 0)
                      ).toFixed(1)}
                      m per pick
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setSelectingPosition(null);
                    setTransferReplacingFor(null);
                  }}
                  className="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/5 flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 border-b border-white/10 flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search players..."
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors"
                  />
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'price' | 'name')}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm cursor-pointer"
                >
                  <option value="price">By Price</option>
                  <option value="name">By Name</option>
                </select>
              </div>

              <div className="h-[50dvh] sm:h-auto sm:max-h-[55dvh] overflow-y-auto">
                {availablePlayers.length === 0 ? (
                  <div className="p-8 text-center text-white/40">
                    No players available within budget for this slot.
                  </div>
                ) : (
                  availablePlayers.map((player) => (
                    <button
                      key={player.id}
                      onClick={() => addPlayer(player)}
                      className="w-full px-3 py-2 sm:px-4 sm:py-2.5 flex items-center gap-3 hover:bg-white/5 border-b border-white/5 text-left group transition-colors"
                    >
                      <PlayerFace
                        photoUrl={player.photoUrl}
                        primaryColor={player.nation?.kitColor1 || '#FFF'}
                        secondaryColor={player.nation?.kitColor2 || '#000'}
                        number={player.shirtNumber}
                        nationCode={player.nation?.code || ''}
                        size="xs"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate flex items-center gap-1.5">
                          {player.displayName}
                          {player.isAvailable === false && (
                            <span
                              className="shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 ring-1 ring-red-500/40"
                              title={player.availabilityNote || 'Unavailable'}
                            >
                              {player.availabilityNote || 'OUT'}
                            </span>
                          )}
                          <LastMatchChip player={player} />
                        </p>
                        <p className="text-white/40 text-xs flex items-center gap-1.5">
                          <img
                            src={getFlagUrl(player.nation?.code || '')}
                            alt=""
                            className="w-4 h-3 rounded-[2px] object-cover"
                          />
                          {player.nation?.name}
                        </p>
                      </div>
                      <p className="text-emerald-400 text-sm font-bold whitespace-nowrap">
                        £{player.currentPrice.toFixed(1)}m
                      </p>
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); setPickerInfoPlayer(player); }}
                        className="shrink-0 w-6 h-6 rounded-full ring-1 ring-white/20 text-white/50 hover:text-white hover:ring-white/50 flex items-center justify-center text-[11px] font-serif italic font-bold cursor-pointer"
                        title="View player details"
                      >
                        i
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Discard-confirm dialog — only shows when there are pending
            transfers to throw away. Plain modal, no Portal needed because
            this entire render branch already lives at the top of the
            view-mode tree. */}
        {discardConfirmOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-slate-900 rounded-2xl w-full max-w-sm border border-white/10 p-5">
              <h3 className="text-lg font-black text-white mb-2">Discard pending transfers?</h3>
              <p className="text-sm text-white/60 mb-5">
                You&apos;ll lose your {pendingTransfers.length} pending change
                {pendingTransfers.length === 1 ? '' : 's'}. This can&apos;t be undone.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setDiscardConfirmOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-sm font-semibold"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDiscardConfirmOpen(false);
                    exitTransferMode();
                  }}
                  className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 text-sm font-bold"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Inspect-from-picker modal — must be mounted in THIS branch too:
            transfer mode has its own return, and a modal mounted only in
            the view branch stays invisible until the user leaves transfers
            (the "card showed up after I cancelled" bug). */}
        {pickerInfoPlayer && (
          <PlayerDetailModal
            player={pickerInfoPlayer}
            isCaptain={false}
            isViceCaptain={false}
            isStarting={false}
            isAdmin={isAdmin}
            readOnly
            hideRole
            onClose={() => setPickerInfoPlayer(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="max-w-5xl mx-auto px-0 sm:px-4 py-4 sm:py-6 sm:pb-6"
      style={{
        overflowX: 'auto',
        overflowY: 'visible',
        width: '100%',
        paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))',
      }}
    >
      {/* Header */}
      <div className="px-3 sm:px-0 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.45)]">
              <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">My Squad</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] sm:text-xs uppercase tracking-wider text-white/40 font-bold">Next match in</span>
                <span className="text-[11px] sm:text-xs text-amber-300 font-black">{countdownStr}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <FormationPicker formations={validFormations} current={formation} onChange={changeFormation} />
            <button
              type="button"
              onClick={enterTransferMode}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-amber-950 hover:from-amber-300 hover:to-orange-400 text-xs sm:text-sm font-black shadow-[0_4px_16px_rgba(245,158,11,0.35)] hover:shadow-[0_4px_20px_rgba(245,158,11,0.5)] active:scale-95 transition-all"
              title="Make transfers"
            >
              <ArrowLeftRight className="w-4 h-4" strokeWidth={2.5} />
              <span>Transfers</span>
              {queuedTransfers.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-amber-950/20 text-[10px] font-black">
                  {queuedTransfers.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard icon={<Trophy className="w-4 h-4" />} label="Total Pts" value={`${totalPoints}`} accent="text-emerald-400" highlight />
          <StatCard icon={<Coins className="w-4 h-4" />} label="Value" value={`£${teamValue.toFixed(1)}m`} accent="text-white" />
          <StatCard icon={<Wallet className="w-4 h-4" />} label="Bank" value={`£${bankBalance.toFixed(1)}m`} accent="text-emerald-300" />
          <StatCard
            icon={<Zap className="w-4 h-4" />}
            label="Deadline"
            value={deadlineDateShort}
            hint={deadlineHint}
            accent="text-amber-300"
          />
        </div>
      </div>

      {/* Free Hit live banner – shown when the chip is currently active so the
          user is reminded their squad will revert at end of stage. */}
      {chips.some(c => c.id === 'FREE_HIT' && c.active) && (
        <div className="px-3 sm:px-0 mb-3">
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent p-3 sm:p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Wand2 className="w-5 h-5 text-amber-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-amber-200 font-black text-sm sm:text-base flex items-center gap-2 flex-wrap">
                Free Hit Active
                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  This stage only
                </span>
              </div>
              <p className="text-amber-200/70 text-xs sm:text-sm mt-0.5 leading-snug">
                Make as many transfers as you like. Your squad will automatically revert to its previous lineup once this stage ends.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Queued-transfers card — swaps confirmed while the round was locked.
          They execute automatically at the next stage boundary; until then
          each row can be cancelled (which refunds the free transfer). */}
      {queuedTransfers.length > 0 && (
        <div className="px-3 sm:px-0 mb-3">
          <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-r from-violet-500/15 via-violet-500/10 to-transparent p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                <ArrowLeftRight className="w-4 h-4 text-violet-300" />
              </div>
              <div className="min-w-0">
                <p className="text-violet-200 font-black text-sm">
                  Queued for next round
                </p>
                <p className="text-violet-200/60 text-[11px] leading-snug">
                  These swaps happen automatically when the next round starts.
                </p>
              </div>
            </div>
            <ul className="space-y-1.5">
              {queuedTransfers.map((t) => (
                <li
                  key={`${t.playerOut?.id}-${t.playerIn?.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl bg-white/5 border border-white/10 px-2.5 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0 text-xs sm:text-sm">
                    <span className="text-white/60 truncate">{t.playerOut?.displayName ?? 'Unknown'}</span>
                    <span className="text-violet-300 font-bold flex-shrink-0">→</span>
                    <span className="text-white font-semibold truncate">{t.playerIn?.displayName ?? 'Unknown'}</span>
                    <span className="hidden sm:inline text-white/40 text-[10px] flex-shrink-0">
                      £{t.priceOut.toFixed(1)}m → £{t.priceIn.toFixed(1)}m
                    </span>
                  </div>
                  {t.playerIn && (
                    <button
                      type="button"
                      onClick={() => cancelQueuedTransfer(t.playerIn!.id)}
                      disabled={queueCancelling === t.playerIn.id}
                      className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 text-[10px] font-bold disabled:opacity-50 transition-colors"
                    >
                      {queueCancelling === t.playerIn.id ? '…' : 'Cancel'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Chips Bar — compact letter badges. Tapping ANY chip (even a used
          or locked one) opens the detail popup, which carries the full
          plain-English explanation and the activate/cancel actions. */}
      {chips.length > 0 && (
        <div className="px-3 sm:px-0 mb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest flex items-center gap-1 mr-1">
              <Sparkles className="w-3 h-3" />
              Chips
            </span>
            {chips.map(chip => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setChipConfirm(chip)}
                aria-label={`${chip.name}: ${chip.active ? 'active' : chip.used ? 'used' : chip.available ? 'available' : 'unavailable'}`}
                className={`relative px-2.5 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all active:scale-95 ${
                  chip.active
                    ? 'bg-gradient-to-br from-emerald-500/40 to-emerald-700/30 ring-1 ring-emerald-400 text-emerald-100 shadow-[0_0_14px_rgba(16,185,129,0.45)]'
                    : chip.used
                    ? 'bg-white/[0.03] ring-1 ring-white/5 text-white/25 line-through'
                    : chip.available
                    ? 'bg-white/5 ring-1 ring-white/15 text-white/80 hover:bg-white/10 hover:ring-white/30 hover:-translate-y-0.5'
                    : 'bg-white/[0.03] ring-1 ring-white/5 text-white/30'
                }`}
              >
                {chip.name}
                {chip.active && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-slate-950 animate-pulse" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chip detail popup — opens for every chip regardless of state. The
          full plain-English pitch lives here so the bar can stay tiny. */}
      {chipConfirm && (() => {
        const chip = chipConfirm;
        const Icon = chipIcon(chip.name);
        const info = chipExplain(chip.id);
        return (
          <div
            className="fixed inset-0 bg-black/80 z-[9999] backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setChipConfirm(null)}
          >
            <div
              className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-scale-in"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className={`px-5 pt-5 pb-4 flex items-center gap-3 ${
                chip.active
                  ? 'bg-gradient-to-r from-emerald-500/20 to-transparent'
                  : 'bg-gradient-to-r from-rose-500/15 via-purple-500/10 to-transparent'
              }`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                  chip.active ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10 text-white'
                }`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-white leading-tight">{chip.name}</h3>
                  <span className={`inline-block mt-0.5 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    chip.active
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : chip.used
                      ? 'bg-white/10 text-white/40'
                      : chip.available
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'bg-white/10 text-white/40'
                  }`}>
                    {chip.active ? 'Active now' : chip.used ? 'Already used' : chip.available ? 'Ready to use' : 'Not available'}
                  </span>
                </div>
              </div>

              <div className="px-5 py-4">
                <p className="text-white font-bold text-sm mb-3">{info.tagline}</p>
                <ul className="space-y-2 mb-4">
                  {info.points.map((pt, i) => (
                    <li key={i} className="flex gap-2 text-white/70 text-xs leading-relaxed">
                      <span className="text-emerald-400 font-black shrink-0">✓</span>
                      {pt}
                    </li>
                  ))}
                </ul>
                <p className="text-white/35 text-[11px] leading-relaxed mb-1">
                  You can run more than one chip in the same stage. Triple Captain, Bench Boost
                  and Free Hit come back when the knockouts start, so you get each once in the
                  groups and once in the knockouts. Wildcards are one each: the first for the
                  groups, the second for the knockouts.
                  {!chip.active && !chip.used && ' You can change your mind and cancel it any time before the stage deadline.'}
                </p>
                {chip.active && chipDeadline && !stageLocked && (
                  <p className="text-emerald-300/80 text-[11px] font-semibold">
                    Locks in {formatCountdown(chipDeadline, now)}. After that it&apos;s spent.
                  </p>
                )}
                {chip.active && stageLocked && (
                  <p className="text-white/40 text-[11px] font-semibold">Locked in. The stage has started.</p>
                )}
                {chip.active && !chip.canCancel && chip.cancelBlockedReason && (
                  <p className="text-amber-300/80 text-[11px] mt-1">{chip.cancelBlockedReason}</p>
                )}
              </div>

              {/* Actions */}
              <div className="px-5 pb-5 flex gap-3">
                <button
                  onClick={() => setChipConfirm(null)}
                  className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white/70 font-medium hover:bg-white/10 transition-colors"
                >
                  {chip.available ? 'Not now' : 'Close'}
                </button>
                {chip.available && (
                  <button
                    onClick={() => activateChip(chip.id)}
                    disabled={chipLoading}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl text-white font-bold hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 transition-all"
                  >
                    {chipLoading ? 'Activating...' : `Use ${chip.name}`}
                  </button>
                )}
                {chip.active && chip.canCancel && (
                  <button
                    onClick={() => { setChipConfirm(null); setChipCancelConfirm(chip); }}
                    disabled={chipLoading}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 rounded-xl text-white font-bold hover:from-rose-600 hover:to-rose-700 disabled:opacity-50 transition-all"
                  >
                    Cancel chip
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Chip Cancellation Modal */}
      {chipCancelConfirm && (
        <div
          className="fixed inset-0 bg-black/80 z-[9999] backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setChipCancelConfirm(null)}
        >
          <div
            className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-2">Cancel {chipCancelConfirm.name}?</h3>
            <p className="text-white/60 text-sm mb-3">
              Your {chipCancelConfirm.name} will be returned and you can use it again later.
            </p>
            {chipCancelConfirm.id === 'FREE_HIT' && (
              <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <p className="text-amber-300 text-xs font-semibold mb-1">Heads up</p>
                <p className="text-amber-200/80 text-xs leading-snug">
                  Any transfers you made under Free Hit will be reverted &mdash; your squad goes
                  back to exactly what it was before activation.
                </p>
              </div>
            )}
            {chipDeadline && !stageLocked && (
              <p className="text-emerald-300/80 text-xs mb-6">
                Stage locks in {formatCountdown(chipDeadline, now)}.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setChipCancelConfirm(null)}
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white/70 font-medium hover:bg-white/10 transition-colors"
              >
                Keep it active
              </button>
              <button
                onClick={cancelActiveChip}
                disabled={chipLoading}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 rounded-xl text-white font-bold hover:from-rose-600 hover:to-rose-700 disabled:opacity-50 transition-all"
              >
                {chipLoading ? 'Cancelling...' : 'Cancel chip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile gesture hint — desktop gets the equivalent line under the pitch */}
      <p className="sm:hidden px-3 mb-2 text-center text-[10px] text-white/30 font-medium">
        Tap a player for details · hold to substitute
      </p>

      {/* Pitch */}
      <div className="relative rounded-2xl mb-5 sm:mb-6 overflow-hidden shadow-[0_20px_60px_-20px_rgba(0,0,0,0.65)] ring-1 ring-white/10">
        <PitchBg />
        <div className="relative z-10 p-2 sm:p-6 space-y-4 sm:space-y-7 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* FWD */}
          <div className="flex justify-center gap-1.5 sm:gap-6 min-w-max sm:min-w-0 animate-slide-down">
            {fwds.map(renderPitchPlayer)}
          </div>

          {/* MID */}
          <div className="flex justify-center gap-1 sm:gap-4 min-w-max sm:min-w-0 animate-slide-down" style={{ animationDelay: '60ms' }}>
            {mids.map(renderPitchPlayer)}
          </div>

          {/* DEF */}
          <div className="flex justify-center gap-1 sm:gap-4 min-w-max sm:min-w-0 animate-slide-down" style={{ animationDelay: '120ms' }}>
            {defs.map(renderPitchPlayer)}
          </div>

          {/* GK */}
          <div className="flex justify-center gap-2 sm:gap-6 min-w-max sm:min-w-0 animate-slide-down" style={{ animationDelay: '180ms' }}>
            {gks.map(renderPitchPlayer)}
          </div>
        </div>

        {/* Sub-mode floating banner */}
        {playerToSub && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-amber-500/95 text-black text-[11px] sm:text-xs font-black shadow-lg flex items-center gap-2 backdrop-blur-sm">
            <RefreshCw className="w-3 h-3 animate-spin-slow" />
            <span>Pick a player to swap with <span className="underline">{playerToSub.displayName}</span></span>
            <button
              onClick={() => setPlayerToSub(null)}
              className="ml-1 w-4 h-4 rounded-full bg-black/20 flex items-center justify-center hover:bg-black/30"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
      </div>

      {/* Bench / Dugout */}
      <div className="px-3 sm:px-0 mb-5">
        <div className="relative rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-xl">
          {/* Dugout roof */}
          <div className="h-2 bg-gradient-to-b from-slate-700 to-slate-900" />
          <div className="bg-gradient-to-b from-slate-900 via-slate-950 to-black p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs sm:text-sm font-black text-white/70 uppercase tracking-widest flex items-center gap-2">
                <Users className="w-3.5 h-3.5" />
                Substitutes Bench
              </h2>
              <span className="text-[10px] text-white/30 uppercase tracking-wider">1 comes on first · hold + tap to reorder</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {bench.map((p, i) => {
                const isSelected = playerToSub?.id === p.id;
                const isValid = !!playerToSub && !isSelected && validSwapTargets.has(p.id);
                const isDimmed = !!playerToSub && !isSelected && !validSwapTargets.has(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (consumeLongPress()) return;
                      if (playerToSub) {
                        if (isValid || isSelected) {
                          swapPlayer(p);
                        } else {
                          setSelectedPlayer(p);
                        }
                      } else {
                        setSelectedPlayer(p);
                      }
                    }}
                    {...longPressHandlers(p)}
                    draggable={!isTouch}
                    onDragStart={handleDragStart(p)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver(p)}
                    onDrop={handleDrop(p)}
                    className={`relative flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl cursor-pointer transition-all group overflow-hidden select-none [-webkit-touch-callout:none] ${
                      isSelected
                        ? 'bg-amber-500/15 ring-2 ring-amber-400 animate-pulse'
                        : isValid
                        ? 'bg-emerald-500/10 ring-2 ring-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.4)] animate-pulse'
                        : isDimmed
                        ? 'bg-white/[0.02] ring-1 ring-white/5 opacity-30 grayscale'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/5 hover:ring-white/15'
                    }`}
                  >
                    {/* Sub-priority number badge */}
                    <div className="flex flex-col items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-gradient-to-br from-pink-500 to-rose-600 text-white font-black text-xs shadow-md shrink-0">
                      {i + 1}
                    </div>
                    <PlayerFace
                      photoUrl={p.photoUrl}
                      primaryColor={p.nation?.kitColor1 || '#FFF'}
                      secondaryColor={p.nation?.kitColor2 || '#000'}
                      number={p.shirtNumber}
                      nationCode={p.nation?.code || ''}
                      size="xs"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs sm:text-sm font-bold truncate leading-tight">{p.displayName}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`px-1 py-[1px] rounded-sm text-[8px] font-black ${
                          p.position === 'GK' ? 'bg-amber-500/20 text-amber-300' :
                          p.position === 'DEF' ? 'bg-sky-500/20 text-sky-300' :
                          p.position === 'MID' ? 'bg-emerald-500/20 text-emerald-300' :
                          'bg-rose-500/20 text-rose-300'
                        }`}>{p.position}</span>
                        <span className="text-white/40 text-[10px]">{p.points || 0} pts</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop actions */}
      <div className="hidden sm:flex items-center justify-between px-3 sm:px-0">
        <p className="text-white/40 text-sm">Tap players to manage your team. Coloured badges show fixture difficulty.</p>
        <button
          onClick={saveChanges}
          disabled={saving}
          className="px-8 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-bold hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 transition-all shadow-[0_10px_30px_-10px_rgba(244,63,94,0.6)] flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Squad'}
        </button>
      </div>

      {/* Mobile sticky bottom bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-white/10 px-3 pt-2.5 add-pb-safe flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-[9px] text-white/40 uppercase font-bold leading-none">Pts</p>
            <p className="text-emerald-400 font-black text-sm leading-tight">{totalPoints}</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] text-white/40 uppercase font-bold leading-none">Bank</p>
            <p className="text-white font-black text-sm leading-tight">£{bankBalance.toFixed(1)}m</p>
          </div>
        </div>
        <button
          onClick={saveChanges}
          disabled={saving}
          className="flex-1 max-w-[200px] px-4 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-black text-sm hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 transition-all shadow-lg flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          isCaptain={captainId === selectedPlayer.id}
          isViceCaptain={viceCaptainId === selectedPlayer.id}
          isStarting={!!selectedPlayer.isStarting}
          isAdmin={isAdmin}
          subTargetName={playerToSub && playerToSub.id !== selectedPlayer.id ? playerToSub.displayName : null}
          isSubTarget={playerToSub?.id === selectedPlayer.id}
          onSub={() => {
            swapPlayer(selectedPlayer);
            if (!playerToSub) setSelectedPlayer(null);
          }}
          onSetCaptain={() => setCaptain(selectedPlayer.id)}
          onSetViceCaptain={() => setViceCaptain(selectedPlayer.id)}
          onCancelSub={() => setPlayerToSub(null)}
          onAdjustmentReverted={handleAdjustmentReverted}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      {pickerInfoPlayer && (
        <PlayerDetailModal
          player={pickerInfoPlayer}
          isCaptain={false}
          isViceCaptain={false}
          isStarting={false}
          isAdmin={isAdmin}
          readOnly
          hideRole
          onClose={() => setPickerInfoPlayer(null)}
        />
      )}

      {/* Sub-off forfeit warning — fires when moving a player to the bench
          whose match has already kicked off this round. It's a one-way move:
          saving forfeits his banked round points and the played-lock blocks
          bringing him back into the XI until next round. */}
      {subOffWarning && (() => {
        const playerOut = subOffWarning.p1.isStarting ? subOffWarning.p1 : subOffWarning.p2;
        const isLiveNow = liveNations.has(playerOut.nation?.code || '');
        return (
          <div
            className="fixed inset-0 bg-black/80 z-[9999] backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setSubOffWarning(null)}
          >
            <div
              className="relative bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/20 rounded-2xl w-full max-w-xs overflow-hidden shadow-[0_24px_70px_-15px_rgba(0,0,0,0.85)] animate-scale-in"
              onClick={e => e.stopPropagation()}
            >
              {/* Top accent bar */}
              <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />

              {/* Header */}
              <div className="px-4 pt-4 pb-3 flex items-center gap-3 bg-gradient-to-br from-amber-500/15 via-orange-500/5 to-transparent">
                <div className="relative shrink-0">
                  <div className={`absolute inset-0 rounded-xl blur-md ${isLiveNow ? 'bg-emerald-500/40' : 'bg-amber-500/40'}`} />
                  <div className="relative drop-shadow-lg">
                    <PlayerFace
                      photoUrl={playerOut.photoUrl}
                      primaryColor={playerOut.nation?.kitColor1 || '#FFF'}
                      secondaryColor={playerOut.nation?.kitColor2 || '#000'}
                      number={playerOut.shirtNumber}
                      nationCode={playerOut.nation?.code || ''}
                      size="xs"
                    />
                  </div>
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black text-white leading-tight">Sub off {playerOut.displayName}?</h3>
                  {isLiveNow ? (
                    <span className="inline-flex items-center gap-1.5 mt-0.5 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Match live now
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 mt-0.5 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30">
                      Already played
                    </span>
                  )}
                </div>
              </div>

              {/* Consequences */}
              <div className="px-4 pt-1 pb-4">
                <p className="text-white/65 text-xs leading-relaxed mb-2.5">
                  {isLiveNow
                    ? 'His match has already kicked off and is in play.'
                    : "He's already played this round."}{' '}
                  Bench him and <span className="text-white font-bold">save</span> and you&apos;ll:
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/25">
                    <Coins className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" strokeWidth={2.5} />
                    <p className="text-amber-100/90 text-[11px] leading-snug">
                      <span className="font-black text-amber-200">Forfeit his round points</span> — everything banked this round stops counting.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/25">
                    <Lock className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" strokeWidth={2.5} />
                    <p className="text-amber-100/90 text-[11px] leading-snug">
                      <span className="font-black text-amber-200">Lock him out</span> — no bringing him back into your XI until next round.
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="px-4 pb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSubOffWarning(null)}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/15 text-white font-bold text-sm shadow-lg active:scale-95 transition-all"
                >
                  Keep him
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { p1, p2 } = subOffWarning;
                    setSubOffWarning(null);
                    performSwap(p1, p2, true);
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-amber-950 font-black text-sm shadow-[0_4px_16px_rgba(245,158,11,0.4)] hover:from-amber-300 hover:to-orange-400 hover:shadow-[0_6px_22px_rgba(245,158,11,0.55)] active:scale-95 transition-all"
                >
                  <ArrowLeftRight className="w-4 h-4" strokeWidth={2.5} />
                  Sub off
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  /** Optional small subtext shown under the value (e.g. "7:00 PM · in 29d"). */
  hint?: string;
  accent?: string;
  highlight?: boolean;
}

function StatCard({ icon, label, value, hint, accent = 'text-white', highlight = false }: StatCardProps) {
  return (
    <div className={`relative px-3 py-2 rounded-xl border overflow-hidden transition-all ${
      highlight
        ? 'bg-gradient-to-br from-emerald-500/10 to-emerald-700/5 border-emerald-500/30 shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)]'
        : 'bg-white/5 border-white/10'
    }`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={accent}>{icon}</span>
        <p className="text-[9px] sm:text-[10px] uppercase tracking-wider font-bold text-white/50 leading-none">{label}</p>
      </div>
      <p className={`text-base sm:text-xl font-black leading-tight ${accent}`}>{value}</p>
      {hint && (
        <p className="text-[9px] sm:text-[10px] font-medium text-white/40 mt-0.5 leading-tight truncate">
          {hint}
        </p>
      )}
    </div>
  );
}

// Compact countdown like "2d 5h", "3h 12m", "47m", "now" — used for the chip
// "Locks in …" hint on the active chip card. Thin wrapper around the shared
// formatter so this file keeps its existing call signature.
function formatCountdown(deadlineIso: string, nowMs: number): string {
  const target = new Date(deadlineIso).getTime();
  if (target - nowMs <= 0) return 'now';
  return formatDuration(target, nowMs);
}

// Map a chip name to a Lucide icon
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chipIcon(name: string): any {
  const n = name.toLowerCase();
  if (n.includes('free hit') || n.includes('free-hit')) return Wand2;
  if (n.includes('wildcard')) return RefreshCw;
  if (n.includes('triple') || n.includes('captain')) return Crown;
  if (n.includes('bench')) return Users;
  if (n.includes('boost')) return Zap;
  return Sparkles;
}

// Plain-English pitch for each chip, shown in the detail popup. Written for
// someone who has never played fantasy football before. Every claim here is
// backed by the scoring code: captain x2/x3 and bench rules live in
// lib/squad-points.ts, the 4 point transfer hit in api/transfers, the Free
// Hit snapshot/revert in api/chips. No dashes in the copy (user preference).
function chipExplain(id: string): { tagline: string; points: string[] } {
  switch (id) {
    case 'WILDCARD_1':
      return {
        tagline: 'Rebuild your whole squad for free.',
        points: [
          'Normally every transfer past your free ones costs you 4 points. Wildcard makes them all free for this stage.',
          'Buy and sell as many players as you want before the deadline.',
          'The changes are permanent. Your new squad stays with you for the rest of the tournament.',
        ],
      };
    case 'WILDCARD_2':
      return {
        tagline: 'Your second Wildcard, saved for the knockouts.',
        points: [
          'Works exactly like the first one. Unlimited free transfers for this stage and the changes are permanent.',
          'It only unlocks once the knockout rounds start, so you can rebuild after seeing who made it through.',
        ],
      };
    case 'TRIPLE_CAPTAIN':
      return {
        tagline: 'Your captain scores triple instead of double.',
        points: [
          'Your captain normally earns double points. With this chip everything they do is worth 3x for this stage.',
          'If your captain does not play, nobody gets the boost. So save it for a star with an easy game.',
        ],
      };
    case 'BENCH_BOOST':
      return {
        tagline: 'All 15 of your players score this stage.',
        points: [
          'Normally your 4 bench players earn you nothing. With Bench Boost their points count toward your total too.',
          'Best used when your whole squad, bench included, has good fixtures.',
        ],
      };
    case 'FREE_HIT':
      return {
        tagline: 'Unlimited transfers for one stage, then your old squad comes back.',
        points: [
          'Unlimited free transfers, this stage only.',
          'When the stage ends your squad automatically goes back to exactly what it was before you used the chip.',
          'Great for loading up on one big matchday without wrecking your long term squad.',
        ],
      };
    default:
      return { tagline: '', points: [] };
  }
}

// FDR cell pill color
function fdrPill(fdr: number): string {
  switch (fdr) {
    case 1: return 'bg-emerald-500 text-white';
    case 2: return 'bg-emerald-700 text-emerald-100';
    case 3: return 'bg-slate-500 text-white';
    case 4: return 'bg-rose-600 text-white';
    case 5: return 'bg-rose-900 text-rose-100';
    default: return 'bg-slate-700 text-white';
  }
}

// Color legend for fixture difficulty (1 easiest → 5 hardest)
function FdrLegend() {
  const items: { n: number; label: string }[] = [
    { n: 1, label: 'Easy' },
    { n: 2, label: '' },
    { n: 3, label: 'Avg' },
    { n: 4, label: '' },
    { n: 5, label: 'Hard' },
  ];
  return (
    <div className="flex items-center gap-1">
      <span className="text-[8px] uppercase tracking-wider font-bold text-white/30 mr-1">FDR</span>
      {items.map(it => (
        <span
          key={it.n}
          className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm text-[8px] font-black ${fdrPill(it.n)}`}
          title={`${it.n} – ${it.label || (it.n < 3 ? 'Easy' : 'Hard')}`}
        >
          {it.n}
        </span>
      ))}
    </div>
  );
}
