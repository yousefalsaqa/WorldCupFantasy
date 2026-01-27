// ============================================
// SYNC FIXTURES FROM API-FOOTBALL
// One-time or periodic sync to map API IDs to our records
// ============================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiFootball } from '@/lib/api-football';
import { NATION_TO_API_ID, API_ID_TO_NATION, mapRoundToStage } from '@/lib/team-mappings';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface SyncResult {
  nationsUpdated: number;
  matchesSynced: number;
  playersMapped: number;
  errors: string[];
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    
    const body = await request.json().catch(() => ({}));
    const { syncType = 'all' } = body;

    const result: SyncResult = {
      nationsUpdated: 0,
      matchesSynced: 0,
      playersMapped: 0,
      errors: [],
    };

    // ===== SYNC NATIONS =====
    if (syncType === 'all' || syncType === 'nations') {
      console.log('[Sync] Syncing nations...');
      
      const nations = await prisma.nation.findMany();
      
      for (const nation of nations) {
        const apiId = NATION_TO_API_ID[nation.code];
        if (apiId && nation.apiFootballId !== apiId) {
          await prisma.nation.update({
            where: { id: nation.id },
            data: { apiFootballId: apiId },
          });
          result.nationsUpdated++;
        }
      }
    }

    // ===== SYNC FIXTURES =====
    if (syncType === 'all' || syncType === 'fixtures') {
      console.log('[Sync] Syncing fixtures...');
      
      try {
        const apiFixtures = await apiFootball.getWorldCupFixtures();
        
        for (const fixture of apiFixtures) {
          const homeNationCode = API_ID_TO_NATION[fixture.teams.home.id];
          const awayNationCode = API_ID_TO_NATION[fixture.teams.away.id];
          
          if (!homeNationCode || !awayNationCode) {
            result.errors.push(
              `Unknown teams: ${fixture.teams.home.name} (${fixture.teams.home.id}) vs ${fixture.teams.away.name} (${fixture.teams.away.id})`
            );
            continue;
          }

          // Find matching nations in our DB
          const homeNation = await prisma.nation.findFirst({
            where: { code: homeNationCode },
          });
          const awayNation = await prisma.nation.findFirst({
            where: { code: awayNationCode },
          });

          if (!homeNation || !awayNation) {
            result.errors.push(
              `Nations not in DB: ${homeNationCode} or ${awayNationCode}`
            );
            continue;
          }

          // Map round to our stage
          const stageId = mapRoundToStage(fixture.league.round);
          if (!stageId) {
            result.errors.push(`Unknown round: ${fixture.league.round}`);
            continue;
          }

          const stage = await prisma.stage.findFirst({
            where: { stageId },
          });

          if (!stage) {
            result.errors.push(`Stage not in DB: ${stageId}`);
            continue;
          }

          // Find or create match
          const kickoffTime = new Date(fixture.fixture.date);
          
          // Try to find existing match by teams and approximate time
          let match = await prisma.match.findFirst({
            where: {
              homeNationId: homeNation.id,
              awayNationId: awayNation.id,
              stageId: stage.id,
            },
          });

          if (match) {
            // Update existing match with API ID
            await prisma.match.update({
              where: { id: match.id },
              data: {
                apiFootballId: fixture.fixture.id,
                kickoffTime,
              },
            });
          } else {
            // Create new match (shouldn't happen if seeded correctly)
            match = await prisma.match.create({
              data: {
                stageId: stage.id,
                homeNationId: homeNation.id,
                awayNationId: awayNation.id,
                kickoffTime,
                apiFootballId: fixture.fixture.id,
              },
            });
          }

          result.matchesSynced++;
        }
      } catch (error) {
        result.errors.push(`Fixture sync error: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    // ===== SYNC PLAYERS =====
    if (syncType === 'all' || syncType === 'players') {
      console.log('[Sync] Syncing players...');
      
      // Get all nations with API IDs
      const nations = await prisma.nation.findMany({
        where: { apiFootballId: { not: null } },
        include: { players: true },
      });

      for (const nation of nations) {
        try {
          const squads = await apiFootball.getTeamSquad(nation.apiFootballId!);
          
          if (!squads || squads.length === 0) continue;
          
          const apiPlayers = squads[0].players;
          
          // Try to match players by name
          for (const apiPlayer of apiPlayers) {
            // Find player in our DB by matching display name or last name
            const dbPlayer = nation.players.find(p => {
              const apiName = apiPlayer.name.toLowerCase();
              const displayName = p.displayName.toLowerCase();
              const lastName = p.lastName.toLowerCase();
              
              return displayName.includes(apiName) || 
                     apiName.includes(displayName) ||
                     apiName.includes(lastName) ||
                     lastName.includes(apiName.split(' ').pop() || '');
            });

            if (dbPlayer && !dbPlayer.apiFootballId) {
              await prisma.player.update({
                where: { id: dbPlayer.id },
                data: { apiFootballId: apiPlayer.id },
              });
              result.playersMapped++;
            }
          }
        } catch (error) {
          result.errors.push(
            `Player sync error for ${nation.name}: ${error instanceof Error ? error.message : 'Unknown'}`
          );
        }
      }
    }

    return NextResponse.json({
      message: 'Sync completed',
      result,
      rateLimit: apiFootball.getRateLimitRemaining(),
    });
  } catch (error) {
    console.error('[Sync] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}

// GET endpoint to check current sync status
export async function GET() {
  try {
    const [
      nationsWithApi,
      nationsTotal,
      matchesWithApi,
      matchesTotal,
      playersWithApi,
      playersTotal,
    ] = await Promise.all([
      prisma.nation.count({ where: { apiFootballId: { not: null } } }),
      prisma.nation.count(),
      prisma.match.count({ where: { apiFootballId: { not: null } } }),
      prisma.match.count(),
      prisma.player.count({ where: { apiFootballId: { not: null } } }),
      prisma.player.count(),
    ]);

    return NextResponse.json({
      status: 'ok',
      sync: {
        nations: { mapped: nationsWithApi, total: nationsTotal },
        matches: { mapped: matchesWithApi, total: matchesTotal },
        players: { mapped: playersWithApi, total: playersTotal },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}
