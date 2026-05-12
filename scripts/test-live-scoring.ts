/**
 * Unit tests for the live-scoring engine — the World Cup path that
 * powers /api/admin/test-live-fixture and /api/live/update.
 *
 * Run with:  npx tsx scripts/test-live-scoring.ts
 *
 * Two layers of tests:
 *   1. Synthetic edge cases that exercise the on-pitch model directly.
 *   2. The inaugural real-world fixture (Mushuc Runa 1-3 LDU de Quito,
 *      Ecuador Liga Pro, 2026-05-12, fixture 1519357) — every player's
 *      expected total was hand-calculated against the captured API JSON.
 */

import {
  LiveScoringCalculator,
  getOnPitchWindow,
  countOpponentGoalsInWindow,
  type OnPitchWindow,
} from '../src/lib/live-scoring';
import type {
  APIEvent,
  APIPlayerStats,
  APITeamPlayersResponse,
} from '../src/lib/api-football';

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown, hint?: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  const tag = ok ? '\u2713 PASS' : '\u2717 FAIL';
  if (ok) passed++;
  else failed++;
  console.log(
    `${tag}  ${label}  \u2192  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${hint ? `  (${hint})` : ''}`,
  );
}

// ============================================
// EVENT BUILDERS (minimal, type-correct)
// ============================================
function ev(args: {
  minute: number;
  extra?: number;
  teamId: number;
  teamName?: string;
  playerId: number;
  playerName?: string;
  assistId?: number | null;
  assistName?: string | null;
  type: APIEvent['type'];
  detail: string;
  comments?: string | null;
}): APIEvent {
  return {
    time: { elapsed: args.minute, extra: args.extra ?? null },
    team: { id: args.teamId, name: args.teamName ?? `team-${args.teamId}`, logo: '' },
    player: { id: args.playerId, name: args.playerName ?? `p-${args.playerId}` },
    assist: { id: args.assistId ?? null, name: args.assistName ?? null },
    type: args.type,
    detail: args.detail,
    comments: args.comments ?? null,
  };
}

// Minimal player-stats row builder. `position` is the API single-letter
// code (G/D/M/F) because the calculator converts internally.
function statsRow(args: {
  position: 'G' | 'D' | 'M' | 'F';
  minutes: number;
  substitute?: boolean;
  goals?: number | null;
  assists?: number | null;
  saves?: number | null;
  yellow?: number;
  red?: number;
  penaltiesSaved?: number | null;
  penaltiesMissed?: number;
  // Defensive-stat fields — all optional, used for DC bonus tests.
  tackles?: number;
  interceptions?: number;
  blocks?: number;
  duelsWon?: number;
}): APIPlayerStats['statistics'][0] {
  return {
    games: {
      minutes: args.minutes,
      number: 0,
      position: args.position,
      rating: null,
      captain: false,
      substitute: args.substitute ?? false,
    },
    goals: {
      total: args.goals ?? null,
      conceded: null,
      assists: args.assists ?? null,
      saves: args.saves ?? null,
    },
    cards: { yellow: args.yellow ?? 0, red: args.red ?? 0 },
    penalty: {
      won: null,
      committed: null,
      scored: 0,
      missed: args.penaltiesMissed ?? 0,
      saved: args.penaltiesSaved ?? null,
    },
    passes: { total: 0, key: null, accuracy: null },
    tackles: {
      total: args.tackles ?? 0,
      blocks: args.blocks ?? 0,
      interceptions: args.interceptions ?? 0,
    },
    duels: {
      total: null,
      won: args.duelsWon ?? 0,
    },
  };
}

function teamData(args: {
  teamId: number;
  players: Array<{ id: number; name: string; stats: APIPlayerStats['statistics'][0] }>;
}): APITeamPlayersResponse {
  return {
    team: { id: args.teamId, name: `team-${args.teamId}`, logo: '', update: '' },
    players: args.players.map((p) => ({
      player: { id: p.id, name: p.name, photo: '' },
      statistics: [p.stats],
    })),
  };
}

// ============================================
// 1) ON-PITCH WINDOW HELPERS
// ============================================
console.log('\n=== getOnPitchWindow ===\n');

{
  // Starter who played the full 90.
  const window = getOnPitchWindow(100, true, []);
  check('Starter no events: 0 → Infinity', window, {
    start: 0,
    end: Number.POSITIVE_INFINITY,
  } satisfies OnPitchWindow);
}

{
  // Starter subbed off at 70'.
  const events = [
    ev({
      minute: 70,
      teamId: 1,
      playerId: 100,
      assistId: 200,
      type: 'subst',
      detail: 'Substitution 1',
    }),
  ];
  const window = getOnPitchWindow(100, true, events);
  check('Starter subbed off at 70 → 0–70', window, { start: 0, end: 70 });
}

