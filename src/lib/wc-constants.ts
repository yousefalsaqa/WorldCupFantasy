// ============================================
// WORLD CUP 2026 FANTASY - GAME CONSTANTS
// All rules encoded here for easy tweaking
// ============================================

// ============================================
// TOURNAMENT INFO
// ============================================
export const TOURNAMENT = {
  name: 'FIFA World Cup 2026',
  hosts: ['USA', 'Canada', 'Mexico'],
  startDate: '2026-06-11',
  endDate: '2026-07-19',
  totalTeams: 48,
  totalMatches: 104,
} as const;

// ============================================
// SQUAD RULES
// ============================================
export const SQUAD = {
  // Squad size varies by stage
  GROUP_STAGE: {
    total: 15,
    starting: 11,
    bench: 4,
  },
  KNOCKOUT_STAGE: {
    total: 16,
    starting: 11,
    bench: 5,
  },
  
  // Position requirements
  positions: {
    GK: { total: 2, min: 1, max: 1 }, // 2 in squad, 1 starting
    DEF: { total: 5, min: 3, max: 5 },
    MID: { total: 5, min: 2, max: 5 },
    FWD: { total: 3, min: 1, max: 3 },
  },
  
  // Max players from same nation (default; relaxes in late knockouts — see
  // maxPerNationForStage)
  maxPerNation: 3,
  
  // Budget (raised 100 → 105 mid-tournament, Jul 4 2026 — every existing
  // team's bank got +5.0 via scripts/increase-budget-105.ts)
  initialBudget: 105.0,
  minPlayerPrice: 4.0,
  maxPlayerPrice: 15.0,
  priceStep: 0.5,
} as const;

// ============================================
// VALID FORMATIONS (same as before)
// ============================================
export const VALID_FORMATIONS = [
  { DEF: 3, MID: 4, FWD: 3 }, // 3-4-3
  { DEF: 3, MID: 5, FWD: 2 }, // 3-5-2
  { DEF: 4, MID: 4, FWD: 2 }, // 4-4-2
  { DEF: 4, MID: 3, FWD: 3 }, // 4-3-3
  { DEF: 4, MID: 5, FWD: 1 }, // 4-5-1
  { DEF: 5, MID: 3, FWD: 2 }, // 5-3-2
  { DEF: 5, MID: 4, FWD: 1 }, // 5-4-1
  { DEF: 5, MID: 2, FWD: 3 }, // 5-2-3
] as const;

// ============================================
// TRANSFERS
// ============================================
export const TRANSFERS = {
  // Group stage - after each round
  GROUP_ROUND_1: 2,
  GROUP_ROUND_2: 2,
  GROUP_ROUND_3: 2, // Eliminations are covered by the mercy rule + banking
  
  // Knockout stage - after each stage
  AFTER_R32: 3,
  AFTER_R16: 3,
  AFTER_QF: 3,
  AFTER_SF: 2,
  
  // Hit cost for extra transfers beyond free allocation
  HIT_COST: 4,
  
  // Mercy rule: if eliminated players > free transfers,
  // you get transfers = eliminated count
  MERCY_RULE_ENABLED: true,
} as const;

// ============================================
// CHIPS
// ============================================
export const CHIPS = {
  WILDCARD_1: {
    name: 'Wildcard',
    description: 'Unlimited transfers, use anytime',
    availableFrom: 'DAY_1', // Available from start
    uses: 1,
  },
  WILDCARD_2: {
    name: 'Wildcard 2',
    description: 'Second wildcard, available after R32',
    availableFrom: 'AFTER_R32',
    uses: 1,
  },
  TRIPLE_CAPTAIN: {
    name: 'Triple Captain',
    description: 'Captain scores 3x points',
    availableFrom: 'DAY_1',
    uses: 1,
  },
  BENCH_BOOST: {
    name: 'Bench Boost',
    description: 'All bench players score points',
    availableFrom: 'DAY_1',
    uses: 1,
  },
} as const;

// ============================================
// DEADLINES
// ============================================
export const DEADLINES = {
  // Minutes before first match of the day/stage
  MINUTES_BEFORE_KICKOFF: 60, // 1 hour
  
  // Display timezone for users
  DISPLAY_TIMEZONE: 'America/New_York',
  
  // Backend always uses UTC
  BACKEND_TIMEZONE: 'UTC',
} as const;

