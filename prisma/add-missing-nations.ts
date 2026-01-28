import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 6 nations needed to complete 48 teams (12 groups × 4 teams)
const missingNations = [
  // Group A (has MEX, RSA, KOR - needs 1)
  { name: 'Italy', code: 'ITA', group: 'A', kitColor1: '#0066CC', kitColor2: '#FFFFFF' },
  
  // Group B (has CAN, QAT, SUI - needs 1)
  { name: 'Poland', code: 'POL', group: 'B', kitColor1: '#FFFFFF', kitColor2: '#DC143C' },
  
  // Group D (has USA, PAR, AUS - needs 1)
  { name: 'Serbia', code: 'SRB', group: 'D', kitColor1: '#C6363C', kitColor2: '#FFFFFF' },
  
  // Group F (has NED, JPN, TUN - needs 1)
  { name: 'Denmark', code: 'DEN', group: 'F', kitColor1: '#C8102E', kitColor2: '#FFFFFF' },
  
  // Group I (has FRA, SEN, NOR - needs 1)
  { name: 'Cameroon', code: 'CMR', group: 'I', kitColor1: '#007A3D', kitColor2: '#CE1126' },
  
  // Group K (has POR, UZB, COL - needs 1)
  { name: 'Wales', code: 'WAL', group: 'K', kitColor1: '#C8102E', kitColor2: '#FFFFFF' },
];

