// ============================================
// MARK ELIMINATIONS + RE-GRANT MERCY TRANSFERS
//
// The live cron never sets Nation.isEliminated (only the manual admin
// results route does, and only for knockout losers). So the mercy rule in
// stage-advance — which gives a team free transfers equal to its eliminated-
// player count when that exceeds the banked allocation — never fires. Teams
// enter the knockouts with dead squad slots and only the base allocation.
//
// This script fixes that, decoupled from the rollover so it can be run in the
// window after a stage settles:
//
//   1) MARK eliminations (idempotent, two safe sources):
//      a. Knockout losers — any finished KO match with a winnerId: the loser
//         is eliminated (eliminatedAt = that KO stage).
//      b. Group non-qualifiers — ONLY when the group stage is fully complete
//         AND all 16 R32 matches exist: any group nation not present in any
//         knockout match is eliminated (eliminatedAt = 'GR3'). The 16-match
//         guard prevents wrongly eliminating a qualifier whose R32 fixture
//         hasn't been synced yet — run sync-knockout-from-api.ts first.
//
//   2) RE-GRANT mercy: for every team, top its free transfers up to its
//      eliminated-player count for the CURRENT round, accounting for transfers
//      already used: delta = max(0, eliminatedCount − (freeTransfers + used)).
//      Only ever increases — never removes transfers a manager already earned.
//      Idempotent: a second run is a no-op.
//
//   npx tsx scripts/apply-eliminations-mercy.ts            (dry run)
//   npx tsx scripts/apply-eliminations-mercy.ts --apply    (write)
//
// Run AFTER the GR3→R32 rollover (R32 active) and AFTER all 16 R32 fixtures
// are synced, but BEFORE managers start making R32 transfers (so `used` is 0
// and everyone gets their full mercy allotment cleanly).
// ============================================
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const KO_STAGE_IDS = ['R32', 'R16', 'QF', 'SF', '3RD', 'F'];

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing to DB)' : 'DRY RUN (no writes)'}\n`);

  const stages = await prisma.stage.findMany();
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const koStages = stages.filter((s) => KO_STAGE_IDS.includes(s.stageId));
  const koStageIds = new Set(koStages.map((s) => s.id));
  const groupStages = stages.filter((s) => ['GR1', 'GR2', 'GR3'].includes(s.stageId));

  const nations = await prisma.nation.findMany({ select: { id: true, code: true, group: true, isEliminated: true } });
  const nameById = new Map(nations.map((n) => [n.id, n.code]));

  const allMatches = await prisma.match.findMany({
    select: { id: true, stageId: true, homeNationId: true, awayNationId: true, isFinished: true, winnerId: true },
  });

  // ---- 1a) Knockout losers ----
  const toEliminate = new Map<string, string>(); // nationId -> eliminatedAt stageId label
  for (const m of allMatches) {
    if (!koStageIds.has(m.stageId) || !m.isFinished || !m.winnerId) continue;
    const loserId = m.winnerId === m.homeNationId ? m.awayNationId : m.homeNationId;
    toEliminate.set(loserId, stageById.get(m.stageId)?.stageId ?? 'KO');
  }
  console.log(`KO losers to mark eliminated: ${toEliminate.size}`);

  // ---- 1b) Group non-qualifiers (guarded) ----
  const groupComplete =
    groupStages.length === 3 &&
    (await prisma.match.count({ where: { stageId: { in: groupStages.map((s) => s.id) }, isFinished: false } })) === 0 &&
    (await prisma.match.count({ where: { stageId: { in: groupStages.map((s) => s.id) } } })) > 0;
  const r32 = koStages.find((s) => s.stageId === 'R32');
  const r32Count = r32 ? allMatches.filter((m) => m.stageId === r32.id).length : 0;

  if (!groupComplete) {
    console.log('Group stage NOT complete — skipping group non-qualifier marking.');
  } else if (r32Count < 16) {
    console.log(`Group stage complete but R32 has only ${r32Count}/16 matches — skipping group non-qualifier marking (run sync-knockout-from-api.ts first, else qualifiers would be wrongly eliminated).`);
  } else {
    const koParticipants = new Set<string>();
    for (const m of allMatches) {
      if (!koStageIds.has(m.stageId)) continue;
      koParticipants.add(m.homeNationId);
      koParticipants.add(m.awayNationId);
    }
    let groupOut = 0;
    for (const n of nations) {
      if (!n.group) continue; // only real group teams
      if (!koParticipants.has(n.id)) {
        toEliminate.set(n.id, 'GR3');
        groupOut++;
      }
    }
    console.log(`Group non-qualifiers to mark eliminated: ${groupOut}`);
  }

  // ---- Apply elimination marks ----
  let marked = 0, alreadyMarked = 0;
  for (const [nationId, at] of toEliminate) {
    const n = nations.find((x) => x.id === nationId);
    if (n?.isEliminated) { alreadyMarked++; continue; }
    marked++;
    console.log(`  eliminate ${nameById.get(nationId)} (at ${at})`);
    if (APPLY) {
      await prisma.nation.update({ where: { id: nationId }, data: { isEliminated: true, eliminatedAt: at } });
    }
  }
  console.log(`Eliminations: ${marked} newly marked, ${alreadyMarked} already marked.`);

  // ---- 2) Re-grant mercy ----
  // Use the in-memory eliminated set (post-apply) so a dry run still previews.
  const eliminatedSet = new Set<string>([
    ...nations.filter((n) => n.isEliminated).map((n) => n.id),
    ...toEliminate.keys(),
  ]);

  // Teams on a WILDCARD in the active round already have unlimited transfers —
  // granting mercy on top is pointless and would bank past the wildcard, so
  // skip them. (stage-advance also forfeits a wildcard round's leftover at the
  // next rollover; this avoids handing it out in the first place.)
  const activeStage = stages.find((s) => s.isActive);
  const wildcardTeams = new Set<string>();
  if (activeStage) {
    const ts = await prisma.teamStage.findMany({
      where: { stageId: activeStage.id },
      select: { teamId: true, chipsUsed: true, chipUsed: true },
    });
    for (const x of ts) {
      if (`${x.chipsUsed ?? ''}|${x.chipUsed ?? ''}`.includes('WILDCARD')) wildcardTeams.add(x.teamId);
    }
  }

  const teams = await prisma.team.findMany({
    select: {
      id: true, name: true, freeTransfers: true, transfersUsed: true,
      squadPlayers: { select: { player: { select: { nationId: true } } } },
    },
  });

  let bumped = 0, skippedWc = 0;
  console.log('\nMercy re-grant:');
  for (const t of teams) {
    if (wildcardTeams.has(t.id)) { skippedWc++; continue; }
    const elimCount = t.squadPlayers.filter((sp) => sp.player.nationId && eliminatedSet.has(sp.player.nationId)).length;
    const roundAllocation = t.freeTransfers + t.transfersUsed;
    const delta = Math.max(0, elimCount - roundAllocation);
    if (delta > 0) {
      bumped++;
      console.log(`  ${(t.name || '?').padEnd(20)} elim=${elimCount} ft=${t.freeTransfers} used=${t.transfersUsed} -> +${delta} (ft ${t.freeTransfers}->${t.freeTransfers + delta})`);
      if (APPLY) {
        await prisma.team.update({ where: { id: t.id }, data: { freeTransfers: t.freeTransfers + delta } });
      }
    }
  }
  console.log(`Teams bumped by mercy: ${bumped}. Skipped (on wildcard): ${skippedWc}.`);

  console.log(`\n${APPLY ? 'APPLIED.' : 'DRY RUN — nothing written. Re-run with --apply.'}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
