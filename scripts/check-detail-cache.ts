// READ-ONLY: inspect Match.detailCache for KSA-URU and IRN-NZL.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function dump(homeCodes: string[], awayCodes: string[]) {
  const match = await prisma.match.findFirst({
    where: {
      homeNation: { code: { in: homeCodes } },
      awayNation: { code: { in: awayCodes } },
    },
    include: { homeNation: true, awayNation: true },
  });
  if (!match) { console.log(`NO MATCH ${homeCodes}-${awayCodes}`); return; }
  const label = `${match.homeNation.code}-${match.awayNation.code}`;
  if (!match.detailCache) {
    console.log(`\n=== ${label} === detailCache: NULL (never fetched)`);
    return;
  }
  let env: any;
  try { env = JSON.parse(match.detailCache); } catch { console.log(`${label}: unparseable`); return; }
  const p = env.payload ?? {};
  console.log(`\n=== ${label} ===`);
  console.log(`fetchedAt: ${env.fetchedAt}  final: ${env.final}`);
  console.log(`status: ${JSON.stringify(p.status)}`);
  console.log(`stats rows: ${p.stats?.length ?? 'n/a'}`);
  console.log(`lineups: ${p.lineups?.length ?? 'n/a'} (startXI: ${p.lineups?.map((l: any) => l.startXI?.length).join(',')})`);
  console.log(`events: ${p.events?.length ?? 'n/a'}`);
}

async function main() {
  await dump(['KSA', 'SAU'], ['URU']);
  await dump(['IRN', 'IRA'], ['NZL']);
  // contrast with a known-good earlier match
  await dump(['CIV'], ['ECU']);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
