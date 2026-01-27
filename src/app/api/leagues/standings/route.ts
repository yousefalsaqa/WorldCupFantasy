import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// This route is dynamic to ensure fresh data
export const dynamic = 'force-dynamic';

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
                user: { select: { username: true, isAdmin: true } }
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
    // Filter out admin teams so they don't appear in public standings
    const standings = globalLeague.memberships
      .filter(m => m.team && !m.team.user.isAdmin)  // Exclude admin teams
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

