import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken, JWTPayload } from '@/lib/auth';
import { getStageLock, LOCKED_ERROR } from '@/lib/deadline';
import { cookies } from 'next/headers';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

async function getSessionFromRequest(request: NextRequest): Promise<JWTPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value || request.cookies.get('auth_token')?.value;
    if (!token) return null;
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    
    if (!session) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 });
    }

    // Hard deadline: no lineup changes from 1h before the round's first
    // kickoff until the round finishes and the next stage activates.
    const { locked } = await getStageLock();
    if (locked) {
      return NextResponse.json({ error: LOCKED_ERROR }, { status: 403 });
    }

    const { startingXI, bench, captainId, viceCaptainId } = await request.json();

    // Validate
    if (!startingXI || startingXI.length !== 11) {
      return NextResponse.json({ error: 'Must have exactly 11 starting players' }, { status: 400 });
    }

    if (!bench || bench.length !== 4) {
      return NextResponse.json({ error: 'Must have exactly 4 bench players' }, { status: 400 });
    }

    if (!captainId || !viceCaptainId) {
      return NextResponse.json({ error: 'Captain and vice-captain are required' }, { status: 400 });
    }

    // Get user's team
    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
      include: { squadPlayers: true },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Reset all to bench
      await tx.squadPlayer.updateMany({
        where: { teamId: team.id },
        data: { isStarting: false, isCaptain: false, isViceCaptain: false, benchOrder: null },
      });

      // Set starting XI
      for (const playerId of startingXI) {
        await tx.squadPlayer.updateMany({
          where: { teamId: team.id, playerId },
          data: { isStarting: true },
        });
      }

      // Set bench order
      for (let i = 0; i < bench.length; i++) {
        await tx.squadPlayer.updateMany({
          where: { teamId: team.id, playerId: bench[i] },
          data: { benchOrder: i + 1 },
        });
      }

      // Set captain
      await tx.squadPlayer.updateMany({
        where: { teamId: team.id, playerId: captainId },
        data: { isCaptain: true },
      });

      // Set vice-captain
      await tx.squadPlayer.updateMany({
        where: { teamId: team.id, playerId: viceCaptainId },
        data: { isViceCaptain: true },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update squad error:', error);
    return NextResponse.json({ error: 'Failed to update squad' }, { status: 500 });
  }
}
