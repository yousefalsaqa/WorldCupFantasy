// Smoke-test the transfer-window state surfaces + tab payload shapes.
// Run against the local dev server:
//   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/smoke-test-transfer-flow.ts
import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';

const prisma = new PrismaClient();
const BASE = 'http://localhost:3000';

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@worldcupfantasy.com' } });
  if (!admin) throw new Error('admin user not found');
  const token = await new SignJWT({
    userId: admin.id, email: admin.email, username: admin.username, isAdmin: admin.isAdmin,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
  const get = async (ep: string) => {
    const res = await fetch(`${BASE}${ep}`, { headers: { cookie: `auth_token=${token}` } });
    return { status: res.status, body: await res.json() };
  };

  const stage = await get('/api/stages/current');
  console.log('stage:', JSON.stringify(stage.body.stage));

  const team = await get('/api/team');
  console.log('team.freeTransfers:', team.body.team?.freeTransfers,
    '| unlimitedTransfers:', team.body.unlimitedTransfers);

  const squad = await get('/api/squad/get');
  console.log('squad/get freeTransfers:', squad.body.freeTransfers,
    '| unlimitedTransfers:', squad.body.unlimitedTransfers,
    '| queuedTransfers:', JSON.stringify(squad.body.queuedTransfers));

  const trends = await get('/api/trends');
  const tKeys = Object.keys(trends.body);
  console.log('trends keys:', tKeys.join(','),
    '| sample sizes:', tKeys.map(k => Array.isArray(trends.body[k]) ? `${k}=${trends.body[k].length}` : '').filter(Boolean).join(' '));

  const dream = await get('/api/dream-team');
  console.log('dream-team keys:', Object.keys(dream.body).join(','),
    '| players:', Array.isArray(dream.body.players) ? dream.body.players.length : dream.body.players);

  const leagues = await get('/api/leagues');
  console.log('leagues:', Array.isArray(leagues.body.leagues) ? `${leagues.body.leagues.length} leagues` : JSON.stringify(leagues.body).slice(0, 120));

  const hist = await get('/api/gameweek/GR1');
  console.log('history GR1 keys:', Object.keys(hist.body).join(','));
}

main().finally(() => prisma.$disconnect());
