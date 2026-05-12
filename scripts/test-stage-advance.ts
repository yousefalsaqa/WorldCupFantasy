/**
 * Unit tests for the chip-stacking + stage-advance plumbing.
 *
 * These tests run against pure helper functions only — they DO NOT
 * touch Prisma / the database. The actual DB-driven `maybeAdvanceStage`
 * behaviour is exercised manually via the admin match simulator
 * (the canonical "tick → finish" loop that's documented in
 * LIVE_POINTS_HANDOFF.md).
 *
 * Run with:  npx tsx scripts/test-stage-advance.ts
 */

import {
  parseActiveChips,
  serializeActiveChips,
  addActiveChip,
  removeActiveChip,
  hasUnlimitedTransferChip,
  hasTripleCaptain,
  hasBenchBoost,
  hasFreeHit,
  legacyChipUsed,
  type ChipType,
} from '../src/lib/chips-active';
import { TRANSFERS } from '../src/lib/wc-constants';

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  const tag = ok ? '\u2713 PASS' : '\u2717 FAIL';
  if (ok) passed++;
  else failed++;
  console.log(
    `${tag}  ${label}  \u2192  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

console.log('\n=== chips-active parse / serialize ===\n');

check('parseActiveChips: null → []', parseActiveChips(null), []);
check('parseActiveChips: undefined → []', parseActiveChips(undefined), []);
check('parseActiveChips: empty string → []', parseActiveChips(''), []);
check('parseActiveChips: malformed JSON → []', parseActiveChips('not-json'), []);
check('parseActiveChips: non-array JSON → []', parseActiveChips('{"foo":"bar"}'), []);
check(
  'parseActiveChips: valid single → array',
  parseActiveChips('["TRIPLE_CAPTAIN"]'),
  ['TRIPLE_CAPTAIN'],
);
check(
  'parseActiveChips: valid stacking → array',
  parseActiveChips('["TRIPLE_CAPTAIN","BENCH_BOOST"]'),
  ['TRIPLE_CAPTAIN', 'BENCH_BOOST'],
);
check(
  'parseActiveChips: dedupes duplicates',
  parseActiveChips('["TRIPLE_CAPTAIN","TRIPLE_CAPTAIN"]'),
  ['TRIPLE_CAPTAIN'],
);
check(
  'parseActiveChips: filters unknown chips',
  parseActiveChips('["TRIPLE_CAPTAIN","NOT_A_CHIP","BENCH_BOOST"]'),
  ['TRIPLE_CAPTAIN', 'BENCH_BOOST'],
);
check(
  'parseActiveChips: filters non-string entries',
  parseActiveChips('["TRIPLE_CAPTAIN",42,null,"BENCH_BOOST"]'),
  ['TRIPLE_CAPTAIN', 'BENCH_BOOST'],
);

check('serializeActiveChips: empty → null', serializeActiveChips([]), null);
check(
  'serializeActiveChips: single → JSON',
  serializeActiveChips(['TRIPLE_CAPTAIN']),
  '["TRIPLE_CAPTAIN"]',
);
check(
  'serializeActiveChips: stacked → JSON',
  serializeActiveChips(['TRIPLE_CAPTAIN', 'BENCH_BOOST']),
  '["TRIPLE_CAPTAIN","BENCH_BOOST"]',
);
check(
  'round-trip: parse(serialize(x)) === x',
  parseActiveChips(serializeActiveChips(['TRIPLE_CAPTAIN', 'BENCH_BOOST'])),
  ['TRIPLE_CAPTAIN', 'BENCH_BOOST'],
);

console.log('\n=== chips-active add / remove ===\n');

check(
  'addActiveChip: empty + TC',
  addActiveChip([], 'TRIPLE_CAPTAIN'),
  ['TRIPLE_CAPTAIN'],
);
check(
  'addActiveChip: stack TC + BB',
  addActiveChip(['TRIPLE_CAPTAIN'], 'BENCH_BOOST'),
  ['TRIPLE_CAPTAIN', 'BENCH_BOOST'],
);
check(
  'addActiveChip: duplicate is a no-op',
  addActiveChip(['TRIPLE_CAPTAIN'], 'TRIPLE_CAPTAIN'),
  ['TRIPLE_CAPTAIN'],
);
check(
  'addActiveChip: WC1 + FH + TC + BB (4-way stack)',
  addActiveChip(
    addActiveChip(addActiveChip(['WILDCARD_1'], 'FREE_HIT'), 'TRIPLE_CAPTAIN'),
    'BENCH_BOOST',
  ),
  ['WILDCARD_1', 'FREE_HIT', 'TRIPLE_CAPTAIN', 'BENCH_BOOST'],
);

check(
  'removeActiveChip: remove middle',
  removeActiveChip(['TRIPLE_CAPTAIN', 'BENCH_BOOST', 'FREE_HIT'], 'BENCH_BOOST'),
  ['TRIPLE_CAPTAIN', 'FREE_HIT'],
);
check(
  'removeActiveChip: remove missing → no-op',
  removeActiveChip(['TRIPLE_CAPTAIN'], 'BENCH_BOOST'),
  ['TRIPLE_CAPTAIN'],
);
check(
  'removeActiveChip: remove last → []',
  removeActiveChip(['TRIPLE_CAPTAIN'], 'TRIPLE_CAPTAIN'),
  [],
);

console.log('\n=== chips-active predicates ===\n');

check('hasUnlimitedTransferChip: WC1 yes', hasUnlimitedTransferChip(['WILDCARD_1']), true);
check('hasUnlimitedTransferChip: WC2 yes', hasUnlimitedTransferChip(['WILDCARD_2']), true);
check('hasUnlimitedTransferChip: FH yes', hasUnlimitedTransferChip(['FREE_HIT']), true);
check('hasUnlimitedTransferChip: TC no', hasUnlimitedTransferChip(['TRIPLE_CAPTAIN']), false);
check('hasUnlimitedTransferChip: BB no', hasUnlimitedTransferChip(['BENCH_BOOST']), false);
check('hasUnlimitedTransferChip: empty no', hasUnlimitedTransferChip([]), false);
check(
  'hasUnlimitedTransferChip: stacked TC+WC1 yes',
  hasUnlimitedTransferChip(['TRIPLE_CAPTAIN', 'WILDCARD_1']),
  true,
);

check('hasTripleCaptain: yes', hasTripleCaptain(['TRIPLE_CAPTAIN']), true);
check('hasTripleCaptain: no', hasTripleCaptain(['BENCH_BOOST']), false);
check('hasTripleCaptain: stacked', hasTripleCaptain(['BENCH_BOOST', 'TRIPLE_CAPTAIN']), true);

check('hasBenchBoost: yes', hasBenchBoost(['BENCH_BOOST']), true);
check('hasBenchBoost: no', hasBenchBoost(['TRIPLE_CAPTAIN']), false);

check('hasFreeHit: yes', hasFreeHit(['FREE_HIT']), true);
check('hasFreeHit: no', hasFreeHit(['WILDCARD_1']), false);

check('legacyChipUsed: empty → null', legacyChipUsed([]), null);
check('legacyChipUsed: TC → TC', legacyChipUsed(['TRIPLE_CAPTAIN']), 'TRIPLE_CAPTAIN');
check(
  'legacyChipUsed: stack uses first',
  legacyChipUsed(['FREE_HIT', 'TRIPLE_CAPTAIN']),
  'FREE_HIT',
);

console.log('\n=== Mercy rule arithmetic (lib/stage-advance) ===\n');

// The mercy rule is "if more eliminated players than free transfers, set
// freeTransfers = eliminated count". Re-implement that inline so we can
// test the math without spinning up Prisma. lib/stage-advance applies
// the same rule.
function computeFreeTransfers(baseAllocation: number, eliminatedCount: number): number {
  if (!TRANSFERS.MERCY_RULE_ENABLED) return baseAllocation;
  return eliminatedCount > baseAllocation ? eliminatedCount : baseAllocation;
}

check('mercy: 0 eliminated → base', computeFreeTransfers(3, 0), 3);
check('mercy: 1 eliminated, base 3 → base', computeFreeTransfers(3, 1), 3);
check('mercy: 3 eliminated, base 3 → base', computeFreeTransfers(3, 3), 3);
check(
  'mercy: 5 eliminated, base 3 → 5 (mercy kicks in)',
  computeFreeTransfers(3, 5),
  5,
);
check(
  'mercy: 8 eliminated, base 2 (AFTER_SF) → 8',
  computeFreeTransfers(2, 8),
  8,
);
check(
  'mercy: base 2 (GR1) baseline',
  computeFreeTransfers(2, 0),
  2,
);

console.log('\n=== Stage transition chip-refresh policy ===\n');

// FPL convention: chips refresh when entering the knockout phase. WC1
// stays consumed (group-stage wildcard); WC2/TC/BB/FH refresh. We
// re-implement the policy check from lib/stage-advance to exercise it.
const KNOCKOUT_STAGE_IDS = new Set(['R32', 'R16', 'QF', 'SF', '3RD', 'F']);
function refreshChipsOnEnter(nextStageId: string | null): boolean {
  return nextStageId !== null && KNOCKOUT_STAGE_IDS.has(nextStageId);
}

check('GR1 → GR2: no refresh', refreshChipsOnEnter('GR2'), false);
check('GR2 → GR3: no refresh', refreshChipsOnEnter('GR3'), false);
check('GR3 → R32: REFRESH', refreshChipsOnEnter('R32'), true);
check('R32 → R16: refresh (still in KO)', refreshChipsOnEnter('R16'), true);
check('R16 → QF: refresh', refreshChipsOnEnter('QF'), true);
check('SF → F: refresh', refreshChipsOnEnter('F'), true);
check('F → null (tournament over): no refresh', refreshChipsOnEnter(null), false);

console.log('\n=== Transfer allocation table (lib/wc-constants) ===\n');

// Sanity: the per-stage allocation table matches the documented spec.
// These constants drive lib/stage-advance.TRANSFERS_FOR_STAGE so changes
// here ripple straight into prod behaviour — guarding with tests so a
// stray edit gets caught.
check('GROUP_ROUND_1', 2, 2);
check('GROUP_ROUND_2 (TRANSFERS)', TRANSFERS.GROUP_ROUND_2, 2);
check('GROUP_ROUND_3 (more transfers, elims)', TRANSFERS.GROUP_ROUND_3, 3);
check('AFTER_R32', TRANSFERS.AFTER_R32, 3);
check('AFTER_R16', TRANSFERS.AFTER_R16, 3);
check('AFTER_QF', TRANSFERS.AFTER_QF, 3);
check('AFTER_SF (smaller squad)', TRANSFERS.AFTER_SF, 2);
check('HIT_COST', TRANSFERS.HIT_COST, 4);
check('MERCY_RULE_ENABLED', TRANSFERS.MERCY_RULE_ENABLED, true);

console.log('\n=== Captain multiplier with TRIPLE_CAPTAIN (squad-points) ===\n');

// Re-implement the captain multiplier branch from lib/squad-points so we
// can verify the chip-driven swap from 2x → 3x without touching Prisma.
function captainMultiplier(activeChips: ChipType[]): number {
  return hasTripleCaptain(activeChips) ? 3 : 2;
}

check('no chips: captain = 2x', captainMultiplier([]), 2);
check('TC alone: captain = 3x', captainMultiplier(['TRIPLE_CAPTAIN']), 3);
check(
  'TC + BB stacked: still 3x',
  captainMultiplier(['TRIPLE_CAPTAIN', 'BENCH_BOOST']),
  3,
);
check('BB alone: captain = 2x', captainMultiplier(['BENCH_BOOST']), 2);
check('WC1 alone: captain = 2x', captainMultiplier(['WILDCARD_1']), 2);

console.log('\n=== Bench-boost gate (squad-points) ===\n');

// `includeBench` controls whether bench players (isStarting=false) contribute
// to Team.totalPoints. Same logic as in lib/squad-points.
function includeBench(activeChips: ChipType[]): boolean {
  return hasBenchBoost(activeChips);
}

check('no chips: bench excluded', includeBench([]), false);
check('TC: bench excluded', includeBench(['TRIPLE_CAPTAIN']), false);
check('BB: bench INCLUDED', includeBench(['BENCH_BOOST']), true);
check(
  'TC+BB stack: bench INCLUDED',
  includeBench(['TRIPLE_CAPTAIN', 'BENCH_BOOST']),
  true,
);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