// ============================================
// SCORING (Same as FPL-style)
// ============================================
export const SCORING = {
  // Appearance
  MINUTES_0: 0,
  MINUTES_1_TO_59: 1,
  MINUTES_60_PLUS: 2,
  
  // Goals
  GOAL_GK: 10,
  GOAL_DEF: 6,
  GOAL_MID: 5,
  GOAL_FWD: 4,
  
  // Assists
  ASSIST: 3,
  
  // Clean sheets (60+ mins required)
  CLEAN_SHEET_GK: 4,
  CLEAN_SHEET_DEF: 4,
  CLEAN_SHEET_MID: 1,
  CLEAN_SHEET_FWD: 0,
  
  // Goalkeeper
  SAVES_PER_POINT: 3, // +1 per 3 saves
  PENALTY_SAVE: 5,
  
  // Negative
  PENALTY_MISS: -2,
  GOALS_CONCEDED_PER_2: -1, // GK/DEF only
  YELLOW_CARD: -1,
  RED_CARD: -3,
  OWN_GOAL: -2,

  // Defensive contributions (mirrors FPL 2024-25 rule). The threshold is
  // lower for defensive positions because they accumulate fewer of these
  // actions per match. A "defensive action" sums:
  //   tackles.total + tackles.interceptions + tackles.blocks + duels.won
  // (duels.won added intentionally — covers aerial duels won by CBs,
  // ground duels won when shielding the ball, etc.)
  DC_BONUS: 2,
  DC_THRESHOLD_DEF: 10, // also applies to GK
  DC_THRESHOLD_MID_FWD: 12,

  // Bonus (knockout stage goals worth more?)
  KNOCKOUT_GOAL_BONUS: 1, // Extra point for knockout goals
  
  // Captain multipliers
  CAPTAIN_MULTIPLIER: 2,
  TRIPLE_CAPTAIN_MULTIPLIER: 3,
} as const;

// ============================================
// TOURNAMENT STAGES
// ============================================
export const STAGES = {
  GROUP_ROUND_1: { id: 'GR1', name: 'Group Stage - Round 1', order: 1 },
  GROUP_ROUND_2: { id: 'GR2', name: 'Group Stage - Round 2', order: 2 },
  GROUP_ROUND_3: { id: 'GR3', name: 'Group Stage - Round 3', order: 3 },
  ROUND_OF_32: { id: 'R32', name: 'Round of 32', order: 4 },
  ROUND_OF_16: { id: 'R16', name: 'Round of 16', order: 5 },
  QUARTER_FINALS: { id: 'QF', name: 'Quarter Finals', order: 6 },
  SEMI_FINALS: { id: 'SF', name: 'Semi Finals', order: 7 },
  THIRD_PLACE: { id: '3RD', name: 'Third Place Play-off', order: 8 },
  FINAL: { id: 'F', name: 'Final', order: 9 },
} as const;

export type StageId = keyof typeof STAGES;

// ============================================
// NATION CAP — FINAL CRUNCH RELAX
// ============================================
// The field halves every knockout round (32→16→8→4→2). With the standard
// 3-per-nation cap and only 2 nations in the Final, you could own at most 6
// finalists but need 11 starters — an XI becomes impossible to field. So the
// cap loosens as the field shrinks:
//   • Default (groups → QF): 3 per nation.
//   • SF / 3rd-place play-off (4 nations): 5 per nation.
//   • Final (2 nations): no cap (Infinity) so a full XI is fillable.
// Returned as a number; `Infinity` means "no limit". Callers that need a
// finite display value should special-case Infinity.
export function maxPerNationForStage(stageId: string | null | undefined): number {
  switch (stageId) {
    case 'SF':
    case '3RD':
      return 5;
    case 'F':
      return Infinity;
    default:
      return SQUAD.maxPerNation; // 3
  }
}

// ============================================
// AUTO-UNLIMITED TRANSFER STAGES
// ============================================
// Stages whose OPEN transfer window grants every team unlimited free transfers
// automatically — no chip consumed, no -4 hits. The group→knockout crossover
// (R32) is a massive squad reshuffle (16 nations knocked out), so the whole
// field gets a free rebuild instead of the mercy rule firing at that boundary.
// Mercy still applies normally from R16 onward as the field halves. The cap
// (maxPerNationForStage) is unaffected — R32 keeps the standard 3-per-nation.
export const AUTO_UNLIMITED_TRANSFER_STAGE_IDS: ReadonlySet<string> = new Set(['R32']);

export function isAutoUnlimitedTransferStage(stageId: string | null | undefined): boolean {
  return !!stageId && AUTO_UNLIMITED_TRANSFER_STAGE_IDS.has(stageId);
}

// ============================================
// POSITION DISPLAY
// ============================================
export const POSITION_COLORS = {
  GK: '#f59e0b',  // Amber
  DEF: '#22c55e', // Green
  MID: '#3b82f6', // Blue
  FWD: '#ef4444', // Red
} as const;

export const POSITION_LABELS = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  FWD: 'Forward',
} as const;

// ============================================
// UI VALIDATION
// ============================================
export const VALIDATION = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 20,
  USERNAME_PATTERN: /^[a-zA-Z0-9_]+$/,
  PASSWORD_MIN: 8,
  TEAM_NAME_MIN: 3,
  TEAM_NAME_MAX: 30,
  LEAGUE_NAME_MIN: 3,
  LEAGUE_NAME_MAX: 40,
  LEAGUE_CODE_LENGTH: 8,
} as const;
