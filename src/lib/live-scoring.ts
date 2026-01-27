// ============================================
// LIVE SCORING CALCULATOR
// Converts API-Football data to fantasy points
// ============================================

import { SCORING, STAGES } from './wc-constants';
import {
  APIEvent,
  APIPlayerStats,
  APITeamPlayersResponse,
  convertPosition,
  isMatchGoal,
  isPenaltyMiss,
  isPenaltyShootout,
  getGoalType,
  getCardType,
} from './api-football';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface PlayerPerformanceData {
  apiPlayerId: number;
  playerName: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  
  // Raw stats
  minutesPlayed: number;
  goals: number;
  assists: number;
  ownGoals: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  goalsConceeded: number;
  cleanSheet: boolean;
  
  // Calculated points
  points: PointsBreakdown;
  totalPoints: number;
}

export interface PointsBreakdown {
  appearance: number;
  goals: number;
  assists: number;
  cleanSheet: number;
  saves: number;
  penaltySaves: number;
  penaltyMisses: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  goalsConceeded: number;
  bonus: number;
}

export interface MatchPerformanceResult {
  fixtureId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  isKnockout: boolean;
  players: PlayerPerformanceData[];
}

// ============================================
// SCORING CALCULATOR
// ============================================

export class LiveScoringCalculator {
  private isKnockoutStage: boolean = false;
  
  constructor(stageId?: string) {
    // Knockout stages get bonus points for goals
    if (stageId) {
      const knockoutStages = ['R32', 'R16', 'QF', 'SF', '3RD', 'F'];
      this.isKnockoutStage = knockoutStages.includes(stageId);
    }
  }

  /**
   * Calculate appearance points based on minutes played
   */
  private calculateAppearancePoints(minutes: number): number {
    if (minutes === 0) return SCORING.MINUTES_0;
    if (minutes < 60) return SCORING.MINUTES_1_TO_59;
    return SCORING.MINUTES_60_PLUS;
  }

  /**
   * Calculate goal points based on position
   */
  private calculateGoalPoints(position: string, goals: number): number {
    if (goals === 0) return 0;
    
    let pointsPerGoal: number;
    switch (position) {
      case 'GK':
        pointsPerGoal = SCORING.GOAL_GK;
        break;
      case 'DEF':
        pointsPerGoal = SCORING.GOAL_DEF;
        break;
      case 'MID':
        pointsPerGoal = SCORING.GOAL_MID;
        break;
      case 'FWD':
      default:
        pointsPerGoal = SCORING.GOAL_FWD;
        break;
    }
    
    // Add knockout bonus if applicable
    if (this.isKnockoutStage) {
      pointsPerGoal += SCORING.KNOCKOUT_GOAL_BONUS;
    }
    
    return pointsPerGoal * goals;
  }

  /**
   * Calculate clean sheet points based on position
   */
  private calculateCleanSheetPoints(position: string, cleanSheet: boolean, minutes: number): number {
    // Must play 60+ minutes to get clean sheet points
    if (!cleanSheet || minutes < 60) return 0;
    
    switch (position) {
      case 'GK':
        return SCORING.CLEAN_SHEET_GK;
      case 'DEF':
        return SCORING.CLEAN_SHEET_DEF;
      case 'MID':
        return SCORING.CLEAN_SHEET_MID;
      case 'FWD':
        return SCORING.CLEAN_SHEET_FWD;
      default:
        return 0;
    }
  }

  /**
   * Calculate points for saves (GK only)
   */
  private calculateSavesPoints(saves: number): number {
    return Math.floor(saves / SCORING.SAVES_PER_POINT);
  }

  /**
   * Calculate goals conceeded penalty (GK/DEF only)
   */
  private calculateGoalsConceivedPenalty(position: string, goalsConceeded: number, minutes: number): number {
    // Only GK and DEF lose points, and only if they played 60+ minutes
    if (minutes < 60 || (position !== 'GK' && position !== 'DEF')) return 0;
    
    // -1 per 2 goals conceeded
    return Math.floor(goalsConceeded / 2) * SCORING.GOALS_CONCEDED_PER_2;
  }

  /**
   * Calculate all points for a single player from API stats
   */
  calculatePlayerPoints(stats: APIPlayerStats['statistics'][0], position: string): PointsBreakdown {
    const minutes = stats.games.minutes || 0;
    const goals = stats.goals.total || 0;
    const assists = stats.goals.assists || 0;
    const saves = stats.goals.saves || 0;
    const goalsConceeded = stats.goals.conceded || 0;
    const yellowCards = stats.cards.yellow || 0;
    const redCards = stats.cards.red || 0;
    const penaltiesSaved = stats.penalty.saved || 0;
    const penaltiesMissed = stats.penalty.missed || 0;
    
    // Determine clean sheet (no goals conceeded and played 60+ mins)
    const cleanSheet = goalsConceeded === 0 && minutes >= 60;
    
    return {
      appearance: this.calculateAppearancePoints(minutes),
      goals: this.calculateGoalPoints(position, goals),
      assists: assists * SCORING.ASSIST,
      cleanSheet: this.calculateCleanSheetPoints(position, cleanSheet, minutes),
      saves: this.calculateSavesPoints(saves),
      penaltySaves: penaltiesSaved * SCORING.PENALTY_SAVE,
      penaltyMisses: penaltiesMissed * SCORING.PENALTY_MISS,
      yellowCards: yellowCards * SCORING.YELLOW_CARD,
      redCards: redCards * SCORING.RED_CARD,
      ownGoals: 0, // Own goals come from events, not stats
      goalsConceeded: this.calculateGoalsConceivedPenalty(position, goalsConceeded, minutes),
      bonus: 0, // Bonus calculated separately
    };
  }

