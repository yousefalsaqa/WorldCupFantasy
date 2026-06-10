// Uniform price cut: -0.5 to every player (user call, Jun 10 2026).
// Keeps all relative pricing identical; effectively gives every squad
// ~7.5m more budget. Run while no squads exist so purchasePrice never
// disagrees with the pool. Dry-run by default; --apply writes.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function main() {
  const before = await prisma.player.aggregate({
    _min: { currentPrice: true }, _max: { currentPrice: true }, _avg: { currentPrice: true }, _count: true,
  });
  console.log(`BEFORE: ${before._count} players, min £${before._min.currentPrice}, max £${before._max.currentPrice}, avg £${before._avg.currentPrice?.toFixed(2)}`);

  if (!APPLY) {
    console.log('DRY RUN: would decrement every currentPrice by 0.5. --apply to write.');
    return;
  }

  const res = await prisma.player.updateMany({ data: { currentPrice: { decrement: 0.5 } } });
  const after = await prisma.player.aggregate({
    _min: { currentPrice: true }, _max: { currentPrice: true }, _avg: { currentPrice: true },
  });
  console.log(`Updated ${res.count} players.`);
  console.log(`AFTER: min £${after._min.currentPrice}, max £${after._max.currentPrice}, avg £${after._avg.currentPrice?.toFixed(2)}`);
}

main().finally(() => prisma.$disconnect());
