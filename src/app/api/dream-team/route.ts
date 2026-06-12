import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface PlayerWithPoints {
  playerId: string;
  displayName: string;
  position: string;
  shirtNumber: number | null;
  currentPrice: number;
  photoUrl: string | null;
  nation: { name: string; code: string; kitColor1: string; kitColor2: string };
  totalPoints: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stageId = searchParams.get('stageId');

    // Build match filter
    let matchIds: string[] | null = null;

    if (stageId) {
      const stage = await prisma.stage.findFirst({
        where: { stageId },
        select: { id: true },
      });

      if (stage) {
        const matches = await prisma.match.findMany({
          where: { stageId: stage.id },
          select: { id: true },
        });
        matchIds = matches.map(m => m.id);
      }
    }

    // Aggregate player points
    const whereClause = matchIds && matchIds.length > 0
      ? { matchId: { in: matchIds } }
      : {};

    const performances = await prisma.playerPerformance.groupBy({
      by: ['playerId'],
      where: whereClause,
      _sum: { totalPoints: true },
      orderBy: { _sum: { totalPoints: 'desc' } },
      take: 50,
    });

    if (performances.length === 0) {
      return NextResponse.json({ dreamTeam: [], hasData: false });
    }

    const playerIds = performances.map(p => p.playerId);
    const players = await prisma.player.findMany({
      where: { id: { in: playerIds } },
      include: {
        nation: { select: { name: true, code: true, kitColor1: true, kitColor2: true } },
      },
    });

    const playerMap = new Map(players.map(p => [p.id, p]));

    const scoredPlayers: PlayerWithPoints[] = performances
      .map(perf => {
        const p = playerMap.get(perf.playerId);
        if (!p) return null;
        return {
          playerId: p.id,
          displayName: p.displayName,
          position: p.position,
          shirtNumber: p.shirtNumber,
          currentPrice: p.currentPrice,
          photoUrl: p.photoUrl,
          nation: p.nation,
          totalPoints: perf._sum.totalPoints || 0,
        };
      })
      .filter((p): p is PlayerWithPoints => p !== null)
      .sort((a, b) => b.totalPoints - a.totalPoints);

    // Greedy selection of best valid XI (1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD, total = 11)
    const dreamTeam = selectBestXI(scoredPlayers);

    return NextResponse.json({ dreamTeam, hasData: true });
  } catch (error) {
    console.error('Error fetching dream team:', error);
    return NextResponse.json({ error: 'Failed to fetch dream team' }, { status: 500 });
  }
}

function selectBestXI(players: PlayerWithPoints[]): PlayerWithPoints[] {
  const byPos: Record<string, PlayerWithPoints[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of players) {
    if (byPos[p.position]) byPos[p.position].push(p);
  }

  // Try common formations and pick the one with highest total points
  const formations = [
    { GK: 1, DEF: 4, MID: 4, FWD: 2 },
    { GK: 1, DEF: 4, MID: 3, FWD: 3 },
    { GK: 1, DEF: 3, MID: 5, FWD: 2 },
    { GK: 1, DEF: 3, MID: 4, FWD: 3 },
    { GK: 1, DEF: 5, MID: 3, FWD: 2 },
    { GK: 1, DEF: 5, MID: 4, FWD: 1 },
    { GK: 1, DEF: 4, MID: 5, FWD: 1 },
  ];

  let bestTeam: PlayerWithPoints[] = [];
  let bestPoints = -1;

  for (const formation of formations) {
    const team: PlayerWithPoints[] = [];
    let valid = true;

    for (const [pos, count] of Object.entries(formation)) {
      if (byPos[pos].length < count) {
        valid = false;
        break;
      }
      team.push(...byPos[pos].slice(0, count));
    }

    if (!valid || team.length !== 11) continue;

    const totalPts = team.reduce((sum, p) => sum + p.totalPoints, 0);
    if (totalPts > bestPoints) {
      bestPoints = totalPts;
      bestTeam = team;
    }
  }

  return bestTeam;
}
