import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const team = await prisma.team.findFirst({ where: { name: 'Micho’s Bichos' }, select: { id: true, freeTransfers: true } });
  console.log(team);
  const sf = await prisma.stage.findFirst({ where: { stageId: 'SF' }, select: { id: true } });
  console.log('SF stage id:', sf?.id);
}
main().catch(console.error).finally(() => prisma.$disconnect());
