// ============================================
// APPLY FIFA POSITION ALIGNMENT (~130 players)
//
// Reads posFixes from scripts/fifa-sync-plan.json (cross-check output) and
// sets each player's position to FIFA's official fantasy classification.
//
// Squads that become invalid under the new positions (squad composition
// 2 GK / 5 DEF / 5 MID / 3 FWD, or starting XI off the VALID_FORMATIONS
// list) are RESET: SquadPlayer rows deleted, bank restored to the
// initial £100m, teamValue zeroed — the owner rebuilds from the picker.
// Yousef explicitly approved squad resets (June 11, pre-kickoff, no
// points banked yet).
//
//   npx tsx --env-file=.env scripts/apply-fifa-positions.ts          (dry run)
//   npx tsx --env-file=.env scripts/apply-fifa-positions.ts --apply
// ============================================

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { VALID_FORMATIONS } from '../src/lib/wc-constants';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const plan: {
  posFixes: Array<{ id: string; code: string; name: string; ours: string; fifa: string; price: number; how: string }>;
} = JSON.parse(fs.readFileSync(path.join(__dirname, 'fifa-sync-plan.json'), 'utf8'));

const SQUAD_TOTALS: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };

async function main() {
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${plan.posFixes.length} position fixes\n`);
  for (const f of plan.posFixes) {
    console.log(`  ${f.code} ${f.name.padEnd(26)} ${f.ours} -> ${f.fifa}`);
  }

  // simulate post-change squads
  const newPos = new Map(plan.posFixes.map((f) => [f.id, f.fifa]));
  const teams = await prisma.team.findMany({
    select: {
      id: true, name: true,
      user: { select: { email: true } },
      squadPlayers: {
        select: {
          isStarting: true,
          player: { select: { id: true, position: true, displayName: true } },
        },
      },
    },
  });

  const broken: Array<{ id: string; name: string; email: string; why: string }> = [];
  for (const t of teams) {
    if (t.squadPlayers.length === 0) continue;
    const squadCount: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    const startCount: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const sp of t.squadPlayers) {
      const pos = newPos.get(sp.player.id) || sp.player.position;
      squadCount[pos]++;
      if (sp.isStarting) startCount[pos]++;
    }
    const compBad = Object.entries(SQUAD_TOTALS).find(([p, n]) => squadCount[p] !== n);
    const formationOk =
      startCount.GK === 1 &&
      VALID_FORMATIONS.some((f) => f.DEF === startCount.DEF && f.MID === startCount.MID && f.FWD === startCount.FWD);
    if (compBad) {
      broken.push({ id: t.id, name: t.name, email: t.user.email, why: `squad ${squadCount.GK}-${squadCount.DEF}-${squadCount.MID}-${squadCount.FWD}` });
    } else if (!formationOk) {
      broken.push({ id: t.id, name: t.name, email: t.user.email, why: `XI ${startCount.GK}/${startCount.DEF}-${startCount.MID}-${startCount.FWD}` });
    }
  }

  console.log(`\n— Teams with squads: ${teams.filter((t) => t.squadPlayers.length > 0).length}`);
  console.log(`— Broken by position changes: ${broken.length}`);
  for (const b of broken) console.log(`    RESET ${b.name} <${b.email}> — ${b.why}`);

  if (APPLY) {
    for (const f of plan.posFixes) {
      await prisma.player.update({ where: { id: f.id }, data: { position: f.fifa } });
    }
    for (const b of broken) {
      await prisma.squadPlayer.deleteMany({ where: { teamId: b.id } });
      await prisma.team.update({
        where: { id: b.id },
        data: { bankBalance: 100.0, teamValue: 0.0 },
      });
    }
    console.log(`\n✓ Applied ${plan.posFixes.length} position fixes, reset ${broken.length} squads.`);
  } else {
    console.log('\nDry run only — re-run with --apply to write.');
  }
}

main().finally(() => prisma.$disconnect());
