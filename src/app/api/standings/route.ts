import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// This route is dynamic because it reads query parameters
export const dynamic = 'force-dynamic';

interface GroupStanding {
  nationId: string;
  nationName: string;
  nationCode: string;
  group: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupFilter = searchParams.get('group'); // Optional: filter by specific group

    // Get all nations with their groups
    const nations = await prisma.nation.findMany({
      where: groupFilter ? { group: groupFilter } : { group: { not: null } },
      select: {
        id: true,
        name: true,
        code: true,
        group: true,
      },
    });

    // Get all finished matches
    const matches = await prisma.match.findMany({
      where: {
        isFinished: true,
        homeScore: { not: null },
        awayScore: { not: null },
      },
      select: {
        homeNationId: true,
        awayNationId: true,
        homeScore: true,
        awayScore: true,
      },
    });

    // Initialize standings for each nation
    const standingsMap = new Map<string, GroupStanding>();
    
    for (const nation of nations) {
      standingsMap.set(nation.id, {
        nationId: nation.id,
        nationName: nation.name,
        nationCode: nation.code,
        group: nation.group || '',
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      });
    }

    // Calculate standings from matches
    for (const match of matches) {
      const homeStanding = standingsMap.get(match.homeNationId);
      const awayStanding = standingsMap.get(match.awayNationId);

      if (!homeStanding || !awayStanding) continue;

      const homeScore = match.homeScore || 0;
      const awayScore = match.awayScore || 0;

      // Update home nation
      homeStanding.played++;
      homeStanding.goalsFor += homeScore;
      homeStanding.goalsAgainst += awayScore;

      // Update away nation
      awayStanding.played++;
      awayStanding.goalsFor += awayScore;
      awayStanding.goalsAgainst += homeScore;

      // Determine result
      if (homeScore > awayScore) {
        homeStanding.wins++;
        homeStanding.points += 3;
        awayStanding.losses++;
      } else if (awayScore > homeScore) {
        awayStanding.wins++;
        awayStanding.points += 3;
        homeStanding.losses++;
      } else {
        homeStanding.draws++;
        homeStanding.points += 1;
        awayStanding.draws++;
        awayStanding.points += 1;
      }
    }

    // Calculate goal difference
    const standingsArray = Array.from(standingsMap.values());
    for (const standing of standingsArray) {
      standing.goalDifference = standing.goalsFor - standing.goalsAgainst;
    }

    // Sort each group by: points (desc), goal difference (desc), goals for (desc)
    const groupedStandings: Record<string, GroupStanding[]> = {};
    
    for (const standing of standingsArray) {
      if (!groupedStandings[standing.group]) {
        groupedStandings[standing.group] = [];
      }
      groupedStandings[standing.group].push(standing);
    }

    // Sort each group
    for (const group in groupedStandings) {
      groupedStandings[group].sort((a, b) => {
        // Points (descending)
        if (b.points !== a.points) return b.points - a.points;
        // Goal difference (descending)
        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        // Goals for (descending)
        return b.goalsFor - a.goalsFor;
      });
    }

    return NextResponse.json({ 
      standings: groupedStandings,
      groups: Object.keys(groupedStandings).sort(),
    });
  } catch (error) {
    console.error('Error fetching standings:', error);
    return NextResponse.json({ error: 'Failed to fetch standings' }, { status: 500 });
  }
}
