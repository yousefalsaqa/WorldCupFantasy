// ============================================
// GET /api/admin/match-simulator/perfs?matchId=...
//
// Lists every PlayerPerformance row for the given match in the shape
// the admin Match Simulator UI needs: stats fields named identically
// to PerfStatsInput, plus the computed totalPoints and isLive flag.
// The simulator page uses this to drive the "Edit stats per player"
// editor and to surface live point totals next to each row without
// having to read the squad endpoint.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get('matchId');
    if (!matchId) {
      return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
    }

    const perfs = await prisma.playerPerformance.findMany({
      where: { matchId },
      include: { player: { select: { displayName: true, position: true } } },
      orderBy: { totalPoints: 'desc' },
    });

    return NextResponse.json({
      perfs: perfs.map((p) => ({
        id: p.id,
        playerId: p.playerId,
        displayName: p.player.displayName,
        position: p.player.position,
        isLive: p.isLive,
        totalPoints: p.totalPoints,
        stats: {
          minutesPlayed: p.minutesPlayed,
          goals: p.goals,
          assists: p.assists,
          cleanSheet: p.cleanSheet,
          goalsConceeded: p.goalsConceeded,
          saves: p.saves,
          penaltiesSaved: p.penaltiesSaved,
          penaltiesMissed: p.penaltiesMissed,
          yellowCards: p.yellowCards,
          redCards: p.redCards,
          ownGoals: p.ownGoals,
          defensiveActions: p.defensiveActions,
          bonusPoints: p.bonusPoints,
        },
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Match Simulator GET perfs] Error:', error);
    return NextResponse.json({ error: 'Failed to load perfs' }, { status: 500 });
  }
}
