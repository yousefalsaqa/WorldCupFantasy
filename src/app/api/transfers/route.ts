import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { getStageLock } from '@/lib/deadline';
import { cookies } from 'next/headers';
import {
  parseActiveChips,
  hasUnlimitedTransferChip,
  type ChipType,
} from '@/lib/chips-active';
import {
  parsePendingTransfers,
  serializePendingTransfers,
  type PendingTransfer,
} from '@/lib/pending-transfers';
import { maxPerNationForStage, isAutoUnlimitedTransferStage } from '@/lib/wc-constants';
import { roundPrice } from '@/lib/utils';
import { logActivity } from '@/lib/activity';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

const TRANSFER_HIT_COST = 4;

// Set to true for testing until first gameweek - allows unlimited free transfers
const UNLIMITED_TRANSFERS = false;

interface TransferRequest {
  playerOutId: string;
  playerInId: string;
}

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token) return null;

  const decoded = await verifyToken(token);
  if (!decoded) return null;

  return { userId: decoded.userId };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Please log in to make transfers' }, { status: 401 });
    }

    // While the round is being played the squad is frozen — but instead of
    // rejecting, we QUEUE the transfers and apply them automatically when
    // the next round starts (lib/stage-advance → lib/pending-transfers).
    const { locked, stage: lockedStage } = await getStageLock();
    const queueMode = locked;

    const body = await request.json();
    const { transfers } = body as { transfers: TransferRequest[] };

    if (!transfers || !Array.isArray(transfers) || transfers.length === 0) {
      return NextResponse.json({ error: 'No transfers provided' }, { status: 400 });
    }

    // Fire-and-forget activity marker for every attempt — success or fail.
    // Unlike AuditLog's TRANSFERS_MADE (written only on success), this
    // fires unconditionally so a rejected attempt (insufficient funds, over
    // nation cap, locked round, etc.) still shows up somewhere. Logged
    // before validation on purpose — captures intent even if it fails.
    logActivity(session.userId, 'TRANSFER_ATTEMPT', { transfers, queueMode });

    // Get user's team
    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
      include: {
        squadPlayers: {
          include: {
            player: {
              include: { nation: true }
            }
          }
        }
      }
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Transfers already queued for next round. They've left the (virtual)
    // squad / joined it, spent free transfers, and reserved budget — all
    // validation below has to treat them as if they already happened.
    const existingPending = queueMode ? parsePendingTransfers(team.pendingTransfers) : [];
    const pendingOutIds = new Set(existingPending.map((t) => t.playerOutId));
    const pendingInIds = new Set(existingPending.map((t) => t.playerInId));
    // £m the queued transfers will pull from the bank when applied.
    const pendingNetCost = existingPending.reduce((sum, t) => sum + t.priceIn - t.priceOut, 0);

    // Next-round Wildcard: if the user has armed a Wildcard for the upcoming
    // round, queued transfers are UNLIMITED and FREE (no cap, no hits, no
    // free-transfer spend) — they apply under the Wildcard at the boundary.
    let nextRoundWildcard = false;
    if (queueMode && lockedStage) {
      const next = await prisma.stage.findFirst({
        where: { order: { gt: lockedStage.order }, isComplete: false },
        orderBy: { order: 'asc' },
        select: { id: true },
      });
      if (next) {
        const ts = await prisma.teamStage.findUnique({
          where: { teamId_stageId: { teamId: team.id, stageId: next.id } },
          select: { chipsUsed: true, chipUsed: true },
        });
        let chips = parseActiveChips(ts?.chipsUsed);
        if (chips.length === 0 && ts?.chipUsed) chips = [ts.chipUsed as ChipType];
        nextRoundWildcard = chips.includes('WILDCARD_1') || chips.includes('WILDCARD_2');
      }
    }

    // Queued transfers beyond the free allotment are allowed — they carry a
    // -4 point hit (charged to the round they take effect in), same as making
    // them at an open deadline. Wildcard-armed next rounds stay unlimited/free.

    // FREE HIT in progress: transfers must target the PRE-FH roster (the team
    // that reverts at the boundary), NOT the temporary Free Hit squad. Build a
    // virtual roster + bank from the snapshot so selling a pre-FH player (e.g.
    // one not in the current Free Hit XI) is accepted and priced from the team
    // that actually carries over. The settlement order already supports this:
    // stage-advance reverts the Free Hit FIRST, then applies queued transfers,
    // so a queue entry keyed on a pre-FH player lands on the reverted squad.
    // Guarded to queue mode + a snapshot whose stage is the one now locked.
    let fhRoster: Map<string, { purchasePrice: number; position: string; nationId: string; displayName: string }> | null = null;
    let fhBank: number | null = null;
    if (queueMode && lockedStage && team.freeHitSnapshot) {
      try {
        const snap = JSON.parse(team.freeHitSnapshot) as {
          stageId: string;
          bankBalance: number;
          players: Array<{ playerId: string; purchasePrice: number }>;
        };
        if (snap.stageId === lockedStage.id && Array.isArray(snap.players)) {
          const ids = snap.players.map((p) => p.playerId);
          const meta = await prisma.player.findMany({
            where: { id: { in: ids } },
            select: { id: true, position: true, nationId: true, displayName: true },
          });
          const metaById = new Map(meta.map((m) => [m.id, m]));
          fhRoster = new Map();
          for (const p of snap.players) {
            const m = metaById.get(p.playerId);
            if (m) fhRoster.set(p.playerId, { purchasePrice: p.purchasePrice, position: m.position, nationId: m.nationId, displayName: m.displayName });
          }
          fhBank = snap.bankBalance;
        }
      } catch { /* corrupt snapshot — fall back to the live-squad basis below */ }
    }
    // Resolve "is this player on the team being edited?" against the Free Hit
    // roster when one is active, else the live squad.
    const rosterHas = (playerId: string) =>
      fhRoster ? fhRoster.has(playerId) : team.squadPlayers.some((sp) => sp.playerId === playerId);

    // Validate all transfers
    const playersOut: string[] = [];
    const playersIn: string[] = [];
    const queueEntries: PendingTransfer[] = [];
    let totalCost = 0;
    let moneyBack = 0;

    for (const transfer of transfers) {
      // Same player picked as their own replacement (client sends this if
      // an older build re-adds a just-removed player to the same slot) is a
      // no-op — they were never actually leaving. Skip rather than letting
      // it fall through to "already in your squad".
      if (transfer.playerOutId === transfer.playerInId) continue;

      // Resolve the outgoing player from the team being edited — the Free Hit
      // roster when one is active (transfers target next round's reverted
      // team), else the live squad. Normalised so the rest of the loop reads
      // one shape regardless of basis.
      const fhOut = fhRoster?.get(transfer.playerOutId);
      const squadPlayer = team.squadPlayers.find(sp => sp.playerId === transfer.playerOutId);
      const outPlayer = fhRoster
        ? (fhOut ? { purchasePrice: fhOut.purchasePrice, position: fhOut.position, displayName: fhOut.displayName } : null)
        : (squadPlayer ? { purchasePrice: squadPlayer.purchasePrice, position: squadPlayer.player.position, displayName: squadPlayer.player.displayName } : null);
      if (!outPlayer) {
        return NextResponse.json({
          error: `Player ${transfer.playerOutId} is not in your squad`
        }, { status: 400 });
      }

      // Can't sell the same player twice across queued batches.
      if (pendingOutIds.has(transfer.playerOutId)) {
        return NextResponse.json({
          error: `${outPlayer.displayName} already has a transfer queued for next round`,
        }, { status: 400 });
      }

      // Check player in exists and is available
      const playerIn = await prisma.player.findUnique({
        where: { id: transfer.playerInId },
        include: { nation: true }
      });

      if (!playerIn) {
        return NextResponse.json({
          error: `Player ${transfer.playerInId} not found`
        }, { status: 400 });
      }

      if (!playerIn.isAvailable) {
        return NextResponse.json({
          error: `${playerIn.displayName} is not available`
        }, { status: 400 });
      }

      // Check position match
      if (outPlayer.position !== playerIn.position) {
        return NextResponse.json({
          error: `Position mismatch: ${outPlayer.displayName} (${outPlayer.position}) cannot be replaced by ${playerIn.displayName} (${playerIn.position})`
        }, { status: 400 });
      }

      // Check not already in squad, pending transfer, or queued for next round
      if (rosterHas(transfer.playerInId) && !playersOut.includes(transfer.playerInId) && !pendingOutIds.has(transfer.playerInId)) {
        return NextResponse.json({
          error: `${playerIn.displayName} is already in your squad`
        }, { status: 400 });
      }
      if (pendingInIds.has(transfer.playerInId)) {
        return NextResponse.json({
          error: `${playerIn.displayName} is already queued to join your squad next round`,
        }, { status: 400 });
      }

      playersOut.push(transfer.playerOutId);
      playersIn.push(transfer.playerInId);

      // In World Cup mode, sell price = purchase price (fixed prices)
      moneyBack += outPlayer.purchasePrice;
      totalCost += playerIn.currentPrice;

      queueEntries.push({
        playerOutId: transfer.playerOutId,
        playerInId: transfer.playerInId,
        priceIn: playerIn.currentPrice,
        priceOut: outPlayer.purchasePrice,
        queuedAt: new Date().toISOString(),
        isWildcard: nextRoundWildcard,
      });
    }

    // Check budget (minus what already-queued transfers will spend). When a
    // Free Hit is live the budget is the PRE-FH bank (what reverts), not the
    // temporary Free Hit team's bank.
    const netCost = totalCost - moneyBack;
    const availableBank = (fhBank ?? team.bankBalance) - pendingNetCost;
    // 0.001 tolerance: both sides are sums of 0.1-step floats, so an
    // exactly-affordable move can compute as e.g. 5.1000000000000005 vs
    // 5.099999999999999 and bounce. Prices step in 0.1s — nothing real
    // lives inside the epsilon.
    if (netCost > availableBank + 0.001) {
      return NextResponse.json({
        error: `Insufficient funds. Need £${netCost.toFixed(1)}m but only have £${availableBank.toFixed(1)}m`
      }, { status: 400 });
    }

    // Nation-limit check. The cap is 3 by default but RELAXES in the late
    // knockouts (5 at SF/3rd, no cap at the Final) so an XI stays fillable as
    // the field shrinks — keyed on the stage these transfers form: the active
    // stage when open, the next incomplete stage when queueing.
    let capStageId: string | null = lockedStage?.stageId ?? null;
    if (queueMode && lockedStage) {
      const nextForCap = await prisma.stage.findFirst({
        where: { order: { gt: lockedStage.order }, isComplete: false },
        orderBy: { order: 'asc' },
        select: { stageId: true },
      });
      capStageId = nextForCap?.stageId ?? capStageId;
    }
    const maxPerNation = maxPerNationForStage(capStageId);

    // The UI in /transfers has always checked this client-side; we move it
    // server-side so an attacker can't bypass the rule by hitting the API
    // directly. We model the final squad as: (current squad minus players being
    // sold or already queued out) + (new incoming players + players already
    // queued in), then bucket by nation. Incoming players' nations need
    // explicit lookups because team.squadPlayers doesn't include them.
    const allIncomingIds = [...playersIn, ...Array.from(pendingInIds)];
    const incomingPlayers = await prisma.player.findMany({
      where: { id: { in: allIncomingIds } },
      select: { id: true, nationId: true, displayName: true, nation: { select: { name: true } } },
    });
    const finalNationCounts: Record<string, number> = {};
    // Add players that are STAYING (on the edited team and not being sold or
    // queued out). The edited team is the Free Hit roster when one is active,
    // else the live squad.
    const stayingRoster: Array<{ playerId: string; nationId: string }> = fhRoster
      ? Array.from(fhRoster.entries()).map(([playerId, v]) => ({ playerId, nationId: v.nationId }))
      : team.squadPlayers.map((sp) => ({ playerId: sp.playerId, nationId: sp.player.nationId }));
    for (const sp of stayingRoster) {
      if (playersOut.includes(sp.playerId)) continue;
      if (pendingOutIds.has(sp.playerId)) continue;
      finalNationCounts[sp.nationId] = (finalNationCounts[sp.nationId] || 0) + 1;
    }
    // Add incoming players (this batch + already queued)
    for (const p of incomingPlayers) {
      finalNationCounts[p.nationId] = (finalNationCounts[p.nationId] || 0) + 1;
    }
    // Find the offender (if any) and report it cleanly. We report the FIRST
    // breach so the user gets a specific actionable error rather than a
    // generic "too many players". Only players in THIS batch can be the
    // newly-reported offender.
    for (const p of incomingPlayers) {
      if (!playersIn.includes(p.id)) continue;
      if (finalNationCounts[p.nationId] > maxPerNation) {
        return NextResponse.json(
          {
            error: `Cannot have more than ${maxPerNation} players from ${p.nation.name} (${p.displayName} would be the ${maxPerNation + 1}th).`,
          },
          { status: 400 },
        );
      }
    }

    // ============================================
    // QUEUE MODE — round in progress. Persist the queue + spend the free
    // transfers now; the squad itself changes at the next stage boundary.
    // ============================================
    if (queueMode) {
      // The first `freeTransfers` queued are free; the rest carry a -4 hit
      // (applied to the round they take effect in). Wildcard = all free.
      queueEntries.forEach((e, i) => {
        e.isFree = nextRoundWildcard ? true : i < team.freeTransfers;
      });
      const freeSpent = nextRoundWildcard ? 0 : Math.min(team.freeTransfers, queueEntries.length);
      const hitCount = nextRoundWildcard ? 0 : Math.max(0, queueEntries.length - team.freeTransfers);
      const hitCost = hitCount * TRANSFER_HIT_COST;

      await prisma.$transaction(async (tx) => {
        await tx.team.update({
          where: { id: team.id },
          data: {
            pendingTransfers: serializePendingTransfers([...existingPending, ...queueEntries]),
            // Only the free ones spend a free transfer; paid ones cost points,
            // charged at the boundary (applyPendingTransfers) not now.
            freeTransfers: Math.max(0, team.freeTransfers - freeSpent),
          },
        });
        await tx.auditLog.create({
          data: {
            userId: session.userId,
            action: 'TRANSFERS_QUEUED',
            details: JSON.stringify({
              transfers: queueEntries.length,
              stageLocked: lockedStage?.stageId ?? null,
              cost: netCost,
              hit: hitCost,
            }),
          },
        });
      });

      return NextResponse.json({
        success: true,
        queued: true,
        hit: hitCost,
        message: `${queueEntries.length} transfer${queueEntries.length === 1 ? '' : 's'} queued${hitCost > 0 ? ` (-${hitCost} pts next round)` : ''} — applied when the next round starts`,
      });
    }

    // ============================================
    // IMMEDIATE MODE — squads are open; transfers execute right away.
    // ============================================

    // Check for unlimited transfers: pre-tournament or wildcard active
    const activeStage = await prisma.stage.findFirst({ where: { isActive: true } });
    let unlimitedTransfers = false;
    let isWildcardActive = false;

    if (UNLIMITED_TRANSFERS) {
      unlimitedTransfers = true;
    } else if (!activeStage) {
      // No active stage = pre-tournament, allow unlimited
      unlimitedTransfers = true;
    } else if (activeStage.stageId === 'GR1') {
      // Free tinkering until the very first whistle of the tournament.
      // (The deadline lock above already diverts this route to queue mode
      // once GR1 kicks off, so reaching here during GR1 means we're
      // pre-kickoff.) From GR2 onward the normal per-stage allocation
      // applies.
      unlimitedTransfers = true;
    } else if (isAutoUnlimitedTransferStage(activeStage.stageId)) {
      // Auto-unlimited crossover stage (R32): the whole field gets a free
      // rebuild entering the knockouts — no chip consumed, no -4 hits. Not a
      // wildcard (isWildcardActive stays false). Mercy is skipped at this
      // boundary in stage-advance since the rebuild is free anyway.
      unlimitedTransfers = true;
    } else {
      const teamStage = await prisma.teamStage.findUnique({
        where: { teamId_stageId: { teamId: team.id, stageId: activeStage.id } },
        select: { chipsUsed: true, chipUsed: true },
      });
      // Stacking-aware: any of WILDCARD_1 / WILDCARD_2 / FREE_HIT in the
      // active chip set grants unlimited transfers for this stage. Free
      // Hit reverts at end of stage via lib/stage-advance + /api/squad/get.
      let activeChips = parseActiveChips(teamStage?.chipsUsed);
      if (activeChips.length === 0 && teamStage?.chipUsed) {
        activeChips = [teamStage.chipUsed as ChipType];
      }
      if (hasUnlimitedTransferChip(activeChips)) {
        unlimitedTransfers = true;
        isWildcardActive = true;
      }
    }

    const extraTransfers = unlimitedTransfers ? 0 : Math.max(0, transfers.length - team.freeTransfers);
    const hitPoints = extraTransfers * TRANSFER_HIT_COST;

    // Execute transfers in a transaction
    await prisma.$transaction(async (tx) => {
      for (let idx = 0; idx < transfers.length; idx++) {
        const transfer = transfers[idx];
        const squadPlayer = team.squadPlayers.find(sp => sp.playerId === transfer.playerOutId)!;
        const playerIn = await tx.player.findUnique({
          where: { id: transfer.playerInId }
        });

        // Remove old player
        await tx.squadPlayer.delete({
          where: { id: squadPlayer.id }
        });

        // Add new player
        await tx.squadPlayer.create({
          data: {
            teamId: team.id,
            playerId: transfer.playerInId,
            purchasePrice: playerIn!.currentPrice,
            isStarting: squadPlayer.isStarting,
            isCaptain: squadPlayer.isCaptain,
            isViceCaptain: squadPlayer.isViceCaptain,
            benchOrder: squadPlayer.benchOrder,
            points: 0
          }
        });

        // Log the transfer
        await tx.transfer.create({
          data: {
            teamId: team.id,
            // Stamp the stage so per-stage history (TeamStage.transferHits)
            // and the wildcard-cancel guard can count this row.
            stageId: activeStage?.id ?? null,
            playerInId: transfer.playerInId,
            playerOutId: transfer.playerOutId,
            priceIn: playerIn!.currentPrice,
            priceOut: squadPlayer.purchasePrice,
            // Mark PER-TRANSFER, not per-batch: the first `freeTransfers` in
            // this request are free, the rest paid. The old `extraTransfers
            // === 0` flagged the WHOLE batch identically, so a mixed request
            // (e.g. 3 free + 4 paid) marked all 7 paid — over-counting hits
            // at settlement (settleStage counts isFreeTransfer=false × 4) even
            // though the leaderboard was charged the correct amount. Mirrors
            // the queue path's per-entry `i < team.freeTransfers`.
            isFreeTransfer: unlimitedTransfers ? true : idx < team.freeTransfers,
            isWildcard: isWildcardActive
          }
        });
      }

      const newFreeTransfers = unlimitedTransfers ? team.freeTransfers : Math.max(0, team.freeTransfers - transfers.length);
      // Rounded to the price step — otherwise float drift accumulates across
      // many transfer batches (each is a subtraction on the PREVIOUS stored
      // value) until the bank reads something like -0.00000000003, which
      // displays as "£-0.0m" even though the team is exactly at budget.
      const newBankBalance = roundPrice(team.bankBalance - netCost);

      // Recalculate team value
      const updatedSquad = await tx.squadPlayer.findMany({
        where: { teamId: team.id },
        include: { player: true }
      });
      // Team value = what you PAID (purchasePrice), matching the sell-refund +
      // bank accounting. Using live currentPrice here would silently bake in
      // admin price changes to held players and break the bank+value=£100
      // invariant.
      const newTeamValue = roundPrice(updatedSquad.reduce((sum, sp) => sum + sp.purchasePrice, 0));

      await tx.team.update({
        where: { id: team.id },
        data: {
          bankBalance: newBankBalance,
          teamValue: newTeamValue,
          freeTransfers: newFreeTransfers,
          transfersUsed: team.transfersUsed + transfers.length,
          // The -4/extra-transfer hit was always *reported* in the success
          // toast but never actually charged. Deduct it here so the
          // leaderboard reflects it immediately.
          ...(hitPoints > 0 ? { totalPoints: { decrement: hitPoints } } : {}),
        }
      });

      // Log audit
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'TRANSFERS_MADE',
          details: JSON.stringify({
            transfers: transfers.length,
            hits: hitPoints,
            cost: netCost
          })
        }
      });
    });

    return NextResponse.json({
      success: true,
      message: `${transfers.length} transfer(s) confirmed${hitPoints > 0 ? ` (-${hitPoints} points)` : ''}`
    });
  } catch (error) {
    console.error('Error processing transfers:', error);
    return NextResponse.json({ error: 'Failed to process transfers' }, { status: 500 });
  }
}

