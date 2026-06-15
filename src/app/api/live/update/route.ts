// ============================================
// LIVE UPDATE - Fetch and Update Player Points
// Polls API-Football for live match data and updates performances
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiFootball, MATCH_STATUS } from '@/lib/api-football';
import { LiveScoringCalculator } from '@/lib/live-scoring';
import { API_ID_TO_NATION } from '@/lib/team-mappings';
import { getSession } from '@/lib/auth';
import { updateSquadPoints } from '@/lib/squad-points';
import { maybeAdvanceStage, type AdvanceResult } from '@/lib/stage-advance';
import { rescorePendingFinishedMatches, type RescoreOutcome } from '@/lib/rescore-pending';

export const dynamic = 'force-dynamic';

interface UpdateResult {
  matchId: string;
  fixtureId: number;
  status: 'updated' | 'finished' | 'not_started' | 'error';
  playersUpdated: number;
  error?: string;
}

// Support both GET and POST for cron services
export async function GET(request: NextRequest) {
  return handleUpdate(request);
}

export async function POST(request: NextRequest) {
  return handleUpdate(request);
}

/**
 * Allow access from one of two callers:
 *   1. Vercel Cron — sends `Authorization: Bearer ${CRON_SECRET}` on every
 *      scheduled invocation (per Vercel's cron docs).
 *   2. An authenticated admin — so the manual "Update Live Scores" button
 *      on /admin keeps working without leaking the cron secret to the
 *      browser.
 *
 * If CRON_SECRET is unset we fall back to admin-only access — protects
 * dev/preview environments where the env var hasn't been configured yet
 * (better to break cron than to leave the endpoint world-writable).
 */
async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader === `Bearer ${cronSecret}`) return true;
  }
  const session = await getSession();
  return !!session?.isAdmin;
}

/**
 * Run the delayed re-score sweep, swallowing any error. This must never
 * break live scoring — it's a best-effort catch-up for matches whose
 * API-Football stats finalized after we first banked them. Returns the
 * per-match outcomes (empty array on failure) for observability.
 */
async function runRescoreSweep(): Promise<RescoreOutcome[]> {
  try {
    const outcomes = await rescorePendingFinishedMatches();
    const acted = outcomes.filter((o) => o.status !== 'already-final');
    if (acted.length > 0) {
      console.log('[Live Update] rescore sweep:', JSON.stringify(acted));
    }
    return outcomes;
  } catch (err) {
    console.error('[Live Update] rescore sweep failed:', err);
    return [];
  }
}

