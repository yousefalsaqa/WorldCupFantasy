// One-off: list every league with owner + members.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const leagues = await prisma.league.findMany({
    include: {
      owner: { select: { username: true, email: true } },
      memberships: { include: { team: { select: { name: true } }, user: { select: { username: true } } } },
    },
  });
  for (const l of leagues) {
    console.log(`${l.name}  [id=${l.id}] code=${l.code} isGlobal=${l.isGlobal} owner=${l.owner?.username ?? '—'} (${l.owner?.email ?? '—'})`);
    for (const m of l.memberships) console.log(`   member: ${m.user.username} / team "${m.team.name}"`);
  }
  console.log(`\nTotal leagues: ${leagues.length}`);
}

main().finally(() => prisma.$disconnect());
