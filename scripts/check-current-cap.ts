import { prisma } from '../src/lib/db';
import { maxPerNationForStage } from '../src/lib/wc-constants';
async function main() {
  const active = await prisma.stage.findFirst({ where: { isActive: true }, select: { stageId: true, name: true } });
  console.log('Active stage:', active);
  console.log('Current nation cap:', maxPerNationForStage(active?.stageId));
  console.log('Cap once SF is active:', maxPerNationForStage('SF'));
  await prisma.$disconnect();
}
main();
