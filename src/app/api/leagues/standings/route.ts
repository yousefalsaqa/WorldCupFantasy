import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    // Get global league standings
    const globalLeague = await prisma.league.findFirst({
      where: { isGlobal: true },
      include: {
        memberships: {
          include: {
            team: {
              include: {
                user: { select: { username: true } }
              }
            }
          }
        }
      }
    });

    if (!globalLeague) {
      return NextResponse.json({ standings: [] });
    }

    // Sort by total points descending
    const standings = globalLeague.memberships
      .filter(m => m.team)
      .map(m => ({
        rank: 0,
        teamId: m.team!.id,
        teamName: m.team!.name,
        managerName: m.team!.user.username,
        totalPoints: m.team!.totalPoints,
        teamValue: m.team!.teamValue,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((team, index) => ({ ...team, rank: index + 1 }));

    return NextResponse.json({ 
      leagueName: globalLeague.name,
      standings 
    });
  } catch (error) {
    console.error('Error fetching standings:', error);
    return NextResponse.json({ standings: [] }, { status: 500 });
  }
}

