import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const team = await prisma.team.findFirst({ where: { name: "Micho’s Bichos" }, select: { id: true, bankBalance: true, teamValue: true } });
  if (!team) { console.log('team not found by curly apostrophe, trying straight'); return; }
  const kounde = await prisma.player.findFirst({ where: { displayName: { contains: 'Kound', mode: 'insensitive' } }, select: { id: true, displayName: true, position: true, currentPrice: true } });
  const porro = await prisma.player.findFirst({ where: { displayName: { contains: 'Porro', mode: 'insensitive' } }, select: { id: true, displayName: true, position: true, currentPrice: true } });
  console.log('team:', team);
  console.log('Kounde:', kounde);
  console.log('Porro:', porro);
  const squadRow = await prisma.squadPlayer.findFirst({ where: { teamId: team.id, playerId: kounde!.id } });
  console.log('squadRow (Kounde):', squadRow);
  const alreadyPorro = await prisma.squadPlayer.findFirst({ where: { teamId: team.id, playerId: porro!.id } });
  console.log('already owns Porro?', alreadyPorro);
}
main().catch(console.error).finally(() => prisma.$disconnect());
