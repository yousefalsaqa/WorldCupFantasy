// ============================================
// DELAYED RE-SCORE — self-healing for API-Football's lagging final stats.
//
// API-Football marks a fixture FT on the scoreline/events feed well before
// its per-player `games.minutes` snapshot is finalized ("minutes/hours
// following the match, up to 48h" per their docs). Our live cron banks the
// instant a match flips FT, so a match can bank against a half-finished
// snapshot (e.g. CIV-ECU 2026-06-14: every starter frozen at 50' → clean
// sheets denied at the 60' gate, subs scoring 0).
//
// This sweep re-pulls recently-finished matches whose stored minutes still
// look NON-final and rebanks them ONLY once the fresh snapshot looks final.
// It is idempotent and costs zero API calls once a match has settled.
// ============================================
import { prisma } from '@/lib/db';
import { apiFootball } from '@/lib/api-football';
import { LiveScoringCalculator } from '@/lib/live-scoring';
import { updateSquadPoints, rollbackSquadPoints } from '@/lib/squad-points';

// A finished 90'+ match's final snapshot has multiple players at/near the
// full duration. A partial/half-time snapshot maxes out around 45-50. So if
// the highest minute we can see is below this, the feed hasn't finalized.
const FINALITY_MIN_MINUTES = 85;

// Only look at matches that finished recently — bounds the candidate set to
// the current matchday and stops us re-pulling a genuinely-odd match forever.
const RECENT_WINDOW_HOURS = 18;

export interface RescoreOutcome {
  matchId: string;
  fixtureId: number;
  label: string;
  status: 'rebanked' | 'still-pending' | 'already-final' | 'error';
  storedMaxMinutes: number;
  freshMaxMinutes?: number;
  changedPlayers?: number;
  netPointsDelta?: number;
  error?: string;
}

export async function rescorePendingFinishedMatches(): Promise<RescoreOutcome[]> {
  const since = new Date(Date.now() - RECENT_WINDOW_HOURS * 3600 * 1000);
  const candidates = await prisma.match.findMany({
    where: {
      isFinished: true,
      apiFootballId: { not: null },
      kickoffTime: { gte: since },
    },
    include: { homeNation: true, awayNation: true, stage: true },
    orderBy: { kickoffTime: 'asc' },
  });

  const outcomes: RescoreOutcome[] = [];

  for (const match of candidates) {
    const label = `${match.homeNation.code}-${match.awayNation.code}`;
    const fixtureId = match.apiFootballId!;
    try {
      // What we currently have banked. If a starter already reads ~full
      // duration, the snapshot we banked was final — nothing to do.
      const storedAgg = await prisma.playerPerformance.aggregate({
        where: { matchId: match.id },
        _max: { minutesPlayed: true },
      });
      const storedMaxMinutes = storedAgg._max.minutesPlayed ?? 0;
      if (storedMaxMinutes >= FINALITY_MIN_MINUTES) {
        outcomes.push({ matchId: match.id, fixtureId, label, status: 'already-final', storedMaxMinutes });
        continue;
      }

      // Stored stats look non-final — re-pull and see if the API has settled.
      const [fixture, teamsData, events] = await Promise.all([
        apiFootball.getFixtureById(fixtureId),
        apiFootball.getFixturePlayerStats(fixtureId),
        apiFootball.getFixtureEvents(fixtureId),
      ]);
      if (!fixture) {
        outcomes.push({ matchId: match.id, fixtureId, label, status: 'error', storedMaxMinutes, error: 'fixture not found' });
        continue;
      }

      // Score at fantasy (DB) position, mirroring the live route.
      const apiPlayerIds = teamsData.flatMap((t) => t.players.map((p) => p.player.id));
      const dbPlayers = await prisma.player.findMany({
        where: { apiFootballId: { in: apiPlayerIds } },
        select: { id: true, apiFootballId: true, position: true, displayName: true },
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

      // Still not final on the API side — leave the banked numbers alone and
      // try again next run. Crucially we DON'T rebank a partial snapshot.
      if (freshMaxMinutes < FINALITY_MIN_MINUTES) {
        outcomes.push({ matchId: match.id, fixtureId, label, status: 'still-pending', storedMaxMinutes, freshMaxMinutes });
        continue;
      }

      // Snapshot is final AND differs from what we banked — recompute the
      // blast radius for logging, then rollback + rebank.
      const stored = await prisma.playerPerformance.findMany({
        where: { matchId: match.id },
        include: { player: { select: { apiFootballId: true } } },
      });
      const storedByApi = new Map<number, (typeof stored)[number]>();
      for (const s of stored) if (s.player.apiFootballId != null) storedByApi.set(s.player.apiFootballId, s);

      let changedPlayers = 0;
      let netPointsDelta = 0;
      for (const np of perfs) {
        if (!byApiId.has(np.apiPlayerId)) continue;
        const old = storedByApi.get(np.apiPlayerId);
        const oldTot = old?.totalPoints ?? 0;
        if (oldTot !== np.totalPoints || (old?.cleanSheet ?? false) !== np.cleanSheet) {
          changedPlayers++;
          netPointsDelta += np.totalPoints - oldTot;
        }
      }

      await rollbackSquadPoints(match.id);
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
      await updateSquadPoints(match.id);

      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'MATCH_RESCORED',
          details: JSON.stringify({
            matchId: match.id,
            fixtureId,
            label,
            reason: 'api-football final stats settled after FT',
            storedMaxMinutes,
            freshMaxMinutes,
            changedPlayers,
            netPointsDelta,
          }),
        },
      });

      outcomes.push({
        matchId: match.id,
        fixtureId,
        label,
        status: 'rebanked',
        storedMaxMinutes,
        freshMaxMinutes,
        changedPlayers,
        netPointsDelta,
      });
    } catch (error) {
      outcomes.push({
        matchId: match.id,
        fixtureId,
        label,
        status: 'error',
        storedMaxMinutes: -1,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  return outcomes;
}
