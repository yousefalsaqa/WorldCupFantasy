// Remove the smoke-test account and all its data.
// Usage: npx tsx --env-file=.env scripts/delete-smoke-user.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EMAIL = 'smoketest@test.com';

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: { team: true },
  });
  if (!user) {
    console.log('No smoke-test user found - nothing to do.');
    await prisma.$disconnect();
    return;
  }
  if (user.team) {
    await prisma.transfer.deleteMany({ where: { teamId: user.team.id } });
    await prisma.squadPlayer.deleteMany({ where: { teamId: user.team.id } });
    await prisma.teamStage.deleteMany({ where: { teamId: user.team.id } });
    await prisma.leagueMembership.deleteMany({ where: { teamId: user.team.id } });
    await prisma.team.delete({ where: { id: user.team.id } });
  }
  await prisma.auditLog.deleteMany({ where: { userId: user.id } });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log(`Deleted ${EMAIL} and all associated data.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
