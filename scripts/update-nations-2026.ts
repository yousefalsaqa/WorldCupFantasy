/**
 * Sync the live database with the OFFICIAL 48-team
 * 2026 FIFA World Cup line-up (post inter-confederation playoffs).
 *
 * Behaviour:
 *   • Adds the 6 newly-qualified nations + a starter roster of players
 *     (idempotent – skips records that already exist).
 *   • Detects any nation in the DB that is NOT in the canonical 48
 *     and prints them out.
 *   • If invoked with `--delete`, removes those non-qualified nations
 *     (cascading through performances, transfers, squad picks, matches,
 *     players) so users can no longer see or pick them.
 *
 * Run:
 *   npx tsx scripts/update-nations-2026.ts             # dry-run (additions only)
 *   npx tsx scripts/update-nations-2026.ts --delete    # also purge non-qualifiers
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── 1. Canonical official 48 teams ───────────────────────────────────────────

const QUALIFIED_CODES = new Set<string>([
  // Group A
  'MEX', 'RSA', 'KOR', 'CZE',
  // Group B
  'CAN', 'BIH', 'QAT', 'SUI',
  // Group C
  'BRA', 'MAR', 'HAI', 'SCO',
  // Group D
  'USA', 'PAR', 'AUS', 'TUR',
  // Group E
  'GER', 'CUW', 'CIV', 'ECU',
  // Group F
  'NED', 'JPN', 'SWE', 'TUN',
  // Group G
  'BEL', 'EGY', 'IRN', 'NZL',
  // Group H
  'ESP', 'CPV', 'KSA', 'URU',
  // Group I
  'FRA', 'SEN', 'IRQ', 'NOR',
  // Group J
  'ARG', 'ALG', 'AUT', 'JOR',
  // Group K
  'POR', 'COD', 'UZB', 'COL',
  // Group L
  'ENG', 'CRO', 'GHA', 'PAN',
]);

// ── 2. Six newly-qualified nations to add ────────────────────────────────────

const newNations = [
  { name: 'Czechia',                code: 'CZE', group: 'A', kitColor1: '#11457E', kitColor2: '#D7141A' },
  { name: 'Bosnia & Herzegovina',   code: 'BIH', group: 'B', kitColor1: '#002F6C', kitColor2: '#FECB00' },
  { name: 'Türkiye',                code: 'TUR', group: 'D', kitColor1: '#E30A17', kitColor2: '#FFFFFF' },
  { name: 'Sweden',                 code: 'SWE', group: 'F', kitColor1: '#FECC02', kitColor2: '#006AA7' },
  { name: 'Iraq',                   code: 'IRQ', group: 'I', kitColor1: '#FFFFFF', kitColor2: '#CE1126' },
  { name: 'DR Congo',               code: 'COD', group: 'K', kitColor1: '#007FFF', kitColor2: '#F7D618' },
];

// Players for each new nation (~9 each)
const newPlayers = [
  // CZECHIA
  { firstName: 'Jindřich', lastName: 'Staněk', displayName: 'Staněk', nationCode: 'CZE', position: 'GK', price: 4.5, number: 1 },
  { firstName: 'Tomáš', lastName: 'Vlček', displayName: 'Vlček', nationCode: 'CZE', position: 'DEF', price: 4.5, number: 5 },
  { firstName: 'David', lastName: 'Zima', displayName: 'Zima', nationCode: 'CZE', position: 'DEF', price: 4.5, number: 4 },
  { firstName: 'Vladimír', lastName: 'Coufal', displayName: 'Coufal', nationCode: 'CZE', position: 'DEF', price: 4.5, number: 22 },
  { firstName: 'Tomáš', lastName: 'Souček', displayName: 'Souček', nationCode: 'CZE', position: 'MID', price: 6.5, number: 8 },
  { firstName: 'Pavel', lastName: 'Šulc', displayName: 'Šulc', nationCode: 'CZE', position: 'MID', price: 6.0, number: 11 },
  { firstName: 'Adam', lastName: 'Hložek', displayName: 'Hložek', nationCode: 'CZE', position: 'MID', price: 6.0, number: 15 },
  { firstName: 'Patrik', lastName: 'Schick', displayName: 'Schick', nationCode: 'CZE', position: 'FWD', price: 7.5, number: 9 },
  { firstName: 'Mojmír', lastName: 'Chytil', displayName: 'Chytil', nationCode: 'CZE', position: 'FWD', price: 5.5, number: 19 },

  // BOSNIA & HERZEGOVINA
  { firstName: 'Ibrahim', lastName: 'Šehić', displayName: 'Šehić', nationCode: 'BIH', position: 'GK', price: 4.5, number: 1 },
  { firstName: 'Sead', lastName: 'Kolašinac', displayName: 'Kolašinac', nationCode: 'BIH', position: 'DEF', price: 5.0, number: 23 },
  { firstName: 'Dennis', lastName: 'Hadžikadunić', displayName: 'Hadžikadunić', nationCode: 'BIH', position: 'DEF', price: 4.5, number: 5 },
  { firstName: 'Adrian', lastName: 'Leon Barišić', displayName: 'A. Barišić', nationCode: 'BIH', position: 'DEF', price: 4.5, number: 4 },
  { firstName: 'Miralem', lastName: 'Pjanić', displayName: 'Pjanić', nationCode: 'BIH', position: 'MID', price: 6.5, number: 10 },
  { firstName: 'Edin', lastName: 'Višća', displayName: 'Višća', nationCode: 'BIH', position: 'MID', price: 5.5, number: 7 },
  { firstName: 'Benjamin', lastName: 'Tahirović', displayName: 'Tahirović', nationCode: 'BIH', position: 'MID', price: 5.0, number: 8 },
  { firstName: 'Edin', lastName: 'Džeko', displayName: 'Džeko', nationCode: 'BIH', position: 'FWD', price: 7.5, number: 11 },
  { firstName: 'Ermedin', lastName: 'Demirović', displayName: 'Demirović', nationCode: 'BIH', position: 'FWD', price: 6.0, number: 9 },

  // TÜRKIYE
  { firstName: 'Uğurcan', lastName: 'Çakır', displayName: 'Çakır', nationCode: 'TUR', position: 'GK', price: 4.5, number: 1 },
  { firstName: 'Merih', lastName: 'Demiral', displayName: 'Demiral', nationCode: 'TUR', position: 'DEF', price: 5.0, number: 3 },
  { firstName: 'Çağlar', lastName: 'Söyüncü', displayName: 'Söyüncü', nationCode: 'TUR', position: 'DEF', price: 4.5, number: 4 },
  { firstName: 'Ferdi', lastName: 'Kadıoğlu', displayName: 'Kadıoğlu', nationCode: 'TUR', position: 'DEF', price: 5.0, number: 14 },
  { firstName: 'Hakan', lastName: 'Çalhanoğlu', displayName: 'Çalhanoğlu', nationCode: 'TUR', position: 'MID', price: 8.0, number: 10 },
  { firstName: 'Arda', lastName: 'Güler', displayName: 'A. Güler', nationCode: 'TUR', position: 'MID', price: 7.5, number: 8 },
  { firstName: 'Orkun', lastName: 'Kökçü', displayName: 'Kökçü', nationCode: 'TUR', position: 'MID', price: 6.0, number: 6 },
  { firstName: 'Kenan', lastName: 'Yıldız', displayName: 'Yıldız', nationCode: 'TUR', position: 'FWD', price: 8.0, number: 21 },
  { firstName: 'Cenk', lastName: 'Tosun', displayName: 'Tosun', nationCode: 'TUR', position: 'FWD', price: 6.0, number: 17 },

  // SWEDEN
  { firstName: 'Robin', lastName: 'Olsen', displayName: 'R. Olsen', nationCode: 'SWE', position: 'GK', price: 4.5, number: 1 },
  { firstName: 'Victor', lastName: 'Lindelöf', displayName: 'Lindelöf', nationCode: 'SWE', position: 'DEF', price: 5.0, number: 3 },
  { firstName: 'Gabriel', lastName: 'Gudmundsson', displayName: 'Gudmundsson', nationCode: 'SWE', position: 'DEF', price: 5.0, number: 13 },
  { firstName: 'Isak', lastName: 'Hien', displayName: 'Hien', nationCode: 'SWE', position: 'DEF', price: 5.0, number: 4 },
  { firstName: 'Dejan', lastName: 'Kulusevski', displayName: 'Kulusevski', nationCode: 'SWE', position: 'MID', price: 7.5, number: 21 },
  { firstName: 'Anthony', lastName: 'Elanga', displayName: 'Elanga', nationCode: 'SWE', position: 'MID', price: 6.5, number: 11 },
  { firstName: 'Lucas', lastName: 'Bergvall', displayName: 'Bergvall', nationCode: 'SWE', position: 'MID', price: 6.0, number: 8 },
  { firstName: 'Alexander', lastName: 'Isak', displayName: 'Isak', nationCode: 'SWE', position: 'FWD', price: 11.0, number: 9 },
  { firstName: 'Viktor', lastName: 'Gyökeres', displayName: 'Gyökeres', nationCode: 'SWE', position: 'FWD', price: 11.5, number: 23 },

  // DR CONGO
  { firstName: 'Lionel', lastName: 'Mpasi', displayName: 'Mpasi', nationCode: 'COD', position: 'GK', price: 4.0, number: 1 },
  { firstName: 'Chancel', lastName: 'Mbemba', displayName: 'Mbemba', nationCode: 'COD', position: 'DEF', price: 5.0, number: 4 },
  { firstName: 'Arthur', lastName: 'Masuaku', displayName: 'Masuaku', nationCode: 'COD', position: 'DEF', price: 4.5, number: 3 },
  { firstName: 'Axel', lastName: 'Tuanzebe', displayName: 'Tuanzebe', nationCode: 'COD', position: 'DEF', price: 4.5, number: 5 },
  { firstName: 'Charles', lastName: 'Pickel', displayName: 'Pickel', nationCode: 'COD', position: 'MID', price: 5.0, number: 6 },
  { firstName: 'Théo', lastName: 'Bongonda', displayName: 'Bongonda', nationCode: 'COD', position: 'MID', price: 5.5, number: 11 },
  { firstName: 'Yoane', lastName: 'Wissa', displayName: 'Wissa', nationCode: 'COD', position: 'FWD', price: 7.5, number: 18 },
  { firstName: 'Cédric', lastName: 'Bakambu', displayName: 'Bakambu', nationCode: 'COD', position: 'FWD', price: 6.5, number: 9 },
  { firstName: 'Fiston', lastName: 'Mayele', displayName: 'Mayele', nationCode: 'COD', position: 'FWD', price: 6.0, number: 17 },

  // IRAQ
  { firstName: 'Jalal', lastName: 'Hassan', displayName: 'Jalal Hassan', nationCode: 'IRQ', position: 'GK', price: 4.0, number: 1 },
  { firstName: 'Ali', lastName: 'Adnan', displayName: 'A. Adnan', nationCode: 'IRQ', position: 'DEF', price: 4.5, number: 3 },
  { firstName: 'Merchas', lastName: 'Doski', displayName: 'Doski', nationCode: 'IRQ', position: 'DEF', price: 4.5, number: 5 },
  { firstName: 'Zaid', lastName: 'Tahseen', displayName: 'Z. Tahseen', nationCode: 'IRQ', position: 'DEF', price: 4.5, number: 4 },
  { firstName: 'Amir', lastName: 'Al-Ammari', displayName: 'Al-Ammari', nationCode: 'IRQ', position: 'MID', price: 5.0, number: 8 },
  { firstName: 'Ibrahim', lastName: 'Bayesh', displayName: 'Bayesh', nationCode: 'IRQ', position: 'MID', price: 5.0, number: 10 },
  { firstName: 'Bashar', lastName: 'Resan', displayName: 'B. Resan', nationCode: 'IRQ', position: 'MID', price: 4.5, number: 6 },
  { firstName: 'Aymen', lastName: 'Hussein', displayName: 'A. Hussein', nationCode: 'IRQ', position: 'FWD', price: 5.5, number: 9 },
  { firstName: 'Mohanad', lastName: 'Ali', displayName: 'Mohanad Ali', nationCode: 'IRQ', position: 'FWD', price: 5.5, number: 11 },
];

async function main() {
  const shouldDelete = process.argv.includes('--delete');

  console.log('\n🌍  Sync to OFFICIAL 2026 World Cup line-up');
  console.log('───────────────────────────────────────────\n');

  // ── ADD: nations
  console.log('➕ Adding new nations...');
  const newNationIds: Record<string, string> = {};
  for (const n of newNations) {
    const existing = await prisma.nation.findFirst({ where: { code: n.code } });
    if (existing) {
      newNationIds[n.code] = existing.id;
      console.log(`   ⏭  ${n.name} (${n.code}) already exists`);
      continue;
    }
    const created = await prisma.nation.create({
      data: {
        name: n.name,
        code: n.code,
        group: n.group,
        kitColor1: n.kitColor1,
        kitColor2: n.kitColor2,
      },
    });
    newNationIds[n.code] = created.id;
    console.log(`   ✅ Added ${n.name} (${n.code}) → Group ${n.group}`);
  }

  // ── ADD: players
  console.log('\n⚽ Adding players for new nations...');
  let added = 0;
  for (const p of newPlayers) {
    const nationId =
      newNationIds[p.nationCode] ??
      (await prisma.nation.findFirst({ where: { code: p.nationCode } }))?.id;
    if (!nationId) continue;

    const existing = await prisma.player.findFirst({
      where: { displayName: p.displayName, nationId },
    });
    if (existing) continue;

    await prisma.player.create({
      data: {
        firstName: p.firstName,
        lastName: p.lastName,
        displayName: p.displayName,
        nationId,
        position: p.position,
        currentPrice: p.price,
        shirtNumber: p.number,
      },
    });
    added++;
  }
  console.log(`   ✅ Added ${added} new players\n`);

  // ── DETECT non-qualified nations still in DB
  const allNations = await prisma.nation.findMany({
    include: { _count: { select: { players: true } } },
  });
  const stale = allNations.filter(n => !QUALIFIED_CODES.has(n.code));

  if (stale.length === 0) {
    console.log('🎯 DB is already in sync with the official 48 teams.');
  } else {
    console.log('⚠️  Non-qualified nations currently in DB:');
    for (const n of stale) {
      console.log(`   • ${n.name} (${n.code}) – ${n._count.players} player(s)`);
    }

    if (!shouldDelete) {
      console.log('\n   Run again with `--delete` to remove them and their players.');
    } else {
      console.log('\n🗑  Deleting non-qualified nations...');
      for (const n of stale) {
        // Pull all players belonging to this nation
        const players = await prisma.player.findMany({ where: { nationId: n.id } });
        const playerIds = players.map(p => p.id);

        if (playerIds.length) {
          // Cascade: performances, squad picks, transfers
          await prisma.playerPerformance.deleteMany({ where: { playerId: { in: playerIds } } });
          await prisma.squadPlayer.deleteMany({ where: { playerId: { in: playerIds } } });
          await prisma.transfer.deleteMany({
            where: {
              OR: [
                { playerInId: { in: playerIds } },
                { playerOutId: { in: playerIds } },
              ],
            },
          });
          await prisma.player.deleteMany({ where: { id: { in: playerIds } } });
        }

        // Cascade matches the nation features in
        await prisma.match.deleteMany({
          where: { OR: [{ homeNationId: n.id }, { awayNationId: n.id }] },
        });

        await prisma.nation.delete({ where: { id: n.id } });
        console.log(`   ✅ Removed ${n.name} (${n.code})`);
      }
    }
  }

  // ── Summary
  const finalNationCount = await prisma.nation.count();
  const finalPlayerCount = await prisma.player.count();
  console.log('\n───────────────────────────────────────────');
  console.log('✅ Sync complete');
  console.log(`   Nations: ${finalNationCount} (target = 48)`);
  console.log(`   Players: ${finalPlayerCount}`);
  console.log('───────────────────────────────────────────\n');
}

main()
  .catch(e => {
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
