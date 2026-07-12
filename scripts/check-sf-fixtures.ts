import { prisma } from '../src/lib/db';
async function main() {
  const sf = await prisma.stage.findFirstOrThrow({ where: { stageId: 'SF' } });
  console.log(`SF stage: deadline=${sf.deadlineTime?.toISOString()} isActive=${sf.isActive}`);

  const matches = await prisma.match.findMany({
    where: { stageId: sf.id },
    include: { homeNation: true, awayNation: true },
    orderBy: { kickoffTime: 'asc' },
  });
  console.log(`\n${matches.length} SF matches:`);
  for (const m of matches) {
    console.log(`  ${m.homeNation.code} vs ${m.awayNation.code} | ko=${m.kickoffTime.toISOString()} | apiFootballId=${m.apiFootballId} | started=${m.isStarted} finished=${m.isFinished} thirdPlace=${m.isThirdPlace}`);
  }

  // Confirm the 4 semifinalists are exactly who won QF
  const advancers = await prisma.nation.findMany({ where: { isEliminated: false } });
  console.log('\nNations NOT eliminated (should be the 4 semifinalists):', advancers.map(n => n.code).join(', '));

  await prisma.$disconnect();
}
main();
