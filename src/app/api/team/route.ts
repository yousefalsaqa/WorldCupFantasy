import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { computeUnlimitedTransfers } from '@/lib/unlimited-transfers';
import { liveTeamDeltas } from '@/lib/live-team-totals';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;

  const decoded = await verifyToken(token);
  if (!decoded) return null;
  
  return prisma.user.findUnique({ where: { id: decoded.userId } });
}

// GET /api/team - Get user's team
//
// Intentionally returns ONLY the flat Team row. The squadPlayers + player +
// nation join was the single biggest contributor to slow dashboard loads on
// iOS Safari (3-level deep query, ~46 rows just to render 4 stat cards).
// Callers that need the squad already use /api/squad/get separately.
export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const team = await prisma.team.findUnique({
    where: { userId: user.id },
  });

  // Surface the unlimited-transfers window (pre-tournament / GR1 pre-kickoff
  // / wildcard) so the dashboard can show ∞ instead of a misleading "2".
  const unlimitedTransfers = team ? await computeUnlimitedTransfers(team.id) : false;

  // Live-inclusive total = banked Team.totalPoints + the in-progress delta from
  // matches happening right now (captain ×mult, bench boost, transfer hits, and
  // the late-joiner gate all handled inside liveTeamDeltas — same code path the
  // squad page and league standings use). Between rounds the delta is 0, so this
  // equals the banked total; mid-match it ticks up in step with the squad page.
  const liveTotalPoints = team
    ? team.totalPoints + ((await liveTeamDeltas([team.id])).get(team.id) ?? 0)
    : 0;

  return NextResponse.json({ team, unlimitedTransfers, liveTotalPoints }, {
    // Tiny private cache so quick back-and-forth between dashboard and other
    // pages doesn't refetch every single time. Stale-while-revalidate keeps
    // the data fresh without making the user wait.
    headers: {
      'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
    },
  });
}

// POST /api/team - Create team
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if user already has a team
  const existingTeam = await prisma.team.findUnique({
    where: { userId: user.id },
  });

  if (existingTeam) {
    return NextResponse.json({ error: 'You already have a team' }, { status: 400 });
  }

  try {
    const { name } = await request.json();

    if (!name || name.length < 3 || name.length > 30) {
      return NextResponse.json({ 
        error: 'Team name must be 3-30 characters' 
      }, { status: 400 });
    }

    const team = await prisma.team.create({
      data: {
        userId: user.id,
        name: name.trim(),
        initialBudget: 109.0,
        bankBalance: 109.0,
        freeTransfers: 2,
      },
    });

    // Ensure global league exists and auto-join
    let globalLeague = await prisma.league.findFirst({
      where: { isGlobal: true },
    });
    
    // Create global league if it doesn't exist
    if (!globalLeague) {
      // Get admin user to be owner
      const adminUser = await prisma.user.findFirst({
        where: { isAdmin: true },
      });
      
      if (adminUser) {
        globalLeague = await prisma.league.create({
          data: {
            name: 'World Cup 2026 - Global League',
            code: 'WC2026GL',
            ownerId: adminUser.id,
            isGlobal: true,
          },
        });
      }
    }

    // Join global league if it exists
    if (globalLeague) {
      const existing = await prisma.leagueMembership.findFirst({
        where: {
          leagueId: globalLeague.id,
          teamId: team.id,
        },
      });
      
      if (!existing) {
        await prisma.leagueMembership.create({
          data: {
            leagueId: globalLeague.id,
            teamId: team.id,
            userId: user.id,
          },
        });
      }
    }

    return NextResponse.json({ team });
  } catch (error) {
    console.error('Create team error:', error);
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 });
  }
}

// PUT /api/team - Update team
export async function PUT(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const team = await prisma.team.findUnique({
    where: { userId: user.id },
  });

  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.name) {
      if (body.name.length < 3 || body.name.length > 30) {
        return NextResponse.json({ 
          error: 'Team name must be 3-30 characters' 
        }, { status: 400 });
      }
      updates.name = body.name.trim();
    }

    const updatedTeam = await prisma.team.update({
      where: { id: team.id },
      data: updates,
    });

    return NextResponse.json({ team: updatedTeam });
  } catch (error) {
    console.error('Update team error:', error);
    return NextResponse.json({ error: 'Failed to update team' }, { status: 500 });
  }
}
