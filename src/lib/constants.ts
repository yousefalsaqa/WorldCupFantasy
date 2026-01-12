// ============================================
// FANTASY LA LIGA - GAME CONSTANTS
// All rules from the rulebook encoded here
// ============================================

// Budget & Prices
export const INITIAL_BUDGET = 100.0;
export const MIN_PLAYER_PRICE = 4.0;
export const MAX_PLAYER_PRICE = 14.5;
export const PRICE_STEP = 0.1;
export const MAX_PRICE_CHANGE_PER_DAY = 0.1;
export const MAX_PRICE_CHANGE_PER_GW = 0.3;
export const PROFIT_SHARE_PERCENTAGE = 0.5; // 50% profit rule

// Squad Constraints
export const SQUAD_SIZE = 15;
export const STARTING_XI_SIZE = 11;
export const BENCH_SIZE = 4;
export const MAX_PLAYERS_PER_CLUB = 3;

export const POSITION_LIMITS = {
  GK: { total: 2, min: 1, max: 1 },  // 1 starting GK always
  DEF: { total: 5, min: 3, max: 5 },
  MID: { total: 5, min: 2, max: 5 },
  FWD: { total: 3, min: 1, max: 3 },
} as const;

// Valid Formations (outfield only, GK always 1)
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

// Transfers
export const FREE_TRANSFERS_PER_GW = 1;
export const MAX_FREE_TRANSFERS = 2;
export const TRANSFER_HIT_COST = 4;

// Gameweek
export const DEADLINE_MINUTES_BEFORE_KICKOFF = 90;

// ============================================
// SCORING SYSTEM
// ============================================

// Appearance Points
export const APPEARANCE_POINTS = {
  ZERO_MINUTES: 0,
  UNDER_60_MINUTES: 1,
  SIXTY_PLUS_MINUTES: 2,
} as const;

// Goals Scored
export const GOAL_POINTS = {
  GK: 10,
  DEF: 6,
  MID: 5,
  FWD: 4,
} as const;

// Assists
export const ASSIST_POINTS = 3;

// Clean Sheets
export const CLEAN_SHEET_POINTS = {
  GK: 4,
  DEF: 4,
  MID: 1,
  FWD: 0,
} as const;

// Defensive Contributions (base scoring)
export const DEFENSIVE_CONTRIBUTION_THRESHOLD = {
  DEF: 10, // +2 per 10
  MID: 12, // +2 per 12
  FWD: 12, // +2 per 12
} as const;
export const DEFENSIVE_CONTRIBUTION_POINTS = 2;

// Goalkeeper
export const SAVES_FOR_POINT = 3; // +1 per 3 saves
export const PENALTY_SAVE_POINTS = 5;

// Negative Points
export const PENALTY_MISS_POINTS = -2;
export const GOALS_CONCEDED_THRESHOLD = 2; // -1 per 2
export const GOALS_CONCEDED_POINTS = -1;
export const YELLOW_CARD_POINTS = -1;
export const RED_CARD_POINTS = -3;
export const OWN_GOAL_POINTS = -2;

// Custom Rules
export const LONG_SHOT_BONUS = 2; // +2 for goals outside box

// Bonus Points (from BPS)
export const BONUS_POINTS = {
  FIRST: 3,
  SECOND: 2,
  THIRD: 1,
} as const;

// Captain Multipliers
export const CAPTAIN_MULTIPLIER = 2;
export const TRIPLE_CAPTAIN_MULTIPLIER = 3;

// ============================================
// CHIPS
// ============================================

export const CHIPS = {
  WILDCARD: {
    name: 'Wildcard',
    description: 'Unlimited free transfers for one gameweek',
    usesPerSeason: 2, // One per half
  },
  TRIPLE_CAPTAIN: {
    name: 'Triple Captain',
    description: 'Captain scores 3x points instead of 2x',
    usesPerSeason: 1,
  },
  BENCH_BOOST: {
    name: 'Bench Boost',
    description: 'All 15 players score points',
    usesPerSeason: 1,
  },
  FREE_HIT: {
    name: 'Free Hit',
    description: 'Unlimited transfers for one GW, squad reverts after',
    usesPerSeason: 1,
  },
} as const;

// ============================================
// TIMEZONE
// ============================================

export const BACKEND_TIMEZONE = 'UTC';
export const DISPLAY_TIMEZONE = 'America/New_York'; // EST/EDT

// ============================================
// VALIDATION PATTERNS
// ============================================

export const VALIDATION = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 20,
  USERNAME_PATTERN: /^[a-zA-Z0-9_]+$/,
  PASSWORD_MIN_LENGTH: 8,
  TEAM_NAME_MIN_LENGTH: 3,
  TEAM_NAME_MAX_LENGTH: 30,
  LEAGUE_NAME_MIN_LENGTH: 3,
  LEAGUE_NAME_MAX_LENGTH: 40,
  LEAGUE_CODE_LENGTH: 8,
} as const;

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


