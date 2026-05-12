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
  // Sum of tackles.total + tackles.interceptions + tackles.blocks + duels.won.
  // Surfaced so the admin UI can show "Player got +2 because he had 11 DCs"
  // and so users understand why a defender suddenly jumped 2 points.
  defensiveActions: number;

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
  defensiveContributions: number;
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
// ON-PITCH WINDOW HELPERS
// ============================================
//
// "On-pitch model" — only opponent goals scored during a player's
// on-pitch window count toward his clean-sheet bonus and his conceded
// penalty. This avoids two unfair outcomes that the older per-player
// stats.goals.conceded path produced:
//   1. Defenders never lost points for goals against (API only sets
//      stats.goals.conceded on goalkeepers — every other position
//      reads 0 in real data).
//   2. Defenders subbed off well before a late conceded goal still
//      ate the conceded penalty, even though they weren't on the
//      pitch when it happened.
//
// CONVENTION (verified empirically against API-Football v3 fixture
// 1519357, Mushuc Runa vs LDU de Quito, 2026-05-12):
//   In a `subst` event:
//     - `player`  is the player going OFF
//     - `assist`  is the player coming ON
//   Goal events follow the obvious convention (player = scorer,
//   assist = assister or null). For an own goal, `team` is the team
//   that scored on themselves (i.e. the LOSING team for that goal),
//   so the goal credit goes to their opponent.

export interface OnPitchWindow {
  /** Inclusive: minute the player came onto the pitch. 0 for starters. */
  start: number;
  /** Inclusive: minute the player left, or Number.POSITIVE_INFINITY if played to the whistle. */
  end: number;
}

/**
 * Resolve when a single player was on the pitch.
 *
 * `isStartingXI` is the inverted `games.substitute` flag from
 * `/fixtures/players`. We look at the event timeline for:
 *   - the substitution that took this player off (player.id matches)
 *   - the substitution that brought this player on (assist.id matches)
 *   - a red card or second yellow that ended his match early
 *
 * If both a sub-off and a red card exist for the same player, the
 * earliest minute wins (you can't sub off a player who's already
 * been sent off, so in practice only one will exist — but min() is
 * the safe choice).
 */
export function getOnPitchWindow(
  playerId: number,
  isStartingXI: boolean,
  events: APIEvent[],
): OnPitchWindow {
  const minuteOf = (event: APIEvent): number =>
    event.time.elapsed + (event.time.extra ?? 0);

  const subOff = events.find(
    (e) => e.type === 'subst' && e.player.id === playerId,
  );
  const subOn = events.find(
    (e) => e.type === 'subst' && e.assist?.id === playerId,
  );
  const sendingOff = events.find(
    (e) =>
      e.type === 'Card' &&
      e.player.id === playerId &&
      (e.detail === 'Red Card' || e.detail === 'Second Yellow card'),
  );

  const offCandidates: number[] = [];
  if (subOff) offCandidates.push(minuteOf(subOff));
  if (sendingOff) offCandidates.push(minuteOf(sendingOff));

  const end =
    offCandidates.length > 0
      ? Math.min(...offCandidates)
      : Number.POSITIVE_INFINITY;

  if (isStartingXI) {
    return { start: 0, end };
  }

  return {
    start: subOn ? minuteOf(subOn) : 0,
    end,
  };
}

/**
 * Count goals that were scored *against* `playerTeamId` and fell within
 * `window`. Used for both clean-sheet determination and the conceded
 * penalty. Excludes:
 *   - Penalty shootout goals (`comments === 'Penalty Shootout'`)
 *   - Missed penalties (these are encoded as Goal/Missed Penalty in
 *     events but obviously aren't actual conceded goals)
 *
 * Own goals are tricky: the API records the scorer's TEAM, which is
 * the team scoring on themselves. The goal counts toward the
 * opponent's scoreboard, so we flip the credit here.
 */
