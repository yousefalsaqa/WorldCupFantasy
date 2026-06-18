// ============================================
// Queued ("pending") transfers
//
// While a round is being played the squad is locked — but users can still
// queue transfers, which are applied automatically the moment the next
// round starts (inside lib/stage-advance). The queue lives as a JSON
// column on Team (`pendingTransfers`), mirroring the freeHitSnapshot
// pattern, so no new table was needed.
//
// Rules:
//   • Queued transfers spend the CURRENT round's remaining free transfers
//     (decremented at queue time so every UI surface shows the truth).
//   • No point hits while queuing — you can only queue up to your
//     remaining free transfer count.
//   • Prices are locked in at queue time (World Cup mode uses fixed
//     prices, so this only matters if an admin price-sync lands between
//     queue and apply).
//   • At apply time each entry is re-validated (player still in squad,
//     incoming player still available, no duplicate). Entries that fail
//     are skipped and their free transfer refunded.
// ============================================

import { prisma } from './db';

export interface PendingTransfer {
  playerOutId: string;
  playerInId: string;
  priceIn: number;
  priceOut: number;
  queuedAt: string; // ISO timestamp, informational
  // Queued under a next-round Wildcard: doesn't consume a free transfer and
  // never incurs a hit. Absent/false = a normal free queued transfer.
  isWildcard?: boolean;
  // False = this queued transfer was beyond the free allotment and carries a
  // -4 point hit (applied to the round it takes effect in). Absent/true = free.
  isFree?: boolean;
}

export function parsePendingTransfers(json: string | null | undefined): PendingTransfer[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is PendingTransfer =>
        t &&
        typeof t.playerOutId === 'string' &&
        typeof t.playerInId === 'string' &&
        typeof t.priceIn === 'number' &&
        typeof t.priceOut === 'number',
    );
  } catch {
    return [];
  }
}

export function serializePendingTransfers(list: PendingTransfer[]): string | null {
  return list.length === 0 ? null : JSON.stringify(list);
}

// ============================================
// Planned (next-round) lineup
//
// The lineup the user arranged for the post-transfer squad while the current
// round was locked. Stored on Team.plannedLineup as JSON and applied right
// after the queued transfers at the stage boundary (then cleared). Ids are the
// FINAL player ids (incoming where a transfer applied, current otherwise).
// ============================================

export interface PlannedLineup {
  startingXI: string[];
  bench: string[];
  captainId: string;
  viceCaptainId: string;
}

