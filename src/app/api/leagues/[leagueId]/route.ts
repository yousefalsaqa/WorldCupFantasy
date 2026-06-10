import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// ============================================
// DELETE /api/leagues/[leagueId]
//
// Deletes a private league. Only the league owner (or an admin) can do
// it, and the global league can never be deleted — it's the tournament-
// wide ranking every team auto-joins. Memberships cascade via the
// schema's onDelete: Cascade, so member teams are unaffected beyond
// losing the league entry.
// ============================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  try {
    const session = await requireAuth();
    const { leagueId } = await params;

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: { _count: { select: { memberships: true } } },
    });

    if (!league) {
      return NextResponse.json({ error: 'League not found' }, { status: 404 });
    }

    if (league.isGlobal) {
      return NextResponse.json(
        { error: 'The global league cannot be deleted' },
        { status: 403 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { isAdmin: true },
    });

    if (league.ownerId !== session.userId && !user?.isAdmin) {
      return NextResponse.json(
        { error: 'Only the league owner can delete this league' },
        { status: 403 }
      );
    }

    // Owners can only delete BEFORE the tournament kicks off. Once the
    // first ball is kicked, standings are real and deleting a league
    // would erase a competition mid-flight — from then on it's admin-only
    // (kept as an escape hatch for abuse/moderation).
    if (!user?.isAdmin) {
      const firstMatch = await prisma.match.findFirst({
        orderBy: { kickoffTime: 'asc' },
        select: { kickoffTime: true, isStarted: true },
      });
      const tournamentStarted =
        !!firstMatch && (firstMatch.isStarted || firstMatch.kickoffTime <= new Date());
      if (tournamentStarted) {
        return NextResponse.json(
          { error: 'Leagues can no longer be deleted — the tournament has started. Contact the admin if something is wrong.' },
          { status: 403 }
        );
      }
    }

    await prisma.league.delete({ where: { id: leagueId } });

    await logAudit('LEAGUE_DELETED', {
      leagueId,
      leagueName: league.name,
      code: league.code,
      memberCount: league._count.memberships,
    }, session.userId, ip);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Delete league error:', error);
    return NextResponse.json({ error: 'Failed to delete league' }, { status: 500 });
  }
}
