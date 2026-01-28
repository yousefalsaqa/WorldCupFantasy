// ============================================
// ADMIN USERS API - View all users
// ============================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET() {
  try {
    await requireAdmin();

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        isAdmin: true,
        createdAt: true,
        team: {
          select: {
            id: true,
            name: true,
            totalPoints: true,
            bankBalance: true,
            _count: {
              select: { squadPlayers: true },
            },
          },
        },
      },
      orderBy: [
        { team: { totalPoints: 'desc' } },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('[Admin Users] Error:', error);
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