{
  // Sub coming on at 60, playing to end.
  const events = [
    ev({
      minute: 60,
      teamId: 1,
      playerId: 999,
      assistId: 200,
      type: 'subst',
      detail: 'Substitution 1',
    }),
  ];
  const window = getOnPitchWindow(200, false, events);
  check('Sub on at 60, plays to end → 60 → Infinity', window, {
    start: 60,
    end: Number.POSITIVE_INFINITY,
  });
}

{
  // Sub on at 60, sent off via red card at 80.
  const events = [
    ev({
      minute: 60,
      teamId: 1,
      playerId: 999,
      assistId: 200,
      type: 'subst',
      detail: 'Substitution 1',
    }),
    ev({
      minute: 80,
      teamId: 1,
      playerId: 200,
      type: 'Card',
      detail: 'Red Card',
    }),
  ];
  const window = getOnPitchWindow(200, false, events);
  check('Sub on at 60, red card at 80 → 60–80', window, { start: 60, end: 80 });
}

{
  // Starter, second yellow at 65.
  const events = [
    ev({ minute: 30, teamId: 1, playerId: 100, type: 'Card', detail: 'Yellow Card' }),
    ev({ minute: 65, teamId: 1, playerId: 100, type: 'Card', detail: 'Second Yellow card' }),
  ];
  const window = getOnPitchWindow(100, true, events);
  check('Second yellow at 65 cuts window to 0–65', window, { start: 0, end: 65 });
}

// ============================================
// 2) countOpponentGoalsInWindow
// ============================================
console.log('\n=== countOpponentGoalsInWindow ===\n');

{
  // Defender on full 90. Two opponent normal goals at 30 and 80.
  const events = [
    ev({ minute: 30, teamId: 2, playerId: 1, type: 'Goal', detail: 'Normal Goal' }),
    ev({ minute: 80, teamId: 2, playerId: 2, type: 'Goal', detail: 'Normal Goal' }),
  ];
  check(
    'Full 90 window, 2 opponent goals → 2',
    countOpponentGoalsInWindow(events, { start: 0, end: Number.POSITIVE_INFINITY }, 1, 2),
    2,
  );
}

{
  // Defender on 0–60. Goal at 30 (in window) and 80 (out of window).
  const events = [
    ev({ minute: 30, teamId: 2, playerId: 1, type: 'Goal', detail: 'Normal Goal' }),
    ev({ minute: 80, teamId: 2, playerId: 2, type: 'Goal', detail: 'Normal Goal' }),
  ];
  check(
    'Window 0–60, goals at 30 and 80 → 1',
    countOpponentGoalsInWindow(events, { start: 0, end: 60 }, 1, 2),
    1,
  );
}

{
  // Penalty shootout goal should NOT count.
  const events = [
    ev({
      minute: 120,
      teamId: 2,
      playerId: 1,
      type: 'Goal',
      detail: 'Normal Goal',
      comments: 'Penalty Shootout',
    }),
  ];
  check(
    'Shootout goal filtered out → 0',
    countOpponentGoalsInWindow(events, { start: 0, end: Number.POSITIVE_INFINITY }, 1, 2),
    0,
  );
}

{
  // Missed penalty should NOT count as conceded.
  const events = [
    ev({ minute: 60, teamId: 2, playerId: 1, type: 'Goal', detail: 'Missed Penalty' }),
  ];
  check(
    'Missed penalty filtered out → 0',
    countOpponentGoalsInWindow(events, { start: 0, end: Number.POSITIVE_INFINITY }, 1, 2),
    0,
  );
}

{
  // Own goal by player on team 1 counts as opponent (team 2) goal.
  const events = [
    ev({ minute: 50, teamId: 1, playerId: 5, type: 'Goal', detail: 'Own Goal' }),
  ];
  check(
    'Own goal scored against us still counts toward opponent → 1',
    countOpponentGoalsInWindow(events, { start: 0, end: Number.POSITIVE_INFINITY }, 1, 2),
    1,
  );
}

{
  // Stoppage-time goal at 90+4 — should count for a "full 90" player whose
  // window end is Infinity.
  const events = [
    ev({ minute: 90, extra: 4, teamId: 2, playerId: 1, type: 'Goal', detail: 'Normal Goal' }),
  ];
  check(
    '90+4 goal counts when end=Infinity → 1',
    countOpponentGoalsInWindow(events, { start: 0, end: Number.POSITIVE_INFINITY }, 1, 2),
    1,
  );
  check(
    '90+4 goal does NOT count when end=70 → 0',
    countOpponentGoalsInWindow(events, { start: 0, end: 70 }, 1, 2),
    0,
  );
}

// ============================================
// 3) END-TO-END: SYNTHETIC ON-PITCH SCENARIOS
// ============================================
console.log('\n=== Synthetic on-pitch scenarios ===\n');

