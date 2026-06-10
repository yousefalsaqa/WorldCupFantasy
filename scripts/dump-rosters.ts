// One-off: dump rosters (name/pos/price) grouped by nation to a text file
// so a curated reprice list can be built against exact displayName strings.
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const nations = await prisma.nation.findMany({
    select: { code: true, name: true, players: { select: { displayName: true, position: true, currentPrice: true }, orderBy: { position: 'asc' } } },
    orderBy: { code: 'asc' },
  });
  let out = '';
  for (const n of nations) {
    out += `\n=== ${n.code} ${n.name} (${n.players.length}) ===\n`;
    for (const p of n.players) {
      out += `${p.position.padEnd(3)} £${p.currentPrice.toFixed(1).padStart(4)}m  ${p.displayName}\n`;
    }
  }
  fs.writeFileSync('rosters-dump.txt', out, 'utf8');
  console.log(`Wrote rosters-dump.txt (${nations.length} nations)`);
}

main().finally(() => prisma.$disconnect());
