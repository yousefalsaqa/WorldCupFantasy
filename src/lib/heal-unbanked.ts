// ============================================
// HEAL UNBANKED FINISHED MATCHES — safety net for the "finished but never
// banked" failure.
//
// The live cron sets a match's `isFinished=true` BEFORE it fetches player
// stats and banks. The flip-to-not-live + bank step lives at the very end of
// the handler, inside `if (isFinished)`:
//
//     await prisma.playerPerformance.updateMany({ ..., data: { isLive: false } });
//     await updateSquadPoints(match.id);
//
// If the stats fetch (or an upsert) throws AFTER `isFinished=true` was
// committed — classically API-Football's post-FT publishing lag — that block
// never runs, and the cron's live query (`isStarted && !isFinished`) will never
// select the match again. Result: perf rows stuck `isLive=true` and the points
// never banked. (Seen live 2026-06-27: GR3 NOR-FRA sat unbanked for ~4h with
// all 32 rows still live.)
//
// `rescorePendingFinishedMatches` does NOT catch this: it skips any match whose
// stored minutes already look final (>= 85'), which a normally-played 90' game
// always does.
//
// INVARIANT this relies on: in every code path that banks (the FT block and
// the rescore sweep), `isLive` is flipped to false in the SAME step as the
// bank. So a finished match that still has ANY `isLive=true` perf row has NOT
// been banked — we can therefore bank it ONCE (no rollback) safely.
//
// This sweep re-pulls such matches and, once their snapshot looks final,
// upserts the final perfs (`isLive=false`) and banks once. Idempotent: it only
// ever targets matches that still carry live rows, so a banked match is never
// touched. Best-effort and bounded to a recent window.
// ============================================
import { prisma } from '@/lib/db';
import { apiFootball } from '@/lib/api-football';
import { LiveScoringCalculator } from '@/lib/live-scoring';
import { updateSquadPoints } from '@/lib/squad-points';

// Same finality bar as the rescore sweep: a real full-time snapshot has
// multiple players at/near full duration. Don't bank a still-lagging partial.
const FINALITY_MIN_MINUTES = 85;

// Bound the candidate set to the current matchday so we never re-pull an
// ancient genuinely-odd match forever.
const RECENT_WINDOW_HOURS = 18;

export interface UnbankedHealOutcome {
  matchId: string;
  fixtureId: number;
  label: string;
  status: 'banked' | 'still-pending' | 'error';
  liveRows: number;
  freshMaxMinutes?: number;
  error?: string;
}

