import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { createLeagueSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { logActivity } from '@/lib/activity';
import { generateLeagueCode } from '@/lib/utils';
import { ZodError } from 'zod';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

// Create a new league
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

    // Cap leagues per owner so a user can't spam-create them. 5 is plenty
    // for a friends tournament; admins are exempt for ops work.
    const ownedCount = await prisma.league.count({
      where: { ownerId: session.userId, isGlobal: false },
    });
    if (ownedCount >= 5) {
      return NextResponse.json(
        { error: 'You can own at most 5 leagues. Delete one to create another.' },
        { status: 400 }
      );
    }

    // Parse and validate
    const body = await request.json();
    const validatedData = createLeagueSchema.parse(body);

    // Generate unique code
    let code = generateLeagueCode();
    let attempts = 0;
    while (await prisma.league.findUnique({ where: { code } })) {
      code = generateLeagueCode();
      attempts++;
      if (attempts > 10) {
        return NextResponse.json(
          { error: 'Failed to generate unique code' },
          { status: 500 }
        );
      }
    }

    // Create league and add owner as member
    const league = await prisma.league.create({
      data: {
        name: validatedData.name,
        code,
        ownerId: session.userId,
        memberships: {
          create: {
            teamId: team.id,
            userId: session.userId,
          },
        },
      },
    });

    await logAudit('LEAGUE_CREATED', {
      leagueId: league.id,
      leagueName: league.name,
      code: league.code,
    }, session.userId, ip);

    return NextResponse.json({
      success: true,
      league: {
        id: league.id,
        name: league.name,
        code: league.code,
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

    console.error('Create league error:', error);
    return NextResponse.json(
      { error: 'Failed to create league' },
      { status: 500 }
    );
  }
}

// Get user's leagues
export async function GET() {
  try {
    const session = await requireAuth();

    // Fire-and-forget activity marker — never blocks or fails the response.
    logActivity(session.userId, 'VIEW_LEAGUES_LIST');

    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
      include: {
        leagueMemberships: {
          include: {
            league: {
              include: {
                _count: {
                  select: { memberships: true },
                },
              },
            },
          },
        },
      },
    });

    if (!team) {
      return NextResponse.json({ leagues: [] });
    }

    return NextResponse.json({
      leagues: team.leagueMemberships.map(m => ({
        id: m.league.id,
        name: m.league.name,
        code: m.league.code,
        isGlobal: m.league.isGlobal,
        memberCount: m.league._count.memberships,
        isOwner: m.league.ownerId === session.userId,
      })),
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    console.error('Get leagues error:', error);
    return NextResponse.json(
      { error: 'Failed to get leagues' },
      { status: 500 }
    );
  }
}


