// ============================================
// APPLY THE FIFA FANTASY SYNC (June 2026)
//
// Reads scripts/fifa-sync-plan.json (emitted by cross-check-fifa-prices.ts)
// and applies, in order:
//   1. Identity fixes — 5 rows whose displayName didn't match the player
//      their apiFootballId actually points to, + Eckert's official rename.
//      Positions corrected where factually wrong (Ito DEF, Diaw GK).
//   2. Availability — players cut from final squads -> isAvailable=false.
//   3. Prices — quantile-mapped expected price for everyone >= 0.7 off.
//   4. Additions — 5 squad players FIFA has that we lack.
//
// Deliberately NOT done: the ~130 bulk position alignments vs FIFA's
// classification — changing positions mid-round would invalidate locked
// formations. Revisit between rounds if ever.
//
// Dry-run by default; prints ownership impact for sensitive rows.
//   npx tsx --env-file=.env scripts/apply-fifa-sync.ts
//   npx tsx --env-file=.env scripts/apply-fifa-sync.ts --apply
// ============================================

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const plan: {
  priceChanges: Array<{ id: string; code: string; name: string; pos: string; from: number; to: number; fifa: number; band: string }>;
  cuts: Array<{ id: string; code: string; name: string }>;
} = JSON.parse(fs.readFileSync(path.join(__dirname, 'fifa-sync-plan.json'), 'utf8'));

// displayName is wrong on these rows — the apiFootballId is the truth.
// Verified against API-Football profiles + FIFA's official fantasy data.
const IDENTITY_FIXES: Array<{
  code: string; oldName: string; newName: string;
  firstName?: string; lastName?: string; position?: string;
}> = [
  { code: 'JPN', oldName: 'Mitoma', newName: 'H. Ito', firstName: 'Hiroki', lastName: 'Ito', position: 'DEF' },
  { code: 'SEN', oldName: 'Dia', newName: 'M. Diaw', firstName: 'Mory', lastName: 'Diaw', position: 'GK' },
  { code: 'KOR', oldName: 'Hwang H-C', newName: 'Kim Moon-Hwan', firstName: 'Moon-Hwan', lastName: 'Kim' },
  { code: 'CPV', oldName: 'K. Rocha', newName: 'CJ dos Santos', firstName: 'Carlos Joaquim', lastName: 'dos Santos' },
  { code: 'JOR', oldName: 'Al-Rawabdeh', newName: "I. Sa'deh", firstName: 'Ibrahim', lastName: "Sa'deh" },
  // took Iranian citizenship May 2026, FIFA shirt name "Dargahi"
  { code: 'IRN', oldName: 'D. Eckert Ayensa', newName: 'D. Dargahi', firstName: 'Dennis', lastName: 'Dargahi' },
];

// FIFA squad players we lack. Prices = quantile-mapped FIFA price, same
// scale as the plan's repricing. Maknzi has no API-Football id (Iraqi
// league coverage) — backfill from day-of lineups.
const ADDITIONS: Array<{
  code: string; displayName: string; firstName: string; lastName: string;
  position: string; price: number; apiFootballId: number | null;
}> = [
  { code: 'NED', displayName: 'L. Geertruida', firstName: 'Lutsharel', lastName: 'Geertruida', position: 'DEF', apiFootballId: 37143, price: 4.5 },
  { code: 'GER', displayName: 'A. Ouédraogo', firstName: 'Assan', lastName: 'Ouédraogo', position: 'MID', apiFootballId: 380978, price: 5.0 },
  { code: 'BRA', displayName: 'Éderson', firstName: 'Éderson', lastName: 'dos Santos Lourenço da Silva', position: 'MID', apiFootballId: 10097, price: 6.5 },
  { code: 'JOR', displayName: 'Mohammad Taha', firstName: 'Mohammad', lastName: 'Taha', position: 'DEF', apiFootballId: 601853, price: 3.5 },
  { code: 'IRQ', displayName: 'A. Maknzi', firstName: 'Ahmed Hasan', lastName: 'Maknzi', position: 'DEF', apiFootballId: null, price: 3.5 },
];

