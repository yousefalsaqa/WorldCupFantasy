import { prisma } from '../src/lib/db';

async function main() {
  const team = await prisma.team.findFirst({ where: { name: { contains: 'Doudisfoodies' } } });
  if (!team) throw new Error('team not found');
  const admin = await prisma.user.findFirst({ where: { isAdmin: true } });
  if (!admin) throw new Error('admin user not found');

  const names = ['Hakimi', 'Cubarsí', 'Lamine Yamal', 'L. Martínez', 'A. Gordon', 'Schjelderup'];
  const sps = new Map<string, Awaited<ReturnType<typeof prisma.squadPlayer.findFirstOrThrow>>>();
  for (const n of names) {
    const sp = await prisma.squadPlayer.findFirstOrThrow({
      where: { teamId: team.id, player: { displayName: { contains: n } } },
      include: { player: true },
    });
    sps.set(n, sp);
  }

  const hakimi = sps.get('Hakimi')!;
  const cubarsi = sps.get('Cubarsí')!;
  const lamine = sps.get('Lamine Yamal')!;
  const martinez = sps.get('L. Martínez')!;
  const gordon = sps.get('A. Gordon')!;
  const schjelderup = sps.get('Schjelderup')!;

  // Already-FT swaps: outgoing starters already banked into Team.totalPoints
  // at their match's FT; incoming bench players were never banked because
  // they weren't starting. Manually correct the delta since settleStage()
  // won't revisit already-fired FT contributions.
  // Martinez/Hakimi: Hakimi's match (FRA-MAR) already FT and banked;
  // Martinez's match (ARG-SUI) is still live and will bank automatically
  // once it finishes FT (updateSquadPoints reads isStarting at that time).

  await prisma.$transaction(async (tx) => {
    // Flip starting XI / bench.
    await tx.squadPlayer.update({ where: { id: hakimi.id }, data: { isStarting: false, benchOrder: 1 } });
    await tx.squadPlayer.update({ where: { id: martinez.id }, data: { isStarting: true, benchOrder: null } });
    await tx.squadPlayer.update({ where: { id: cubarsi.id }, data: { isStarting: false, benchOrder: 4 } });
    await tx.squadPlayer.update({ where: { id: gordon.id }, data: { isStarting: true, benchOrder: null } });
    await tx.squadPlayer.update({ where: { id: lamine.id }, data: { isStarting: false, benchOrder: 3 } });
    await tx.squadPlayer.update({ where: { id: schjelderup.id }, data: { isStarting: true, benchOrder: null } });

    // True QF-match points (from PlayerPerformance, not the drifted
    // SquadPlayer.points cache) for the two already-finished-match swaps.
    const qfPoints = async (playerId: string) => {
      const perf = await tx.playerPerformance.findFirst({
        where: { playerId, match: { stage: { stageId: 'QF' } } },
        select: { totalPoints: true },
      });
      return perf?.totalPoints ?? 0;
    };

    const hakimiPts = await qfPoints(hakimi.playerId);
    const cubarsiPts = await qfPoints(cubarsi.playerId);
    const laminePts = await qfPoints(lamine.playerId);
    const gordonPts = await qfPoints(gordon.playerId);
    const schjelderupPts = await qfPoints(schjelderup.playerId);

    const delta = -hakimiPts - cubarsiPts - laminePts + gordonPts + schjelderupPts;

    const updatedTeam = await tx.team.update({
      where: { id: team.id },
      data: { totalPoints: { increment: delta } },
    });

    await tx.auditLog.create({
      data: {
        userId: admin.id,
        action: 'ADMIN_RETROACTIVE_LINEUP_CORRECTION',
        details: JSON.stringify({
          teamId: team.id,
          teamName: team.name,
          stage: 'QF',
          reason: 'Owner-requested subs: Martinez for Hakimi, Gordon for Cubarsi, Schjelderup for Lamine Yamal, counted as if in starting XI',
          swaps: [
            { out: 'Hakimi', outPts: hakimiPts, in: 'L. Martinez', inPts: 'pending (ARG-SUI live, banks automatically at FT)' },
            { out: 'Pau Cubarsi', outPts: cubarsiPts, in: 'A. Gordon', inPts: gordonPts },
            { out: 'Lamine Yamal', outPts: laminePts, in: 'A. Schjelderup', inPts: schjelderupPts },
          ],
          manualTotalPointsDelta: delta,
          newTeamTotalPoints: updatedTeam.totalPoints,
        }),
      },
    });

    console.log(`Applied. Manual Team.totalPoints delta: ${delta} (Hakimi -${hakimiPts}, Cubarsi -${cubarsiPts}, Lamine -${laminePts}, Gordon +${gordonPts}, Schjelderup +${schjelderupPts})`);
    console.log(`New Team.totalPoints: ${updatedTeam.totalPoints}`);
    console.log('Martinez-for-Hakimi: isStarting flipped now; his contribution banks automatically when ARG-SUI goes FT.');
  });

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
