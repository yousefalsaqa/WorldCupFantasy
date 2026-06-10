// Reprice players for launch.
//
// Why: the API-Football sync created ~75% of the player pool at flat
// position defaults (GK 4.5 / DEF 5.0 / MID 6.5 / FWD 7.0), so stars like
// Lamine Yamal and Dembélé cost the same as a Curaçao backup. This script
// applies:
//   1. A curated price list for notable players, matched by EXACT
//      displayName + nation code (no fuzzy matching, no surprises).
//   2. A -0.5m discount for players on "minnow" nations who are still at
//      their position default — creates genuine budget fodder.
//
// Dry-run by default. `--apply` to write.
//
//   npx tsx scripts/reprice-players.ts
//   npx tsx scripts/reprice-players.ts --apply
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const DEFAULTS: Record<string, number> = { GK: 4.5, DEF: 5.0, MID: 6.5, FWD: 7.0 };

// Nations weak enough that their default-priced players become discount
// fodder. Seeded players with hand-set prices are untouched.
const TIER3 = new Set([
  'QAT', 'JOR', 'UZB', 'IRQ', 'NZL', 'PAN', 'HAI', 'CUW', 'CPV', 'COD',
  'RSA', 'TUN', 'KSA', 'BIH', 'AUS', 'IRN',
]);

