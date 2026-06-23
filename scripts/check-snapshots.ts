// Read-only: report squadSnapshot coverage per stage so we know which past
// rounds render EXACT (snapshot present) vs ESTIMATED (reconstructed).
import { prisma } from '../src/lib/db';

async function main() {
  const stages = await prisma.stage.findMany({ orderBy: { order: 'asc' } });
  const teamCount = await prisma.team.count();
  console.log(`Teams: ${teamCount}\n`);
  console.log('stage        order  active  complete  teamStages  withSnapshot');
  for (const s of stages) {
    const total = await prisma.teamStage.count({ where: { stageId: s.id } });
    const withSnap = await prisma.teamStage.count({
      where: { stageId: s.id, squadSnapshot: { not: null } },
    });
    console.log(
      `${s.stageId.padEnd(11)}  ${String(s.order).padEnd(5)}  ${String(s.isActive).padEnd(6)}  ${String(s.isComplete).padEnd(8)}  ${String(total).padEnd(10)}  ${withSnap}`,
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
