import { prisma } from '../src/lib/db';
async function main() {
  const team = await prisma.team.findFirst({ where: { name: { contains: 'chimbohimbo' } } });
  console.log('freeHitSnapshot present:', !!team.freeHitSnapshot);
  if (team.freeHitSnapshot) {
    const snap = JSON.parse(team.freeHitSnapshot);
    console.log('snapshot.freeTransfers:', snap.freeTransfers, 'snapshot.stageId:', snap.stageId);
  }
  await prisma.$disconnect();
}
main();
