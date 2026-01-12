import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        user: { select: { username: true } },
        squadPlayers: {
          include: {
            player: {
              include: {
                nation: true
              }
            }
          }
        }
      }
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Transform squad data
    const squad = team.squadPlayers.map(sp => ({
      id: sp.player.id,
      name: sp.player.displayName,
      displayName: sp.player.displayName,
      position: sp.player.position,
      shirtNumber: sp.player.shirtNumber,
      points: sp.points,
      isStarting: sp.isStarting,
      isCaptain: sp.isCaptain,
      isViceCaptain: sp.isViceCaptain,
      benchOrder: sp.benchOrder,
      nation: {
        name: sp.player.nation.name,
        code: sp.player.nation.code,
        kitColor1: sp.player.nation.kitColor1,
        kitColor2: sp.player.nation.kitColor2,
        flagUrl: sp.player.nation.flagUrl || `https://flagcdn.com/24x18/${sp.player.nation.code.toLowerCase()}.png`,
      }
    }));

    // Split into starting and bench
    const starting = squad.filter(p => p.isStarting).sort((a, b) => {
      const posOrder = { FWD: 0, MID: 1, DEF: 2, GK: 3 };
      return (posOrder[a.position as keyof typeof posOrder] || 0) - (posOrder[b.position as keyof typeof posOrder] || 0);
    });
    
    const bench = squad.filter(p => !p.isStarting).sort((a, b) => (a.benchOrder || 99) - (b.benchOrder || 99));

    return NextResponse.json({
      teamId: team.id,
      teamName: team.name,
      managerName: team.user.username,
      totalPoints: team.totalPoints,
      starting,
      bench
    });
  } catch (error) {
    console.error('Error fetching team squad:', error);
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
  }
}
