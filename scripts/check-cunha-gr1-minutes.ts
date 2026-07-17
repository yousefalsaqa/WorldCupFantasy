import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const gr1 = await prisma.stage.findFirst({ where: { stageId: 'GR1' }, select: { id: true } });
  const matches = await prisma.match.findMany({ where: { stageId: gr1!.id }, select: { id: true } });
  const player = await prisma.player.findFirst({ where: { displayName: { contains: 'Matheus Cunha', mode: 'insensitive' } }, select: { id: true } });
  const perf = await prisma.playerPerformance.findMany({ where: { matchId: { in: matches.map(m=>m.id) }, playerId: player!.id } });
  console.log(perf);
}
main().catch(console.error).finally(() => prisma.$disconnect());
