// ============================================
// EMERGENCY OVERRIDE - Manual Point Adjustments
// For when API-Football misses something
// ============================================
//
// Three flows:
//   POST   /api/admin/override                -> apply a +/- adjustment
//   GET    /api/admin/override?search=...     -> search players
//   GET    /api/admin/override?playerId=...   -> fetch player + history
//   DELETE /api/admin/override?auditId=...    -> undo a prior adjustment
//
// IMPORTANT: every adjustment writes to THREE places so it surfaces
// consistently across the app:
//   1. PlayerPerformance.bonusPoints + totalPoints   (per-match row;
//      only when the override targets / can attach to a match)
//   2. SquadPlayer.points                            (per-team "card"
//      on this player — drives the squad-page pill)
//   3. Team.totalPoints                              (drives the admin
//      Users tab + league standings + dashboard)
//
// The historical bug we just fixed: step 3 was missing, so admin
// overrides showed up on /squad but not in the Users tab or league
// standings. Now applyPointsDeltaToTeams() handles 2+3 in lock-step,
// and rollbackPointsDeltaToTeams() is its exact inverse for DELETE.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Apply a raw point delta (positive or negative) to every team that
// owns this player. Updates BOTH SquadPlayer.points and Team.totalPoints
// in a single pass so they never drift.
//
// Team.totalPoints math:
//   - starting players: pointsDelta × (isCaptain ? 2 : 1)
//   - bench players: 0   (intentionally — bench points only land on
//     Team.totalPoints when Bench Boost is active in the relevant
//     stage; overrides are stage-agnostic so we keep the simple model
//     and let admins push bench overrides via the per-match path if
//     they need chip-aware math)
async function applyPointsDeltaToTeams(
  playerId: string,
  pointsDelta: number,
): Promise<{ squadRowsTouched: number; teamRowsTouched: number }> {
  const squadRows = await prisma.squadPlayer.findMany({
    where: { playerId },
    select: { teamId: true, isStarting: true, isCaptain: true },
  });

  if (squadRows.length === 0) {
    return { squadRowsTouched: 0, teamRowsTouched: 0 };
  }

  // Update every SquadPlayer.points row in one go.
  const sp = await prisma.squadPlayer.updateMany({
    where: { playerId },
    data: { points: { increment: pointsDelta } },
  });

  // Per-team Team.totalPoints delta, accounting for captain.
  let teamRowsTouched = 0;
  for (const row of squadRows) {
    if (!row.isStarting) continue;
    const teamDelta = pointsDelta * (row.isCaptain ? 2 : 1);
    if (teamDelta === 0) continue;
    await prisma.team.update({
      where: { id: row.teamId },
      data: { totalPoints: { increment: teamDelta } },
    });
    teamRowsTouched += 1;
  }

  return { squadRowsTouched: sp.count, teamRowsTouched };
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();

    const body = await request.json();
    const { playerId, matchId, points, reason } = body;

    if (!playerId || points === undefined) {
      return NextResponse.json(
        { error: 'playerId and points are required' },
        { status: 400 }
      );
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: { nation: true },
    });

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    if (matchId) {
      // Match-specific adjustment - update bonusPoints for that match,
      // then propagate to SquadPlayer.points + Team.totalPoints.
      const performance = await prisma.playerPerformance.findFirst({
        where: { playerId, matchId },
      });

      let perfResult;
      if (performance) {
        perfResult = await prisma.playerPerformance.update({
          where: { id: performance.id },
          data: {
            bonusPoints: performance.bonusPoints + points,
            totalPoints: performance.totalPoints + points,
          },
        });
      } else {
        perfResult = await prisma.playerPerformance.create({
          data: {
            playerId,
            matchId,
            bonusPoints: points,
            totalPoints: points,
          },
        });
      }

      const { squadRowsTouched, teamRowsTouched } =
        await applyPointsDeltaToTeams(playerId, points);

      await prisma.auditLog.create({
        data: {
          action: 'MANUAL_OVERRIDE_MATCH',
          details: JSON.stringify({
            playerId,
            playerName: player.displayName,
            matchId,
            pointsAdded: points,
            reason: reason || 'Manual adjustment',
            performanceId: perfResult.id,
            adminUserId: admin.userId,
            squadRowsTouched,
            teamRowsTouched,
          }),
          userId: admin.userId,
        },
      });

      return NextResponse.json({
        success: true,
        type: 'match_specific',
        player: player.displayName,
        pointsAdded: points,
        newTotal: perfResult.totalPoints,
        reason: reason || 'Manual adjustment',
        squadRowsTouched,
        teamRowsTouched,
      });
    }

    // Total adjustment - try to attach to a finished match first; if the
    // player's nation has no finished matches yet (eg. pre-tournament),
    // fall back to incrementing SquadPlayer.points directly across every
    // team that owns the player.
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

    let performanceId: string | null = null;
    if (recentMatch) {
      const performance = await prisma.playerPerformance.findFirst({
        where: { playerId, matchId: recentMatch.id },
      });

      if (performance) {
        const updated = await prisma.playerPerformance.update({
          where: { id: performance.id },
          data: {
            bonusPoints: performance.bonusPoints + points,
            totalPoints: performance.totalPoints + points,
          },
        });
        performanceId = updated.id;
      } else {
        const created = await prisma.playerPerformance.create({
          data: {
            playerId,
            matchId: recentMatch.id,
            bonusPoints: points,
            totalPoints: points,
          },
        });
        performanceId = created.id;
      }
    }

    // Always propagate to per-team rows + team totals — this is the
    // path Haaland-pre-WC hits before any real fixture exists, and the
    // path that drives the admin Users tab + league standings.
    const { squadRowsTouched, teamRowsTouched } =
      await applyPointsDeltaToTeams(playerId, points);

    await prisma.auditLog.create({
      data: {
        action: 'MANUAL_OVERRIDE_TOTAL',
        details: JSON.stringify({
          playerId,
          playerName: player.displayName,
          pointsAdded: points,
          reason: reason || 'Manual total adjustment',
          adminUserId: admin.userId,
          attachedToMatchId: recentMatch?.id ?? null,
          performanceId,
          squadRowsTouched,
          teamRowsTouched,
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
      attachedToMatch: recentMatch?.id ?? null,
      squadRowsTouched,
      teamRowsTouched,
    });
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

// DELETE - Undo a prior MANUAL_OVERRIDE_* audit entry.
//
// Applies the exact inverse of the original adjustment across all
// three storage layers, marks the original entry as reverted, and
// writes a paired MANUAL_OVERRIDE_REVERTED audit row pointing back.
// The UI hides both rows from default views so you don't end up with
// a +8 / -8 ladder in the player modal's Adjustments list.
export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin();

    const { searchParams } = new URL(request.url);
    const auditId = searchParams.get('auditId');
    if (!auditId) {
      return NextResponse.json(
        { error: 'auditId query param required' },
        { status: 400 }
      );
    }

    const original = await prisma.auditLog.findUnique({
      where: { id: auditId },
    });

    if (!original) {
      return NextResponse.json(
        { error: 'Audit entry not found' },
        { status: 404 }
      );
    }

    if (
      original.action !== 'MANUAL_OVERRIDE_TOTAL' &&
      original.action !== 'MANUAL_OVERRIDE_MATCH'
    ) {
      return NextResponse.json(
        { error: 'Only MANUAL_OVERRIDE_* entries can be undone' },
        { status: 400 }
      );
    }

    if (original.revertedAt) {
      return NextResponse.json(
        { error: 'This adjustment has already been reverted' },
        { status: 409 }
      );
    }

    type OverrideDetails = {
      playerId?: string;
      playerName?: string;
      pointsAdded?: number;
      matchId?: string | null;
      attachedToMatchId?: string | null;
      performanceId?: string | null;
      reason?: string;
      // Present only on entries written AFTER the Team.totalPoints
      // propagation fix. Used to detect legacy entries so we don't
      // push Team.totalPoints negative when undoing them.
      teamRowsTouched?: number;
    };
    let details: OverrideDetails;
    try {
      details = JSON.parse(original.details);
    } catch {
      return NextResponse.json(
        { error: 'Audit entry has malformed details' },
        { status: 500 }
      );
    }

    const playerId = details.playerId;
    const pointsAdded = details.pointsAdded;
    if (!playerId || typeof pointsAdded !== 'number') {
      return NextResponse.json(
        { error: 'Audit entry missing playerId or pointsAdded' },
        { status: 500 }
      );
    }

    // Legacy entries (pre-Team.totalPoints-fix) don't carry
    // teamRowsTouched in their details. For those we only reverse
    // SquadPlayer.points and the performance row — never
    // Team.totalPoints, because the original POST never wrote to it.
    const isLegacyEntry = details.teamRowsTouched === undefined;

    // 1) Reverse any per-match performance bonus the original applied.
    const targetMatchId = details.matchId ?? details.attachedToMatchId ?? null;
    let performanceTouched = false;
    if (targetMatchId) {
      const performance = await prisma.playerPerformance.findFirst({
        where: { playerId, matchId: targetMatchId },
      });
      if (performance) {
        await prisma.playerPerformance.update({
          where: { id: performance.id },
          data: {
            bonusPoints: performance.bonusPoints - pointsAdded,
            totalPoints: performance.totalPoints - pointsAdded,
          },
        });
        performanceTouched = true;
      }
    }

    // 2) Reverse the per-team contribution. Always undo SquadPlayer.points;
    // only undo Team.totalPoints if the original POST set it (i.e. not a
    // legacy entry written before the propagation fix).
    let squadRowsTouched = 0;
    let teamRowsTouched = 0;
    if (isLegacyEntry) {
      const sp = await prisma.squadPlayer.updateMany({
        where: { playerId },
        data: { points: { decrement: pointsAdded } },
      });
      squadRowsTouched = sp.count;
    } else {
      const result = await applyPointsDeltaToTeams(playerId, -pointsAdded);
      squadRowsTouched = result.squadRowsTouched;
      teamRowsTouched = result.teamRowsTouched;
    }

    // 3) Write the REVERTED audit entry, then point the original at it
    // and stamp revertedAt. Two writes — keep them adjacent so a reader
    // never sees an "in progress" state that mentions a non-existent
    // reverting row.
    const reversal = await prisma.auditLog.create({
      data: {
        action: 'MANUAL_OVERRIDE_REVERTED',
        details: JSON.stringify({
          revertedAuditId: original.id,
          originalAction: original.action,
          playerId,
          playerName: details.playerName,
          pointsReversed: pointsAdded,
          targetMatchId,
          performanceTouched,
          squadRowsTouched,
          teamRowsTouched,
          isLegacyEntry,
          adminUserId: admin.userId,
        }),
        userId: admin.userId,
      },
    });

    await prisma.auditLog.update({
      where: { id: original.id },
      data: {
        revertedAt: new Date(),
        revertedByAuditId: reversal.id,
      },
    });

    return NextResponse.json({
      success: true,
      revertedAuditId: original.id,
      reversalAuditId: reversal.id,
      pointsReversed: pointsAdded,
      performanceTouched,
      squadRowsTouched,
      teamRowsTouched,
    });
  } catch (error) {
    console.error('[Override] Undo error:', error);
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Failed to undo override' },
      { status: 500 }
    );
  }
}
