import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const unmapped = await prisma.player.findMany({
    where: { apiFootballId: null },
    include: { nation: true, squadPlayers: true },
    orderBy: [{ nationId: 'asc' }, { displayName: 'asc' }],
  });

  console.log(`Players WITHOUT apiFootballId: ${unmapped.length}\n`);
  let owned = 0;
  const byNation = new Map<string, string[]>();
  for (const p of unmapped) {
    const ownedTag = p.squadPlayers.length > 0 ? ` [OWNED by ${p.squadPlayers.length} team(s)]` : '';
    if (p.squadPlayers.length > 0) owned++;
    const list = byNation.get(p.nation.code) ?? [];
    list.push(`${p.displayName} (${p.position}, £${p.currentPrice}m)${ownedTag}`);
    byNation.set(p.nation.code, list);
  }
  for (const [code, list] of byNation) {
    console.log(`${code}: ${list.join(', ')}`);
  }
  console.log(`\nOf these, ${owned} are currently in someone's fantasy squad.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
