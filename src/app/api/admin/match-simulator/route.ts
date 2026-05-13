// ============================================
// /api/admin/match-simulator
//
// Lets an admin pretend a real Match is live, write fake PlayerPerformance
// rows, bump them over time, then "finish" the match to flow points into
// SquadPlayer.points + Team.totalPoints — exercising the exact same
// finalization path the WC cron will use, without burning any
// API-Football quota.
//
// Designed for local dev + sandbox testing of:
//   - the green livePoints pill on /squad
//   - the per-match breakdown in the player detail modal
//   - the "match finishes, points get banked, isLive flips off" flow
//   - multiple-simultaneous-live-matches behaviour
//
// Endpoints:
//   GET    ?action=context              → list matches + admin's squad
//   POST   { action: 'start',  matchId, seeds: [...] }   → mark live, seed perf rows
//   POST   { action: 'tick',   matchId, deltas: [...] }  → bump stats (additive deltas)
//   POST   { action: 'set-stats', matchId, stats: [...] } → REPLACE stats for given players (used by the in-page stat editor)
//   POST   { action: 'set-clock', matchId, currentMinute, homeScore?, awayScore?, syncMinutesToOnPitch? }
//                                                        → set match clock + scores;
//                                                          optionally bump every existing perf row's
//                                                          minutesPlayed to currentMinute (used for the
//                                                          "Jump to FT" button so everyone is at 90).
//   POST   { action: 'finish', matchId }                 → trigger updateSquadPoints
//   POST   { action: 'reset',  matchId }                 → wipe perf rows + revert match flags
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { SCORING } from '@/lib/wc-constants';
import { updateSquadPoints, rollbackSquadPoints } from '@/lib/squad-points';
import { maybeAdvanceStage } from '@/lib/stage-advance';

export const dynamic = 'force-dynamic';

type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

interface PerfStatsInput {
  playerId: string;
  minutesPlayed?: number;
  goals?: number;
  assists?: number;
  cleanSheet?: boolean;
  goalsConceeded?: number;
  saves?: number;
  penaltiesSaved?: number;
  penaltiesMissed?: number;
  yellowCards?: number;
  redCards?: number;
  ownGoals?: number;
  defensiveActions?: number;
  bonusPoints?: number;
}