function runOne(args: {
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  homePlayers: Array<{ id: number; name: string; stats: APIPlayerStats['statistics'][0] }>;
  awayPlayers: Array<{ id: number; name: string; stats: APIPlayerStats['statistics'][0] }>;
  events: APIEvent[];
  stageId?: string;
}) {
  const calc = new LiveScoringCalculator(args.stageId);
  return calc.processFixtureData(
    [
      teamData({ teamId: args.homeTeamId, players: args.homePlayers }),
      teamData({ teamId: args.awayTeamId, players: args.awayPlayers }),
    ],
    args.events,
    args.homeScore,
    args.awayScore,
    args.homeTeamId,
    args.awayTeamId,
  );
}

{
  // Scenario A: DEF on 0–65, team 0-0 when he leaves, opponent scores at
  // 80. Expected: +4 CS bonus (his on-pitch window was clean) + App(2)
  // + 0 conceded penalty (goal outside his window).
  // Team A (id 1) is home, conceded 1.
  const results = runOne({
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 0,
    awayScore: 1,
    homePlayers: [
      { id: 10, name: 'CleanSheetDef', stats: statsRow({ position: 'D', minutes: 65 }) },
      { id: 11, name: 'Stayed90Def', stats: statsRow({ position: 'D', minutes: 90 }) },
    ],
    awayPlayers: [
      { id: 20, name: 'OpponentScorer', stats: statsRow({ position: 'F', minutes: 90, goals: 1 }) },
    ],
    events: [
      ev({ minute: 65, teamId: 1, playerId: 10, assistId: 99, type: 'subst', detail: 'Substitution 1' }),
      ev({ minute: 80, teamId: 2, playerId: 20, type: 'Goal', detail: 'Normal Goal' }),
    ],
  });
  const csDef = results.find((r) => r.apiPlayerId === 10);
  check('On-pitch CS bonus: DEF off at 65 with clean window → +4 CS', csDef?.points.cleanSheet, 4);
  check('On-pitch CS total: 2 (app) + 4 (CS) = 6', csDef?.totalPoints, 6);

  const lateDef = results.find((r) => r.apiPlayerId === 11);
  check('Stayed-on DEF: goal in window → no CS bonus', lateDef?.points.cleanSheet, 0);
  check('Stayed-on DEF: 1 in window, floor(1/2)=0 conceded → no penalty', lateDef?.points.goalsConceeded, 0);
}

{
  // Scenario B: DEF on 0–50, team kept full CS, match ends 0-0.
  // Failed the 60-minute rule → no CS bonus. App(1) only.
  const results = runOne({
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 0,
    awayScore: 0,
    homePlayers: [
      { id: 10, name: 'EarlySubDef', stats: statsRow({ position: 'D', minutes: 50 }) },
    ],
    awayPlayers: [],
    events: [
      ev({ minute: 50, teamId: 1, playerId: 10, assistId: 99, type: 'subst', detail: 'Substitution 1' }),
    ],
  });
  const def = results.find((r) => r.apiPlayerId === 10);
  check('60-min rule: DEF subbed off at 50 with CS → no bonus', def?.points.cleanSheet, 0);
  check('60-min rule: total = App(1) = 1', def?.totalPoints, 1);
}

{
  // Scenario C: GK plays 90, team conceded 3 — all in window.
  // floor(3/2) = 1 → -1 point. App(2) + Saves(0) - 1 = 1.
  const results = runOne({
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 0,
    awayScore: 3,
    homePlayers: [
      { id: 10, name: 'BeatenKeeper', stats: statsRow({ position: 'G', minutes: 90, saves: 5 }) },
    ],
    awayPlayers: [],
    events: [
      ev({ minute: 20, teamId: 2, playerId: 99, type: 'Goal', detail: 'Normal Goal' }),
      ev({ minute: 50, teamId: 2, playerId: 99, type: 'Goal', detail: 'Normal Goal' }),
      ev({ minute: 85, teamId: 2, playerId: 99, type: 'Goal', detail: 'Normal Goal' }),
    ],
  });
  const gk = results.find((r) => r.apiPlayerId === 10);
  check('GK 90 min, 3 in window → -1 penalty', gk?.points.goalsConceeded, -1);
  check('GK 90 min, 5 saves → floor(5/3) = 1 save point', gk?.points.saves, 1);
  check('GK total: 2 + 1 - 1 = 2', gk?.totalPoints, 2);
}

