// ============================================
// SYNC SERVICE
// Smart syncing with API-Football
// Optimized for 100 requests/day
// ============================================

import { prisma } from './db';
import { apiFootball, ApiFixture, ApiPlayerStats } from './api-football';
import { calculatePerformancePoints } from './scoring';

// Map API-Football positions to our positions
function mapPosition(apiPosition: string): 'GK' | 'DEF' | 'MID' | 'FWD' {
  const pos = apiPosition?.toUpperCase() || '';
  if (pos.includes('G') || pos === 'GK') return 'GK';
  if (pos.includes('D') || pos === 'DEF') return 'DEF';
  if (pos.includes('M') || pos === 'MID') return 'MID';
  if (pos.includes('F') || pos.includes('A') || pos === 'FWD') return 'FWD';
  return 'MID'; // Default
}

// Estimate player price based on various factors
function estimatePrice(position: string, rating: number | null): number {
  const basePrice = { GK: 4.5, DEF: 4.5, MID: 5.0, FWD: 5.5 };
  const base = basePrice[mapPosition(position)] || 5.0;
  
  // Adjust based on rating if available
  if (rating) {
    if (rating >= 7.5) return Math.min(base + 5.0, 14.5);
    if (rating >= 7.0) return Math.min(base + 3.0, 12.0);
    if (rating >= 6.5) return Math.min(base + 1.5, 9.0);
  }
  
  return base;
}

