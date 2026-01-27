import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Austria players to add
const austriaPlayers = [
  { firstName: 'Patrick', lastName: 'Pentz', displayName: 'Pentz', position: 'GK', price: 4.5, number: 1 },
  { firstName: 'David', lastName: 'Alaba', displayName: 'Alaba', position: 'DEF', price: 6.5, number: 4 },
  { firstName: 'Maximilian', lastName: 'Wöber', displayName: 'Wöber', position: 'DEF', price: 5.0, number: 5 },
  { firstName: 'Kevin', lastName: 'Danso', displayName: 'Danso', position: 'DEF', price: 5.0, number: 15 },
  { firstName: 'Konrad', lastName: 'Laimer', displayName: 'Laimer', position: 'MID', price: 6.0, number: 8 },
  { firstName: 'Marcel', lastName: 'Sabitzer', displayName: 'Sabitzer', position: 'MID', price: 6.5, number: 10 },
  { firstName: 'Christoph', lastName: 'Baumgartner', displayName: 'Baumgartner', position: 'MID', price: 6.0, number: 19 },
  { firstName: 'Nicolas', lastName: 'Seiwald', displayName: 'Seiwald', position: 'MID', price: 5.5, number: 6 },
  { firstName: 'Marko', lastName: 'Arnautović', displayName: 'Arnautović', position: 'FWD', price: 6.5, number: 7 },
  { firstName: 'Michael', lastName: 'Gregoritsch', displayName: 'Gregoritsch', position: 'FWD', price: 5.5, number: 11 },
];

async function main() {
  console.log('🇦🇹 Adding Austria to World Cup 2026 Fantasy...\n');

  // Check if Austria already exists
  const existingAustria = await prisma.nation.findFirst({
    where: { code: 'AUT' },
  });

  if (existingAustria) {
    console.log('⚠️  Austria already exists in database!');
    console.log(`   Nation ID: ${existingAustria.id}`);
    
    // Check how many players Austria has
    const playerCount = await prisma.player.count({
      where: { nationId: existingAustria.id },
    });
    console.log(`   Current players: ${playerCount}`);
    
    if (playerCount >= 10) {
      console.log('\n✅ Austria is already fully set up. No changes needed.');
      return;
    }
    
    console.log('\n📝 Adding missing players...');
    
    // Add players that don't exist yet
    for (const player of austriaPlayers) {
      const existing = await prisma.player.findFirst({
        where: {
          nationId: existingAustria.id,
          displayName: player.displayName,
        },
      });
      
      if (!existing) {
        await prisma.player.create({
          data: {
            firstName: player.firstName,
            lastName: player.lastName,
            displayName: player.displayName,
            nationId: existingAustria.id,
            position: player.position,
            currentPrice: player.price,
            shirtNumber: player.number,
          },
        });
        console.log(`   ✓ Added ${player.displayName}`);
      } else {
        console.log(`   - ${player.displayName} already exists`);
      }
    }
  } else {
    // Create Austria nation
    console.log('🌍 Creating Austria nation...');
    const austria = await prisma.nation.create({
      data: {
        name: 'Austria',
        code: 'AUT',
        group: 'J',
        kitColor1: '#ED2939',
        kitColor2: '#FFFFFF',
      },
    });
    console.log(`   ✓ Created Austria (ID: ${austria.id})`);

    // Add players
    console.log('\n⚽ Adding Austrian players...');
    for (const player of austriaPlayers) {
      await prisma.player.create({
        data: {
          firstName: player.firstName,
          lastName: player.lastName,
          displayName: player.displayName,
          nationId: austria.id,
          position: player.position,
          currentPrice: player.price,
          shirtNumber: player.number,
        },
      });
      console.log(`   ✓ Added ${player.displayName}`);
    }
  }

  // Summary
  const totalNations = await prisma.nation.count();
  const totalPlayers = await prisma.player.count();
  const austriaPlayers2 = await prisma.player.count({
    where: { nation: { code: 'AUT' } },
  });

  console.log('\n=========================================');
  console.log('✅ Migration completed successfully!\n');
  console.log('📊 Database Stats:');
  console.log(`   • Total Nations: ${totalNations}`);
  console.log(`   • Total Players: ${totalPlayers}`);
  console.log(`   • Austria Players: ${austriaPlayers2}`);
  console.log('=========================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
