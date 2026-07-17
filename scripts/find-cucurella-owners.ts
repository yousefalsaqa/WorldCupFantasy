import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const player = await prisma.player.findFirst({ where: { displayName: { contains: 'Cucurella', mode: 'insensitive' } }, select: { id: true, displayName: true } });
  if (!player) { console.log('not found'); return; }
  const rows = await prisma.squadPlayer.findMany({ where: { playerId: player.id }, select: { teamId: true, team: { select: { name: true } } } });
  console.log(player);
  for (const r of rows) console.log(' owned by:', r.team.name);
}
main().catch(console.error).finally(() => prisma.$disconnect());
