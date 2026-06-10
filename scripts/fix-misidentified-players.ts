// Fix misidentified player rows discovered on Jun 10 2026.
//
// The roster sync matched some seeded rows to the WRONG API player (name
// similarity): "Son" (KOR) is actually backup GK Song Bum-Keun, "B. Silva"
// (POR) is actually third GK Rui Silva, etc. Each row's apiFootballId is
// what live scoring keys on, so the identity (name/position/price) must
// match the API id, not the other way round. Verified against
// /players/profiles via scripts/identify-suspect-players.ts.
//
// None of these rows are referenced by any squad (checked), so position
// changes can't break a saved formation.
//
// Dry-run by default; --apply writes.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const FIXES: Array<{
  apiId: number;
  nation: string;
  expectOldName: string;
  set: { displayName: string; firstName: string; lastName: string; position: string; currentPrice: number };
}> = [
  {
    apiId: 34374, nation: 'KOR', expectOldName: 'Son',
    set: { displayName: 'Song Bum-Keun', firstName: 'Bum-Keun', lastName: 'Song', position: 'GK', currentPrice: 4.0 },
  },
  {
    apiId: 46672, nation: 'POR', expectOldName: 'B. Silva',
    set: { displayName: 'Rui Silva', firstName: 'Rui', lastName: 'Silva', position: 'GK', currentPrice: 4.5 },
  },
  {
    apiId: 390002, nation: 'MEX', expectOldName: 'Chávez',
    set: { displayName: 'M. Chávez', firstName: 'Mateo', lastName: 'Chávez', position: 'DEF', currentPrice: 4.5 },
  },
  {
    apiId: 198347, nation: 'ECU', expectOldName: 'E. Valencia',
    set: { displayName: 'A. Valencia', firstName: 'Anthony', lastName: 'Valencia', position: 'MID', currentPrice: 5.5 },
  },
  // The two Croatian Pašalićes are different real players — give them
  // unambiguous names so users don't pick the wrong one.
  {
    apiId: 2763, nation: 'CRO', expectOldName: 'Pašalić',
    set: { displayName: 'Mario Pašalić', firstName: 'Mario', lastName: 'Pašalić', position: 'MID', currentPrice: 6.5 },
  },
  {
    apiId: 260865, nation: 'CRO', expectOldName: 'M. Pasalic',
    set: { displayName: 'Marco Pašalić', firstName: 'Marco', lastName: 'Pašalić', position: 'MID', currentPrice: 6.5 },
  },
];

async function main() {
  console.log(APPLY ? 'APPLYING' : 'DRY RUN');
  for (const f of FIXES) {
    const row = await prisma.player.findFirst({
      where: { apiFootballId: f.apiId, nation: { code: f.nation } },
      include: { _count: { select: { squadPlayers: true } } },
    });
    if (!row) {
      console.log(`⚠ ${f.nation} api=${f.apiId}: row not found, skipping`);
      continue;
    }
    if (row.displayName !== f.expectOldName) {
      console.log(`⚠ ${f.nation} api=${f.apiId}: expected "${f.expectOldName}" but found "${row.displayName}" — skipping (re-check first)`);
      continue;
    }
    if (row._count.squadPlayers > 0) {
      console.log(`⚠ ${f.nation} "${row.displayName}" is in ${row._count.squadPlayers} squad(s) — skipping position change, FIX MANUALLY`);
      continue;
    }
    console.log(
      `${f.nation} "${row.displayName}" (${row.position} £${row.currentPrice}) → "${f.set.displayName}" (${f.set.position} £${f.set.currentPrice})`,
    );
    if (APPLY) {
      await prisma.player.update({ where: { id: row.id }, data: f.set });
    }
  }
  console.log(APPLY ? '✓ Applied.' : 'Re-run with --apply to write.');
}

main().finally(() => prisma.$disconnect());
