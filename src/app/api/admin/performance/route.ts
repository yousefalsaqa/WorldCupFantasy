import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { SCORING } from '@/lib/wc-constants';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    return user?.isAdmin ? user : null;
  } catch {
    return null;
  }
}

// Calculate total points from performance
function calculatePoints(
  position: string,
  perf: {
    minutes: number;
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
    bonusPoints: number;
  }
): number {
  let points = 0;

  // Minutes played
  if (perf.minutes >= 60) {
    points += SCORING.MINUTES_60_PLUS;
  } else if (perf.minutes > 0) {
    points += SCORING.MINUTES_1_TO_59;
  }

  // Goals
  const goalPoints = {
    GK: SCORING.GOAL_GK,
    DEF: SCORING.GOAL_DEF,
    MID: SCORING.GOAL_MID,
    FWD: SCORING.GOAL_FWD,
  }[position] || SCORING.GOAL_FWD;
  points += perf.goals * goalPoints;

  // Assists
  points += perf.assists * SCORING.ASSIST;

  // Clean sheets (60+ mins required)
  if (perf.cleanSheet && perf.minutes >= 60) {
    const csPoints = {
      GK: SCORING.CLEAN_SHEET_GK,
      DEF: SCORING.CLEAN_SHEET_DEF,
      MID: SCORING.CLEAN_SHEET_MID,
      FWD: SCORING.CLEAN_SHEET_FWD,
    }[position] || 0;
    points += csPoints;
  }

  // Goals conceeded (GK/DEF only)
  if ((position === 'GK' || position === 'DEF') && perf.minutes >= 60) {
    points += Math.floor(perf.goalsConceeded / 2) * SCORING.GOALS_CONCEDED_PER_2;
  }

  // Saves (GK only)
  if (position === 'GK') {
    points += Math.floor(perf.saves / SCORING.SAVES_PER_POINT);
    points += perf.penaltiesSaved * SCORING.PENALTY_SAVE;
  }

  // Negatives
  points += perf.penaltiesMissed * SCORING.PENALTY_MISS;
  points += perf.yellowCards * SCORING.YELLOW_CARD;
  points += perf.redCards * SCORING.RED_CARD;
  points += perf.ownGoals * SCORING.OWN_GOAL;

  // Bonus
  points += perf.bonusPoints;

  return points;
}

// POST /api/admin/performance - Save player performance
export async function POST(request: Request) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { matchId, playerId, minutes, goals, assists, cleanSheet, saves, yellowCards, redCards, ownGoals, penaltiesSaved, penaltiesMissed, bonusPoints, goalsConceeded } = body;

    if (!matchId || !playerId) {
      return NextResponse.json({ error: 'Match ID and Player ID required' }, { status: 400 });
    }

    // Get player position
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const perfData = {
      minutes: minutes ?? 0,
      goals: goals ?? 0,
      assists: assists ?? 0,
      cleanSheet: cleanSheet ?? false,
      goalsConceeded: goalsConceeded ?? 0,
      saves: saves ?? 0,
      penaltiesSaved: penaltiesSaved ?? 0,
      penaltiesMissed: penaltiesMissed ?? 0,
      yellowCards: yellowCards ?? 0,
      redCards: redCards ?? 0,
      ownGoals: ownGoals ?? 0,
      bonusPoints: bonusPoints ?? 0,
    };

    const totalPoints = calculatePoints(player.position, perfData);

    // Upsert performance
    const performance = await prisma.playerPerformance.upsert({
      where: {
        playerId_matchId: { playerId, matchId },
      },
      update: {
        minutesPlayed: perfData.minutes,
        goals: perfData.goals,
        assists: perfData.assists,
        cleanSheet: perfData.cleanSheet,
        goalsConceeded: perfData.goalsConceeded,
        saves: perfData.saves,
        penaltiesSaved: perfData.penaltiesSaved,
        penaltiesMissed: perfData.penaltiesMissed,
        yellowCards: perfData.yellowCards,
        redCards: perfData.redCards,
        ownGoals: perfData.ownGoals,
        bonusPoints: perfData.bonusPoints,
        totalPoints,
      },
      create: {
        playerId,
        matchId,
        minutesPlayed: perfData.minutes,
        goals: perfData.goals,
        assists: perfData.assists,
        cleanSheet: perfData.cleanSheet,
        goalsConceeded: perfData.goalsConceeded,
        saves: perfData.saves,
        penaltiesSaved: perfData.penaltiesSaved,
        penaltiesMissed: perfData.penaltiesMissed,
        yellowCards: perfData.yellowCards,
        redCards: perfData.redCards,
        ownGoals: perfData.ownGoals,
        bonusPoints: perfData.bonusPoints,
        totalPoints,
      },
    });

    // Audit
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'PLAYER_PERFORMANCE_ENTERED',
        details: `${player.displayName}: ${totalPoints} pts (G:${perfData.goals} A:${perfData.assists})`,
      },
    });

    return NextResponse.json({ performance, totalPoints });
  } catch (error) {
    console.error('Save performance error:', error);
    return NextResponse.json({ error: 'Failed to save performance' }, { status: 500 });
  }
}
