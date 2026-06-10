// Sanity-check the repriced pool: what does the cheapest legal 15 cost,
// and how many premium players can a squad realistically fit?
// Legal squad: 2 GK, 5 DEF, 5 MID, 3 FWD, max 3 per nation, £100m.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const NEED: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };

function cheapestSquad(players: { position: string; currentPrice: number; code: string }[]) {
  const sorted = [...players].sort((a, b) => a.currentPrice - b.currentPrice);
  const taken: typeof players = [];
  const posCount: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const natCount: Record<string, number> = {};
  for (const p of sorted) {
    if (posCount[p.position] >= NEED[p.position]) continue;
    if ((natCount[p.code] || 0) >= 3) continue;
    taken.push(p);
    posCount[p.position]++;
    natCount[p.code] = (natCount[p.code] || 0) + 1;
    if (taken.length === 15) break;
  }
  return taken;
}

async function main() {
  const players = (await prisma.player.findMany({
    select: { displayName: true, position: true, currentPrice: true, nation: { select: { code: true } } },
  })).map((p) => ({ ...p, code: p.nation?.code || '?' }));

  const cheapest = cheapestSquad(players);
  const cheapestCost = cheapest.reduce((s, p) => s + p.currentPrice, 0);
  console.log(`Cheapest legal 15: £${cheapestCost.toFixed(1)}m`);
  console.log(`Headroom above cheapest: £${(100 - cheapestCost).toFixed(1)}m\n`);

  for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
    const ps = players.filter((p) => p.position === pos).map((p) => p.currentPrice).sort((a, b) => a - b);
    const med = ps[Math.floor(ps.length / 2)];
    console.log(`${pos}: min £${ps[0]} | median £${med} | max £${ps[ps.length - 1]}`);
  }

  // How much budget is left for the other 12 if you take the top-3 priciest?
  const top = [...players].sort((a, b) => b.currentPrice - a.currentPrice);
  const trio = top.slice(0, 3);
  const trioCost = trio.reduce((s, p) => s + p.currentPrice, 0);
  // cheapest 12 to complete: remove the trio's positions from need
  const needLeft = { ...NEED };
  for (const t of trio) needLeft[t.position]--;
  const sorted = [...players].sort((a, b) => a.currentPrice - b.currentPrice);
  const fill: typeof players = [];
  const posCount: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const natCount: Record<string, number> = {};
  for (const t of trio) natCount[t.code] = (natCount[t.code] || 0) + 1;
  for (const p of sorted) {
    if (trio.includes(p)) continue;
    if (posCount[p.position] >= needLeft[p.position]) continue;
    if ((natCount[p.code] || 0) >= 3) continue;
    fill.push(p);
    posCount[p.position]++;
    natCount[p.code] = (natCount[p.code] || 0) + 1;
    if (fill.length === 12) break;
  }
  const fillCost = fill.reduce((s, p) => s + p.currentPrice, 0);
  console.log(`\nTop-3 premiums: ${trio.map((t) => `${t.displayName} £${t.currentPrice}`).join(', ')} = £${trioCost.toFixed(1)}m`);
  console.log(`+ cheapest legal 12 to finish = £${fillCost.toFixed(1)}m`);
  console.log(`TOTAL = £${(trioCost + fillCost).toFixed(1)}m ${trioCost + fillCost <= 100 ? '(fits!)' : '(does NOT fit)'}`);
}

main().finally(() => prisma.$disconnect());
