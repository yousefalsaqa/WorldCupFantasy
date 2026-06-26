// READ-ONLY: list knockout-stage matches currently in the DB.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const stages = await prisma.stage.findMany({
    where: { stageId: { in: ['R32', 'R16', 'QF', 'SF', '3RD', 'F'] } },
    orderBy: { order: 'asc' },
  });
  for (const s of stages) {
    const ms = await prisma.match.findMany({
      where: { stageId: s.id },
      include: { homeNation: true, awayNation: true },
      orderBy: { kickoffTime: 'asc' },
    });
    console.log(`\n=== ${s.stageId} (${ms.length} matches) deadline=${s.deadlineTime?.toISOString() ?? 'null'} ===`);
    for (const m of ms) {
      console.log(`  ${m.homeNation.code} vs ${m.awayNation.code}  ko=${m.kickoffTime.toISOString()} apiId=${m.apiFootballId ?? '-'}`);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
