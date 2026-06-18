import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { parseActiveChips, type ChipType } from '@/lib/chips-active';

export const dynamic = 'force-dynamic';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;
  const decoded = await verifyToken(token);
  if (!decoded) return null;
  return { userId: decoded.userId };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ stageId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 });
    }

    const { stageId } = await params;

    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
      select: { id: true },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Get the stage
    const stage = await prisma.stage.findFirst({
      where: { stageId },
      select: { id: true, stageId: true, name: true, order: true },
    });

    if (!stage) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    // Get TeamStage data
    const teamStage = await prisma.teamStage.findUnique({
      where: { teamId_stageId: { teamId: team.id, stageId: stage.id } },
    });

    // Get all matches in this stage
    const matches = await prisma.match.findMany({
      where: { stageId: stage.id },
      include: {
        homeNation: { select: { id: true, name: true, code: true } },
        awayNation: { select: { id: true, name: true, code: true } },
      },
    });

    // Determine the squad as it was DURING this stage.
    //
    // Preferred: the squadSnapshot written by settleStage when the stage was
    // settled — an exact record of the players + lineup flags that played it.
    //
    // Fallback (rounds settled before snapshotting existed): rewind the current
    // squad through every transfer made in a LATER stage. Each later transfer
    // swapped playerOut → playerIn and the incoming player inherited the slot's
    // flags, so undoing it (playerIn → playerOut, carrying flags back) recovers
    // the historical owner. This gets the players exactly right but can only
    // approximate lineup/captain if they were changed after a transfer.
    type HistSlot = { playerId: string; isStarting: boolean; isCaptain: boolean; isViceCaptain: boolean; benchOrder: number | null };

    let histSlots: HistSlot[] | null = null;
    if (teamStage?.squadSnapshot) {
      try {
        const parsed = JSON.parse(teamStage.squadSnapshot);
        if (Array.isArray(parsed) && parsed.every((s) => typeof s?.playerId === 'string')) {
          histSlots = parsed.map((s) => ({
            playerId: s.playerId,
            isStarting: !!s.isStarting,
            isCaptain: !!s.isCaptain,
            isViceCaptain: !!s.isViceCaptain,
            benchOrder: typeof s.benchOrder === 'number' ? s.benchOrder : null,
          }));
        }
      } catch {
        histSlots = null; // corrupt snapshot → fall through to rewind
      }
    }

    if (!histSlots) {
      const currentSquad = await prisma.squadPlayer.findMany({
        where: { teamId: team.id },
        select: { playerId: true, isStarting: true, isCaptain: true, isViceCaptain: true, benchOrder: true },
      });

      const allStages = await prisma.stage.findMany({ select: { id: true, order: true } });
      const orderByStageDbId = new Map(allStages.map((s) => [s.id, s.order]));

      // Newest transfers first so chained swaps in a single later stage rewind
      // in the right order.
      const teamTransfers = await prisma.transfer.findMany({
        where: { teamId: team.id },
        select: { playerInId: true, playerOutId: true, stageId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      const laterTransfers = teamTransfers.filter(
        (t) => t.stageId && (orderByStageDbId.get(t.stageId) ?? -1) > stage.order,
      );

      const slotByPlayer = new Map<string, HistSlot>();
      for (const sp of currentSquad) slotByPlayer.set(sp.playerId, { ...sp });
      for (const t of laterTransfers) {
        const inSlot = slotByPlayer.get(t.playerInId);
        if (!inSlot) continue; // already rewound past, or not a tracked slot
        slotByPlayer.delete(t.playerInId);
        slotByPlayer.set(t.playerOutId, { ...inSlot, playerId: t.playerOutId });
      }
      histSlots = Array.from(slotByPlayer.values());
    }
    const histPlayers = await prisma.player.findMany({
      where: { id: { in: histSlots.map((s) => s.playerId) } },
      include: {
        nation: { select: { id: true, name: true, code: true, kitColor1: true, kitColor2: true } },
      },
    });
    const playerById = new Map(histPlayers.map((p) => [p.id, p]));

    const squadPlayers = histSlots
      .map((s) => {
        const player = playerById.get(s.playerId);
        return player
          ? { playerId: s.playerId, isStarting: s.isStarting, isCaptain: s.isCaptain, isViceCaptain: s.isViceCaptain, benchOrder: s.benchOrder, player }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Get performance data for all squad players in this stage's matches
    const matchIds = matches.map(m => m.id);
    const playerIds = squadPlayers.map(sp => sp.playerId);

    const performances = matchIds.length > 0 && playerIds.length > 0
      ? await prisma.playerPerformance.findMany({
          where: {
            matchId: { in: matchIds },
            playerId: { in: playerIds },
          },
          include: {
            match: {
              include: {
                homeNation: { select: { name: true, code: true } },
                awayNation: { select: { name: true, code: true } },
              },
            },
          },
        })
      : [];

    // Build per-player breakdown
    const playerBreakdowns = squadPlayers.map(sp => {
      const playerPerfs = performances.filter(p => p.playerId === sp.playerId);
      const totalPoints = playerPerfs.reduce((sum, p) => sum + p.totalPoints, 0);

      const matchDetails = playerPerfs.map(perf => ({
        matchId: perf.matchId,
        opponent: perf.match.homeNation.code === sp.player.nation.code
          ? perf.match.awayNation.name
          : perf.match.homeNation.name,
        minutesPlayed: perf.minutesPlayed,
        goals: perf.goals,
        assists: perf.assists,
        cleanSheet: perf.cleanSheet,
        saves: perf.saves,
        yellowCards: perf.yellowCards,
        redCards: perf.redCards,
        ownGoals: perf.ownGoals,
        penaltiesSaved: perf.penaltiesSaved,
        penaltiesMissed: perf.penaltiesMissed,
        goalsConceeded: perf.goalsConceeded,
        bonusPoints: perf.bonusPoints,
        totalPoints: perf.totalPoints,
      }));

      return {
        playerId: sp.playerId,
        displayName: sp.player.displayName,
        position: sp.player.position,
        nation: sp.player.nation,
        photoUrl: sp.player.photoUrl,
        shirtNumber: sp.player.shirtNumber,
        isStarting: sp.isStarting,
        isCaptain: sp.isCaptain,
        isViceCaptain: sp.isViceCaptain,
        totalPoints,
        matches: matchDetails,
      };
    });

    return NextResponse.json({
      stage: {
        stageId: stage.stageId,
        name: stage.name,
      },
      teamStage: teamStage
        ? {
            rawPoints: teamStage.rawPoints,
            captainPoints: teamStage.captainPoints,
            transferHits: teamStage.transferHits,
            totalPoints: teamStage.totalPoints,
            chipUsed: teamStage.chipUsed,
            // Multi-chip array for the history badges. Falls back to the
            // legacy single chip if the new column hasn't been populated.
            chipsUsed: (() => {
              const arr = parseActiveChips(teamStage.chipsUsed);
              if (arr.length > 0) return arr;
              if (teamStage.chipUsed) return [teamStage.chipUsed as ChipType];
              return [];
            })(),
          }
        : null,
      players: playerBreakdowns,
      hasData: performances.length > 0,
    });
  } catch (error) {
    console.error('Error fetching gameweek data:', error);
    return NextResponse.json({ error: 'Failed to fetch gameweek data' }, { status: 500 });
  }
}
