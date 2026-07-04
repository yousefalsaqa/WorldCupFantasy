// ============================================
// CREATE THE 8 ROUND-OF-16 MATCHES from API-Football
//
// Unlike R32 (manual entry — third-place seeding made pairings ambiguous),
// the R16 bracket is fully determined once R32 ends, and API-Football
// returns the real pairings, kickoff times, and fixture ids. So this script
// creates the Match rows straight from the API: nations resolved via
// Nation.apiFootballId, apiFootballId stamped at creation so live scoring
// works immediately.
//
//   npx tsx scripts/create-r16-matches.ts          (dry run, no writes)
//   npx tsx scripts/create-r16-matches.ts --apply  (create matches)
//
// The API publishes knockout fixtures with a lag after the qualifying match
// ends, so any pairing missing from the API is created from the MANUAL
// fallback below (bracket + canonical schedule kickoff) WITHOUT an
// apiFootballId. Re-running later stamps those rows once the API has them —
// do that before Jul 7 or live scoring won't cover the last two matches.
//
// Idempotent: skips pairings already present in the R16 stage. After a
// successful --apply, re-run set-ko-deadlines.ts if the real first kickoff
// differs from the stage's deadlineTime.
// ============================================
import { PrismaClient } from '@prisma/client';
import { apiFootball } from '../src/lib/api-football';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// Bracket slots the API hasn't published yet (M95/M96 — their R32 qualifiers
// finished only hours ago). Names must match Nation.name. Kickoffs are the
// canonical schedule's, entered as ET (matches world-cup-fixtures.ts).
const MANUAL: Array<{ home: string; away: string; date: string; time: string }> = [
  { home: 'Argentina', away: 'Egypt', date: '2026-07-07', time: '12:00' },      // M95: W M86 v W M88
  { home: 'Switzerland', away: 'Colombia', date: '2026-07-07', time: '16:00' }, // M96: W M85 v W M87
];
const parseET = (date: string, time: string) => new Date(`${date}T${time}:00-04:00`);

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing to DB)' : 'DRY RUN (no writes)'}\n`);

  const stage = await prisma.stage.findFirst({ where: { stageId: 'R16' } });
  if (!stage) throw new Error('No R16 stage row in DB.');

  const nations = await prisma.nation.findMany({
    select: { id: true, name: true, code: true, apiFootballId: true, isEliminated: true },
  });
  const nationByApiId = new Map(nations.filter((n) => n.apiFootballId).map((n) => [n.apiFootballId!, n]));

  const apiFixtures = await apiFootball.getWorldCupFixtures();
  const r16 = apiFixtures
    .filter((f) => /round of 16/i.test(f.league.round))
    .sort((a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime());
  console.log(`API returned ${apiFixtures.length} fixtures total, ${r16.length} in Round of 16`);
  if (r16.length !== 8) {
    console.log('WARNING: expected 8 R16 fixtures — check the round filter / API data before applying.');
  }

  const existing = await prisma.match.findMany({ where: { stageId: stage.id } });
  const pairKey = (h: string, a: string) => (h < a ? `${h}|${a}` : `${a}|${h}`);
  const existingByPair = new Map(existing.map((m) => [pairKey(m.homeNationId, m.awayNationId), m]));
  const haveApiId = new Set(existing.map((m) => m.apiFootballId).filter(Boolean));

  let created = 0;
  let stamped = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const af of r16) {
    const label = `${af.teams.home.name} v ${af.teams.away.name} (fixture ${af.fixture.id}, ${af.fixture.date})`;
    const home = nationByApiId.get(af.teams.home.id);
    const away = nationByApiId.get(af.teams.away.id);
    if (!home || !away) {
      errors.push(`${label}: unmapped team api id ${!home ? af.teams.home.id : af.teams.away.id}`);
      continue;
    }
    if (home.isEliminated || away.isEliminated) {
      errors.push(`${label}: ${home.isEliminated ? home.name : away.name} is marked ELIMINATED — bracket/elimination data disagree, investigate before applying`);
      continue;
    }
    const prior = existingByPair.get(pairKey(home.id, away.id));
    if (prior) {
      if (!prior.apiFootballId) {
        // Row was created from the MANUAL fallback before the API published
        // this fixture — stamp the id + real kickoff now.
        console.log(`  ${APPLY ? 'STAMP' : 'DRY-STAMP'} ${home.code} v ${away.code} -> api=${af.fixture.id}  ko=${new Date(af.fixture.date).toISOString()}`);
        stamped++;
        if (APPLY) {
          await prisma.match.update({
            where: { id: prior.id },
            data: { apiFootballId: af.fixture.id, kickoffTime: new Date(af.fixture.date) },
          });
        }
      } else {
        console.log(`  SKIP  ${label} — already exists`);
        skipped++;
      }
      continue;
    }
    if (haveApiId.has(af.fixture.id)) {
      console.log(`  SKIP  ${label} — fixture id already stamped on another row`);
      skipped++;
      continue;
    }
    console.log(`  ${APPLY ? 'CREATE' : 'DRY  '} ${home.code} v ${away.code}  ko=${new Date(af.fixture.date).toISOString()}  api=${af.fixture.id}`);
    created++;
    if (APPLY) {
      await prisma.match.create({
        data: {
          stageId: stage.id,
          homeNationId: home.id,
          awayNationId: away.id,
          kickoffTime: new Date(af.fixture.date),
          apiFootballId: af.fixture.id,
        },
      });
    }
  }

  // -------- MANUAL fallback: bracket slots the API hasn't published --------
  const apiPairs = new Set<string>();
  for (const af of r16) {
    const h = nationByApiId.get(af.teams.home.id);
    const a = nationByApiId.get(af.teams.away.id);
    if (h && a) apiPairs.add(pairKey(h.id, a.id));
  }
  const byName = new Map(nations.map((n) => [n.name, n]));
  for (const m of MANUAL) {
    const home = byName.get(m.home);
    const away = byName.get(m.away);
    const label = `${m.home} v ${m.away} (manual, ${m.date} ${m.time} ET)`;
    if (!home || !away) {
      errors.push(`${label}: unknown nation name "${!home ? m.home : m.away}"`);
      continue;
    }
    if (home.isEliminated || away.isEliminated) {
      errors.push(`${label}: ${home.isEliminated ? home.name : away.name} is marked ELIMINATED — check the bracket before applying`);
      continue;
    }
    if (apiPairs.has(pairKey(home.id, away.id))) continue; // API already covers it
    if (existingByPair.has(pairKey(home.id, away.id))) {
      console.log(`  SKIP  ${label} — already exists (re-run stamps it once the API publishes)`);
      skipped++;
      continue;
    }
    const kickoffTime = parseET(m.date, m.time);
    console.log(`  ${APPLY ? 'CREATE' : 'DRY  '} ${home.code} v ${away.code}  ko=${kickoffTime.toISOString()}  api=NONE YET (manual)`);
    created++;
    if (APPLY) {
      await prisma.match.create({
        data: {
          stageId: stage.id,
          homeNationId: home.id,
          awayNationId: away.id,
          kickoffTime,
        },
      });
    }
  }

  if (errors.length) {
    console.log('\nERRORS:');
    errors.forEach((e) => console.log('  ', e));
  }

  console.log('\n========== SUMMARY ==========');
  console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'}: ${created} created, ${stamped} stamped, ${skipped} skipped, ${errors.length} errors`);
  if (created) {
    const firstKo = new Date(r16[0].fixture.date);
    const stageDeadline = stage.deadlineTime?.toISOString();
    console.log(`First R16 kickoff: ${firstKo.toISOString()} | stage deadlineTime: ${stageDeadline}`);
    if (stage.deadlineTime && Math.abs(firstKo.getTime() - stage.deadlineTime.getTime()) > 60_000) {
      console.log('^ deadline differs from first kickoff — run set-ko-deadlines.ts --apply to re-pin.');
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
