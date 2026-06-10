// Wipe ONLY the admin ops account's squad players and reset its team to a
// fresh state. Deliberately does NOT touch: the admin user, the Team row,
// league memberships, other users, or any other table. Prints before/after
// counts so the blast radius is visible.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function counts() {
  const [users, teams, squadPlayers, leagues, memberships, players] = await Promise.all([
    prisma.user.count(),
    prisma.team.count(),
    prisma.squadPlayer.count(),
    prisma.league.count(),
    prisma.leagueMembership.count(),
    prisma.player.count(),
  ]);
  return { users, teams, squadPlayers, leagues, memberships, players };
}

async function main() {
  const admin = await prisma.user.findUnique({
    where: { email: 'admin@worldcupfantasy.com' },
    include: { team: { include: { _count: { select: { squadPlayers: true } } } } },
  });
  if (!admin?.team) {
    console.log('Admin team not found, nothing to do.');
    return;
  }

  console.log('BEFORE:', await counts());
  console.log(`Admin team "${admin.team.name}" has ${admin.team._count.squadPlayers} squad players.`);

  if (!APPLY) {
    console.log('\nDRY RUN. Would delete those squad players and reset bank to 100. --apply to run.');
    return;
  }

  const deleted = await prisma.squadPlayer.deleteMany({ where: { teamId: admin.team.id } });
  await prisma.team.update({
    where: { id: admin.team.id },
    data: {
      bankBalance: 100,
      teamValue: 0,
      totalPoints: 0,
      freeTransfers: 2,
      transfersUsed: 0,
      freeHitSnapshot: null,
    },
  });
  console.log(`\nDeleted ${deleted.count} squad players, team reset to £100m bank.`);
  console.log('AFTER:', await counts());
}

main().finally(() => prisma.$disconnect());
