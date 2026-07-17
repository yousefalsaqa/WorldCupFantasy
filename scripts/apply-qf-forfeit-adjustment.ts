// ONE-TIME WRITE: forfeit joke for "the bois" private league.
// +15 to thebestsaqa's QF stage points, -50 to omar.sn's Team's QF stage
// points, so omar.sn's Team lands last for the QF round. Flat one-time
// deltas on the QF TeamStage row + Team.totalPoints only — no players,
// squads, or other stages touched, so this never recurs next round.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ADJUSTMENTS: { teamName: string; delta: number }[] = [
  { teamName: 'thebestsaqa', delta: 15 },
  { teamName: "omar.sn's Team", delta: -50 },
];

async function main() {
  const qf = await prisma.stage.findFirst({ where: { stageId: 'QF' }, select: { id: true } });
  if (!qf) throw new Error('QF stage not found');

  for (const { teamName, delta } of ADJUSTMENTS) {
    const team = await prisma.team.findFirst({
      where: { name: teamName },
      select: { id: true, userId: true, totalPoints: true },
    });
    if (!team) { console.log(`SKIP: team "${teamName}" not found`); continue; }

    const ts = await prisma.teamStage.findFirst({
      where: { teamId: team.id, stageId: qf.id },
      select: { id: true, rawPoints: true, totalPoints: true },
    });
    if (!ts) { console.log(`SKIP: no QF TeamStage row for "${teamName}"`); continue; }

    const before = { teamTotalPoints: team.totalPoints, tsRawPoints: ts.rawPoints, tsTotalPoints: ts.totalPoints };

    const updatedTs = await prisma.teamStage.update({
      where: { id: ts.id },
      data: { rawPoints: ts.rawPoints + delta, totalPoints: ts.totalPoints + delta },
    });
    const updatedTeam = await prisma.team.update({
      where: { id: team.id },
      data: { totalPoints: team.totalPoints + delta },
    });

    await prisma.auditLog.create({
      data: {
        action: 'MANUAL_TEAM_STAGE_ADJUSTMENT',
        userId: team.userId,
        details: JSON.stringify({
          reason: 'QF forfeit joke for "the bois" private league',
          teamId: team.id,
          teamName,
          stageId: 'QF',
          delta,
          before,
          after: { teamTotalPoints: updatedTeam.totalPoints, tsRawPoints: updatedTs.rawPoints, tsTotalPoints: updatedTs.totalPoints },
        }),
      },
    });

    console.log(`${teamName}: QF totalPoints ${before.tsTotalPoints} -> ${updatedTs.totalPoints} (delta ${delta})`);
    console.log(`${teamName}: Team.totalPoints ${before.teamTotalPoints} -> ${updatedTeam.totalPoints}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
