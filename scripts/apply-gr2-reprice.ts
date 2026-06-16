// ============================================================================
// GR2 RE-PRICE — apply the staged cheaper+finer price curve to the prod DB.
//
//   npx tsx --env-file=.env scripts/apply-gr2-reprice.ts          # DRY RUN
//   npx tsx --env-file=.env scripts/apply-gr2-reprice.ts --apply  # WRITE
//
// DRY RUN by default: writes nothing, prints every price change, the full
// per-team budget rebase, the re-snapshotted queued transfers, and reproduces
// the validated sim summary (avg ~£4.70, priciest squad ~£98.8, 0 over £100m)
// so we can confirm the curve matches scripts/price-sim.ts before applying.
//
// What --apply does, in ONE transaction:
//   1. Player.currentPrice  := curve price (1,238 matched; unmatched untouched)
//   2. For every squad: SquadPlayer.purchasePrice := new currentPrice
//                       Team.bankBalance          := 100 − new squad cost
//                       Team.teamValue            := new squad cost
//   3. Teams with queued transfers: rewrite pendingTransfers priceIn/priceOut
//      to the new prices (purchase-price-refund parity at the GR1→GR2 boundary).
//
// SAFETY:
//   - Idempotent: bank/value are RECOMPUTED (100 − cost), never incremented.
//   - Hard abort: refuses --apply if ANY team's new squad cost > £100m.
//   - Must run in the GR1→GR2 unlock window (after GR1 settles, before the
//     GR2 deadline 2026-06-18 16:00Z) — NOT mid-round. This script does not
//     enforce that; the operator must.
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../src/lib/db';

// --- CURVE: must stay identical to scripts/price-sim.ts ANCHORS -------------
const ANCHORS: [number, number][] = [
  [3.5, 3.3],
  [4.0, 3.8],
  [4.7, 4.4],
  [5.5, 5.2],
  [6.2, 6.0],
  [7.0, 6.9],
  [8.0, 8.2],
  [9.0, 9.9],
  [10.5, 13.5],
];
function interp(fifa: number): number {
  if (fifa <= ANCHORS[0][0]) return ANCHORS[0][1];
  const last = ANCHORS[ANCHORS.length - 1];
  if (fifa >= last[0]) return last[1];
  for (let i = 1; i < ANCHORS.length; i++) {
    const [x0, y0] = ANCHORS[i - 1];
    const [x1, y1] = ANCHORS[i];
    if (fifa <= x1) return y0 + ((y1 - y0) * (fifa - x0)) / (x1 - x0);
  }
  return fifa;
}
const newFromFifa = (fifa: number) => Math.max(3.0, Math.round(interp(fifa) * 10) / 10);
const r1 = (x: number) => Math.round(x * 10) / 10; // round to 0.1 (kills float noise)

const APPLY = process.argv.includes('--apply');

interface MapRow { id: string; code: string; name: string; pos: string; ours: number; fifa: number; }