// Server-side mirror of the points formula. Identical to
// /api/players/[id]/performances → computeBreakdown but writes-only.
function computeTotal(p: Required<PerfStatsInput>, position: Position, stageId: string): number {
  let total = 0;
  if (p.minutesPlayed >= 60) total += SCORING.MINUTES_60_PLUS;
  else if (p.minutesPlayed > 0) total += SCORING.MINUTES_1_TO_59;

  const isKnockout = !stageId.startsWith('GR');
  if (p.goals > 0) {
    const perGoal =
      position === 'GK' ? SCORING.GOAL_GK :
      position === 'DEF' ? SCORING.GOAL_DEF :
      position === 'MID' ? SCORING.GOAL_MID : SCORING.GOAL_FWD;
    total += perGoal * p.goals;
    if (isKnockout) total += SCORING.KNOCKOUT_GOAL_BONUS * p.goals;
  }
  if (p.assists > 0) total += SCORING.ASSIST * p.assists;
  if (p.cleanSheet) {
    total +=
      position === 'GK' ? SCORING.CLEAN_SHEET_GK :
      position === 'DEF' ? SCORING.CLEAN_SHEET_DEF :
      position === 'MID' ? SCORING.CLEAN_SHEET_MID : SCORING.CLEAN_SHEET_FWD;
  }
  if ((position === 'GK' || position === 'DEF') && p.goalsConceeded >= 2) {
    total -= Math.floor(p.goalsConceeded / 2);
  }
  if (position === 'GK' && p.saves >= SCORING.SAVES_PER_POINT) {
    total += Math.floor(p.saves / SCORING.SAVES_PER_POINT);
  }
  if (p.penaltiesSaved > 0) total += SCORING.PENALTY_SAVE * p.penaltiesSaved;
  if (p.penaltiesMissed > 0) total += SCORING.PENALTY_MISS * p.penaltiesMissed;
  if (p.yellowCards > 0) total += SCORING.YELLOW_CARD * p.yellowCards;
  if (p.redCards > 0) total += SCORING.RED_CARD * p.redCards;
  if (p.ownGoals > 0) total += SCORING.OWN_GOAL * p.ownGoals;

  const dcThreshold = (position === 'GK' || position === 'DEF')
    ? SCORING.DC_THRESHOLD_DEF : SCORING.DC_THRESHOLD_MID_FWD;
  if (p.defensiveActions >= dcThreshold) total += SCORING.DC_BONUS;

  total += p.bonusPoints;
  return total;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'context') {
      // Return: all matches (so admin can pick one), and the admin's
      // own squad players (so the seed UI can suggest who's playing).
      const matches = await prisma.match.findMany({
        include: {
          homeNation: { select: { code: true, name: true } },
          awayNation: { select: { code: true, name: true } },
          stage: { select: { stageId: true, name: true } },
          performances: { select: { id: true, isLive: true } },
        },
        orderBy: { kickoffTime: 'asc' },
      });

      const adminTeam = await prisma.team.findUnique({
        where: { userId: admin.userId },
        include: {
          squadPlayers: {
            include: { player: { include: { nation: true } } },
          },
        },
      });

      // All players (for any nation, not just the admin's squad — the
      // sim should accept any player for the two nations playing the
      // selected match).
      const allPlayers = await prisma.player.findMany({
        include: { nation: { select: { id: true, code: true, name: true } } },
        orderBy: { displayName: 'asc' },
      });

      // Stages + nations are surfaced so the simulator UI can render an
      // inline "Create test match" form when the DB has zero matches
      // (or when the admin wants a quick throw-away fixture for testing
      // without bouncing to /admin/fixtures).
      const [stages, nations] = await Promise.all([
        prisma.stage.findMany({
          orderBy: { order: 'asc' },
          select: { id: true, stageId: true, name: true, isActive: true },
        }),
        prisma.nation.findMany({
          orderBy: { name: 'asc' },
          select: { id: true, code: true, name: true },
        }),
      ]);

      return NextResponse.json({
        matches: matches.map((m) => ({
          id: m.id,
          stageId: m.stage.stageId,
          stageName: m.stage.name,
          homeNation: m.homeNation,
          awayNation: m.awayNation,
          kickoffTime: m.kickoffTime,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          // Surfaced so the simulator UI can seed its minute slider
          // from the current DB value when admin re-loads the page
          // mid-match.
          currentMinute: m.currentMinute,
          isStarted: m.isStarted,
          isFinished: m.isFinished,
          performanceCount: m.performances.length,
          liveCount: m.performances.filter((p) => p.isLive).length,
        })),
        adminSquad: adminTeam?.squadPlayers.map((sp) => ({
          playerId: sp.playerId,
          displayName: sp.player.displayName,
          position: sp.player.position,
          nationCode: sp.player.nation?.code,
          isStarting: sp.isStarting,
          isCaptain: sp.isCaptain,
          points: sp.points,
        })) ?? [],
        allPlayers: allPlayers.map((p) => ({
          id: p.id,
          displayName: p.displayName,
          position: p.position,
          nationCode: p.nation?.code ?? null,
          nationName: p.nation?.name ?? null,
        })),
        stages,
        nations,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Match Simulator GET] Error:', error);
    return NextResponse.json({ error: 'Failed to load context' }, { status: 500 });
  }
}

/**
 * Create a test Match between two nations in a given stage. This is the
 * simulator's "self-service" path so admins don't need to bounce out to
 * /admin/fixtures to seed a fixture before running the live → FT loop.
 *
 * Body shape:
 *   { action: 'create-match',
 *     stageId: string,        // Prisma Stage.id (NOT Stage.stageId)
 *     homeNationId: string,
 *     awayNationId: string,
 *     kickoffTime?: string }  // ISO; defaults to "now" so the cron
 *                              // would-treat it as recently-started
 *
 * Returns the created Match with stage + nations included so the UI can
 * auto-select it on the next context refresh.
 */
