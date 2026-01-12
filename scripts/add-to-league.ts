import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get global league
  const league = await prisma.league.findFirst({ 
    where: { isGlobal: true }
  });
  
  if (!league) {
    console.log('No global league found!');
    return;
  }
  
  console.log('League:', league.name);
  
  // Get all teams
  const teams = await prisma.team.findMany();
  console.log('Teams:', teams.map(t => t.name));
  
  // Add each team to the league
  for (const team of teams) {
    const existing = await prisma.leagueMembership.findFirst({ 
      where: { 
        leagueId: league.id, 
        teamId: team.id 
      }
    });
    
    if (!existing) {
      await prisma.leagueMembership.create({ 
        data: { 
          leagueId: league.id, 
          teamId: team.id, 
          userId: team.userId 
        }
      });
      console.log('Added', team.name, 'to league');
    } else {
      console.log(team.name, 'already in league');
    }
  }
  
  await prisma.$disconnect();
  console.log('\nDone!');
}

main();
