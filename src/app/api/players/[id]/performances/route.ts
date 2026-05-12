// ============================================
// GET /api/players/[id]/performances
// Returns a player's per-match performance history with a fully recomputed
// PointsBreakdown for each match. Used by the squad-page player modal so a
// user can click on a match row and see exactly where the points came
// from. Also returns recent admin override audit-log entries for that
// player so manual adjustments are visible.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { SCORING } from '@/lib/wc-constants';

export const dynamic = 'force-dynamic';

type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

interface BreakdownLine {
  label: string;
  points: number;
  detail?: string; // optional human description like "1 × 5pts" or "10 actions"
}

interface PointsBreakdown {
  lines: BreakdownLine[];
  total: number;
}

// Recompute the per-match breakdown from the stored PlayerPerformance row.
// This mirrors LiveScoringCalculator.calculatePlayerPoints exactly — the
// engine sums these same components when the live update writes the row,
// so this view is consistent with what was banked.
function computeBreakdown(
  perf: {
    minutesPlayed: number;
    goals: number;
    assists: number;
    cleanSheet: boolean;
    goalsConceeded: number;
    saves: number;
    penaltiesSaved: number;
    penaltiesMissed: number;
    yellowCards: number;
    redCards: number;
    ownGoals: number;
    defensiveActions: number;
    bonusPoints: number;
  },
  position: Position,
  stageId: string,
): PointsBreakdown {
  const lines: BreakdownLine[] = [];
  const isKnockout = !stageId.startsWith('GR');

  // Appearance
  if (perf.minutesPlayed >= 60) {
    lines.push({ label: 'Played 60+ min', points: SCORING.MINUTES_60_PLUS, detail: `${perf.minutesPlayed}'` });
  } else if (perf.minutesPlayed > 0) {
    lines.push({ label: 'Played 1-59 min', points: SCORING.MINUTES_1_TO_59, detail: `${perf.minutesPlayed}'` });
  }

  // Goals
  if (perf.goals > 0) {
    const perGoal =
      position === 'GK' ? SCORING.GOAL_GK :
      position === 'DEF' ? SCORING.GOAL_DEF :
      position === 'MID' ? SCORING.GOAL_MID : SCORING.GOAL_FWD;
    lines.push({
      label: 'Goals',
      points: perGoal * perf.goals,
      detail: `${perf.goals} × ${perGoal}`,
    });
    if (isKnockout) {
      lines.push({
        label: 'Knockout bonus',
        points: SCORING.KNOCKOUT_GOAL_BONUS * perf.goals,
        detail: `${perf.goals} × ${SCORING.KNOCKOUT_GOAL_BONUS}`,
      });
    }
  }

  // Assists
  if (perf.assists > 0) {
    lines.push({
      label: 'Assists',
      points: SCORING.ASSIST * perf.assists,
      detail: `${perf.assists} × ${SCORING.ASSIST}`,
    });
  }

  // Clean sheet — already conditioned in the engine (60+ mins, no red card,
  // in-window clean). We just display whatever was banked.
  if (perf.cleanSheet) {
    const csValue =
      position === 'GK' ? SCORING.CLEAN_SHEET_GK :
      position === 'DEF' ? SCORING.CLEAN_SHEET_DEF :
      position === 'MID' ? SCORING.CLEAN_SHEET_MID : SCORING.CLEAN_SHEET_FWD;
    if (csValue !== 0) {
      lines.push({ label: 'Clean sheet', points: csValue });
    }
  }

  // Goals conceded — GK/DEF only, -1 per 2 (in-window count under the
  // unified on-pitch model)
  if ((position === 'GK' || position === 'DEF') && perf.goalsConceeded >= 2) {
    const concededPoints = -Math.floor(perf.goalsConceeded / 2);
    lines.push({
      label: 'Goals conceded',
      points: concededPoints,
      detail: `${perf.goalsConceeded} conceded`,
    });
  }

  // Saves (GK)
  if (position === 'GK' && perf.saves >= SCORING.SAVES_PER_POINT) {
    const savesPoints = Math.floor(perf.saves / SCORING.SAVES_PER_POINT);
    lines.push({
      label: 'Saves',
      points: savesPoints,
      detail: `${perf.saves} saves`,
    });
  }

  // Penalty saves
  if (perf.penaltiesSaved > 0) {
    lines.push({
      label: 'Penalty saves',
      points: SCORING.PENALTY_SAVE * perf.penaltiesSaved,
      detail: `${perf.penaltiesSaved} × ${SCORING.PENALTY_SAVE}`,
    });
  }

  // Penalty misses
  if (perf.penaltiesMissed > 0) {
    lines.push({
      label: 'Penalty misses',
      points: SCORING.PENALTY_MISS * perf.penaltiesMissed,
      detail: `${perf.penaltiesMissed} × ${SCORING.PENALTY_MISS}`,
    });
  }

  // Yellow cards
  if (perf.yellowCards > 0) {
    lines.push({
      label: 'Yellow card',
      points: SCORING.YELLOW_CARD * perf.yellowCards,
      detail: perf.yellowCards > 1 ? `${perf.yellowCards} ×` : undefined,
    });
  }

  // Red cards
  if (perf.redCards > 0) {
    lines.push({
      label: 'Red card',
      points: SCORING.RED_CARD * perf.redCards,
    });
  }

  // Own goals
  if (perf.ownGoals > 0) {
    lines.push({
      label: 'Own goals',
      points: SCORING.OWN_GOAL * perf.ownGoals,
      detail: `${perf.ownGoals} ×`,
    });
  }

  // Defensive Contributions — threshold check, position-aware. Not gated
  // by minutes played.
  const dcThreshold = (position === 'GK' || position === 'DEF')
    ? SCORING.DC_THRESHOLD_DEF
    : SCORING.DC_THRESHOLD_MID_FWD;
  if (perf.defensiveActions >= dcThreshold) {
    lines.push({
      label: 'Defensive contribution',
      points: SCORING.DC_BONUS,
      detail: `${perf.defensiveActions} actions (≥${dcThreshold})`,
    });
  } else if (perf.defensiveActions > 0) {
    // Show informational row with 0 points so users see where they
    // stand vs the threshold.
    lines.push({
      label: 'Defensive actions',
      points: 0,
      detail: `${perf.defensiveActions} / ${dcThreshold}`,
    });
  }

  // Manual override bonus (separate from any of the above)
  if (perf.bonusPoints !== 0) {
    lines.push({
      label: 'Manual adjustment',
      points: perf.bonusPoints,
    });
  }

  const total = lines.reduce((sum, l) => sum + l.points, 0);
  return { lines, total };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // Require an authenticated user — any logged-in user can view any
    // player's per-match breakdown (same access level as the existing
    // /api/players list).
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const playerId = params.id;

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: { nation: true },
    });

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Squad-row points for THIS user's team only (so the modal can show
    // "your card on this player" vs lifetime stats).
    const squadRow = await prisma.squadPlayer.findFirst({
      where: { playerId, team: { userId: decoded.userId } },
      select: { points: true, isStarting: true, isCaptain: true, isViceCaptain: true },
    });

    // All performances for this player, newest first (matches sorted by
    // kickoffTime desc rather than by id, since matches can be created
    // out of chronological order).
    const performances = await prisma.playerPerformance.findMany({
      where: { playerId },
      include: {
        match: {
          include: {
            homeNation: { select: { code: true, name: true } },
            awayNation: { select: { code: true, name: true } },
            stage: { select: { stageId: true, name: true } },
          },
        },
      },
      orderBy: { match: { kickoffTime: 'desc' } },
    });

    const performancesPayload = performances.map((perf) => {
      const stats = {
        minutesPlayed: perf.minutesPlayed,
        goals: perf.goals,
        assists: perf.assists,
        cleanSheet: perf.cleanSheet,
        goalsConceeded: perf.goalsConceeded,
        saves: perf.saves,
        penaltiesSaved: perf.penaltiesSaved,
        penaltiesMissed: perf.penaltiesMissed,
        yellowCards: perf.yellowCards,
        redCards: perf.redCards,
        ownGoals: perf.ownGoals,
        defensiveActions: perf.defensiveActions,
        bonusPoints: perf.bonusPoints,
      };
      const breakdown = computeBreakdown(
        stats,
        player.position as Position,
        perf.match.stage.stageId,
      );
      return {
        id: perf.id,
        matchId: perf.matchId,
        isLive: perf.isLive,
        lastUpdated: perf.lastUpdated,
        match: {
          id: perf.match.id,
          stageId: perf.match.stage.stageId,
          stageName: perf.match.stage.name,
          kickoffTime: perf.match.kickoffTime,
          homeNation: perf.match.homeNation,
          awayNation: perf.match.awayNation,
          homeScore: perf.match.homeScore,
          awayScore: perf.match.awayScore,
          isFinished: perf.match.isFinished,
          isStarted: perf.match.isStarted,
          currentMinute: perf.match.currentMinute,
        },
        stats,
        breakdown,
        totalPoints: perf.totalPoints,
      };
    });

    // Recent manual-override audit entries that mention this player.
    // We can't index AuditLog by playerId (it's just a JSON blob), so we
    // do a coarse filter on action + LIKE on details. We exclude
    // reverted entries (revertedAt != null) AND we never return the
    // paired MANUAL_OVERRIDE_REVERTED bookkeeping rows. The result is
    // a clean "what's actually in effect on this player right now"
    // list — no +X/-X audit ladder.
    const rawAdjustments = await prisma.auditLog.findMany({
      where: {
        action: { in: ['MANUAL_OVERRIDE_MATCH', 'MANUAL_OVERRIDE_TOTAL'] },
        details: { contains: playerId },
        revertedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const adjustments = rawAdjustments.map((entry) => {
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(entry.details); } catch { /* ignore */ }
      return {
        id: entry.id,
        action: entry.action,
        createdAt: entry.createdAt,
        pointsAdded: parsed.pointsAdded as number | undefined,
        reason: parsed.reason as string | undefined,
        matchId: (parsed.matchId as string | undefined) ?? null,
      };
    });

    return NextResponse.json({
      player: {
        id: player.id,
        displayName: player.displayName,
        position: player.position,
        nation: player.nation,
        shirtNumber: player.shirtNumber,
        currentPrice: player.currentPrice,
      },
      squadRow: squadRow ?? null,
      performances: performancesPayload,
      adjustments,
    });
  } catch (error) {
    console.error('[Player performances] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch performances' },
      { status: 500 }
    );
  }
}
