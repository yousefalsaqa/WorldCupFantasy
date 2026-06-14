import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  parseActiveChips,
  hasTripleCaptain,
  hasBenchBoost,
  type ChipType,
} from '@/lib/chips-active';
import { getFlagCode } from '@/lib/flags';
import { liveTeamDeltas } from '@/lib/live-team-totals';

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
      select: { id: true, name: true, order: true, deadlineTime: true },
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

    // Late-joiner provisional points: mirror /api/squad/get so a team that
    // first saved after the active stage's deadline shows its players' points
    // (not 0) here too, while its total/rank stay frozen (liveTeamDeltas
    // already gates the header). Derived from the active stage's perf rows
    // (live + finished) rather than banked.
    const isLate = !!(
      activeStage?.deadlineTime &&
      (team.firstSquadSavedAt ?? team.createdAt) >= activeStage.deadlineTime
    );
    const provisionalByPlayer = new Map<string, number>();
    let lockedStageName: string | null = null;
    let nextCountingStageName: string | null = null;
    if (isLate && activeStage) {
      lockedStageName = activeStage.name;
      const stageMatches = await prisma.match.findMany({
        where: { stageId: activeStage.id },
        select: { id: true },
      });
      const ids = stageMatches.map((m) => m.id);
      if (ids.length > 0 && playerIds.length > 0) {
        const perfs = await prisma.playerPerformance.findMany({
          where: { playerId: { in: playerIds }, matchId: { in: ids } },
          select: { playerId: true, totalPoints: true },
        });
        for (const p of perfs) {
          provisionalByPlayer.set(p.playerId, (provisionalByPlayer.get(p.playerId) ?? 0) + p.totalPoints);
        }
      }
      const next = await prisma.stage.findFirst({
        where: { order: { gt: activeStage.order } },
        orderBy: { order: 'asc' },
        select: { name: true },
      });
      nextCountingStageName = next?.name ?? null;
    }

    const transformed = team.squadPlayers.map((sp) => {
      const liveAdd = isLate
        ? (provisionalByPlayer.get(sp.playerId) ?? 0)
        : (livePointsByPlayer.get(sp.playerId) ?? 0);
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
            || `https://flagcdn.com/24x18/${getFlagCode(sp.player.nation.code)}.png`,
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

    // Header live preview: banked + in-progress delta, chip/late-gate
    // aware (shared helper mirrors banking math). Equals totalPoints
    // whenever nothing is live.
    const liveDelta = (await liveTeamDeltas([team.id])).get(team.id) ?? 0;

    return NextResponse.json({
      teamId: team.id,
      teamName: team.name,
      managerName: team.user.username,
      totalPoints: team.totalPoints,
      liveTotalPoints: team.totalPoints + liveDelta,
      starting,
      bench,
      activeChips,
      tripleCaptainActive,
      benchBoostActive,
      anyMatchLive: liveMatchCount > 0,
      // Late-joiner: players show provisional points but the total/rank are
      // frozen this stage. Lets the team-view page explain the zero total.
      isLate,
      lockedStageName,
      nextCountingStageName,
    });
  } catch (error) {
    console.error('Error fetching team squad:', error);
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
  }
}