async function main() {
  console.log(APPLY ? '*** APPLY MODE — will mutate prod DB ***\n' : '--- DRY RUN (no writes) ---\n');

  // 1) Curve map: our DB id -> new price
  const map: MapRow[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fifa-match-map.json'), 'utf8'),
  );
  const newById = new Map(map.map((m) => [m.id, newFromFifa(m.fifa)]));

  // 2) Every player's current price (fallback for unmatched + pending lookups)
  const allPlayers = await prisma.player.findMany({
    select: { id: true, displayName: true, currentPrice: true, position: true, isAvailable: true },
  });
  const curById = new Map(allPlayers.map((p) => [p.id, p.currentPrice]));
  const nameById = new Map(allPlayers.map((p) => [p.id, p.displayName]));
  const newPriceOf = (id: string) => newById.get(id) ?? curById.get(id);

  // --- price changes (matched players only) ---
  const changes: { id: string; name: string; from: number; to: number }[] = [];
  for (const m of map) {
    const cur = curById.get(m.id);
    if (cur == null) continue; // map references a player no longer in DB
    const nw = newFromFifa(m.fifa);
    if (r1(cur) !== nw) changes.push({ id: m.id, name: nameById.get(m.id) ?? m.name, from: cur, to: nw });
  }

  // --- reproduce sim distribution over the SAME set (isAvailable players) ---
  const availNew = allPlayers
    .filter((p) => p.isAvailable)
    .map((p) => newPriceOf(p.id)!)
    .sort((a, b) => a - b);
  const q = (p: number) => availNew[Math.floor(p * (availNew.length - 1))];
  const avg = (availNew.reduce((a, b) => a + b, 0) / availNew.length).toFixed(2);
  const distinct = new Set(availNew.map((x) => r1(x))).size;
  const matched = allPlayers.filter((p) => p.isAvailable && newById.has(p.id)).length;
  console.log('=== PRICE CURVE (available pool) ===');
  console.log(`available players: ${availNew.length} (matched ${matched}, unmatched keep current ${availNew.length - matched})`);
  console.log(`NEW: min=${availNew[0]} median=${q(0.5)} p90=${q(0.9)} max=${availNew[availNew.length - 1]} avg=${avg} distinct=${distinct}`);
  console.log(`price changes to write: ${changes.length}`);

  const movers = [...changes].sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
  console.log('top 15 movers:');
  for (const c of movers.slice(0, 15)) {
    console.log(`  ${c.name.padEnd(22)} ${c.from} -> ${c.to}  (${c.to - c.from > 0 ? '+' : ''}${r1(c.to - c.from)})`);
  }

  // 3) Per-team rebase + budget check
  const teams = await prisma.team.findMany({
    where: { squadPlayers: { some: {} } },
    include: {
      squadPlayers: { include: { player: { select: { id: true, currentPrice: true } } } },
      user: { select: { username: true } },
    },
  });

  const teamPlan = teams.map((t) => {
    const cur = r1(t.squadPlayers.reduce((s, sp) => s + sp.player.currentPrice, 0));
    const nw = r1(t.squadPlayers.reduce((s, sp) => s + newPriceOf(sp.player.id)!, 0));
    return { id: t.id, name: t.name, n: t.squadPlayers.length, cur, nw, bank: r1(100 - nw) };
  }).sort((a, b) => b.nw - a.nw);

  console.log(`\n=== PER-TEAM REBASE (${teamPlan.length} squads, cap £100m) ===`);
  let over = 0;
  for (const r of teamPlan) {
    const flag = r.nw > 100 ? '  ⚠ OVER' : '';
    if (r.nw > 100) over++;
    console.log(
      `  ${r.name.slice(0, 20).padEnd(20)} n=${r.n} cur=£${r.cur.toFixed(1).padStart(5)} -> new=£${r.nw.toFixed(1).padStart(5)}  bank=£${r.bank.toFixed(1).padStart(5)}${flag}`,
    );
  }
  const avgNew = (teamPlan.reduce((a, r) => a + r.nw, 0) / teamPlan.length).toFixed(1);
  console.log(`\nteams over £100m: ${over}  |  avg squad cost: £${avgNew}  |  most expensive: £${teamPlan[0].nw.toFixed(1)}`);

  // 4) Re-snapshot queued transfers to new prices
  const pendingTeams = await prisma.team.findMany({
    where: { pendingTransfers: { not: null } },
    select: { id: true, name: true, pendingTransfers: true },
  });
  const pendingRewrites: { teamId: string; json: string }[] = [];
  console.log(`\n=== QUEUED TRANSFERS RE-SNAPSHOT (${pendingTeams.length} team(s)) ===`);
  for (const t of pendingTeams) {
    let entries: any[];
    try { entries = JSON.parse(t.pendingTransfers!); } catch { console.log(`  ${t.name}: UNPARSEABLE pendingTransfers — SKIP`); continue; }
    if (!Array.isArray(entries) || entries.length === 0) continue;
    let dirty = false;
    const rewritten = entries.map((e) => {
      const newIn = newPriceOf(e.playerInId);
      const newOut = newPriceOf(e.playerOutId);
      if (newIn == null || newOut == null) {
        console.log(`  ${t.name}: entry references unknown player (in=${e.playerInId} out=${e.playerOutId}) — left as-is`);
        return e;
      }
      const ni = r1(newIn), no = r1(newOut);
      if (ni !== r1(e.priceIn) || no !== r1(e.priceOut)) dirty = true;
      console.log(
        `  ${t.name}: ${nameById.get(e.playerOutId) ?? e.playerOutId} (out £${e.priceOut}->£${no}) ` +
        `<- ${nameById.get(e.playerInId) ?? e.playerInId} (in £${e.priceIn}->£${ni})`,
      );
      return { ...e, priceIn: ni, priceOut: no };
    });
    if (dirty) pendingRewrites.push({ teamId: t.id, json: JSON.stringify(rewritten) });
  }
  if (pendingTeams.length === 0) console.log('  (none)');

  // --- guard ---
  if (over > 0) {
    console.log(`\nABORT: ${over} team(s) exceed £100m under the new curve. Not applying.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\nDRY RUN complete — nothing written. Re-run with --apply in the GR1->GR2 window.');
    await prisma.$disconnect();
    return;
  }

  // ---- APPLY (one transaction) ----
  // Group player price writes by target price -> few updateMany calls.
  const playerIdsByPrice = new Map<number, string[]>();
  for (const c of changes) {
    if (!playerIdsByPrice.has(c.to)) playerIdsByPrice.set(c.to, []);
    playerIdsByPrice.get(c.to)!.push(c.id);
  }
  // Group squad-player purchasePrice writes by target price across all teams.
  const spIdsByPrice = new Map<number, string[]>();
  const teamRows = await prisma.team.findMany({
    where: { squadPlayers: { some: {} } },
    select: { id: true, squadPlayers: { select: { id: true, playerId: true } } },
  });
  for (const t of teamRows) {
    for (const sp of t.squadPlayers) {
      const price = r1(newPriceOf(sp.playerId)!);
      if (!spIdsByPrice.has(price)) spIdsByPrice.set(price, []);
      spIdsByPrice.get(price)!.push(sp.id);
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const [price, ids] of playerIdsByPrice) {
      await tx.player.updateMany({ where: { id: { in: ids } }, data: { currentPrice: price } });
    }
    for (const [price, ids] of spIdsByPrice) {
      await tx.squadPlayer.updateMany({ where: { id: { in: ids } }, data: { purchasePrice: price } });
    }
    for (const r of teamPlan) {
      await tx.team.update({ where: { id: r.id }, data: { bankBalance: r.bank, teamValue: r.nw } });
    }
    for (const pr of pendingRewrites) {
      await tx.team.update({ where: { id: pr.teamId }, data: { pendingTransfers: pr.json } });
    }
  }, { timeout: 120000 });

  console.log(`\nAPPLIED: ${changes.length} prices, ${teamPlan.length} teams rebased, ${pendingRewrites.length} queue(s) re-snapshotted.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
