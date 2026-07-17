import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const teams = await prisma.team.findMany({ select: { id: true, name: true, user: { select: { username: true } } } });
  for (const t of teams) {
    if (/ayaan/i.test(t.name) || /ayaan/i.test(t.user.username) || /saf/i.test(t.name) || /saf/i.test(t.user.username) || /omar/i.test(t.name) || /omar/i.test(t.user.username)) {
      console.log(t.name, '|', t.user.username);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
