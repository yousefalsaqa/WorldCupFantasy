// READ-ONLY: list LATE_SWAP_FORFEIT audit entries + each team's active chips,
// to find forfeits that were wrong because Bench Boost kept the player scoring.
// Usage: npx tsx --env-file=.env scripts/diag-forfeits.ts
import { PrismaClient } from '@prisma/client';
import { parseActiveChips } from '../src/lib/chips-active';
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.auditLog.findMany({
    where: { action: 'SQUAD_UPDATED', revertedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  const gr1 = await prisma.stage.findUnique({ where: { stageId: 'GR1' }, select: { id: true } });

  let n = 0;
  for (const log of logs) {
    let d: any;
    try { d = JSON.parse(log.details ?? '{}'); } catch { continue; }
    if (d.action !== 'LATE_SWAP_FORFEIT') continue;
    n++;
    const user = log.userId
      ? await prisma.user.findUnique({ where: { id: log.userId }, select: { username: true, team: { select: { id: true, name: true, totalPoints: true } } } })
      : null;
    const team = user?.team;
    let chips: string[] = [];
    if (team && gr1) {
      const ts = await prisma.teamStage.findUnique({
        where: { teamId_stageId: { teamId: team.id, stageId: gr1.id } },
        select: { chipsUsed: true, chipUsed: true },
      });
      chips = parseActiveChips(ts?.chipsUsed);
      if (chips.length === 0 && ts?.chipUsed) chips = [ts.chipUsed];
    }
    const bb = chips.includes('BENCH_BOOST');
    console.log(
      `${log.createdAt.toISOString()} ${(user?.username ?? '?').padEnd(12)} team="${team?.name}" ` +
      `forfeit=${d.forfeit} players=${JSON.stringify(d.players)} chips=[${chips.join(',')}]${bb ? '  <-- BENCH BOOST: forfeit likely WRONG' : ''}`,
    );
  }
  console.log(`\nTotal LATE_SWAP_FORFEIT entries: ${n}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
