import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const f = await prisma.stage.findFirst({ where: { stageId: 'F' }, select: { id: true, name: true, deadlineTime: true } });
  console.log('F stage:', f);
  const matches = await prisma.match.findMany({
    where: { stageId: f!.id },
    include: { homeNation: { select: { code: true } }, awayNation: { select: { code: true } } },
  });
  console.log('matches:', matches.length);
  for (const m of matches) console.log(' ', m.homeNation.code, 'vs', m.awayNation.code, m.kickoffTime, 'isThirdPlace=', (m as any).isThirdPlace);
}
main().catch(console.error).finally(() => prisma.$disconnect());
