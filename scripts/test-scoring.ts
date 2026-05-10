/**
 * Sanity-check the scoring engine end-to-end with hand-calculated scenarios.
 * Run with:  npx tsx scripts/test-scoring.ts
 *
 * Each scenario lists the expected total alongside it. We compare against
 * the engine's output and exit with a non-zero code if any case fails.
 */

import {
  calculatePerformancePoints,
  calculateBonusPointsForMatch,
  calculateTeamGameweekPoints,
  applyCaptainMultiplier,
  type PerformanceStats,
} from '../src/lib/scoring';

let passed = 0;
let failed = 0;

function check(label: string, actual: number, expected: number, hint?: string) {
  const ok = actual === expected;
  const tag = ok ? '\u2713 PASS' : '\u2717 FAIL';
  if (ok) passed++;
  else failed++;
  console.log(`${tag}  ${label}  \u2192  expected ${expected}, got ${actual}${hint ? `  (${hint})` : ''}`);
}

function blank(): PerformanceStats {
  return {
    position: 'MID',
    minutesPlayed: 0,
    goals: 0,
    assists: 0,
    longShotGoals: 0,
    cleanSheet: false,
    goalsConceeded: 0,
    saves: 0,
    penaltiesSaved: 0,
    penaltiesMissed: 0,
    defensiveContributions: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    bpsScore: 0,
    bonusPoints: 0,
  };
}

console.log('\n=== Per-player scenarios ===\n');

// 1. FWD scores 2, plays 90 -> 2 (appearance) + 2*4 (goals) = 10
check(
  'FWD: 90 min, 2 goals',
  calculatePerformancePoints({ ...blank(), position: 'FWD', minutesPlayed: 90, goals: 2 }).total,
  10
);

// 2. GK 90 min, clean sheet, 6 saves -> 2 + 4 + floor(6/3)=2 = 8
check(
  'GK: 90 min, clean sheet, 6 saves',
  calculatePerformancePoints({
    ...blank(),
    position: 'GK',
    minutesPlayed: 90,
    cleanSheet: true,
    saves: 6,
  }).total,
  8
);

// 3. DEF 90 min, scores from long shot, 1 yellow -> 2 + 6 + 2 + (-1) = 9
check(
  'DEF: 90 min, 1 long-shot goal, 1 yellow',
  calculatePerformancePoints({
    ...blank(),
    position: 'DEF',
    minutesPlayed: 90,
    goals: 1,
    longShotGoals: 1,
    yellowCards: 1,
  }).total,
  9
);

// 4. MID 60 min, 1 assist, 12 defensive contributions -> 2 + 3 + 2 = 7
check(
  'MID: 60 min, 1 assist, 12 DCs',
  calculatePerformancePoints({
    ...blank(),
    position: 'MID',
    minutesPlayed: 60,
    assists: 1,
    defensiveContributions: 12,
  }).total,
  7
);

// 5. GK 90, conceded 4, no clean sheet -> 2 + 0 - floor(4/2)*1 = 2 - 2 = 0
check(
  'GK: 90 min, 4 conceded, no CS',
  calculatePerformancePoints({
    ...blank(),
    position: 'GK',
    minutesPlayed: 90,
    cleanSheet: false,
    goalsConceeded: 4,
  }).total,
  0
);

// 6. FWD 45 min, missed pen, own goal -> 1 (under 60) + (-2) + (-2) = -3
check(
  'FWD: 45 min, miss pen, own goal',
  calculatePerformancePoints({
    ...blank(),
    position: 'FWD',
    minutesPlayed: 45,
    penaltiesMissed: 1,
    ownGoals: 1,
  }).total,
  -3
);

// 7. Player did not play -> 0 across the board
check(
  'Did not play',
  calculatePerformancePoints({ ...blank(), position: 'MID', minutesPlayed: 0 }).total,
  0
);

// 8. GK saves penalty -> 2 + 5 = 7
check(
  'GK: 90 min, 1 pen saved (no other saves)',
  calculatePerformancePoints({
    ...blank(),
    position: 'GK',
    minutesPlayed: 90,
    penaltiesSaved: 1,
  }).total,
  7
);

// 9. Red card on outfield 60+ min -> 2 + (-3) = -1
check(
  'MID: 90 min, red card',
  calculatePerformancePoints({
    ...blank(),
    position: 'MID',
    minutesPlayed: 90,
    redCards: 1,
  }).total,
  -1
);

