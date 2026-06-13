// Re-score every finished match under current scoring logic:
//   - own-goal attribution fix (event.team = beneficiary)
//   - score by fantasy (DB) position, not API per-match position
//
// DRY RUN by default (no writes) — prints the per-player point deltas so the
// blast radius is auditable. Pass --apply to actually rollback/recompute/rebank.
//
//   npx tsx scripts/backfill-rescore.ts            # dry run
//   npx tsx scripts/backfill-rescore.ts --apply    # mutate + rebank
import fs from 'fs'; import path from 'path';
for (const raw of fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8').split('\n')) {
  const l = raw.trim(); if (!l || l.startsWith('#')) continue; const i = l.indexOf('='); if (i < 0) continue;
  const k = l.slice(0, i).trim(); let v = l.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(k in process.env)) process.env[k] = v;
}

const APPLY = process.argv.includes('--apply');

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const { apiFootball } = await import('../src/lib/api-football');
  const { LiveScoringCalculator } = await import('../src/lib/live-scoring');
  const { updateSquadPoints, rollbackSquadPoints } = await import('../src/lib/squad-points');
  const prisma = new PrismaClient();

  console.log(APPLY ? '*** APPLY MODE — will mutate DB ***\n' : '--- DRY RUN (no writes) ---\n');

  const matches = await prisma.match.findMany({
    where: { isFinished: true, apiFootballId: { not: null } },
    include: { homeNation: true, awayNation: true, stage: true },
    orderBy: { kickoffTime: 'asc' },
  });

  for (const match of matches) {
    const label = `${match.homeNation.code}-${match.awayNation.code}`;
    const fixtureId = match.apiFootballId!;
    const [fixture, teamsData, events] = await Promise.all([
      apiFootball.getFixtureById(fixtureId),
      apiFootball.getFixturePlayerStats(fixtureId),
      apiFootball.getFixtureEvents(fixtureId),
    ]);
    if (!fixture) { console.log(`${label}: SKIP (no fixture)`); continue; }

    const apiPlayerIds = teamsData.flatMap((t) => t.players.map((p) => p.player.id));
    const dbPlayers = await prisma.player.findMany({
      where: { apiFootballId: { in: apiPlayerIds } },
      select: { id: true, apiFootballId: true, position: true, displayName: true },
    });
    const overrides = new Map<number, 'GK' | 'DEF' | 'MID' | 'FWD'>();
    const byApiId = new Map<number, typeof dbPlayers[0]>();
    for (const p of dbPlayers) {
      if (p.apiFootballId != null) { overrides.set(p.apiFootballId, p.position as any); byApiId.set(p.apiFootballId, p); }
    }

    const calc = new LiveScoringCalculator(match.stage.stageId);
    const perfs = calc.processFixtureData(
      teamsData, events, fixture.goals.home || 0, fixture.goals.away || 0,
      match.homeNation.apiFootballId!, match.awayNation.apiFootballId!, overrides,
    );

    // Compare new vs stored (only for players we own)
    const stored = await prisma.playerPerformance.findMany({
      where: { matchId: match.id },
      include: { player: { select: { apiFootballId: true, displayName: true } } },
    });
    const storedByApi = new Map<number, typeof stored[0]>();
    for (const s of stored) if (s.player.apiFootballId != null) storedByApi.set(s.player.apiFootballId, s);

    const diffs: string[] = [];
    let net = 0;
    for (const np of perfs) {
      if (!byApiId.has(np.apiPlayerId)) continue; // not in our DB
      const old = storedByApi.get(np.apiPlayerId);
      const oldTot = old?.totalPoints ?? 0;
      if (oldTot !== np.totalPoints || (old?.cleanSheet ?? false) !== np.cleanSheet) {
        diffs.push(`    ${(byApiId.get(np.apiPlayerId)!.displayName).padEnd(16)} ${oldTot}->${np.totalPoints}pts (CS ${old?.cleanSheet ?? false}->${np.cleanSheet}, conc ${old?.goalsConceeded ?? '?'}->${np.goalsConceeded})`);
        net += np.totalPoints - oldTot;
      }
    }
    console.log(`${label}: ${diffs.length} player(s) change, net perf delta ${net >= 0 ? '+' : ''}${net}`);
    diffs.forEach((d) => console.log(d));

    if (APPLY) {
      await rollbackSquadPoints(match.id);
      for (const np of perfs) {
        const p = byApiId.get(np.apiPlayerId);
        if (!p) continue;
        const data = {
          minutesPlayed: np.minutesPlayed, goals: np.goals, assists: np.assists,
          cleanSheet: np.cleanSheet, goalsConceeded: np.goalsConceeded, saves: np.saves,
          penaltiesSaved: np.penaltiesSaved, penaltiesMissed: np.penaltiesMissed,
          yellowCards: np.yellowCards, redCards: np.redCards, ownGoals: np.ownGoals,
          defensiveActions: np.defensiveActions ?? 0, startedMatch: np.startedMatch,
          totalPoints: np.totalPoints, isLive: false, lastUpdated: new Date(),
        };
        await prisma.playerPerformance.upsert({
          where: { playerId_matchId: { playerId: p.id, matchId: match.id } },
          create: { playerId: p.id, matchId: match.id, ...data },
          update: data,
        });
      }
      await updateSquadPoints(match.id);
      console.log(`    -> applied + rebanked`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
