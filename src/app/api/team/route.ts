import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('fantasy-laliga-session')?.value;
  if (!token) return null;

  const decoded = await verifyToken(token);
  if (!decoded) return null;
  
  return prisma.user.findUnique({ where: { id: decoded.userId } });
}

// GET /api/team - Get user's team
export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const team = await prisma.team.findUnique({
    where: { userId: user.id },
    include: {
      squadPlayers: {
        include: {
          player: {
            include: { nation: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ team });
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
        initialBudget: 100.0,
        bankBalance: 100.0,
        freeTransfers: 2,
      },
    });

    // Auto-join global league
    const globalLeague = await prisma.league.findFirst({
      where: { isGlobal: true },
    });

    if (globalLeague) {
      await prisma.leagueMembership.create({
        data: {
          leagueId: globalLeague.id,
          teamId: team.id,
          userId: user.id,
        },
      });
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
