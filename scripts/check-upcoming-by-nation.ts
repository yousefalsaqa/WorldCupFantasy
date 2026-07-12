import { prisma } from '../src/lib/db';
async function main() {
  const matches = await prisma.match.findMany({
    where: { isFinished: false, kickoffTime: { gt: new Date() } },
    include: { homeNation: { select: { code: true } }, awayNation: { select: { code: true } }, stage: { select: { stageId: true } } },
    orderBy: { kickoffTime: 'asc' },
  });
  console.log(`now=${new Date().toISOString()}`);
  console.log(`${matches.length} upcoming (unfinished, future) matches in DB:`);
  for (const m of matches) console.log(`  ${m.homeNation.code} vs ${m.awayNation.code} | ko=${m.kickoffTime.toISOString()} | stage=${m.stage.stageId}`);
  await prisma.$disconnect();
}
main();
