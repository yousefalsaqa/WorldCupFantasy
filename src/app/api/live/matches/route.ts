// ============================================
// GET LIVE MATCHES
// Returns current live World Cup matches
// ============================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiFootball, MATCH_STATUS } from '@/lib/api-football';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // First, get matches from our database that are marked as live or today
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dbMatches = await prisma.match.findMany({
      where: {
        OR: [
          { isStarted: true, isFinished: false },
          {
            kickoffTime: {
              gte: today,
              lt: tomorrow,
            },
          },
        ],
      },
      include: {
        homeNation: true,
        awayNation: true,
        stage: true,
      },
      orderBy: {
        kickoffTime: 'asc',
      },
    });

    // Try to get live data from API-Football
    let apiLiveMatches: any[] = [];
    let apiError: string | null = null;

    try {
      const liveFixtures = await apiFootball.getLiveFixtures();
      apiLiveMatches = liveFixtures;
    } catch (error) {
      apiError = error instanceof Error ? error.message : 'Failed to fetch live data';
      console.error('[Live Matches] API error:', error);
    }

    // Format response
    const matches = dbMatches.map(match => {
      // Find matching API data
      const apiMatch = apiLiveMatches.find(
        f => f.fixture.id === match.apiFootballId
      );

      return {
        id: match.id,
        apiFootballId: match.apiFootballId,
        kickoffTime: match.kickoffTime,
        homeNation: {
          id: match.homeNation.id,
          name: match.homeNation.name,
          code: match.homeNation.code,
        },
        awayNation: {
          id: match.awayNation.id,
          name: match.awayNation.name,
          code: match.awayNation.code,
        },
        stage: {
          id: match.stage.id,
          stageId: match.stage.stageId,
          name: match.stage.name,
        },
        // Database scores
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        isStarted: match.isStarted,
        isFinished: match.isFinished,
        currentMinute: match.currentMinute,
        // Live API data (if available)
        live: apiMatch
          ? {
              status: apiMatch.fixture.status.short,
              statusLong: apiMatch.fixture.status.long,
              elapsed: apiMatch.fixture.status.elapsed,
              homeScore: apiMatch.goals.home,
              awayScore: apiMatch.goals.away,
            }
          : null,
      };
    });

    return NextResponse.json({
      matches,
      liveCount: matches.filter(m => m.live?.status && MATCH_STATUS.LIVE.includes(m.live.status as any)).length,
      apiStatus: apiError ? 'error' : 'ok',
      apiError,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Live Matches] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch matches' },
      { status: 500 }
    );
  }
}
