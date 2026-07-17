// READ-ONLY: banked QF TeamStage.totalPoints for every team in "the bois",
// to confirm the forfeit adjustment actually lands omar.sn's Team last.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const qf = await prisma.stage.findFirst({ where: { stageId: 'QF' }, select: { id: true } });
  const league = await prisma.league.findFirst({
    where: { name: 'the bois' },
    select: { memberships: { select: { team: { select: { id: true, name: true } } } } },
  });
  const teams = league!.memberships.map((m) => m.team).filter((t) => t !== null);
  const rows = await Promise.all(teams.map(async (t) => {
    const ts = await prisma.teamStage.findFirst({ where: { teamId: t!.id, stageId: qf!.id }, select: { totalPoints: true } });
    return { name: t!.name, totalPoints: ts?.totalPoints ?? null };
  }));
  rows.sort((a, b) => (a.totalPoints ?? 0) - (b.totalPoints ?? 0));
  for (const r of rows) console.log(`  ${r.name.padEnd(22)} QF totalPoints=${r.totalPoints}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