// 10. CS only counts at 60+ minutes
check(
  'DEF: 59 min, clean sheet (should NOT score CS)',
  calculatePerformancePoints({
    ...blank(),
    position: 'DEF',
    minutesPlayed: 59,
    cleanSheet: true,
  }).total,
  1 // appearance only (under 60)
);

console.log('\n=== Captain multipliers ===\n');

check('Normal captain on 10 pts (2x)', applyCaptainMultiplier(10, false), 20);
check('Triple captain on 10 pts (3x)', applyCaptainMultiplier(10, true), 30);

console.log('\n=== Bonus distribution from BPS ===\n');

// Clean ranking 30 / 25 / 20 / 15 -> 3, 2, 1, 0
{
  const map = calculateBonusPointsForMatch([
    { playerId: 'a', bpsScore: 30 },
    { playerId: 'b', bpsScore: 25 },
    { playerId: 'c', bpsScore: 20 },
    { playerId: 'd', bpsScore: 15 },
  ]);
  check('BPS clean: 1st gets 3', map.get('a') ?? 0, 3);
  check('BPS clean: 2nd gets 2', map.get('b') ?? 0, 2);
  check('BPS clean: 3rd gets 1', map.get('c') ?? 0, 1);
  check('BPS clean: 4th gets 0', map.get('d') ?? 0, 0);
}

// Tied first: both get 3, next eligible gets 1
{
  const map = calculateBonusPointsForMatch([
    { playerId: 'a', bpsScore: 30 },
    { playerId: 'b', bpsScore: 30 },
    { playerId: 'c', bpsScore: 25 },
  ]);
  check('BPS tie-1st: a gets 3', map.get('a') ?? 0, 3);
  check('BPS tie-1st: b gets 3', map.get('b') ?? 0, 3);
  check('BPS tie-1st: c gets 1', map.get('c') ?? 0, 1);
}

// Tied second: both get 2, no third place awarded
{
  const map = calculateBonusPointsForMatch([
    { playerId: 'a', bpsScore: 30 },
    { playerId: 'b', bpsScore: 25 },
    { playerId: 'c', bpsScore: 25 },
    { playerId: 'd', bpsScore: 20 },
  ]);
  check('BPS tie-2nd: a gets 3', map.get('a') ?? 0, 3);
  check('BPS tie-2nd: b gets 2', map.get('b') ?? 0, 2);
  check('BPS tie-2nd: c gets 2', map.get('c') ?? 0, 2);
  check('BPS tie-2nd: d gets 0', map.get('d') ?? 0, 0);
}

console.log('\n=== Team gameweek totals ===\n');

// 11 starting players totaling 60 raw, captain on 10 (so x2 = +10 bonus),
// no chips, 0 hits -> 60 + 10 = 70
{
  const result = calculateTeamGameweekPoints(
    [5, 6, 4, 8, 7, 3, 5, 2, 6, 4, 10], // 60 total, captain is the 10
    [1, 2, 0, 3], // bench
    10, // captain raw points
    false, // not triple-captain
    false, // not bench-boost
    0
  );
  check('Team: 11 starters total 60, captain 10x2', result.totalPoints, 70);
}

// Same but with bench boost (adds 1+2+0+3 = 6) -> 76
{
  const result = calculateTeamGameweekPoints(
    [5, 6, 4, 8, 7, 3, 5, 2, 6, 4, 10],
    [1, 2, 0, 3],
    10,
    false,
    true, // bench boost ON
    0
  );
  check('Team: same + bench boost', result.totalPoints, 76);
}

// Triple captain: captain bonus is 10*(3-1) = 20, total = 60 + 20 = 80
{
  const result = calculateTeamGameweekPoints(
    [5, 6, 4, 8, 7, 3, 5, 2, 6, 4, 10],
    [1, 2, 0, 3],
    10,
    true, // triple captain
    false,
    0
  );
  check('Team: triple captain on 10', result.totalPoints, 80);
}

// 4-point hit -> 70 - 4 = 66
{
  const result = calculateTeamGameweekPoints(
    [5, 6, 4, 8, 7, 3, 5, 2, 6, 4, 10],
    [1, 2, 0, 3],
    10,
    false,
    false,
    4
  );
  check('Team: one 4-pt transfer hit', result.totalPoints, 66);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
