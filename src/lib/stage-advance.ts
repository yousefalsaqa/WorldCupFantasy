// ============================================
// Auto stage advancement
//
// When the currently-active Stage has every Match `isFinished=true`, this
// helper:
//   1. Reverts any active Free Hit snapshots for the stage about to close
//      (restores pre-FH squad + bank + transfer counts).
//   2. Flips the current stage to `isComplete=true, isActive=false`.
//   3. Flips the NEXT stage to `isActive=true`.
//   4. Resets `Team.freeTransfers` per `TRANSFERS[nextStageKey]` for every
//      team, and zeros `transfersUsed`. Applies the mercy rule when a
//      team has more eliminated players than free transfers.
//   5. Refreshes per-stage chips when transitioning GR3 → R32 (FPL
//      convention: a fresh set of chips for the knockout phase). The
//      "stack any chip in any stage" rule the user signed off on is
//      enforced inside `/api/chips/route.ts`; this function just makes
//      sure the chips become AVAILABLE again at the right moment.
//   6. Writes an AuditLog entry so admins can see when/why the flip
//      happened.
//
// The function is idempotent: if no stage is currently active, or the
// active stage still has un-finished matches, it returns
// `{ advanced: false }` without writing.
//
// It also LOOPS up to `STAGE_COUNT` times in case multiple stages can
// advance in a single pass (e.g. a backfill of all-finished matches).
// In practice the cron will run after every match FT so the loop body
// usually executes 0 or 1 times.
// ============================================

import { prisma } from './db';
import { TRANSFERS } from './wc-constants';

const STAGE_COUNT = 9;

// Maps a STAGE id (the stable string like 'R32') to the
// `TRANSFERS[key]` allocation that applies *as the user enters that stage*.
// E.g. when GR1 finishes and we activate GR2, every team gets `GROUP_ROUND_2`
// free transfers.
const TRANSFERS_FOR_STAGE: Record<string, number> = {
  GR1: 2,
  GR2: TRANSFERS.GROUP_ROUND_2,
  GR3: TRANSFERS.GROUP_ROUND_3,
  R32: TRANSFERS.AFTER_R32,
  R16: TRANSFERS.AFTER_R16,
  QF: TRANSFERS.AFTER_QF,
  SF: TRANSFERS.AFTER_SF,
  '3RD': TRANSFERS.AFTER_SF,
  F: TRANSFERS.AFTER_SF,
};

// Stage IDs in the knockout half of the bracket. Entering any of these
// triggers a "chip refresh" pass (TC / BB / FH become available again so
// the user can use them across the knockout phase, on top of WC2 which
// unlocks at R32). WC1 is intentionally NOT refreshed — it's the "group
// stage" wildcard; WC2 is the "knockout" wildcard.
const KNOCKOUT_STAGE_IDS = new Set(['R32', 'R16', 'QF', 'SF', '3RD', 'F']);

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
  bankBalance: number;
  teamValue: number;
  freeTransfers: number;
  transfersUsed: number;
  players: FreeHitSnapshotPlayer[];
}

export interface AdvanceResult {
  advanced: boolean;
  from?: string;        // stageId we just closed (e.g. 'GR1')
  to?: string;          // stageId we just activated (e.g. 'GR2')
  freeHitsReverted?: number;
  teamsReset?: number;
  chipsRefreshed?: boolean;
  reason?: string;      // when advanced=false, why
}

/**
 * Check whether the currently-active stage is complete and, if so, perform
 * the full advance. Safe to call repeatedly; the first call after the last
 * match FTs will do the work, subsequent calls return `{ advanced: false }`.
 *
 * Returns the FIRST advance's metadata for caller logging. Cascading
 * advances (rare; usually only when backfilling) are also performed but
 * not surfaced individually — the audit log captures each transition.
 */
