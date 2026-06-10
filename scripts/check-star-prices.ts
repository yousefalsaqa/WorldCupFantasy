// One-off: spot-check prices of well-known players that likely came in via
// the API sync (and therefore sit on flat default prices).
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NAMES = [
  'Yamal', 'Pedri', 'Dembélé', 'Dembele', 'Vitinha', 'Raphinha', 'Rodri',
  'Palmer', 'Foden', 'Rice', 'Ødegaard', 'Odegaard', 'Osimhen', 'Lookman',
  'Hakimi', 'Kvaratskhelia', 'Olise', 'Wirtz', 'Kimmich', 'Valverde',
  'Mac Allister', 'Enzo', 'Griezmann', 'Lewandowski', 'Endrick', 'Rodrygo',
  'Pulisic', 'Davies', 'David', 'Gakpo', 'Depay', 'Szoboszlai', 'Hojlund',
  'Højlund', 'Aké', 'van Dijk', 'Virgil', 'Courtois', 'Alisson', 'Donnarumma',
  'Ederson', 'Martínez', 'Sané', 'Gnabry', 'Coman', 'Mount', 'Maddison',
];

async function main() {
  for (const n of NAMES) {
    const hits = await prisma.player.findMany({
      where: { displayName: { contains: n, mode: 'insensitive' } },
      select: { displayName: true, position: true, currentPrice: true, nation: { select: { code: true } } },
    });
    for (const h of hits) {
      console.log(`${h.displayName.padEnd(28)} ${h.nation?.code} ${h.position.padEnd(3)} £${h.currentPrice.toFixed(1)}m`);
    }
  }
}

main().finally(() => prisma.$disconnect());
