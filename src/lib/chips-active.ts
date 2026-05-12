// ============================================
// Chip stacking helpers
//
// As of WC-prep, users can activate MULTIPLE chips in the same gameweek
// (e.g. Triple Captain + Bench Boost together). The active set lives in
// `TeamStage.chipsUsed` as a JSON-encoded array of chip IDs. The legacy
// `TeamStage.chipUsed` single-string column is kept in sync with the
// FIRST entry of the array so older read paths (e.g. /history) keep
// rendering without changes — but new code should always read the array.
//
// This module is the single source of truth for parsing / serializing /
// querying that array. Any route that touches chips should go through
// these helpers rather than re-implementing the JSON shape.
// ============================================

export type ChipType =
  | 'WILDCARD_1'
  | 'WILDCARD_2'
  | 'TRIPLE_CAPTAIN'
  | 'BENCH_BOOST'
  | 'FREE_HIT';

const ALL_CHIPS: ReadonlySet<ChipType> = new Set<ChipType>([
  'WILDCARD_1',
  'WILDCARD_2',
  'TRIPLE_CAPTAIN',
  'BENCH_BOOST',
  'FREE_HIT',
]);

// Chips that grant unlimited transfers for the stage they're active in.
// /api/transfers and /api/squad/get both check this to suppress hit-cost
// messaging and skip the transfer-count decrement.
const UNLIMITED_TRANSFER_CHIPS: ReadonlySet<ChipType> = new Set<ChipType>([
  'WILDCARD_1',
  'WILDCARD_2',
  'FREE_HIT',
]);

/**
 * Parse the JSON-encoded array stored in `TeamStage.chipsUsed`. Falls back
 * to an empty array on null / missing / malformed input so callers never
 * have to deal with parse exceptions. Also dedupes and filters unknown
 * chip IDs as a defensive measure against corrupted rows.
 */
export function parseActiveChips(raw: string | null | undefined): ChipType[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<ChipType>();
    const out: ChipType[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      if (!ALL_CHIPS.has(item as ChipType)) continue;
      if (seen.has(item as ChipType)) continue;
      seen.add(item as ChipType);
      out.push(item as ChipType);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Serialize back to the JSON string for storage. Returns `null` for the
 * empty array so we don't pollute the DB with `"[]"` strings (the legacy
 * `chipUsed` column uses `null` to mean "no chip active" and we mirror
 * that convention here).
 */
export function serializeActiveChips(chips: ChipType[]): string | null {
  if (chips.length === 0) return null;
  return JSON.stringify(chips);
}

/**
 * Append a chip to the active list. No-op if already present (stacking
 * the same chip twice doesn't do anything useful). Returns the new array
 * so callers can decide whether to also write to legacy `chipUsed`.
 */
export function addActiveChip(current: ChipType[], chip: ChipType): ChipType[] {
  if (current.includes(chip)) return current;
  return [...current, chip];
}

/**
 * Remove a chip from the active list (cancelling). No-op if not present.
 */
export function removeActiveChip(current: ChipType[], chip: ChipType): ChipType[] {
  return current.filter((c) => c !== chip);
}

/** True iff any chip in the active list grants unlimited transfers. */
export function hasUnlimitedTransferChip(chips: ChipType[]): boolean {
  return chips.some((c) => UNLIMITED_TRANSFER_CHIPS.has(c));
}

/** True iff TRIPLE_CAPTAIN is active (captain scores 3x instead of 2x). */
export function hasTripleCaptain(chips: ChipType[]): boolean {
  return chips.includes('TRIPLE_CAPTAIN');
}

/** True iff BENCH_BOOST is active (bench players score for the team). */
export function hasBenchBoost(chips: ChipType[]): boolean {
  return chips.includes('BENCH_BOOST');
}

/** True iff FREE_HIT is active (squad reverts at stage end). */
export function hasFreeHit(chips: ChipType[]): boolean {
  return chips.includes('FREE_HIT');
}

/**
 * What we write to the legacy `chipUsed` column whenever we update the
 * array. Conventionally the FIRST chip activated, so the history page
 * (which only knows about a single chip) shows something sensible. Using
 * "first activated" rather than "most recent" because the history table
 * is meant to surface "what did you do for this gameweek" — usually the
 * first chip is the meaningful one (FREE_HIT, WILDCARD_*); BENCH_BOOST/
 * TRIPLE_CAPTAIN tend to be stacked on top.
 */
export function legacyChipUsed(chips: ChipType[]): string | null {
  return chips.length === 0 ? null : chips[0];
}
