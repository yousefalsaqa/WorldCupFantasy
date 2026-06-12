// Set a match's predicted lineups from the command line (same matching
// logic as the admin UI — shared via src/lib/predicted-lineups.ts).
//
// Usage: edit the INPUT block below (home/away codes + 11 names each,
// transcribed from FotMob or similar), then:
//   npx tsx scripts/set-predicted-lineup.ts          # preview matching
//   npx tsx scripts/set-predicted-lineup.ts --apply  # save to the match
//
// Names can be editorial short forms ("Son", "Kim Min-jae", "H. Ito") —
// ambiguous names are reported, nothing saves unless both sides match 11.
import { PrismaClient } from '@prisma/client';
import { matchNamesToNationPlayers, type PredictedLineups } from '../src/lib/predicted-lineups';

const prisma = new PrismaClient();

// ============ INPUT — edit per matchday ============
const INPUT = {
  homeCode: 'CAN',
  awayCode: 'BIH',
  homeFormation: '4-3-3',
  awayFormation: '4-2-3-1',
  homeNames: [] as string[], // 11 names, GK first
  awayNames: [] as string[],
};
// ===================================================

async function main() {
  const apply = process.argv.includes('--apply');

  const match = await prisma.match.findFirst({
    where: {
      homeNation: { code: INPUT.homeCode },
      awayNation: { code: INPUT.awayCode },
      isFinished: false,
    },
    orderBy: { kickoffTime: 'asc' },
    select: {
      id: true,
      kickoffTime: true,
      homeNationId: true,
      awayNationId: true,
    },
  });
  if (!match) {
    console.error(`No unfinished ${INPUT.homeCode}-${INPUT.awayCode} match found`);
    process.exit(1);
  }
  console.log(`match ${INPUT.homeCode}-${INPUT.awayCode} @ ${match.kickoffTime.toISOString()}`);

  const home = await matchNamesToNationPlayers(match.homeNationId, INPUT.homeNames);
  const away = await matchNamesToNationPlayers(match.awayNationId, INPUT.awayNames);

  for (const [label, r] of [[INPUT.homeCode, home], [INPUT.awayCode, away]] as const) {
    console.log(`\n${label}: ${r.matched.length} matched, ${r.unmatched.length} unmatched`);
    for (const p of r.matched) console.log(`  ✓ #${p.number ?? '–'} ${p.name} [${p.pos}]`);
    for (const u of r.unmatched) console.log(`  ✗ ${u.name} — ${u.reason}`);
  }

  if (home.matched.length !== 11 || away.matched.length !== 11) {
    console.log('\nNOT SAVED — both sides need exactly 11 matches.');
  } else if (!apply) {
    console.log('\nDry run — re-run with --apply to save.');
  } else {
    const payload: PredictedLineups = {
      home: { formation: INPUT.homeFormation || null, players: home.matched },
      away: { formation: INPUT.awayFormation || null, players: away.matched },
      updatedAt: new Date().toISOString(),
    };
    await prisma.match.update({
      where: { id: match.id },
      data: { predictedLineups: JSON.stringify(payload) },
    });
    console.log('\nSAVED — live in the fixture modal.');
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
