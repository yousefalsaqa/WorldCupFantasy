// Smoke-test every API the dashboard quick-action pages depend on, using a
// locally-minted admin JWT (same signing path as lib/auth). Run against the
// local dev server:
//   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/smoke-test-dashboard-apis.ts
import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';

const prisma = new PrismaClient();
const BASE = 'http://localhost:3000';

const ENDPOINTS = [
  // page → the APIs it calls on load
  ['/dashboard', '/api/auth/me'],
  ['/dashboard', '/api/team'],
  ['/dashboard', '/api/stages/current'],
  ['/squad (My Squad)', '/api/squad/get'],
  ['/squad (My Squad)', '/api/chips'],
  ['/squad picker', '/api/players?limit=5'],
  ['/fixtures', '/api/live/matches'],
  ['/standings', '/api/standings'],
  ['/transfers (Activity)', '/api/transfers/history'],
  ['/leagues', '/api/leagues'],
  ['/leagues', '/api/leagues/standings'],
  ['/history', '/api/gameweek/GR1'],
  ['/trends', '/api/trends'],
  ['/dream-team', '/api/dream-team'],
  ['/admin', '/api/admin/stats'],
  ['/admin', '/api/live/sync'],
] as const;

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

  let pass = 0, fail = 0;
  for (const [page, ep] of ENDPOINTS) {
    try {
      const res = await fetch(`${BASE}${ep}`, { headers: { cookie: `auth_token=${token}` } });
      const ok = res.status >= 200 && res.status < 300;
      if (ok) pass++; else fail++;
      let note = '';
      if (!ok) note = ` body: ${(await res.text()).slice(0, 120)}`;
      console.log(`${ok ? '✓' : '✗'} ${String(res.status).padEnd(3)} ${ep.padEnd(28)} (${page})${note}`);
    } catch (e) {
      fail++;
      console.log(`✗ ERR ${ep} (${page}): ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
}

main().finally(() => prisma.$disconnect());
