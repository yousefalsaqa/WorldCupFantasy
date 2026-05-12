// ============================================
// ADMIN — LIVE SCORING SANDBOX
// Runs LiveScoringCalculator against ANY fixture ID and returns the
// computed per-player fantasy points. No DB writes — this exists so we
// can validate scoring against real API-Football data (live or finished,
// any league, anywhere in the world) without polluting production
// PlayerPerformance / SquadPlayer rows. See plan: live-points-test-sandbox.
//
// Cost per invocation: 3 daily API requests
// (/fixtures?id= + /fixtures/players + /fixtures/events).
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { apiFootball } from '@/lib/api-football';
import { LiveScoringCalculator } from '@/lib/live-scoring';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    const status = (err as Error).message === 'Forbidden' ? 403 : 401;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }

  const fixtureIdRaw = request.nextUrl.searchParams.get('fixtureId');
  const stageIdRaw = request.nextUrl.searchParams.get('stageId') ?? undefined;

  if (!fixtureIdRaw) {
    return NextResponse.json(
      { error: 'fixtureId query parameter is required' },
      { status: 400 },
    );
  }

  const fixtureId = parseInt(fixtureIdRaw, 10);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return NextResponse.json(
      { error: 'fixtureId must be a positive integer' },
      { status: 400 },
    );
  }

  try {
    // Cost = 3 API calls. We fetch fixture meta sequentially (cheapest) and
    // events + stats in parallel because they're independent.
    const fixture = await apiFootball.getFixtureById(fixtureId);
    if (!fixture) {
      return NextResponse.json(
        { error: `Fixture ${fixtureId} not found in API-Football` },
        { status: 404 },
      );
    }

    const [teamsData, events] = await Promise.all([
      apiFootball.getFixturePlayerStats(fixtureId),
      apiFootball.getFixtureEvents(fixtureId),
    ]);

    // Some leagues / pre-kickoff fixtures return 0 player rows. We surface
    // this clearly so the UI can show a friendly "no data yet" instead of
    // a confused empty table.
    const totalPlayerRows = teamsData.reduce((n, t) => n + t.players.length, 0);

    const calculator = new LiveScoringCalculator(stageIdRaw);
    const playerPoints = calculator.processFixtureData(
      teamsData,
      events,
      fixture.goals.home ?? 0,
      fixture.goals.away ?? 0,
      fixture.teams.home.id,
      fixture.teams.away.id,
    );

    // Sort top-scoring first for the UI default.
    playerPoints.sort((a, b) => b.totalPoints - a.totalPoints);

    return NextResponse.json({
      fixture: {
        id: fixture.fixture.id,
        date: fixture.fixture.date,
        status: {
          short: fixture.fixture.status.short,
          long: fixture.fixture.status.long,
          elapsed: fixture.fixture.status.elapsed,
        },
        league: {
          id: fixture.league.id,
          name: fixture.league.name,
          country: fixture.league.country,
          season: fixture.league.season,
          round: fixture.league.round,
        },
        teams: {
          home: { id: fixture.teams.home.id, name: fixture.teams.home.name },
          away: { id: fixture.teams.away.id, name: fixture.teams.away.name },
        },
        goals: { home: fixture.goals.home, away: fixture.goals.away },
      },
      raw: {
        teamsReturned: teamsData.length,
        playerRowsReturned: totalPlayerRows,
        eventsReturned: events.length,
      },
      stageId: stageIdRaw ?? null,
      playerPoints,
      rateLimit: apiFootball.getRateLimits(),
      computedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[test-live-fixture] Error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