  /**
   * Count own goals for a player from events
   */
  countOwnGoalsFromEvents(events: APIEvent[], playerId: number): number {
    return events.filter(
      event => 
        event.player.id === playerId && 
        event.type === 'Goal' && 
        event.detail === 'Own Goal' &&
        !isPenaltyShootout(event)
    ).length;
  }

  /**
   * Process all players from a fixture
   */
  processFixtureData(
    teamsData: APITeamPlayersResponse[],
    events: APIEvent[],
    homeScore: number,
    awayScore: number,
    homeTeamId: number,
    awayTeamId: number
  ): PlayerPerformanceData[] {
    const results: PlayerPerformanceData[] = [];

    for (const teamData of teamsData) {
      const isHomeTeam = teamData.team.id === homeTeamId;
      const teamGoalsConceeded = isHomeTeam ? awayScore : homeScore;

      for (const playerData of teamData.players) {
        if (!playerData.statistics[0]) continue;
        
        const stats = playerData.statistics[0];
        const position = convertPosition(stats.games.position);
        const minutes = stats.games.minutes || 0;
        
        // Skip players who didn't play
        if (minutes === 0) continue;

        // Calculate base points
        const points = this.calculatePlayerPoints(stats, position);
        
        // Add own goals from events
        const ownGoals = this.countOwnGoalsFromEvents(events, playerData.player.id);
        points.ownGoals = ownGoals * SCORING.OWN_GOAL;

        // Determine clean sheet (team-level, not player stats)
        const cleanSheet = teamGoalsConceeded === 0 && minutes >= 60;
        points.cleanSheet = this.calculateCleanSheetPoints(position, cleanSheet, minutes);

        // Calculate total
        const totalPoints = 
          points.appearance +
          points.goals +
          points.assists +
          points.cleanSheet +
          points.saves +
          points.penaltySaves +
          points.penaltyMisses +
          points.yellowCards +
          points.redCards +
          points.ownGoals +
          points.goalsConceeded +
          points.bonus;

        results.push({
          apiPlayerId: playerData.player.id,
          playerName: playerData.player.name,
          position,
          minutesPlayed: minutes,
          goals: stats.goals.total || 0,
          assists: stats.goals.assists || 0,
          ownGoals,
          yellowCards: stats.cards.yellow || 0,
          redCards: stats.cards.red || 0,
          saves: stats.goals.saves || 0,
          penaltiesSaved: stats.penalty.saved || 0,
          penaltiesMissed: stats.penalty.missed || 0,
          goalsConceeded: teamGoalsConceeded,
          cleanSheet,
          points,
          totalPoints,
        });
      }
    }

    return results;
  }
}

// ============================================
// QUICK SCORING FROM EVENTS (for live updates)
// ============================================

/**
 * Calculate incremental points from a single event
 * Used for real-time updates without full stats refresh
 */
export function calculateEventPoints(
  event: APIEvent,
  playerPosition: string,
  isKnockout: boolean = false
): { playerId: number; points: number; type: string } | null {
  // Skip shootout events
  if (isPenaltyShootout(event)) return null;

  const playerId = event.player.id;
  let points = 0;
  let type = '';

  if (event.type === 'Goal') {
    if (event.detail === 'Own Goal') {
      points = SCORING.OWN_GOAL;
      type = 'own_goal';
    } else if (event.detail === 'Missed Penalty') {
      points = SCORING.PENALTY_MISS;
      type = 'penalty_miss';
    } else {
      // Regular goal or penalty goal
      switch (playerPosition) {
        case 'GK':
          points = SCORING.GOAL_GK;
          break;
        case 'DEF':
          points = SCORING.GOAL_DEF;
          break;
        case 'MID':
          points = SCORING.GOAL_MID;
          break;
        case 'FWD':
        default:
          points = SCORING.GOAL_FWD;
          break;
      }
      if (isKnockout) points += SCORING.KNOCKOUT_GOAL_BONUS;
      type = 'goal';
    }
  } else if (event.type === 'Card') {
    const cardType = getCardType(event.detail);
    if (cardType === 'yellow') {
      points = SCORING.YELLOW_CARD;
      type = 'yellow_card';
    } else if (cardType === 'red' || cardType === 'second_yellow') {
      points = SCORING.RED_CARD;
      type = 'red_card';
    }
  }

  // Handle assists
  if (event.assist?.id && event.type === 'Goal' && isMatchGoal(event)) {
    return {
      playerId: event.assist.id,
      points: SCORING.ASSIST,
      type: 'assist',
    };
  }

  if (points !== 0) {
    return { playerId, points, type };
  }

  return null;
}

// ============================================
// UTILITY EXPORTS
// ============================================

export const scoringCalculator = new LiveScoringCalculator();
