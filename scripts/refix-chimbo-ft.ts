import { prisma } from '../src/lib/db';
async function main() {
  const team = await prisma.team.findFirstOrThrow({ where: { name: { contains: 'chimbohimbo' } } });
  const admin = await prisma.user.findFirstOrThrow({ where: { isAdmin: true } });
  if (team.freeHitSnapshot) throw new Error('freeHitSnapshot still active — investigate before reapplying');

  await prisma.team.update({ where: { id: team.id }, data: { freeTransfers: 7 } });
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'ADMIN_SF_ADDITIVE_MERCY_CORRECTION',
      details: JSON.stringify({
        teamId: team.id,
        teamName: team.name,
        reason: 'Re-applying the additive mercy correction: a Free Hit activated before the first fix ran was cancelled afterward, and its revert restored the pre-fix freeTransfers (4) from its snapshot, clobbering the correction',
        oldFreeTransfers: 4,
        newFreeTransfers: 7,
      }),
    },
  });
  console.log('chimbohimbo freeTransfers -> 7');
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
