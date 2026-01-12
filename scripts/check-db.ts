import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n=== USERS ===');
  const users = await prisma.user.findMany({
    select: { id: true, email: true, username: true }
  });
  console.table(users);

  console.log('\n=== TEAMS ===');
  const teams = await prisma.team.findMany({
    include: { user: { select: { username: true } } }
  });
  teams.forEach(t => {
    console.log(`${t.user.username} - "${t.name}" | Bank: £${t.bankBalance}m | Value: £${t.teamValue}m`);
  });

  console.log('\n=== SQUAD PLAYERS ===');
  const squads = await prisma.squadPlayer.findMany({
    include: { 
      team: { select: { name: true } },
      player: { select: { displayName: true, position: true } }
    }
  });
  
  const grouped: Record<string, string[]> = {};
  squads.forEach(sp => {
    if (!grouped[sp.team.name]) grouped[sp.team.name] = [];
    grouped[sp.team.name].push(`${sp.player.displayName} (${sp.player.position})`);
  });
  
  Object.entries(grouped).forEach(([team, players]) => {
    console.log(`\n${team} (${players.length} players):`);
    console.log(players.join(', '));
  });

  await prisma.$disconnect();
}

main();
