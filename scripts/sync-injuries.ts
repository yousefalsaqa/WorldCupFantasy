// Sync player availability from API-Football's injuries feed.
//
//   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/sync-injuries.ts          (dry run)
//   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/sync-injuries.ts --apply
//
// Flags injured/suspended players (isAvailable=false, note prefixed "API:")
// and restores players previously API-flagged who are no longer in the feed.
// Manual admin flags (notes WITHOUT the "API:" prefix) are never touched.
// Run before each stage deadline; the picker shows the note as a red tag.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const API_KEY = process.env.API_FOOTBALL_KEY || '';
const LEAGUE = 1; // World Cup
const SEASON = 2026;

interface ApiInjury {
  player: { id: number; name: string; reason?: string; type?: string };
}

async function main() {
  const res = await fetch(
    `https://v3.football.api-sports.io/injuries?league=${LEAGUE}&season=${SEASON}`,
    { headers: { 'x-apisports-key': API_KEY } },
  );
  const data = await res.json();
  const injuries: ApiInjury[] = data.response ?? [];
  console.log(`API returned ${injuries.length} injury entries.`);

  const injuredByApiId = new Map<number, string>();
  for (const inj of injuries) {
    const reason = inj.player.reason || inj.player.type || 'Injured';
    injuredByApiId.set(inj.player.id, reason);
  }

  // Flag players in the feed
  let flagged = 0;
  for (const [apiId, reason] of injuredByApiId) {
    const player = await prisma.player.findUnique({ where: { apiFootballId: apiId } });
    if (!player) continue;
    const note = `API: ${reason}`;
    if (!player.isAvailable && player.availabilityNote === note) continue;
    console.log(`  OUT  ${player.displayName} (${note})`);
    flagged++;
    if (APPLY) {
      await prisma.player.update({
        where: { id: player.id },
        data: { isAvailable: false, availabilityNote: note },
      });
    }
  }

  // Restore API-flagged players who are no longer in the feed
  const apiFlagged = await prisma.player.findMany({
    where: { isAvailable: false, availabilityNote: { startsWith: 'API:' } },
  });
  let restored = 0;
  for (const p of apiFlagged) {
    if (p.apiFootballId && injuredByApiId.has(p.apiFootballId)) continue;
    console.log(`  BACK ${p.displayName}`);
    restored++;
    if (APPLY) {
      await prisma.player.update({
        where: { id: p.id },
        data: { isAvailable: true, availabilityNote: null },
      });
    }
  }

  console.log(`\n${APPLY ? 'Applied' : 'DRY RUN'}: ${flagged} flagged, ${restored} restored.`);
}

main().finally(() => prisma.$disconnect());
