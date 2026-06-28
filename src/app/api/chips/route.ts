import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import {
  parseActiveChips,
  serializeActiveChips,
  addActiveChip,
  removeActiveChip,
  legacyChipUsed,
  type ChipType,
} from '@/lib/chips-active';
import { parsePendingTransfers } from '@/lib/pending-transfers';
import { isAutoUnlimitedTransferStage } from '@/lib/wc-constants';

export const dynamic = 'force-dynamic';

const CHIP_META: Record<ChipType, { name: string; description: string }> = {
  WILDCARD_1: { name: 'Wildcard', description: 'Unlimited free transfers for this stage' },
  WILDCARD_2: { name: 'Wildcard 2', description: 'Second wildcard, unlocks in the knockout rounds' },
  TRIPLE_CAPTAIN: { name: 'Triple Captain', description: 'Captain scores 3x points this stage' },
  BENCH_BOOST: { name: 'Bench Boost', description: 'All bench players score points this stage' },
  FREE_HIT: { name: 'Free Hit', description: 'Unlimited transfers for one stage, squad reverts after' },
};

// Knockout stages unlock Wildcard 2. We hide WC2 from the chip array
// entirely until the user is at or past R32 so it doesn't show up as a
// "locked / coming soon" card during the group phase. The POST handler
// also rejects WC2 activation in non-knockout stages as a server-side
// safety net.
const KNOCKOUT_STAGE_IDS = new Set(['R32', 'R16', 'QF', 'SF', '3RD', 'F']);
function isKnockoutStage(stageId: string | undefined | null): boolean {
  return !!stageId && KNOCKOUT_STAGE_IDS.has(stageId);
}

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
  if (!deadline) return false;
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
        pendingTransfers: true,
      },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const activeStage = await prisma.stage.findFirst({
      where: { isActive: true },
      select: { id: true, stageId: true, name: true, deadlineTime: true, order: true },
    });

    // Parse the multi-chip array. `activeChips` is canonical; `activeChip`
    // is kept for any legacy single-chip UI surface.
    let activeChips: ChipType[] = [];
    if (activeStage) {
      const teamStage = await prisma.teamStage.findUnique({
        where: { teamId_stageId: { teamId: team.id, stageId: activeStage.id } },
        select: { chipsUsed: true, chipUsed: true },
      });
      // Prefer the new array column. Fall back to legacy single-chip if
      // we somehow loaded a row that predates the migration (e.g. an
      // older test fixture).
      activeChips = parseActiveChips(teamStage?.chipsUsed);
      if (activeChips.length === 0 && teamStage?.chipUsed) {
        activeChips = [teamStage.chipUsed as ChipType];
      }
    }

    const locked = stageIsLocked(activeStage?.deadlineTime);

    // Wildcard 1 specifically can only be cancelled if no transfers were made
    // under it in this stage (otherwise the user got free transfers for nothing).
    let wildcardHasTransfers = false;
    if (activeChips.includes('WILDCARD_1') && activeStage) {
      const wildcardTransferCount = await prisma.transfer.count({
        where: {
          teamId: team.id,
          stageId: activeStage.id,
          isWildcard: true,
        },
      });
      wildcardHasTransfers = wildcardTransferCount > 0;
    }

    // Determine if a given chip can be cancelled right now. Stacking-aware:
    // each chip cancels independently.
    const computeCancel = (chipId: ChipType): { canCancel: boolean; reason?: string } => {
      if (!activeChips.includes(chipId)) return { canCancel: false };
      if (locked) return { canCancel: false, reason: 'Stage has already started' };
      if (chipId === 'WILDCARD_1' && wildcardHasTransfers) {
        return { canCancel: false, reason: 'Cannot cancel \u2013 transfers already made under Wildcard' };
      }
      return { canCancel: true };
    };

    // Stacking is allowed: a chip is `available` if it hasn't been used
    // this tournament-phase (the `used` flag) AND we have an active stage
    // for FREE_HIT (which needs a stage to revert into). Notably we no
    // longer require `activeChip === null` — multiple chips can co-exist.
    const buildChip = (id: ChipType, used: boolean) => {
      const cancel = computeCancel(id);
      return {
        id,
        ...CHIP_META[id],
        used,
        available: !used && (id !== 'FREE_HIT' || activeStage !== null),
        active: activeChips.includes(id),
        canCancel: cancel.canCancel,
        cancelBlockedReason: cancel.reason,
      };
    };

    // Build the visible chip list. Each wildcard is scoped to one phase:
    // WC1 shows only in the group stage, WC2 only in the knockouts — so the
    // card always reads four (one wildcard + FH + TC + BB). An unused WC1 is
    // forfeited once the knockouts begin (it's the group-stage wildcard).
    const inKnockouts = isKnockoutStage(activeStage?.stageId);
    const chips = [
      ...(inKnockouts ? [] : [buildChip('WILDCARD_1', team.wildcard1Used)]),
      ...(inKnockouts ? [buildChip('WILDCARD_2', team.wildcard2Used)] : []),
      buildChip('FREE_HIT', team.freeHitUsed),
      buildChip('TRIPLE_CAPTAIN', team.tripleCaptainUsed),
      buildChip('BENCH_BOOST', team.benchBoostUsed),
    ];

    // Next-round Wildcard arming. Once the active round is locked, a Wildcard
    // (and only a Wildcard) can be armed for the upcoming round so the user
    // can queue unlimited free transfers now. We surface this as a separate
    // section so the existing chips array keeps meaning "current round".
    let nextRound: {
      stageId: string; name: string;
      whichWildcard: ChipType;
      armed: boolean; canArm: boolean; used: boolean;
      canCancel: boolean; queuedWildcardTransfers: number;
      autoUnlimited: boolean;
    } | null = null;
    if (locked && activeStage) {
      const next = await prisma.stage.findFirst({
        where: { order: { gt: activeStage.order }, isComplete: false },
        orderBy: { order: 'asc' },
        select: { id: true, stageId: true, name: true },
      });
      if (next) {
        const ts = await prisma.teamStage.findUnique({
          where: { teamId_stageId: { teamId: team.id, stageId: next.id } },
          select: { chipsUsed: true, chipUsed: true },
        });
        let armed = parseActiveChips(ts?.chipsUsed);
        if (armed.length === 0 && ts?.chipUsed) armed = [ts.chipUsed as ChipType];
        // WC2 in knockouts, WC1 otherwise.
        const which: ChipType = isKnockoutStage(next.stageId) ? 'WILDCARD_2' : 'WILDCARD_1';
        const used = which === 'WILDCARD_2' ? team.wildcard2Used : team.wildcard1Used;
        const isArmed = armed.includes(which);
        const queued = parsePendingTransfers(team.pendingTransfers).filter((t) => t.isWildcard).length;
        nextRound = {
          stageId: next.stageId,
          name: next.name,
          whichWildcard: which,
          armed: isArmed,
          canArm: !used && !isArmed,
          used,
          canCancel: isArmed && queued === 0,
          queuedWildcardTransfers: queued,
          // R32 gives everyone a free unlimited rebuild, so a Wildcard armed
          // for it is wasted — the client warns the user.
          autoUnlimited: isAutoUnlimitedTransferStage(next.stageId),
        };
      }
    }

    return NextResponse.json({
      chips,
      nextRound,
      // Legacy single-chip pointer for UIs that haven't been updated.
      activeChip: activeChips[0] ?? null,
      // Canonical multi-chip array. Surfaced as `activeChips` so consumers
      // can drive UI badges like "TC + BB" without re-parsing.
      activeChips,
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

    // Which stage does this chip apply to? Normally the active stage. But
    // once the active round has kicked off (locked), ONLY a Wildcard can
    // still be armed — and it arms for the NEXT round, so the unlimited free
    // transfers it grants can be queued now. Triple Captain / Bench Boost /
    // Free Hit stay locked until the next round actually opens (their effect
    // is purely in-round, so there's no planning benefit to pre-arming, and
    // Free Hit's snapshot/revert can't be expressed as queued transfers).
    const locked = stageIsLocked(activeStage.deadlineTime);
    let targetStage = activeStage;
    let armingNextRound = false;
    if (locked) {
      const isWildcard = chipId === 'WILDCARD_1' || chipId === 'WILDCARD_2';
      if (!isWildcard) {
        return NextResponse.json(
          { error: 'Only Wildcard can be armed while a round is being played. Other chips unlock when the next round opens.' },
          { status: 403 },
        );
      }
      const next = await prisma.stage.findFirst({
        where: { order: { gt: activeStage.order }, isComplete: false },
        orderBy: { order: 'asc' },
      });
      if (!next) {
        return NextResponse.json({ error: 'No upcoming round to arm a Wildcard for.' }, { status: 400 });
      }
      targetStage = next;
      armingNextRound = true;
    }

    if (chipId === 'WILDCARD_2') {
      if (!isKnockoutStage(targetStage.stageId)) {
        return NextResponse.json({ error: 'Wildcard 2 is only available in knockout stages' }, { status: 400 });
      }
    }
    // WC1 is the group-stage wildcard — reject it in the knockouts (symmetric
    // to the WC2 guard). Without this an unused WC1 could be played in a
    // knockout round, handing the user a second knockout wildcard.
    if (chipId === 'WILDCARD_1') {
      if (isKnockoutStage(targetStage.stageId)) {
        return NextResponse.json({ error: 'Wildcard 1 is only available in the group stage' }, { status: 400 });
      }
    }

    const existingTeamStage = await prisma.teamStage.findUnique({
      where: { teamId_stageId: { teamId: team.id, stageId: targetStage.id } },
      select: { chipsUsed: true, chipUsed: true },
    });

    // Stacking-aware: only block if THIS chip is already active in the
    // active stage. Other chips remaining active is fine.
    let currentChips = parseActiveChips(existingTeamStage?.chipsUsed);
    if (currentChips.length === 0 && existingTeamStage?.chipUsed) {
      currentChips = [existingTeamStage.chipUsed as ChipType];
    }
    if (currentChips.includes(chipId)) {
      return NextResponse.json({ error: 'That chip is already active for this stage' }, { status: 400 });
    }

    // Free Hit needs a full snapshot of the squad + budget + transfer counts
    // so we can restore everything at the end of the stage (auto-revert in
    // /api/squad/get and in lib/stage-advance.maybeAdvanceStage).
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

    const nextChips = addActiveChip(currentChips, chipId);
    const nextChipsUsed = serializeActiveChips(nextChips);
    const nextLegacyChip = legacyChipUsed(nextChips);

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
        where: { teamId_stageId: { teamId: team.id, stageId: targetStage.id } },
        create: {
          teamId: team.id,
          stageId: targetStage.id,
          chipUsed: nextLegacyChip,
          chipsUsed: nextChipsUsed,
        },
        update: {
          chipUsed: nextLegacyChip,
          chipsUsed: nextChipsUsed,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'CHIP_ACTIVATED',
          details: JSON.stringify({
            chipId,
            stageName: targetStage.name,
            stackedWith: currentChips,
            armedForNextRound: armingNextRound,
          }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: armingNextRound
        ? `${CHIP_META[chipId].name} armed for ${targetStage.name} — queue unlimited free transfers now.`
        : `${CHIP_META[chipId].name} activated!`,
      chipId,
      armedForNextRound: armingNextRound,
      activeChips: nextChips,
    });
  } catch (error) {
    console.error('Error activating chip:', error);
    return NextResponse.json({ error: 'Failed to activate chip' }, { status: 500 });
  }
}

