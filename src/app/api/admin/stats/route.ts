import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// GET /api/admin/stats - Get admin dashboard stats
export async function GET() {
  try {
    // Verify admin
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get counts
    const [nations, players, users, teams, stages, matches] = await Promise.all([
      prisma.nation.count(),
      prisma.player.count(),
      prisma.user.count(),
      prisma.team.count(),
      prisma.stage.count(),
      prisma.match.count(),
    ]);

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