{
  // Scenario D1: Second-yellow red card BEFORE team concedes.
  // DEF gets second yellow at 60. Opponent scores at 75 (after he's off).
  // RED-CARD VOID RULE: even though his on-pitch window was clean, a
  // sent-off player forfeits the CS bonus (matches standard FPL).
  //   App(2) + CS(0, red voided) + Yellow(-1) + Red(-3) + 0 conceded = -2
  const results = runOne({
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 0,
    awayScore: 1,
    homePlayers: [
      {
        id: 10,
        name: 'RedCarded',
        // minutes=60 because the red ended his match exactly at the 60 mark
        stats: statsRow({ position: 'D', minutes: 60, yellow: 1, red: 1 }),
      },
    ],
    awayPlayers: [],
    events: [
      ev({ minute: 40, teamId: 1, playerId: 10, type: 'Card', detail: 'Yellow Card' }),
      ev({ minute: 60, teamId: 1, playerId: 10, type: 'Card', detail: 'Second Yellow card' }),
      ev({ minute: 75, teamId: 2, playerId: 99, type: 'Goal', detail: 'Normal Goal' }),
    ],
  });
  const def = results.find((r) => r.apiPlayerId === 10);
  check('Red-card DEF: window cut at 60, goal at 75 not in window → 0 penalty', def?.points.goalsConceeded, 0);
  check('Red-card DEF: red-card voids CS even with clean window → 0', def?.points.cleanSheet, 0);
  check('Red-card DEF: total = App(2) - Yellow(1) - Red(3) = -2', def?.totalPoints, -2);
}

{
  // Scenario D2: Red card AFTER team concedes — CS bonus correctly denied.
  // DEF gets straight red at 70. Opponent scored at 40 (already in window).
  //   App(2) + CS(0) + Red(-3) + Conceded(-0 floor(1/2)) = -1
  const results = runOne({
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 0,
    awayScore: 1,
    homePlayers: [
      {
        id: 10,
        name: 'RedAfterConcede',
        stats: statsRow({ position: 'D', minutes: 70, red: 1 }),
      },
    ],
    awayPlayers: [],
    events: [
      ev({ minute: 40, teamId: 2, playerId: 99, type: 'Goal', detail: 'Normal Goal' }),
      ev({ minute: 70, teamId: 1, playerId: 10, type: 'Card', detail: 'Red Card' }),
    ],
  });
  const def = results.find((r) => r.apiPlayerId === 10);
  check('Red after concede: goal at 40 IN window → CS denied', def?.points.cleanSheet, 0);
  check('Red after concede: 1 in window, floor(1/2)=0 → 0 penalty', def?.points.goalsConceeded, 0);
  check('Red after concede: total = App(2) - Red(3) = -1', def?.totalPoints, -1);
}

{
  // Scenario E: Knockout-stage goal bonus.
  // FWD scores in the Final → 4 + 1 (KO bonus) = 5 per goal.
  const results = runOne({
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 1,
    awayScore: 0,
    homePlayers: [
      { id: 10, name: 'KOScorer', stats: statsRow({ position: 'F', minutes: 90, goals: 1 }) },
    ],
    awayPlayers: [],
    events: [
      ev({ minute: 70, teamId: 1, playerId: 10, type: 'Goal', detail: 'Normal Goal' }),
    ],
    stageId: 'F',
  });
  const fwd = results.find((r) => r.apiPlayerId === 10);
  check('Knockout goal bonus on FWD goal: 4 + 1 = 5', fwd?.points.goals, 5);
  // total = app(2) + goals(5) + CS(0, this is FWD so 0 anyway) + ... = 7
  check('Knockout FWD total: 2 + 5 = 7', fwd?.totalPoints, 7);
}

{
  // Scenario F: Own goal — scorer eats -2, opponent on-pitch sees +1
  // in their conceded count.
  const results = runOne({
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 0,
    awayScore: 1,
    homePlayers: [
      { id: 10, name: 'OG', stats: statsRow({ position: 'D', minutes: 90 }) },
    ],
    awayPlayers: [],
    events: [
      // Own goal: event.team is the SCORER's team (team 1, the one
      // scoring on themselves) — goal credited to team 2 on the
      // scoreboard.
      ev({ minute: 50, teamId: 1, playerId: 10, type: 'Goal', detail: 'Own Goal' }),
    ],
  });
  const og = results.find((r) => r.apiPlayerId === 10);
  check('Own goal: scorer gets -2', og?.points.ownGoals, -2);
  check('Own goal: in-window conceded for DEF on 90 = 1, floor(1/2)=0 → 0 penalty', og?.points.goalsConceeded, 0);
  // total = app(2) - 2 (own goal) + 0 (CS, since 1 conceded) + 0 (penalty) = 0
  check('Own goal DEF total: 2 - 2 = 0', og?.totalPoints, 0);
}

{
  // Scenario G: Penalty shootout goal must NOT score fantasy points.
  // (The aggregate stats `goals.total` would NOT include shootouts —
  // API excludes them — but defensive engines should still verify the
  // event filter works in isolation.)
  // We pass a player with `goals.total = 0` and a shootout Goal event;
  // expected: 0 goal points.
  const results = runOne({
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 0,
    awayScore: 0,
    homePlayers: [
      { id: 10, name: 'ShootoutGuy', stats: statsRow({ position: 'F', minutes: 90, goals: 0 }) },
    ],
    awayPlayers: [],
    events: [
      ev({
        minute: 120,
        teamId: 1,
        playerId: 10,
        type: 'Goal',
        detail: 'Normal Goal',
        comments: 'Penalty Shootout',
      }),
    ],
  });
  const fwd = results.find((r) => r.apiPlayerId === 10);
  check('Shootout goal ignored in fantasy → 0 goal points', fwd?.points.goals, 0);
}