// Players for each new nation (realistic squads)
const newPlayers = [
  // ITALY
  { firstName: 'Gianluigi', lastName: 'Donnarumma', displayName: 'Donnarumma', nationCode: 'ITA', position: 'GK', price: 5.5, number: 1 },
  { firstName: 'Federico', lastName: 'Dimarco', displayName: 'Dimarco', nationCode: 'ITA', position: 'DEF', price: 5.5, number: 3 },
  { firstName: 'Giovanni', lastName: 'Di Lorenzo', displayName: 'Di Lorenzo', nationCode: 'ITA', position: 'DEF', price: 5.0, number: 2 },
  { firstName: 'Alessandro', lastName: 'Bastoni', displayName: 'Bastoni', nationCode: 'ITA', position: 'DEF', price: 5.5, number: 23 },
  { firstName: 'Nicolò', lastName: 'Barella', displayName: 'Barella', nationCode: 'ITA', position: 'MID', price: 7.5, number: 18 },
  { firstName: 'Sandro', lastName: 'Tonali', displayName: 'Tonali', nationCode: 'ITA', position: 'MID', price: 6.5, number: 8 },
  { firstName: 'Marco', lastName: 'Verratti', displayName: 'Verratti', nationCode: 'ITA', position: 'MID', price: 7.0, number: 6 },
  { firstName: 'Federico', lastName: 'Chiesa', displayName: 'Chiesa', nationCode: 'ITA', position: 'FWD', price: 8.0, number: 14 },
  { firstName: 'Giacomo', lastName: 'Raspadori', displayName: 'Raspadori', nationCode: 'ITA', position: 'FWD', price: 6.5, number: 10 },
  { firstName: 'Gianluca', lastName: 'Scamacca', displayName: 'Scamacca', nationCode: 'ITA', position: 'FWD', price: 6.5, number: 9 },

  // POLAND
  { firstName: 'Wojciech', lastName: 'Szczęsny', displayName: 'Szczęsny', nationCode: 'POL', position: 'GK', price: 5.0, number: 1 },
  { firstName: 'Jan', lastName: 'Bednarek', displayName: 'Bednarek', nationCode: 'POL', position: 'DEF', price: 4.5, number: 5 },
  { firstName: 'Matty', lastName: 'Cash', displayName: 'Cash', nationCode: 'POL', position: 'DEF', price: 5.0, number: 2 },
  { firstName: 'Jakub', lastName: 'Kiwior', displayName: 'Kiwior', nationCode: 'POL', position: 'DEF', price: 4.5, number: 14 },
  { firstName: 'Piotr', lastName: 'Zieliński', displayName: 'Zieliński', nationCode: 'POL', position: 'MID', price: 7.0, number: 10 },
  { firstName: 'Nicola', lastName: 'Zalewski', displayName: 'Zalewski', nationCode: 'POL', position: 'MID', price: 5.5, number: 7 },
  { firstName: 'Przemysław', lastName: 'Frankowski', displayName: 'Frankowski', nationCode: 'POL', position: 'MID', price: 5.0, number: 24 },
  { firstName: 'Robert', lastName: 'Lewandowski', displayName: 'Lewandowski', nationCode: 'POL', position: 'FWD', price: 11.0, number: 9 },
  { firstName: 'Arkadiusz', lastName: 'Milik', displayName: 'Milik', nationCode: 'POL', position: 'FWD', price: 6.5, number: 7 },
  { firstName: 'Karol', lastName: 'Świderski', displayName: 'Świderski', nationCode: 'POL', position: 'FWD', price: 5.5, number: 11 },

  // SERBIA
  { firstName: 'Predrag', lastName: 'Rajković', displayName: 'Rajković', nationCode: 'SRB', position: 'GK', price: 4.5, number: 1 },
  { firstName: 'Strahinja', lastName: 'Pavlović', displayName: 'Pavlović', nationCode: 'SRB', position: 'DEF', price: 5.0, number: 4 },
  { firstName: 'Nikola', lastName: 'Milenković', displayName: 'Milenković', nationCode: 'SRB', position: 'DEF', price: 5.0, number: 5 },
  { firstName: 'Srđan', lastName: 'Babić', displayName: 'Babić', nationCode: 'SRB', position: 'DEF', price: 4.5, number: 2 },
  { firstName: 'Dušan', lastName: 'Tadić', displayName: 'Tadić', nationCode: 'SRB', position: 'MID', price: 7.0, number: 10 },
  { firstName: 'Sergej', lastName: 'Milinković-Savić', displayName: 'SMS', nationCode: 'SRB', position: 'MID', price: 7.5, number: 20 },
  { firstName: 'Filip', lastName: 'Kostić', displayName: 'Kostić', nationCode: 'SRB', position: 'MID', price: 6.0, number: 11 },
  { firstName: 'Aleksandar', lastName: 'Mitrović', displayName: 'Mitrović', nationCode: 'SRB', position: 'FWD', price: 7.5, number: 9 },
  { firstName: 'Dušan', lastName: 'Vlahović', displayName: 'Vlahović', nationCode: 'SRB', position: 'FWD', price: 8.5, number: 7 },
  { firstName: 'Luka', lastName: 'Jović', displayName: 'Jović', nationCode: 'SRB', position: 'FWD', price: 6.0, number: 21 },

  // DENMARK
  { firstName: 'Kasper', lastName: 'Schmeichel', displayName: 'Schmeichel', nationCode: 'DEN', position: 'GK', price: 5.0, number: 1 },
  { firstName: 'Andreas', lastName: 'Christensen', displayName: 'Christensen', nationCode: 'DEN', position: 'DEF', price: 5.0, number: 4 },
  { firstName: 'Joachim', lastName: 'Andersen', displayName: 'J. Andersen', nationCode: 'DEN', position: 'DEF', price: 5.0, number: 6 },
  { firstName: 'Joakim', lastName: 'Mæhle', displayName: 'Mæhle', nationCode: 'DEN', position: 'DEF', price: 5.0, number: 5 },
  { firstName: 'Christian', lastName: 'Eriksen', displayName: 'Eriksen', nationCode: 'DEN', position: 'MID', price: 7.5, number: 10 },
  { firstName: 'Pierre-Emile', lastName: 'Højbjerg', displayName: 'Højbjerg', nationCode: 'DEN', position: 'MID', price: 6.0, number: 23 },
  { firstName: 'Morten', lastName: 'Hjulmand', displayName: 'Hjulmand', nationCode: 'DEN', position: 'MID', price: 5.5, number: 8 },
  { firstName: 'Rasmus', lastName: 'Højlund', displayName: 'Højlund', nationCode: 'DEN', position: 'FWD', price: 8.0, number: 9 },
  { firstName: 'Jonas', lastName: 'Wind', displayName: 'Wind', nationCode: 'DEN', position: 'FWD', price: 6.5, number: 7 },
  { firstName: 'Yussuf', lastName: 'Poulsen', displayName: 'Poulsen', nationCode: 'DEN', position: 'FWD', price: 6.0, number: 11 },

  // CAMEROON
  { firstName: 'André', lastName: 'Onana', displayName: 'Onana', nationCode: 'CMR', position: 'GK', price: 5.5, number: 23 },
  { firstName: 'Nicolas', lastName: 'Nkoulou', displayName: 'Nkoulou', nationCode: 'CMR', position: 'DEF', price: 4.5, number: 3 },
  { firstName: 'Collins', lastName: 'Fai', displayName: 'Fai', nationCode: 'CMR', position: 'DEF', price: 4.5, number: 2 },
  { firstName: 'Nouhou', lastName: 'Tolo', displayName: 'Nouhou', nationCode: 'CMR', position: 'DEF', price: 4.5, number: 6 },
  { firstName: 'André-Frank', lastName: 'Zambo Anguissa', displayName: 'Anguissa', nationCode: 'CMR', position: 'MID', price: 7.0, number: 8 },
  { firstName: 'Martin', lastName: 'Hongla', displayName: 'Hongla', nationCode: 'CMR', position: 'MID', price: 5.0, number: 10 },
  { firstName: 'Pierre', lastName: 'Kunde', displayName: 'Kunde', nationCode: 'CMR', position: 'MID', price: 5.0, number: 18 },
  { firstName: 'Vincent', lastName: 'Aboubakar', displayName: 'Aboubakar', nationCode: 'CMR', position: 'FWD', price: 7.0, number: 10 },
  { firstName: 'Eric Maxim', lastName: 'Choupo-Moting', displayName: 'Choupo-Moting', nationCode: 'CMR', position: 'FWD', price: 7.0, number: 13 },
  { firstName: 'Bryan', lastName: 'Mbeumo', displayName: 'Mbeumo', nationCode: 'CMR', position: 'FWD', price: 7.5, number: 7 },

  // WALES
  { firstName: 'Danny', lastName: 'Ward', displayName: 'Ward', nationCode: 'WAL', position: 'GK', price: 4.5, number: 1 },
  { firstName: 'Ben', lastName: 'Davies', displayName: 'B. Davies', nationCode: 'WAL', position: 'DEF', price: 5.0, number: 4 },
  { firstName: 'Chris', lastName: 'Mepham', displayName: 'Mepham', nationCode: 'WAL', position: 'DEF', price: 4.5, number: 5 },
  { firstName: 'Joe', lastName: 'Rodon', displayName: 'Rodon', nationCode: 'WAL', position: 'DEF', price: 4.5, number: 6 },
  { firstName: 'Neco', lastName: 'Williams', displayName: 'N. Williams', nationCode: 'WAL', position: 'DEF', price: 5.0, number: 3 },
  { firstName: 'Aaron', lastName: 'Ramsey', displayName: 'Ramsey', nationCode: 'WAL', position: 'MID', price: 6.5, number: 10 },
  { firstName: 'Harry', lastName: 'Wilson', displayName: 'H. Wilson', nationCode: 'WAL', position: 'MID', price: 6.0, number: 7 },
  { firstName: 'Joe', lastName: 'Allen', displayName: 'Allen', nationCode: 'WAL', position: 'MID', price: 5.0, number: 14 },
  { firstName: 'Brennan', lastName: 'Johnson', displayName: 'B. Johnson', nationCode: 'WAL', position: 'FWD', price: 7.0, number: 9 },
  { firstName: 'Daniel', lastName: 'James', displayName: 'D. James', nationCode: 'WAL', position: 'FWD', price: 6.5, number: 20 },
];

