// Creates the two remaining real fixtures for the F stage (3rd Place &
// Final), determined from actual SF results: ESP beat FRA 2-0, ARG beat
// ENG 2-1, so Final = ESP v ARG, 3rd Place = FRA v ENG (the SF losers).
// Real kickoff times from src/lib/world-cup-fixtures.ts (M103/M104):
// 3rd Place July 18 17:00 ET = 21:00Z (matches Stage.deadlineTime already
// set), Final July 19 15:00 ET = 19:00Z. apiFootballId left null — not yet
// published by the API, same situation as the SF fixtures before kickoff.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const f = await prisma.stage.findFirst({ where: { stageId: 'F' }, select: { id: true } });
  if (!f) throw new Error('F stage not found');

  const existing = await prisma.match.count({ where: { stageId: f.id } });
  if (existing > 0) { console.log(`F stage already has ${existing} match(es) — aborting to avoid duplicates`); return; }

  const nations = await prisma.nation.findMany({ where: { code: { in: ['FRA', 'ENG', 'ESP', 'ARG'] } }, select: { id: true, code: true } });
  const byCode = new Map(nations.map((n) => [n.code, n.id]));
  for (const code of ['FRA', 'ENG', 'ESP', 'ARG']) {
    if (!byCode.has(code)) throw new Error(`nation ${code} not found`);
  }

  const thirdPlace = await prisma.match.create({
    data: {
      stageId: f.id,
      homeNationId: byCode.get('FRA')!,
      awayNationId: byCode.get('ENG')!,
      kickoffTime: new Date('2026-07-18T21:00:00Z'),
      isThirdPlace: true,
    },
  });
  console.log('Created 3rd place:', thirdPlace.id, 'FRA v ENG @', thirdPlace.kickoffTime.toISOString());

  const final = await prisma.match.create({
    data: {
      stageId: f.id,
      homeNationId: byCode.get('ESP')!,
      awayNationId: byCode.get('ARG')!,
      kickoffTime: new Date('2026-07-19T19:00:00Z'),
      isThirdPlace: false,
    },
  });
  console.log('Created Final:', final.id, 'ESP v ARG @', final.kickoffTime.toISOString());
}
main().catch(console.error).finally(() => prisma.$disconnect());
