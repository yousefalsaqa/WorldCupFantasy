import { prisma } from '../src/lib/db';
async function main() {
  const team = await prisma.team.findFirstOrThrow({ where: { name: { contains: 'chimbohimbo' } } });
  console.log(`freeTransfers=${team.freeTransfers} bank=${team.bankBalance} hasFHSnapshot=${!!team.freeHitSnapshot}`);
  if (team.freeHitSnapshot) {
    const snap = JSON.parse(team.freeHitSnapshot);
    console.log('snapshot.freeTransfers:', snap.freeTransfers, 'snapshot.bankBalance:', snap.bankBalance, 'snapshot.stageId:', snap.stageId);
  }
  await prisma.$disconnect();
}
main();
