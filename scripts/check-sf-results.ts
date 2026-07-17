import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const sf = await prisma.stage.findFirst({ where: { stageId: 'SF' }, select: { id: true } });
  const matches = await prisma.match.findMany({
    where: { stageId: sf!.id },
    include: { homeNation: { select: { code: true, name: true } }, awayNation: { select: { code: true, name: true } } },
    orderBy: { kickoffTime: 'asc' },
  });
  for (const m of matches) {
    console.log(m.homeNation.code, m.homeScore, '-', m.awayScore, m.awayNation.code, '| pens:', m.homePenalties, m.awayPenalties, '| finished=', m.isFinished, '| kickoff=', m.kickoffTime);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