async function main() {
  console.log('🌍 Adding 6 missing nations to complete 48 teams...\n');

  // Check current count
  const currentCount = await prisma.nation.count();
  console.log(`Current nations in database: ${currentCount}`);

  if (currentCount >= 48) {
    console.log('✅ Already have 48+ nations. No action needed.');
    return;
  }

  // Add missing nations
  const nationMap: Record<string, string> = {};
  
  for (const nation of missingNations) {
    // Check if nation already exists
    const existing = await prisma.nation.findFirst({
      where: { code: nation.code },
    });

    if (existing) {
      console.log(`   ⏭️  ${nation.name} (${nation.code}) already exists`);
      nationMap[nation.code] = existing.id;
      continue;
    }

    const created = await prisma.nation.create({
      data: {
        name: nation.name,
        code: nation.code,
        group: nation.group,
        kitColor1: nation.kitColor1,
        kitColor2: nation.kitColor2,
      },
    });
    nationMap[nation.code] = created.id;
    console.log(`   ✅ Added ${nation.name} (${nation.code}) to Group ${nation.group}`);
  }

  // Add players for new nations
  console.log('\n⚽ Adding players for new nations...');
  let playerCount = 0;

  for (const player of newPlayers) {
    const nationId = nationMap[player.nationCode];
    if (!nationId) {
      // Try to find existing nation
      const existingNation = await prisma.nation.findFirst({
        where: { code: player.nationCode },
      });
      if (!existingNation) {
        console.log(`   ⚠️  Skipping ${player.displayName} - nation ${player.nationCode} not found`);
        continue;
      }
    }

    // Check if player already exists
    const existing = await prisma.player.findFirst({
      where: {
        displayName: player.displayName,
        nation: { code: player.nationCode },
      },
    });

    if (existing) {
      continue; // Skip existing players
    }

    const finalNationId = nationId || (await prisma.nation.findFirst({ where: { code: player.nationCode } }))?.id;
    
    if (finalNationId) {
      await prisma.player.create({
        data: {
          firstName: player.firstName,
          lastName: player.lastName,
          displayName: player.displayName,
          nationId: finalNationId,
          position: player.position,
          currentPrice: player.price,
          shirtNumber: player.number,
        },
      });
      playerCount++;
    }
  }

  console.log(`   ✅ Added ${playerCount} new players`);

  // Final count
  const finalNationCount = await prisma.nation.count();
  const finalPlayerCount = await prisma.player.count();

  console.log('\n=========================================');
  console.log('✅ Update completed!');
  console.log(`   Nations: ${finalNationCount}`);
  console.log(`   Players: ${finalPlayerCount}`);
  console.log('=========================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
