// Spot price adjustments (user call, launch morning).
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const TWEAKS: Array<[code: string, name: string, price: number]> = [
  ['BRA', 'Neymar', 8.0],     // plays for Santos now; was priced on the name
  ['ESP', 'David Raya', 5.5], // top keeper, was at default-ish 4.5
];

async function main() {
  for (const [code, name, price] of TWEAKS) {
    const r = await prisma.player.updateMany({
      where: { displayName: name, nation: { code } },
      data: { currentPrice: price },
    });
    console.log(`${code} ${name} -> £${price} (${r.count} row)`);
  }
}
main().finally(() => prisma.$disconnect());
