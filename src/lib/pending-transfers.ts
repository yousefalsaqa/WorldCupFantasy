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
          isFreeTransfer: true,
          isWildcard: !!t.isWildcard,
        },
      });

      squadIds.delete(t.playerOutId);
      squadIds.add(t.playerInId);
      bankDelta += t.priceOut - t.priceIn;
      applied += 1;
    }

    // Recompute team value from the post-apply squad (current prices, same
    // convention as /api/transfers).
    const updatedSquad = await tx.squadPlayer.findMany({
      where: { teamId },
      include: { player: { select: { currentPrice: true } } },
    });
    const newTeamValue = updatedSquad.reduce((sum, sp) => sum + sp.player.currentPrice, 0);

    await tx.team.update({
      where: { id: teamId },
      data: {
        bankBalance: team.bankBalance + bankDelta,
        teamValue: newTeamValue,
        pendingTransfers: null,
      },
    });
  }, { timeout: 15000 });

  return { applied, skipped };
}
