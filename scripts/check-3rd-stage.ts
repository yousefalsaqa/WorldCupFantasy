import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const stages = await prisma.stage.findMany({ orderBy: { order: 'asc' } });
  for (const s of stages) console.log(s.stageId, s.name, s.order);
  const f = stages.find(s => s.stageId === 'F');
  const matches = await prisma.match.findMany({ where: { stageId: f!.id }, include: { homeNation: { select: { code: true } }, awayNation: { select: { code: true } } } });
  console.log('\nF stage matches:', matches.length);
  for (const m of matches) console.log(' ', m.homeNation.code, 'vs', m.awayNation.code, m.kickoffTime);
}
main().catch(console.error).finally(() => prisma.$disconnect());
