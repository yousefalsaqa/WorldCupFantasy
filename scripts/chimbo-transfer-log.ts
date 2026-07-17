// READ-ONLY: chimbo's real transfer history, for the owner's own reference.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const team = await prisma.team.findFirst({ where: { name: 'chimbohimbo' }, select: { id: true } });
  if (!team) throw new Error('not found');
  const transfers = await prisma.transfer.findMany({
    where: { teamId: team.id },
    orderBy: { createdAt: 'asc' },
    include: { team: false },
  });
  const playerIds = Array.from(new Set(transfers.flatMap(t => [t.playerInId, t.playerOutId])));
  const players = await prisma.player.findMany({ where: { id: { in: playerIds } }, select: { id: true, displayName: true } });
  const nameById = new Map(players.map(p => [p.id, p.displayName]));
  const stages = await prisma.stage.findMany({ select: { id: true, stageId: true } });
  const stageById = new Map(stages.map(s => [s.id, s.stageId]));

  for (const t of transfers) {
    console.log(`${t.createdAt.toISOString()}  [${t.stageId ? stageById.get(t.stageId) : '?'}]  ${nameById.get(t.playerOutId)} -> ${nameById.get(t.playerInId)}  (free=${t.isFreeTransfer} wc=${t.isWildcard} mercy=${t.isMercyTransfer})`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
