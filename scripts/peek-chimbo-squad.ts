import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const team = await prisma.team.findFirst({ where: { name: 'chimbohimbo' }, select: { id: true } });
  const squad = await prisma.squadPlayer.findMany({
    where: { teamId: team!.id },
    include: { player: { select: { displayName: true, position: true } } },
  });
  for (const s of squad) console.log(`${s.player.position.padEnd(4)} ${s.player.displayName.padEnd(25)} starting=${s.isStarting} captain=${s.isCaptain} purchase=${s.purchasePrice}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
