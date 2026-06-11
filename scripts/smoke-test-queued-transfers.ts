// End-to-end smoke test for QUEUED transfers (made while a round is locked).
//
// Flow:
//   1. Register/login the throwaway smoke user + build a legal 15-man squad.
//   2. Flip GR1's deadline into the past → stage locks (restored at the end).
//   3. POST /api/transfers → expect queued:true, freeTransfers 2→1,
//      pendingTransfers JSON written, squad untouched.
//   4. Queue a second; then a third must 400 (no hits while locked).
//   5. GET /api/squad/get → queuedTransfers hydrated (2 entries).
//   6. DELETE one → refund to 1 free transfer, 1 left queued.
//   7. Call applyPendingTransfers() directly (what stage-advance runs at the
//      boundary) → verify the swap executed, Transfer row stamped GR2,
//      queue cleared, bank adjusted.
//   8. Restore the GR1 deadline; delete the smoke user (cascades all data).
//
// Usage: node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/smoke-test-queued-transfers.ts

import { PrismaClient } from '@prisma/client';
import { applyPendingTransfers } from '../src/lib/pending-transfers';

const prisma = new PrismaClient();
const BASE = 'http://localhost:3000';
const EMAIL = 'smoketest@test.com';
const PASS = 'Test1234!';

let cookie = '';
let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = '') {
  if (ok) passed++; else failed++;
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let json: any = null;
  try { json = await res.json(); } catch {}
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
  // ---- setup: user + squad -------------------------------------------------
  let r = await call('POST', '/api/auth/login', { email: EMAIL, password: PASS });
  if (r.status !== 200) {
    r = await call('POST', '/api/auth/register', { email: EMAIL, password: PASS, username: 'smoketest' });
  }
  if (!cookie) throw new Error('no auth cookie');
  await call('POST', '/api/team', { name: 'Smoke Test FC' });

  r = await call('GET', '/api/players');
  const players: ApiPlayer[] = Array.isArray(r.json) ? r.json : r.json.players;

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
  check('setup: squad saved', r.status === 200, r.json?.error);

  const team = await prisma.team.findFirst({ where: { user: { email: EMAIL } } });
  if (!team) throw new Error('smoke team not found');

  const gr1 = await prisma.stage.findFirst({ where: { stageId: 'GR1' } });
  const gr2 = await prisma.stage.findFirst({ where: { stageId: 'GR2' } });
  if (!gr1?.deadlineTime || !gr2) throw new Error('GR1/GR2 stages not found');
  const originalDeadline = gr1.deadlineTime;

  // Replacement candidates: same position as a bench DEF, not in squad.
  const replacements = players
    .filter((p) => p.position === 'DEF' && !picked.some((q) => q.id === p.id) && (nationCount[p.nation.code] ?? 0) < 3)
    .sort((a, b) => a.currentPrice - b.currentPrice);
  const out1 = bench[1]; // DEF
  const out2 = def[0];   // another DEF
  const [in1, in2, in3] = replacements;

  try {
    // ---- lock the stage ----------------------------------------------------
    await prisma.stage.update({ where: { id: gr1.id }, data: { deadlineTime: new Date(Date.now() - 60_000) } });

    // ---- queue #1 ----------------------------------------------------------
    r = await call('POST', '/api/transfers', { transfers: [{ playerOutId: out1.id, playerInId: in1.id }] });
    check('queue #1 accepted as queued', r.status === 200 && r.json?.queued === true, JSON.stringify(r.json));

    let t = await prisma.team.findUnique({ where: { id: team.id } });
    check('freeTransfers 2 → 1', t?.freeTransfers === 1, `got ${t?.freeTransfers}`);
    check('pendingTransfers JSON written', !!t?.pendingTransfers && t.pendingTransfers.includes(in1.id));
    const squadCount = await prisma.squadPlayer.count({ where: { teamId: team.id, playerId: out1.id } });
    check('squad untouched (out player still in)', squadCount === 1);

    // ---- queue #2, then over-limit #3 ---------------------------------------
    r = await call('POST', '/api/transfers', { transfers: [{ playerOutId: out2.id, playerInId: in2.id }] });
    check('queue #2 accepted', r.status === 200 && r.json?.queued === true, JSON.stringify(r.json));
    r = await call('POST', '/api/transfers', { transfers: [{ playerOutId: def[1].id, playerInId: in3.id }] });
    check('queue #3 rejected (no free transfers left)', r.status === 400, JSON.stringify(r.json));

    // duplicate guards
    r = await call('POST', '/api/transfers', { transfers: [{ playerOutId: out1.id, playerInId: in3.id }] });
    check('re-queueing same player out rejected', r.status === 400, JSON.stringify(r.json));

    // ---- hydrated queue in squad/get ----------------------------------------
    r = await call('GET', '/api/squad/get');
    check('squad/get returns 2 queued', r.json?.queuedTransfers?.length === 2, JSON.stringify(r.json?.queuedTransfers));
    check('squad/get unlimited=false while locked', r.json?.unlimitedTransfers === false);

    // ---- cancel one ----------------------------------------------------------
    r = await call('DELETE', '/api/transfers', { playerInId: in2.id });
    check('cancel queued #2', r.status === 200 && r.json?.remaining === 1, JSON.stringify(r.json));
    t = await prisma.team.findUnique({ where: { id: team.id } });
    check('freeTransfers refunded to 1', t?.freeTransfers === 1, `got ${t?.freeTransfers}`);

    // ---- apply at the stage boundary (what stage-advance runs) --------------
    const bankBefore = t!.bankBalance;
    const res = await applyPendingTransfers(team.id, t!.pendingTransfers, gr2.id);
    check('apply: 1 applied, 0 skipped', res.applied === 1 && res.skipped === 0, JSON.stringify(res));
    const inSquad = await prisma.squadPlayer.count({ where: { teamId: team.id, playerId: in1.id } });
    const outSquad = await prisma.squadPlayer.count({ where: { teamId: team.id, playerId: out1.id } });
    check('apply: swap executed', inSquad === 1 && outSquad === 0);
    t = await prisma.team.findUnique({ where: { id: team.id } });
    check('apply: queue cleared', !t?.pendingTransfers);
    const expectedBank = bankBefore + out1.currentPrice - in1.currentPrice;
    check('apply: bank adjusted', Math.abs((t?.bankBalance ?? 0) - expectedBank) < 0.001,
      `got ${t?.bankBalance}, expected ${expectedBank}`);
    const transferRow = await prisma.transfer.findFirst({
      where: { teamId: team.id, playerInId: in1.id, stageId: gr2.id },
    });
    check('apply: Transfer row stamped with GR2', !!transferRow && transferRow.isFreeTransfer);
  } finally {
    // ---- restore prod state --------------------------------------------------
    await prisma.stage.update({ where: { id: gr1.id }, data: { deadlineTime: originalDeadline } });
    const user = await prisma.user.findUnique({ where: { email: EMAIL } });
    if (user) await prisma.user.delete({ where: { id: user.id } });
    console.log('cleanup: GR1 deadline restored, smoke user deleted');
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('SMOKE TEST FAILED:', e);
  process.exit(1);
});
