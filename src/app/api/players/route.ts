import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const position = searchParams.get('position');
    // Optional row cap — the public landing page uses ?limit=6 to fetch just
    // the marquee names instead of all ~1,250 rows.
    const limitParam = parseInt(searchParams.get('limit') || '', 10);
    const take = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : undefined;

    // Only select fields the squad/transfers UI actually uses. Cuts payload
    // size dramatically (faster parse on iPhone, fewer dropped requests on cellular).
    const players = await prisma.player.findMany({
      where: position ? { position } : undefined,
      take,
      select: {
        id: true,
        displayName: true,
        position: true,
        currentPrice: true,
        shirtNumber: true,
        photoUrl: true,
        isAvailable: true,
        availabilityNote: true,
        nation: {
          select: {
            id: true,
            name: true,
            code: true,
            kitColor1: true,
            kitColor2: true,
            isEliminated: true,
          },
        },
      },
      orderBy: { currentPrice: 'desc' },
    });

    // Selection history: each nation's most recent FINISHED match, then
    // this player's perf row in it. Powers the "Started / Sub / Unused"
    // chip in the squad builder — fact-based stand-in for predicted
    // lineups (national sides barely rotate between group games).
    const finished = await prisma.match.findMany({
      where: { isFinished: true },
      orderBy: { kickoffTime: 'desc' },
      select: { id: true, homeNationId: true, awayNationId: true },
    });
    const lastMatchByNation = new Map<string, string>();
    for (const m of finished) {
      // list is newest-first, so only the first hit per nation sticks
      if (!lastMatchByNation.has(m.homeNationId)) lastMatchByNation.set(m.homeNationId, m.id);
      if (!lastMatchByNation.has(m.awayNationId)) lastMatchByNation.set(m.awayNationId, m.id);
    }
    const lastMatchIds = Array.from(new Set(lastMatchByNation.values()));
    const perfs = lastMatchIds.length > 0
      ? await prisma.playerPerformance.findMany({
          where: { matchId: { in: lastMatchIds } },
          select: { playerId: true, matchId: true, startedMatch: true, minutesPlayed: true },
        })
      : [];
    const perfByPlayerMatch = new Map(perfs.map((p) => [`${p.playerId}|${p.matchId}`, p]));

    const withLastMatch = players.map((p) => {
      const matchId = lastMatchByNation.get(p.nation.id);
      if (!matchId) return { ...p, lastMatch: null }; // nation hasn't played yet
      const perf = perfByPlayerMatch.get(`${p.id}|${matchId}`);
      return {
        ...p,
        lastMatch: perf
          ? { played: true, started: perf.startedMatch, minutes: perf.minutesPlayed }
          : { played: false, started: false, minutes: 0 }, // unused / not in squad
      };
    });

    return NextResponse.json(withLastMatch, {
      headers: {
        // Short browser cache + SWR so repeat squad-page visits feel instant
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('Error fetching players:', error);
    return NextResponse.json(
      { error: 'Failed to fetch players' },
      { status: 500 }
    );
  }
}
