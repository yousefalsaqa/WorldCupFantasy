// ============================================
// Shared helper used by both the live cron route and admin tooling
// (match simulator) to finalize a match: read PlayerPerformance rows,
// add their totalPoints to every SquadPlayer that owns the player, and
// bump Team.totalPoints with the captain-doubled starting-XI sum.
//
// IMPORTANT: This function should only be called once per match (when
// the match transitions to FT). Calling it twice will double-count
// points into SquadPlayer.points. The /api/live/update route guards
// this by only calling it inside the `if (isFinished)` branch.
// ============================================

import { prisma } from './db';

export async function updateSquadPoints(matchId: string): Promise<void> {
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

  for (const team of teamsWithPlayers) {
    let stagePoints = 0;
    for (const sp of team.squadPlayers) {
      const perf = sp.player.performances[0];
      if (!perf) continue;
      let points = perf.totalPoints;
      if (sp.isCaptain) points *= 2;
      if (sp.isStarting) stagePoints += points;
    }
    await prisma.team.update({
      where: { id: team.id },
      data: { totalPoints: { increment: stagePoints } },
    });
  }
}
