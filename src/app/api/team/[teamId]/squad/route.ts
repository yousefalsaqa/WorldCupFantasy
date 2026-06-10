import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  parseActiveChips,
  hasTripleCaptain,
  hasBenchBoost,
  type ChipType,
} from '@/lib/chips-active';

export const dynamic = 'force-dynamic';

// ============================================
// GET /api/team/[teamId]/squad
//
// Returns a single team's squad with everything the league team-view
// page needs to mirror the user's own /squad page:
//
//   - per-player live points overlay (PlayerPerformance.isLive)
//   - active chips on this team (so the team-view can show ×3 when
//     Triple Captain is on)
//   - `anyMatchLive` so the client knows whether to poll
//
// Read-only: no auth gate beyond Next.js's same-origin defaults — any
// logged-in league member needs to be able to peek at any other team
// in the league. Sensitive fields (bank, transfers) are intentionally
// NOT included.
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        user: { select: { username: true } },
        squadPlayers: {
          include: {
            player: { include: { nation: true } },
          },
        },
      },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Live points overlay — mirror the logic in /api/squad/get so the
    // pill on each player card ticks up while a match is in progress.
    // We DO NOT apply the captain multiplier here; raw per-player
    // points are what the pill shows, and the captain armband + the
    // shared visual ×2/×3 badge handle the multiplication client-side.
    const playerIds = team.squadPlayers.map((sp) => sp.playerId);
    const livePerfs = playerIds.length > 0
      ? await prisma.playerPerformance.findMany({
          where: { playerId: { in: playerIds }, isLive: true },
          select: { playerId: true, totalPoints: true },
        })
      : [];
    const livePointsByPlayer = new Map<string, number>();
    for (const perf of livePerfs) {
      livePointsByPlayer.set(
        perf.playerId,
        (livePointsByPlayer.get(perf.playerId) ?? 0) + perf.totalPoints,
      );
    }

    // Active chips on THIS team in the currently-active stage. We need
    // this so the team-view page can correctly visualize ×3 (Triple
    // Captain) instead of always defaulting to ×2 — the friend's
    // captain stuck at "×1" bug the user reported was caused by the
    // page not knowing whether TC was active.
    const activeStage = await prisma.stage.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    let activeChips: ChipType[] = [];
    if (activeStage) {
      const teamStage = await prisma.teamStage.findUnique({
        where: { teamId_stageId: { teamId: team.id, stageId: activeStage.id } },
        select: { chipsUsed: true, chipUsed: true },
      });
      activeChips = parseActiveChips(teamStage?.chipsUsed);
      if (activeChips.length === 0 && teamStage?.chipUsed) {
        activeChips = [teamStage.chipUsed as ChipType];
      }
    }
    const tripleCaptainActive = hasTripleCaptain(activeChips);
    const benchBoostActive = hasBenchBoost(activeChips);

    const transformed = team.squadPlayers.map((sp) => {
      const liveAdd = livePointsByPlayer.get(sp.playerId) ?? 0;
      return {
        id: sp.player.id,
        playerId: sp.player.id,
        name: sp.player.displayName,
        displayName: sp.player.displayName,
        position: sp.player.position,
        shirtNumber: sp.player.shirtNumber,
        photoUrl: sp.player.photoUrl,
        // `points` is the finalized total written at FT; `livePoints`
        // adds in-progress PlayerPerformance.totalPoints on top. Both
        // are surfaced so different views can choose their preference.
        points: sp.points,
        livePoints: sp.points + liveAdd,
        isStarting: sp.isStarting,
        isCaptain: sp.isCaptain,
        isViceCaptain: sp.isViceCaptain,
        benchOrder: sp.benchOrder,
        nation: {
          name: sp.player.nation.name,
          code: sp.player.nation.code,
          kitColor1: sp.player.nation.kitColor1,
          kitColor2: sp.player.nation.kitColor2,
          flagUrl: sp.player.nation.flagUrl
            || `https://flagcdn.com/24x18/${sp.player.nation.code.toLowerCase()}.png`,
        },
      };
    });

    const starting = transformed.filter((p) => p.isStarting).sort((a, b) => {
      const posOrder = { FWD: 0, MID: 1, DEF: 2, GK: 3 };
      return (posOrder[a.position as keyof typeof posOrder] || 0) - (posOrder[b.position as keyof typeof posOrder] || 0);
    });

    const bench = transformed
      .filter((p) => !p.isStarting)
      .sort((a, b) => (a.benchOrder || 99) - (b.benchOrder || 99));

    // Drive client-side polling. Same signal as /api/squad/get so both
    // pages share polling cadence and start/stop conditions.
    const liveMatchCount = await prisma.match.count({
      where: { isStarted: true, isFinished: false },
    });

    return NextResponse.json({
      teamId: team.id,
      teamName: team.name,
      managerName: team.user.username,
      totalPoints: team.totalPoints,
      starting,
      bench,
      activeChips,
      tripleCaptainActive,
      benchBoostActive,
      anyMatchLive: liveMatchCount > 0,
    });
  } catch (error) {
    console.error('Error fetching team squad:', error);
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
  }
}