// ============================================
// 3b) DEFENSIVE CONTRIBUTIONS (FPL 2024-25 rule)
// Threshold = 10 for DEF/GK, 12 for MID/FWD. Bonus = +2.
// Sum = tackles.total + tackles.interceptions + tackles.blocks + duels.won.
// ============================================
console.log('\n=== Defensive contributions ===\n');

{
  // DEF with 4+3+2 = 9 actions, no duels — just under threshold. No bonus.
  const results = runOne({
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 0,
    awayScore: 0,
    homePlayers: [
      {
        id: 10,
        name: 'CloseButNo',
        stats: statsRow({
          position: 'D',
          minutes: 90,
          tackles: 4,
          interceptions: 3,
          blocks: 2,
        }),
      },
    ],
    awayPlayers: [],
    events: [],
  });
  const def = results.find((r) => r.apiPlayerId === 10);
  check('DEF 9 actions → no DC bonus', def?.points.defensiveContributions, 0);
  check('DEF 9 actions: total = App(2) + CS(4) = 6', def?.totalPoints, 6);
}

{
  // DEF with 5+3+1+1 = 10 actions across all 4 fields. Bonus fires.
  const results = runOne({
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 0,
    awayScore: 0,
    homePlayers: [
      {
        id: 10,
        name: 'DCDef',
        stats: statsRow({
          position: 'D',
          minutes: 90,
          tackles: 5,
          interceptions: 3,
          blocks: 1,
          duelsWon: 1,
        }),
      },
    ],
    awayPlayers: [],
    events: [],
  });
  const def = results.find((r) => r.apiPlayerId === 10);
  check('DEF 10 actions → +2 DC bonus', def?.points.defensiveContributions, 2);
  check('DEF 10 actions: raw count surfaced', def?.defensiveActions, 10);
  check('DEF 10 actions: total = App(2) + CS(4) + DC(2) = 8', def?.totalPoints, 8);
}

{
  // MID with 11 actions (just under MID threshold of 12). No bonus.
  const results = runOne({
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 0,
    awayScore: 0,
    homePlayers: [
      {
        id: 10,
        name: 'BusyMid',
        stats: statsRow({
          position: 'M',
          minutes: 90,
          tackles: 6,
          interceptions: 3,
          blocks: 1,
          duelsWon: 1,
        }),
      },
    ],
    awayPlayers: [],
    events: [],
  });
  const mid = results.find((r) => r.apiPlayerId === 10);
  check('MID 11 actions → no DC bonus (threshold = 12)', mid?.points.defensiveContributions, 0);
  check('MID 11 actions: total = App(2) + CS(1) = 3', mid?.totalPoints, 3);
}

{
  // MID with 12 actions. Bonus fires.
  const results = runOne({
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 0,
    awayScore: 0,
    homePlayers: [
      {
        id: 10,
        name: 'DCMid',
        stats: statsRow({
          position: 'M',
          minutes: 90,
          tackles: 6,
          interceptions: 3,
          blocks: 2,
          duelsWon: 1,
        }),
      },
    ],
    awayPlayers: [],
    events: [],
  });
  const mid = results.find((r) => r.apiPlayerId === 10);
  check('MID 12 actions → +2 DC bonus', mid?.points.defensiveContributions, 2);
  check('MID 12 actions: total = App(2) + CS(1) + DC(2) = 5', mid?.totalPoints, 5);
}

{
  // FWD with 12 actions — same threshold as MID. Bonus fires.
  const results = runOne({
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 0,
    awayScore: 0,
    homePlayers: [
      {
        id: 10,
        name: 'PressForward',
        stats: statsRow({
          position: 'F',
          minutes: 90,
          tackles: 5,
          interceptions: 2,
          blocks: 1,
          duelsWon: 4,
        }),
      },
    ],
    awayPlayers: [],
    events: [],
  });
  const fwd = results.find((r) => r.apiPlayerId === 10);
  check('FWD 12 actions → +2 DC bonus (FWD threshold also 12)', fwd?.points.defensiveContributions, 2);
}

{
  // GK with 10 actions (rare — sweeper-keeper, ball-playing scenario).
  // GK uses the DEF threshold (10).
  const results = runOne({
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 0,
    awayScore: 1,
    homePlayers: [
      {
        id: 10,
        name: 'SweeperKeeper',
        stats: statsRow({
          position: 'G',
          minutes: 90,
          saves: 0,
          tackles: 2,
          interceptions: 5,
          blocks: 2,
          duelsWon: 1,
        }),
      },
    ],
    awayPlayers: [],
    events: [
      ev({ minute: 30, teamId: 2, playerId: 99, type: 'Goal', detail: 'Normal Goal' }),
    ],
  });
  const gk = results.find((r) => r.apiPlayerId === 10);
  check('GK 10 actions → +2 DC bonus (GK uses DEF threshold)', gk?.points.defensiveContributions, 2);
}

