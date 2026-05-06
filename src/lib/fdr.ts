// Fixture Difficulty Rating (FDR) – simple tier map for the
// 48 nations qualified for the 2026 FIFA World Cup.
// Lower = easier opponent (better for the player you own).

export type FDR = 1 | 2 | 3 | 4 | 5;

const TIER: Record<string, FDR> = {
  // Tier 5 – elite contenders
  BRA: 5, ARG: 5, FRA: 5, ESP: 5, ENG: 5, GER: 5, POR: 5, NED: 5, BEL: 5,

  // Tier 4 – strong sides
  URU: 4, CRO: 4, MEX: 4, USA: 4, COL: 4, MAR: 4, JPN: 4, SUI: 4, TUR: 4, SWE: 4,

  // Tier 3 – competitive (knockout-capable)
  KOR: 3, EGY: 3, IRN: 3, AUS: 3, ECU: 3, SEN: 3, NOR: 3, AUT: 3,
  SCO: 3, PAR: 3, TUN: 3, CIV: 3, NZL: 3, CZE: 3, BIH: 3,

  // Tier 2 – mid-table teams
  RSA: 2, QAT: 2, CAN: 2, GHA: 2, CPV: 2, KSA: 2, ALG: 2, JOR: 2,
  UZB: 2, PAN: 2, HAI: 2, CUW: 2, IRQ: 2, COD: 2,
};

/** Difficulty for a player whose nation is `_ownNation` facing `opponent`. */
export function getFixtureDifficulty(_ownNation: string, opponent: string): FDR {
  return TIER[opponent] ?? 3;
}

/** Short label used in tooltips */
export const DIFFICULTY_LABEL: Record<FDR, string> = {
  1: 'Very Easy',
  2: 'Easy',
  3: 'Average',
  4: 'Hard',
  5: 'Very Hard',
};
