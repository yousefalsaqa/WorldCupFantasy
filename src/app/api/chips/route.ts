import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

type ChipType = 'WILDCARD_1' | 'WILDCARD_2' | 'TRIPLE_CAPTAIN' | 'BENCH_BOOST' | 'FREE_HIT';

const CHIP_META: Record<ChipType, { name: string; description: string }> = {
  WILDCARD_1: { name: 'Wildcard', description: 'Unlimited transfers for this stage' },
  WILDCARD_2: { name: 'Wildcard 2', description: 'Second wildcard, available after Round of 32' },
  TRIPLE_CAPTAIN: { name: 'Triple Captain', description: 'Captain scores 3x points this stage' },
  BENCH_BOOST: { name: 'Bench Boost', description: 'All bench players score points this stage' },
  FREE_HIT: { name: 'Free Hit', description: 'Unlimited transfers for one stage \u2013 squad reverts after' },
};

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

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;
  const decoded = await verifyToken(token);
  if (!decoded) return null;
  return { userId: decoded.userId };
}

/**
 * Stage is "locked" once its deadline has passed (gameweek has started).
 * Before that, users can still cancel a chip activation. After that, locked in.
 */
function stageIsLocked(deadline: Date | null | undefined): boolean {
  if (!deadline) return false; // no deadline configured = treat as not started
  return new Date() >= new Date(deadline);
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 });
    }

    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
      select: {
        id: true,
        wildcard1Used: true,
        wildcard2Used: true,
        tripleCaptainUsed: true,
        benchBoostUsed: true,
        freeHitUsed: true,
      },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const activeStage = await prisma.stage.findFirst({
      where: { isActive: true },
      select: { id: true, stageId: true, name: true, deadlineTime: true },
    });

    let activeChip: string | null = null;
    if (activeStage) {
      const teamStage = await prisma.teamStage.findUnique({
        where: { teamId_stageId: { teamId: team.id, stageId: activeStage.id } },
        select: { chipUsed: true },
      });
      activeChip = teamStage?.chipUsed ?? null;
    }

    const locked = stageIsLocked(activeStage?.deadlineTime);

    // Wildcard 1 specifically can only be cancelled if no transfers were made
    // under it in this stage (otherwise the user got free transfers for nothing).
    let wildcardHasTransfers = false;
    if (activeChip === 'WILDCARD_1' && activeStage) {
      const wildcardTransferCount = await prisma.transfer.count({
        where: {
          teamId: team.id,
          stageId: activeStage.id,
          isWildcard: true,
        },
      });
      wildcardHasTransfers = wildcardTransferCount > 0;
    }

    // Determine if a given chip can be cancelled right now
    const computeCancel = (chipId: ChipType): { canCancel: boolean; reason?: string } => {
      if (activeChip !== chipId) return { canCancel: false };
      if (locked) return { canCancel: false, reason: 'Stage has already started' };
      if (chipId === 'WILDCARD_1' && wildcardHasTransfers) {
        return { canCancel: false, reason: 'Cannot cancel \u2013 transfers already made under Wildcard' };
      }
      return { canCancel: true };
    };

    // WILDCARD_2 is intentionally hidden for now \u2013 it unlocks in the next round
    // and shouldn't be picked alongside the first wildcard. Data is preserved
    // server-side so we can re-enable it later without losing state.
    const buildChip = (id: ChipType, used: boolean) => {
      const cancel = computeCancel(id);
      return {
        id,
        ...CHIP_META[id],
        used,
        available: !used && activeChip === null && (id !== 'FREE_HIT' || activeStage !== null),
        active: activeChip === id,
        canCancel: cancel.canCancel,
        cancelBlockedReason: cancel.reason,
      };
    };

    const chips = [
      buildChip('WILDCARD_1', team.wildcard1Used),
      buildChip('FREE_HIT', team.freeHitUsed),
      buildChip('TRIPLE_CAPTAIN', team.tripleCaptainUsed),
      buildChip('BENCH_BOOST', team.benchBoostUsed),
    ];

    return NextResponse.json({
      chips,
      activeChip,
      activeStage,
      stageLocked: locked,
      deadlineTime: activeStage?.deadlineTime ?? null,
    });
  } catch (error) {
    console.error('Error fetching chips:', error);
    return NextResponse.json({ error: 'Failed to fetch chips' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 });
    }

    const { chipId } = await request.json() as { chipId: ChipType };

    if (!chipId || !CHIP_META[chipId]) {
      return NextResponse.json({ error: 'Invalid chip' }, { status: 400 });
    }

    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const usedMap: Record<ChipType, boolean> = {
      WILDCARD_1: team.wildcard1Used,
      WILDCARD_2: team.wildcard2Used,
      TRIPLE_CAPTAIN: team.tripleCaptainUsed,
      BENCH_BOOST: team.benchBoostUsed,
      FREE_HIT: team.freeHitUsed,
    };

    if (usedMap[chipId]) {
      return NextResponse.json({ error: 'This chip has already been used' }, { status: 400 });
    }

    const activeStage = await prisma.stage.findFirst({
      where: { isActive: true },
    });

    if (!activeStage) {
      return NextResponse.json({ error: 'No active stage' }, { status: 400 });
    }

    if (chipId === 'WILDCARD_2') {
      const knockoutStages = ['R32', 'R16', 'QF', 'SF', '3RD', 'F'];
      if (!knockoutStages.includes(activeStage.stageId)) {
        return NextResponse.json({ error: 'Wildcard 2 is only available in knockout stages' }, { status: 400 });
      }
    }

    const existingTeamStage = await prisma.teamStage.findUnique({
      where: { teamId_stageId: { teamId: team.id, stageId: activeStage.id } },
    });

    if (existingTeamStage?.chipUsed) {
      return NextResponse.json({ error: 'A chip is already active for this stage' }, { status: 400 });
    }

    // Free Hit needs a full snapshot of the squad + budget so we can restore
    // everything at the end of the stage. Captured BEFORE any free-hit transfers
    // happen, so we know exactly what the user had before they activated it.
    let freeHitSnapshot: string | undefined;
    if (chipId === 'FREE_HIT') {
      const squadPlayers = await prisma.squadPlayer.findMany({
        where: { teamId: team.id },
        select: {
          playerId: true,
          purchasePrice: true,
          isStarting: true,
          isCaptain: true,
          isViceCaptain: true,
          benchOrder: true,
          points: true,
        },
      });

      if (squadPlayers.length === 0) {
        return NextResponse.json({ error: 'You need a squad before activating Free Hit' }, { status: 400 });
      }

      freeHitSnapshot = JSON.stringify({
        stageId: activeStage.id,
        stageName: activeStage.name,
        capturedAt: new Date().toISOString(),
        bankBalance: team.bankBalance,
        teamValue: team.teamValue,
        freeTransfers: team.freeTransfers,
        transfersUsed: team.transfersUsed,
        players: squadPlayers,
      });
    }

    await prisma.$transaction(async (tx) => {
      const updateField: Record<string, boolean | string> = {};
      if (chipId === 'WILDCARD_1') updateField.wildcard1Used = true;
      if (chipId === 'WILDCARD_2') updateField.wildcard2Used = true;
      if (chipId === 'TRIPLE_CAPTAIN') updateField.tripleCaptainUsed = true;
      if (chipId === 'BENCH_BOOST') updateField.benchBoostUsed = true;
      if (chipId === 'FREE_HIT') {
        updateField.freeHitUsed = true;
        if (freeHitSnapshot) updateField.freeHitSnapshot = freeHitSnapshot;
      }

      await tx.team.update({
        where: { id: team.id },
        data: updateField,
      });

      await tx.teamStage.upsert({
        where: { teamId_stageId: { teamId: team.id, stageId: activeStage.id } },
        create: {
          teamId: team.id,
          stageId: activeStage.id,
          chipUsed: chipId,
        },
        update: {
          chipUsed: chipId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'CHIP_ACTIVATED',
          details: JSON.stringify({ chipId, stageName: activeStage.name }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: `${CHIP_META[chipId].name} activated!`,
      chipId,
    });
  } catch (error) {
    console.error('Error activating chip:', error);
    return NextResponse.json({ error: 'Failed to activate chip' }, { status: 500 });
  }
}

/**
 * Cancel the currently active chip. Only allowed before the active stage's
 * deadline (i.e. before the gameweek starts). For Free Hit, the snapshot is
 * fully restored. For Wildcard, cancellation is blocked if any transfers were
 * already made under it.
 */
export async function DELETE() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 });
    }

    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const activeStage = await prisma.stage.findFirst({
      where: { isActive: true },
    });

    if (!activeStage) {
      return NextResponse.json({ error: 'No active stage' }, { status: 400 });
    }

    if (stageIsLocked(activeStage.deadlineTime)) {
      return NextResponse.json({ error: 'Stage has started \u2013 chips can no longer be cancelled' }, { status: 400 });
    }

    const teamStage = await prisma.teamStage.findUnique({
      where: { teamId_stageId: { teamId: team.id, stageId: activeStage.id } },
    });

    const chipId = teamStage?.chipUsed as ChipType | null | undefined;
    if (!chipId) {
      return NextResponse.json({ error: 'No active chip to cancel' }, { status: 400 });
    }

    // Wildcard cancel safety: refuse if transfers were already made under it
    if (chipId === 'WILDCARD_1' || chipId === 'WILDCARD_2') {
      const wildcardTransferCount = await prisma.transfer.count({
        where: {
          teamId: team.id,
          stageId: activeStage.id,
          isWildcard: true,
        },
      });
      if (wildcardTransferCount > 0) {
        return NextResponse.json({
          error: `You\u2019ve already made transfers under your Wildcard. Cancel those transfers first, then you can deactivate the chip.`,
        }, { status: 400 });
      }
    }

    // For Free Hit we restore the full snapshot inside the same transaction so
    // the state is always consistent (squad + bank + transfer counts).
    let freeHitSnapshot: FreeHitSnapshot | null = null;
    if (chipId === 'FREE_HIT' && team.freeHitSnapshot) {
      try {
        freeHitSnapshot = JSON.parse(team.freeHitSnapshot);
      } catch {
        // If the snapshot is corrupt, refuse rather than silently lose data
        return NextResponse.json({
          error: 'Free Hit snapshot is corrupt \u2013 contact support to restore your team.',
        }, { status: 500 });
      }
    }

    // 15s timeout (default is 5s) – Neon's pooler adds latency per query and
    // the Free Hit revert touches 15 squad rows + team + teamStage + audit.
    await prisma.$transaction(async (tx) => {
      // 1) Unflag the chip on the team so it's available again
      const updateField: Record<string, boolean | string | null | number> = {};
      if (chipId === 'WILDCARD_1') updateField.wildcard1Used = false;
      if (chipId === 'WILDCARD_2') updateField.wildcard2Used = false;
      if (chipId === 'TRIPLE_CAPTAIN') updateField.tripleCaptainUsed = false;
      if (chipId === 'BENCH_BOOST') updateField.benchBoostUsed = false;
      if (chipId === 'FREE_HIT') {
        updateField.freeHitUsed = false;
        updateField.freeHitSnapshot = null;
      }

      // 2) For Free Hit, restore the snapshot squad + bank + transfer counts.
      // Using deleteMany + createMany (1 round trip each) instead of a loop of
      // .create() calls so the whole revert finishes well under the timeout.
      if (chipId === 'FREE_HIT' && freeHitSnapshot) {
        await tx.squadPlayer.deleteMany({ where: { teamId: team.id } });
        await tx.squadPlayer.createMany({
          data: freeHitSnapshot.players.map(p => ({
            teamId: team.id,
            playerId: p.playerId,
            purchasePrice: p.purchasePrice,
            isStarting: p.isStarting,
            isCaptain: p.isCaptain,
            isViceCaptain: p.isViceCaptain,
            benchOrder: p.benchOrder,
            points: p.points,
          })),
        });
        updateField.bankBalance = freeHitSnapshot.bankBalance;
        updateField.teamValue = freeHitSnapshot.teamValue;
        updateField.freeTransfers = freeHitSnapshot.freeTransfers;
        updateField.transfersUsed = freeHitSnapshot.transfersUsed;
      }

      await tx.team.update({
        where: { id: team.id },
        data: updateField as Parameters<typeof tx.team.update>[0]['data'],
      });

      // 3) Clear chipUsed on the TeamStage row
      await tx.teamStage.update({
        where: { teamId_stageId: { teamId: team.id, stageId: activeStage.id } },
        data: { chipUsed: null },
      });

      // 4) Audit
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'CHIP_CANCELLED',
          details: JSON.stringify({ chipId, stageName: activeStage.name }),
        },
      });
    }, { timeout: 15000 });

    return NextResponse.json({
      success: true,
      message: `${CHIP_META[chipId].name} cancelled. You can use it again later.`,
      chipId,
    });
  } catch (error) {
    console.error('Error cancelling chip:', error);
    return NextResponse.json({ error: 'Failed to cancel chip' }, { status: 500 });
  }
}
