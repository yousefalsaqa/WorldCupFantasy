// ============================================
// CREATE THE 16 ROUND-OF-32 MATCHES (manual team entry)
//
// Run this AFTER the group stage completes (last GR3 match ~Jun 28 04:00Z) and
// the real qualifiers — including the 8 best 3rd-place teams — are known, but
// BEFORE the first R32 kickoff (Jun 28 19:00Z).
//
// You only fill in the 16 home/away NATION CODES below. Everything else
// (kickoff time, stage, ordering) is read from the canonical schedule in
// src/lib/world-cup-fixtures.ts so the two never drift.
//
//   npx tsx scripts/create-r32-matches.ts                 (dry run, no writes)
//   npx tsx scripts/create-r32-matches.ts --apply         (create matches)
//   npx tsx scripts/create-r32-matches.ts --apply --stamp (also stamp apiFootballId
//                                                          from API-Football so live
//                                                          scoring works)
//
// Idempotent: skips any slot whose pairing already exists in R32. After a
// successful --apply, re-run scripts/set-ko-deadlines.ts to keep the R32
// deadline pinned to the real first kickoff.
//
// NOTE: the home/away ORIENTATION below mirrors FIFA's bracket (home = the
// better-placed seed, e.g. "1C" is home vs "2F"). Enter the codes accordingly;
// orientation only affects which crest renders on the left + home/away scoring
// fields, not who actually "hosts".
// ============================================
import { PrismaClient } from '@prisma/client';
import { KNOCKOUT_FIXTURES } from '../src/lib/world-cup-fixtures';
import { apiFootball } from '../src/lib/api-football';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const STAMP = process.argv.includes('--stamp');

// ---- FILL THIS IN once groups are final. Keyed by the schedule's match id. ----
// The comment shows the bracket slot (home vs away) + kickoff for orientation.
// Use our 3-letter nation codes (e.g. 'ARG', 'ESP', 'KSA'). Leave '' to skip.
const R32: Record<string, { home: string; away: string }> = {
  M73: { home: '', away: '' }, // 2A v 2B            — Jun 28 15:00 ET
  M76: { home: '', away: '' }, // 1C v 2F            — Jun 29 13:00 ET
  M74: { home: '', away: '' }, // 1E v 3-A/B/C/D/F   — Jun 29 16:30 ET
  M75: { home: '', away: '' }, // 1F v 2C            — Jun 29 21:00 ET
  M78: { home: '', away: '' }, // 2E v 2I            — Jun 30 13:00 ET
  M77: { home: '', away: '' }, // 1I v 3-C/D/F/G/H   — Jun 30 17:00 ET
  M79: { home: '', away: '' }, // 1A v 3-C/E/F/H/I   — Jun 30 21:00 ET
  M80: { home: '', away: '' }, // 1L v 3-E/H/I/J/K   — Jul 1 12:00 ET
  M82: { home: '', away: '' }, // 1G v 3-A/E/H/I/J   — Jul 1 16:00 ET
  M81: { home: '', away: '' }, // 1D v 3-B/E/F/I/J   — Jul 1 20:00 ET
  M84: { home: '', away: '' }, // 1H v 2J            — Jul 2 15:00 ET
  M83: { home: '', away: '' }, // 2K v 2L            — Jul 2 19:00 ET
  M85: { home: '', away: '' }, // 1B v 3-E/F/G/I/J   — Jul 2 23:00 ET
  M88: { home: '', away: '' }, // 2D v 2G            — Jul 3 14:00 ET
  M86: { home: '', away: '' }, // 1J v 2H            — Jul 3 18:00 ET
  M87: { home: '', away: '' }, // 1K v 3-D/E/I/J/L   — Jul 3 21:30 ET
};
// ------------------------------------------------------------------------------

