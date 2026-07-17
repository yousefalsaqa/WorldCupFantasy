import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const sf = await prisma.stage.findFirst({ where: { stageId: 'SF' }, select: { id: true } });
  const teams = await prisma.team.findMany({
    select: { id: true, name: true, totalPoints: true, user: { select: { username: true, isAdmin: true } } },
    orderBy: { totalPoints: 'desc' },
    take: 10,
  });
  for (const t of teams) {
    const ts = await prisma.teamStage.findFirst({ where: { teamId: t.id, stageId: sf!.id }, select: { totalPoints: true } });
    console.log(t.name.padEnd(22), t.user.username.padEnd(15), 'admin=', t.user.isAdmin, 'total=', t.totalPoints, 'SF=', ts?.totalPoints ?? 0);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
