// One-off: delete the standalone "3RD" Stage row as part of the 3RD/F merge
// (see LIVE_POINTS_HANDOFF.md "OPEN DISCUSSION" section, owner-approved).
// The 3rd-place play-off now lives inside stage "F" alongside the Final,
// distinguished by Match.isThirdPlace. Safe: confirmed 0 matches / 0
// TeamStage rows before running.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const stage = await prisma.stage.findFirst({ where: { stageId: '3RD' } });
  if (!stage) { console.log('no 3RD stage row — already gone'); return; }
  const matches = await prisma.match.count({ where: { stageId: stage.id } });
  const teamStages = await prisma.teamStage.count({ where: { stageId: stage.id } });
  if (matches > 0 || teamStages > 0) throw new Error(`3RD stage not empty (matches=${matches} teamStages=${teamStages}) — aborting`);
  await prisma.$transaction([
    prisma.stage.delete({ where: { id: stage.id } }),
    prisma.auditLog.create({
      data: {
        userId: null,
        action: 'STAGE_MERGED',
        details: JSON.stringify({ reason: '3RD/F merge (owner approved): 3rd-place play-off now shares stage F with the Final, via Match.isThirdPlace', deletedStageId: stage.id }),
      },
    }),
  ]);
  console.log('3RD stage row deleted.');
}
main().catch(console.error).finally(() => prisma.$disconnect());
