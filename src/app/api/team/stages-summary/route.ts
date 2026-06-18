import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { parseActiveChips } from '@/lib/chips-active';

export const dynamic = 'force-dynamic';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;
  const decoded = await verifyToken(token);
  if (!decoded) return null;
  return { userId: decoded.userId };
}

// Per-stage points summary for the logged-in team, in one call — powers the
// "Total Points" breakdown popup. Each entry carries the stage's points (null
// until that stage has been played/settled) so the popup can list every round.
export async function GET(_request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 });
    }

    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
      select: { id: true, totalPoints: true },
    });
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const stages = await prisma.stage.findMany({
      orderBy: { order: 'asc' },
      select: { id: true, stageId: true, name: true, order: true, isActive: true, isComplete: true },
    });

    const teamStages = await prisma.teamStage.findMany({
      where: { teamId: team.id },
      select: {
        stageId: true,
        rawPoints: true,
        captainPoints: true,
        transferHits: true,
        totalPoints: true,
        chipsUsed: true,
        chipUsed: true,
      },
    });
    const byStageId = new Map(teamStages.map((ts) => [ts.stageId, ts]));

    const result = stages.map((s) => {
      const ts = byStageId.get(s.id);
      let chips: string[] = ts ? parseActiveChips(ts.chipsUsed) : [];
      if (chips.length === 0 && ts?.chipUsed) chips = [ts.chipUsed];
      return {
        stageId: s.stageId,
        name: s.name,
        order: s.order,
        isActive: s.isActive,
        isComplete: s.isComplete,
        // null until the stage has a settled snapshot.
        points: ts
          ? {
              rawPoints: ts.rawPoints,
              captainPoints: ts.captainPoints,
              transferHits: ts.transferHits,
              totalPoints: ts.totalPoints,
            }
          : null,
        chips,
      };
    });

    // Current-round (live) points = running total minus everything already
    // banked in completed stages. Lets the inline "this round" pill update
    // weekly without needing live per-stage scoring on the client.
    const completedSum = stages.reduce((sum, s) => {
      const ts = byStageId.get(s.id);
      return s.isComplete && ts ? sum + ts.totalPoints : sum;
    }, 0);
    const active = stages.find((s) => s.isActive);
    const currentRoundPoints = team.totalPoints - completedSum;

    return NextResponse.json({
      totalPoints: team.totalPoints,
      currentRoundPoints,
      currentStageId: active?.stageId ?? null,
      currentStageName: active?.name ?? null,
      stages: result,
    });
  } catch (error) {
    console.error('stages-summary error:', error);
    return NextResponse.json({ error: 'Failed to load summary' }, { status: 500 });
  }
}