async function main() {
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} FIFA sync\n`);

  // ---- ownership impact for sensitive rows (identity fixes + cuts)
  const sensitiveNames = [
    ...IDENTITY_FIXES.map((f) => ({ code: f.code, name: f.oldName })),
    ...plan.cuts.map((c) => ({ code: c.code, name: c.name })),
  ];
  console.log('— Ownership impact (squads holding these rows):');
  for (const s of sensitiveNames) {
    const p = await prisma.player.findFirst({
      where: { displayName: s.name, nation: { code: s.code } },
      select: { id: true, _count: { select: { squadPlayers: true } } },
    });
    console.log(`  ${s.code} ${s.name.padEnd(20)} owned by ${p?._count.squadPlayers ?? '?'} squad slots`);
  }

  // ---- 1. identity fixes
  console.log('\n— Identity fixes:');
  for (const f of IDENTITY_FIXES) {
    const p = await prisma.player.findFirst({
      where: { displayName: f.oldName, nation: { code: f.code } },
    });
    if (!p) { console.log(`  ✗ ${f.code} ${f.oldName}: NOT FOUND, skipping`); continue; }
    const data: Record<string, unknown> = {
      displayName: f.newName,
      ...(f.firstName ? { firstName: f.firstName } : {}),
      ...(f.lastName ? { lastName: f.lastName } : {}),
      ...(f.position ? { position: f.position } : {}),
    };
    console.log(`  ${f.code} ${f.oldName} -> ${f.newName}${f.position && f.position !== p.position ? ` (${p.position} -> ${f.position})` : ''}`);
    if (APPLY) await prisma.player.update({ where: { id: p.id }, data });
  }

  // ---- 2. cuts -> unavailable
  console.log('\n— Cut from final squads (isAvailable=false):');
  for (const c of plan.cuts) {
    console.log(`  ${c.code} ${c.name}`);
    if (APPLY) {
      await prisma.player.update({
        where: { id: c.id },
        data: { isAvailable: false, availabilityNote: 'Not in final World Cup squad' },
      });
    }
  }

  // ---- 3. prices
  const ups = plan.priceChanges.filter((c) => c.to > c.from);
  const downs = plan.priceChanges.filter((c) => c.to < c.from);
  console.log(`\n— Price changes: ${plan.priceChanges.length} (${ups.length} up, ${downs.length} down)`);
  for (const band of ['FLAG', 'LOG']) {
    const rows = plan.priceChanges.filter((c) => c.band === band)
      .sort((a, b) => (a.to - a.from) - (b.to - b.from));
    console.log(`  [${band}] ${rows.length} players`);
    for (const c of rows) {
      const d = c.to - c.from;
      console.log(`    ${c.code} ${c.name.padEnd(26)} £${c.from.toFixed(1)} -> £${c.to.toFixed(1)} (${d > 0 ? '+' : ''}${d.toFixed(1)})`);
    }
  }
  if (APPLY) {
    for (const c of plan.priceChanges) {
      await prisma.player.update({ where: { id: c.id }, data: { currentPrice: c.to } });
    }
  }

  // ---- 4. additions
  console.log('\n— Additions:');
  for (const a of ADDITIONS) {
    const nation = await prisma.nation.findUnique({ where: { code: a.code } });
    if (!nation) { console.log(`  ✗ nation ${a.code} not found?!`); continue; }
    const dupe = a.apiFootballId
      ? await prisma.player.findUnique({ where: { apiFootballId: a.apiFootballId } })
      : await prisma.player.findFirst({ where: { displayName: a.displayName, nationId: nation.id } });
    if (dupe) { console.log(`  = ${a.code} ${a.displayName} already exists (${dupe.displayName}), skipping`); continue; }
    console.log(`  + ${a.code} ${a.displayName} ${a.position} £${a.price.toFixed(1)} apiId=${a.apiFootballId ?? 'none'}`);
    if (APPLY) {
      await prisma.player.create({
        data: {
          displayName: a.displayName, firstName: a.firstName, lastName: a.lastName,
          position: a.position, currentPrice: a.price, nationId: nation.id,
          apiFootballId: a.apiFootballId, isAvailable: true,
          photoUrl: a.apiFootballId ? `https://media.api-sports.io/football/players/${a.apiFootballId}.png` : null,
        },
      });
    }
  }

  console.log(`\n${APPLY ? '✓ Applied.' : 'Dry run only — re-run with --apply to write.'}`);
}

main().finally(() => prisma.$disconnect());
