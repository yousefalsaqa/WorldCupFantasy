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
// IMPORTANT: This function should only be called once per match (when
// the match transitions to FT). Calling it twice will double-count
// points into SquadPlayer.points. The /api/live/update route guards
// this by only calling it inside the `if (isFinished)` branch.
// ============================================

import { prisma } from './db';
import {
  parseActiveChips,
  hasTripleCaptain,
  hasBenchBoost,
  type ChipType,
} from './chips-active';

export async function updateSquadPoints(matchId: string): Promise<void> {
  // Need the match's stage so we can look up each team's active chips
  // for that stage. Note: chips are keyed by (teamId, stageId), so two
  // different matches in the same stage both consult the same TeamStage row.
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { stageId: true },
  });
  if (!match) return;

  const performances = await prisma.playerPerformance.findMany({
    where: { matchId },
    include: { player: true },
  });

  for (const perf of performances) {
    await prisma.squadPlayer.updateMany({
      where: { playerId: perf.playerId },
      data: { points: { increment: perf.totalPoints } },
    });
  }

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

  // Pre-fetch every relevant TeamStage row in a single query so the per-team
  // loop below doesn't hit the DB N times. Some teams may not have a
  // TeamStage row for this stage yet (they never activated a chip), which
  // is fine — they default to no-chip behaviour.
  const teamIds = teamsWithPlayers.map((t) => t.id);
  const teamStages = teamIds.length > 0
    ? await prisma.teamStage.findMany({
        where: { stageId: match.stageId, teamId: { in: teamIds } },
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

  for (const team of teamsWithPlayers) {
    const activeChips = chipsByTeam.get(team.id) ?? [];
    const captainMultiplier = hasTripleCaptain(activeChips) ? 3 : 2;
    const includeBench = hasBenchBoost(activeChips);

    let stagePoints = 0;
    for (const sp of team.squadPlayers) {
      const perf = sp.player.performances[0];
      if (!perf) continue;
      let points = perf.totalPoints;
      if (sp.isCaptain) points *= captainMultiplier;
      // Default: only starters count. With Bench Boost, bench counts too.
      if (sp.isStarting || includeBench) stagePoints += points;
    }
    await prisma.team.update({
      where: { id: team.id },
      data: { totalPoints: { increment: stagePoints } },
    });
  }
}
