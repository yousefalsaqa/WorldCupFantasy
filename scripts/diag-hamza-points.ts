// READ-ONLY diagnostic: per-player GR1 breakdown for Hamza's thebestsaqa.
// Usage: npx tsx --env-file=.env scripts/diag-hamza-points.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const team = await prisma.team.findFirst({
    where: { name: 'thebestsaqa' },
    include: {
      user: { select: { username: true, email: true } },
      squadPlayers: {
        include: {
          player: {
            select: {
              id: true,
              displayName: true,
              nation: { select: { name: true } },
            },
          },
        },
      },
      teamStages: { include: { stage: { select: { stageId: true } } } },
      transfers: true,
    },
  });
  if (!team) { console.log('not found'); return; }

  console.log(
    `team="${team.name}" user=${team.user.username} Team.totalPoints=${team.totalPoints}` +
      ` freeTransfers=${team.freeTransfers} transfersUsed=${team.transfersUsed} transfers.len=${team.transfers.length}`,
  );
  for (const ts of team.teamStages) {
    console.log(`  TeamStage ${ts.stage.stageId}: raw=${ts.rawPoints} cap=${ts.captainPoints} hits=${ts.transferHits} total=${ts.totalPoints} chips=${ts.chipsUsed ?? ts.chipUsed ?? '-'}`);
  }

  // GR1 matches
  const gr1 = await prisma.stage.findUnique({ where: { stageId: 'GR1' } });
  const gr1Matches = await prisma.match.findMany({
    where: { stageId: gr1!.id },
    select: { id: true, isFinished: true, isStarted: true },
  });
  const finishedIds = new Set(gr1Matches.filter((m) => m.isFinished).map((m) => m.id));
  console.log(`\nGR1 matches: ${gr1Matches.length} total, ${finishedIds.size} finished, ${gr1Matches.filter(m=>m.isStarted && !m.isFinished).length} live`);

  console.log('\n=== SQUAD (15) ===');
  let rawAll = 0;          // Σ SquadPlayer.points
  let perfFinishedSum = 0; // Σ perf points from FINISHED GR1 matches (all 15)
  let perfFinishedStarters = 0;
  let captainPerfFinished = 0;
  for (const sp of team.squadPlayers) {
    const perfs = await prisma.playerPerformance.findMany({
      where: { playerId: sp.player.id, match: { stageId: gr1!.id } },
      select: { totalPoints: true, matchId: true },
    });
    const perfFin = perfs.filter((p) => finishedIds.has(p.matchId)).reduce((a, p) => a + p.totalPoints, 0);
    const perfLive = perfs.filter((p) => !finishedIds.has(p.matchId)).reduce((a, p) => a + p.totalPoints, 0);
    rawAll += sp.points ?? 0;
    perfFinishedSum += perfFin;
    if (sp.isStarting) perfFinishedStarters += perfFin;
    if (sp.isCaptain) captainPerfFinished = perfFin;
    const tag = `${sp.isCaptain ? 'C' : sp.isViceCaptain ? 'V' : ' '}${sp.isStarting ? 'S' : 'b'+(sp.benchOrder ?? '?')}`;
    console.log(
      `  ${tag} ${sp.player.displayName.padEnd(22)} ${(sp.player.nation?.name ?? '').padEnd(14)} SP.points=${String(sp.points ?? 0).padStart(3)}  perfFinished=${String(perfFin).padStart(3)} perfLive=${String(perfLive).padStart(3)}`,
    );
  }

  console.log('\n=== TOTALS ===');
  console.log(`Σ SquadPlayer.points (all 15)        = ${rawAll}`);
  console.log(`Σ perf FINISHED (all 15)             = ${perfFinishedSum}`);
  console.log(`Σ perf FINISHED (starters only)      = ${perfFinishedStarters}`);
  console.log(`captain perf FINISHED                = ${captainPerfFinished}`);
  console.log(`Team.totalPoints (live)              = ${team.totalPoints}`);
  console.log(`Expected w/ TC+BB (all15 + 2*cap)    = ${perfFinishedSum + 2 * captainPerfFinished}`);
  console.log(`Expected no chips (starters + 1*cap) = ${perfFinishedStarters + captainPerfFinished}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
