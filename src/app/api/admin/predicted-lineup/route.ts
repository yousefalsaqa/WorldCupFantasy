import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import {
  matchNamesToNationPlayers,
  type PredictedLineups,
} from '@/lib/predicted-lineups';

export const dynamic = 'force-dynamic';

// ============================================
// POST /api/admin/predicted-lineup — set a match's predicted XI.
//
// Body: {
//   matchId: string,
//   home: { formation?: string, names: string[] },   // 11 editorial names
//   away: { formation?: string, names: string[] },
//   dryRun?: boolean,                                // preview matching only
// }
//
// Names are fuzzy-matched against each nation's squad (shared lib —
// same logic as scripts/set-predicted-lineup.ts). Anything ambiguous or
// unknown comes back in `unmatched` and NOTHING is saved, so a typo can't
// silently publish a 10-man prediction.
//
// DELETE /api/admin/predicted-lineup?matchId=... — clear the prediction.
// ============================================

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json();
    const { matchId, home, away, dryRun } = body as {
      matchId: string;
      home: { formation?: string; names: string[] };
      away: { formation?: string; names: string[] };
      dryRun?: boolean;
    };
    if (!matchId || !Array.isArray(home?.names) || !Array.isArray(away?.names)) {
      return NextResponse.json({ error: 'matchId, home.names and away.names are required' }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        homeNationId: true,
        awayNationId: true,
        homeNation: { select: { name: true, code: true } },
        awayNation: { select: { name: true, code: true } },
      },
    });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const [homeResult, awayResult] = await Promise.all([
      matchNamesToNationPlayers(match.homeNationId, home.names),
      matchNamesToNationPlayers(match.awayNationId, away.names),
    ]);

    const preview = {
      home: { nation: match.homeNation.code, ...homeResult },
      away: { nation: match.awayNation.code, ...awayResult },
    };

    const hasProblems =
      homeResult.unmatched.length > 0 ||
      awayResult.unmatched.length > 0 ||
      homeResult.matched.length !== 11 ||
      awayResult.matched.length !== 11;

    if (dryRun || hasProblems) {
      return NextResponse.json({
        saved: false,
        ...preview,
        ...(hasProblems && !dryRun
          ? { error: 'Both sides need exactly 11 uniquely-matched players before saving' }
          : {}),
      }, { status: hasProblems && !dryRun ? 422 : 200 });
    }

    const payload: PredictedLineups = {
      home: { formation: home.formation || null, players: homeResult.matched },
      away: { formation: away.formation || null, players: awayResult.matched },
      updatedAt: new Date().toISOString(),
    };
    await prisma.match.update({
      where: { id: match.id },
      data: { predictedLineups: JSON.stringify(payload) },
    });

    return NextResponse.json({ saved: true, ...preview });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('Predicted lineup error:', error);
    return NextResponse.json({ error: 'Failed to save predicted lineup' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin();
    const matchId = request.nextUrl.searchParams.get('matchId');
    if (!matchId) {
      return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
    }
    await prisma.match.update({
      where: { id: matchId },
      data: { predictedLineups: null },
    });
    return NextResponse.json({ cleared: true });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('Predicted lineup clear error:', error);
    return NextResponse.json({ error: 'Failed to clear predicted lineup' }, { status: 500 });
  }
}
