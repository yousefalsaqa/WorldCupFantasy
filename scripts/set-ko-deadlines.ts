// Set the 6 knockout-stage deadlines to each stage's FIRST kickoff, derived
// from the canonical schedule in src/lib/world-cup-fixtures.ts (KNOCKOUT_
// FIXTURES). The DB's KO deadlines are wrong placeholders (R32 = Jun 20, before
// GR3) — this corrects them BEFORE GR3 rolls over and flips R32 active.
//
// Records the old deadline for each stage so the change is reversible.
//
//   npx tsx scripts/set-ko-deadlines.ts          (dry run)
//   npx tsx scripts/set-ko-deadlines.ts --apply  (write to DB)
import { PrismaClient } from '@prisma/client';
import { KNOCKOUT_FIXTURES } from '../src/lib/world-cup-fixtures';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// Schedule `stage` label (from the lib) -> our Stage.stageId.
const LABEL_TO_STAGE_ID: Record<string, string> = {
  'Round of 32': 'R32',
  'Round of 16': 'R16',
  'Quarter Final': 'QF',
  'Semi Final': 'SF',
  '3rd Place': '3RD',
  'Final': 'F',
};

// Schedule times are US Eastern (EDT, UTC-4) — same convention as the
// group-stage seeder in sync-from-api-football.ts.
const parse = (date: string, time: string) => new Date(`${date}T${time}:00-04:00`);

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing to DB)' : 'DRY RUN (no writes)'}\n`);

  // First kickoff per KO stage from the canonical schedule.
  const firstKickoff = new Map<string, Date>();
  for (const fx of KNOCKOUT_FIXTURES) {
    const stageId = LABEL_TO_STAGE_ID[fx.stage];
    if (!stageId) {
      console.log(`  WARN: unmapped schedule stage label "${fx.stage}" (fixture ${fx.id})`);
      continue;
    }
    const ko = parse(fx.date, fx.time);
    const cur = firstKickoff.get(stageId);
    if (!cur || ko < cur) firstKickoff.set(stageId, ko);
  }

  const rollback: Record<string, string | null> = {};
  for (const stageId of ['R32', 'R16', 'QF', 'SF', '3RD', 'F']) {
    const want = firstKickoff.get(stageId);
    if (!want) {
      console.log(`${stageId.padEnd(4)} no schedule entry — SKIPPED`);
      continue;
    }
    const stage = await prisma.stage.findFirst({ where: { stageId } });
    if (!stage) {
      console.log(`${stageId.padEnd(4)} no Stage row — SKIPPED`);
      continue;
    }
    rollback[stageId] = stage.deadlineTime?.toISOString() ?? null;
    const same = stage.deadlineTime?.getTime() === want.getTime();
    console.log(
      `${stageId.padEnd(4)} ${String(stage.deadlineTime?.toISOString() ?? 'null').padEnd(26)} -> ${want.toISOString()}${same ? '  (unchanged)' : ''}`,
    );
    if (APPLY && !same) {
      await prisma.stage.update({ where: { id: stage.id }, data: { deadlineTime: want } });
    }
  }

  console.log('\nOld deadlines (for rollback):');
  console.log(JSON.stringify(rollback, null, 2));
  console.log(APPLY ? '\nApplied.' : '\nDry run. Re-run with --apply to write.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
