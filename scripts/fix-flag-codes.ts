import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Map nation codes to ISO 2-letter flag codes
const flagCodeMap: Record<string, string> = {
  MEX: 'mx',
  RSA: 'za',
  KOR: 'kr',
  CAN: 'ca',
  QAT: 'qa',
  SUI: 'ch',
  BRA: 'br',
  MAR: 'ma',
  HAI: 'ht',
  SCO: 'gb-sct',
  USA: 'us',
  PAR: 'py',
  AUS: 'au',
  GER: 'de',
  CUW: 'cw',
  CIV: 'ci',
  ECU: 'ec',
  NED: 'nl',
  JPN: 'jp',
  TUN: 'tn',
  BEL: 'be',
  EGY: 'eg',
  IRN: 'ir',
  NZL: 'nz',
  ESP: 'es',
  CPV: 'cv',
  KSA: 'sa',
  URU: 'uy',
  FRA: 'fr',
  SEN: 'sn',
  NOR: 'no',
  ARG: 'ar',
  ALG: 'dz',
  JOR: 'jo',
  POR: 'pt',
  UZB: 'uz',
  COL: 'co',
  ENG: 'gb-eng',
  CRO: 'hr',
  GHA: 'gh',
  PAN: 'pa',
};

async function main() {
  console.log('Updating flag codes for all nations...\n');

  const nations = await prisma.nation.findMany();
  
  for (const nation of nations) {
    const flagCode = flagCodeMap[nation.code];
    if (flagCode) {
      // Note: flagCode field doesn't exist in schema - this script is deprecated
      // await prisma.nation.update({
      //   where: { id: nation.id },
      //   data: { flagCode }
      // });
      console.log(`✓ ${nation.name} (${nation.code}) -> ${flagCode}`);
    } else {
      console.log(`⚠ ${nation.name} (${nation.code}) - no mapping found`);
    }
  }

  await prisma.$disconnect();
  console.log('\nDone!');
}

main();