{
  // Sub DEF (came on late, only 25 min) racks up 10 actions. Bonus is
  // NOT gated on the 60-min appearance rule, so it fires.
  const results = runOne({
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 0,
    awayScore: 0,
    homePlayers: [
      {
        id: 10,
        name: 'BusySub',
        stats: statsRow({
          position: 'D',
          minutes: 25,
          substitute: true,
          tackles: 6,
          interceptions: 3,
          blocks: 1,
          duelsWon: 0,
        }),
      },
    ],
    awayPlayers: [],
    events: [
      ev({ minute: 65, teamId: 1, playerId: 999, assistId: 10, type: 'subst', detail: 'Substitution 1' }),
    ],
  });
  const sub = results.find((r) => r.apiPlayerId === 10);
  check('Sub DEF 10 actions in 25 min → still +2 DC (no 60-min gate)', sub?.points.defensiveContributions, 2);
  check('Sub DEF: App(1, <60) + CS(0, <60) + DC(2) = 3', sub?.totalPoints, 3);
}

// ============================================
// 4) THE INAUGURAL REAL-WORLD FIXTURE
//    Mushuc Runa SC 1-3 LDU de Quito (Ecuador Liga Pro)
//    API-Football fixture id 1519357, 2026-05-12
//    Captured during initial recon session — see plan doc.
// ============================================
console.log('\n=== Mushuc Runa 1-3 LDU de Quito (fixture 1519357) ===\n');

const MUSHUC = 1162;
const LDU = 1158;

// Events trimmed to the ones that affect scoring (cards + goals + subs).
const realEvents: APIEvent[] = [
  ev({ minute: 35, teamId: MUSHUC, playerId: 16708, type: 'Card', detail: 'Yellow Card' }), // Flor
  ev({ minute: 37, teamId: LDU, playerId: 12303, type: 'Card', detail: 'Yellow Card' }), // Ade
  ev({ minute: 37, teamId: MUSHUC, playerId: 16769, type: 'Card', detail: 'Yellow Card' }), // Carabali
  ev({ minute: 44, teamId: LDU, playerId: 392640, type: 'Card', detail: 'Yellow Card' }), // Quinonez
  ev({ minute: 46, teamId: LDU, playerId: 13196, assistId: 70606, type: 'subst', detail: 'Substitution 1' }), // Medina off, Redes on
  ev({ minute: 54, teamId: LDU, playerId: 11540, assistId: 81380, type: 'Goal', detail: 'Normal Goal' }), // Cornejo goal, Luna Tobar assist
  ev({ minute: 64, teamId: MUSHUC, playerId: 16708, assistId: 16575, type: 'subst', detail: 'Substitution 1' }), // Flor off, Orejuela on
  ev({ minute: 66, teamId: LDU, playerId: 81380, assistId: 16479, type: 'subst', detail: 'Substitution 2' }), // Luna Tobar off, Quintero on
  ev({ minute: 68, teamId: LDU, playerId: 16479, type: 'Card', detail: 'Yellow Card' }), // Quintero
  ev({ minute: 70, teamId: LDU, playerId: 11540, assistId: 65702, type: 'subst', detail: 'Substitution 3' }), // Cornejo off, Villamil on
  ev({ minute: 71, teamId: LDU, playerId: 16432, assistId: 9934, type: 'subst', detail: 'Substitution 4' }), // Estrada off, Deyverson on
  ev({ minute: 71, teamId: MUSHUC, playerId: 51537, assistId: 16792, type: 'subst', detail: 'Substitution 2' }), // Lemos off, Carrillo on
  ev({ minute: 76, teamId: LDU, playerId: 9934, type: 'Card', detail: 'Yellow Card' }), // Deyverson
  ev({ minute: 77, teamId: MUSHUC, playerId: 2578, assistId: 81191, type: 'subst', detail: 'Substitution 3' }), // Ibarra off, Mina on
  ev({ minute: 78, teamId: LDU, playerId: 9934, assistId: 70606, type: 'Goal', detail: 'Normal Goal' }), // Deyverson, Redes assist
  ev({ minute: 81, teamId: LDU, playerId: 9934, assistId: 39798, type: 'Goal', detail: 'Normal Goal' }), // Deyverson, Pretell assist
  ev({ minute: 84, teamId: LDU, playerId: 392640, assistId: 482352, type: 'subst', detail: 'Substitution 5' }), // Quinonez off, Castillo on
  ev({ minute: 90, extra: 3, teamId: MUSHUC, playerId: 16792, type: 'Card', detail: 'Yellow Card' }), // Carrillo yellow
  ev({ minute: 90, extra: 4, teamId: MUSHUC, playerId: 16792, assistId: 314002, type: 'Goal', detail: 'Normal Goal' }), // Carrillo goal, Velasco assist
];