export async function maybeAdvanceStage(): Promise<AdvanceResult> {
  let firstResult: AdvanceResult | null = null;

  // Cap the loop at the total stage count so a corrupted DB (e.g. multiple
  // isActive stages somehow) can't spin forever.
  for (let i = 0; i < STAGE_COUNT; i++) {
    const step = await advanceOnce();
    if (!step.advanced) {
      // Return either the first successful advance (if any) or this
      // "nothing to do" result.
      return firstResult ?? step;
    }
    if (!firstResult) firstResult = step;
  }

  return firstResult ?? { advanced: false, reason: 'stage-count-cap-hit' };
}

async function advanceOnce(): Promise<AdvanceResult> {
  const activeStage = await prisma.stage.findFirst({
    where: { isActive: true },
    select: { id: true, stageId: true, name: true, order: true },
  });
  if (!activeStage) return { advanced: false, reason: 'no-active-stage' };

  // Are all matches in this stage finished? We use count() so we don't
  // pull match rows we won't use. Stages with zero matches in the DB are
  // intentionally NOT advanced (likely a misconfigured stage; we'd rather
  // sit and wait than silently skip past a real stage).
  const [totalMatches, finishedMatches] = await Promise.all([
    prisma.match.count({ where: { stageId: activeStage.id } }),
    prisma.match.count({ where: { stageId: activeStage.id, isFinished: true } }),
  ]);

  if (totalMatches === 0) {
    return {
      advanced: false,
      reason: 'no-matches-in-stage',
      from: activeStage.stageId,
    };
  }
  if (finishedMatches < totalMatches) {
    return {
      advanced: false,
      reason: 'stage-still-in-progress',
      from: activeStage.stageId,
    };
  }

  // Find the next stage by `order`. If none exists, we just close the
  // current stage (tournament over).
  const nextStage = await prisma.stage.findFirst({
    where: { order: { gt: activeStage.order } },
    orderBy: { order: 'asc' },
    select: { id: true, stageId: true, name: true },
  });

  const isEnteringKnockouts = nextStage !== null && KNOCKOUT_STAGE_IDS.has(nextStage.stageId);
  // FPL convention: each chip is a one-shot per "phase". When entering the
  // knockout phase, we re-grant TC / BB / FH so the user gets a fresh set
  // for the knockouts (WC2 was already available as of R32; WC1 stays
  // consumed since it's the group-stage wildcard).
  const refreshChips = isEnteringKnockouts;

  // 1) Revert any active Free Hit snapshots before resetting transfer
  // counts — otherwise the snapshot would restore the OLD freeTransfers
  // and undo the new allocation we're about to write.
  let freeHitsReverted = 0;
  const teamsWithSnapshots = await prisma.team.findMany({
    where: { freeHitSnapshot: { not: null } },
    select: { id: true, freeHitSnapshot: true },
  });
  for (const team of teamsWithSnapshots) {
    if (!team.freeHitSnapshot) continue;
    let snapshot: FreeHitSnapshot | null = null;
    try {
      snapshot = JSON.parse(team.freeHitSnapshot);
    } catch {
      // Clear corrupt snapshots so we don't loop forever
      await prisma.team.update({
        where: { id: team.id },
        data: { freeHitSnapshot: null },
      });
      continue;
    }
    if (!snapshot) continue;
    // Only revert snapshots whose activation stage matches the one we're
    // closing — otherwise a snapshot for a FUTURE stage would be wiped
    // prematurely. (In practice FH only ever targets the active stage,
    // but be safe.)
    if (snapshot.stageId !== activeStage.id) continue;

    await prisma.$transaction(async (tx) => {
      await tx.squadPlayer.deleteMany({ where: { teamId: team.id } });
      await tx.squadPlayer.createMany({
        data: snapshot.players.map((p) => ({
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
      await tx.team.update({
        where: { id: team.id },
        data: {
          bankBalance: snapshot.bankBalance,
          teamValue: snapshot.teamValue,
          freeTransfers: snapshot.freeTransfers,
          transfersUsed: snapshot.transfersUsed,
          freeHitSnapshot: null,
        },
      });
    }, { timeout: 15000 });
    freeHitsReverted += 1;
  }

  // 2) Flip the stages. Done in a single transaction so the system never
  // observes a state with zero active stages OR two active stages.
  await prisma.$transaction(async (tx) => {
    await tx.stage.update({
      where: { id: activeStage.id },
      data: { isActive: false, isComplete: true },
    });
    if (nextStage) {
      await tx.stage.update({
        where: { id: nextStage.id },
        data: { isActive: true },
      });
    }
  });

  // 3) Reset transfer allocations + apply mercy rule + (optionally)
  // refresh chips. If there's no next stage we still want to zero
  // `transfersUsed` so the final-stage points reset cleanly.
  let teamsReset = 0;
  if (nextStage) {
    const baseAllocation = TRANSFERS_FOR_STAGE[nextStage.stageId] ?? TRANSFERS.GROUP_ROUND_1;

    // Pre-compute per-team mercy data: count the eliminated players in
    // each team's current squad (after any FH revert above) so we can
    // bump their transfer allocation in a single update batch.
    const teams = await prisma.team.findMany({
      select: {
        id: true,
        squadPlayers: {
          select: {
            player: {
              select: { nation: { select: { isEliminated: true } } },
            },
          },
        },
      },
    });

    for (const team of teams) {
      const eliminatedCount = team.squadPlayers.filter(
        (sp) => sp.player.nation?.isEliminated,
      ).length;

      let freeTransfers = baseAllocation;
      let mercyApplied = false;
      if (TRANSFERS.MERCY_RULE_ENABLED && eliminatedCount > baseAllocation) {
        freeTransfers = eliminatedCount;
        mercyApplied = true;
      }

      // Build the team update. Refresh per-stage chips when entering
      // knockouts. WC1 stays consumed — it's the group-stage wildcard.
      const teamUpdate: Record<string, number | boolean> = {
        freeTransfers,
        transfersUsed: 0,
      };
      if (refreshChips) {
        teamUpdate.tripleCaptainUsed = false;
        teamUpdate.benchBoostUsed = false;
        teamUpdate.freeHitUsed = false;
      }

      await prisma.team.update({
        where: { id: team.id },
        data: teamUpdate,
      });

      // Stamp mercy info on the TeamStage row for the stage we just closed,
      // so the history page / audit can show "you got N mercy transfers".
      // Upsert because some teams may never have activated a chip in this
      // stage and therefore have no TeamStage row yet.
      await prisma.teamStage.upsert({
        where: { teamId_stageId: { teamId: team.id, stageId: activeStage.id } },
        create: {
          teamId: team.id,
          stageId: activeStage.id,
          eliminatedCount,
          mercyTransfers: mercyApplied ? eliminatedCount - baseAllocation : 0,
        },
        update: {
          eliminatedCount,
          mercyTransfers: mercyApplied ? eliminatedCount - baseAllocation : 0,
        },
      });

      teamsReset += 1;
    }
  }

  // 4) Audit log entry so admins can see the transition. We log against
  // `userId: null` because this is a system-triggered event, not a
  // specific user action.
  await prisma.auditLog.create({
    data: {
      userId: null,
      action: 'STAGE_AUTO_ADVANCED',
      details: JSON.stringify({
        from: activeStage.stageId,
        fromName: activeStage.name,
        to: nextStage?.stageId ?? null,
        toName: nextStage?.name ?? null,
        finishedMatches,
        freeHitsReverted,
        teamsReset,
        chipsRefreshed: refreshChips,
        mercyRuleEnabled: TRANSFERS.MERCY_RULE_ENABLED,
      }),
    },
  });

  return {
    advanced: true,
    from: activeStage.stageId,
    to: nextStage?.stageId ?? undefined,
    freeHitsReverted,
    teamsReset,
    chipsRefreshed: refreshChips,
  };
}
