// Pre-launch sanity: are tomorrow's (and all GR1) fixtures primed for the
// live cron? Checks kickoff times, apiFootballId stamping, flags, and the
// active stage.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const stages = await prisma.stage.findMany({ orderBy: { order: 'asc' } });
  for (const s of stages) {
    console.log(`${s.isActive ? '→' : ' '} ${s.stageId.padEnd(4)} ${s.name.padEnd(22)} active=${s.isActive} deadline=${s.deadlineTime?.toISOString() ?? '—'}`);
  }

  const next72h = await prisma.match.findMany({
    where: { kickoffTime: { gte: new Date(), lte: new Date(Date.now() + 72 * 3600e3) } },
    include: { homeNation: true, awayNation: true, stage: true },
    orderBy: { kickoffTime: 'asc' },
  });
  console.log(`\nMatches in next 72h: ${next72h.length}`);
  for (const m of next72h) {
    console.log(
      `  ${m.kickoffTime.toISOString()}  ${m.homeNation.code} v ${m.awayNation.code}  api=${m.apiFootballId ?? 'MISSING'} started=${m.isStarted} finished=${m.isFinished} stage=${m.stage.stageId}`,
    );
  }

  const unstamped = await prisma.match.count({ where: { apiFootballId: null } });
  const total = await prisma.match.count();
  console.log(`\nFixtures total=${total}, missing apiFootballId=${unstamped} (knockouts expected to be missing until synced)`);
}

main().finally(() => prisma.$disconnect());