const realTeams: APITeamPlayersResponse[] = [
  {
    team: { id: MUSHUC, name: 'Mushuc Runa SC', logo: '', update: '' },
    players: [
      // ⚠ Per API data, only the GK has goals.conceded set. We rely on the
      // on-pitch model now, so non-GK rows don't need conceded data.
      { player: { id: 51353, name: 'Rodrigo Formento', photo: '' }, statistics: [statsRow({ position: 'G', minutes: 90, saves: 2 })] },
      { player: { id: 16599, name: 'Kevin Peralta', photo: '' }, statistics: [statsRow({ position: 'D', minutes: 90 })] },
      { player: { id: 16769, name: 'Franklin Carabali', photo: '' }, statistics: [statsRow({ position: 'D', minutes: 90, yellow: 1 })] },
      { player: { id: 58439, name: 'Brian Negro', photo: '' }, statistics: [statsRow({ position: 'D', minutes: 90 })] },
      { player: { id: 16708, name: 'José Flor', photo: '' }, statistics: [statsRow({ position: 'D', minutes: 64, yellow: 1 })] },
      { player: { id: 16777, name: 'Nicolás Davila', photo: '' }, statistics: [statsRow({ position: 'M', minutes: 90 })] },
      { player: { id: 51537, name: 'Lucas Lemos', photo: '' }, statistics: [statsRow({ position: 'M', minutes: 71 })] },
      { player: { id: 156956, name: 'Cristopher Angulo', photo: '' }, statistics: [statsRow({ position: 'M', minutes: 90 })] },
      { player: { id: 2578, name: 'Renato Ibarra', photo: '' }, statistics: [statsRow({ position: 'M', minutes: 77 })] },
      { player: { id: 314002, name: 'Kevin Velasco', photo: '' }, statistics: [statsRow({ position: 'M', minutes: 90, assists: 1 })] },
      { player: { id: 5802, name: 'Facundo Castelli', photo: '' }, statistics: [statsRow({ position: 'F', minutes: 90 })] },
      { player: { id: 16575, name: 'Carlos Orejuela', photo: '' }, statistics: [statsRow({ position: 'M', minutes: 26, substitute: true })] },
      { player: { id: 16792, name: 'Ronie Carrillo', photo: '' }, statistics: [statsRow({ position: 'F', minutes: 19, substitute: true, goals: 1, yellow: 1 })] },
      { player: { id: 81191, name: 'Freddy Mina', photo: '' }, statistics: [statsRow({ position: 'F', minutes: 13, substitute: true })] },
    ],
  },
  {
    team: { id: LDU, name: 'LDU de Quito', logo: '', update: '' },
    players: [
      { player: { id: 16642, name: 'Gonzalo Valle', photo: '' }, statistics: [statsRow({ position: 'G', minutes: 90, saves: null })] },
      { player: { id: 101882, name: 'Gian Franco Allala', photo: '' }, statistics: [statsRow({ position: 'D', minutes: 90 })] },
      { player: { id: 12303, name: 'Ricardo Adé', photo: '' }, statistics: [statsRow({ position: 'D', minutes: 90, yellow: 1 })] },
      { player: { id: 16372, name: 'Luis Segovia', photo: '' }, statistics: [statsRow({ position: 'D', minutes: 90 })] },
      { player: { id: 392640, name: 'Yerlin Quinonez', photo: '' }, statistics: [statsRow({ position: 'M', minutes: 84, yellow: 1 })] },
      { player: { id: 11540, name: 'Fernando Cornejo', photo: '' }, statistics: [statsRow({ position: 'M', minutes: 70, goals: 1 })] },
      { player: { id: 39798, name: 'Jesús Pretell', photo: '' }, statistics: [statsRow({ position: 'M', minutes: 90, assists: 1 })] },
      { player: { id: 16419, name: 'Leonel Quiñónez', photo: '' }, statistics: [statsRow({ position: 'M', minutes: 90 })] },
      { player: { id: 13196, name: 'Jeison Medina', photo: '' }, statistics: [statsRow({ position: 'F', minutes: 45 })] },
      { player: { id: 16432, name: 'Michael Estrada', photo: '' }, statistics: [statsRow({ position: 'F', minutes: 71 })] },
      { player: { id: 81380, name: 'Alejandro Tobar', photo: '' }, statistics: [statsRow({ position: 'F', minutes: 66, assists: 1 })] },
      { player: { id: 70606, name: 'Rodney Redes', photo: '' }, statistics: [statsRow({ position: 'F', minutes: 45, substitute: true, assists: 1 })] },
      { player: { id: 16479, name: 'José Quintero', photo: '' }, statistics: [statsRow({ position: 'D', minutes: 24, substitute: true, yellow: 1 })] },
      { player: { id: 65702, name: 'Gabriel Villamil', photo: '' }, statistics: [statsRow({ position: 'M', minutes: 20, substitute: true })] },
      { player: { id: 9934, name: 'Deyverson', photo: '' }, statistics: [statsRow({ position: 'F', minutes: 19, substitute: true, goals: 2, yellow: 1 })] },
      { player: { id: 482352, name: 'Ederson Castillo', photo: '' }, statistics: [statsRow({ position: 'M', minutes: 11, substitute: true })] },
    ],
  },
];

