// ============================================
// LOWER PREMIUM PRICES — every player over £10m drops £1m.
//
// Affects Player.currentPrice only (the market/buy price). Squad purchasePrice
// and team banks are untouched, so the £100m budget invariant is preserved —
// owners keep their cost basis, new buyers just pay £1m less. Timed for the R32
// free-rebuild window so anyone can re-pick the cheaper premiums for free.
//
//   npx tsx --env-file=.env scripts/lower-premium-prices.ts          (dry run)
//   npx tsx --env-file=.env scripts/lower-premium-prices.ts --apply  (write)
// ============================================
import { prisma } from '../src/lib/db';

const APPLY = process.argv.includes('--apply');
const THRESHOLD = 10; // strictly over £10m
const CUT = 1;

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN'}\n`);
  const players = await prisma.player.findMany({
    where: { currentPrice: { gt: THRESHOLD } },
    select: { id: true, displayName: true, currentPrice: true, nation: { select: { code: true } } },
    orderBy: { currentPrice: 'desc' },
  });
  console.log(`Players over £${THRESHOLD}m: ${players.length}\n`);
  for (const p of players) {
    const next = Math.round((p.currentPrice - CUT) * 10) / 10;
    console.log(`  ${p.displayName.padEnd(22)} ${p.nation.code}  £${p.currentPrice.toFixed(1)} -> £${next.toFixed(1)}`);
    if (APPLY) {
      await prisma.player.update({ where: { id: p.id }, data: { currentPrice: next } });
    }
  }
  console.log(`\n${APPLY ? `APPLIED — ${players.length} players cut £${CUT}m.` : 'DRY RUN — nothing written. Re-run with --apply.'}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
