// READ-ONLY: who currently has active Free Hit / queued transfers, + GR1 state.
// Usage: npx tsx --env-file=.env scripts/diag-midround-state.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const teams = await prisma.team.findMany({
    select: { name: true, bankBalance: true, freeHitSnapshot: true, pendingTransfers: true },
  });
  let fh = 0, pend = 0;
  for (const t of teams) {
    const hasFH = !!t.freeHitSnapshot;
    const pt = t.pendingTransfers ? JSON.parse(t.pendingTransfers) : [];
    if (hasFH) fh++;
    if (pt.length) pend++;
    if (hasFH || pt.length) console.log(`  ${t.name.padEnd(20)} bank=${t.bankBalance.toFixed(1)} FH=${hasFH} pending=${pt.length}`);
  }
  console.log(`\nTotal teams=${teams.length} | active FreeHit=${fh} | with pendingTransfers=${pend}`);

  const gr1 = await prisma.stage.findUnique({ where: { stageId: 'GR1' }, select: { isActive: true, isComplete: true } });
  const matches = await prisma.match.findMany({ where: { stage: { stageId: 'GR1' } }, select: { isFinished: true, isStarted: true } });
  console.log(`GR1 active=${gr1?.isActive} complete=${gr1?.isComplete} | FT=${matches.filter(m=>m.isFinished).length}/${matches.length} live=${matches.filter(m=>m.isStarted&&!m.isFinished).length} notStarted=${matches.filter(m=>!m.isStarted).length}`);
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
