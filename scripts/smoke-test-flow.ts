// End-to-end smoke test against a locally running dev server.
// Registers/logs in a test user, builds a legal 15-man squad, saves it,
// then performs one transfer. Read-only against API-Football; writes only
// the throwaway test user's data to the DB.
//
// Usage: npx tsx scripts/smoke-test-flow.ts

const BASE = 'http://localhost:3000';
const EMAIL = 'smoketest@test.com';
const PASS = 'Test1234!';

let cookie = '';

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

interface ApiPlayer {
  id: string;
  displayName: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  currentPrice: number;
  nation: { code: string };
}

async function main() {
  // 1. login (user was registered earlier; register if needed)
  let r = await call('POST', '/api/auth/login', { email: EMAIL, password: PASS });
  if (r.status !== 200) {
    r = await call('POST', '/api/auth/register', {
      email: EMAIL,
      password: PASS,
      username: 'smoketest',
    });
  }
  console.log('login/register:', r.status);
  if (!cookie) throw new Error('no auth cookie');

  // 2. create team (ok if it already exists)
  r = await call('POST', '/api/team', { name: 'Smoke Test FC' });
  console.log('create team:', r.status, r.json?.error ?? '');

  // 3. fetch players and build a legal squad: 2 GK / 5 DEF / 5 MID / 3 FWD,
  //    <= 3 per nation, <= 100m total. Cheapest-first keeps us under budget.
  r = await call('GET', '/api/players');
  const players: ApiPlayer[] = Array.isArray(r.json) ? r.json : r.json.players;
  console.log('players available:', players.length);

  const quota: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
  const nationCount: Record<string, number> = {};
  const picked: ApiPlayer[] = [];
  for (const p of [...players].sort((a, b) => a.currentPrice - b.currentPrice)) {
    if (quota[p.position] <= 0) continue;
    if ((nationCount[p.nation.code] ?? 0) >= 3) continue;
    quota[p.position]--;
    nationCount[p.nation.code] = (nationCount[p.nation.code] ?? 0) + 1;
    picked.push(p);
    if (picked.length === 15) break;
  }
  const total = picked.reduce((s, p) => s + p.currentPrice, 0);
  console.log(`picked 15 (${total.toFixed(1)}m):`, picked.map((p) => `${p.displayName}/${p.position}`).join(', '));

  // XI: 1 GK + 4 DEF + 4 MID + 2 FWD; bench: the rest
  const gk = picked.filter((p) => p.position === 'GK');
  const def = picked.filter((p) => p.position === 'DEF');
  const mid = picked.filter((p) => p.position === 'MID');
  const fwd = picked.filter((p) => p.position === 'FWD');
  const xi = [gk[0], ...def.slice(0, 4), ...mid.slice(0, 4), ...fwd.slice(0, 2)];
  const bench = [gk[1], def[4], mid[4], fwd[2]];

  r = await call('POST', '/api/squad/save', {
    players: picked.map((p) => ({ playerId: p.id, purchasePrice: p.currentPrice })),
    startingXI: xi.map((p) => p.id),
    bench: bench.map((p) => p.id),
    captainId: xi[10].id,
    viceCaptainId: xi[9].id,
  });
  console.log('save squad:', r.status, r.json?.error ?? 'ok');

  // 4. read squad back
  r = await call('GET', '/api/squad/get');
  console.log(
    'get squad:',
    r.status,
    '| players:',
    r.json?.squad?.length ?? r.json?.players?.length ?? '?',
    '| bank:',
    r.json?.team?.bankBalance ?? r.json?.bankBalance ?? '?',
  );

  // 5. one transfer: swap a bench player for the next-cheapest same-position player
  const out = bench[1]; // a DEF
  const replacement = players
    .filter(
      (p) =>
        p.position === out.position &&
        !picked.some((q) => q.id === p.id) &&
        (nationCount[p.nation.code] ?? 0) < 3,
    )
    .sort((a, b) => a.currentPrice - b.currentPrice)[0];
  console.log(`transfer: ${out.displayName} -> ${replacement.displayName} (${replacement.currentPrice}m)`);
  r = await call('POST', '/api/transfers', {
    transfers: [{ playerOutId: out.id, playerInId: replacement.id }],
  });
  console.log('transfer:', r.status, r.json?.error ?? JSON.stringify(r.json)?.slice(0, 200));

  console.log('\nSMOKE TEST DONE');
}

main().catch((e) => {
  console.error('SMOKE TEST FAILED:', e);
  process.exit(1);
});
