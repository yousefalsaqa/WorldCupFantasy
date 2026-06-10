// ============================================
// FULL RESET FOR TOURNAMENT LAUNCH
//
// Usage:
//   npx tsx --env-file=.env scripts/reset-for-launch.ts          (dry run)
//   npx tsx --env-file=.env scripts/reset-for-launch.ts --apply  (DESTRUCTIVE)
//
// Wipes all user-generated data (accounts, teams, squads, leagues, points,
// audit history) and resets tournament state to a pristine pre-kickoff
// snapshot. KEEPS: nations, the 1,248 API-mapped players, stages, and the
// 72 stamped group-stage matches.
//
// Also deletes:
//   - matches without apiFootballId (simulator leftovers)
//   - players without apiFootballId (stale/duplicate legacy rows)
// And resets:
//   - stage flags (GR1 active, everything else inactive/incomplete)
//   - nation elimination flags
//   - match scores / started / finished flags
// ============================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// The ops/admin login survives the reset (keeps credentials + isAdmin).
// Its team/squad/league data is still wiped like everyone else's.
const KEEP_ADMIN_EMAIL = 'admin@worldcupfantasy.com';

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY - DESTRUCTIVE' : 'DRY RUN (no writes)'}\n`);

  const [
    auditLogs,
    performances,
    transfers,
    squadPlayers,
    teamStages,
    leagueMemberships,
    leagues,
    teams,
    sessions,
    users,
    leftoverMatches,
    stalePlayers,
    appSettings,
  ] = await Promise.all([
    prisma.auditLog.count(),
    prisma.playerPerformance.count(),
    prisma.transfer.count(),
    prisma.squadPlayer.count(),
    prisma.teamStage.count(),
    prisma.leagueMembership.count(),
    prisma.league.count(),
    prisma.team.count(),
    prisma.session.count(),
    prisma.user.count({ where: { email: { not: KEEP_ADMIN_EMAIL } } }),
    prisma.match.count({ where: { apiFootballId: null } }),
    prisma.player.count({ where: { apiFootballId: null } }),
    prisma.appSetting.findMany(),
  ]);

  console.log('WILL DELETE:');
  console.log(`  AuditLog:          ${auditLogs}`);
  console.log(`  PlayerPerformance: ${performances}`);
  console.log(`  Transfer:          ${transfers}`);
  console.log(`  SquadPlayer:       ${squadPlayers}`);
  console.log(`  TeamStage:         ${teamStages}`);
  console.log(`  LeagueMembership:  ${leagueMemberships}`);
  console.log(`  League:            ${leagues}`);
  console.log(`  Team:              ${teams}`);
  console.log(`  Session:           ${sessions}`);
  console.log(`  User:              ${users}  (everyone re-registers; ${KEEP_ADMIN_EMAIL} is KEPT)`);
  console.log(`  Match (no API id): ${leftoverMatches}  (simulator leftovers)`);
  console.log(`  Player (no API id):${stalePlayers}  (stale/duplicate legacy rows)`);

  console.log('\nWILL RESET:');
  console.log('  Stage flags -> GR1 active, all others inactive, none complete');
  console.log('  Nation.isEliminated/eliminatedAt -> false/null');
  console.log('  Match scores/isStarted/isFinished/currentMinute -> cleared');
  console.log(`\nAppSetting rows (left untouched): ${appSettings.map((s) => `${s.key}=${s.value}`).join(', ') || 'none'}`);

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to execute.');
    await prisma.$disconnect();
    return;
  }

  console.log('\nExecuting...');

  // user-generated data, FK-safe order
  await prisma.auditLog.deleteMany();
  await prisma.playerPerformance.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.squadPlayer.deleteMany();
  await prisma.teamStage.deleteMany();
  await prisma.leagueMembership.deleteMany();
  await prisma.league.deleteMany();
  await prisma.team.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany({ where: { email: { not: KEEP_ADMIN_EMAIL } } });
  console.log(`  user data wiped (kept ${KEEP_ADMIN_EMAIL})`);

  // leftover test matches + stale players (no squad references remain now)
  await prisma.match.deleteMany({ where: { apiFootballId: null } });
  await prisma.player.deleteMany({ where: { apiFootballId: null } });
  console.log('  leftover matches + stale players deleted');

  // pristine tournament state
  await prisma.match.updateMany({
    data: {
      homeScore: null,
      awayScore: null,
      isStarted: false,
      isFinished: false,
      homePenalties: null,
      awayPenalties: null,
      winnerId: null,
      currentMinute: null,
      lastUpdated: null,
    },
  });
  await prisma.stage.updateMany({ data: { isActive: false, isComplete: false } });
  await prisma.stage.update({ where: { stageId: 'GR1' }, data: { isActive: true } });
  await prisma.nation.updateMany({ data: { isEliminated: false, eliminatedAt: null } });
  console.log('  tournament state reset (GR1 active)');

  // final state
  const [players, matches, nations] = await Promise.all([
    prisma.player.count(),
    prisma.match.count(),
    prisma.nation.count(),
  ]);
  console.log(`\nFinal: ${nations} nations, ${players} players, ${matches} matches, 1 user (${KEEP_ADMIN_EMAIL}).`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
