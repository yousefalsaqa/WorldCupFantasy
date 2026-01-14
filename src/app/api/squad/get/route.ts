import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    
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
    
    // Get squad players with player details and performance stats
    const squadPlayers = await prisma.squadPlayer.findMany({
      where: { teamId: team.id },
      include: {
        player: {
          include: {
            nation: true,
            performances: {
              select: {
                goals: true,
                assists: true,
                minutesPlayed: true,
              },
            },
          },
        },
      },
    });
    
    // Transform to match frontend format
    const squad = squadPlayers.map(sp => {
      // Calculate aggregate stats from all performances
      const totalGoals = sp.player.performances.reduce((sum, p) => sum + p.goals, 0);
      const totalAssists = sp.player.performances.reduce((sum, p) => sum + p.assists, 0);
      const totalMinutes = sp.player.performances.reduce((sum, p) => sum + p.minutesPlayed, 0);
      
      return {
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
          name: sp.player.displayName,
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
        stats: {
          goals: totalGoals,
          assists: totalAssists,
          passAccuracy: 0, // Not tracked in current schema
          interceptions: 0, // Not tracked in current schema
          tackles: 0, // Not tracked in current schema
          dribbles: 0, // Not tracked in current schema
        },
      };
    });
    
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
