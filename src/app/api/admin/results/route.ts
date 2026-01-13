import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    return user?.isAdmin ? user : null;
  } catch {
    return null;
  }
}

// POST /api/admin/results - Save match result
export async function POST(request: Request) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { matchId, homeScore, awayScore, isFinished, homePenalties, awayPenalties } = await request.json();

    if (!matchId || homeScore === undefined || awayScore === undefined) {
      return NextResponse.json({ error: 'Match ID and scores required' }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { homeNation: true, awayNation: true },
    });

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Determine winner (for knockout matches)
    let winnerId: string | null = null;
    if (isFinished) {
      if (homeScore > awayScore) {
        winnerId = match.homeNationId;
      } else if (awayScore > homeScore) {
        winnerId = match.awayNationId;
      } else if (homePenalties !== undefined && awayPenalties !== undefined) {
        // Penalty shootout
        winnerId = homePenalties > awayPenalties ? match.homeNationId : match.awayNationId;
      }
    }

    const updatedMatch = await prisma.match.update({
      where: { id: matchId },
      data: {
        homeScore,
        awayScore,
        isStarted: true,
        isFinished: isFinished ?? false,
        homePenalties: homePenalties ?? null,
        awayPenalties: awayPenalties ?? null,
        winnerId,
      },
    });

    // Audit
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'MATCH_RESULT_ENTERED',
        details: `${match.homeNation.name} ${homeScore} - ${awayScore} ${match.awayNation.name}`,
      },
    });

    // If knockout match and finished, mark loser as eliminated
    if (isFinished && winnerId) {
      const stage = await prisma.stage.findUnique({ where: { id: match.stageId } });
      const isKnockout = stage && stage.order >= 4; // R32 and beyond
      
      if (isKnockout) {
        const loserId = winnerId === match.homeNationId ? match.awayNationId : match.homeNationId;
        await prisma.nation.update({
          where: { id: loserId },
          data: {
            isEliminated: true,
            eliminatedAt: stage.stageId,
          },
        });
      }
    }

    return NextResponse.json({ match: updatedMatch });
  } catch (error) {
    console.error('Save result error:', error);
    return NextResponse.json({ error: 'Failed to save result' }, { status: 500 });
  }
}
