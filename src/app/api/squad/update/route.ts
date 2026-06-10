import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken, JWTPayload } from '@/lib/auth';
import { getStageLock } from '@/lib/deadline';
import { parseActiveChips, hasTripleCaptain, type ChipType } from '@/lib/chips-active';
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
      include: { squadPlayers: { include: { player: { select: { nationId: true, displayName: true } } } } },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // No outsiders: every submitted id must be one of this team's 15. The
    // old code silently no-op'ed foreign ids, which could leave a lineup
    // with fewer than 11 real starters.
    const squadIds = new Set(team.squadPlayers.map((sp) => sp.playerId));
    const submittedIds = [...startingXI, ...bench];
    if (submittedIds.length !== 15 || new Set(submittedIds).size !== 15 || submittedIds.some((id: string) => !squadIds.has(id))) {
      return NextResponse.json(
        { error: 'Lineup must use exactly your 15 squad players' },
        { status: 400 }
      );
    }

    // Deadline rules. Before the deadline: anything goes. During the round
    // ("late swap" window), for players whose match already kicked off:
    //   - bringing them INTO the XI (or giving them an armband) is blocked:
    //     that's hindsight points.
    //   - subbing them OUT of the XI is allowed, but every point they
    //     banked this stage is FORFEITED (clawed back from the team total),
    //     so a round can never count more than 11 players. Same for taking
    //     the captaincy off a played captain: the multiplier bonus reverts.
    //   - bench-order shuffles of played bench players are blocked (no
    //     gaming auto-sub priority after seeing scores).
    // Un-started players can be rearranged freely until their own kickoff.
    const { stage, locked } = await getStageLock();
    let forfeit = 0;
    const forfeitNames: string[] = [];
    if (locked && stage) {
      const matches = await prisma.match.findMany({
        where: { stageId: stage.id },
        select: { id: true, homeNationId: true, awayNationId: true, kickoffTime: true, isStarted: true, isFinished: true },
      });
      const now = new Date();
      const startedNations = new Set<string>();
      const finishedMatchIds: string[] = [];
      for (const m of matches) {
        if (m.isStarted || m.kickoffTime <= now) {
          startedNations.add(m.homeNationId);
          startedNations.add(m.awayNationId);
        }
        if (m.isFinished) finishedMatchIds.push(m.id);
      }

      // Captain multiplier for forfeit math (Triple Captain aware)
      const ts = await prisma.teamStage.findUnique({
        where: { teamId_stageId: { teamId: team.id, stageId: stage.id } },
        select: { chipsUsed: true, chipUsed: true },
      });
      let chips = parseActiveChips(ts?.chipsUsed);
      if (chips.length === 0 && ts?.chipUsed) chips = [ts.chipUsed as ChipType];
      const mult = hasTripleCaptain(chips) ? 3 : 2;

      const startingSet = new Set<string>(startingXI);
      const benchIndex = new Map<string, number>(bench.map((id: string, i: number) => [id, i + 1]));

      const stagePtsFor = async (playerId: string): Promise<number> => {
        if (finishedMatchIds.length === 0) return 0;
        const agg = await prisma.playerPerformance.aggregate({
          where: { playerId, matchId: { in: finishedMatchIds } },
          _sum: { totalPoints: true },
        });
        return agg._sum.totalPoints ?? 0;
      };

      for (const sp of team.squadPlayers) {
        if (!startedNations.has(sp.player.nationId)) continue;
        const willStart = startingSet.has(sp.playerId);
        const gainsCaptain = !sp.isCaptain && sp.playerId === captainId;
        const gainsVice = !sp.isViceCaptain && sp.playerId === viceCaptainId;
        const losesCaptain = sp.isCaptain && sp.playerId !== captainId;

        if ((!sp.isStarting && willStart) || gainsCaptain || gainsVice) {
          return NextResponse.json(
            { error: `${sp.player.displayName} has already played this round — you can't bring him in or give him the armband now.` },
            { status: 403 }
          );
        }
        if (!sp.isStarting && !willStart && (benchIndex.get(sp.playerId) ?? null) !== sp.benchOrder) {
          return NextResponse.json(
            { error: `${sp.player.displayName} already played — his bench slot is locked for this round.` },
            { status: 403 }
          );
        }
        // Forfeits: leaving the XI loses his banked points; losing the
        // armband loses the multiplier bonus on top.
        if (sp.isStarting && !willStart) {
          const pts = await stagePtsFor(sp.playerId);
          const lost = pts * (sp.isCaptain ? mult : 1);
          if (lost !== 0) {
            forfeit += lost;
            forfeitNames.push(`${sp.player.displayName} (${lost})`);
          }
        } else if (losesCaptain && sp.isStarting && willStart) {
          const pts = await stagePtsFor(sp.playerId);
          const lost = pts * (mult - 1);
          if (lost !== 0) {
            forfeit += lost;
            forfeitNames.push(`${sp.player.displayName} armband (${lost})`);
          }
        }
      }
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

      // Claw back forfeited points (played players subbed out / armband
      // moved off a played captain) in the same transaction as the lineup
      // change so the two can never disagree.
      if (forfeit !== 0) {
        await tx.team.update({
          where: { id: team.id },
          data: { totalPoints: { decrement: forfeit } },
        });
        await tx.auditLog.create({
          data: {
            userId: session.userId,
            action: 'SQUAD_UPDATED',
            details: JSON.stringify({ action: 'LATE_SWAP_FORFEIT', forfeit, players: forfeitNames }),
          },
        });
      }
    });

    return NextResponse.json({
      success: true,
      ...(forfeit !== 0
        ? { forfeit, message: `Lineup saved. ${forfeit} already-scored point${forfeit === 1 ? '' : 's'} forfeited: ${forfeitNames.join(', ')}` }
        : {}),
    });
  } catch (error) {
    console.error('Update squad error:', error);
    return NextResponse.json({ error: 'Failed to update squad' }, { status: 500 });
  }
}
