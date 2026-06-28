import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { getStageLock, LOCKED_ERROR } from '@/lib/deadline';
import { logAudit } from '@/lib/audit';
// import { validateSquad, validateStartingXI } from '@/lib/validation';
import { SQUAD_SIZE } from '@/lib/constants';
import { calculateSellPrice, roundPrice } from '@/lib/utils';
import { maxPerNationForStage } from '@/lib/wc-constants';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

// Get current squad
export async function GET() {
  try {
    const session = await requireAuth();

    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
      include: {
        squadPlayers: {
          include: {
            player: {
              include: { nation: true },
            },
          },
          orderBy: [
            { isStarting: 'desc' },
            { benchOrder: 'asc' },
          ],
        },
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Calculate sell prices for each player
    const squadWithSellPrices = team.squadPlayers.map(sp => ({
      ...sp,
      sellPrice: calculateSellPrice(sp.purchasePrice, sp.player.currentPrice),
    }));

    return NextResponse.json({
      squad: squadWithSellPrices,
      teamInfo: {
        bankBalance: team.bankBalance,
        teamValue: team.teamValue,
        freeTransfers: team.freeTransfers,
      },
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    console.error('Get squad error:', error);
    return NextResponse.json(
      { error: 'Failed to get squad' },
      { status: 500 }
    );
  }
}

// Add player to squad (during initial squad building)
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  try {
    const session = await requireAuth();
    const { playerId } = await request.json();

    if (!playerId) {
      return NextResponse.json(
        { error: 'Player ID is required' },
        { status: 400 }
      );
    }

    // Get team
    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
      include: {
        squadPlayers: {
          include: {
            player: true,
          },
        },
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Check squad isn't full
    if (team.squadPlayers.length >= SQUAD_SIZE) {
      return NextResponse.json(
        { error: 'Squad is already full' },
        { status: 400 }
      );
    }

    // This add/remove API exists for the initial build only. Once you've
    // got a saved 15, all changes must flow through /api/transfers (which
    // counts free transfers, charges -4 hits, and respects the deadline).
    // Without this gate, remove-then-add here was a free transfer that
    // bypassed every rule. Also freeze partial builds during a live round
    // for anyone who already had players before the deadline.
    const { stage: activeStage, locked } = await getStageLock();
    if (locked && team.squadPlayers.length > 0) {
      return NextResponse.json({ error: LOCKED_ERROR }, { status: 403 });
    }

    // Get player to add
    const player = await prisma.player.findUnique({
      where: { id: playerId },
    });

    if (!player) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    if (!player.isAvailable) {
      return NextResponse.json(
        { error: 'Player is not available' },
        { status: 400 }
      );
    }

    // Check if player already in squad
    if (team.squadPlayers.some(sp => sp.playerId === playerId)) {
      return NextResponse.json(
        { error: 'Player already in squad' },
        { status: 400 }
      );
    }

    // Check budget
    if (player.currentPrice > team.bankBalance) {
      return NextResponse.json(
        { error: 'Insufficient funds' },
        { status: 400 }
      );
    }

    // Check position limits
    const positionCounts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const sp of team.squadPlayers) {
      positionCounts[sp.player.position] = (positionCounts[sp.player.position] || 0) + 1;
    }
    positionCounts[player.position] = (positionCounts[player.position] || 0) + 1;

    const positionLimits: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
    if (positionCounts[player.position] > positionLimits[player.position]) {
      return NextResponse.json(
        { error: `Cannot have more than ${positionLimits[player.position]} ${player.position} players` },
        { status: 400 }
      );
    }

    // Check nation limit — 3 by default, relaxes in late knockouts (5 at
    // SF/3rd, none at the Final) keyed on the active stage.
    const maxPerNation = maxPerNationForStage(activeStage?.stageId);
    const nationCounts: Record<string, number> = {};
    for (const sp of team.squadPlayers) {
      nationCounts[sp.player.nationId] = (nationCounts[sp.player.nationId] || 0) + 1;
    }
    nationCounts[player.nationId] = (nationCounts[player.nationId] || 0) + 1;

    if (nationCounts[player.nationId] > maxPerNation) {
      return NextResponse.json(
        { error: `Cannot have more than ${maxPerNation} players from the same nation` },
        { status: 400 }
      );
    }

    // Add player to squad
    await prisma.$transaction([
      prisma.squadPlayer.create({
        data: {
          teamId: team.id,
          playerId: player.id,
          purchasePrice: player.currentPrice,
          isStarting: false,
          benchOrder: team.squadPlayers.length + 1,
        },
      }),
      prisma.team.update({
        where: { id: team.id },
        data: {
          bankBalance: roundPrice(team.bankBalance - player.currentPrice),
          teamValue: roundPrice(team.teamValue + player.currentPrice),
        },
      }),
    ]);

    await logAudit('SQUAD_UPDATED', {
      action: 'ADD_PLAYER',
      playerId: player.id,
      playerName: player.displayName,
      price: player.currentPrice,
    }, session.userId, ip);

    return NextResponse.json({ success: true });

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    console.error('Add player error:', error);
    return NextResponse.json(
      { error: 'Failed to add player' },
      { status: 500 }
    );
  }
}

// Remove player from squad (during initial squad building)
export async function DELETE(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  try {
    const session = await requireAuth();
    const { playerId } = await request.json();

    if (!playerId) {
      return NextResponse.json(
        { error: 'Player ID is required' },
        { status: 400 }
      );
    }

    // Get team
    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
      include: {
        squadPlayers: {
          include: {
            player: true,
          },
        },
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Find squad player
    const squadPlayer = team.squadPlayers.find(sp => sp.playerId === playerId);

    if (!squadPlayer) {
      return NextResponse.json(
        { error: 'Player not in squad' },
        { status: 400 }
      );
    }

    // Completed squads can only change via /api/transfers — see the
    // matching guard in POST. Deleting from a full 15 here would dodge
    // transfer counting, point hits, and the deadline.
    if (team.squadPlayers.length >= SQUAD_SIZE) {
      return NextResponse.json(
        { error: 'Your squad is complete — use transfers to swap players' },
        { status: 403 }
      );
    }
    const { locked } = await getStageLock();
    if (locked) {
      return NextResponse.json({ error: LOCKED_ERROR }, { status: 403 });
    }

    // Remove player
    await prisma.$transaction([
      prisma.squadPlayer.delete({
        where: { id: squadPlayer.id },
      }),
      prisma.team.update({
        where: { id: team.id },
        data: {
          bankBalance: roundPrice(team.bankBalance + squadPlayer.purchasePrice),
          teamValue: roundPrice(team.teamValue - squadPlayer.purchasePrice),
        },
      }),
    ]);

    await logAudit('SQUAD_UPDATED', {
      action: 'REMOVE_PLAYER',
      playerId: squadPlayer.player.id,
      playerName: squadPlayer.player.displayName,
      refund: squadPlayer.purchasePrice,
    }, session.userId, ip);

    return NextResponse.json({ success: true });

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    console.error('Remove player error:', error);
    return NextResponse.json(
      { error: 'Failed to remove player' },
      { status: 500 }
    );
  }
}

// Update squad selection (starting XI, captain, bench order)
export async function PUT(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  try {
    const session = await requireAuth();
    const { startingXI, bench, captainId, viceCaptainId } = await request.json();

    // Validate input
    if (!Array.isArray(startingXI) || !Array.isArray(bench)) {
      return NextResponse.json(
        { error: 'Invalid squad data' },
        { status: 400 }
      );
    }

    if (!captainId || !viceCaptainId) {
      return NextResponse.json(
        { error: 'Captain and vice-captain are required' },
        { status: 400 }
      );
    }

    // Get team with squad
    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
      include: {
        squadPlayers: {
          include: {
            player: true,
          },
        },
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Validate all players are in squad
    const squadPlayerIds = new Set(team.squadPlayers.map(sp => sp.playerId));
    const allSelectionIds = [...startingXI, ...bench];
    
    for (const playerId of allSelectionIds) {
      if (!squadPlayerIds.has(playerId)) {
        return NextResponse.json(
          { error: 'Invalid player in selection' },
          { status: 400 }
        );
      }
    }

    // Check for duplicates
    if (new Set(allSelectionIds).size !== allSelectionIds.length) {
      return NextResponse.json(
        { error: 'Duplicate players in selection' },
        { status: 400 }
      );
    }

    // Get player details for validation
    const startingPlayers = team.squadPlayers
      .filter(sp => startingXI.includes(sp.playerId))
      .map(sp => ({
        id: sp.playerId,
        position: sp.player.position,
        nationId: sp.player.nationId,
        currentPrice: sp.player.currentPrice,
      }));

    // Validate starting XI (commented out - validation function expects clubId but we use nationId)
    // TODO: Update validateStartingXI to support nationId or create a new validation function
    // const xiValidation = validateStartingXI(startingPlayers, captainId, viceCaptainId);
    // if (!xiValidation.isValid) {
    //   return NextResponse.json(
    //     { error: xiValidation.errors[0] },
    //     { status: 400 }
    //   );
    // }

    // Update all squad players
    await prisma.$transaction(
      team.squadPlayers.map(sp => {
        const isStarting = startingXI.includes(sp.playerId);
        const benchIndex = bench.indexOf(sp.playerId);
        
        return prisma.squadPlayer.update({
          where: { id: sp.id },
          data: {
            isStarting,
            isCaptain: sp.playerId === captainId,
            isViceCaptain: sp.playerId === viceCaptainId,
            benchOrder: isStarting ? null : (benchIndex !== -1 ? benchIndex + 1 : null),
          },
        });
      })
    );

    await logAudit('SQUAD_UPDATED', {
      action: 'UPDATE_SELECTION',
      captainId,
      viceCaptainId,
    }, session.userId, ip);

    return NextResponse.json({ success: true });

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    console.error('Update squad error:', error);
    return NextResponse.json(
      { error: 'Failed to update squad' },
      { status: 500 }
    );
  }
}


