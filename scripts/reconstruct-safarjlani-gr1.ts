// READ-ONLY: reconstruct what Safarjlani to glory's GR1 squad likely was
// (rewinding every LATER transfer), then compute real GR1 points from
// PlayerPerformance, mirroring /api/gameweek/[stageId]'s fallback path.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const team = await prisma.team.findFirst({ where: { name: 'Safarjlani to glory' }, select: { id: true } });
  const gr1 = await prisma.stage.findFirst({ where: { stageId: 'GR1' }, select: { id: true, order: true } });
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
  console.log(`Total transfers: ${teamTransfers.length}, later-than-GR1 transfers to rewind: ${laterTransfers.length}`);

  const slotByPlayer = new Map();
  for (const sp of currentSquad) slotByPlayer.set(sp.playerId, { ...sp });
  for (const t of laterTransfers) {
    const inSlot = slotByPlayer.get(t.playerInId);
    if (!inSlot) continue;
    slotByPlayer.delete(t.playerInId);
    slotByPlayer.set(t.playerOutId, { ...inSlot, playerId: t.playerOutId });
  }
  const histSlots = Array.from(slotByPlayer.values());
  console.log('Reconstructed GR1 squad size:', histSlots.length);

  const players = await prisma.player.findMany({ where: { id: { in: histSlots.map((s: any) => s.playerId) } }, select: { id: true, displayName: true, position: true } });
  const playerById = new Map(players.map(p => [p.id, p]));

  const matches = await prisma.match.findMany({ where: { stageId: gr1!.id }, select: { id: true } });
  const matchIds = matches.map(m => m.id);
  const perfs = await prisma.playerPerformance.findMany({ where: { matchId: { in: matchIds }, playerId: { in: histSlots.map((s: any) => s.playerId) } }, select: { playerId: true, totalPoints: true } });
  const ptsByPlayer = new Map();
  for (const p of perfs) ptsByPlayer.set(p.playerId, (ptsByPlayer.get(p.playerId) ?? 0) + p.totalPoints);

  let rawPoints = 0, captainPoints = 0;
  for (const s of histSlots as any[]) {
    const pts = ptsByPlayer.get(s.playerId) ?? 0;
    const name = playerById.get(s.playerId)?.displayName ?? '?';
    const pos = playerById.get(s.playerId)?.position ?? '?';
    console.log(`  ${pos.padEnd(4)} ${name.padEnd(22)} starting=${s.isStarting} captain=${s.isCaptain} pts=${pts}`);
    if (s.isStarting) {
      rawPoints += pts;
      if (s.isCaptain) captainPoints += pts; // captain bonus = the extra x1 (mult-1=1 normally, no chips in GR1)
    }
  }
  console.log(`\nrawPoints (starters only) = ${rawPoints}`);
  console.log(`captainPoints (extra x1 for captain, GR1 has no chips) = ${captainPoints}`);
  console.log(`totalPoints = rawPoints + captainPoints = ${rawPoints + captainPoints}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
