// One-off round 5: every Ouédraogo in API-Football, hunting Assan (GER, b. 2006).
//   npx tsx --env-file=.env scripts/find-api-ids.ts
const API_KEY = process.env.API_FOOTBALL_KEY || '';

async function api(path: string) {
  const res = await fetch(`https://v3.football.api-sports.io${path}`, {
    headers: { 'x-apisports-key': API_KEY },
  });
  if (!res.ok) { console.log(`HTTP ${res.status} for ${path}`); return []; }
  const data = await res.json();
  await new Promise((r) => setTimeout(r, 300));
  return data.response || [];
}

async function main() {
  const rows = await api('/players/profiles?search=ouedraogo');
  console.log(`${rows.length} results`);
  for (const r of rows) {
    const p = r.player;
    console.log(`  id=${p.id} ${p.firstname} ${p.lastname} (${p.name}) nat=${p.nationality} born=${p.birth?.date} pos=${p.position}`);
  }
  // also check the German squad by direct player search within team 25 (national)
  const ger = await api('/players?team=25&search=ouedraogo&season=2026');
  console.log(`\nGER team search: ${ger.length}`);
  for (const r of ger) console.log(`  id=${r.player.id} ${r.player.name} nat=${r.player.nationality} born=${r.player.birth?.date}`);
}

main();
