// READ-ONLY: remaining (unfinished) GR3 matches + their kickoff window.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const gr3 = await prisma.stage.findFirst({ where: { stageId: 'GR3' } });
  if (!gr3) return console.log('no GR3');
  const ms = await prisma.match.findMany({
    where: { stageId: gr3.id, isFinished: false },
    include: { homeNation: true, awayNation: true },
    orderBy: { kickoffTime: 'asc' },
  });
  console.log(`GR3 unfinished: ${ms.length}`);
  for (const m of ms)
    console.log(`  ${m.homeNation.code} vs ${m.awayNation.code}  ko=${m.kickoffTime.toISOString()} started=${m.isStarted}`);
  if (ms.length) console.log(`\nLast GR3 kickoff: ${ms[ms.length - 1].kickoffTime.toISOString()}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
