import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const sf = await prisma.stage.findFirst({ where: { stageId: 'SF' }, select: { id: true } });
  const matches = await prisma.match.findMany({ where: { stageId: sf!.id }, include: { homeNation:{select:{code:true}}, awayNation:{select:{code:true}} } });
  for (const m of matches) console.log(m.homeNation.code, m.awayNation.code, 'winnerId=', m.winnerId, 'isFinished=', m.isFinished);
}
main().catch(console.error).finally(() => prisma.$disconnect());
