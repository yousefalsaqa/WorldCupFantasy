// ============================================
// ADMIN — FIXTURE PICKER FOR LIVE-TEST SANDBOX
// Two modes via the `mode` query param:
//   • mode=live  → all in-progress fixtures globally (default)
//   • mode=date  → finished + scheduled fixtures on `date` (YYYY-MM-DD),
//                  optionally filtered by `league` ID
//
// Each invocation costs 1 daily API request. Used to seed the fixture
// picker in /admin/live-test so admins can grab a fixtureId without
// leaving the app. See plan: live-points-test-sandbox.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { apiFootball } from '@/lib/api-football';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    const status = (err as Error).message === 'Forbidden' ? 403 : 401;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }

  const mode = request.nextUrl.searchParams.get('mode') ?? 'live';
  const date = request.nextUrl.searchParams.get('date');
  const leagueRaw = request.nextUrl.searchParams.get('league');
  const seasonRaw = request.nextUrl.searchParams.get('season');

  try {
    let fixtures;
    if (mode === 'date') {
      if (!date) {
        return NextResponse.json(
          { error: 'date query parameter is required when mode=date (format: YYYY-MM-DD)' },
          { status: 400 },
        );
      }
      const league = leagueRaw ? parseInt(leagueRaw, 10) : undefined;
      const season = seasonRaw ? parseInt(seasonRaw, 10) : undefined;
      if (league !== undefined && season === undefined) {
        return NextResponse.json(
          {
            error:
              'season is required when filtering by league (API-Football rule). ' +
              'For European leagues the season is the START year — e.g. La Liga 2025-26 = 2025.',
          },
          { status: 400 },
        );
      }
      fixtures = await apiFootball.getFixturesByDate(date, league, season);
    } else {
      fixtures = await apiFootball.getLiveFixturesGlobal();
    }

    // Slim payload — the picker UI only needs basic identification and
    // status, not the full fixture envelope. Keeps the network round
    // trip small for a list that can hit ~150 items on a busy date.
    const picker = fixtures.map((f) => ({
      id: f.fixture.id,
      date: f.fixture.date,
      status: {
        short: f.fixture.status.short,
        elapsed: f.fixture.status.elapsed,
      },
      league: {
        id: f.league.id,
        name: f.league.name,
        country: f.league.country,
      },
      home: { id: f.teams.home.id, name: f.teams.home.name },
      away: { id: f.teams.away.id, name: f.teams.away.name },
      goals: { home: f.goals.home, away: f.goals.away },
    }));

    return NextResponse.json({
      mode,
      count: picker.length,
      fixtures: picker,
      rateLimit: apiFootball.getRateLimits(),
    });
  } catch (err) {
    console.error('[live-fixtures-global] Error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
