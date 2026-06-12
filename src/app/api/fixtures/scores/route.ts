import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// This route is dynamic to ensure fresh data
export const dynamic = 'force-dynamic';

// GET /api/fixtures/scores — public scoreboard overlay for the fixtures
// page. The page renders from the hardcoded schedule in
// src/lib/world-cup-fixtures.ts; this returns every synced DB match keyed
// by nation codes so the page can paint live/final scores on top. No auth:
// it's the same data any TV guide shows.
export async function GET() {
  try {
    const matches = await prisma.match.findMany({
      select: {
        kickoffTime: true,
        homeScore: true,
        awayScore: true,
        homePenalties: true,
        awayPenalties: true,
        isStarted: true,
        isFinished: true,
        currentMinute: true,
        homeNation: { select: { code: true } },
        awayNation: { select: { code: true } },
      },
    });

    const payload = matches.map((m) => ({
      home: m.homeNation.code,
      away: m.awayNation.code,
      kickoff: m.kickoffTime.toISOString(),
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      homePenalties: m.homePenalties,
      awayPenalties: m.awayPenalties,
      isStarted: m.isStarted,
      isFinished: m.isFinished,
      currentMinute: m.currentMinute,
    }));

    return NextResponse.json({
      matches: payload,
      anyMatchLive: payload.some((m) => m.isStarted && !m.isFinished),
    });
  } catch (error) {
    console.error('Fixtures scores error:', error);
    return NextResponse.json({ error: 'Failed to load scores' }, { status: 500 });
  }
}
