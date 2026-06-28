// Recompute every team's stored `teamValue` as the sum of its squad's
// purchasePrice (what the manager actually paid), matching the sell-refund +
// bank accounting. Admin reprices change Player.currentPrice only, so the old
// currentPrice-based teamValue drifted and broke the bank+value=£100 invariant
// for owners of repriced players.
//
// Dry-run by default; --apply writes. Flags any team whose bank+value still
// won't be ~£100 after the fix (would indicate a deeper accounting issue).

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

(async () => {
  const teams = await prisma.team.findMany({
    include: { squadPlayers: { select: { purchasePrice: true } }, user: { select: { username: true } } },
  });

  let changed = 0;
  const offInvariant: string[] = [];

  for (const t of teams) {
    if (t.squadPlayers.length === 0) continue; // no squad yet
    const paid = round1(t.squadPlayers.reduce((s, sp) => s + sp.purchasePrice, 0));
    const stored = round1(t.teamValue);
    const bankPlusVal = round1(t.bankBalance + paid);
    const drift = round1(stored - paid);

    if (Math.abs(drift) >= 0.05) {
      changed++;
      console.log(
        `${t.user?.username ?? t.id}: value ${stored} -> ${paid}  (drift ${drift > 0 ? '+' : ''}${drift})  | bank ${round1(t.bankBalance)} + value = ${bankPlusVal}`,
      );
      if (Math.abs(bankPlusVal - 100) >= 0.15) offInvariant.push(`${t.user?.username ?? t.id} (bank+value=${bankPlusVal})`);
      if (APPLY) {
        await prisma.team.update({ where: { id: t.id }, data: { teamValue: paid } });
      }
    }
  }

  console.log(`\n${changed} team(s) ${APPLY ? 'updated' : 'would change'}.`);
  if (offInvariant.length) {
    console.log(`\n⚠ Still not £100 after fix (investigate separately):\n  ${offInvariant.join('\n  ')}`);
  }
  await prisma.$disconnect();
  process.exit(0);
})();
