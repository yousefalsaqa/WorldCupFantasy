import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const fwdPlayers = await prisma.player.findMany({
    where: { position: 'FWD' },
    include: { nation: true }
  });

  console.log(`Found ${fwdPlayers.length} FWD players:\n`);
  fwdPlayers.forEach(p => {
    console.log(`  ${p.displayName} (${p.nation.code}) - £${p.currentPrice}m`);
  });

  // Check nations for code
  console.log('\n\nNations:');
  const nations = await prisma.nation.findMany();
  nations.forEach(n => {
    console.log(`  ${n.name} (${n.code})`);
  });

  await prisma.$disconnect();
}

main();