const calc = new LiveScoringCalculator(); // Regular season — no KO bonus
const realResults = calc.processFixtureData(
  realTeams,
  realEvents,
  1, // Mushuc home goals
  3, // LDU away goals
  MUSHUC,
  LDU,
);

const byId = new Map(realResults.map((r) => [r.apiPlayerId, r]));
function expectTotal(playerId: number, expectedTotal: number, label: string) {
  const r = byId.get(playerId);
  check(label, r?.totalPoints, expectedTotal);
}

// LDU (away, won 3-1)
expectTotal(9934, 8, 'Deyverson: sub 19min + 2 FWD goals(8) - 1 yellow = 8');
// Cornejo: MID, off at 70'. LDU's only conceded was Carrillo at 90+4 →
// OUTSIDE his window → on-pitch CS triggers (+1 for MID). This is exactly
// the kind of result the unified on-pitch model was designed to produce.
expectTotal(11540, 8, 'Cornejo (MID, off at 70) → on-pitch CS bonus: 2 + 5 + 1 = 8');
expectTotal(81380, 5, 'Luna Tobar: 66min + assist(3) = 5');
expectTotal(39798, 5, 'Pretell: 90min + assist(3) = 5');
expectTotal(70606, 4, 'Redes (sub): 45min(1) + assist(3) = 4');
// Valle GK 90min, conceded 1 (Carrillo at 90+4 — in window). floor(1/2)=0. No CS. Saves null=0.
expectTotal(16642, 2, 'Valle GK: 90min + 0 saves + 0 conceded penalty = 2');
expectTotal(101882, 2, 'Allala DEF 90min, 1 in window → 0 penalty, no CS = 2');
expectTotal(16372, 2, 'Segovia DEF 90min, 1 in window → 0 penalty, no CS = 2');
expectTotal(16419, 2, 'L. Quiñónez MID 90min = 2');
expectTotal(16432, 2, 'Estrada FWD 71min = 2');
expectTotal(12303, 1, 'Adé DEF 90min - yellow(1) = 1');
// Y. Quiñonez: MID, off at 84' — same as Cornejo, the 90+4 conceded is
// outside his window → on-pitch CS_MID (+1).
expectTotal(392640, 2, 'Y. Quiñonez (MID, off at 84) → on-pitch CS: 2 - 1 + 1 = 2');
expectTotal(13196, 1, 'Medina FWD 45min(1) = 1');
expectTotal(65702, 1, 'Villamil (sub) 20min = 1');
expectTotal(482352, 1, 'Castillo (sub) 11min = 1');
expectTotal(16479, 0, 'Quintero (sub D) 24min - yellow(1) = 0');

// Mushuc Runa (home, lost 1-3)
// Mushuc conceded at 54, 78, 81. Players on full 90 see all 3 → floor(3/2) = 1 → -1.
expectTotal(314002, 5, 'Velasco MID 90min + assist(3) = 5');
expectTotal(16792, 4, 'Carrillo (sub F) 19min + 1 FWD goal(4) - yellow(1) = 4');
// Formento GK 90, conceded 3 in window, saves=2 (floor(2/3)=0 save pts), -1 penalty = 1
expectTotal(51353, 1, 'Formento GK: 90 + 0 save pts - 1 conceded = 1');
// Peralta DEF 90, 3 in window, -1
expectTotal(16599, 1, 'Peralta DEF 90min - 1 conceded = 1');
// Negro DEF 90, 3 in window, -1
expectTotal(58439, 1, 'Negro DEF 90min - 1 conceded = 1');
// Carabali DEF 90, 3 in window, -1, yellow -1 = 0
expectTotal(16769, 0, 'Carabali DEF 90min - yellow - 1 conceded = 0');
// Flor DEF 0-64. ON-PITCH MODEL: only goal at 54 was in his window → 1 conceded → floor(1/2)=0 → no penalty.
// total = app(2) - yellow(1) - 0 penalty = 1. (Old team-total model would give 0.)
expectTotal(16708, 1, 'Flor DEF 64min, 1-in-window conceded → 0 penalty (ON-PITCH MODEL FIX)');
expectTotal(16777, 2, 'Davila MID 90min = 2');
expectTotal(51537, 2, 'Lemos MID 71min = 2');
expectTotal(156956, 2, 'Angulo MID 90min = 2');
expectTotal(2578, 2, 'Ibarra MID 77min = 2');
expectTotal(5802, 2, 'Castelli FWD 90min = 2');
expectTotal(16575, 1, 'Orejuela (sub M) 26min = 1');
expectTotal(81191, 1, 'Mina (sub F) 13min = 1');

// ============================================
// 5) SUMMARY
// ============================================
console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
