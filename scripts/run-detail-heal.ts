// Exercise the fixture-detail heal sweep against live data.
// SAFE: only writes Match.detailCache, and only for recently-finished
// matches whose cache is missing/empty. Mirrors the cron's runDetailHealSweep.
// Usage: npx tsx --env-file=.env scripts/run-detail-heal.ts
import { healFixtureDetailCache } from '../src/lib/fixture-detail';

async function main() {
  const outcomes = await healFixtureDetailCache();
  console.log(JSON.stringify(outcomes, null, 2));
  const { PrismaClient } = await import('@prisma/client');
  await new PrismaClient().$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