export async function healUnbankedFinishedMatches(): Promise<UnbankedHealOutcome[]> {
  const since = new Date(Date.now() - RECENT_WINDOW_HOURS * 3600 * 1000);

  // Matches that are FINISHED but still carry live perf rows = never banked.
  // (Genuinely-live matches are isFinished=false and excluded below.)
  const liveRowMatchIds = await prisma.playerPerformance.findMany({
    where: { isLive: true },
    select: { matchId: true },
    distinct: ['matchId'],
  });
  const ids = liveRowMatchIds.map((r) => r.matchId);
  if (ids.length === 0) return [];

  const candidates = await prisma.match.findMany({
    where: {
      id: { in: ids },
      isFinished: true,
      apiFootballId: { not: null },
      kickoffTime: { gte: since },
    },
    include: { homeNation: true, awayNation: true, stage: true },
    orderBy: { kickoffTime: 'asc' },
  });

  const outcomes: UnbankedHealOutcome[] = [];

  for (const match of candidates) {
    const label = `${match.homeNation.code}-${match.awayNation.code}`;
    const fixtureId = match.apiFootballId!;
    try {
      const liveRows = await prisma.playerPerformance.count({
        where: { matchId: match.id, isLive: true },
      });

      // Re-pull and only bank once the snapshot looks final — banking a
      // still-lagging partial would deny clean sheets / zero out subs.
      const [fixture, teamsData, events] = await Promise.all([
        apiFootball.getFixtureById(fixtureId),
        apiFootball.getFixturePlayerStats(fixtureId),
        apiFootball.getFixtureEvents(fixtureId),
      ]);
      if (!fixture) {
        outcomes.push({ matchId: match.id, fixtureId, label, status: 'error', liveRows, error: 'fixture not found' });
        continue;
      }

      // Score at fantasy (DB) position, mirroring the live route.
      const apiPlayerIds = teamsData.flatMap((t) => t.players.map((p) => p.player.id));
      const dbPlayers = await prisma.player.findMany({
        where: { apiFootballId: { in: apiPlayerIds } },
        select: { id: true, apiFootballId: true, position: true },
      });
      const overrides = new Map<number, 'GK' | 'DEF' | 'MID' | 'FWD'>();
      const byApiId = new Map<number, (typeof dbPlayers)[number]>();
      for (const p of dbPlayers) {
        if (p.apiFootballId != null) {
          overrides.set(p.apiFootballId, p.position as 'GK' | 'DEF' | 'MID' | 'FWD');
          byApiId.set(p.apiFootballId, p);
        }
      }

      const calc = new LiveScoringCalculator(match.stage.stageId);
      const perfs = calc.processFixtureData(
        teamsData,
        events,
        fixture.goals.home || 0,
        fixture.goals.away || 0,
        match.homeNation.apiFootballId!,
        match.awayNation.apiFootballId!,
        overrides,
      );

      const freshMaxMinutes = perfs.reduce((m, p) => Math.max(m, p.minutesPlayed), 0);
      if (freshMaxMinutes < FINALITY_MIN_MINUTES) {
        // Still lagging on the API side — leave it stuck and retry next run.
        outcomes.push({ matchId: match.id, fixtureId, label, status: 'still-pending', liveRows, freshMaxMinutes });
        continue;
      }

      // Final snapshot. Upsert the final perfs (isLive=false) and bank ONCE.
      // No rollback: the isLive=true invariant proves this match was never
      // banked, so updateSquadPoints' increments are correct first-time.
      for (const np of perfs) {
        const p = byApiId.get(np.apiPlayerId);
        if (!p) continue;
        const data = {
          minutesPlayed: np.minutesPlayed,
          goals: np.goals,
          assists: np.assists,
          cleanSheet: np.cleanSheet,
          goalsConceeded: np.goalsConceeded,
          saves: np.saves,
          penaltiesSaved: np.penaltiesSaved,
          penaltiesMissed: np.penaltiesMissed,
          yellowCards: np.yellowCards,
          redCards: np.redCards,
          ownGoals: np.ownGoals,
          defensiveActions: np.defensiveActions ?? 0,
          startedMatch: np.startedMatch,
          totalPoints: np.totalPoints,
          isLive: false,
          lastUpdated: new Date(),
        };
        await prisma.playerPerformance.upsert({
          where: { playerId_matchId: { playerId: p.id, matchId: match.id } },
          create: { playerId: p.id, matchId: match.id, ...data },
          update: data,
        });
      }
      // Belt-and-suspenders: clear any live rows for players the API stats
      // didn't include (e.g. dropped from the squad feed) so none linger.
      await prisma.playerPerformance.updateMany({
        where: { matchId: match.id, isLive: true },
        data: { isLive: false },
      });
      await updateSquadPoints(match.id);

      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'MATCH_HEALED_UNBANKED',
          details: JSON.stringify({
            matchId: match.id,
            fixtureId,
            label,
            reason: 'finished match had live perf rows + was never banked (FT handler threw after isFinished commit)',
            liveRows,
            freshMaxMinutes,
          }),
        },
      });

      outcomes.push({ matchId: match.id, fixtureId, label, status: 'banked', liveRows, freshMaxMinutes });
    } catch (error) {
      outcomes.push({
        matchId: match.id,
        fixtureId,
        label,
        status: 'error',
        liveRows: -1,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  return outcomes;
}
