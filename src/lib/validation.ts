import { z } from 'zod';
import {
  VALIDATION,
  SQUAD_SIZE,
  POSITION_LIMITS,
  MAX_PLAYERS_PER_CLUB,
  INITIAL_BUDGET,
  VALID_FORMATIONS,
  MIN_PLAYER_PRICE,
  MAX_PLAYER_PRICE,
} from './constants';

// ============================================
// AUTH VALIDATION SCHEMAS
// ============================================

export const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .max(255, 'Email too long')
    .transform(v => v.toLowerCase().trim()),
  username: z
    .string()
    .min(VALIDATION.USERNAME_MIN_LENGTH, `Username must be at least ${VALIDATION.USERNAME_MIN_LENGTH} characters`)
    .max(VALIDATION.USERNAME_MAX_LENGTH, `Username cannot exceed ${VALIDATION.USERNAME_MAX_LENGTH} characters`)
    .regex(VALIDATION.USERNAME_PATTERN, 'Username can only contain letters, numbers, and underscores')
    .transform(v => v.trim()),
  password: z
    .string()
    .min(VALIDATION.PASSWORD_MIN_LENGTH, `Password must be at least ${VALIDATION.PASSWORD_MIN_LENGTH} characters`)
    .max(128, 'Password too long'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .transform(v => v.toLowerCase().trim()),
  password: z
    .string()
    .min(1, 'Password is required'),
});

// ============================================
// TEAM VALIDATION SCHEMAS
// ============================================

export const createTeamSchema = z.object({
  name: z
    .string()
    .min(VALIDATION.TEAM_NAME_MIN_LENGTH, `Team name must be at least ${VALIDATION.TEAM_NAME_MIN_LENGTH} characters`)
    .max(VALIDATION.TEAM_NAME_MAX_LENGTH, `Team name cannot exceed ${VALIDATION.TEAM_NAME_MAX_LENGTH} characters`)
    .transform(v => v.trim()),
});

// ============================================
// LEAGUE VALIDATION SCHEMAS
// ============================================

export const createLeagueSchema = z.object({
  name: z
    .string()
    .min(VALIDATION.LEAGUE_NAME_MIN_LENGTH, `League name must be at least ${VALIDATION.LEAGUE_NAME_MIN_LENGTH} characters`)
    .max(VALIDATION.LEAGUE_NAME_MAX_LENGTH, `League name cannot exceed ${VALIDATION.LEAGUE_NAME_MAX_LENGTH} characters`)
    .transform(v => v.trim()),
});

export const joinLeagueSchema = z.object({
  code: z
    .string()
    .length(VALIDATION.LEAGUE_CODE_LENGTH, `League code must be ${VALIDATION.LEAGUE_CODE_LENGTH} characters`)
    .toUpperCase()
    .transform(v => v.trim()),
});

// ============================================
// SQUAD VALIDATION
// ============================================

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface PlayerForValidation {
  id: string;
  position: Position;
  clubId: string;
  currentPrice: number;
}

