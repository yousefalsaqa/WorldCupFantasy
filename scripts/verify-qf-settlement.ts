import { prisma } from '../src/lib/db';
async function main() {
  const qf = await prisma.stage.findFirst({ where: { stageId: 'QF' } });
  const sf = await prisma.stage.findFirst({ where: { stageId: 'SF' } });
  console.log('QF: isActive=', qf.isActive, 'isComplete=', qf.isComplete);
  console.log('SF: isActive=', sf.isActive, 'deadline=', sf.deadlineTime?.toISOString());

  const team = await prisma.team.findFirst({ where: { name: { contains: 'Doudisfoodies' } } });
  console.log(`\nDoudisfoodies: totalPoints=${team.totalPoints} freeTransfers=${team.freeTransfers} bank=${team.bankBalance}`);

  const qfTs = await prisma.teamStage.findFirst({ where: { teamId: team.id, stageId: qf.id } });
  console.log('QF TeamStage:', qfTs);

  const argSui = await prisma.match.findFirst({ where: { homeNation: { code: 'ARG' }, awayNation: { code: 'SUI' } } });
  console.log('\nARG-SUI final:', argSui.homeScore, '-', argSui.awayScore, 'finished=', argSui.isFinished);
  await prisma.$disconnect();
}
main();
