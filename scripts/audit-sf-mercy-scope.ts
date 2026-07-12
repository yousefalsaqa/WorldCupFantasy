import { prisma } from '../src/lib/db';
import { FREE_TRANSFER_BANK_CAP } from '../src/lib/transfer-allocation';

async function main() {
  const qf = await prisma.stage.findFirst({ where: { stageId: 'QF' } });
  const teams = await prisma.team.findMany({ select: { id: true, name: true, freeTransfers: true } });

  let affected = 0;
  for (const t of teams) {
    const ts = await prisma.teamStage.findFirst({ where: { teamId: t.id, stageId: qf.id } });
    if (!ts || ts.eliminatedCount === 0) continue;
    // Reconstruct banked (pre-mercy) value from old-logic output:
    // old: if eliminated > banked -> freeTransfers=eliminated, mercyTransfers=eliminated-banked
    //      else -> freeTransfers=banked, mercyTransfers=0
    const oldFT = t.freeTransfers;
    const eliminated = ts.eliminatedCount;
    const banked = ts.mercyTransfers > 0 ? eliminated - ts.mercyTransfers : oldFT;
    const additiveFT = banked + eliminated;
    const delta = additiveFT - oldFT;
    if (delta !== 0) {
      affected++;
      console.log(`${t.name.padEnd(24)} banked=${banked} eliminated=${eliminated} currentFT=${oldFT} -> additiveFT=${additiveFT} (delta +${delta})`);
    }
  }
  console.log(`\n${affected} teams under-credited vs additive rule.`);
  await prisma.$disconnect();
}
main();
