// Isolated test of the next-round Wildcard queue path. Creates a throwaway
// user+team, queues a WILDCARD pending transfer, applies it, asserts the
// outcome, then deletes everything. Touches no real user/league/deadline.
// Usage: npx tsx --env-file=.env scripts/test-wildcard-queue.ts
import { PrismaClient } from '@prisma/client';
import { parsePendingTransfers, serializePendingTransfers, applyPendingTransfers, type PendingTransfer } from '../src/lib/pending-transfers';

const prisma = new PrismaClient();
const TEST_EMAIL = 'wctest-wildcard@example.test';

function assert(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) process.exitCode = 1;
}

async function cleanup() {
  const u = await prisma.user.findUnique({ where: { email: TEST_EMAIL }, select: { id: true, team: { select: { id: true } } } });
  if (u?.team) {
    await prisma.transfer.deleteMany({ where: { teamId: u.team.id } });
    await prisma.squadPlayer.deleteMany({ where: { teamId: u.team.id } });
    await prisma.teamStage.deleteMany({ where: { teamId: u.team.id } });
    await prisma.team.delete({ where: { id: u.team.id } });
  }
  if (u) await prisma.user.delete({ where: { id: u.id } });
}

async function main() {
  // ---- 1) Pure round-trip: isWildcard survives serialize/parse ----
  const sample: PendingTransfer = { playerOutId: 'a', playerInId: 'b', priceIn: 5, priceOut: 4, queuedAt: new Date().toISOString(), isWildcard: true };
  const round = parsePendingTransfers(serializePendingTransfers([sample]));
  assert(round.length === 1 && round[0].isWildcard === true, 'isWildcard survives serialize→parse');

  await cleanup(); // remove any leftovers from a prior run

  // ---- 2) DB: apply a wildcard queued transfer on a throwaway team ----
  const gr2 = await prisma.stage.findUnique({ where: { stageId: 'GR2' }, select: { id: true } });
  if (!gr2) { console.log('no GR2 stage'); await prisma.$disconnect(); return; }

  // Two FWDs of the same position: one to own, one to bring in.
  const fwds = await prisma.player.findMany({ where: { isAvailable: true, position: 'FWD' }, select: { id: true, currentPrice: true, displayName: true }, take: 2 });
  if (fwds.length < 2) { console.log('not enough FWDs'); await prisma.$disconnect(); return; }
  const [owned, incoming] = fwds;

  const user = await prisma.user.create({ data: { email: TEST_EMAIL, username: 'wctest', passwordHash: 'x' } });
  const team = await prisma.team.create({
    data: { userId: user.id, name: 'wctest-team', bankBalance: 50, teamValue: owned.currentPrice, freeTransfers: 2 },
  });
  await prisma.squadPlayer.create({ data: { teamId: team.id, playerId: owned.id, purchasePrice: owned.currentPrice, isStarting: true, benchOrder: null } });

  const bankBefore = 50;
  const pending = [{ playerOutId: owned.id, playerInId: incoming.id, priceIn: incoming.currentPrice, priceOut: owned.currentPrice, queuedAt: new Date().toISOString(), isWildcard: true }];

  const res = await applyPendingTransfers(team.id, serializePendingTransfers(pending), gr2.id);
  assert(res.applied === 1 && res.skipped === 0, `applied=1 skipped=0 (got applied=${res.applied} skipped=${res.skipped})`);

  const squad = await prisma.squadPlayer.findMany({ where: { teamId: team.id }, select: { playerId: true } });
  assert(squad.length === 1 && squad[0].playerId === incoming.id, 'squad now holds the incoming player');

  const xfer = await prisma.transfer.findFirst({ where: { teamId: team.id }, select: { isWildcard: true, isFreeTransfer: true, stageId: true } });
  assert(!!xfer && xfer.isWildcard === true, 'Transfer row stamped isWildcard=true');
  assert(!!xfer && xfer.stageId === gr2.id, 'Transfer stamped with next stage (GR2)');

  const after = await prisma.team.findUnique({ where: { id: team.id }, select: { bankBalance: true, freeTransfers: true } });
  const expectBank = bankBefore + (owned.currentPrice - incoming.currentPrice);
  assert(!!after && Math.abs(after.bankBalance - expectBank) < 0.001, `bank ${bankBefore}→${after?.bankBalance} (expected ${expectBank.toFixed(1)})`);
  assert(!!after && after.freeTransfers === 2, `free transfers unchanged by apply (got ${after?.freeTransfers}) — wildcard spends none`);

  await cleanup();
  console.log('\ndone.');
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
