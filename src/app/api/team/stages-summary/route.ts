import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { parseActiveChips } from '@/lib/chips-active';
import { stageTeamTotals } from '@/lib/live-team-totals';

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

    // Current-round points, computed DIRECTLY from the active stage's
    // PlayerPerformance (same basis as the per-player pills) minus any
    // transfer hits taken this stage. The old `totalPoints − completedSum`
    // subtraction leaked the leaderboard-vs-snapshot divergence (lineup
    // changes make Team.totalPoints differ from the settled snapshots), so a
    // team with no games yet could show +2/+4 — or a heavy-transfer team a
    // large negative — for the current round. Sourcing from this stage's
    // perfs makes it match the pitch pills and resets cleanly each round.
    const active = stages.find((s) => s.isActive);
    let currentRoundPoints = 0;
    if (active) {
      const stagePts = (await stageTeamTotals([team.id], active.id)).get(team.id) ?? 0;
      const paidHits = await prisma.transfer.count({
        where: {
          teamId: team.id,
          stageId: active.id,
          isFreeTransfer: false,
          isWildcard: false,
          isMercyTransfer: false,
        },
      });
      currentRoundPoints = stagePts - paidHits * 4;
    }

    const result = stages.map((s) => {
      const ts = byStageId.get(s.id);
      let chips: string[] = ts ? parseActiveChips(ts.chipsUsed) : [];
      if (chips.length === 0 && ts?.chipUsed) chips = [ts.chipUsed];
      // The in-progress round hasn't settled, so its TeamStage totals are still
      // 0. Surface the LIVE round total instead (same number the dashboard /
      // squad "Round Pts" pill shows) so the breakdown list isn't stuck on 0
      // while matches play.
      const points =
        s.id === active?.id
          ? {
              rawPoints: currentRoundPoints,
              captainPoints: 0,
              transferHits: 0,
              totalPoints: currentRoundPoints,
              live: true,
            }
          : ts
          ? {
              rawPoints: ts.rawPoints,
              captainPoints: ts.captainPoints,
              transferHits: ts.transferHits,
              totalPoints: ts.totalPoints,
              live: false,
            }
          : null; // null until the stage has a settled snapshot.
      return {
        stageId: s.stageId,
        name: s.name,
        order: s.order,
        isActive: s.isActive,
        isComplete: s.isComplete,
        points,
        chips,
      };
    });

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
