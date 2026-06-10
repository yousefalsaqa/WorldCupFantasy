import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [nations, players, matches, users, teams, playersMapped, nationsMapped, matchesMapped] =
    await Promise.all([
      prisma.nation.count(),
      prisma.player.count(),
      prisma.match.count(),
      prisma.user.count(),
      prisma.team.count(),
      prisma.player.count({ where: { apiFootballId: { not: null } } }),
      prisma.nation.count({ where: { apiFootballId: { not: null } } }),
      prisma.match.count({ where: { apiFootballId: { not: null } } }),
    ]);

  console.log(`Nations: ${nations} (${nationsMapped} with API-Football id)`);
  console.log(`Players: ${players} (${playersMapped} with API-Football id)`);
  console.log(`Matches: ${matches} (${matchesMapped} with API-Football id)`);
  console.log(`Users: ${users}, Teams: ${teams}`);

  const byNation = await prisma.player.groupBy({ by: ['nationId'], _count: true });
  const nationRows = await prisma.nation.findMany({ select: { id: true, code: true } });
  const codeById = new Map(nationRows.map((n) => [n.id, n.code]));
  const counts = byNation
    .map((b) => ({ code: codeById.get(b.nationId), n: b._count }))
    .sort((a, b) => b.n - a.n);

  console.log('\nPlayers per nation:');
  console.log(counts.map((c) => `${c.code}:${c.n}`).join('  '));

  const withPlayers = new Set(byNation.map((b) => b.nationId));
  const zero = nationRows.filter((n) => !withPlayers.has(n.id)).map((n) => n.code);
  console.log(`\nNations with ZERO players (${zero.length}): ${zero.join(' ') || 'none'}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
