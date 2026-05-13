'use client';

// ============================================
// ADMIN — MATCH SIMULATOR
//
// Drives /api/admin/match-simulator to mark any Match as live, seed
// fake PlayerPerformance rows, then drive the full 90-minute flow with
// fine-grained control over events + a one-click "Jump to FT" path.
//
// Workflow:
//   1. Pick (or create) a match.
//   2. Pick the lineup — checkbox list of every player on both nations,
//      no 5-cap. "Suggest defaults" pre-selects 11 sensible players per
//      nation (preferring admin-squad players so the green pill on
//      /squad lights up).
//   3. Click "Go LIVE" → flips Match.isStarted=true, creates perf rows.
//   4. Drive the match:
//      - "Quick event" picker: dropdown player + dropdown event + Apply
//        → applies a single +1 (or +N) delta to that player.
//      - "Edit stats" editor: expand any seeded player to see every stat
//        as a number input → Save replaces the perf row wholesale.
//      - Match clock: slider 1-90 + Home/Away score inputs + "Sync to
//        minute" (bumps everyone's minutesPlayed to slider value) +
//        "Jump to FT (90)" one-click that sets everyone to 90 minutes.
//      - Auto-play: ticks every N seconds with random events until 90.
//   5. Click "Finish" → flips to FT, triggers updateSquadPoints flow.
//   6. Click "Reset" → wipes perf rows + match flags + rolls back banked
//      points (if the match was Finished) so you can re-run cleanly.
// ============================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface SimMatch {
  id: string;
  stageId: string;
  stageName: string;
  homeNation: { code: string; name: string };
  awayNation: { code: string; name: string };
  kickoffTime: string;
  homeScore: number | null;
  awayScore: number | null;
  currentMinute: number | null;
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
interface SimStage {
  id: string;
  stageId: string;
  name: string;
  isActive: boolean;
}
interface SimNation {
  id: string;
  code: string;
  name: string;
}

// Stat keys the simulator can write. Mirrors PerfStatsInput in the API
// route so a strict typecheck catches typos at compile time.
type StatKey =
  | 'minutesPlayed'
  | 'goals'
  | 'assists'
  | 'cleanSheet'
  | 'goalsConceeded'
  | 'saves'
  | 'penaltiesSaved'
  | 'penaltiesMissed'
  | 'yellowCards'
  | 'redCards'
  | 'ownGoals'
  | 'defensiveActions'
  | 'bonusPoints';

interface StatLine {
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
}

const ZERO_STATS: StatLine = {
  minutesPlayed: 0,
  goals: 0,
  assists: 0,
  cleanSheet: false,
  goalsConceeded: 0,
  saves: 0,
  penaltiesSaved: 0,
  penaltiesMissed: 0,
  yellowCards: 0,
  redCards: 0,
  ownGoals: 0,
  defensiveActions: 0,
  bonusPoints: 0,
};

// Catalogue of quick events. Each maps to a single-field +N delta that
// the "Apply" button POSTs to the tick endpoint. Keep this list short
// and matched to the live-scoring engine's vocabulary — anything not
// listed here can still be set via the full editor below.
type EventType =
  | 'goal'
  | 'assist'
  | 'yellow'
  | 'red'
  | 'save'
  | 'pen_save'
  | 'pen_miss'
  | 'own_goal'
  | 'dc'
  | 'conceded'
  | 'bonus_plus'
  | 'bonus_minus';

const EVENT_LABELS: Record<EventType, string> = {
  goal: '⚽ Goal',
  assist: '🅰️ Assist',
  yellow: '🟨 Yellow card',
  red: '🟥 Red card',
  save: '🧤 Save',
  pen_save: '🛑 Penalty saved',
  pen_miss: '🚫 Penalty missed',
  own_goal: '🙃 Own goal',
  dc: '🛡️ Defensive action (+1)',
  conceded: '🥅 Goal conceded',
  bonus_plus: '➕ Bonus point (+1)',
  bonus_minus: '➖ Bonus point (−1)',
};

// Map an event to the corresponding stat field + value. Most are +1 but
// bonus points can be ±1.
function eventToDelta(evt: EventType): Partial<Record<StatKey, number>> {
  switch (evt) {
    case 'goal': return { goals: 1 };
    case 'assist': return { assists: 1 };
    case 'yellow': return { yellowCards: 1 };
    case 'red': return { redCards: 1 };
    case 'save': return { saves: 1 };
    case 'pen_save': return { penaltiesSaved: 1 };
    case 'pen_miss': return { penaltiesMissed: 1 };
    case 'own_goal': return { ownGoals: 1 };
    case 'dc': return { defensiveActions: 1 };
    case 'conceded': return { goalsConceeded: 1 };
    case 'bonus_plus': return { bonusPoints: 1 };
    case 'bonus_minus': return { bonusPoints: -1 };
  }
}

