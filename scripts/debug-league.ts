import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const league = await prisma.league.findFirst({ 
    where: { isGlobal: true }, 
    include: { 
      memberships: { 
        include: { 
          team: { 
            include: { 
              user: { select: { username: true }}
            }
          }
        }
      }
    }
  });
  
  console.log('League:', league?.name);
  console.log('Members:', league?.memberships.length);
  
  league?.memberships.forEach(m => {
    console.log(`  - ${m.team?.name} (${m.team?.user?.username}) - ${m.team?.totalPoints} pts`);
  });
  
  await prisma.$disconnect();
}

main();
