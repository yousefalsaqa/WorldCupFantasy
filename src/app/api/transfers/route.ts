import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { getStageLock, LOCKED_ERROR } from '@/lib/deadline';
import { cookies } from 'next/headers';
import {
  parseActiveChips,
  hasUnlimitedTransferChip,
  type ChipType,
} from '@/lib/chips-active';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

const TRANSFER_HIT_COST = 4;

// FIFA World Cup rule: max 3 players from any single nation in your 15-man
// squad. Mirrors the UI check in /transfers and /squad, and matches what
// /api/squad/route.ts already enforces on single-player adds.
const MAX_PLAYERS_PER_NATION = 3;

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

    // Hard deadline: transfers freeze 1h before the round's first kickoff
    // and reopen when the next stage activates.
    const { locked } = await getStageLock();
    if (locked) {
      return NextResponse.json({ error: LOCKED_ERROR }, { status: 403 });
    }

    const body = await request.json();
    const { transfers } = body as { transfers: TransferRequest[] };

    if (!transfers || !Array.isArray(transfers) || transfers.length === 0) {
      return NextResponse.json({ error: 'No transfers provided' }, { status: 400 });
    }

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

    // Validate all transfers
    const playersOut: string[] = [];
    const playersIn: string[] = [];
    let totalCost = 0;
    let moneyBack = 0;

    for (const transfer of transfers) {
      // Check player out is in squad
      const squadPlayer = team.squadPlayers.find(sp => sp.playerId === transfer.playerOutId);
      if (!squadPlayer) {
        return NextResponse.json({ 
          error: `Player ${transfer.playerOutId} is not in your squad` 
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
      if (squadPlayer.player.position !== playerIn.position) {
        return NextResponse.json({ 
          error: `Position mismatch: ${squadPlayer.player.displayName} (${squadPlayer.player.position}) cannot be replaced by ${playerIn.displayName} (${playerIn.position})` 
        }, { status: 400 });
      }

      // Check not already in squad or pending transfer
      if (team.squadPlayers.some(sp => sp.playerId === transfer.playerInId && !playersOut.includes(sp.playerId))) {
        return NextResponse.json({ 
          error: `${playerIn.displayName} is already in your squad` 
        }, { status: 400 });
      }

      playersOut.push(transfer.playerOutId);
      playersIn.push(transfer.playerInId);
      
      // In World Cup mode, sell price = purchase price (fixed prices)
      moneyBack += squadPlayer.purchasePrice;
      totalCost += playerIn.currentPrice;
    }

    // Check budget
    const netCost = totalCost - moneyBack;
    if (netCost > team.bankBalance) {
      return NextResponse.json({ 
        error: `Insufficient funds. Need £${netCost.toFixed(1)}m but only have £${team.bankBalance.toFixed(1)}m` 
      }, { status: 400 });
    }

    // Nation-limit check (3 max per nation). The UI in /transfers has always
    // checked this client-side; we move it server-side so an attacker can't
    // bypass the rule by hitting the API directly. We model the final squad
    // as: (current squad minus players being sold) + (new incoming players),
    // then bucket by nation. The new player's nation is the one we need to
    // look up explicitly because team.squadPlayers doesn't include them.
    const incomingPlayers = await prisma.player.findMany({
      where: { id: { in: playersIn } },
      select: { id: true, nationId: true, displayName: true, nation: { select: { name: true } } },
    });
    const finalNationCounts: Record<string, number> = {};
    // Add players that are STAYING (in squad and not being sold)
    for (const sp of team.squadPlayers) {
      if (playersOut.includes(sp.playerId)) continue;
      finalNationCounts[sp.player.nationId] =
        (finalNationCounts[sp.player.nationId] || 0) + 1;
    }
    // Add incoming players
    for (const p of incomingPlayers) {
      finalNationCounts[p.nationId] = (finalNationCounts[p.nationId] || 0) + 1;
    }
    // Find the offender (if any) and report it cleanly. We report the FIRST
    // breach so the user gets a specific actionable error rather than a
    // generic "too many players".
    for (const p of incomingPlayers) {
      if (finalNationCounts[p.nationId] > MAX_PLAYERS_PER_NATION) {
        return NextResponse.json(
          {
            error: `Cannot have more than ${MAX_PLAYERS_PER_NATION} players from ${p.nation.name} (${p.displayName} would be the 4th).`,
          },
          { status: 400 },
        );
      }
    }

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
      // (The deadline lock above already blocks this route once GR1 kicks
      // off, so reaching here during GR1 means we're pre-kickoff.) From
      // GR2 onward the normal 2-free-per-stage allocation applies.
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
      for (const transfer of transfers) {
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
            isFreeTransfer: extraTransfers === 0,
            isWildcard: isWildcardActive
          }
        });
      }

      const newFreeTransfers = unlimitedTransfers ? team.freeTransfers : Math.max(0, team.freeTransfers - transfers.length);
      const newBankBalance = team.bankBalance - netCost;
      
      // Recalculate team value
      const updatedSquad = await tx.squadPlayer.findMany({
        where: { teamId: team.id },
        include: { player: true }
      });
      const newTeamValue = updatedSquad.reduce((sum, sp) => sum + sp.player.currentPrice, 0);

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
