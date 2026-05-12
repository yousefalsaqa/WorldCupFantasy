// ============================================
// Shared helper used by both the live cron route and admin tooling
// (match simulator) to finalize a match: read PlayerPerformance rows,
// add their totalPoints to every SquadPlayer that owns the player, and
// bump Team.totalPoints with the per-team contribution.
//
// Captain / chip mechanics applied here:
//   - Captain by default doubles points (x2).
//   - TRIPLE_CAPTAIN active in the match's stage TeamStage → x3 instead.
//   - BENCH_BOOST active → bench players (isStarting=false) also count.
//   - Otherwise only `isStarting=true` players contribute.
//
// We also expose `rollbackSquadPoints(matchId)` — the exact inverse, so
// the match simulator's Reset action can undo a previously-banked
// Finish. The math is shared (`computeTeamContribution`) so update and
// rollback can never drift.
//
// IMPORTANT: `updateSquadPoints` should only be called once per match
// (when the match transitions to FT). Calling it twice will double-count.
// The /api/live/update route guards this by only calling it inside the
// `if (isFinished)` branch. The simulator guards by disabling Finish
// when the match is already Finished.
// ============================================

import { prisma } from './db';
import {
  parseActiveChips,
  hasTripleCaptain,
  hasBenchBoost,
  type ChipType,
} from './chips-active';

interface PerformanceLike {
  playerId: string;
  totalPoints: number;
}
interface SquadPlayerLike {
  isStarting: boolean;
  isCaptain: boolean;
  player: { performances: PerformanceLike[] };
}

/**
 * Compute a single team's contribution to its `totalPoints` for this
 * match, given the team's squad rows (with the player's performance row
 * loaded for this match) and the chip set active for the team in the
 * match's stage. Shared between `updateSquadPoints` and
 * `rollbackSquadPoints` so the math is impossible to get out of sync.
 *
 * Returns the absolute (positive) point value. Callers decide whether
 * to add it (update) or subtract it (rollback).
 */
function computeTeamContribution(
  squadPlayers: SquadPlayerLike[],
  activeChips: ChipType[],
): number {
  const captainMultiplier = hasTripleCaptain(activeChips) ? 3 : 2;
  const includeBench = hasBenchBoost(activeChips);

  let total = 0;
  for (const sp of squadPlayers) {
    const perf = sp.player.performances[0];
    if (!perf) continue;
    let points = perf.totalPoints;
    if (sp.isCaptain) points *= captainMultiplier;
    if (sp.isStarting || includeBench) total += points;
  }
  return total;
}

/**
 * Load every team that owns at least one player with a performance row
 * for this match, plus map each team to its active chip set in the
 * match's stage. Used by both update and rollback so they iterate over
 * the same set of teams.
 */
async function loadTeamsForMatch(matchId: string, stageId: string) {
  const teamsWithPlayers = await prisma.team.findMany({
    include: {
      squadPlayers: {
        where: {
          player: { performances: { some: { matchId } } },
        },
        include: {
          player: {
            include: { performances: { where: { matchId } } },
          },
        },
      },
    },
  });

  const teamIds = teamsWithPlayers.map((t) => t.id);
  const teamStages = teamIds.length > 0
    ? await prisma.teamStage.findMany({
        where: { stageId, teamId: { in: teamIds } },
        select: { teamId: true, chipsUsed: true, chipUsed: true },
      })
    : [];

  const chipsByTeam = new Map<string, ChipType[]>();
  for (const ts of teamStages) {
    let chips = parseActiveChips(ts.chipsUsed);
    if (chips.length === 0 && ts.chipUsed) {
      chips = [ts.chipUsed as ChipType];
    }
    chipsByTeam.set(ts.teamId, chips);
  }

  return { teamsWithPlayers, chipsByTeam };
}

/**
 * Finalize a match: increment SquadPlayer.points across all owners and
 * bump Team.totalPoints with the captain-mult / bench-boost adjusted
 * starting-XI sum. Call exactly once when the match transitions to FT.
 */
export async function updateSquadPoints(matchId: string): Promise<void> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { stageId: true },
  });
  if (!match) return;

  const performances = await prisma.playerPerformance.findMany({
    where: { matchId },
  });
  for (const perf of performances) {
    await prisma.squadPlayer.updateMany({
      where: { playerId: perf.playerId },
      data: { points: { increment: perf.totalPoints } },
    });
  }

  const { teamsWithPlayers, chipsByTeam } = await loadTeamsForMatch(
    matchId,
    match.stageId,
  );

  for (const team of teamsWithPlayers) {
    const contribution = computeTeamContribution(
      team.squadPlayers,
      chipsByTeam.get(team.id) ?? [],
    );
    if (contribution === 0) continue;
    await prisma.team.update({
      where: { id: team.id },
      data: { totalPoints: { increment: contribution } },
    });
  }
}

/**
 * Inverse of `updateSquadPoints`: subtract the points this match
 * contributed to SquadPlayer.points + Team.totalPoints. Used by the
 * match simulator's Reset action so admins can re-run a previously-
 * Finished match without phantom points sticking around.
 *
 * Idempotent considerations: the caller must verify the match has
 * already been Finished (otherwise there's nothing to roll back and
 * this would create negative points). The match simulator gates the
 * rollback behind `match.isFinished` for this reason.
 *
 * NOTE: This reads the SAME chip set the team had when the match was
 * finalized. If the user activated/cancelled chips between Finish and
 * Reset, the rollback math could be slightly off. In practice the
 * simulator is admin-only and chip changes between F → R are rare,
 * but worth knowing. A future improvement is to snapshot the chip
 * set at Finish time on PlayerPerformance.
 */
export async function rollbackSquadPoints(matchId: string): Promise<void> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { stageId: true },
  });
  if (!match) return;

  // Mirror updateSquadPoints in REVERSE — decrement SquadPlayer.points
  // by what the perf rows added, then decrement Team.totalPoints by the
  // same chip-adjusted contribution.
  const performances = await prisma.playerPerformance.findMany({
    where: { matchId },
  });
  for (const perf of performances) {
    await prisma.squadPlayer.updateMany({
      where: { playerId: perf.playerId },
      data: { points: { decrement: perf.totalPoints } },
    });
  }

  const { teamsWithPlayers, chipsByTeam } = await loadTeamsForMatch(
    matchId,
    match.stageId,
  );

  for (const team of teamsWithPlayers) {
    const contribution = computeTeamContribution(
      team.squadPlayers,
      chipsByTeam.get(team.id) ?? [],
    );
    if (contribution === 0) continue;
    await prisma.team.update({
      where: { id: team.id },
      data: { totalPoints: { decrement: contribution } },
    });
  }
}

// Re-exported so tests can verify the math without touching Prisma.
export const __internal = { computeTeamContribution };