export function parsePlannedLineup(json: string | null | undefined): PlannedLineup | null {
  if (!json) return null;
  try {
    const p = JSON.parse(json);
    if (
      p &&
      Array.isArray(p.startingXI) && p.startingXI.length === 11 &&
      Array.isArray(p.bench) && p.bench.length === 4 &&
      typeof p.captainId === 'string' &&
      typeof p.viceCaptainId === 'string' &&
      [...p.startingXI, ...p.bench].every((id: unknown) => typeof id === 'string')
    ) {
      return { startingXI: p.startingXI, bench: p.bench, captainId: p.captainId, viceCaptainId: p.viceCaptainId };
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function serializePlannedLineup(lineup: PlannedLineup | null): string | null {
  return lineup ? JSON.stringify(lineup) : null;
}

export interface ApplyResult {
  applied: number;
  // Queued transfers that could no longer be executed (player left squad,
  // incoming player unavailable, …). Each one refunds a free transfer.
  skipped: number;
}

/**
 * Execute a team's queued transfers at the stage boundary. Called from
 * lib/stage-advance AFTER the closing stage has been settled (so scoring
 * used the squad that actually played) and BEFORE the new free-transfer
 * allocation is written (the caller adds `skipped` back as refunds).
 *
 * Always clears `pendingTransfers`, even when entries are skipped — the
 * queue is strictly one-shot per stage boundary.
 */
export async function applyPendingTransfers(
  teamId: string,
  pendingJson: string | null,
  nextStageDbId: string,
): Promise<ApplyResult> {
  const pending = parsePendingTransfers(pendingJson);
  if (pending.length === 0) {
    return { applied: 0, skipped: 0 };
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { squadPlayers: true },
  });
  if (!team) return { applied: 0, skipped: pending.length };

  const incomingIds = pending.map((t) => t.playerInId);
  const incomingPlayers = await prisma.player.findMany({
    where: { id: { in: incomingIds } },
    select: { id: true, isAvailable: true, currentPrice: true },
  });
  const incomingById = new Map(incomingPlayers.map((p) => [p.id, p]));

  let applied = 0;
  let skipped = 0;
  // Points hit for queued transfers beyond the free allotment (isFree === false),
  // charged to the round they take effect in. Wildcard entries are always free.
  const HIT_COST = 4;
  let paidApplied = 0;

  await prisma.$transaction(async (tx) => {
    // Track squad membership as we go so one queue can't double-fill a slot.
    const squadIds = new Set(team.squadPlayers.map((sp) => sp.playerId));
    let bankDelta = 0;

    for (const t of pending) {
      const squadPlayer = team.squadPlayers.find((sp) => sp.playerId === t.playerOutId);
      const playerIn = incomingById.get(t.playerInId);
      const valid =
        squadPlayer &&
        squadIds.has(t.playerOutId) &&
        playerIn &&
        playerIn.isAvailable &&
        !squadIds.has(t.playerInId);

      if (!valid) {
        skipped += 1;
        continue;
      }

      await tx.squadPlayer.delete({ where: { id: squadPlayer.id } });
      await tx.squadPlayer.create({
        data: {
          teamId,
          playerId: t.playerInId,
          // Honour the price the user queued at — it's what their budget
          // check was validated against.
          purchasePrice: t.priceIn,
          isStarting: squadPlayer.isStarting,
          isCaptain: squadPlayer.isCaptain,
          isViceCaptain: squadPlayer.isViceCaptain,
          benchOrder: squadPlayer.benchOrder,
          points: 0,
        },
      });
      await tx.transfer.create({
        data: {
          teamId,
          // Stamped with the stage the transfer takes effect in.
          stageId: nextStageDbId,
          playerInId: t.playerInId,
          playerOutId: t.playerOutId,
          priceIn: t.priceIn,
          priceOut: t.priceOut,
          // Paid (over-allotment) entries are NOT free — settleStage counts
          // these for the stage's transfer-hit total.
          isFreeTransfer: t.isWildcard ? true : t.isFree !== false,
          isWildcard: !!t.isWildcard,
        },
      });

      squadIds.delete(t.playerOutId);
      squadIds.add(t.playerInId);
      bankDelta += t.priceOut - t.priceIn;
      if (!t.isWildcard && t.isFree === false) paidApplied += 1;
      applied += 1;
    }

    // Recompute team value from the post-apply squad (current prices, same
    // convention as /api/transfers). Also grab positions so we can validate a
    // planned lineup against the final squad.
    const updatedSquad = await tx.squadPlayer.findMany({
      where: { teamId },
      include: { player: { select: { currentPrice: true, position: true } } },
    });
    const newTeamValue = updatedSquad.reduce((sum, sp) => sum + sp.player.currentPrice, 0);

    // Apply the planned (next-round) lineup over the inherited slots, if the
    // user saved one and it's still valid against the final 15. Invalid or
    // stale lineups are ignored (the inherited slots stand). Always cleared.
    const planned = parsePlannedLineup(team.plannedLineup);
    if (planned) {
      const finalIds = new Set(updatedSquad.map((sp) => sp.playerId));
      const submitted = [...planned.startingXI, ...planned.bench];
      const posById = new Map(updatedSquad.map((sp) => [sp.playerId, sp.player.position]));
      const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      planned.startingXI.forEach((id) => { const pos = posById.get(id); if (pos) counts[pos]++; });
      const formationOk =
        counts.GK === 1 &&
        counts.DEF >= 3 && counts.DEF <= 5 &&
        counts.MID >= 2 && counts.MID <= 5 &&
        counts.FWD >= 1 && counts.FWD <= 3;
      const lineupValid =
        submitted.length === 15 &&
        new Set(submitted).size === 15 &&
        submitted.every((id) => finalIds.has(id)) &&
        planned.startingXI.includes(planned.captainId) &&
        planned.startingXI.includes(planned.viceCaptainId) &&
        planned.captainId !== planned.viceCaptainId &&
        formationOk;

      if (lineupValid) {
        const startSet = new Set(planned.startingXI);
        const benchIdx = new Map(planned.bench.map((id, i) => [id, i + 1]));
        for (const sp of updatedSquad) {
          await tx.squadPlayer.update({
            where: { id: sp.id },
            data: {
              isStarting: startSet.has(sp.playerId),
              benchOrder: startSet.has(sp.playerId) ? null : (benchIdx.get(sp.playerId) ?? null),
              isCaptain: sp.playerId === planned.captainId,
              isViceCaptain: sp.playerId === planned.viceCaptainId,
            },
          });
        }
      }
    }

    await tx.team.update({
      where: { id: teamId },
      data: {
        bankBalance: team.bankBalance + bankDelta,
        teamValue: newTeamValue,
        pendingTransfers: null,
        plannedLineup: null,
        // Charge the running leaderboard total for over-allotment queued
        // transfers now (mirrors immediate-mode's deduct-at-transfer). The
        // per-stage TeamStage.transferHits snapshot is written separately by
        // settleStage from the Transfer rows above.
        ...(paidApplied > 0 ? { totalPoints: { decrement: paidApplied * HIT_COST } } : {}),
      },
    });
  }, { timeout: 15000 });

  return { applied, skipped };
}
