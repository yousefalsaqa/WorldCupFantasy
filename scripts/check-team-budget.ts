// One-off: inspect every team's budget math after the repricing.
// Shows purchase-price total (what they paid) vs current-price total
// (today's market value) vs stored bankBalance/teamValue.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const teams = await prisma.team.findMany({
    include: {
      user: { select: { username: true } },
      squadPlayers: { include: { player: { select: { displayName: true, currentPrice: true } } } },
    },
  });
  for (const t of teams) {
    const paid = t.squadPlayers.reduce((s, sp) => s + sp.purchasePrice, 0);
    const market = t.squadPlayers.reduce((s, sp) => s + sp.player.currentPrice, 0);
    console.log(`${t.user.username} / "${t.name}": players=${t.squadPlayers.length}`);
    console.log(`  paid (purchasePrice sum) = £${paid.toFixed(1)}m`);
    console.log(`  market (currentPrice sum) = £${market.toFixed(1)}m`);
    console.log(`  stored bankBalance = £${t.bankBalance.toFixed(1)}m, stored teamValue = £${t.teamValue.toFixed(1)}m`);
    console.log(`  paid + bank = £${(paid + t.bankBalance).toFixed(1)}m (should be <= 100 at build time)`);
    const repriced = t.squadPlayers
      .filter((sp) => sp.purchasePrice !== sp.player.currentPrice)
      .map((sp) => `${sp.player.displayName} ${sp.purchasePrice}->${sp.player.currentPrice}`);
    if (repriced.length) console.log(`  repriced since purchase: ${repriced.join(', ')}`);
  }
}

main().finally(() => prisma.$disconnect());
