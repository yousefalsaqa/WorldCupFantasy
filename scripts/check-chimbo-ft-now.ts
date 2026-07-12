import { prisma } from '../src/lib/db';
async function main() {
  const team = await prisma.team.findFirst({ where: { name: { contains: 'chimbohimbo' } } });
  console.log(`freeTransfers=${team.freeTransfers} bank=${team.bankBalance} updatedAt=${team.updatedAt.toISOString()}`);

  const recentAudits = await prisma.auditLog.findMany({
    where: { details: { contains: team.id } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log(`\nRecent audit entries touching this team (${recentAudits.length}):`);
  for (const a of recentAudits) {
    console.log(`  ${a.createdAt.toISOString()} ${a.action}`);
  }

  const recentTransfers = await prisma.transfer.findMany({
    where: { teamId: team.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log(`\nRecent transfers (${recentTransfers.length}):`);
  for (const t of recentTransfers) {
    console.log(`  ${t.createdAt.toISOString()} free=${t.isFreeTransfer} wildcard=${t.isWildcard} mercy=${t.isMercyTransfer}`);
  }
  await prisma.$disconnect();
}
main();
