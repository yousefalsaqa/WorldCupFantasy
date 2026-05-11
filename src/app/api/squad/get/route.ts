import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface FreeHitSnapshotPlayer {
  playerId: string;
  purchasePrice: number;
  isStarting: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  benchOrder: number | null;
  points: number;
}

interface FreeHitSnapshot {
  stageId: string;
  stageName?: string;
  capturedAt?: string;
  bankBalance: number;
  teamValue: number;
  freeTransfers: number;
  transfersUsed: number;
  players: FreeHitSnapshotPlayer[];
}

/**
 * If the user activated Free Hit in a stage that is no longer the active one,
 * restore their squad + bank to the snapshot taken at activation time.
 * Idempotent and runs at the start of every squad load. Returns true if a
 * revert actually happened so the caller can decide whether to re-read team.
 */
async function maybeRevertFreeHit(teamId: string, snapshotJson: string | null): Promise<boolean> {
  if (!snapshotJson) return false;

  let snapshot: FreeHitSnapshot;
  try {
    snapshot = JSON.parse(snapshotJson);
  } catch {
    // Corrupt snapshot – clear it so we don't loop on every load
    await prisma.team.update({ where: { id: teamId }, data: { freeHitSnapshot: null } });
    return false;
  }

  // Look up the stage Free Hit was activated in. If that stage is still the
  // active one, the gameweek hasn't ended – do nothing yet.
  const activationStage = await prisma.stage.findUnique({
    where: { id: snapshot.stageId },
    select: { isActive: true },
  });
  if (activationStage?.isActive) return false;

  // Stage has ended – restore the snapshot. createMany + 15s timeout because
  // Neon's pooler adds per-query latency and looping create() calls blew the
  // default 5s transaction window.
  await prisma.$transaction(async (tx) => {
    await tx.squadPlayer.deleteMany({ where: { teamId } });
    await tx.squadPlayer.createMany({
      data: snapshot.players.map(p => ({
        teamId,
        playerId: p.playerId,
        purchasePrice: p.purchasePrice,
        isStarting: p.isStarting,
        isCaptain: p.isCaptain,
        isViceCaptain: p.isViceCaptain,
        benchOrder: p.benchOrder,
        points: p.points,
      })),
    });
    await tx.team.update({
      where: { id: teamId },
      data: {
        bankBalance: snapshot.bankBalance,
        teamValue: snapshot.teamValue,
        freeTransfers: snapshot.freeTransfers,
        transfersUsed: snapshot.transfersUsed,
        freeHitSnapshot: null,
      },
    });
  }, { timeout: 15000 });
  return true;
}

// Mirrors the logic in /api/transfers: transfers are unlimited when (a) the
// global compile-time flag is on (pre-launch testing), (b) no stage is
// currently active (i.e. pre-tournament or between gameweeks), or (c) the
// active stage has Wildcard / Free Hit applied. Surfacing this to the squad
// page lets the transfer UI hide hit-cost messaging when it doesn't apply.
//
// Keep this in lockstep with /api/transfers/route.ts → the constant there
// IS the source of truth; we mirror it here.
const UNLIMITED_TRANSFERS = true;

async function computeUnlimitedTransfers(teamId: string): Promise<boolean> {
  if (UNLIMITED_TRANSFERS) return true;
  const activeStage = await prisma.stage.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  if (!activeStage) return true;
  const teamStage = await prisma.teamStage.findUnique({
    where: { teamId_stageId: { teamId, stageId: activeStage.id } },
    select: { chipUsed: true },
  });
  return (
    teamStage?.chipUsed === 'WILDCARD_1' ||
    teamStage?.chipUsed === 'WILDCARD_2' ||
    teamStage?.chipUsed === 'FREE_HIT'
  );
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ squad: [] }, { status: 200 });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ squad: [] }, { status: 200 });
    }

    const userId = decoded.userId;

    const team = await prisma.team.findUnique({
      where: { userId },
    });

    if (!team) {
      return NextResponse.json({ squad: [] }, { status: 200 });
    }

    // Auto-revert Free Hit if the activation stage has ended. We pass the
    // already-loaded snapshot string so the helper avoids a redundant DB
    // hit when there's nothing to revert (the common case).
    const reverted = await maybeRevertFreeHit(team.id, team.freeHitSnapshot);

    // Only re-read team if revert actually changed bank/transfers. Saves a
    // round trip for every squad load that doesn't trigger a Free Hit revert.
    const refreshedTeam = reverted
      ? await prisma.team.findUnique({ where: { id: team.id } })
      : team;

    // No `performances` include here – that join was the heaviest part of
    // this endpoint and the stats it produced are zero pre-tournament. The
    // player detail modal can lazy-fetch real stats via a dedicated endpoint
    // when the user opens it (and once the tournament starts).
    const squadPlayers = await prisma.squadPlayer.findMany({
      where: { teamId: team.id },
      include: {
        player: {
          include: { nation: true },
        },
      },
    });

    const squad = squadPlayers.map(sp => ({
      id: sp.id,
      playerId: sp.playerId,
      purchasePrice: sp.purchasePrice,
      points: sp.points,
      isStarting: sp.isStarting,
      isCaptain: sp.isCaptain,
      isViceCaptain: sp.isViceCaptain,
      benchOrder: sp.benchOrder,
      player: {
        id: sp.player.id,
        name: sp.player.displayName,
        displayName: sp.player.displayName,
        position: sp.player.position,
        currentPrice: sp.player.currentPrice,
        shirtNumber: sp.player.shirtNumber,
        nation: {
          id: sp.player.nation.id,
          name: sp.player.nation.name,
          code: sp.player.nation.code,
          kitColor1: sp.player.nation.kitColor1,
          kitColor2: sp.player.nation.kitColor2,
        },
      },
      stats: {
        goals: 0,
        assists: 0,
        passAccuracy: 0,
        interceptions: 0,
        tackles: 0,
        dribbles: 0,
        minutes: 0,
      },
    }));

    const unlimitedTransfers = await computeUnlimitedTransfers(team.id);

    return NextResponse.json({
      squad,
      teamId: team.id,
      bankBalance: refreshedTeam?.bankBalance ?? team.bankBalance,
      teamValue: refreshedTeam?.teamValue ?? team.teamValue,
      // Surface the transfer-budget fields so the squad page can drive the
      // transfer-mode UI (free transfers badge + hits calculation).
      freeTransfers: refreshedTeam?.freeTransfers ?? team.freeTransfers,
      transfersUsed: refreshedTeam?.transfersUsed ?? team.transfersUsed,
      // When true the squad page suppresses point-hit messaging since
      // transfers are effectively free.
      unlimitedTransfers,
    });

  } catch (error) {
    console.error('Get squad error:', error);
    return NextResponse.json({ squad: [], error: 'Failed to fetch squad' }, { status: 500 });
  }
}
