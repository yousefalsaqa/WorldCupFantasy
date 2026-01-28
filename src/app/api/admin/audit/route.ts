// ============================================
// ADMIN AUDIT LOG API - View all actions
// ============================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET() {
  try {
    await requireAdmin();

    const entries = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100, // Last 100 entries
    });

    // Manually fetch usernames for entries with userId
    const userIds = Array.from(new Set(entries.filter(e => e.userId).map(e => e.userId as string)));
    const users = userIds.length > 0 
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true },
        })
      : [];
    
    const userMap = new Map(users.map(u => [u.id, u]));
    
    const entriesWithUsers = entries.map(entry => ({
      ...entry,
      user: entry.userId ? userMap.get(entry.userId) || null : null,
    }));

    return NextResponse.json({ entries: entriesWithUsers });
  } catch (error) {
    console.error('[Admin Audit] Error:', error);
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 });
  }
}
