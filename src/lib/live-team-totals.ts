// ============================================
// Live team-total preview.
//
// Banked points (Team.totalPoints) only move at FT when updateSquadPoints
// runs. While a match is in progress the league table and team-view header
// would otherwise sit frozen even though the per-player pills tick up.
// This helper computes each team's IN-PROGRESS delta from isLive
// PlayerPerformance rows, applying the exact same rules as banking
// (squad-points.ts # computeTeamContribution):
//
//   - starters only, unless BENCH_BOOST is active (then bench counts)
//   - captain x2, or x3 when TRIPLE_CAPTAIN is active
//   - late-gated teams (first complete squad save at/after the stage
//     deadline) earn nothing this stage, so their delta is 0
//
// Because the delta covers exactly the rows that flip isLive=false and
// get banked at FT, `totalPoints + delta` lands on the same number the
// banked total becomes — the display never jumps at full time.
//
// READ-ONLY: display layer only. Never writes; banking stays the single
// source of truth.
// ============================================

import { prisma } from './db';
import {
  parseActiveChips,
  hasTripleCaptain,
  hasBenchBoost,
  type ChipType,
} from './chips-active';

/** Map of teamId → in-progress points delta. Teams without live players
 * are simply absent (treat as 0). */
export async function liveTeamDeltas(teamIds: string[]): Promise<Map<string, number>> {
  const deltas = new Map<string, number>();
  if (teamIds.length === 0) return deltas;

  // In-progress rows only exist while a match is live; banked rows have
  // isLive=false, so summing these can never double-count.
  const livePerfs = await prisma.playerPerformance.findMany({
    where: { isLive: true },
    select: { playerId: true, totalPoints: true },
  });
  if (livePerfs.length === 0) return deltas;

  const liveByPlayer = new Map<string, number>();
  for (const p of livePerfs) {
    liveByPlayer.set(p.playerId, (liveByPlayer.get(p.playerId) ?? 0) + p.totalPoints);
  }

  // Live matches always belong to the active stage — that's where chips
  // and the late-joiner deadline gate live.
  const stage = await prisma.stage.findFirst({
    where: { isActive: true },
    select: { id: true, deadlineTime: true },
  });

  const squadRows = await prisma.squadPlayer.findMany({
    where: { teamId: { in: teamIds }, playerId: { in: Array.from(liveByPlayer.keys()) } },
    select: { teamId: true, playerId: true, isStarting: true, isCaptain: true },
  });
  if (squadRows.length === 0) return deltas;

  // Same late rule as squad-points#getLateTeamIds: (firstSquadSavedAt ??
  // createdAt) >= deadline → no points this stage.
  let lateTeams = new Set<string>();
  if (stage?.deadlineTime) {
    const late = await prisma.team.findMany({
      where: {
        id: { in: teamIds },
        OR: [
          { firstSquadSavedAt: { gte: stage.deadlineTime } },
          { firstSquadSavedAt: null, createdAt: { gte: stage.deadlineTime } },
        ],
      },
      select: { id: true },
    });
    lateTeams = new Set(late.map((t) => t.id));
  }

  const chipsByTeam = new Map<string, ChipType[]>();
  if (stage) {
    const teamStages = await prisma.teamStage.findMany({
      where: { stageId: stage.id, teamId: { in: teamIds } },
      select: { teamId: true, chipsUsed: true, chipUsed: true },
    });
    for (const ts of teamStages) {
      let chips = parseActiveChips(ts.chipsUsed);
      if (chips.length === 0 && ts.chipUsed) chips = [ts.chipUsed as ChipType];
      chipsByTeam.set(ts.teamId, chips);
    }
  }

  for (const row of squadRows) {
    if (lateTeams.has(row.teamId)) continue;
    const chips = chipsByTeam.get(row.teamId) ?? [];
    // Mirror computeTeamContribution: multiplier first, then the
    // starting/bench-boost inclusion check.
    let pts = liveByPlayer.get(row.playerId) ?? 0;
    if (row.isCaptain) pts *= hasTripleCaptain(chips) ? 3 : 2;
    if (row.isStarting || hasBenchBoost(chips)) {
      deltas.set(row.teamId, (deltas.get(row.teamId) ?? 0) + pts);
    }
  }
  return deltas;
}

/**
 * Each team's TOTAL points for a single stage (banked + in-progress), used for
 * the "this round" column in league standings. Same rules as banking /
 * liveTeamDeltas (starters only unless Bench Boost, captain x2/x3, late-gated
 * teams earn 0), but summed over EVERY PlayerPerformance in the stage's
 * matches rather than only the live ones. Scalable: pass the active stage and
 * it computes that round; prior rounds are already folded into Team.totalPoints
 * by banking, so this never double-counts the cumulative total.
 *
 * READ-ONLY: display layer only.
 */
export async function stageTeamTotals(teamIds: string[], stageId: string): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (teamIds.length === 0) return totals;

  const matches = await prisma.match.findMany({ where: { stageId }, select: { id: true } });
  const matchIds = matches.map((m) => m.id);
  if (matchIds.length === 0) return totals;

  const perfs = await prisma.playerPerformance.findMany({
    where: { matchId: { in: matchIds } },
    select: { playerId: true, totalPoints: true },
  });
  if (perfs.length === 0) return totals;
  const byPlayer = new Map<string, number>();
  for (const p of perfs) byPlayer.set(p.playerId, (byPlayer.get(p.playerId) ?? 0) + p.totalPoints);

  const stage = await prisma.stage.findUnique({ where: { id: stageId }, select: { deadlineTime: true } });

  const squadRows = await prisma.squadPlayer.findMany({
    where: { teamId: { in: teamIds }, playerId: { in: Array.from(byPlayer.keys()) } },
    select: { teamId: true, playerId: true, isStarting: true, isCaptain: true },
  });
  if (squadRows.length === 0) return totals;

  let lateTeams = new Set<string>();
  if (stage?.deadlineTime) {
    const late = await prisma.team.findMany({
      where: {
        id: { in: teamIds },
        OR: [
          { firstSquadSavedAt: { gte: stage.deadlineTime } },
          { firstSquadSavedAt: null, createdAt: { gte: stage.deadlineTime } },
        ],
      },
      select: { id: true },
    });
    lateTeams = new Set(late.map((t) => t.id));
  }

  const chipsByTeam = new Map<string, ChipType[]>();
  const teamStages = await prisma.teamStage.findMany({
    where: { stageId, teamId: { in: teamIds } },
    select: { teamId: true, chipsUsed: true, chipUsed: true },
  });
  for (const ts of teamStages) {
    let chips = parseActiveChips(ts.chipsUsed);
    if (chips.length === 0 && ts.chipUsed) chips = [ts.chipUsed as ChipType];
    chipsByTeam.set(ts.teamId, chips);
  }

  for (const row of squadRows) {
    if (lateTeams.has(row.teamId)) continue;
    const chips = chipsByTeam.get(row.teamId) ?? [];
    let pts = byPlayer.get(row.playerId) ?? 0;
    if (row.isCaptain) pts *= hasTripleCaptain(chips) ? 3 : 2;
    if (row.isStarting || hasBenchBoost(chips)) {
      totals.set(row.teamId, (totals.get(row.teamId) ?? 0) + pts);
    }
  }
  return totals;
}
