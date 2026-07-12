import { prisma } from '../src/lib/db';
async function main() {
  const audits = await prisma.auditLog.findMany({ where: { action: 'ADMIN_SF_ADDITIVE_MERCY_CORRECTION' } });
  for (const a of audits) {
    const d = JSON.parse(a.details);
    const team = await prisma.team.findUnique({ where: { id: d.teamId }, select: { name: true, freeTransfers: true, updatedAt: true } });
    if (!team) continue;
    const drifted = team.freeTransfers !== d.newFreeTransfers;
    console.log(`${drifted ? 'DRIFT' : 'OK   '} ${team.name.padEnd(24)} fixedTo=${d.newFreeTransfers} currentNow=${team.freeTransfers} fixedAt=${a.createdAt.toISOString()} lastUpdate=${team.updatedAt.toISOString()}`);
  }
  await prisma.$disconnect();
}
main();
