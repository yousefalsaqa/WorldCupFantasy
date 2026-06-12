// Backfill PlayerPerformance.startedMatch for matches that finished before
// the column existed. 1 API-Football call per finished match. Idempotent —
// safe to re-run; only touches rows whose startedMatch is currently null.
//
// Run:  npx tsx scripts/backfill-started-match.ts
import { PrismaClient } from '@prisma/client';
import { apiFootball } from '../src/lib/api-football';

const prisma = new PrismaClient();

async function main() {
  const matches = await prisma.match.findMany({
    where: { isFinished: true, apiFootballId: { not: null } },
    select: {
      id: true,
      apiFootballId: true,
      homeNation: { select: { code: true } },
      awayNation: { select: { code: true } },
    },
  });
  console.log(`finished matches with API ids: ${matches.length}`);

  for (const m of matches) {
    const pending = await prisma.playerPerformance.count({
      where: { matchId: m.id, startedMatch: null },
    });
    if (pending === 0) {
      console.log(`${m.homeNation.code}-${m.awayNation.code}: already backfilled, skipping (0 API cost)`);
      continue;
    }

    const teams = await apiFootball.getFixturePlayerStats(m.apiFootballId!);
    let updated = 0;
    for (const team of teams) {
      for (const p of team.players) {
        const stats = p.statistics[0];
        if (!stats || !stats.games.minutes) continue; // unused subs have no perf row
        const player = await prisma.player.findFirst({
          where: { apiFootballId: p.player.id },
          select: { id: true },
        });
        if (!player) continue;
        const res = await prisma.playerPerformance.updateMany({
          where: { playerId: player.id, matchId: m.id, startedMatch: null },
          data: { startedMatch: !stats.games.substitute },
        });
        updated += res.count;
      }
    }
    console.log(`${m.homeNation.code}-${m.awayNation.code}: ${updated} rows backfilled`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
