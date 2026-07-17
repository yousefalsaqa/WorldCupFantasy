import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const sf = await prisma.stage.findFirst({ where: { stageId: 'SF' }, select: { id: true } });
  const gr1 = await prisma.stage.findFirst({ where: { stageId: 'GR1' }, select: { id: true } });
  for (const name of ['thebestsaqa', 'balls', "omar.sn's Team"]) {
    const team = await prisma.team.findFirst({ where: { name }, select: { id: true, totalPoints: true } });
    const ts = await prisma.teamStage.findFirst({ where: { teamId: team!.id, stageId: sf!.id } });
    console.log(`${name}: Team.totalPoints=${team!.totalPoints}  SF TeamStage=${JSON.stringify(ts && { rawPoints: ts.rawPoints, captainPoints: ts.captainPoints, totalPoints: ts.totalPoints })}`);
  }
  const saf = await prisma.team.findFirst({ where: { name: 'Safarjlani to glory' }, select: { id: true, totalPoints: true } });
  const safTs = await prisma.teamStage.findFirst({ where: { teamId: saf!.id, stageId: gr1!.id } });
  console.log(`Safarjlani to glory: Team.totalPoints=${saf!.totalPoints}  GR1 TeamStage=${JSON.stringify(safTs && { rawPoints: safTs.rawPoints, captainPoints: safTs.captainPoints, totalPoints: safTs.totalPoints })}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
