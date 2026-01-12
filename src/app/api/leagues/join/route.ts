import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { joinLeagueSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { ZodError } from 'zod';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  try {
    const session = await requireAuth();

    // Check user has a team
    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'You need to create a team first' },
        { status: 400 }
      );
    }

    // Parse and validate
    const body = await request.json();
    const validatedData = joinLeagueSchema.parse(body);

    // Find league by code
    const league = await prisma.league.findUnique({
      where: { code: validatedData.code },
    });

    if (!league) {
      return NextResponse.json(
        { error: 'League not found. Check the code and try again.' },
        { status: 404 }
      );
    }

    // Check if already a member
    const existingMembership = await prisma.leagueMembership.findUnique({
      where: {
        leagueId_teamId: {
          leagueId: league.id,
          teamId: team.id,
        },
      },
    });

    if (existingMembership) {
      return NextResponse.json(
        { error: 'You are already a member of this league' },
        { status: 400 }
      );
    }

    // Create membership
    await prisma.leagueMembership.create({
      data: {
        leagueId: league.id,
        teamId: team.id,
        userId: session.userId,
      },
    });

    await logAudit('LEAGUE_JOINED', {
      leagueId: league.id,
      leagueName: league.name,
    }, session.userId, ip);

    return NextResponse.json({
      success: true,
      league: {
        id: league.id,
        name: league.name,
      },
    });

  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.issues[0];
      return NextResponse.json(
        { error: firstError.message },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    console.error('Join league error:', error);
    return NextResponse.json(
      { error: 'Failed to join league' },
      { status: 500 }
    );
  }
}


