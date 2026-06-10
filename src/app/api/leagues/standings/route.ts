import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

// This route is dynamic to ensure fresh data
export const dynamic = 'force-dynamic';

// GET /api/leagues/standings            → global league (default)
// GET /api/leagues/standings?leagueId=x → that league, members only
export async function GET(request: NextRequest) {
  try {
    const leagueId = request.nextUrl.searchParams.get('leagueId');

    const league = leagueId
      ? await prisma.league.findUnique({
          where: { id: leagueId },
          include: {
            memberships: {
              include: {
                team: {
                  include: {
                    user: { select: { username: true, isAdmin: true } },
                  },
                },
              },
            },
          },
        })
      : await prisma.league.findFirst({
          where: { isGlobal: true },
          include: {
            memberships: {
              include: {
                team: {
                  include: {
                    user: { select: { username: true, isAdmin: true } },
                  },
                },
              },
            },
          },
        });

    if (!league) {
      return NextResponse.json({ standings: [] });
    }

    // Private leagues are members-only: you must be logged in and have a
    // team in the league to view its table (or be an admin).
    const session = await getSession();
    if (!league.isGlobal) {
      if (!session) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      const isMember = league.memberships.some((m) => m.userId === session.userId);
      if (!isMember && !session.isAdmin) {
        return NextResponse.json({ error: 'Not a member of this league' }, { status: 403 });
      }
    }

    // Sort by total points descending. The GLOBAL table hides admin/ops
    // teams; private leagues show every member (friends may well invite
    // the admin account on purpose).
    const standings = league.memberships
      .filter((m) => m.team && (!league.isGlobal || !m.team.user.isAdmin))
      .map((m) => ({
        rank: 0,
        teamId: m.team!.id,
        teamName: m.team!.name,
        managerName: m.team!.user.username,
        totalPoints: m.team!.totalPoints,
        teamValue: m.team!.teamValue,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((team, index) => ({ ...team, rank: index + 1 }));

    // Tell the client whether there's at least one match in progress.
    // The /leagues page uses this to drive a "poll while live, refresh
    // once after FT" loop — we don't want continuous polling when
    // nothing is happening (per user-requested behavior: "the league
    // should poll at the end of the gameday").
    const liveMatchCount = await prisma.match.count({
      where: { isStarted: true, isFinished: false },
    });

    return NextResponse.json({
      leagueName: league.name,
      leagueId: league.id,
      isGlobal: league.isGlobal,
      // Code + ownership let the page show "share this code" and the
      // delete button without a second request. Codes are only useful
      // to members anyway (that's who can see this response).
      code: league.isGlobal ? null : league.code,
      isOwner: !!session && league.ownerId === session.userId,
      standings,
      anyMatchLive: liveMatchCount > 0,
    });
  } catch (error) {
    console.error('Error fetching standings:', error);
    return NextResponse.json({ standings: [], anyMatchLive: false }, { status: 500 });
  }
}