async function handleUpdate(request: NextRequest) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json(
        { error: 'Unauthorized — provide a valid CRON_SECRET bearer token or an admin session' },
        { status: 401 },
      );
    }
    console.log('[Live Update] Running update...');

    const results: UpdateResult[] = [];

    // Get all matches that are currently live (isStarted but not isFinished)
    const liveMatches = await prisma.match.findMany({
      where: {
        isStarted: true,
        isFinished: false,
        apiFootballId: { not: null },
      },
      include: {
        homeNation: true,
        awayNation: true,
        stage: true,
      },
    });

    if (liveMatches.length === 0) {
      // Check for matches that should have started
      const now = new Date();
      const recentlyStarted = await prisma.match.findMany({
        where: {
          isStarted: false,
          isFinished: false,
          kickoffTime: { lte: now },
          apiFootballId: { not: null },
        },
        include: {
          homeNation: true,
          awayNation: true,
          stage: true,
        },
      });

      // Mark them as started
      for (const match of recentlyStarted) {
        await prisma.match.update({
          where: { id: match.id },
          data: { isStarted: true },
        });
      }

      // Even when no matches are live, the previous run may have just
      // finalized the last match in the active stage. Try to advance so
      // the cron eventually rolls forward without needing a "live"
      // transition to trigger.
      let stageAdvance: AdvanceResult | null = null;
      try {
        stageAdvance = await maybeAdvanceStage();
      } catch (err) {
        console.error('[Live Update] maybeAdvanceStage failed:', err);
      }

      // Delayed re-score: rebank any recently-finished match whose
      // API-Football final stats have settled since we first banked it.
      const rescored = await runRescoreSweep();

      return NextResponse.json({
        message: 'No live matches to update',
        matchesStarted: recentlyStarted.length,
        results: [],
        stageAdvance,
        rescored,
      });
    }

    // Process each live match
    for (const match of liveMatches) {
      try {
        const fixtureId = match.apiFootballId!;
        
        // Fetch latest fixture status
        const fixture = await apiFootball.getFixtureById(fixtureId);
        
        if (!fixture) {
          results.push({
            matchId: match.id,
            fixtureId,
            status: 'error',
            playersUpdated: 0,
            error: 'Fixture not found in API',
          });
          continue;
        }

        const status = fixture.fixture.status.short;
        const isLive = MATCH_STATUS.LIVE.includes(status as any);
        const isFinished = MATCH_STATUS.FINISHED.includes(status as any);

        // Update match scores and status
        await prisma.match.update({
          where: { id: match.id },
          data: {
            homeScore: fixture.goals.home,
            awayScore: fixture.goals.away,
            currentMinute: fixture.fixture.status.elapsed,
            isFinished,
            lastUpdated: new Date(),
            // Penalty shootout scores
            homePenalties: fixture.score.penalty.home,
            awayPenalties: fixture.score.penalty.away,
            // Set winner for knockouts
            winnerId: isFinished && fixture.teams.home.winner
              ? match.homeNationId
              : isFinished && fixture.teams.away.winner
                ? match.awayNationId
                : null,
          },
        });

        if (!isLive && !isFinished) {
          results.push({
            matchId: match.id,
            fixtureId,
            status: 'not_started',
            playersUpdated: 0,
          });
          continue;
        }

        // Fetch player statistics
        const [teamsData, events] = await Promise.all([
          apiFootball.getFixturePlayerStats(fixtureId),
          apiFootball.getFixtureEvents(fixtureId),
        ]);

        // Score players at their FANTASY (DB) position, not API-Football's
        // per-match role. Pre-load every player in this fixture so we can
        // map apiFootballId -> our position and pass it to the calculator.
        const apiPlayerIds = teamsData.flatMap((t) =>
          t.players.map((p) => p.player.id),
        );
        const dbPlayers = await prisma.player.findMany({
          where: { apiFootballId: { in: apiPlayerIds } },
          select: { apiFootballId: true, position: true },
        });
        const positionOverrides = new Map<number, 'GK' | 'DEF' | 'MID' | 'FWD'>();
        for (const p of dbPlayers) {
          if (p.apiFootballId != null) {
            positionOverrides.set(p.apiFootballId, p.position as 'GK' | 'DEF' | 'MID' | 'FWD');
          }
        }

        // Calculate points using our scoring system
        const calculator = new LiveScoringCalculator(match.stage.stageId);
        const playerPerformances = calculator.processFixtureData(
          teamsData,
          events,
          fixture.goals.home || 0,
          fixture.goals.away || 0,
          match.homeNation.apiFootballId!,
          match.awayNation.apiFootballId!,
          positionOverrides,
        );

        let playersUpdated = 0;

        // Update or create player performances
        for (const perf of playerPerformances) {
          // Find our player by API ID
          const player = await prisma.player.findFirst({
            where: { apiFootballId: perf.apiPlayerId },
          });

          if (!player) {
            console.log(`[Live Update] Player not found: API ID ${perf.apiPlayerId} (${perf.playerName})`);
            continue;
          }

          // Upsert performance record
          await prisma.playerPerformance.upsert({
            where: {
              playerId_matchId: {
                playerId: player.id,
                matchId: match.id,
              },
            },
            create: {
              playerId: player.id,
              matchId: match.id,
              minutesPlayed: perf.minutesPlayed,
              goals: perf.goals,
              assists: perf.assists,
              cleanSheet: perf.cleanSheet,
              goalsConceeded: perf.goalsConceeded,
              saves: perf.saves,
              penaltiesSaved: perf.penaltiesSaved,
              penaltiesMissed: perf.penaltiesMissed,
              yellowCards: perf.yellowCards,
              redCards: perf.redCards,
              ownGoals: perf.ownGoals,
              defensiveActions: perf.defensiveActions ?? 0,
              startedMatch: perf.startedMatch,
              totalPoints: perf.totalPoints,
              isLive: isLive,
              lastUpdated: new Date(),
            },
            update: {
              minutesPlayed: perf.minutesPlayed,
              goals: perf.goals,
              assists: perf.assists,
              cleanSheet: perf.cleanSheet,
              goalsConceeded: perf.goalsConceeded,
              saves: perf.saves,
              penaltiesSaved: perf.penaltiesSaved,
              penaltiesMissed: perf.penaltiesMissed,
              yellowCards: perf.yellowCards,
              redCards: perf.redCards,
              ownGoals: perf.ownGoals,
              defensiveActions: perf.defensiveActions ?? 0,
              startedMatch: perf.startedMatch,
              totalPoints: perf.totalPoints,
              isLive: isLive,
              lastUpdated: new Date(),
            },
          });

          playersUpdated++;
        }

        // If match is finished, mark performances as not live and update team points
        if (isFinished) {
          await prisma.playerPerformance.updateMany({
            where: { matchId: match.id },
            data: { isLive: false },
          });

          // Update squad player points
          await updateSquadPoints(match.id);
        }

        results.push({
          matchId: match.id,
          fixtureId,
          status: isFinished ? 'finished' : 'updated',
          playersUpdated,
        });
      } catch (error) {
        console.error(`[Live Update] Error processing match ${match.id}:`, error);
        results.push({
          matchId: match.id,
          fixtureId: match.apiFootballId!,
          status: 'error',
          playersUpdated: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Auto stage advancement: if any match transitioned to FT this run,
    // check whether that completed its stage and roll forward to the next
    // one. maybeAdvanceStage is idempotent + cheap when there's nothing
    // to do, so we just call it unconditionally at the end. We swallow
    // errors here — failing to advance shouldn't poison the per-match
    // results the caller is expecting.
    let stageAdvance: AdvanceResult | null = null;
    try {
      stageAdvance = await maybeAdvanceStage();
    } catch (err) {
      console.error('[Live Update] maybeAdvanceStage failed:', err);
    }

    // Delayed re-score: rebank any recently-finished match whose
    // API-Football final stats have settled since we first banked it.
    const rescored = await runRescoreSweep();

    return NextResponse.json({
      message: 'Live update completed',
      matchesProcessed: liveMatches.length,
      results,
      rateLimit: apiFootball.getRateLimitRemaining(),
      lastUpdated: new Date().toISOString(),
      stageAdvance,
      rescored,
    });
  } catch (error) {
    console.error('[Live Update] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update live data' },
      { status: 500 }
    );
  }
}

// updateSquadPoints lives in @/lib/squad-points so the admin match
// simulator can call the same finalization routine without duplicating
// the captain-multiplier / starting-XI math.
