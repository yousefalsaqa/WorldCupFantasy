// One-off: how are player prices distributed? Run with:
//   npx tsx scripts/check-prices.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const players = await prisma.player.findMany({
    select: { displayName: true, position: true, currentPrice: true, nation: { select: { code: true } } },
  });
  console.log(`Total players: ${players.length}`);

  for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
    const ps = players.filter((p) => p.position === pos);
    const byPrice = new Map<number, number>();
    for (const p of ps) byPrice.set(p.currentPrice, (byPrice.get(p.currentPrice) || 0) + 1);
    const dist = [...byPrice.entries()].sort((a, b) => b[0] - a[0]);
    console.log(`\n${pos} (${ps.length}):`);
    for (const [price, count] of dist) console.log(`  £${price.toFixed(1)}m × ${count}`);
  }

  // Top 20 priciest for sanity
  const top = [...players].sort((a, b) => b.currentPrice - a.currentPrice).slice(0, 20);
  console.log('\nTop 20:');
  for (const p of top) console.log(`  ${p.displayName} (${p.nation?.code} ${p.position}) £${p.currentPrice.toFixed(1)}m`);
}

main().finally(() => prisma.$disconnect());
