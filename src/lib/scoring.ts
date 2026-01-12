// ============================================
// FANTASY LA LIGA - SCORING ENGINE
// Complete implementation of all scoring rules
// ============================================

import {
  APPEARANCE_POINTS,
  GOAL_POINTS,
  ASSIST_POINTS,
  CLEAN_SHEET_POINTS,
  DEFENSIVE_CONTRIBUTION_THRESHOLD,
  DEFENSIVE_CONTRIBUTION_POINTS,
  SAVES_FOR_POINT,
  PENALTY_SAVE_POINTS,
  PENALTY_MISS_POINTS,
  GOALS_CONCEDED_THRESHOLD,
  GOALS_CONCEDED_POINTS,
  YELLOW_CARD_POINTS,
  RED_CARD_POINTS,
  OWN_GOAL_POINTS,
  LONG_SHOT_BONUS,
  BONUS_POINTS,
  CAPTAIN_MULTIPLIER,
  TRIPLE_CAPTAIN_MULTIPLIER,
} from './constants';

type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface PerformanceStats {
  position: Position;
  minutesPlayed: number;
  goals: number;
  assists: number;
  longShotGoals: number; // Goals from outside the box
  cleanSheet: boolean;
  goalsConceeded: number; // Goals while on pitch
  saves: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  defensiveContributions: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  bpsScore: number; // Raw BPS score
  bonusPoints: number; // 0, 1, 2, or 3 based on BPS ranking
}

export interface PointsBreakdown {
  appearance: number;
  goals: number;
  longShotBonus: number;
  assists: number;
  cleanSheet: number;
  defensiveContributions: number;
  saves: number;
  penaltySaves: number;
  penaltyMisses: number;
  goalsConceded: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  bonus: number;
  total: number;
}

/**
 * Calculate points for a single player performance in a single match
 */
export function calculatePerformancePoints(stats: PerformanceStats): PointsBreakdown {
  const breakdown: PointsBreakdown = {
    appearance: 0,
    goals: 0,
    longShotBonus: 0,
    assists: 0,
    cleanSheet: 0,
    defensiveContributions: 0,
    saves: 0,
    penaltySaves: 0,
    penaltyMisses: 0,
    goalsConceded: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    bonus: 0,
    total: 0,
  };

  // 1. Appearance Points
  if (stats.minutesPlayed === 0) {
    breakdown.appearance = APPEARANCE_POINTS.ZERO_MINUTES;
  } else if (stats.minutesPlayed < 60) {
    breakdown.appearance = APPEARANCE_POINTS.UNDER_60_MINUTES;
  } else {
    breakdown.appearance = APPEARANCE_POINTS.SIXTY_PLUS_MINUTES;
  }

  // Only score other categories if player actually played
  if (stats.minutesPlayed > 0) {
    // 2. Goals
    breakdown.goals = stats.goals * GOAL_POINTS[stats.position];
    
    // 3. Long Shot Bonus (custom rule)
    breakdown.longShotBonus = stats.longShotGoals * LONG_SHOT_BONUS;

    // 4. Assists
    breakdown.assists = stats.assists * ASSIST_POINTS;

    // 5. Clean Sheet (only if 60+ minutes played)
    if (stats.cleanSheet && stats.minutesPlayed >= 60) {
      breakdown.cleanSheet = CLEAN_SHEET_POINTS[stats.position];
    }

    // 6. Defensive Contributions
    if (stats.position !== 'GK') {
      const threshold = DEFENSIVE_CONTRIBUTION_THRESHOLD[stats.position as 'DEF' | 'MID' | 'FWD'];
      const bonusCount = Math.floor(stats.defensiveContributions / threshold);
      breakdown.defensiveContributions = bonusCount * DEFENSIVE_CONTRIBUTION_POINTS;
    }

    // 7. Goalkeeper Saves
    if (stats.position === 'GK') {
      breakdown.saves = Math.floor(stats.saves / SAVES_FOR_POINT);
    }

    // 8. Penalty Saves
    if (stats.position === 'GK') {
      breakdown.penaltySaves = stats.penaltiesSaved * PENALTY_SAVE_POINTS;
    }

    // 9. Penalty Misses (outfield only)
    if (stats.position !== 'GK') {
      breakdown.penaltyMisses = stats.penaltiesMissed * PENALTY_MISS_POINTS;
    }

    // 10. Goals Conceded (GK and DEF only)
    if (stats.position === 'GK' || stats.position === 'DEF') {
      const penaltyCount = Math.floor(stats.goalsConceeded / GOALS_CONCEDED_THRESHOLD);
      breakdown.goalsConceded = penaltyCount * GOALS_CONCEDED_POINTS;
    }

    // 11. Yellow Cards
    breakdown.yellowCards = stats.yellowCards * YELLOW_CARD_POINTS;

    // 12. Red Cards
    breakdown.redCards = stats.redCards * RED_CARD_POINTS;

    // 13. Own Goals
    breakdown.ownGoals = stats.ownGoals * OWN_GOAL_POINTS;

    // 14. Bonus Points
    breakdown.bonus = stats.bonusPoints;
  }

  // Calculate total
  breakdown.total = 
    breakdown.appearance +
    breakdown.goals +
    breakdown.longShotBonus +
    breakdown.assists +
    breakdown.cleanSheet +
    breakdown.defensiveContributions +
    breakdown.saves +
    breakdown.penaltySaves +
    breakdown.penaltyMisses +
    breakdown.goalsConceded +
    breakdown.yellowCards +
    breakdown.redCards +
    breakdown.ownGoals +
    breakdown.bonus;

  return breakdown;
}