export function countOpponentGoalsInWindow(
  events: APIEvent[],
  window: OnPitchWindow,
  playerTeamId: number,
  opponentTeamId: number,
): number {
  let count = 0;
  for (const event of events) {
    if (event.type !== 'Goal') continue;
    if (isPenaltyShootout(event)) continue;
    if (event.detail === 'Missed Penalty') continue;

    const isOwnGoal = event.detail === 'Own Goal';
    const goalCreditedTo = isOwnGoal
      ? event.team.id === playerTeamId
        ? opponentTeamId
        : playerTeamId
      : event.team.id;

    if (goalCreditedTo !== opponentTeamId) continue;

    const minute = event.time.elapsed + (event.time.extra ?? 0);
    if (minute >= window.start && minute <= window.end) {
      count++;
    }
  }
  return count;
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
   * Sum the four API-Football defensive-stat counters into one "defensive
   * actions" total. Null fields (some leagues just don't return them) are
   * treated as zero.
   */
  countDefensiveActions(stats: APIPlayerStats['statistics'][0]): number {
    const tackles = stats.tackles?.total ?? 0;
    const interceptions = stats.tackles?.interceptions ?? 0;
    const blocks = stats.tackles?.blocks ?? 0;
    const duelsWon = stats.duels?.won ?? 0;
    return tackles + interceptions + blocks + duelsWon;
  }

  /**
   * Award +2 if a player crosses the defensive-action threshold for his
   * position. Same intent as FPL 2024-25 — keeps defenders meaningfully
   * scorable in games where they don't clean-sheet or score.
   *
   * Intentionally NOT gated on the 60-minute appearance rule — a sub CB
   * who comes on at 70' and racks up 10 tackles deserves the bonus.
   */
  private calculateDefensiveContributionPoints(position: string, actions: number): number {
    const threshold =
      position === 'GK' || position === 'DEF'
        ? SCORING.DC_THRESHOLD_DEF
        : SCORING.DC_THRESHOLD_MID_FWD;
    return actions >= threshold ? SCORING.DC_BONUS : 0;
  }

  /**
   * Calculate all points for a single player from API stats.
   *
   * The two on-pitch fields come from event-timeline analysis done by
   * the caller (see `getOnPitchWindow` + `countOpponentGoalsInWindow`).
   * Tests can pass these directly to verify scoring math without
   * standing up a full fixture.
   */
  calculatePlayerPoints(
    stats: APIPlayerStats['statistics'][0],
    position: string,
    context: {
      /** Opponent goals scored during this player's on-pitch window. */
      inWindowConceded: number;
      /** True if the on-pitch window had zero opponent goals AND the player played 60+ minutes. */
      isCleanSheet: boolean;
    },
  ): PointsBreakdown {
    const minutes = stats.games.minutes || 0;
    const goals = stats.goals.total || 0;
    const assists = stats.goals.assists || 0;
    const saves = stats.goals.saves || 0;
    const yellowCards = stats.cards.yellow || 0;
    const redCards = stats.cards.red || 0;
    const penaltiesSaved = stats.penalty.saved || 0;
    const penaltiesMissed = stats.penalty.missed || 0;

    const defensiveActions = this.countDefensiveActions(stats);

    return {
      appearance: this.calculateAppearancePoints(minutes),
      goals: this.calculateGoalPoints(position, goals),
      assists: assists * SCORING.ASSIST,
      cleanSheet: this.calculateCleanSheetPoints(position, context.isCleanSheet, minutes),
      saves: this.calculateSavesPoints(saves),
      penaltySaves: penaltiesSaved * SCORING.PENALTY_SAVE,
      penaltyMisses: penaltiesMissed * SCORING.PENALTY_MISS,
      yellowCards: yellowCards * SCORING.YELLOW_CARD,
      redCards: redCards * SCORING.RED_CARD,
      ownGoals: 0, // Own goals come from events, not stats
      goalsConceeded: this.calculateGoalsConceivedPenalty(position, context.inWindowConceded, minutes),
      defensiveContributions: this.calculateDefensiveContributionPoints(position, defensiveActions),
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
      const playerTeamId = teamData.team.id;
      const opponentTeamId = isHomeTeam ? awayTeamId : homeTeamId;

      for (const playerData of teamData.players) {
        if (!playerData.statistics[0]) continue;

        const stats = playerData.statistics[0];
        const position = convertPosition(stats.games.position);
        const minutes = stats.games.minutes || 0;

        // Skip players who didn't play
        if (minutes === 0) continue;

        // Build this player's on-pitch window from the events timeline.
        // Used for both clean-sheet eligibility and the conceded penalty —
        // a defender subbed off before a late goal shouldn't be punished
        // for goals he wasn't on the pitch to defend.
        const isStartingXI = !stats.games.substitute;
        const window = getOnPitchWindow(playerData.player.id, isStartingXI, events);
        const inWindowConceded = countOpponentGoalsInWindow(
          events,
          window,
          playerTeamId,
          opponentTeamId,
        );
        // Red-card voids CS bonus even if the on-pitch window was clean
        // (the player was sent off for misconduct — no reward). Matches
        // standard FPL behaviour. `cards.red` is set for both straight
        // reds and second-yellow reds.
        const wasSentOff = (stats.cards.red ?? 0) > 0;
        const isCleanSheet = inWindowConceded === 0 && minutes >= 60 && !wasSentOff;

        // Base scoring with on-pitch context
        const points = this.calculatePlayerPoints(stats, position, {
          inWindowConceded,
          isCleanSheet,
        });

        // Add own goals from events
        const ownGoals = this.countOwnGoalsFromEvents(events, playerData.player.id);
        points.ownGoals = ownGoals * SCORING.OWN_GOAL;

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
          points.defensiveContributions +
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
          // We report the in-window count rather than the team total so
          // the field matches the value that drove the penalty math.
          goalsConceeded: inWindowConceded,
          cleanSheet: isCleanSheet,
          defensiveActions: this.countDefensiveActions(stats),
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
