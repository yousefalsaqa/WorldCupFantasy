import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { liveTeamDeltas, stageTeamTotals } from '@/lib/live-team-totals';

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
    if (session) {
      // Fire-and-forget activity marker — never blocks or fails the response.
      prisma.user.update({ where: { id: session.userId }, data: { lastLeagueViewAt: new Date() } }).catch(() => {});
    }
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
    const memberTeams = league.memberships.filter(
      (m) => m.team && (!league.isGlobal || !m.team.user.isAdmin),
    );

    // Live overlay: while matches are in progress, show banked + live so
    // first place moves in real time. `liveDelta` lets the UI mark which
    // rows are currently earning. At FT banking absorbs the delta, so the
    // displayed number never jumps.
    const teamIds = memberTeams.map((m) => m.team!.id);
    const deltas = await liveTeamDeltas(teamIds);

    // "This round" points column: each team's points for the ACTIVE stage
    // (banked + live, late-gated). Prior rounds are already in Team.totalPoints
    // via banking, so the Total column never double-counts. Scalable — auto
    // becomes GR2/GR3 as the active stage advances.
    const activeStage = await prisma.stage.findFirst({
      where: { isActive: true },
      select: { id: true, stageId: true, name: true },
    });
    const roundTotals = activeStage
      ? await stageTeamTotals(teamIds, activeStage.id)
      : new Map<string, number>();

    const standings = memberTeams
      .map((m) => {
        const liveDelta = deltas.get(m.team!.id) ?? 0;
        return {
          rank: 0,
          teamId: m.team!.id,
          teamName: m.team!.name,
          managerName: m.team!.user.username,
          totalPoints: m.team!.totalPoints + liveDelta,
          roundPoints: roundTotals.get(m.team!.id) ?? 0,
          liveDelta,
          teamValue: m.team!.teamValue,
          // Sort-only: when totals AND this-round points tie, the team that
          // reached the score first wins. updatedAt is the closest proxy for
          // "when their points last changed" (banking writes the team row).
          updatedAt: m.team!.updatedAt,
        };
      })
      // Rank by overall total; ties broken by who scored more THIS round, then
      // by who got there first (earliest update).
      .sort(
        (a, b) =>
          b.totalPoints - a.totalPoints ||
          b.roundPoints - a.roundPoints ||
          a.updatedAt.getTime() - b.updatedAt.getTime(),
      )
      // Strip the sort-only field and assign final ranks.
      .map(({ updatedAt: _updatedAt, ...team }, index) => ({ ...team, rank: index + 1 }));

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
      // Short label for the "this round" column header (e.g. "GR1"), and the
      // full name for tooltips. Null before any stage is active.
      roundLabel: activeStage?.stageId ?? null,
      roundName: activeStage?.name ?? null,
      anyMatchLive: liveMatchCount > 0,
    });
  } catch (error) {
    console.error('Error fetching standings:', error);
    return NextResponse.json({ standings: [], anyMatchLive: false }, { status: 500 });
  }
}