export interface SquadValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateSquad(
  players: PlayerForValidation[],
  budget: number = INITIAL_BUDGET
): SquadValidationResult {
  const errors: string[] = [];

  // Check squad size
  if (players.length !== SQUAD_SIZE) {
    errors.push(`Squad must have exactly ${SQUAD_SIZE} players (currently ${players.length})`);
  }

  // Check position counts
  const positionCounts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const player of players) {
    positionCounts[player.position]++;
  }

  for (const [pos, limits] of Object.entries(POSITION_LIMITS)) {
    const count = positionCounts[pos as Position];
    if (count !== limits.total) {
      errors.push(`Must have exactly ${limits.total} ${pos} players (currently ${count})`);
    }
  }

  // Check club limits
  const clubCounts: Record<string, number> = {};
  for (const player of players) {
    clubCounts[player.clubId] = (clubCounts[player.clubId] || 0) + 1;
    if (clubCounts[player.clubId] > MAX_PLAYERS_PER_CLUB) {
      errors.push(`Cannot have more than ${MAX_PLAYERS_PER_CLUB} players from the same club`);
      break;
    }
  }

  // Check budget
  const totalCost = players.reduce((sum, p) => sum + p.currentPrice, 0);
  if (totalCost > budget) {
    errors.push(`Squad exceeds budget by £${(totalCost - budget).toFixed(1)}m`);
  }

  // Check for duplicate players
  const playerIds = new Set<string>();
  for (const player of players) {
    if (playerIds.has(player.id)) {
      errors.push('Cannot have duplicate players in squad');
      break;
    }
    playerIds.add(player.id);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================
// FORMATION VALIDATION
// ============================================

export interface StartingXIValidationResult {
  isValid: boolean;
  errors: string[];
  formation?: { DEF: number; MID: number; FWD: number };
}

export function validateStartingXI(
  startingPlayers: PlayerForValidation[],
  captainId: string,
  viceCaptainId: string
): StartingXIValidationResult {
  const errors: string[] = [];

  // Must have exactly 11 starters
  if (startingPlayers.length !== 11) {
    errors.push(`Starting XI must have exactly 11 players (currently ${startingPlayers.length})`);
  }

  // Must have exactly 1 GK
  const gkCount = startingPlayers.filter(p => p.position === 'GK').length;
  if (gkCount !== 1) {
    errors.push('Starting XI must have exactly 1 goalkeeper');
  }

  // Check formation is valid
  const defCount = startingPlayers.filter(p => p.position === 'DEF').length;
  const midCount = startingPlayers.filter(p => p.position === 'MID').length;
  const fwdCount = startingPlayers.filter(p => p.position === 'FWD').length;

  const formation = { DEF: defCount, MID: midCount, FWD: fwdCount };
  const isValidFormation = VALID_FORMATIONS.some(
    f => f.DEF === defCount && f.MID === midCount && f.FWD === fwdCount
  );

  if (!isValidFormation) {
    errors.push(`Invalid formation (${defCount}-${midCount}-${fwdCount}). Must use a valid formation.`);
  }

  // Captain and vice-captain must be in starting XI
  const startingIds = new Set(startingPlayers.map(p => p.id));
  if (!startingIds.has(captainId)) {
    errors.push('Captain must be in the starting XI');
  }
  if (!startingIds.has(viceCaptainId)) {
    errors.push('Vice-captain must be in the starting XI');
  }

  // Captain and vice-captain must be different
  if (captainId === viceCaptainId) {
    errors.push('Captain and vice-captain must be different players');
  }

  return {
    isValid: errors.length === 0,
    errors,
    formation: isValidFormation ? formation : undefined,
  };
}

// ============================================
// TRANSFER VALIDATION
// ============================================

export interface TransferValidationResult {
  isValid: boolean;
  errors: string[];
  cost: number; // Hit cost (0 if free)
  remainingFreeTransfers: number;
}

export function validateTransfers(
  currentSquad: PlayerForValidation[],
  playersOut: string[],
  playersIn: PlayerForValidation[],
  freeTransfers: number,
  currentBudget: number,
  purchasePrices: Map<string, number> // Map of playerId -> purchasePrice
): TransferValidationResult {
  const errors: string[] = [];

  // Must have same number in and out
  if (playersOut.length !== playersIn.length) {
    errors.push('Must transfer in the same number of players as transferred out');
  }

  // Calculate money from selling
  let saleValue = 0;
  for (const playerId of playersOut) {
    const player = currentSquad.find(p => p.id === playerId);
    if (!player) {
      errors.push('Cannot sell player not in squad');
      continue;
    }
    const purchasePrice = purchasePrices.get(playerId) || player.currentPrice;
    // 50% profit rule
    const profit = player.currentPrice - purchasePrice;
    const sellPrice = profit > 0 
      ? purchasePrice + Math.floor(profit * 5) / 10 
      : player.currentPrice;
    saleValue += sellPrice;
  }

  // Calculate cost of buying
  const buyCost = playersIn.reduce((sum, p) => sum + p.currentPrice, 0);

  // Check budget
  const newBudget = currentBudget + saleValue - buyCost;
  if (newBudget < 0) {
    errors.push(`Insufficient funds. Need £${Math.abs(newBudget).toFixed(1)}m more`);
  }

  // Calculate hit cost
  const transferCount = playersOut.length;
  const freeUsed = Math.min(transferCount, freeTransfers);
  const paidTransfers = transferCount - freeUsed;
  const hitCost = paidTransfers * 4;

  // Build new squad and validate
  const newSquad = currentSquad
    .filter(p => !playersOut.includes(p.id))
    .concat(playersIn);

  const squadValidation = validateSquad(newSquad, currentBudget + saleValue);
  errors.push(...squadValidation.errors);

  return {
    isValid: errors.length === 0,
    errors,
    cost: hitCost,
    remainingFreeTransfers: Math.max(0, freeTransfers - transferCount),
  };
}

// ============================================
// AUTO-SUB VALIDATION
// ============================================

export function canSubstitutePlayer(
  currentFormation: { DEF: number; MID: number; FWD: number },
  outPlayer: PlayerForValidation,
  inPlayer: PlayerForValidation
): boolean {
  // GK can only sub for GK
  if (outPlayer.position === 'GK' || inPlayer.position === 'GK') {
    return outPlayer.position === 'GK' && inPlayer.position === 'GK';
  }

  // Simulate the substitution
  const newFormation = { ...currentFormation };
  
  // Remove out player (we know it's not GK from the check above)
  const outPos = outPlayer.position as 'DEF' | 'MID' | 'FWD';
  newFormation[outPos]--;
  
  // Add in player (we know it's not GK from the check above)
  const inPos = inPlayer.position as 'DEF' | 'MID' | 'FWD';
  newFormation[inPos]++;

  // Check if still valid
  return VALID_FORMATIONS.some(
    f => f.DEF === newFormation.DEF && f.MID === newFormation.MID && f.FWD === newFormation.FWD
  );
}


