// Audit every player's position against API-Football's official squad data
// and fix mismatches (seeded rows kept their hand-typed position even when
// the API disagreed — e.g. Gonçalo Ramos stored as MID).
//   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/fix-positions.ts --apply
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const API_KEY = process.env.API_FOOTBALL_KEY || '';

const POS: Record<string, string> = {
  Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Attacker: 'FWD',
};

// API-Football's own squad data is occasionally absurd. These ids keep the
// DB position (verified by eye: Mitoma is not a DEF, Boulaye Dia is not a
// GK, Mohanad Ali is a striker, Al-Ghannam is a right-back, M. Hosseini is
// a centre-back).
const KEEP_DB_POSITION = new Set<string>([
  'JPN|Mitoma', 'SEN|Dia', 'IRQ|Mohanad Ali', 'KSA|Al-Ghannam', 'IRN|M. Hosseini',
]);

async function main() {
  const nations = await prisma.nation.findMany({
    where: { apiFootballId: { not: null } },
    select: { code: true, apiFootballId: true },
  });

  let checked = 0, fixed = 0, inSquadSkipped = 0;
  for (const n of nations) {
    const res = await fetch(
      `https://v3.football.api-sports.io/players/squads?team=${n.apiFootballId}`,
      { headers: { 'x-apisports-key': API_KEY } },
    );
    const data = await res.json();
    const apiPlayers: Array<{ id: number; position: string }> = data.response?.[0]?.players ?? [];
    for (const ap of apiPlayers) {
      const want = POS[ap.position];
      if (!want) continue;
      const row = await prisma.player.findUnique({
        where: { apiFootballId: ap.id },
        select: { id: true, displayName: true, position: true, _count: { select: { squadPlayers: true } } },
      });
      if (!row) continue;
      checked++;
      if (row.position === want) continue;
      if (KEEP_DB_POSITION.has(`${n.code}|${row.displayName}`)) {
        console.log(`KEEP ${n.code} ${row.displayName} as ${row.position} (API says ${want}, API is wrong)`);
        continue;
      }
      if (row._count.squadPlayers > 0) {
        console.log(`⚠ SKIP (in a squad): ${n.code} ${row.displayName} ${row.position} -> ${want} — fix manually after owner adjusts`);
        inSquadSkipped++;
        continue;
      }
      console.log(`${n.code} ${row.displayName}: ${row.position} -> ${want}`);
      fixed++;
      if (APPLY) {
        await prisma.player.update({ where: { id: row.id }, data: { position: want } });
      }
    }
  }
  console.log(`\n${APPLY ? 'Applied' : 'DRY RUN'}: checked ${checked}, mismatches ${fixed}, skipped-in-squad ${inSquadSkipped}`);
}

main().finally(() => prisma.$disconnect());
