import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('fantasy-laliga-session')?.value;
    
    if (!token) {
      return NextResponse.json({ squad: [] }, { status: 200 });
    }
    
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ squad: [] }, { status: 200 });
    }
    
    const userId = decoded.userId;
    
    // Get team for this user
    const team = await prisma.team.findUnique({
      where: { userId },
    });
    
    if (!team) {
      return NextResponse.json({ squad: [] }, { status: 200 });
    }
    
    // Get squad players with player details
    const squadPlayers = await prisma.squadPlayer.findMany({
      where: { teamId: team.id },
      include: {
        player: {
          include: {
            nation: true,
          },
        },
      },
    });
    
    // Transform to match frontend format
    const squad = squadPlayers.map(sp => ({
      id: sp.id,
      playerId: sp.playerId,
      purchasePrice: sp.purchasePrice,
      points: sp.points,
      isStarting: sp.isStarting,
      isCaptain: sp.isCaptain,
      isViceCaptain: sp.isViceCaptain,
      benchOrder: sp.benchOrder,
      player: {
        id: sp.player.id,
        name: sp.player.displayName, // Mapping displayName to name for consistency if needed
        displayName: sp.player.displayName,
        position: sp.player.position,
        currentPrice: sp.player.currentPrice,
        shirtNumber: sp.player.shirtNumber,
        nation: {
          id: sp.player.nation.id,
          name: sp.player.nation.name,
          code: sp.player.nation.code,
          kitColor1: sp.player.nation.kitColor1,
          kitColor2: sp.player.nation.kitColor2,
        },
      },
    }));
    
    return NextResponse.json({ 
      squad,
      teamId: team.id,
      bankBalance: team.bankBalance,
      teamValue: team.teamValue,
    });
    
  } catch (error) {
    console.error('Get squad error:', error);
    return NextResponse.json({ squad: [], error: 'Failed to fetch squad' }, { status: 500 });
  }
}
