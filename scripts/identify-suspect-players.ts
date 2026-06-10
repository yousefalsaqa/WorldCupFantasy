// Identify suspect duplicate players by asking API-Football who each
// player id actually is. Read-only; ~10 API calls.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_KEY = process.env.API_FOOTBALL_KEY || '';

async function profile(id: number) {
  const res = await fetch(`https://v3.football.api-sports.io/players/profiles?player=${id}`, {
    headers: { 'x-apisports-key': API_KEY },
  });
  const data = await res.json();
  const p = data.response?.[0]?.player;
  return p ? `${p.name} | ${p.firstname} ${p.lastname} | born ${p.birth?.date} ${p.birth?.country ?? ''} | ${p.position}` : 'NOT FOUND';
}

async function main() {
  // Pull the KOR Son rows + the other suspects from DB first
  const suspects = await prisma.player.findMany({
    where: {
      OR: [
        { nation: { code: 'KOR' }, displayName: { contains: 'Son' } },
        { nation: { code: 'POR' }, displayName: { in: ['B. Silva', 'Bernardo Silva'] } },
        { nation: { code: 'CRO' }, displayName: { in: ['Pašalić', 'M. Pasalic'] } },
        { nation: { code: 'ECU' }, displayName: 'E. Valencia' },
        { nation: { code: 'MEX' }, displayName: { in: ['Chávez', 'L. Chávez'] } },
      ],
    },
    select: { id: true, displayName: true, position: true, currentPrice: true, apiFootballId: true, nation: { select: { code: true } } },
  });

  for (const s of suspects) {
    const who = s.apiFootballId ? await profile(s.apiFootballId) : 'no api id';
    console.log(`${s.nation?.code} ${s.displayName.padEnd(18)} £${s.currentPrice} ${s.position} api=${s.apiFootballId}\n    → ${who}`);
  }
}

main().finally(() => prisma.$disconnect());
