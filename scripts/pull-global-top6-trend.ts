import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const sf = await prisma.stage.findFirst({ where: { stageId: 'SF' }, select: { id: true } });
  const teams = await prisma.team.findMany({
    select: { id: true, name: true, totalPoints: true, user: { select: { username: true } } },
    orderBy: { totalPoints: 'desc' },
    take: 6,
  });
  const rows = [];
  for (const t of teams) {
    const ts = await prisma.teamStage.findFirst({ where: { teamId: t.id, stageId: sf!.id }, select: { totalPoints: true } });
    rows.push({ team: t.name, manager: t.user.username, total: t.totalPoints, gw: ts?.totalPoints ?? 0 });
  }
  const beforeSorted = [...rows].sort((a,b) => (b.total - b.gw) - (a.total - a.gw));
  const beforeRank = new Map(beforeSorted.map((r, i) => [r.team, i + 1]));
  rows.forEach((r, i) => {
    const currentRank = i + 1;
    const prevRank = beforeRank.get(r.team)!;
    const trend = currentRank < prevRank ? 'up' : currentRank > prevRank ? 'down' : 'flat';
    console.log(JSON.stringify({ rank: currentRank, team: r.team, manager: r.manager, gw: r.gw, total: r.total, trend }));
  });
}
main().catch(console.error).finally(() => prisma.$disconnect());
