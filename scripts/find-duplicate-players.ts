// Find duplicate player rows (seed + sync twins). Two heuristics:
//   1. Known suspect pairs by nation.
//   2. Any two players on the same nation sharing the same apiFootballId
//      (a wrong mapping) or same last word of displayName + same position.
// Prints full identifying info incl. squad references so the merge can be
// planned safely. Read-only.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const players = await prisma.player.findMany({
    select: {
      id: true, displayName: true, position: true, currentPrice: true,
      apiFootballId: true, photoUrl: true, shirtNumber: true,
      nation: { select: { code: true } },
      _count: { select: { squadPlayers: true, performances: true } },
    },
  });

  // Group by nation + normalized last name token
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  const groups = new Map<string, typeof players>();
  for (const p of players) {
    const parts = p.displayName.split(' ');
    const last = norm(parts[parts.length - 1]);
    const key = `${p.nation?.code}|${last}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  console.log('=== Same nation + same (normalized) last name ===');
  for (const [key, g] of groups) {
    if (g.length < 2) continue;
    console.log(`\n${key}:`);
    for (const p of g) {
      console.log(
        `  ${p.displayName.padEnd(24)} ${p.position.padEnd(3)} £${p.currentPrice.toFixed(1).padStart(4)} api=${String(p.apiFootballId).padEnd(7)} photo=${p.photoUrl ? 'y' : 'N'} shirt=${String(p.shirtNumber).padEnd(4)} squads=${p._count.squadPlayers} perfs=${p._count.performances} id=${p.id}`,
      );
    }
  }

  // Duplicate apiFootballId across rows
  const byApi = new Map<number, typeof players>();
  for (const p of players) {
    if (p.apiFootballId == null) continue;
    if (!byApi.has(p.apiFootballId)) byApi.set(p.apiFootballId, []);
    byApi.get(p.apiFootballId)!.push(p);
  }
  console.log('\n=== Shared apiFootballId (live scoring would double-count) ===');
  let shared = 0;
  for (const [apiId, g] of byApi) {
    if (g.length < 2) continue;
    shared++;
    console.log(`api=${apiId}: ${g.map((p) => `${p.nation?.code} ${p.displayName} (${p.position}, £${p.currentPrice}, squads=${p._count.squadPlayers})`).join('  |  ')}`);
  }
  if (!shared) console.log('(none)');

  const noApi = players.filter((p) => p.apiFootballId == null);
  console.log(`\nPlayers with NO apiFootballId (never score points): ${noApi.length}`);
  for (const p of noApi) console.log(`  ${p.nation?.code} ${p.displayName} (${p.position}, £${p.currentPrice}, squads=${p._count.squadPlayers})`);
}

main().finally(() => prisma.$disconnect());