export default function MatchSimulatorPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [matches, setMatches] = useState<SimMatch[]>([]);
  const [adminSquad, setAdminSquad] = useState<AdminSquadEntry[]>([]);
  const [allPlayers, setAllPlayers] = useState<SimPlayer[]>([]);
  const [stages, setStages] = useState<SimStage[]>([]);
  const [nations, setNations] = useState<SimNation[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');

  // Inline create-match form
  const [showCreateMatch, setShowCreateMatch] = useState(false);
  const [newMatchStageId, setNewMatchStageId] = useState<string>('');
  const [newMatchHomeId, setNewMatchHomeId] = useState<string>('');
  const [newMatchAwayId, setNewMatchAwayId] = useState<string>('');
  const [creatingMatch, setCreatingMatch] = useState(false);

  // Selected lineup. A Set so toggling players is O(1). The visual order
  // in the lineup table is "home nation first by position, then away" so
  // the admin can scan quickly.
  const [lineupIds, setLineupIds] = useState<Set<string>>(new Set());

  // Match-control state — kept in sync with the DB after every action.
  const [clockMinute, setClockMinute] = useState<number>(0);
  const [homeScore, setHomeScore] = useState<number>(0);
  const [awayScore, setAwayScore] = useState<number>(0);

  // Quick-event picker
  const [quickEventPlayer, setQuickEventPlayer] = useState<string>('');
  const [quickEventType, setQuickEventType] = useState<EventType>('goal');
  const [quickEventCount, setQuickEventCount] = useState<number>(1);

  // Full stat editor — collapsed by default; one expanded id at a time
  const [editorPlayerId, setEditorPlayerId] = useState<string | null>(null);
  const [editorStats, setEditorStats] = useState<StatLine>(ZERO_STATS);
  const [savingEditor, setSavingEditor] = useState(false);

  // Auto-play state. We use a ref for the timer + speed so the timer
  // doesn't restart when the user is just changing the speed dropdown.
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState<number>(2000); // ms per tick
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs that mirror the clock/scoreline. These exist because the
  // auto-play step is async — by the time it runs, the React state
  // captured in the closure may be 1-2 ticks stale, which caused the
  // "score stuck at 0-0 even though goals were happening" bug. The
  // refs are written synchronously from the step itself, then mirrored
  // back into React state for the UI to re-render. Source of truth
  // inside the autoplay loop is the ref; the state is just for
  // rendering.
  const clockMinuteRef = useRef(0);
  const homeScoreRef = useRef(0);
  const awayScoreRef = useRef(0);
  const lineupPlayersRef = useRef<SimPlayer[]>([]);
  const selectedMatchRef = useRef<SimMatch | null>(null);
  // Counts ticks so we can stagger expensive work (full perf reload
  // every Nth tick instead of every tick).
  const tickCounterRef = useRef(0);

  // Performance rows loaded from the simulator endpoint. The "Edit stats"
  // panel reads from this; live values come back after every action.
  const [perfs, setPerfs] = useState<
    Array<{ playerId: string; stats: StatLine; totalPoints: number; isLive: boolean }>
  >([]);

  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) ?? null,
    [matches, selectedMatchId]
  );

  // Players currently checked in the lineup, mapped back to SimPlayer
  // entries so we can show names + positions + nations.
  const lineupPlayers = useMemo(
    () => allPlayers.filter((p) => lineupIds.has(p.id)),
    [allPlayers, lineupIds],
  );

  // Players available for the two nations in the selected match, grouped
  // for the picker table.
  const eligiblePlayers = useMemo(() => {
    if (!selectedMatch) return [] as SimPlayer[];
    return allPlayers.filter(
      (p) =>
        p.nationCode === selectedMatch.homeNation.code ||
        p.nationCode === selectedMatch.awayNation.code,
    );
  }, [allPlayers, selectedMatch]);

  const groupedEligible = useMemo(() => {
    if (!selectedMatch) {
      return { home: [] as SimPlayer[], away: [] as SimPlayer[] };
    }
    const home = eligiblePlayers.filter((p) => p.nationCode === selectedMatch.homeNation.code);
    const away = eligiblePlayers.filter((p) => p.nationCode === selectedMatch.awayNation.code);
    // Order by position (GK → DEF → MID → FWD) so the picker reads top-down.
    const order = (pos: SimPlayer['position']) =>
      pos === 'GK' ? 0 : pos === 'DEF' ? 1 : pos === 'MID' ? 2 : 3;
    home.sort((a, b) => order(a.position) - order(b.position) || a.displayName.localeCompare(b.displayName));
    away.sort((a, b) => order(a.position) - order(b.position) || a.displayName.localeCompare(b.displayName));
    return { home, away };
  }, [eligiblePlayers, selectedMatch]);

  const loadContext = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/admin/match-simulator?action=context', { credentials: 'include' });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setMatches(data.matches || []);
      setAdminSquad(data.adminSquad || []);
      setAllPlayers(data.allPlayers || []);
      setStages(data.stages || []);
      setNations(data.nations || []);

      const active = (data.stages as SimStage[] | undefined)?.find((s) => s.isActive);
      if (active) {
        setNewMatchStageId((prev) => prev || active.id);
      }

      if ((data.matches?.length ?? 0) === 0) {
        setShowCreateMatch(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matches');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch perf rows + scoreline for the currently selected match. Used
  // both initially after a selection and after every mutation (start /
  // tick / set-stats / set-clock / finish) so the UI is always
  // up-to-date with what the DB believes.
  const loadPerfs = useCallback(async () => {
    if (!selectedMatchId) {
      setPerfs([]);
      return;
    }
    try {
      const res = await fetch(`/api/admin/match-simulator/perfs?matchId=${selectedMatchId}`, {
        credentials: 'include',
      });
      if (!res.ok) return; // Endpoint may not exist yet; soft-fail.
      const data = await res.json();
      setPerfs(data.perfs || []);
      // Also seed lineup from existing perf rows so re-loading the page
      // mid-match shows the right checkboxes.
      if (data.perfs?.length > 0) {
        setLineupIds(new Set(data.perfs.map((p: { playerId: string }) => p.playerId)));
      }
    } catch {
      // Ignore — non-fatal.
    }
  }, [selectedMatchId]);

  useEffect(() => { loadContext(); }, [loadContext]);

  // When the user switches matches, hydrate the clock + score inputs from
  // the DB row so the inputs are seeded correctly.
  useEffect(() => {
    if (!selectedMatch) return;
    setClockMinute(selectedMatch.currentMinute ?? 0);
    setHomeScore(selectedMatch.homeScore ?? 0);
    setAwayScore(selectedMatch.awayScore ?? 0);
    loadPerfs();
  }, [selectedMatchId, selectedMatch, loadPerfs]);

  // Mirror state → refs on every render so the auto-play step sees the
  // latest values. Cheap; React only triggers this when deps change.
  useEffect(() => { clockMinuteRef.current = clockMinute; }, [clockMinute]);
  useEffect(() => { homeScoreRef.current = homeScore; }, [homeScore]);
  useEffect(() => { awayScoreRef.current = awayScore; }, [awayScore]);
  useEffect(() => { lineupPlayersRef.current = lineupPlayers; }, [lineupPlayers]);
  useEffect(() => { selectedMatchRef.current = selectedMatch; }, [selectedMatch]);

  const refresh = useCallback(async () => {
    await loadContext();
    await loadPerfs();
  }, [loadContext, loadPerfs]);

  const onMatchChange = (id: string) => {
    setSelectedMatchId(id);
    setLineupIds(new Set());
    setEditorPlayerId(null);
  };

  // "Suggest defaults" — fills the lineup with 11 players per nation,
  // 1-GK / 4-DEF / 3-MID / 3-FWD, preferring admin-squad players so the
  // green pill on /squad lights up for the admin's own players.
  const seedDefaultLineup = () => {
    if (!selectedMatch) return;
    const wanted = { GK: 1, DEF: 4, MID: 3, FWD: 3 } as const;

    const pickForNation = (code: string): SimPlayer[] => {
      const fromNation = allPlayers.filter((p) => p.nationCode === code);
      const adminIds = new Set(
        adminSquad
          .filter((sp) => sp.nationCode === code)
          .map((sp) => sp.playerId),
      );
      const result: SimPlayer[] = [];
      (['GK', 'DEF', 'MID', 'FWD'] as const).forEach((pos) => {
        const target = wanted[pos];
        const candidates = fromNation.filter((p) => p.position === pos);
        // Admin-squad players first, then alphabetical fillers.
        const preferred = candidates.filter((p) => adminIds.has(p.id));
        const rest = candidates.filter((p) => !adminIds.has(p.id));
        result.push(...[...preferred, ...rest].slice(0, target));
      });
      return result;
    };

    const home = pickForNation(selectedMatch.homeNation.code);
    const away = pickForNation(selectedMatch.awayNation.code);
    setLineupIds(new Set([...home, ...away].map((p) => p.id)));
    setStatusMsg(`Suggested ${home.length + away.length} players — toggle any to customize.`);
  };

  const toggleLineup = (id: string) => {
    setLineupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const onCreateMatch = async () => {
    if (!newMatchStageId || !newMatchHomeId || !newMatchAwayId) {
      setError('Pick a stage and two different nations');
      return;
    }
    if (newMatchHomeId === newMatchAwayId) {
      setError('Home and away must be different nations');
      return;
    }
    setError(null);
    setCreatingMatch(true);
    setStatusMsg('Creating test match...');
    try {
      const data = (await post({
        action: 'create-match',
        stageId: newMatchStageId,
        homeNationId: newMatchHomeId,
        awayNationId: newMatchAwayId,
      })) as { match?: { id: string; homeNation: { code: string }; awayNation: { code: string } } };
      await loadContext();
      if (data.match?.id) {
        setSelectedMatchId(data.match.id);
      }
      setShowCreateMatch(false);
      setNewMatchHomeId('');
      setNewMatchAwayId('');
      setStatusMsg(`Created ${data.match?.homeNation?.code} vs ${data.match?.awayNation?.code} — ready to seed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create match');
      setStatusMsg(null);
    } finally {
      setCreatingMatch(false);
    }
  };

  const onGoLive = async () => {
    if (!selectedMatchId || lineupIds.size === 0) return;
    setStatusMsg('Starting match...');
    try {
      // Every seeded player starts with minutesPlayed: 1 so DC / clean
      // sheet logic has a non-zero window to work with right away.
      const seeds = Array.from(lineupIds).map((id) => ({
        playerId: id,
        minutesPlayed: 1,
      }));
      await post({
        action: 'start',
        matchId: selectedMatchId,
        seeds,
        currentMinute: 1,
        homeScore: 0,
        awayScore: 0,
      });
      setStatusMsg(`Match is LIVE — ${seeds.length} players on pitch.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start');
    }
  };

  // Apply a quick event (player + event type + count) as an additive
  // delta. count is multiplied into the delta so "Goal x2" = 2 goals.
  const onApplyQuickEvent = async () => {
    if (!selectedMatchId || !quickEventPlayer) return;
    const delta = eventToDelta(quickEventType);
    const scaled: Record<string, number> = {};
    for (const [k, v] of Object.entries(delta)) {
      scaled[k] = (v ?? 0) * quickEventCount;
    }
    setStatusMsg(`Applying ${EVENT_LABELS[quickEventType]} ×${quickEventCount}...`);
    try {
      await post({
        action: 'tick',
        matchId: selectedMatchId,
        deltas: [{ playerId: quickEventPlayer, ...scaled }],
      });
      // Auto-update the scoreline for goal-y events so the simulator
      // homePlayed vs awayScore matches what's banked. The match clock
      // itself stays where it was — admin controls that via the slider.
      if (quickEventType === 'goal' || quickEventType === 'own_goal') {
        // Figure out which side the player is on. A goal counts toward
        // their nation's score; an own-goal counts AGAINST their nation
        // (so toward the opponent's score).
        const player = allPlayers.find((p) => p.id === quickEventPlayer);
        if (player && selectedMatch) {
          const isHome = player.nationCode === selectedMatch.homeNation.code;
          const goalAgainstSelf = quickEventType === 'own_goal';
          if (isHome !== goalAgainstSelf) {
            setHomeScore((s) => s + quickEventCount);
          } else {
            setAwayScore((s) => s + quickEventCount);
          }
          await post({
            action: 'set-clock',
            matchId: selectedMatchId,
            currentMinute: clockMinute,
            homeScore: (isHome !== goalAgainstSelf ? homeScore + quickEventCount : homeScore),
            awayScore: (isHome !== goalAgainstSelf ? awayScore : awayScore + quickEventCount),
          });
        }
      }
      setStatusMsg(`Applied ${EVENT_LABELS[quickEventType]} ×${quickEventCount}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply event');
    }
  };

  // Set the match clock (and optionally bump every on-pitch player's
  // minutesPlayed up to clockMinute). syncMinutes=true is what makes
  // the "Jump to FT" button actually move every player to 90.
  const onSetClock = async (syncMinutes: boolean) => {
    if (!selectedMatchId) return;
    setStatusMsg(syncMinutes ? `Syncing all players to minute ${clockMinute}...` : 'Updating clock...');
    try {
      await post({
        action: 'set-clock',
        matchId: selectedMatchId,
        currentMinute: clockMinute,
        homeScore,
        awayScore,
        syncMinutesToOnPitch: syncMinutes,
      });
      setStatusMsg(
        syncMinutes
          ? `Synced all players to minute ${clockMinute}.`
          : `Clock set to minute ${clockMinute}.`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set clock');
    }
  };

  const onJumpToFT = async () => {
    setClockMinute(90);
    if (!selectedMatchId) return;
    setStatusMsg('Jumping to FT — everyone at 90 minutes...');
    try {
      await post({
        action: 'set-clock',
        matchId: selectedMatchId,
        currentMinute: 90,
        homeScore,
        awayScore,
        syncMinutesToOnPitch: true,
      });
      setStatusMsg('Everyone at 90 minutes. Click Finish to bank points.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to jump to FT');
    }
  };

  // Open the editor for a player and hydrate the inputs from the perf
  // row that already exists. If no row exists yet (player hasn't been
  // seeded), fall back to zero stats.
  const onOpenEditor = (playerId: string) => {
    const perf = perfs.find((p) => p.playerId === playerId);
    setEditorPlayerId(playerId);
    setEditorStats(perf ? { ...perf.stats } : { ...ZERO_STATS });
  };

  const onSaveEditor = async () => {
    if (!selectedMatchId || !editorPlayerId) return;
    setSavingEditor(true);
    setStatusMsg('Saving stats...');
    try {
      await post({
        action: 'set-stats',
        matchId: selectedMatchId,
        stats: [{ playerId: editorPlayerId, ...editorStats }],
      });
      setStatusMsg('Stats saved.');
      setEditorPlayerId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save stats');
    } finally {
      setSavingEditor(false);
    }
  };

  // Auto-play. Self-chaining setTimeout — schedules the next tick only
  // after the previous one completes, so a slow backend can't queue up
  // overlapping requests. Reads from REFS (not closure state) so the
  // scoreline + minute it writes are always fresh. Stops at minute 90
  // or when the user pauses.
  //
  // What the step does:
  //   1. Choose 0-3 events for this minute, weighted toward goals /
  //      assists / DC so the match feels alive. Goal targets are
  //      restricted to non-GK; saves to GK.
  //   2. Bundle the +1-minute bump for every lineup player + the
  //      events into a single tick POST. Backend handles it as one
  //      transaction.
  //   3. POST set-clock with the NEW scoreline (computed before this
  //      step's setHome/setAway calls so the value is in lockstep).
  //   4. Optimistically patch the local `matches` array so the top
  //      "scoreline · minute" header re-renders immediately without
  //      waiting for a full loadContext.
  //   5. Every 5th tick: reload perf rows so the editor / per-player
  //      points stay in sync. (Doing it every tick was a 50% chunk of
  //      step duration; once per 5 ticks is enough for the eye.)
  useEffect(() => {
    if (!autoPlaying) {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const step = async () => {
      if (cancelled) return;
      const matchId = selectedMatchId;
      const lineup = lineupPlayersRef.current;
      const m = selectedMatchRef.current;
      if (!matchId || !m || lineup.length === 0) {
        setAutoPlaying(false);
        return;
      }

      const currentMinute = clockMinuteRef.current;
      const nextMinute = Math.min(currentMinute + 1, 90);

      // Event pool — weighted so goals/assists/DC are common and
      // misses are rare. Each entry is one slot in the bag.
      const pool: EventType[] = [
        'goal', 'goal',
        'assist', 'assist', 'assist',
        'save', 'save',
        'dc', 'dc', 'dc', 'dc',
        'yellow',
        'pen_save',
      ];

      // Number of events this minute. 0/1/2 with 30/55/15 odds — so
      // 70% of minutes have at least one event (vs. the previous 50%).
      const eventRoll = Math.random();
      const numEvents = eventRoll < 0.3 ? 0 : eventRoll < 0.85 ? 1 : 2;

      // Build the delta map keyed by playerId so the same player can
      // accumulate multiple events in one tick (rare but possible).
      const deltaMap = new Map<string, Partial<Record<StatKey, number>> & { playerId: string }>();
      for (const p of lineup) {
        deltaMap.set(p.id, { playerId: p.id, minutesPlayed: 1 });
      }

      // Track scoreline deltas locally so the post + the React state
      // update use the same numbers (no closure staleness).
      let homeBump = 0;
      let awayBump = 0;

      for (let i = 0; i < numEvents; i++) {
        const evt = pool[Math.floor(Math.random() * pool.length)];
        const eligible = lineup.filter((p) => {
          if (evt === 'goal' || evt === 'assist') return p.position !== 'GK';
          if (evt === 'save' || evt === 'pen_save') return p.position === 'GK';
          return true;
        });
        if (eligible.length === 0) continue;
        const target = eligible[Math.floor(Math.random() * eligible.length)];
        const d = eventToDelta(evt);
        const prev = deltaMap.get(target.id) ?? { playerId: target.id };
        // Sum delta fields rather than overwriting — so a player who
        // already got "+1 minute" + "+1 goal" can still get an assist
        // on the same tick.
        const merged: Partial<Record<StatKey, number>> & { playerId: string } = { ...prev };
        for (const [k, v] of Object.entries(d)) {
          const key = k as StatKey;
          if (typeof v === 'number') {
            merged[key] = ((merged[key] as number | undefined) ?? 0) + v;
          }
        }
        deltaMap.set(target.id, merged);

        if (evt === 'goal') {
          const isHome = target.nationCode === m.homeNation.code;
          if (isHome) homeBump += 1;
          else awayBump += 1;
        }
      }

      const newHome = homeScoreRef.current + homeBump;
      const newAway = awayScoreRef.current + awayBump;

      try {
        await post({
          action: 'tick',
          matchId,
          deltas: Array.from(deltaMap.values()),
        });
        await post({
          action: 'set-clock',
          matchId,
          currentMinute: nextMinute,
          homeScore: newHome,
          awayScore: newAway,
        });

        // Sync refs + state. Refs first so the NEXT step's closure
        // sees fresh values even if React batches the re-render.
        clockMinuteRef.current = nextMinute;
        homeScoreRef.current = newHome;
        awayScoreRef.current = newAway;
        setClockMinute(nextMinute);
        if (homeBump > 0) setHomeScore(newHome);
        if (awayBump > 0) setAwayScore(newAway);

        // Optimistic top-section update — the "minute · scoreline ·
        // perfs" badge re-renders without waiting for loadContext.
        setMatches((prev) =>
          prev.map((mm) =>
            mm.id === matchId
              ? { ...mm, currentMinute: nextMinute, homeScore: newHome, awayScore: newAway }
              : mm,
          ),
        );

        tickCounterRef.current += 1;
        if (tickCounterRef.current % 5 === 0) {
          // Periodic full perf refresh so the editor + per-player
          // points reflect what the engine just computed. Done off
          // the critical path so it doesn't slow each tick down.
          loadPerfs();
        }

        if (nextMinute >= 90) {
          setAutoPlaying(false);
          setStatusMsg('Auto-play reached minute 90. Click Finish to bank points.');
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Auto-play failed');
        setAutoPlaying(false);
        return;
      }

      if (!cancelled) {
        autoTimerRef.current = setTimeout(step, autoSpeed);
      }
    };

    // Kick the loop off immediately — no initial autoSpeed delay so
    // the first event happens instantly when the user clicks Play.
    autoTimerRef.current = setTimeout(step, 50);

    return () => {
      cancelled = true;
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
    // We INTENTIONALLY don't list lineupPlayers / clockMinute / scores
    // here — those come from refs so the step always sees fresh
    // values. Only autoPlaying / autoSpeed / matchId should restart
    // the loop. Including the others caused timer-storm bugs where
    // every score bump re-started the chain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlaying, autoSpeed, selectedMatchId]);

  const onFinish = async () => {
    if (!selectedMatchId) return;
    setStatusMsg('Finishing match...');
    setAutoPlaying(false);
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
    const wasFinished = selectedMatch?.isFinished ?? false;
    const msg = wasFinished
      ? 'This match was Finished. Reset will roll back banked points\n(decrement SquadPlayer.points + Team.totalPoints) AND wipe perf rows.\n\nContinue?'
      : 'Wipe all PlayerPerformance rows for this match and reset its flags?';
    if (!confirm(msg)) return;
    setStatusMsg('Resetting...');
    setAutoPlaying(false);
    try {
      const result = (await post({
        action: 'reset',
        matchId: selectedMatchId,
      })) as { rolledBack?: boolean };
      setStatusMsg(
        result.rolledBack
          ? 'Match reset to pre-kickoff. Points rolled back.'
          : 'Match reset to pre-kickoff.',
      );
      setLineupIds(new Set());
      setEditorPlayerId(null);
      setClockMinute(0);
      setHomeScore(0);
      setAwayScore(0);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset');
    }
  };

  // Convenience flags driving disabled states on the controls below.
  const isLive = !!selectedMatch?.isStarted && !selectedMatch?.isFinished;
  const isFinished = !!selectedMatch?.isFinished;
  const canTick = isLive;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-black">Match Simulator</h1>
          <p className="text-white/50 text-sm mt-1">
            Fake a live match end-to-end. Pick a match, pick a lineup, drive events, finish to bank points. Zero API-Football quota used.
          </p>
        </header>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-200 text-sm flex items-start justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-rose-300 hover:text-white text-xs px-2">Dismiss</button>
          </div>
        )}
        {statusMsg && (
          <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/40 text-sky-200 text-sm">{statusMsg}</div>
        )}

        {/* ============================
            1 · MATCH PICKER
           ============================ */}
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white/60">1 · Pick a match</h2>
            <button
              type="button"
              onClick={() => setShowCreateMatch((v) => !v)}
              className="text-xs px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
            >
              {showCreateMatch ? 'Hide create form' : '+ Create test match'}
            </button>
          </div>

          {loading ? (
            <div className="text-white/40 text-sm">Loading matches…</div>
          ) : matches.length === 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-amber-200 text-sm">
              No matches in the database yet. Use the form below to spin up a quick test fixture.
            </div>
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
            // Render the scoreline + minute from LOCAL state when the
            // match is in progress. The `matches` array is refreshed
            // on a slower cadence (post-tick optimistic + every-5-tick
            // hard refresh) so reading directly from `selectedMatch`
            // would otherwise lag behind the live `clockMinute` /
            // `homeScore` / `awayScore` slider values mid-autoplay.
            <div className="flex items-center gap-3 text-xs text-white/60 pt-2 flex-wrap">
              <span>{selectedMatch.stageName}</span>
              <span>·</span>
              <span className={`font-bold ${
                isFinished ? 'text-amber-400' :
                isLive ? 'text-emerald-400' : 'text-white/40'
              }`}>
                {isFinished ? 'FT' : isLive ? 'LIVE' : 'Not started'}
              </span>
              <span>·</span>
              <span className="font-mono">
                {selectedMatch.homeNation.code} {isLive ? homeScore : (selectedMatch.homeScore ?? 0)}
                {' - '}
                {isLive ? awayScore : (selectedMatch.awayScore ?? 0)} {selectedMatch.awayNation.code}
              </span>
              <span>·</span>
              <span className="font-mono">
                {isLive ? clockMinute : (selectedMatch.currentMinute ?? 0)}'
              </span>
              <span>·</span>
              <span>{selectedMatch.performanceCount} perfs ({selectedMatch.liveCount} live)</span>
              {autoPlaying && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Auto
                </span>
              )}
            </div>
          )}

          {showCreateMatch && (
            <div className="rounded-lg border border-white/10 bg-slate-900/50 p-3 space-y-2 mt-2">
              <p className="text-white/50 text-xs">
                Quick-create a Match row between two nations in a stage. Kickoff defaults to "now".
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                <select
                  value={newMatchStageId}
                  onChange={(e) => setNewMatchStageId(e.target.value)}
                  className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5"
                >
                  <option value="">— Stage —</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.stageId}] {s.name}{s.isActive ? ' (active)' : ''}
                    </option>
                  ))}
                </select>
                <select
                  value={newMatchHomeId}
                  onChange={(e) => setNewMatchHomeId(e.target.value)}
                  className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5"
                >
                  <option value="">— Home nation —</option>
                  {nations.map((n) => (
                    <option key={n.id} value={n.id}>{n.code} · {n.name}</option>
                  ))}
                </select>
                <select
                  value={newMatchAwayId}
                  onChange={(e) => setNewMatchAwayId(e.target.value)}
                  className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5"
                >
                  <option value="">— Away nation —</option>
                  {nations.map((n) => (
                    <option key={n.id} value={n.id} disabled={n.id === newMatchHomeId}>
                      {n.code} · {n.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={onCreateMatch}
                disabled={creatingMatch || !newMatchStageId || !newMatchHomeId || !newMatchAwayId}
                className="px-3 py-1.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-sm font-bold hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creatingMatch ? 'Creating…' : 'Create test match'}
              </button>
            </div>
          )}
        </section>

        {/* ============================
            2 · LINEUP PICKER
           ============================ */}
        {selectedMatch && (
          <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white/60">2 · Pick your lineup</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-white/40">{lineupIds.size} selected</span>
                <button
                  type="button"
                  onClick={seedDefaultLineup}
                  className="text-xs px-2.5 py-1 rounded-md bg-sky-500/20 border border-sky-500/40 text-sky-200 hover:bg-sky-500/30"
                >
                  Suggest defaults
                </button>
                <button
                  type="button"
                  onClick={() => setLineupIds(new Set())}
                  className="text-xs px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setLineupIds(new Set(eligiblePlayers.map((p) => p.id)))}
                  className="text-xs px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"
                >
                  Select all
                </button>
              </div>
            </div>
            <p className="text-white/50 text-xs">
              Tick every player you want on the pitch — no cap. The "Suggest defaults" button picks
              11 per nation (1 GK / 4 DEF / 3 MID / 3 FWD), preferring players in your own squad so
              the green pill on /squad lights up.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {([
                ['home', selectedMatch.homeNation, groupedEligible.home],
                ['away', selectedMatch.awayNation, groupedEligible.away],
              ] as const).map(([key, nation, players]) => (
                <div key={key} className="rounded-lg border border-white/10 bg-slate-900/40">
                  <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                    <span className="text-sm font-bold">
                      {nation.code} · {nation.name}
                    </span>
                    <span className="text-[10px] text-white/40">
                      {players.filter((p) => lineupIds.has(p.id)).length} / {players.length}
                    </span>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-white/5">
                    {players.length === 0 && (
                      <div className="p-3 text-xs text-white/40">No players found for this nation.</div>
                    )}
                    {players.map((p) => {
                      const checked = lineupIds.has(p.id);
                      const inAdmin = adminSquad.some((sp) => sp.playerId === p.id);
                      return (
                        <label
                          key={p.id}
                          className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/5 text-xs ${
                            checked ? 'bg-emerald-500/5' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleLineup(p.id)}
                            className="accent-emerald-500"
                          />
                          <span className={`font-mono w-7 text-white/40 ${
                            p.position === 'GK' ? 'text-amber-300' :
                            p.position === 'DEF' ? 'text-sky-300' :
                            p.position === 'MID' ? 'text-emerald-300' :
                            'text-rose-300'
                          }`}>
                            {p.position}
                          </span>
                          <span className="flex-1 truncate text-white">{p.displayName}</span>
                          {inAdmin && (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300">In squad</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ============================
            3 · GO LIVE / RESET
           ============================ */}
        {selectedMatch && (
          <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white/60">3 · Run the match</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onGoLive}
                disabled={!selectedMatchId || lineupIds.size === 0 || isLive || isFinished}
                className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 font-bold hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Go LIVE
              </button>
              <button
                type="button"
                onClick={onFinish}
                disabled={!isLive}
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
              After Go LIVE → open /squad in another tab and watch the green pill appear on seeded
              players. Captains show a ×2 (or ×3 with Triple Captain) badge on the pill.
            </p>
          </section>
        )}

        {/* ============================
            4 · CLOCK + SCORELINE
           ============================ */}
        {selectedMatch && isLive && (
          <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white/60">4 · Clock &amp; scoreline</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-white/40 block">Minute</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={120}
                    value={clockMinute}
                    onChange={(e) => setClockMinute(Number(e.target.value))}
                    className="flex-1 accent-emerald-500"
                  />
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={clockMinute}
                    onChange={(e) => setClockMinute(Number(e.target.value) || 0)}
                    className="w-16 bg-slate-900 border border-white/10 rounded-md px-2 py-1 text-sm text-center"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-white/40 block">
                  {selectedMatch.homeNation.code} score
                </label>
                <input
                  type="number"
                  min={0}
                  value={homeScore}
                  onChange={(e) => setHomeScore(Number(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-white/10 rounded-md px-2 py-1 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-white/40 block">
                  {selectedMatch.awayNation.code} score
                </label>
                <input
                  type="number"
                  min={0}
                  value={awayScore}
                  onChange={(e) => setAwayScore(Number(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-white/10 rounded-md px-2 py-1 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSetClock(false)}
                className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-white/80 text-xs font-bold hover:bg-white/10"
              >
                Apply scoreline + minute
              </button>
              <button
                type="button"
                onClick={() => onSetClock(true)}
                className="px-3 py-1.5 rounded-md bg-sky-500/20 border border-sky-500/40 text-sky-200 text-xs font-bold hover:bg-sky-500/30"
              >
                Sync every player to minute {clockMinute}
              </button>
              <button
                type="button"
                onClick={onJumpToFT}
                className="px-3 py-1.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-bold hover:bg-amber-500/30"
              >
                Jump to FT (90')
              </button>
            </div>

            {/* Auto-play */}
            <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold text-white/70">Auto-play</span>
                <select
                  value={autoSpeed}
                  onChange={(e) => setAutoSpeed(Number(e.target.value))}
                  className="bg-slate-900 border border-white/10 rounded-md px-2 py-1 text-xs"
                  disabled={autoPlaying}
                >
                  <option value={500}>Very fast (0.5s/min)</option>
                  <option value={1000}>Fast (1s/min)</option>
                  <option value={2000}>Normal (2s/min)</option>
                  <option value={4000}>Slow (4s/min)</option>
                </select>
                <button
                  type="button"
                  onClick={() => setAutoPlaying((v) => !v)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold ${
                    autoPlaying
                      ? 'bg-rose-500/20 border border-rose-500/40 text-rose-200 hover:bg-rose-500/30'
                      : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30'
                  }`}
                >
                  {autoPlaying ? 'Pause' : 'Play ▶'}
                </button>
              </div>
              <p className="text-white/40 text-[11px] leading-relaxed">
                Ticks +1 minute every {autoSpeed}ms with a 50% chance of a random event (goal /
                assist / save / DC / yellow) on each tick. Pauses automatically at minute 90.
              </p>
            </div>
          </section>
        )}

        {/* ============================
            5 · QUICK EVENT PICKER
           ============================ */}
        {selectedMatch && isLive && lineupPlayers.length > 0 && (
          <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white/60">5 · Quick event</h2>
            <p className="text-white/50 text-xs">
              One-shot: pick a player, pick an event, click Apply. Adds the event to their perf row
              (additive — the editor below can correct anything in one go).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-sm">
              <select
                value={quickEventPlayer}
                onChange={(e) => setQuickEventPlayer(e.target.value)}
                className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5"
              >
                <option value="">— Player —</option>
                {lineupPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.position}] {p.displayName} ({p.nationCode})
                  </option>
                ))}
              </select>
              <select
                value={quickEventType}
                onChange={(e) => setQuickEventType(e.target.value as EventType)}
                className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5"
              >
                {(Object.entries(EVENT_LABELS) as [EventType, string][]).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase tracking-wider text-white/40">×</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={quickEventCount}
                  onChange={(e) => setQuickEventCount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 bg-slate-900 border border-white/10 rounded-md px-2 py-1 text-sm text-center"
                />
              </div>
              <button
                type="button"
                onClick={onApplyQuickEvent}
                disabled={!quickEventPlayer || !canTick}
                className="px-3 py-1.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 font-bold hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            </div>
          </section>
        )}

        {/* ============================
            6 · FULL STAT EDITOR
           ============================ */}
        {selectedMatch && (isLive || isFinished) && lineupPlayers.length > 0 && (
          <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white/60">6 · Edit stats per player</h2>
            <p className="text-white/50 text-xs">
              Click a player to expand the editor. Saving REPLACES the perf row's stats wholesale (not additive).
              The points figure on the right shows what the engine just computed.
            </p>
            <div className="rounded-lg border border-white/10 divide-y divide-white/5 overflow-hidden">
              {lineupPlayers.map((p) => {
                const perf = perfs.find((x) => x.playerId === p.id);
                const expanded = editorPlayerId === p.id;
                return (
                  <div key={p.id} className="text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        if (expanded) setEditorPlayerId(null);
                        else onOpenEditor(p.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left"
                    >
                      <span className={`font-mono w-7 ${
                        p.position === 'GK' ? 'text-amber-300' :
                        p.position === 'DEF' ? 'text-sky-300' :
                        p.position === 'MID' ? 'text-emerald-300' :
                        'text-rose-300'
                      }`}>{p.position}</span>
                      <span className="font-mono w-8 text-white/40">{p.nationCode}</span>
                      <span className="flex-1 truncate text-white">{p.displayName}</span>
                      <span className="text-white/40 font-mono w-12 text-right">
                        {perf ? `${perf.stats.minutesPlayed}'` : '—'}
                      </span>
                      <span className="text-emerald-300 font-bold w-10 text-right">
                        {perf?.totalPoints ?? 0}p
                      </span>
                      <span className="text-white/30 w-5 text-right">{expanded ? '▾' : '▸'}</span>
                    </button>
                    {expanded && (
                      <div className="bg-slate-900/60 px-3 py-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                        {([
                          ['minutesPlayed', 'Minutes'],
                          ['goals', 'Goals'],
                          ['assists', 'Assists'],
                          ['saves', 'Saves'],
                          ['goalsConceeded', 'Conceded'],
                          ['defensiveActions', 'DC actions'],
                          ['penaltiesSaved', 'Pen saved'],
                          ['penaltiesMissed', 'Pen missed'],
                          ['yellowCards', 'Yellows'],
                          ['redCards', 'Reds'],
                          ['ownGoals', 'Own goals'],
                          ['bonusPoints', 'Bonus'],
                        ] as Array<[StatKey, string]>).map(([k, label]) => (
                          <label key={k} className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>
                            <input
                              type="number"
                              value={editorStats[k] as number}
                              onChange={(e) =>
                                setEditorStats((s) => ({ ...s, [k]: Number(e.target.value) || 0 }))
                              }
                              className="bg-slate-900 border border-white/10 rounded-md px-2 py-1 text-sm"
                            />
                          </label>
                        ))}
                        <label className="flex items-center gap-2 col-span-2 md:col-span-4 pt-1">
                          <input
                            type="checkbox"
                            checked={editorStats.cleanSheet}
                            onChange={(e) =>
                              setEditorStats((s) => ({ ...s, cleanSheet: e.target.checked }))
                            }
                            className="accent-emerald-500"
                          />
                          <span className="text-white/70 text-xs">
                            Clean sheet (GK/DEF: +4 if 60+ mins; MID: +1; FWD: 0)
                          </span>
                        </label>
                        <div className="col-span-2 md:col-span-4 flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setEditorPlayerId(null)}
                            className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-white/70 text-xs hover:bg-white/10"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={onSaveEditor}
                            disabled={savingEditor || !canTick}
                            className="px-3 py-1.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-bold hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {savingEditor ? 'Saving…' : 'Save stats'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white/60">7 · Multiple simultaneous matches</h2>
          <p className="text-white/50 text-xs">
            Open this page in two tabs, pick a different match in each, and run them in parallel.
            The /squad pill aggregates contributions across every live match a player's nation is in.
          </p>
        </section>
      </div>
    </div>
  );
}
