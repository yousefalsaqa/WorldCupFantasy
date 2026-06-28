// ============================================
// MARK ELIMINATIONS + RE-GRANT MERCY TRANSFERS
//
// As of the durable-automation work, the live cron marks eliminations every
// tick (src/lib/mark-eliminations.ts) and the mercy rule auto-fires at each
// rollover. This script is now the SAFETY NET / BACKFILL for that path:
//
//   1) MARK eliminations — delegates to the shared markEliminations() lib (the
//      same code the cron + admin route run), so the rule can never drift.
//      Two safe, idempotent sources: KO losers, and group non-qualifiers once
//      the group stage is complete AND all 16 R32 fixtures are synced.
//
//   2) RE-GRANT mercy: for every team, top its free transfers up to its
//      eliminated-player count for the CURRENT round, accounting for transfers
//      already used: delta = max(0, eliminatedCount − (freeTransfers + used)).
//      Only ever increases — never removes transfers a manager already earned.
//      Idempotent: a second run is a no-op. This is the bit stage-advance does
//      automatically at the rollover; the script repeats it for a round that
//      already rolled over without fresh eliminations marked in time.
//
//   npx tsx scripts/apply-eliminations-mercy.ts            (dry run)
//   npx tsx scripts/apply-eliminations-mercy.ts --apply    (write)
//
// Run AFTER a rollover and AFTER all that round's fixtures are synced, but
// BEFORE managers start transacting (so `used` is 0 and everyone gets their
// full mercy allotment cleanly).
// ============================================
import { prisma } from '../src/lib/db';
import { markEliminations } from '../src/lib/mark-eliminations';
import { isAutoUnlimitedTransferStage } from '../src/lib/wc-constants';

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing to DB)' : 'DRY RUN (no writes)'}\n`);

  // ---- 1) Mark eliminations via the shared rule ----
  const elim = await markEliminations({ dryRun: !APPLY });
  for (const m of elim.marked) console.log(`  eliminate ${m.code} (at ${m.at})`);
  if (elim.groupPassSkipped) {
    console.log('Group non-qualifier pass skipped (groups not complete OR R32 < 16 synced — run sync-knockout-from-api.ts first).');
  }
  console.log(
    `Eliminations: ${elim.marked.length} newly marked ` +
    `(${elim.koLosers} KO losers, ${elim.groupOut} group), ${elim.alreadyMarked} already marked.`,
  );

  // ---- 2) Re-grant mercy ----
  // Re-read nations post-mark so the mercy count includes what we just marked.
  // (In dry run nothing was written, so fold in the would-be marks by id.)
  const nations = await prisma.nation.findMany({ select: { id: true, code: true, isEliminated: true } });
  const markedCodes = new Set(elim.marked.map((m) => m.code));
  const eliminatedSet = new Set<string>(
    nations.filter((n) => n.isEliminated || markedCodes.has(n.code)).map((n) => n.id),
  );

  // Teams on a WILDCARD in the active round already have unlimited transfers —
  // granting mercy on top is pointless and would bank past the wildcard, so
  // skip them. (stage-advance also forfeits a wildcard round's leftover at the
  // next rollover; this avoids handing it out in the first place.)
  const activeStage = await prisma.stage.findFirst({ where: { isActive: true }, select: { id: true, stageId: true } });

  // Auto-unlimited stage (R32): the open window already gives a free rebuild,
  // so mercy does NOT apply here — and bumping freeTransfers now would leak
  // extra free transfers into the next round's queueing. Skip the re-grant
  // entirely (eliminations were still marked above for the UI + later mercy).
  if (activeStage && isAutoUnlimitedTransferStage(activeStage.stageId)) {
    console.log(`\nActive stage ${activeStage.stageId} is auto-unlimited — skipping mercy re-grant (free rebuild covers it).`);
    console.log(`\n${APPLY ? 'APPLIED (eliminations only).' : 'DRY RUN — nothing written. Re-run with --apply.'}`);
    return;
  }

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