/**
 * Calculate bonus points distribution for a match based on BPS scores
 */
export function calculateBonusPointsForMatch(
  playerScores: { playerId: string; bpsScore: number }[]
): Map<string, number> {
  const bonusMap = new Map<string, number>();
  
  if (playerScores.length === 0) return bonusMap;

  // Sort by BPS score descending
  const sorted = [...playerScores].sort((a, b) => b.bpsScore - a.bpsScore);

  // Get unique scores in order
  const uniqueScores = Array.from(new Set(sorted.map(p => p.bpsScore)));
  
  if (uniqueScores.length === 0) return bonusMap;

  // First place
  const firstScore = uniqueScores[0];
  const firstPlace = sorted.filter(p => p.bpsScore === firstScore);
  
  for (const player of firstPlace) {
    bonusMap.set(player.playerId, BONUS_POINTS.FIRST);
  }

  // If tie for first, next eligible gets 1 point (not 2)
  if (firstPlace.length > 1) {
    // Tied for first all get 3, next (if any) gets 1
    if (uniqueScores.length > 1) {
      const thirdScore = uniqueScores[1];
      const thirdPlace = sorted.filter(p => p.bpsScore === thirdScore);
      for (const player of thirdPlace) {
        bonusMap.set(player.playerId, BONUS_POINTS.THIRD);
      }
    }
    return bonusMap;
  }

  // Second place (no tie for first)
  if (uniqueScores.length > 1) {
    const secondScore = uniqueScores[1];
    const secondPlace = sorted.filter(p => p.bpsScore === secondScore);
    
    for (const player of secondPlace) {
      bonusMap.set(player.playerId, BONUS_POINTS.SECOND);
    }

    // If tie for second, they all get 2, and that's it (no third place)
    if (secondPlace.length > 1) {
      return bonusMap;
    }

    // Third place (no tie for first or second)
    if (uniqueScores.length > 2) {
      const thirdScore = uniqueScores[2];
      const thirdPlace = sorted.filter(p => p.bpsScore === thirdScore);
      
      for (const player of thirdPlace) {
        bonusMap.set(player.playerId, BONUS_POINTS.THIRD);
      }
    }
  }

  return bonusMap;
}

/**
 * Calculate total gameweek points for a player across all fixtures
 */
export function calculateGameweekPlayerPoints(
  performances: PerformanceStats[]
): number {
  return performances.reduce((total, perf) => {
    const breakdown = calculatePerformancePoints(perf);
    return total + breakdown.total;
  }, 0);
}

/**
 * Apply captain multiplier to a player's points
 */
export function applyCaptainMultiplier(
  points: number,
  isTripleCaptain: boolean
): number {
  const multiplier = isTripleCaptain 
    ? TRIPLE_CAPTAIN_MULTIPLIER 
    : CAPTAIN_MULTIPLIER;
  return points * multiplier;
}

/**
 * Calculate total team points for a gameweek
 */
export interface TeamGameweekResult {
  rawPoints: number;      // Sum of all starting players
  captainBonus: number;   // Extra points from captain (not the full amount)
  benchPoints: number;    // For bench boost
  transferHits: number;   // Negative points from hits
  totalPoints: number;    // Final score
}

export function calculateTeamGameweekPoints(
  startingXIPoints: number[],
  benchPoints: number[],
  captainPoints: number,
  isTripleCaptain: boolean,
  isBenchBoost: boolean,
  transferHits: number
): TeamGameweekResult {
  // Raw points from starting XI (including captain once)
  const rawPoints = startingXIPoints.reduce((sum, pts) => sum + pts, 0);

  // Captain bonus (extra points from doubling/tripling)
  const multiplier = isTripleCaptain 
    ? TRIPLE_CAPTAIN_MULTIPLIER - 1 // 2 extra (3x - 1x)
    : CAPTAIN_MULTIPLIER - 1;       // 1 extra (2x - 1x)
  const captainBonus = captainPoints * multiplier;

  // Bench boost adds bench players' points
  const benchTotal = isBenchBoost 
    ? benchPoints.reduce((sum, pts) => sum + pts, 0)
    : 0;

  // Total
  const totalPoints = rawPoints + captainBonus + benchTotal - transferHits;

  return {
    rawPoints,
    captainBonus,
    benchPoints: benchTotal,
    transferHits,
    totalPoints,
  };
}


