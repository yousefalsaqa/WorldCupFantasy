// Reverse late-swap forfeits that were wrong because BENCH BOOST was active:
// moving a played starter to the bench forfeited his points, but under Bench
// Boost he still scores. Only the "leaving XI" portion is wrong — armband
// forfeits (which revert the captain multiplier) stay valid even under BB.
//
//   npx tsx --env-file=.env scripts/fix-bench-boost-forfeits.ts          # DRY RUN
//   npx tsx --env-file=.env scripts/fix-bench-boost-forfeits.ts --apply  # WRITE
//
// SquadPlayer.points was never touched by the claw-back (it only decremented
// Team.totalPoints), so the fix is: Team.totalPoints += wrongly-forfeited,
// then mark the audit entry reverted so re-runs are idempotent.
import { PrismaClient } from '@prisma/client';
import { parseActiveChips } from '../src/lib/chips-active';
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// "Matheus Cunha (1)" -> {name, pts:1, armband:false}; "Raphinha armband (2)" -> armband:true
function parseEntry(s: string): { armband: boolean; pts: number } {
  const m = s.match(/\((-?\d+)\)\s*$/);
  const pts = m ? parseInt(m[1], 10) : 0;
  return { armband: / armband /.test(s) || /armband \(/.test(s), pts };
}

async function main() {
  console.log(APPLY ? '*** APPLY MODE ***\n' : '--- DRY RUN ---\n');
  const gr1 = await prisma.stage.findUnique({ where: { stageId: 'GR1' }, select: { id: true } });
  const logs = await prisma.auditLog.findMany({
    where: { action: 'SQUAD_UPDATED', revertedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  let fixed = 0;
  for (const log of logs) {
    let d: any;
    try { d = JSON.parse(log.details ?? '{}'); } catch { continue; }
    if (d.action !== 'LATE_SWAP_FORFEIT' || !Array.isArray(d.players)) continue;

    const user = log.userId
      ? await prisma.user.findUnique({ where: { id: log.userId }, select: { username: true, team: { select: { id: true, name: true, totalPoints: true } } } })
      : null;
    const team = user?.team;
    if (!team || !gr1) continue;

    const ts = await prisma.teamStage.findUnique({
      where: { teamId_stageId: { teamId: team.id, stageId: gr1.id } },
      select: { chipsUsed: true, chipUsed: true },
    });
    let chips = parseActiveChips(ts?.chipsUsed);
    if (chips.length === 0 && ts?.chipUsed) chips = [ts.chipUsed];
    if (!chips.includes('BENCH_BOOST')) continue;

    // Wrongly forfeited = the non-armband (leaving-XI) entries.
    const entries = d.players.map((p: string) => ({ raw: p, ...parseEntry(p) }));
    const wrong = entries.filter((e: any) => !e.armband).reduce((a: number, e: any) => a + e.pts, 0);
    if (wrong === 0) continue;

    console.log(`${user!.username} team="${team.name}" totalPoints ${team.totalPoints} -> ${team.totalPoints + wrong}  (restore ${wrong}: ${entries.filter((e:any)=>!e.armband).map((e:any)=>e.raw).join(', ')})`);
    fixed++;

    if (APPLY) {
      await prisma.$transaction(async (tx) => {
        await tx.team.update({ where: { id: team.id }, data: { totalPoints: { increment: wrong } } });
        const rev = await tx.auditLog.create({
          data: {
            userId: log.userId,
            action: 'SQUAD_UPDATED',
            details: JSON.stringify({ action: 'BENCH_BOOST_FORFEIT_REVERSAL', restored: wrong, revertsAuditId: log.id, players: entries.filter((e:any)=>!e.armband).map((e:any)=>e.raw) }),
          },
        });
        await tx.auditLog.update({ where: { id: log.id }, data: { revertedAt: new Date(), revertedByAuditId: rev.id } });
      });
    }
  }

  console.log(`\n${fixed} forfeit(s) ${APPLY ? 'reversed' : 'to reverse'}.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