export const syncService = {
  // ============================================
  // SYNC TEAMS FROM API
  // Cost: 1 request + 1 per team for players
  // ============================================
  async syncTeams(includePlayers: boolean = true): Promise<{ 
    teamsAdded: number; 
    teamsUpdated: number;
    playersAdded: number;
    playersUpdated: number;
  }> {
    console.log('[Sync] Syncing La Liga teams...');
    
    const apiTeams = await apiFootball.getTeams();
    let teamsAdded = 0, teamsUpdated = 0;
    let playersAdded = 0, playersUpdated = 0;

    // Store API team IDs for player sync
    const teamMapping: Array<{ apiId: number; dbId: string }> = [];

    for (const { team } of apiTeams) {
      const existing = await prisma.club.findFirst({
        where: { 
          OR: [
            { name: team.name },
            { shortName: team.code }
          ]
        },
      });

      let dbClubId: string;

      if (existing) {
        await prisma.club.update({
          where: { id: existing.id },
          data: {
            name: team.name,
            shortName: team.code || existing.shortName,
            badgeUrl: team.logo,
          },
        });
        dbClubId = existing.id;
        teamsUpdated++;
      } else {
        const newClub = await prisma.club.create({
          data: {
            name: team.name,
            shortName: team.code || team.name.substring(0, 3).toUpperCase(),
            badgeUrl: team.logo,
          },
        });
        dbClubId = newClub.id;
        teamsAdded++;
      }

      teamMapping.push({ apiId: team.id, dbId: dbClubId });
    }

    console.log(`[Sync] Teams: ${teamsAdded} added, ${teamsUpdated} updated`);

    // Sync players for each team if requested
    if (includePlayers) {
      console.log('[Sync] Syncing players for all teams...');
      
      for (const mapping of teamMapping) {
        // Check remaining requests
        if (apiFootball.getRemainingRequests() < 5) {
          console.warn('[Sync] Low on API requests, stopping player sync');
          break;
        }

        try {
          const result = await this.syncPlayersForTeam(mapping.apiId, mapping.dbId);
          playersAdded += result.added;
          playersUpdated += result.updated;
        } catch (error) {
          console.error(`[Sync] Failed to sync players for team ${mapping.apiId}:`, error);
        }
      }

      console.log(`[Sync] Players: ${playersAdded} added, ${playersUpdated} updated`);
    }

    return { teamsAdded, teamsUpdated, playersAdded, playersUpdated };
  },

  // ============================================
  // SYNC PLAYERS FOR A TEAM
  // Cost: 1 request per team (20 teams = 20 requests)
  // ============================================
  async syncPlayersForTeam(apiTeamId: number, clubId: string): Promise<{ added: number; updated: number }> {
    const squads = await apiFootball.getSquad(apiTeamId);
    if (!squads.length) return { added: 0, updated: 0 };

    const squad = squads[0];
    let added = 0, updated = 0;

    for (const player of squad.players) {
      const position = mapPosition(player.position);
      const price = estimatePrice(player.position, null);

      // Try to find existing player
      const existing = await prisma.player.findFirst({
        where: {
          clubId,
          displayName: player.name,
        },
      });

      if (existing) {
        await prisma.player.update({
          where: { id: existing.id },
          data: {
            photoUrl: player.photo,
            position,
          },
        });
        updated++;
      } else {
        // Parse name
        const nameParts = player.name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || player.name;

        await prisma.player.create({
          data: {
            firstName,
            lastName,
            displayName: player.name,
            position,
            clubId,
            currentPrice: price,
            initialPrice: price,
            photoUrl: player.photo,
          },
        });
        added++;
      }
    }

    return { added, updated };
  },

  // ============================================
  // SYNC FIXTURES FOR CURRENT ROUND
  // Cost: 1 request
  // ============================================
  async syncFixtures(round?: string): Promise<{ added: number; updated: number }> {
    console.log(`[Sync] Syncing fixtures for round: ${round || 'current'}...`);
    
    const apiFixtures = await apiFootball.getFixtures(round);
    let added = 0, updated = 0;

    // Get or create gameweek
    const roundMatch = (round || 'Regular Season - 1').match(/(\d+)/);
    const gwNumber = roundMatch ? parseInt(roundMatch[1]) : 1;

    let gameweek = await prisma.gameweek.findFirst({
      where: { number: gwNumber },
    });

    if (!gameweek) {
      gameweek = await prisma.gameweek.create({
        data: {
          number: gwNumber,
          name: `Gameweek ${gwNumber}`,
          deadlineTime: new Date(apiFixtures[0]?.fixture.date || Date.now()),
          isCurrent: true,
        },
      });
    }

    // Get club mapping
    const clubs = await prisma.club.findMany();
    const clubByName = new Map(clubs.map(c => [c.name.toLowerCase(), c]));

    for (const apiFixture of apiFixtures) {
      const homeClub = clubByName.get(apiFixture.teams.home.name.toLowerCase());
      const awayClub = clubByName.get(apiFixture.teams.away.name.toLowerCase());

      if (!homeClub || !awayClub) {
        console.warn(`[Sync] Club not found: ${apiFixture.teams.home.name} or ${apiFixture.teams.away.name}`);
        continue;
      }

      // Check if fixture exists
      const existing = await prisma.fixture.findFirst({
        where: {
          gameweekId: gameweek.id,
          homeClubId: homeClub.id,
          awayClubId: awayClub.id,
        },
      });

      const fixtureData = {
        kickoffTime: new Date(apiFixture.fixture.date),
        homeScore: apiFixture.goals.home,
        awayScore: apiFixture.goals.away,
        isStarted: ['1H', 'HT', '2H', 'FT', 'AET', 'PEN'].includes(apiFixture.fixture.status.short),
        isFinished: ['FT', 'AET', 'PEN'].includes(apiFixture.fixture.status.short),
        minutesPlayed: apiFixture.fixture.status.elapsed || 0,
      };

      if (existing) {
        await prisma.fixture.update({
          where: { id: existing.id },
          data: fixtureData,
        });
        updated++;
      } else {
        await prisma.fixture.create({
          data: {
            gameweekId: gameweek.id,
            homeClubId: homeClub.id,
            awayClubId: awayClub.id,
            ...fixtureData,
          },
        });
        added++;
      }
    }

    console.log(`[Sync] Fixtures: ${added} added, ${updated} updated`);
    return { added, updated };
  },

  // ============================================
  // SYNC MATCH RESULTS (AFTER MATCH FINISHES)
  // Cost: 1 request for events, 1 for player stats = 2 per match
  // ============================================
  async syncMatchResults(apiFixtureId: number, dbFixtureId: string): Promise<{ playersUpdated: number }> {
    console.log(`[Sync] Syncing results for fixture ${apiFixtureId}...`);

    // Get player stats from the match
    const playerStatsData = await apiFootball.getFixturePlayerStats(apiFixtureId);
    
    if (!playerStatsData.length) {
      console.warn('[Sync] No player stats available');
      return { playersUpdated: 0 };
    }

    // Get fixture details
    const fixture = await prisma.fixture.findUnique({
      where: { id: dbFixtureId },
      include: { homeClub: true, awayClub: true },
    });

    if (!fixture) return { playersUpdated: 0 };

    // Get our players
    const ourPlayers = await prisma.player.findMany({
      where: {
        clubId: { in: [fixture.homeClubId, fixture.awayClubId] },
      },
    });

    const playerByName = new Map(ourPlayers.map(p => [p.displayName.toLowerCase(), p]));

    let playersUpdated = 0;

    for (const teamStats of playerStatsData) {
      const isHomeTeam = teamStats.team.id.toString() === fixture.homeClubId;
      const goalsConceeded = isHomeTeam ? (fixture.awayScore || 0) : (fixture.homeScore || 0);

      for (const playerStat of teamStats.players) {
        // Find our player
        const ourPlayer = playerByName.get(playerStat.player.name.toLowerCase());
        if (!ourPlayer) continue;

        const stats = playerStat.statistics[0];
        if (!stats) continue;

        const minutesPlayed = stats.games.minutes || 0;
        const goals = stats.goals.total || 0;
        const assists = stats.goals.assists || 0;
        const yellowCards = stats.cards.yellow || 0;
        const redCards = stats.cards.red || 0;
        const penaltySaved = stats.penalty.saved || 0;
        const penaltyMissed = stats.penalty.missed || 0;

        // Determine clean sheet
        const cleanSheet = minutesPlayed >= 60 && goalsConceeded === 0;

        // Calculate points
        const breakdown = calculatePerformancePoints({
          position: ourPlayer.position,
          minutesPlayed,
          goals,
          assists,
          longShotGoals: 0, // API doesn't provide this easily
          cleanSheet,
          goalsConceeded: minutesPlayed > 0 ? goalsConceeded : 0,
          saves: 0, // Would need additional API call
          penaltiesSaved: penaltySaved,
          penaltiesMissed: penaltyMissed,
          defensiveContributions: 0,
          yellowCards,
          redCards,
          ownGoals: 0,
          bpsScore: 0,
          bonusPoints: 0,
        });

        // Upsert performance
        await prisma.playerPerformance.upsert({
          where: {
            playerId_fixtureId: {
              playerId: ourPlayer.id,
              fixtureId: dbFixtureId,
            },
          },
          create: {
            playerId: ourPlayer.id,
            fixtureId: dbFixtureId,
            minutesPlayed,
            goals,
            assists,
            cleanSheet,
            goalsConceeded: minutesPlayed > 0 ? goalsConceeded : 0,
            yellowCards,
            redCards,
            penaltiesSaved: penaltySaved,
            penaltiesMissed: penaltyMissed,
            totalPoints: breakdown.total,
          },
          update: {
            minutesPlayed,
            goals,
            assists,
            cleanSheet,
            goalsConceeded: minutesPlayed > 0 ? goalsConceeded : 0,
            yellowCards,
            redCards,
            penaltiesSaved: penaltySaved,
            penaltiesMissed: penaltyMissed,
            totalPoints: breakdown.total,
          },
        });

        playersUpdated++;
      }
    }

    // Mark fixture as finished
    await prisma.fixture.update({
      where: { id: dbFixtureId },
      data: { isFinished: true },
    });

    console.log(`[Sync] Updated ${playersUpdated} player performances`);
    return { playersUpdated };
  },

  // ============================================
  // SMART SYNC - Called periodically
  // Checks what needs updating and syncs efficiently
  // ============================================
  async smartSync(): Promise<{
    fixturesChecked: number;
    matchesUpdated: number;
    requestsUsed: number;
  }> {
    const startRequests = 100 - apiFootball.getRemainingRequests();
    let fixturesChecked = 0;
    let matchesUpdated = 0;

    console.log('[SmartSync] Starting smart sync...');
    console.log(`[SmartSync] Remaining API requests: ${apiFootball.getRemainingRequests()}`);

    // Get current gameweek fixtures that aren't finished
    const pendingFixtures = await prisma.fixture.findMany({
      where: {
        isFinished: false,
        kickoffTime: { lte: new Date() }, // Match should have started
      },
      include: {
        gameweek: true,
        homeClub: true,
        awayClub: true,
      },
      take: 10, // Limit to save API calls
    });

    if (pendingFixtures.length === 0) {
      console.log('[SmartSync] No pending fixtures to check');
      return { fixturesChecked: 0, matchesUpdated: 0, requestsUsed: 0 };
    }

    // Check live fixtures first (1 request)
    try {
      const liveFixtures = await apiFootball.getLiveFixtures();
      fixturesChecked++;

      for (const live of liveFixtures) {
        const dbFixture = pendingFixtures.find(f => 
          f.homeClub.name.toLowerCase().includes(live.teams.home.name.toLowerCase().split(' ')[0]) ||
          live.teams.home.name.toLowerCase().includes(f.homeClub.name.toLowerCase().split(' ')[0])
        );

        if (dbFixture) {
          // Update score
          await prisma.fixture.update({
            where: { id: dbFixture.id },
            data: {
              homeScore: live.goals.home,
              awayScore: live.goals.away,
              isStarted: true,
              minutesPlayed: live.fixture.status.elapsed || 0,
            },
          });

          // If match just finished, get full stats
          if (live.fixture.status.short === 'FT' || live.fixture.status.short === 'AET') {
            await this.syncMatchResults(live.fixture.id, dbFixture.id);
            matchesUpdated++;
          }
        }
      }
    } catch (error) {
      console.error('[SmartSync] Error checking live fixtures:', error);
    }

    const endRequests = 100 - apiFootball.getRemainingRequests();
    const requestsUsed = endRequests - startRequests;

    console.log(`[SmartSync] Complete: ${fixturesChecked} checked, ${matchesUpdated} updated, ${requestsUsed} API requests used`);
    
    return { fixturesChecked, matchesUpdated, requestsUsed };
  },
};

