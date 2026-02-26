import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;
  const decoded = await verifyToken(token);
  if (!decoded) return null;
  return { userId: decoded.userId };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ stageId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 });
    }

    const { stageId } = await params;

    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
      select: { id: true },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Get the stage
    const stage = await prisma.stage.findFirst({
      where: { stageId },
      select: { id: true, stageId: true, name: true },
    });

    if (!stage) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    // Get TeamStage data
    const teamStage = await prisma.teamStage.findUnique({
      where: { teamId_stageId: { teamId: team.id, stageId: stage.id } },
    });

    // Get all matches in this stage
    const matches = await prisma.match.findMany({
      where: { stageId: stage.id },
      include: {
        homeNation: { select: { id: true, name: true, code: true } },
        awayNation: { select: { id: true, name: true, code: true } },
      },
    });

    // Get the user's squad players
    const squadPlayers = await prisma.squadPlayer.findMany({
      where: { teamId: team.id },
      include: {
        player: {
          include: {
            nation: { select: { id: true, name: true, code: true, kitColor1: true, kitColor2: true } },
          },
        },
      },
    });

    // Get performance data for all squad players in this stage's matches
    const matchIds = matches.map(m => m.id);
    const playerIds = squadPlayers.map(sp => sp.playerId);

    const performances = matchIds.length > 0 && playerIds.length > 0
      ? await prisma.playerPerformance.findMany({
          where: {
            matchId: { in: matchIds },
            playerId: { in: playerIds },
          },
          include: {
            match: {
              include: {
                homeNation: { select: { name: true, code: true } },
                awayNation: { select: { name: true, code: true } },
              },
            },
          },
        })
      : [];

    // Build per-player breakdown
    const playerBreakdowns = squadPlayers.map(sp => {
      const playerPerfs = performances.filter(p => p.playerId === sp.playerId);
      const totalPoints = playerPerfs.reduce((sum, p) => sum + p.totalPoints, 0);

      const matchDetails = playerPerfs.map(perf => ({
        matchId: perf.matchId,
        opponent: perf.match.homeNation.code === sp.player.nation.code
          ? perf.match.awayNation.name
          : perf.match.homeNation.name,
        minutesPlayed: perf.minutesPlayed,
        goals: perf.goals,
        assists: perf.assists,
        cleanSheet: perf.cleanSheet,
        saves: perf.saves,
        yellowCards: perf.yellowCards,
        redCards: perf.redCards,
        ownGoals: perf.ownGoals,
        penaltiesSaved: perf.penaltiesSaved,
        penaltiesMissed: perf.penaltiesMissed,
        goalsConceeded: perf.goalsConceeded,
        bonusPoints: perf.bonusPoints,
        totalPoints: perf.totalPoints,
      }));

      return {
        playerId: sp.playerId,
        displayName: sp.player.displayName,
        position: sp.player.position,
        nation: sp.player.nation,
        shirtNumber: sp.player.shirtNumber,
        isStarting: sp.isStarting,
        isCaptain: sp.isCaptain,
        isViceCaptain: sp.isViceCaptain,
        totalPoints,
        matches: matchDetails,
      };
    });

    return NextResponse.json({
      stage: {
        stageId: stage.stageId,
        name: stage.name,
      },
      teamStage: teamStage
        ? {
            rawPoints: teamStage.rawPoints,
            captainPoints: teamStage.captainPoints,
            transferHits: teamStage.transferHits,
            totalPoints: teamStage.totalPoints,
            chipUsed: teamStage.chipUsed,
          }
        : null,
      players: playerBreakdowns,
      hasData: performances.length > 0,
    });
  } catch (error) {
    console.error('Error fetching gameweek data:', error);
    return NextResponse.json({ error: 'Failed to fetch gameweek data' }, { status: 500 });
  }
}