// Curated prices. displayName must match the DB exactly.
const OVERRIDES: Array<[code: string, name: string, price: number]> = [
  // ── Spain
  ['ESP', 'Lamine Yamal', 13.5],
  ['ESP', 'Nico Williams', 9.0],
  ['ESP', 'Dani Olmo', 8.0],
  ['ESP', 'Mikel Oyarzabal', 8.0],
  ['ESP', 'Fabián Ruiz', 7.5],
  ['ESP', 'Álex Baena', 7.5],
  ['ESP', 'Martín Zubimendi', 7.0],
  ['ESP', 'Mikel Merino', 7.0],
  ['ESP', 'Pedro Porro', 5.5],
  ['ESP', 'Álex Grimaldo', 6.0],
  ['ESP', 'Marc Cucurella', 5.5],
  ['ESP', 'Pau Cubarsí Paredes', 5.5],
  ['ESP', 'David Raya', 5.0],
  // ── France
  ['FRA', 'Dembélé', 12.5],
  ['FRA', 'M. Olise', 9.5],
  ['FRA', 'D. Doué', 8.5],
  ['FRA', 'M. Thuram', 8.5],
  ['FRA', 'B. Barcola', 8.0],
  ['FRA', 'R. Cherki', 7.5],
  ['FRA', 'J. Mateta', 7.5],
  ['FRA', 'W. Zaïre-Emery', 7.0],
  ['FRA', 'M. Koné', 7.0],
  ['FRA', 'M. Akliouche', 7.0],
  ['FRA', 'Konaté', 5.5],
  // ── England
  ['ENG', 'Rice', 7.5],
  ['ENG', 'E. Eze', 7.5],
  ['ENG', 'A. Gordon', 7.5],
  ['ENG', 'Watkins', 7.5],
  ['ENG', 'M. Rogers', 7.5],
  ['ENG', 'M. Guéhi', 5.5],
  ['ENG', 'R. James', 5.5],
  ['ENG', 'Stones', 5.5],
  // ── Portugal
  ['POR', 'Vitinha', 9.5],
  ['POR', 'João Neves', 8.5],
  ['POR', 'Cristiano Ronaldo', 10.5],
  ['POR', 'João Félix', 7.5],
  ['POR', 'Pedro Neto', 7.5],
  ['POR', 'G. Ramos', 7.5],
  ['POR', 'Rúben Neves', 7.0],
  ['POR', 'Nuno Mendes', 6.0],
  ['POR', 'D. Costa', 5.0],
  // sync-created twin of the seeded "B. Silva" (8.5) — keep them aligned
  ['POR', 'Bernardo Silva', 8.5],
  // ── Germany
  ['GER', 'N. Woltemade', 8.0],
  ['GER', 'D. Undav', 7.5],
  ['GER', 'L. Sané', 7.0],
  ['GER', 'A. Pavlovic', 7.0],
  ['GER', 'Schlotterbeck', 5.5],
  ['GER', 'Tah', 5.0],
  // ── Brazil
  ['BRA', 'Raphinha', 10.0],
  ['BRA', 'Neymar', 10.0],
  ['BRA', 'Matheus Cunha', 8.0],
  ['BRA', 'Gabriel Martinelli', 7.5],
  ['BRA', 'Endrick', 7.5],
  ['BRA', 'Bruno Guimarães', 7.5],
  ['BRA', 'Gabriel Magalhães', 6.0],
  ['BRA', 'Ederson', 5.0],
  // ── Argentina
  ['ARG', 'J. Álvarez', 9.5],
  ['ARG', 'Mac Allister', 8.0],
  ['ARG', 'Enzo', 8.0],
  ['ARG', 'N. Paz', 8.0],
  ['ARG', 'T. Almada', 7.5],
  ['ARG', 'R. De Paul', 7.0],
  // ── Netherlands
  ['NED', 'R. Gravenberch', 7.5],
  ['NED', 'T. Reijnders', 7.5],
  ['NED', 'D. Dumfries', 6.0],
  ['NED', 'J. Timber', 5.5],
  ['NED', 'M. van de Ven', 5.5],
  ['NED', 'B. Verbruggen', 5.0],
  // ── Belgium
  ['BEL', 'J. Doku', 8.0],
  ['BEL', 'R. Lukaku', 8.5],
  ['BEL', 'De Ketelaere', 8.0],
  ['BEL', 'D. Lukebakio', 7.5],
  ['BEL', 'L. Trossard', 7.0],
  // ── Morocco
  ['MAR', 'Hakimi', 8.0],
  ['MAR', 'Brahim Díaz', 7.5],
  ['MAR', 'B. El Khannouss', 7.5],
  ['MAR', 'A. El Kaabi', 7.5],
  ['MAR', 'Aguerd', 5.5],
  ['MAR', 'N. Mazraoui', 5.5],
  // ── Norway
  ['NOR', 'A. Nusa', 7.5],
  // ── Korea (note: "Son" 9.5 is the seeded row; this aligns the sync twin)
  ['KOR', 'Son Heung-Min', 9.5],
  ['KOR', 'Lee Kang-in', 7.5],
  ['KOR', 'Kim Min-jae', 5.5],
  // ── Japan
  ['JPN', 'R. Doan', 7.0],
  ['JPN', 'Kamada', 7.0],
  ['JPN', 'A. Ueda', 7.5],
  // ── Egypt
  ['EGY', 'Marmoush', 9.0],
  // ── Senegal
  ['SEN', 'Jackson', 8.0],
  ['SEN', 'I. Sarr', 7.5],
  // ── Croatia
  ['CRO', 'Gvardiol', 6.0],
  ['CRO', 'Kramarić', 7.0],
  // ── Türkiye
  ['TUR', 'A. Güler', 8.5],
  ['TUR', 'K. Yildiz', 8.5],
  ['TUR', 'K. Aktürkoglu', 7.5],
  ['TUR', 'Kökçü', 7.0],
  // ── Uruguay
  ['URU', 'Valverde', 8.5],
  ['URU', 'Araújo', 6.0],
  ['URU', 'R. Bentancur', 7.0],
  ['URU', 'G. de Arrascaeta', 7.0],
  // ── Colombia
  ['COL', 'L. Díaz', 9.0],
  ['COL', 'J. Rodríguez', 7.5],
  ['COL', 'J. Córdoba', 7.5],
  ['COL', 'Lucumí', 5.5],
  ['COL', 'D. Muñoz', 6.0],
  // ── USA
  ['USA', 'Pulisic', 8.5],
  ['USA', 'F. Balogun', 7.5],
  ['USA', 'McKennie', 6.5],
  ['USA', 'Dest', 5.0],
  // ── Mexico
  ['MEX', 'S. Giménez', 7.5],
  // ── Switzerland
  ['SUI', 'Xhaka', 7.0],
  ['SUI', 'Embolo', 7.0],
  ['SUI', 'D. Ndoye', 7.5],
  ['SUI', 'G. Kobel', 5.0],
  // ── Sweden
  ['SWE', 'Elanga', 7.5],
  ['SWE', 'Bergvall', 7.0],
  ['SWE', 'Hien', 5.5],
  // ── Scotland
  ['SCO', 'McTominay', 8.0],
  ['SCO', 'Ferguson', 7.0],
  ['SCO', 'J.  McGinn', 7.0],
  ['SCO', 'C. Adams', 7.0],
  ['SCO', 'B. Doak', 7.0],
  ['SCO', 'Robertson', 5.5],
  // ── Austria
  ['AUT', 'Sabitzer', 7.0],
  ['AUT', 'Baumgartner', 7.0],
  ['AUT', 'Arnautović', 7.0],
  ['AUT', 'Laimer', 6.5],
  ['AUT', 'Danso', 5.5],
  // ── Czechia
  ['CZE', 'Schick', 8.0],
  ['CZE', 'Souček', 7.0],
  ['CZE', 'Hložek', 6.5],
  ['CZE', 'Coufal', 5.0],
  // ── Algeria
  ['ALG', 'Amoura', 7.5],
  ['ALG', 'Gouiri', 7.0],
  ['ALG', 'Aït-Nouri', 6.0],
  // ── Côte d'Ivoire
  ['CIV', 'A. Diallo', 8.0],
  ['CIV', 'N. Pépé', 7.5],
  ['CIV', 'A. Bonny', 7.5],
  ['CIV', 'E. Guessand', 7.5],
  ['CIV', 'Adingra', 7.0],
  ['CIV', 'Kessié', 7.0],
  ['CIV', 'S. Fofana', 7.0],
  // ── Ghana
  ['GHA', 'Semenyo', 8.5],
  // ── Ecuador
  ['ECU', 'Caicedo', 8.5],
  ['ECU', 'Páez', 7.5],
  // ── Canada
  ['CAN', 'J. David', 8.0],
  ['CAN', 'A. Davies', 6.0],
  ['CAN', 'T. Buchanan', 7.0],
];