const parse = (date: string, time: string) => new Date(`${date}T${time}:00-04:00`);

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing to DB)' : 'DRY RUN (no writes)'}${STAMP ? ' + STAMP' : ''}\n`);

  const stage = await prisma.stage.findFirst({ where: { stageId: 'R32' } });
  if (!stage) throw new Error('No R32 stage row in DB.');

  const nations = await prisma.nation.findMany();
  const byCode = new Map(nations.map((n) => [n.code, n]));
  const r32Fixtures = KNOCKOUT_FIXTURES.filter((f) => f.stage === 'Round of 32');

  const existing = await prisma.match.findMany({ where: { stageId: stage.id } });
  const havePair = new Set(existing.map((m) => `${m.homeNationId}|${m.awayNationId}`));

  // (apiTeamId -> nationId) for the optional stamping pass.
  const nationByApiId = new Map<number, string>();
  for (const n of nations) if (n.apiFootballId) nationByApiId.set(n.apiFootballId, n.id);

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  const createdRows: { homeId: string; awayId: string; label: string }[] = [];

  for (const fx of r32Fixtures) {
    const entry = R32[fx.id];
    const label = `${fx.id} (${fx.home} v ${fx.away})`;
    if (!entry || !entry.home || !entry.away) {
      console.log(`  ${label}: BLANK — not filled in, skipping`);
      skipped++;
      continue;
    }
    const home = byCode.get(entry.home);
    const away = byCode.get(entry.away);
    if (!home) { errors.push(`${label}: unknown home code "${entry.home}"`); continue; }
    if (!away) { errors.push(`${label}: unknown away code "${entry.away}"`); continue; }
    if (home.id === away.id) { errors.push(`${label}: home == away (${entry.home})`); continue; }

    const kickoffTime = parse(fx.date, fx.time);
    if (havePair.has(`${home.id}|${away.id}`) || havePair.has(`${away.id}|${home.id}`)) {
      console.log(`  ${label}: ${entry.home} v ${entry.away} already exists — skipping`);
      skipped++;
      continue;
    }

    console.log(`  ${label}: ${entry.home} v ${entry.away}  ko=${kickoffTime.toISOString()}`);
    created++;
    createdRows.push({ homeId: home.id, awayId: away.id, label });
    if (APPLY) {
      await prisma.match.create({
        data: { stageId: stage.id, homeNationId: home.id, awayNationId: away.id, kickoffTime },
      });
    }
  }

  if (errors.length) {
    console.log('\nERRORS (fix the INPUT block and re-run):');
    errors.forEach((e) => console.log('  ', e));
  }

  // -------- optional: stamp apiFootballId from API-Football --------
  if (STAMP && APPLY && !errors.length) {
    console.log('\nStamping apiFootballId from API-Football (Round of 32)...');
    try {
      const apiFixtures = await apiFootball.getWorldCupFixtures();
      const r32 = apiFixtures.filter((f) => /round of 32/i.test(f.league.round));
      console.log(`  API returned ${apiFixtures.length} fixtures, ${r32.length} in Round of 32`);
      let stamped = 0;
      for (const af of r32) {
        const h = nationByApiId.get(af.teams.home.id);
        const a = nationByApiId.get(af.teams.away.id);
        if (!h || !a) continue;
        const res = await prisma.match.updateMany({
          where: {
            stageId: stage.id,
            OR: [
              { homeNationId: h, awayNationId: a },
              { homeNationId: a, awayNationId: h },
            ],
          },
          data: { apiFootballId: af.fixture.id, kickoffTime: new Date(af.fixture.date) },
        });
        if (res.count) {
          stamped += res.count;
          console.log(`    ${af.teams.home.name} v ${af.teams.away.name} -> fixture ${af.fixture.id}`);
        }
      }
      console.log(`  Stamped ${stamped} matches.`);
    } catch (e) {
      console.log(`  Stamping failed: ${e instanceof Error ? e.message : e}`);
      console.log('  (Matches were still created; re-run with --stamp later, or stamp by hand.)');
    }
  }

  console.log('\n========== SUMMARY ==========');
  console.log(`Mode: ${APPLY ? 'APPLIED' : 'DRY RUN — nothing written'}`);
  console.log(`R32 matches: ${created} to create, ${skipped} skipped, ${errors.length} errors`);
  if (APPLY && created && !errors.length) {
    console.log('\nNext: re-run `npx tsx scripts/set-ko-deadlines.ts --apply` to pin the');
    console.log('R32 deadline to the real first kickoff, then verify with check-ko-matches.ts.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
