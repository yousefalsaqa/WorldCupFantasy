// ============================================
// SYNC KNOCKOUT FIXTURES FROM API-FOOTBALL
//
// Pulls the World Cup knockout fixtures from API-Football and creates/updates
// the corresponding Match rows once the API has assigned REAL teams (i.e. as
// each round's pairings are confirmed). Fixtures whose teams are still TBD
// (not mappable to one of our nations) are skipped — re-run as more groups /
// rounds resolve.
//
// Reads the API (needs the Pro key in .env: API_FOOTBALL_KEY) + writes Match
// rows with kickoffTime + apiFootballId (so live scoring works immediately).
//
//   npx tsx --env-file=.env scripts/sync-knockout-from-api.ts            (dry run)
//   npx tsx --env-file=.env scripts/sync-knockout-from-api.ts --apply    (write)
//   ... --round=R32        (limit to one stage; default = all KO rounds present)
//
// Idempotent: keyed on apiFootballId (Match.apiFootballId is @unique). A second
// run with the same data is a no-op. After --apply, re-run set-ko-deadlines.ts
// to keep each KO deadline pinned to its real first kickoff.
// ============================================
import { PrismaClient } from '@prisma/client';
import { apiFootball } from '../src/lib/api-football';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const roundArg = process.argv.find((a) => a.startsWith('--round='))?.split('=')[1];

// API-Football `league.round` label -> our Stage.stageId. Ordered: more
// specific patterns first so "Final" doesn't swallow "Semi-finals".
// The 3rd-place play-off shares stage "F" with the Final (3RD/F merge) —
// isThirdPlace on the Match row is what tells them apart.
const ROUND_TO_STAGE: { re: RegExp; stageId: string; isThirdPlace?: boolean }[] = [
  { re: /round of 32/i, stageId: 'R32' },
  { re: /round of 16/i, stageId: 'R16' },
  { re: /quarter/i, stageId: 'QF' },
  { re: /semi/i, stageId: 'SF' },
  { re: /3rd place|third place|play-?off for third/i, stageId: 'F', isThirdPlace: true },
  { re: /final/i, stageId: 'F' },
];

function stageForRound(round: string): { stageId: string; isThirdPlace: boolean } | null {
  for (const { re, stageId, isThirdPlace } of ROUND_TO_STAGE) if (re.test(round)) return { stageId, isThirdPlace: !!isThirdPlace };
  return null;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing to DB)' : 'DRY RUN (no writes)'}${roundArg ? ` [round=${roundArg}]` : ''}\n`);

  const nations = await prisma.nation.findMany();
  const nationByApiId = new Map<number, { id: string; code: string }>();
  for (const n of nations) if (n.apiFootballId) nationByApiId.set(n.apiFootballId, { id: n.id, code: n.code });

  const stages = await prisma.stage.findMany({ where: { stageId: { in: ['R32', 'R16', 'QF', 'SF', 'F'] } } });
  const stageByKey = new Map(stages.map((s) => [s.stageId, s]));

  const fixtures = await apiFootball.getWorldCupFixtures();

  let created = 0, updated = 0, skippedTbd = 0, skippedPartial = 0;
  const touchedStages = new Set<string>();

  // Group by KO round for tidy output.
  const koFixtures = fixtures
    .map((f) => ({ f, resolved: stageForRound(f.league.round) }))
    .filter((x) => x.resolved && (!roundArg || x.resolved.stageId === roundArg))
    .sort((a, b) => (a.f.fixture.date < b.f.fixture.date ? -1 : 1));

  for (const { f, resolved } of koFixtures) {
    const { stageId, isThirdPlace } = resolved!;
    const label = isThirdPlace ? '3RD' : stageId; // display only — real Stage.stageId is 'F' for both
    const stage = stageByKey.get(stageId);
    if (!stage) { console.log(`  ${label} stage row missing — SKIP ${f.fixture.id}`); continue; }

    const home = nationByApiId.get(f.teams.home.id);
    const away = nationByApiId.get(f.teams.away.id);
    const kickoff = new Date(f.fixture.date);

    if (!home && !away) { skippedTbd++; continue; } // both TBD — nothing to do yet
    if (!home || !away) {
      skippedPartial++;
      console.log(`  ${label} SKIP (one side unmapped): ${f.teams.home.name} vs ${f.teams.away.name} (fxId ${f.fixture.id})`);
      continue;
    }

    // Idempotent resolve: by apiFootballId first, then by stage+pairing.
    const existing =
      (await prisma.match.findFirst({ where: { apiFootballId: f.fixture.id } })) ??
      (await prisma.match.findFirst({ where: { stageId: stage.id, homeNationId: home.id, awayNationId: away.id } }));

    if (existing) {
      const needs = existing.apiFootballId !== f.fixture.id || existing.kickoffTime.getTime() !== kickoff.getTime() || existing.stageId !== stage.id || existing.isThirdPlace !== isThirdPlace;
      console.log(`  ${label} ${home.code} vs ${away.code}  ko=${kickoff.toISOString()} fxId=${f.fixture.id} — ${needs ? 'UPDATE' : 'unchanged'}`);
      if (needs) {
        updated++;
        touchedStages.add(label);
        if (APPLY) {
          await prisma.match.update({
            where: { id: existing.id },
            data: { stageId: stage.id, homeNationId: home.id, awayNationId: away.id, kickoffTime: kickoff, apiFootballId: f.fixture.id, isThirdPlace },
          });
        }
      }
    } else {
      console.log(`  ${label} ${home.code} vs ${away.code}  ko=${kickoff.toISOString()} fxId=${f.fixture.id} — CREATE`);
      created++;
      touchedStages.add(label);
      if (APPLY) {
        await prisma.match.create({
          data: { stageId: stage.id, homeNationId: home.id, awayNationId: away.id, kickoffTime: kickoff, apiFootballId: f.fixture.id, isThirdPlace },
        });
      }
    }
  }

  console.log(`\n========== SUMMARY ==========`);
  console.log(`Mode: ${APPLY ? 'APPLIED' : 'DRY RUN — nothing written'}`);
  console.log(`Created: ${created}  Updated: ${updated}  Skipped (both TBD): ${skippedTbd}  Skipped (one side TBD): ${skippedPartial}`);
  if (APPLY && (created || updated)) {
    console.log(`\nNext: run \`npx tsx --env-file=.env scripts/set-ko-deadlines.ts --apply\` to keep`);
    console.log(`the deadline of each touched stage (${[...touchedStages].join(', ')}) pinned to its first kickoff,`);
    console.log(`then verify with \`npx tsx scripts/check-ko-matches.ts\`.`);
  }
  console.log(`API rate limit remaining: ${apiFootball.getRateLimitRemaining?.() ?? '?'}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
