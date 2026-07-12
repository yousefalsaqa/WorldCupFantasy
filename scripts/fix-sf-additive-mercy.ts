// Retroactive correction: the QF->SF stage transition fired against
// production code that predates the SF-only additive-mercy fix
// (commit 7fb066e, not yet pushed when the live cron settled QF).
// Every team with eliminated-nation players got the OLD "mercy replaces
// banked" result instead of the new "mercy stacks on banked" result.
//
// Reconstructs each team's `banked` (pre-mercy) value algebraically from
// the already-stored QF TeamStage row (eliminatedCount, mercyTransfers)
// and the team's current freeTransfers, then re-applies the additive
// formula: freeTransfers = banked + eliminatedCount, mercyTransfers =
// eliminatedCount. Idempotent — a team already matching the additive
// result has delta 0 and is skipped.
import { prisma } from '../src/lib/db';

const APPLY = process.argv.includes('--apply');

async function main() {
  const qf = await prisma.stage.findFirstOrThrow({ where: { stageId: 'QF' } });
  const admin = await prisma.user.findFirstOrThrow({ where: { isAdmin: true } });
  const teams = await prisma.team.findMany({ select: { id: true, name: true, freeTransfers: true } });

  let changed = 0;
  for (const t of teams) {
    const ts = await prisma.teamStage.findFirst({ where: { teamId: t.id, stageId: qf.id } });
    if (!ts || ts.eliminatedCount === 0) continue;

    const oldFT = t.freeTransfers;
    const eliminated = ts.eliminatedCount;
    const banked = ts.mercyTransfers > 0 ? eliminated - ts.mercyTransfers : oldFT;
    const additiveFT = banked + eliminated;
    const delta = additiveFT - oldFT;
    if (delta === 0) {
      console.log(`  SKIP  ${t.name} — already correct`);
      continue;
    }

    console.log(`  ${APPLY ? 'APPLY' : 'DRY  '} ${t.name.padEnd(24)} banked=${banked} eliminated=${eliminated} freeTransfers ${oldFT} -> ${additiveFT}`);

    if (APPLY) {
      await prisma.team.update({ where: { id: t.id }, data: { freeTransfers: additiveFT } });
      await prisma.teamStage.update({ where: { id: ts.id }, data: { mercyTransfers: eliminated } });
      await prisma.auditLog.create({
        data: {
          userId: admin.id,
          action: 'ADMIN_SF_ADDITIVE_MERCY_CORRECTION',
          details: JSON.stringify({
            teamId: t.id,
            teamName: t.name,
            reason: 'QF->SF transition ran on pre-fix (non-additive) mercy logic before commit 7fb066e was deployed; retroactively applying additive mercy',
            banked,
            eliminatedCount: eliminated,
            oldFreeTransfers: oldFT,
            newFreeTransfers: additiveFT,
            delta,
          }),
        },
      });
      changed++;
    }
  }

  console.log(`\n${APPLY ? `Applied to ${changed} teams.` : 'Dry run only — re-run with --apply.'}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