async function main() {
  const players = await prisma.player.findMany({
    select: {
      id: true, displayName: true, position: true, currentPrice: true,
      nation: { select: { code: true } },
    },
  });

  const byKey = new Map<string, typeof players>();
  for (const p of players) {
    const key = `${p.nation?.code}|${p.displayName}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(p);
  }

  const changes: Array<{ id: string; name: string; code: string; from: number; to: number; why: string }> = [];
  const overridden = new Set<string>();
  const misses: string[] = [];

  for (const [code, name, price] of OVERRIDES) {
    const hits = byKey.get(`${code}|${name}`) || [];
    if (hits.length === 0) {
      misses.push(`${code} ${name}`);
      continue;
    }
    for (const p of hits) {
      overridden.add(p.id);
      if (p.currentPrice !== price) {
        changes.push({ id: p.id, name: p.displayName, code, from: p.currentPrice, to: price, why: 'curated' });
      }
    }
  }

  // Tier-3 discount: only players still sitting exactly on their position
  // default, and never curated ones.
  for (const p of players) {
    if (overridden.has(p.id)) continue;
    const code = p.nation?.code || '';
    if (!TIER3.has(code)) continue;
    if (p.currentPrice === DEFAULTS[p.position]) {
      changes.push({
        id: p.id, name: p.displayName, code,
        from: p.currentPrice, to: p.currentPrice - 0.5, why: 'tier3 -0.5',
      });
    }
  }

  changes.sort((a, b) => (b.to - b.from) - (a.to - a.from));
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${changes.length} price changes\n`);
  for (const c of changes) {
    const d = c.to - c.from;
    console.log(`  ${c.code} ${c.name.padEnd(26)} £${c.from.toFixed(1)} → £${c.to.toFixed(1)}  (${d > 0 ? '+' : ''}${d.toFixed(1)}) [${c.why}]`);
  }
  if (misses.length) {
    console.log(`\n⚠ ${misses.length} curated names NOT FOUND in DB:`);
    for (const m of misses) console.log(`  ${m}`);
  }

  if (APPLY) {
    for (const c of changes) {
      await prisma.player.update({ where: { id: c.id }, data: { currentPrice: c.to } });
    }
    console.log(`\n✓ Applied ${changes.length} updates.`);
  } else {
    console.log('\nDry run only. Re-run with --apply to write.');
  }
}

main().finally(() => prisma.$disconnect());
