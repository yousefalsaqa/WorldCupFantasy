// ============================================
// EMERGENCY OVERRIDE - Manual Point Adjustments
// For when API-Football misses something
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Verify admin
    const admin = await requireAdmin();

    const body = await request.json();
    const { playerId, matchId, points, reason } = body;

    if (!playerId || points === undefined) {
      return NextResponse.json(
        { error: 'playerId and points are required' },
        { status: 400 }
      );
    }

    // Validate player exists
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: { nation: true },
    });

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    let result;

    if (matchId) {
      // Match-specific adjustment - update bonusPoints for that match
      const performance = await prisma.playerPerformance.findFirst({
        where: { playerId, matchId },
      });

      if (performance) {
        // Update existing performance
        result = await prisma.playerPerformance.update({
          where: { id: performance.id },
          data: {
            bonusPoints: performance.bonusPoints + points,
            totalPoints: performance.totalPoints + points,
          },
        });
      } else {
        // Create new performance record for this match
        result = await prisma.playerPerformance.create({
          data: {
            playerId,
            matchId,
            bonusPoints: points,
            totalPoints: points,
          },
        });
      }

      // Log the action
      await prisma.auditLog.create({
        data: {
          action: 'MANUAL_OVERRIDE_MATCH',
          details: JSON.stringify({
            playerId,
            playerName: player.displayName,
            matchId,
            pointsAdded: points,
            reason: reason || 'Manual adjustment',
            performanceId: result.id,
            adminUserId: admin.userId,
          }),
          userId: admin.userId,
        },
      });

      return NextResponse.json({
        success: true,
        type: 'match_specific',
        player: player.displayName,
        pointsAdded: points,
        newTotal: result.totalPoints,
        reason: reason || 'Manual adjustment',
      });
    } else {
      // Total adjustment - add to the most recent match or create adjustment record
      // Find the most recent match for this player's nation
      const recentMatch = await prisma.match.findFirst({
        where: {
          OR: [
            { homeNationId: player.nationId },
            { awayNationId: player.nationId },
          ],
          isFinished: true,
        },
        orderBy: { id: 'desc' },
      });

      if (recentMatch) {
        // Add to the most recent match performance
        const performance = await prisma.playerPerformance.findFirst({
          where: { playerId, matchId: recentMatch.id },
        });

        if (performance) {
          result = await prisma.playerPerformance.update({
            where: { id: performance.id },
            data: {
              bonusPoints: performance.bonusPoints + points,
              totalPoints: performance.totalPoints + points,
            },
          });
        } else {
          result = await prisma.playerPerformance.create({
            data: {
              playerId,
              matchId: recentMatch.id,
              bonusPoints: points,
              totalPoints: points,
            },
          });
        }
      } else {
        return NextResponse.json(
          { error: 'No matches found for this player. Use match-specific adjustment.' },
          { status: 400 }
        );
      }

      // Log the action
      await prisma.auditLog.create({
        data: {
          action: 'MANUAL_OVERRIDE_TOTAL',
          details: JSON.stringify({
            playerId,
            playerName: player.displayName,
            pointsAdded: points,
            reason: reason || 'Manual total adjustment',
            adminUserId: admin.userId,
          }),
          userId: admin.userId,
        },
      });

      return NextResponse.json({
        success: true,
        type: 'total_adjustment',
        player: player.displayName,
        pointsAdded: points,
        reason: reason || 'Manual total adjustment',
      });
    }
  } catch (error) {
    console.error('[Override] Error:', error);
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to apply override' },
      { status: 500 }
    );
  }
}

// GET - Search players for override
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const playerId = searchParams.get('playerId');

    if (playerId) {
      // Get specific player with their matches
      const player = await prisma.player.findUnique({
        where: { id: playerId },
        include: {
          nation: true,
          performances: {
            include: {
              match: {
                include: {
                  homeNation: true,
                  awayNation: true,
                },
              },
            },
            orderBy: { id: 'desc' },
          },
        },
      });

      return NextResponse.json({ player });
    }

    if (search.length < 2) {
      return NextResponse.json({ players: [] });
    }

    // Search players
    const players = await prisma.player.findMany({
      where: {
        OR: [
          { displayName: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ],
      },
      include: {
        nation: true,
      },
      take: 10,
    });

    return NextResponse.json({ players });
  } catch (error) {
    console.error('[Override] Search error:', error);
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
