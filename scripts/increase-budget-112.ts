// Raise every team's budget from £109m to £112m for the SF: +£3.0m to the
// bank, initialBudget stamped to 112. Idempotent — teams already at
// initialBudget=112 are skipped, so a re-run can't double-pay anyone.
// Any active Free Hit snapshot gets its stored bank bumped too (the
// snapshot REPLACES the bank at the rollover, which would silently
// undo the raise). Mirrors scripts/increase-budget-109.ts.
//
// Dry-run by default; pass --apply to write.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const RAISE = 3.0;
const NEW_BUDGET = 112.0;

async function main() {
  const teams = await prisma.team.findMany({
    select: { id: true, name: true, initialBudget: true, bankBalance: true, teamValue: true, freeHitSnapshot: true },
    orderBy: { name: 'asc' },
  });

  let changed = 0;
  for (const t of teams) {
    if (t.initialBudget >= NEW_BUDGET) {
      console.log(`  SKIP  ${t.name} — already at ${t.initialBudget}`);
      continue;
    }
    const newBank = Math.round((t.bankBalance + RAISE) * 10) / 10;
    console.log(`  ${APPLY ? 'APPLY' : 'DRY  '} ${t.name.padEnd(24)} bank ${t.bankBalance} -> ${newBank}  (value=${t.teamValue}, total=${Math.round((newBank + t.teamValue) * 10) / 10})`);

    let fhSnapshot: string | undefined;
    if (t.freeHitSnapshot) {
      try {
        const snap = JSON.parse(t.freeHitSnapshot);
        snap.bankBalance = Math.round((snap.bankBalance + RAISE) * 10) / 10;
        fhSnapshot = JSON.stringify(snap);
        console.log(`        ^ also bumping Free Hit snapshot bank to ${snap.bankBalance}`);
      } catch {
        console.log('        ^ WARNING: unparseable freeHitSnapshot left untouched');
      }
    }

    if (APPLY) {
      await prisma.team.update({
        where: { id: t.id },
        data: {
          initialBudget: NEW_BUDGET,
          bankBalance: newBank,
          ...(fhSnapshot ? { freeHitSnapshot: fhSnapshot } : {}),
        },
      });
      changed += 1;
    }
  }

  if (APPLY && changed > 0) {
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'BUDGET_INCREASED',
        details: JSON.stringify({ from: 109, to: NEW_BUDGET, raise: RAISE, teams: changed }),
      },
    });
  }
  console.log(`\n${APPLY ? `Applied to ${changed} teams + audit log written.` : `Dry run only — ${teams.filter((t) => t.initialBudget < NEW_BUDGET).length} teams would change. Re-run with --apply.`}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
