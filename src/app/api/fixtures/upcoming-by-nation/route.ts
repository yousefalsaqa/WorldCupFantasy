// ============================================
// GET /api/fixtures/upcoming-by-nation
// Returns a map of nation code → upcoming (not-finished) DB matches, each with
// opponent code, home/away flag and kickoff. The static fixture lib can't
// resolve knockout opponents (bracket placeholders until teams are known), so
// the squad + league player cards use this to show the real next-game FDR pill
// once a knockout matchup is confirmed in the DB. Group games are included too
// (they live in the DB as well), so callers can treat this as the single
// source for "next game" and fall back to the static lib only when absent.
// ============================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export interface UpcomingFixture {
  opponent: string;
  isHome: boolean;
  kickoff: string;
  stageId: string;
}

export async function GET() {
  try {
    const matches = await prisma.match.findMany({
      where: { isFinished: false, kickoffTime: { gt: new Date() } },
      include: {
        homeNation: { select: { code: true } },
        awayNation: { select: { code: true } },
        stage: { select: { stageId: true } },
      },
      orderBy: { kickoffTime: 'asc' },
    });

    const byNation: Record<string, UpcomingFixture[]> = {};
    const push = (code: string, fx: UpcomingFixture) => {
      (byNation[code] ??= []).push(fx);
    };
    for (const m of matches) {
      const home = m.homeNation.code;
      const away = m.awayNation.code;
      const kickoff = m.kickoffTime.toISOString();
      const stageId = m.stage.stageId;
      push(home, { opponent: away, isHome: true, kickoff, stageId });
      push(away, { opponent: home, isHome: false, kickoff, stageId });
    }

    return NextResponse.json({ byNation });
  } catch (error) {
    console.error('[upcoming-by-nation] Error:', error);
    return NextResponse.json({ byNation: {} }, { status: 500 });
  }
}
