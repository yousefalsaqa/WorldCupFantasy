import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken, JWTPayload } from '@/lib/auth';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

interface SquadPlayer {
  playerId: string;
  purchasePrice: number;
}

interface SaveSquadRequest {
  players: SquadPlayer[];
  startingXI: string[];
  bench: string[];
  captainId: string;
  viceCaptainId: string;
}

// Helper to get session from request cookies
async function getSessionFromRequest(request: NextRequest): Promise<JWTPayload | null> {
  const token = request.cookies.get('auth_token')?.value;
  
  if (!token) {
    console.log('No session cookie found');
    return null;
  }
  
  const session = await verifyToken(token);
  console.log('Session verified:', session ? 'yes' : 'no');
  return session;
}

export async function POST(request: NextRequest) {
  try {
    // Get session from request cookies
    const session = await getSessionFromRequest(request);
    
    if (!session) {
      return NextResponse.json({ error: 'Please log in to save your squad' }, { status: 401 });
    }
    
    console.log('Saving squad for user:', session.userId);
    
    const body: SaveSquadRequest = await request.json();
    
    const { players, startingXI, bench, captainId, viceCaptainId } = body;
    
    // Validate
    if (!players || players.length !== 15) {
      return NextResponse.json({ error: 'Must have exactly 15 players' }, { status: 400 });
    }
    
    if (!startingXI || startingXI.length !== 11) {
      return NextResponse.json({ error: 'Must have exactly 11 starting players' }, { status: 400 });
    }
    
    if (!bench || bench.length !== 4) {
      return NextResponse.json({ error: 'Must have exactly 4 bench players' }, { status: 400 });
    }
    
    if (!captainId || !viceCaptainId) {
      return NextResponse.json({ error: 'Captain and vice-captain are required' }, { status: 400 });
    }
    
    // Get or create team
    let team = await prisma.team.findUnique({
      where: { userId: session.userId },
    });
    
    if (!team) {
      // Create team with default name
      const user = await prisma.user.findUnique({ where: { id: session.userId } });
      team = await prisma.team.create({
        data: {
          userId: session.userId,
          name: `${user?.username || 'Unknown'}'s Team`,
          initialBudget: 100,
          bankBalance: 100,
          teamValue: 0,
        },
      });
    }
    
    // Calculate total cost
    const totalCost = players.reduce((sum, p) => sum + p.purchasePrice, 0);
    
    if (totalCost > 100) {
      return NextResponse.json({ error: 'Squad exceeds budget' }, { status: 400 });
    }

    // Nation-limit check (3 max per nation). Mirrors /api/transfers and the
    // single-player add endpoint at /api/squad. We fetch all submitted
    // players in one query and bucket by nationId.
    const submittedPlayers = await prisma.player.findMany({
      where: { id: { in: players.map((p) => p.playerId) } },
      select: { id: true, nationId: true, displayName: true, nation: { select: { name: true } } },
    });
    if (submittedPlayers.length !== players.length) {
      return NextResponse.json(
        { error: 'One or more players in your squad could not be found.' },
        { status: 400 },
      );
    }
    const nationCounts: Record<string, { count: number; name: string }> = {};
    for (const p of submittedPlayers) {
      const entry = nationCounts[p.nationId];
      if (entry) {
        entry.count += 1;
      } else {
        nationCounts[p.nationId] = { count: 1, name: p.nation.name };
      }
    }
    for (const { count, name } of Object.values(nationCounts)) {
      if (count > 3) {
        return NextResponse.json(
          { error: `Cannot have more than 3 players from ${name} (you have ${count}).` },
          { status: 400 },
        );
      }
    }

    // Clear existing squad players
    await prisma.squadPlayer.deleteMany({
      where: { teamId: team.id },
    });
    
    // Create squad players
    const squadPlayersData = players.map((p) => {
      const isStarting = startingXI.includes(p.playerId);
      const benchIndex = bench.indexOf(p.playerId);
      
      return {
        teamId: team!.id,
        playerId: p.playerId,
        purchasePrice: p.purchasePrice,
        isStarting,
        isCaptain: p.playerId === captainId,
        isViceCaptain: p.playerId === viceCaptainId,
        benchOrder: isStarting ? null : (benchIndex + 1),
      };
    });
    
    await prisma.squadPlayer.createMany({
      data: squadPlayersData,
    });
    
    // Update team
    await prisma.team.update({
      where: { id: team.id },
      data: {
        bankBalance: 100 - totalCost,
        teamValue: totalCost,
      },
    });
    
    // Ensure global league exists and join if not already
    let globalLeague = await prisma.league.findFirst({
      where: { isGlobal: true },
    });
    
    // Create global league if it doesn't exist
    if (!globalLeague) {
      // Get admin user to be owner
      const adminUser = await prisma.user.findFirst({
        where: { isAdmin: true },
      });
      
      if (adminUser) {
        globalLeague = await prisma.league.create({
          data: {
            name: 'World Cup 2026 - Global League',
            code: 'WC2026GL',
            ownerId: adminUser.id,
            isGlobal: true,
          },
        });
      }
    }
    
    // Join global league if it exists
    if (globalLeague) {
      const existing = await prisma.leagueMembership.findFirst({
        where: {
          leagueId: globalLeague.id,
          teamId: team.id,
        },
      });
      
      if (!existing) {
        await prisma.leagueMembership.create({
          data: {
            leagueId: globalLeague.id,
            teamId: team.id,
            userId: session.userId,
          },
        });
        console.log(`Team ${team.id} added to global league ${globalLeague.id}`);
      } else {
        console.log(`Team ${team.id} already in global league`);
      }
    } else {
      console.log('Warning: Global league not found, team not added to league');
    }
    
    console.log('Squad saved successfully for team:', team.id);
    return NextResponse.json({ success: true, teamId: team.id });
    
  } catch (error) {
    console.error('Save squad error:', error);
    return NextResponse.json({ error: 'Failed to save squad. Please try again.' }, { status: 500 });
  }
}
