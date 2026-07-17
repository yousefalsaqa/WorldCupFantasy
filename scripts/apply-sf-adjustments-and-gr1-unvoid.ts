// Batch of manual corrections requested together:
//  1. thebestsaqa: +10 on SF (stage now settled/complete)
//  2. balls (ayaan): +10 on SF
//  3. omar.sn's Team: -5 on SF
//  4. Safarjlani to glory (omar saf, late joiner): un-void GR1 — flat 40
//     points (owner's call, overriding the reconstructed real value of 19),
//     plus write the reconstructed squad snapshot so GR1 has a permanent
//     settled record instead of relying on transfer-rewind every time.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function applyStageDelta(teamName: string, stageDbId: string, delta: number) {
  const team = await prisma.team.findFirst({ where: { name: teamName }, select: { id: true, totalPoints: true } });
  if (!team) throw new Error(`${teamName} not found`);
  const ts = await prisma.teamStage.findFirst({ where: { teamId: team.id, stageId: stageDbId } });
  if (!ts) throw new Error(`no TeamStage for ${teamName}`);

  const before = { rawPoints: ts.rawPoints, totalPoints: ts.totalPoints, teamTotal: team.totalPoints };
  const updatedTs = await prisma.teamStage.update({
    where: { id: ts.id },
    data: { rawPoints: ts.rawPoints + delta, totalPoints: ts.totalPoints + delta },
  });
  const updatedTeam = await prisma.team.update({
    where: { id: team.id },
    data: { totalPoints: team.totalPoints + delta },
  });

  await prisma.auditLog.create({
    data: {
      action: 'MANUAL_TEAM_STAGE_ADJUSTMENT',
      userId: null,
      details: JSON.stringify({
        reason: 'batch adjustment requested by owner',
        teamId: team.id, teamName, delta,
        before, after: { rawPoints: updatedTs.rawPoints, totalPoints: updatedTs.totalPoints, teamTotal: updatedTeam.totalPoints },
      }),
    },
  });
  console.log(`${teamName}: TeamStage.totalPoints ${before.totalPoints} -> ${updatedTs.totalPoints}  |  Team.totalPoints ${before.teamTotal} -> ${updatedTeam.totalPoints}`);
}

async function main() {
  const sf = await prisma.stage.findFirst({ where: { stageId: 'SF' }, select: { id: true } });
  const gr1 = await prisma.stage.findFirst({ where: { stageId: 'GR1' }, select: { id: true, order: true } });

  await applyStageDelta('thebestsaqa', sf!.id, 10);
  await applyStageDelta('balls', sf!.id, 10);
  await applyStageDelta('omar.sn\'s Team', sf!.id, -5);

  // --- GR1 un-void for Safarjlani to glory: flat 40, plus squad snapshot ---
  const team = await prisma.team.findFirst({ where: { name: 'Safarjlani to glory' }, select: { id: true, totalPoints: true } });
  const ts = await prisma.teamStage.findFirst({ where: { teamId: team!.id, stageId: gr1!.id } });
  if (!ts) throw new Error('no GR1 TeamStage for Safarjlani to glory');

  // Reconstruct the GR1 squad (same rewind approach as /api/gameweek's fallback)
  const allStages = await prisma.stage.findMany({ select: { id: true, order: true } });
  const orderByStageDbId = new Map(allStages.map(s => [s.id, s.order]));
  const currentSquad = await prisma.squadPlayer.findMany({
    where: { teamId: team!.id },
    select: { playerId: true, isStarting: true, isCaptain: true, isViceCaptain: true, benchOrder: true },
  });
  const teamTransfers = await prisma.transfer.findMany({
    where: { teamId: team!.id },
    select: { playerInId: true, playerOutId: true, stageId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const laterTransfers = teamTransfers.filter(t => t.stageId && (orderByStageDbId.get(t.stageId) ?? -1) > gr1!.order);
  const slotByPlayer = new Map<string, any>();
  for (const sp of currentSquad) slotByPlayer.set(sp.playerId, { ...sp });
  for (const t of laterTransfers) {
    const inSlot = slotByPlayer.get(t.playerInId);
    if (!inSlot) continue;
    slotByPlayer.delete(t.playerInId);
    slotByPlayer.set(t.playerOutId, { ...inSlot, playerId: t.playerOutId });
  }
  const histSlots = Array.from(slotByPlayer.values());
  const squadSnapshot = JSON.stringify(histSlots.map(s => ({
    playerId: s.playerId, isStarting: s.isStarting, isCaptain: s.isCaptain, isViceCaptain: s.isViceCaptain, benchOrder: s.benchOrder,
  })));

  const NEW_GR1_TOTAL = 40;
  const beforeGr1 = { rawPoints: ts.rawPoints, totalPoints: ts.totalPoints, teamTotal: team!.totalPoints };
  const updatedGr1Ts = await prisma.teamStage.update({
    where: { id: ts.id },
    data: { rawPoints: NEW_GR1_TOTAL, captainPoints: 0, totalPoints: NEW_GR1_TOTAL, squadSnapshot },
  });
  const updatedSafTeam = await prisma.team.update({
    where: { id: team!.id },
    data: { totalPoints: team!.totalPoints + NEW_GR1_TOTAL },
  });

  await prisma.auditLog.create({
    data: {
      action: 'ADMIN_UNVOID_STAGE',
      userId: null,
      details: JSON.stringify({
        reason: 'un-void GR1 for late joiner Safarjlani to glory (omar saf) — owner set flat 40 pts (real reconstructed value was 19)',
        teamId: team!.id, teamName: 'Safarjlani to glory',
        before: beforeGr1,
        after: { rawPoints: updatedGr1Ts.rawPoints, totalPoints: updatedGr1Ts.totalPoints, teamTotal: updatedSafTeam.totalPoints },
        reconstructedRealValue: 19,
      }),
    },
  });
  console.log(`Safarjlani to glory: GR1 TeamStage.totalPoints ${beforeGr1.totalPoints} -> ${updatedGr1Ts.totalPoints}  |  Team.totalPoints ${beforeGr1.teamTotal} -> ${updatedSafTeam.totalPoints}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
