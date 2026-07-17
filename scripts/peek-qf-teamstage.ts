// READ-ONLY: sanity check before the forfeit adjustment writes.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const qf = await prisma.stage.findFirst({ where: { stageId: 'QF' }, select: { id: true } });
  for (const name of ['thebestsaqa', "omar.sn's Team"]) {
    const team = await prisma.team.findFirst({ where: { name }, select: { id: true, totalPoints: true } });
    if (!team) { console.log(`${name}: NOT FOUND`); continue; }
    const ts = await prisma.teamStage.findFirst({ where: { teamId: team.id, stageId: qf!.id } });
    console.log(`${name}: Team.totalPoints=${team.totalPoints}  QF TeamStage=${ts ? JSON.stringify({ rawPoints: ts.rawPoints, totalPoints: ts.totalPoints }) : 'MISSING'}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
