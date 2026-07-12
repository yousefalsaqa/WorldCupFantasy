import { prisma } from '../src/lib/db';
async function main() {
  const qf = await prisma.stage.findFirstOrThrow({ where: { stageId: 'QF' } });
  const teams = await prisma.team.findMany({ select: { id: true, name: true, freeTransfers: true, freeHitSnapshot: true } });
  for (const t of teams) {
    const ts = await prisma.teamStage.findFirst({ where: { teamId: t.id, stageId: qf.id } });
    if (!ts || ts.eliminatedCount === 0) continue;
    // After my fix, mercyTransfers was stamped = eliminatedCount, and
    // freeTransfers should = banked + eliminatedCount where
    // banked = mercyTransfers>0 ? (freeTransfers-at-fix-time - eliminatedCount) : ...
    // Simplify: expected freeTransfers = (eliminatedCount) + banked. We know
    // mercyTransfers is now stamped to eliminatedCount post-fix, so banked
    // isn't directly recoverable here — instead just flag anyone whose
    // freeTransfers < eliminatedCount (a sure sign of drift/clobber, since
    // additive freeTransfers is always >= eliminatedCount).
    if (t.freeTransfers < ts.eliminatedCount) {
      console.log(`DRIFT  ${t.name.padEnd(24)} freeTransfers=${t.freeTransfers} < eliminatedCount=${ts.eliminatedCount}  hasFHSnapshot=${!!t.freeHitSnapshot}`);
    }
  }
  await prisma.$disconnect();
}
main();
