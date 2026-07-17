import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const team = await prisma.team.findFirst({ where: { name: 'Safarjlani to glory' }, select: { id: true, totalPoints: true, firstSquadSavedAt: true, createdAt: true } });
  console.log('team:', team);
  const gr1 = await prisma.stage.findFirst({ where: { stageId: 'GR1' }, select: { id: true, deadlineTime: true } });
  console.log('GR1 deadline:', gr1?.deadlineTime);
  const ts = await prisma.teamStage.findFirst({ where: { teamId: team!.id, stageId: gr1!.id } });
  console.log('GR1 TeamStage:', ts);
}
main().catch(console.error).finally(() => prisma.$disconnect());
