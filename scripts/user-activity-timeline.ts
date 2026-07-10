// READ-ONLY: combined AuditLog (mutations) + ActivityEvent (views/attempts)
// timeline for one team's user, newest first. Usage:
//   npx tsx scripts/user-activity-timeline.ts "team name"
import { PrismaClient } from '@prisma/client';
import { getUserActivityTimeline } from '../src/lib/activity';
const prisma = new PrismaClient();

async function main() {
  const teamName = process.argv[2];
  if (!teamName) throw new Error('usage: user-activity-timeline.ts "team name"');
  const team = await prisma.team.findFirst({ where: { name: teamName }, select: { userId: true, name: true } });
  if (!team) throw new Error(`team "${teamName}" not found`);

  const timeline = await getUserActivityTimeline(team.userId, 100);
  console.log(`${team.name} — last ${timeline.length} events:`);
  for (const e of timeline) {
    console.log(`  ${e.createdAt.toISOString()}  [${e.source}]  ${e.action}  ${e.details ?? ''}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
