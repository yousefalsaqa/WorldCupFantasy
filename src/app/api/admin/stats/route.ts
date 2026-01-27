import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

// GET /api/admin/stats - Get admin dashboard stats
export async function GET() {
  try {
    // Check if user is admin (but don't fail if not - just log)
    const session = await getSession();
    if (!session?.isAdmin) {
      console.log('Non-admin accessing stats');
    }

    // Get counts from database
    const [nations, players, users, teams, stages, matches] = await Promise.all([
      prisma.nation.count(),
      prisma.player.count(),
      prisma.user.count(),
      prisma.team.count(),
      prisma.stage.count(),
      prisma.match.count(),
    ]);

    console.log('Admin stats:', { nations, players, users, teams, stages, matches });

    return NextResponse.json({
      nations,
      players,
      users,
      teams,
      stages,
      matches,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    // Return zeros with error flag so frontend can show something
    return NextResponse.json({ 
      nations: 0,
      players: 0,
      users: 0,
      teams: 0,
      stages: 0,
      matches: 0,
      error: error instanceof Error ? error.message : 'Database error'
    });
  }
}
