// Set each stage's deadlineTime to its FIRST match kickoff (was 1h before).
// Stages without matches (knockouts pre-sync) are left alone — re-run this
// after knockout fixtures are created.
//   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/set-deadlines-to-kickoff.ts --apply
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function main() {
  const stages = await prisma.stage.findMany({ orderBy: { order: 'asc' } });
  for (const s of stages) {
    const first = await prisma.match.findFirst({
      where: { stageId: s.id },
      orderBy: { kickoffTime: 'asc' },
      select: { kickoffTime: true },
    });
    if (!first) {
      console.log(`${s.stageId}: no matches yet, leaving deadline ${s.deadlineTime?.toISOString()}`);
      continue;
    }
    console.log(`${s.stageId}: ${s.deadlineTime?.toISOString()} -> ${first.kickoffTime.toISOString()}`);
    if (APPLY) {
      await prisma.stage.update({ where: { id: s.id }, data: { deadlineTime: first.kickoffTime } });
    }
  }
  console.log(APPLY ? 'Applied.' : 'Dry run. --apply to write.');
}

main().finally(() => prisma.$disconnect());