// DELETE /api/transfers — cancel a transfer queued for next round.
// Body: { playerInId: string }  (cancels the queue entry bringing that
// player in) or { all: true } to clear the whole queue. Refunds the free
// transfer(s) spent at queue time.
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 });
    }

    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
      select: { id: true, freeTransfers: true, pendingTransfers: true },
    });
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const pending = parsePendingTransfers(team.pendingTransfers);
    if (pending.length === 0) {
      return NextResponse.json({ error: 'No queued transfers to cancel' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { playerInId, all } = body as { playerInId?: string; all?: boolean };

    let remaining: PendingTransfer[];
    if (all) {
      remaining = [];
    } else if (playerInId) {
      remaining = pending.filter((t) => t.playerInId !== playerInId);
      if (remaining.length === pending.length) {
        return NextResponse.json({ error: 'That queued transfer no longer exists' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Specify playerInId or all:true' }, { status: 400 });
    }

    const removed = pending.filter((t) => !remaining.includes(t));
    const cancelled = removed.length;

    // Recompute the free/paid split on the remaining queue. The original free
    // allotment is invariant: current freeTransfers + the free entries still
    // queued (each free queued entry decremented freeTransfers by 1). After a
    // cancel, the first `allotment` remaining non-wildcard transfers are free
    // again and the rest paid — so cancelling clears a now-unneeded -4 hit.
    const allotment = team.freeTransfers + pending.filter((t) => !t.isWildcard && t.isFree !== false).length;
    const remainingNonWild = remaining.filter((t) => !t.isWildcard);
    remainingNonWild.forEach((t, i) => { t.isFree = i < allotment; });
    const newFreeTransfers = Math.max(0, allotment - Math.min(allotment, remainingNonWild.length));
    const queuedHit = remaining.filter((t) => !t.isWildcard && t.isFree === false).length * 4;

    await prisma.team.update({
      where: { id: team.id },
      data: {
        pendingTransfers: serializePendingTransfers(remaining),
        freeTransfers: newFreeTransfers,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'QUEUED_TRANSFERS_CANCELLED',
        details: JSON.stringify({ cancelled, remaining: remaining.length, freeTransfers: newFreeTransfers, queuedHit }),
      },
    });

    return NextResponse.json({
      success: true,
      message: `${cancelled} queued transfer${cancelled === 1 ? '' : 's'} cancelled`,
      remaining: remaining.length,
      freeTransfers: newFreeTransfers,
      queuedHit,
    });
  } catch (error) {
    console.error('Error cancelling queued transfers:', error);
    return NextResponse.json({ error: 'Failed to cancel queued transfers' }, { status: 500 });
  }
}