async function handleCreateMatch(body: Record<string, unknown>) {
  const stageId = typeof body.stageId === 'string' ? body.stageId : null;
  const homeNationId = typeof body.homeNationId === 'string' ? body.homeNationId : null;
  const awayNationId = typeof body.awayNationId === 'string' ? body.awayNationId : null;
  const kickoffTimeRaw = typeof body.kickoffTime === 'string' ? body.kickoffTime : null;

  if (!stageId || !homeNationId || !awayNationId) {
    return NextResponse.json(
      { error: 'stageId, homeNationId, and awayNationId are required' },
      { status: 400 },
    );
  }
  if (homeNationId === awayNationId) {
    return NextResponse.json(
      { error: 'Home and away nations must be different' },
      { status: 400 },
    );
  }

  // Validate stage + nations exist. Cheap and protects against typos
  // from the client (much friendlier error than a Prisma FK violation).
  const [stage, homeNation, awayNation] = await Promise.all([
    prisma.stage.findUnique({ where: { id: stageId } }),
    prisma.nation.findUnique({ where: { id: homeNationId } }),
    prisma.nation.findUnique({ where: { id: awayNationId } }),
  ]);
  if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
  if (!homeNation) return NextResponse.json({ error: 'Home nation not found' }, { status: 404 });
  if (!awayNation) return NextResponse.json({ error: 'Away nation not found' }, { status: 404 });

  const kickoffTime = kickoffTimeRaw ? new Date(kickoffTimeRaw) : new Date();
  if (Number.isNaN(kickoffTime.getTime())) {
    return NextResponse.json({ error: 'Invalid kickoffTime' }, { status: 400 });
  }

  const match = await prisma.match.create({
    data: {
      stageId,
      homeNationId,
      awayNationId,
      kickoffTime,
    },
    include: {
      stage: { select: { stageId: true, name: true } },
      homeNation: { select: { code: true, name: true } },
      awayNation: { select: { code: true, name: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: null,
      action: 'SIMULATOR_MATCH_CREATED',
      details: JSON.stringify({
        matchId: match.id,
        stage: match.stage.stageId,
        home: match.homeNation.code,
        away: match.awayNation.code,
        kickoffTime: kickoffTime.toISOString(),
      }),
    },
  });

  return NextResponse.json({
    ok: true,
    action: 'create-match',
    match: {
      id: match.id,
      stageId: match.stage.stageId,
      stageName: match.stage.name,
      homeNation: match.homeNation,
      awayNation: match.awayNation,
      kickoffTime: match.kickoffTime,
      isStarted: false,
      isFinished: false,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const { action } = body as { action: string };

    // The `create-match` action is the only one that doesn't operate on
    // an existing matchId — it CREATES the match. Handle it first so the
    // matchId-required guard below doesn't reject the call.
    if (action === 'create-match') {
      return await handleCreateMatch(body);
    }

    const { matchId } = body as { matchId: string };
    if (!matchId) {
      return NextResponse.json({ error: 'matchId is required' }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { stage: { select: { stageId: true } } },
    });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    if (action === 'start') {
      // Flip the match to live and seed PlayerPerformance rows for the
      // given players. Existing rows for this match are upserted.
      const seeds = (body.seeds as PerfStatsInput[]) ?? [];
      const homeScore = (body.homeScore as number | undefined) ?? 0;
      const awayScore = (body.awayScore as number | undefined) ?? 0;
      const currentMinute = (body.currentMinute as number | undefined) ?? 1;

      await prisma.match.update({
        where: { id: matchId },
        data: {
          isStarted: true,
          isFinished: false,
          homeScore,
          awayScore,
          currentMinute,
          lastUpdated: new Date(),
        },
      });

      let upserted = 0;
      for (const seed of seeds) {
        const player = await prisma.player.findUnique({
          where: { id: seed.playerId },
        });
        if (!player) continue;

        const stats: Required<PerfStatsInput> = {
          playerId: seed.playerId,
          minutesPlayed: seed.minutesPlayed ?? 0,
          goals: seed.goals ?? 0,
          assists: seed.assists ?? 0,
          cleanSheet: seed.cleanSheet ?? false,
          goalsConceeded: seed.goalsConceeded ?? 0,
          saves: seed.saves ?? 0,
          penaltiesSaved: seed.penaltiesSaved ?? 0,
          penaltiesMissed: seed.penaltiesMissed ?? 0,
          yellowCards: seed.yellowCards ?? 0,
          redCards: seed.redCards ?? 0,
          ownGoals: seed.ownGoals ?? 0,
          defensiveActions: seed.defensiveActions ?? 0,
          bonusPoints: seed.bonusPoints ?? 0,
        };
        const totalPoints = computeTotal(stats, player.position as Position, match.stage.stageId);

        await prisma.playerPerformance.upsert({
          where: { playerId_matchId: { playerId: seed.playerId, matchId } },
          create: {
            playerId: seed.playerId,
            matchId,
            minutesPlayed: stats.minutesPlayed,
            goals: stats.goals,
            assists: stats.assists,
            cleanSheet: stats.cleanSheet,
            goalsConceeded: stats.goalsConceeded,
            saves: stats.saves,
            penaltiesSaved: stats.penaltiesSaved,
            penaltiesMissed: stats.penaltiesMissed,
            yellowCards: stats.yellowCards,
            redCards: stats.redCards,
            ownGoals: stats.ownGoals,
            defensiveActions: stats.defensiveActions,
            bonusPoints: stats.bonusPoints,
            totalPoints,
            isLive: true,
            lastUpdated: new Date(),
          },
          update: {
            minutesPlayed: stats.minutesPlayed,
            goals: stats.goals,
            assists: stats.assists,
            cleanSheet: stats.cleanSheet,
            goalsConceeded: stats.goalsConceeded,
            saves: stats.saves,
            penaltiesSaved: stats.penaltiesSaved,
            penaltiesMissed: stats.penaltiesMissed,
            yellowCards: stats.yellowCards,
            redCards: stats.redCards,
            ownGoals: stats.ownGoals,
            defensiveActions: stats.defensiveActions,
            bonusPoints: stats.bonusPoints,
            totalPoints,
            isLive: true,
            lastUpdated: new Date(),
          },
        });
        upserted += 1;
      }

      return NextResponse.json({ ok: true, action: 'start', upserted });
    }

    if (action === 'tick') {
      // Apply deltas to existing perf rows (additive). Useful for
      // simulating "a goal happened" without re-typing everything.
      //
      // PERF NOTE: this used to be a 20-iteration for-loop with two
      // awaits each (read + update), which on Neon's pooled connection
      // ran ~2 seconds per tick. That made auto-play feel sluggish.
      // We now do a single batch read, then a single transactional
      // batch write — turning 40 round-trips into 2.
      const deltas = (body.deltas as PerfStatsInput[]) ?? [];
      const homeScore = body.homeScore as number | undefined;
      const awayScore = body.awayScore as number | undefined;
      const currentMinute = body.currentMinute as number | undefined;

      if (homeScore !== undefined || awayScore !== undefined || currentMinute !== undefined) {
        await prisma.match.update({
          where: { id: matchId },
          data: {
            ...(homeScore !== undefined ? { homeScore } : {}),
            ...(awayScore !== undefined ? { awayScore } : {}),
            ...(currentMinute !== undefined ? { currentMinute } : {}),
            lastUpdated: new Date(),
          },
        });
      }

      if (deltas.length === 0) {
        return NextResponse.json({ ok: true, action: 'tick', updated: 0 });
      }

      // Batch-load every perf row + every player in one shot. Players
      // are needed for two reasons:
      //   1. existing rows: to read .position for the points formula
      //   2. missing rows: to know .position when we auto-create one
      // Auto-create means: if a delta arrives for a player who isn't
      // in the perf table yet (e.g. admin added them to the lineup
      // mid-match), we CREATE a row instead of silently skipping it.
      // Previously the skip caused "player stuck at 13' while everyone
      // else is at 50'" drift bugs.
      const deltaIds = deltas.map((d) => d.playerId);
      const [existingPerfs, players] = await Promise.all([
        prisma.playerPerformance.findMany({
          where: { matchId, playerId: { in: deltaIds } },
        }),
        prisma.player.findMany({
          where: { id: { in: deltaIds } },
          select: { id: true, position: true },
        }),
      ]);
      const perfById = new Map(existingPerfs.map((p) => [p.playerId, p]));
      const playerById = new Map(players.map((p) => [p.id, p]));

      const ops: Prisma.PrismaPromise<unknown>[] = [];
      let updated = 0;
      let created = 0;
      for (const delta of deltas) {
        const player = playerById.get(delta.playerId);
        if (!player) continue; // unknown player id — skip
        const existing = perfById.get(delta.playerId);
        if (existing) {
          // Additive merge against the current row.
          const merged: Required<PerfStatsInput> = {
            playerId: delta.playerId,
            minutesPlayed: existing.minutesPlayed + (delta.minutesPlayed ?? 0),
            goals: existing.goals + (delta.goals ?? 0),
            assists: existing.assists + (delta.assists ?? 0),
            cleanSheet: delta.cleanSheet ?? existing.cleanSheet,
            goalsConceeded: existing.goalsConceeded + (delta.goalsConceeded ?? 0),
            saves: existing.saves + (delta.saves ?? 0),
            penaltiesSaved: existing.penaltiesSaved + (delta.penaltiesSaved ?? 0),
            penaltiesMissed: existing.penaltiesMissed + (delta.penaltiesMissed ?? 0),
            yellowCards: existing.yellowCards + (delta.yellowCards ?? 0),
            redCards: existing.redCards + (delta.redCards ?? 0),
            ownGoals: existing.ownGoals + (delta.ownGoals ?? 0),
            defensiveActions: existing.defensiveActions + (delta.defensiveActions ?? 0),
            bonusPoints: existing.bonusPoints + (delta.bonusPoints ?? 0),
          };
          const totalPoints = computeTotal(merged, player.position as Position, match.stage.stageId);
          ops.push(
            prisma.playerPerformance.update({
              where: { id: existing.id },
              data: {
                minutesPlayed: merged.minutesPlayed,
                goals: merged.goals,
                assists: merged.assists,
                cleanSheet: merged.cleanSheet,
                goalsConceeded: merged.goalsConceeded,
                saves: merged.saves,
                penaltiesSaved: merged.penaltiesSaved,
                penaltiesMissed: merged.penaltiesMissed,
                yellowCards: merged.yellowCards,
                redCards: merged.redCards,
                ownGoals: merged.ownGoals,
                defensiveActions: merged.defensiveActions,
                bonusPoints: merged.bonusPoints,
                totalPoints,
                lastUpdated: new Date(),
              },
            }),
          );
          updated += 1;
        } else {
          // No row yet — create one starting from zeros + the delta.
          // We also seed minutesPlayed up to the match's current
          // minute (if known) so the new player isn't sitting at 0'
          // while everyone else is at 50'. The delta's minutesPlayed
          // is added on top, which matches the additive semantics
          // of `tick` for existing rows.
          const baseMinutes = currentMinute ?? 0;
          const stats: Required<PerfStatsInput> = {
            playerId: delta.playerId,
            minutesPlayed: baseMinutes + (delta.minutesPlayed ?? 0),
            goals: delta.goals ?? 0,
            assists: delta.assists ?? 0,
            cleanSheet: delta.cleanSheet ?? false,
            goalsConceeded: delta.goalsConceeded ?? 0,
            saves: delta.saves ?? 0,
            penaltiesSaved: delta.penaltiesSaved ?? 0,
            penaltiesMissed: delta.penaltiesMissed ?? 0,
            yellowCards: delta.yellowCards ?? 0,
            redCards: delta.redCards ?? 0,
            ownGoals: delta.ownGoals ?? 0,
            defensiveActions: delta.defensiveActions ?? 0,
            bonusPoints: delta.bonusPoints ?? 0,
          };
          const totalPoints = computeTotal(stats, player.position as Position, match.stage.stageId);
          ops.push(
            prisma.playerPerformance.create({
              data: {
                playerId: delta.playerId,
                matchId,
                minutesPlayed: stats.minutesPlayed,
                goals: stats.goals,
                assists: stats.assists,
                cleanSheet: stats.cleanSheet,
                goalsConceeded: stats.goalsConceeded,
                saves: stats.saves,
                penaltiesSaved: stats.penaltiesSaved,
                penaltiesMissed: stats.penaltiesMissed,
                yellowCards: stats.yellowCards,
                redCards: stats.redCards,
                ownGoals: stats.ownGoals,
                defensiveActions: stats.defensiveActions,
                bonusPoints: stats.bonusPoints,
                totalPoints,
                isLive: true,
                lastUpdated: new Date(),
              },
            }),
          );
          created += 1;
        }
      }

      // One transaction — Prisma runs these in parallel internally.
      // No `timeout` option here because the array form of
      // `$transaction` doesn't accept it (only the function form
      // does). 20 parallel updates land in <500ms on Neon's pooler
      // so the default 5s window is plenty.
      if (ops.length > 0) {
        await prisma.$transaction(ops);
      }
      return NextResponse.json({ ok: true, action: 'tick', updated, created });
    }

    if (action === 'set-stats') {
      // Wholesale replace stats for given players. Unlike `tick` (which is
      // additive), this is destination-mode: every field in the payload
      // replaces the existing perf-row value verbatim. Used by the in-page
      // "Edit stats" UI so admins can correct typos / overshoot without
      // having to compute deltas in their head.
      const stats = (body.stats as PerfStatsInput[]) ?? [];
      let updated = 0;
      for (const s of stats) {
        const existing = await prisma.playerPerformance.findUnique({
          where: { playerId_matchId: { playerId: s.playerId, matchId } },
          include: { player: true },
        });
        if (!existing) continue;

        const merged: Required<PerfStatsInput> = {
          playerId: s.playerId,
          minutesPlayed: s.minutesPlayed ?? existing.minutesPlayed,
          goals: s.goals ?? existing.goals,
          assists: s.assists ?? existing.assists,
          cleanSheet: s.cleanSheet ?? existing.cleanSheet,
          goalsConceeded: s.goalsConceeded ?? existing.goalsConceeded,
          saves: s.saves ?? existing.saves,
          penaltiesSaved: s.penaltiesSaved ?? existing.penaltiesSaved,
          penaltiesMissed: s.penaltiesMissed ?? existing.penaltiesMissed,
          yellowCards: s.yellowCards ?? existing.yellowCards,
          redCards: s.redCards ?? existing.redCards,
          ownGoals: s.ownGoals ?? existing.ownGoals,
          defensiveActions: s.defensiveActions ?? existing.defensiveActions,
          bonusPoints: s.bonusPoints ?? existing.bonusPoints,
        };
        const totalPoints = computeTotal(
          merged,
          existing.player.position as Position,
          match.stage.stageId,
        );
        await prisma.playerPerformance.update({
          where: { id: existing.id },
          data: {
            minutesPlayed: merged.minutesPlayed,
            goals: merged.goals,
            assists: merged.assists,
            cleanSheet: merged.cleanSheet,
            goalsConceeded: merged.goalsConceeded,
            saves: merged.saves,
            penaltiesSaved: merged.penaltiesSaved,
            penaltiesMissed: merged.penaltiesMissed,
            yellowCards: merged.yellowCards,
            redCards: merged.redCards,
            ownGoals: merged.ownGoals,
            defensiveActions: merged.defensiveActions,
            bonusPoints: merged.bonusPoints,
            totalPoints,
            lastUpdated: new Date(),
          },
        });
        updated += 1;
      }
      return NextResponse.json({ ok: true, action: 'set-stats', updated });
    }

    if (action === 'set-clock') {
      // Set match clock + (optionally) auto-bump every existing perf row's
      // `minutesPlayed` to match. The auto-bump only RAISES — players who
      // already have a higher value (e.g. were subbed off earlier so are
      // capped at minute X) stay where they are. This makes "Jump to FT"
      // a one-click action that sets everyone to 90 without trampling
      // realistic substitutions.
      const currentMinute = body.currentMinute as number | undefined;
      const homeScore = body.homeScore as number | undefined;
      const awayScore = body.awayScore as number | undefined;
      const syncMinutes = body.syncMinutesToOnPitch as boolean | undefined;

      if (currentMinute === undefined && homeScore === undefined && awayScore === undefined) {
        return NextResponse.json(
          { error: 'set-clock requires at least one of currentMinute / homeScore / awayScore' },
          { status: 400 },
        );
      }

      await prisma.match.update({
        where: { id: matchId },
        data: {
          ...(currentMinute !== undefined ? { currentMinute } : {}),
          ...(homeScore !== undefined ? { homeScore } : {}),
          ...(awayScore !== undefined ? { awayScore } : {}),
          lastUpdated: new Date(),
        },
      });

      let bumped = 0;
      if (syncMinutes && currentMinute !== undefined) {
        // Bump on-pitch players' minutesPlayed UP to currentMinute. We
        // can't just `updateMany` with the raw value because perf rows
        // may already be higher (e.g. simulating a 95-minute player).
        // So we read, compare, batch-write in a single transaction.
        const perfs = await prisma.playerPerformance.findMany({
          where: { matchId },
          include: { player: { select: { position: true } } },
        });
        const ops: Prisma.PrismaPromise<unknown>[] = [];
        for (const perf of perfs) {
          if (perf.minutesPlayed >= currentMinute) continue;
          const merged: Required<PerfStatsInput> = {
            playerId: perf.playerId,
            minutesPlayed: currentMinute,
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
            defensiveActions: perf.defensiveActions,
            bonusPoints: perf.bonusPoints,
          };
          const totalPoints = computeTotal(
            merged,
            perf.player.position as Position,
            match.stage.stageId,
          );
          ops.push(
            prisma.playerPerformance.update({
              where: { id: perf.id },
              data: {
                minutesPlayed: currentMinute,
                totalPoints,
                lastUpdated: new Date(),
              },
            }),
          );
          bumped += 1;
        }
        if (ops.length > 0) {
          await prisma.$transaction(ops);
        }
      }
      return NextResponse.json({ ok: true, action: 'set-clock', bumped });
    }

    if (action === 'finish') {
      // Flip to FT, mark all perf rows non-live, then run the canonical
      // updateSquadPoints flow, then attempt stage advancement (same
      // pipeline as the live cron). Surfacing the advance result helps
      // the admin UI explain "the stage just rolled forward".
      await prisma.playerPerformance.updateMany({
        where: { matchId },
        data: { isLive: false },
      });
      await prisma.match.update({
        where: { id: matchId },
        data: { isStarted: true, isFinished: true, lastUpdated: new Date() },
      });
      await updateSquadPoints(matchId);

      let stageAdvance = null;
      try {
        stageAdvance = await maybeAdvanceStage();
      } catch (err) {
        console.error('[Match Simulator] maybeAdvanceStage failed:', err);
      }
      return NextResponse.json({ ok: true, action: 'finish', stageAdvance });
    }

    if (action === 'reset') {
      // Wipe perf rows AND revert match flags so the simulator can re-seed.
      // Intended workflow: start → tick → tick → finish → reset → start fresh.
      //
      // If the match was previously Finished, we run the inverse of
      // updateSquadPoints FIRST (before deleting perf rows — otherwise
      // we'd lose the data we need to subtract). This makes Reset
      // round-trip clean: finishing and then resetting leaves the DB
      // in the same `SquadPlayer.points` + `Team.totalPoints` state as
      // before the Finish ever happened.
      let rolledBack = false;
      if (match.isFinished) {
        await rollbackSquadPoints(matchId);
        rolledBack = true;
      }

      await prisma.playerPerformance.deleteMany({ where: { matchId } });
      await prisma.match.update({
        where: { id: matchId },
        data: {
          isStarted: false,
          isFinished: false,
          homeScore: null,
          awayScore: null,
          currentMinute: null,
          lastUpdated: new Date(),
        },
      });
      return NextResponse.json({ ok: true, action: 'reset', rolledBack });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Match Simulator POST] Error:', error);
    return NextResponse.json({ error: 'Simulator action failed' }, { status: 500 });
  }
}
