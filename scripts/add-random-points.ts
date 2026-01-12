import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all squad players
  const squadPlayers = await prisma.squadPlayer.findMany({
    include: { player: true }
  });

  // Add random points to each squad player
  for (const sp of squadPlayers) {
    // Generate realistic fantasy points (0-15, with captains getting double)
    const basePoints = Math.floor(Math.random() * 12) + (Math.random() > 0.7 ? Math.floor(Math.random() * 5) : 0);
    
    // Captains get double points
    const points = sp.isCaptain ? basePoints * 2 : basePoints;
    
    await prisma.squadPlayer.update({
      where: { id: sp.id },
      data: { points }
    });
    
    console.log(`${sp.player.displayName}: ${points} pts${sp.isCaptain ? ' (C)' : ''}${sp.isViceCaptain ? ' (V)' : ''}`);
  }

  // Update team total points
  const teams = await prisma.team.findMany();
  for (const team of teams) {
    const teamSquad = await prisma.squadPlayer.findMany({
      where: { teamId: team.id, isStarting: true }
    });
    const totalPoints = teamSquad.reduce((sum, sp) => sum + (sp.points || 0), 0);
    
    await prisma.team.update({
      where: { id: team.id },
      data: { totalPoints }
    });
    
    console.log(`\n${team.name}: ${totalPoints} total points`);
  }

  await prisma.$disconnect();
  console.log('\nDone adding random points!');
}

main();
