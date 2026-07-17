import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const qf = await prisma.stage.findFirst({ where: { stageId: 'QF' }, select: { id: true } });
  const team = await prisma.team.findFirst({ where: { name: "omar.sn's Team" }, select: { id: true } });
  const ts = await prisma.teamStage.findFirst({ where: { teamId: team!.id, stageId: qf!.id } });
  console.log(ts);
}
main().catch(console.error).finally(() => prisma.$disconnect());
