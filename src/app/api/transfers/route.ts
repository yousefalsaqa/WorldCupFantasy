import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

const TRANSFER_HIT_COST = 4;

interface TransferRequest {
  playerOutId: string;
  playerInId: string;
}

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('fantasy-laliga-session')?.value;
  
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

    // Calculate hits
    const extraTransfers = Math.max(0, transfers.length - team.freeTransfers);
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
            playerInId: transfer.playerInId,
            playerOutId: transfer.playerOutId,
            priceIn: playerIn!.currentPrice,
            priceOut: squadPlayer.purchasePrice,
            isFreeTransfer: extraTransfers === 0
          }
        });
      }

      // Update team
      const newFreeTransfers = Math.max(0, team.freeTransfers - transfers.length);
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
          transfersUsed: team.transfersUsed + transfers.length
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