/**
 * Cancel a currently-active chip. With stacking, callers must specify
 * WHICH chip to cancel via `?chipId=XXX` in the URL or `{ chipId }` in the
 * body. If no chipId is provided AND only one chip is active, we cancel
 * that one (preserves the old single-chip API contract).
 *
 * Only allowed before the active stage's deadline. For Free Hit, the
 * snapshot is fully restored. For Wildcard, cancellation is blocked if
 * any transfers were already made under it.
 */
export async function DELETE(request: NextRequest) {
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

    // While the active round is locked, the only cancellable chip is a
    // Wildcard armed for the NEXT round (mirrors the POST arming path).
    // Everything else stays locked until that round opens.
    const locked = stageIsLocked(activeStage.deadlineTime);
    let targetStage = activeStage;
    if (locked) {
      const next = await prisma.stage.findFirst({
        where: { order: { gt: activeStage.order }, isComplete: false },
        orderBy: { order: 'asc' },
      });
      if (!next) {
        return NextResponse.json({ error: 'Stage has started \u2013 chips can no longer be cancelled' }, { status: 400 });
      }
      targetStage = next;
    }

    const teamStage = await prisma.teamStage.findUnique({
      where: { teamId_stageId: { teamId: team.id, stageId: targetStage.id } },
    });

    const currentChips = parseActiveChips(teamStage?.chipsUsed);
    // Fallback for rows still on the legacy single-chip column
    if (currentChips.length === 0 && teamStage?.chipUsed) {
      currentChips.push(teamStage.chipUsed as ChipType);
    }

    if (currentChips.length === 0) {
      return NextResponse.json({ error: 'No active chip to cancel' }, { status: 400 });
    }

    // Figure out which chip to cancel. Accept it from query string
    // (?chipId=) or from JSON body. If absent and exactly one chip is
    // active, default to that one.
    const url = new URL(request.url);
    const queryChipId = url.searchParams.get('chipId') as ChipType | null;
    let bodyChipId: ChipType | null = null;
    try {
      // request.body might be empty for a "cancel my only chip" call
      const body = await request.clone().json().catch(() => null);
      if (body && typeof body === 'object' && body !== null && 'chipId' in body) {
        bodyChipId = (body as { chipId?: ChipType }).chipId ?? null;
      }
    } catch {
      // empty body is fine
    }

    let chipId: ChipType | null = queryChipId ?? bodyChipId;
    if (!chipId) {
      if (currentChips.length === 1) {
        chipId = currentChips[0];
      } else {
        return NextResponse.json({
          error: 'Multiple chips active \u2013 specify which one to cancel via ?chipId=',
          activeChips: currentChips,
        }, { status: 400 });
      }
    }

    if (!currentChips.includes(chipId)) {
      return NextResponse.json({ error: `${chipId} is not active for this stage` }, { status: 400 });
    }

    // While arming the next round, only a Wildcard can be cancelled.
    if (locked && chipId !== 'WILDCARD_1' && chipId !== 'WILDCARD_2') {
      return NextResponse.json({ error: 'Only a next-round Wildcard can be cancelled while a round is being played.' }, { status: 400 });
    }

    // Wildcard cancel safety: refuse if transfers were already made under it.
    // A live wildcard records Transfer rows; a next-round wildcard records
    // queued entries on Team.pendingTransfers (no Transfer rows until apply).
    if (chipId === 'WILDCARD_1' || chipId === 'WILDCARD_2') {
      let wildcardTransfers = 0;
      if (locked) {
        wildcardTransfers = parsePendingTransfers(team.pendingTransfers).filter((t) => t.isWildcard).length;
      } else {
        wildcardTransfers = await prisma.transfer.count({
          where: { teamId: team.id, stageId: targetStage.id, isWildcard: true },
        });
      }
      if (wildcardTransfers > 0) {
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
        return NextResponse.json({
          error: 'Free Hit snapshot is corrupt \u2013 contact support to restore your team.',
        }, { status: 500 });
      }
    }

    const nextChips = removeActiveChip(currentChips, chipId);
    const nextChipsUsed = serializeActiveChips(nextChips);
    const nextLegacyChip = legacyChipUsed(nextChips);

    // 15s timeout (default is 5s) – Neon's pooler adds latency per query and
    // the Free Hit revert touches 15 squad rows + team + teamStage + audit.
    await prisma.$transaction(async (tx) => {
      const updateField: Record<string, boolean | string | null | number> = {};
      if (chipId === 'WILDCARD_1') updateField.wildcard1Used = false;
      if (chipId === 'WILDCARD_2') updateField.wildcard2Used = false;
      if (chipId === 'TRIPLE_CAPTAIN') updateField.tripleCaptainUsed = false;
      if (chipId === 'BENCH_BOOST') updateField.benchBoostUsed = false;
      if (chipId === 'FREE_HIT') {
        updateField.freeHitUsed = false;
        updateField.freeHitSnapshot = null;
      }

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

      await tx.teamStage.update({
        where: { teamId_stageId: { teamId: team.id, stageId: targetStage.id } },
        data: {
          chipUsed: nextLegacyChip,
          chipsUsed: nextChipsUsed,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'CHIP_CANCELLED',
          details: JSON.stringify({
            chipId,
            stageName: targetStage.name,
            remainingChips: nextChips,
          }),
        },
      });
    }, { timeout: 15000 });

    return NextResponse.json({
      success: true,
      message: `${CHIP_META[chipId].name} cancelled. You can use it again later.`,
      chipId,
      activeChips: nextChips,
    });
  } catch (error) {
    console.error('Error cancelling chip:', error);
    return NextResponse.json({ error: 'Failed to cancel chip' }, { status: 500 });
  }
}
