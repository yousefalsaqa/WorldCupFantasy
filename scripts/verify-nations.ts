import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EXPECTED: Record<string, string[]> = {
  A: ['MEX', 'RSA', 'KOR', 'CZE'],
  B: ['CAN', 'BIH', 'QAT', 'SUI'],
  C: ['BRA', 'MAR', 'HAI', 'SCO'],
  D: ['USA', 'PAR', 'AUS', 'TUR'],
  E: ['GER', 'CUW', 'CIV', 'ECU'],
  F: ['NED', 'JPN', 'SWE', 'TUN'],
  G: ['BEL', 'EGY', 'IRN', 'NZL'],
  H: ['ESP', 'CPV', 'KSA', 'URU'],
  I: ['FRA', 'SEN', 'IRQ', 'NOR'],
  J: ['ARG', 'ALG', 'AUT', 'JOR'],
  K: ['POR', 'COD', 'UZB', 'COL'],
  L: ['ENG', 'CRO', 'GHA', 'PAN'],
};

async function main() {
  const ns = await prisma.nation.findMany({
    include: { _count: { select: { players: true } } },
  });

  const byGroup = ns.reduce<Record<string, { code: string; players: number; name: string }[]>>(
    (acc, n) => {
      const g = n.group || '?';
      (acc[g] ||= []).push({ code: n.code, players: n._count.players, name: n.name });
      return acc;
    },
    {},
  );

  console.log('\n📊  Database verification\n');
  let totalErrors = 0;
  for (const g of Object.keys(EXPECTED).sort()) {
    const got = (byGroup[g] || []).map(n => n.code).sort();
    const want = [...EXPECTED[g]].sort();
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) totalErrors++;
    const marker = ok ? '✅' : '❌';
    const list = (byGroup[g] || [])
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(n => `${n.code}(${n.players})`)
      .join('  ');
    console.log(`  ${marker}  Group ${g}:  ${list}`);
    if (!ok) {
      console.log(`         expected:  ${want.join(', ')}`);
    }
  }

  console.log('\n  Total nations:  ' + ns.length + ' / 48');
  console.log('  Total players:  ' + (await prisma.player.count()));
  if (totalErrors === 0) {
    console.log('\n🎯  All 12 groups match the official draw.\n');
  } else {
    console.log('\n⚠️  ' + totalErrors + ' group(s) do not match expected.\n');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
