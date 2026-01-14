import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

// GET /api/admin/stats - Get admin dashboard stats
export async function GET() {
  try {
    // Verify admin
    await requireAdmin();

    // Get counts
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
