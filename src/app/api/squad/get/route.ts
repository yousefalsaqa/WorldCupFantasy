import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { computeUnlimitedTransfers } from '@/lib/unlimited-transfers';
import { parsePendingTransfers } from '@/lib/pending-transfers';

export const dynamic = 'force-dynamic';

interface FreeHitSnapshotPlayer {
  playerId: string;
  purchasePrice: number;
  isStarting: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  benchOrder: number | null;
  points: number;
}

interface FreeHitSnapshot {
  stageId: string;
  stageName?: string;
  capturedAt?: string;
  bankBalance: number;
  teamValue: number;
  freeTransfers: number;
  transfersUsed: number;
  players: FreeHitSnapshotPlayer[];
}

/**
 * If the user activated Free Hit in a stage that is no longer the active one,
 * restore their squad + bank to the snapshot taken at activation time.
 * Idempotent and runs at the start of every squad load. Returns true if a
 * revert actually happened so the caller can decide whether to re-read team.
 */
async function maybeRevertFreeHit(teamId: string, snapshotJson: string | null): Promise<boolean> {
  if (!snapshotJson) return false;

  let snapshot: FreeHitSnapshot;
  try {
    snapshot = JSON.parse(snapshotJson);
  } catch {
    // Corrupt snapshot – clear it so we don't loop on every load
    await prisma.team.update({ where: { id: teamId }, data: { freeHitSnapshot: null } });
    return false;
  }

  // Look up the stage Free Hit was activated in. If that stage is still the
  // active one, the gameweek hasn't ended – do nothing yet.
  const activationStage = await prisma.stage.findUnique({
    where: { id: snapshot.stageId },
    select: { isActive: true },
  });
  if (activationStage?.isActive) return false;

  // Stage has ended – restore the snapshot. createMany + 15s timeout because
  // Neon's pooler adds per-query latency and looping create() calls blew the
  // default 5s transaction window.
  await prisma.$transaction(async (tx) => {
    await tx.squadPlayer.deleteMany({ where: { teamId } });
    await tx.squadPlayer.createMany({
      data: snapshot.players.map(p => ({
        teamId,
        playerId: p.playerId,
        purchasePrice: p.purchasePrice,
        isStarting: p.isStarting,
        isCaptain: p.isCaptain,
        isViceCaptain: p.isViceCaptain,
        benchOrder: p.benchOrder,
        points: p.points,
      })),
    });
    await tx.team.update({
      where: { id: teamId },
      data: {
        bankBalance: snapshot.bankBalance,
        teamValue: snapshot.teamValue,
        freeTransfers: snapshot.freeTransfers,
        transfersUsed: snapshot.transfersUsed,
        freeHitSnapshot: null,
      },
    });
  }, { timeout: 15000 });
  return true;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ squad: [] }, { status: 200 });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ squad: [] }, { status: 200 });
    }

    const userId = decoded.userId;

    const team = await prisma.team.findUnique({
      where: { userId },
    });

    if (!team) {
      return NextResponse.json({ squad: [] }, { status: 200 });
    }

    // Auto-revert Free Hit if the activation stage has ended. We pass the
    // already-loaded snapshot string so the helper avoids a redundant DB
    // hit when there's nothing to revert (the common case).
    const reverted = await maybeRevertFreeHit(team.id, team.freeHitSnapshot);

    // Only re-read team if revert actually changed bank/transfers. Saves a
    // round trip for every squad load that doesn't trigger a Free Hit revert.
    const refreshedTeam = reverted
      ? await prisma.team.findUnique({ where: { id: team.id } })
      : team;

    // No `performances` include here – that join was the heaviest part of
    // this endpoint and the stats it produced are zero pre-tournament. The
    // player detail modal can lazy-fetch real stats via a dedicated endpoint
    // when the user opens it (and once the tournament starts).
    const squadPlayers = await prisma.squadPlayer.findMany({
      where: { teamId: team.id },
      include: {
        player: {
          include: { nation: true },
        },
      },
    });

    // Live points overlay — when a match is currently in progress and
    // /api/live/update has written PlayerPerformance rows with
    // `isLive=true`, we surface a `livePoints` field so the squad page
    // pill can tick up every 60s without waiting for `SquadPlayer.points`
    // to be incremented at FT. We keep `points` as the persisted total
    // so any view that wants the finalized number can still read it.
    //
    // Captain multiplier is INTENTIONALLY NOT applied here — `points`
    // stores raw per-player contributions, not captain-doubled values
    // (the doubling lives in `Team.totalPoints` via `updateSquadPoints`).
    // Doubling only the live additions would create an inconsistent
    // "pill jumps down at FT" UX, so we keep the pill raw and let the
    // captain armband communicate the multiplier visually.
    const playerIds = squadPlayers.map(sp => sp.playerId);
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

    // Drive client-side polling. We treat "any match in progress" as the
    // signal — even if the user's bench is playing, they want the pill
    // ticking. Count is cheap (indexed bool fields) so we keep it in
    // every squad-get response.
    const liveMatchCount = await prisma.match.count({
      where: { isStarted: true, isFinished: false },
    });

    // --- Late-joiner "provisional points" -----------------------------------
    // A team is "late" for the active stage when its first complete squad save
    // landed at/after that stage's deadline (realistically: brand-new joiners).
    // Their points DON'T count toward the team total or league rank this stage,
    // but we still SHOW the per-player points on their OWN squad page so they
    // can follow along. We derive those provisional points here from the active
    // stage's PlayerPerformance rows (live + finished) rather than banking them,
    // so the scoring engine and standings stay untouched. This keys off each
    // stage's own deadline, so it works for a late joiner at ANY stage.
    const activeStage = await prisma.stage.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, order: true, deadlineTime: true },
    });
    const effectiveTeam = refreshedTeam ?? team;
    const isLate = !!(
      activeStage?.deadlineTime &&
      (effectiveTeam.firstSquadSavedAt ?? effectiveTeam.createdAt) >= activeStage.deadlineTime
    );

    // Matches in the active stage — ids/flags reused by the nation-gate below
    // and the provisional perf sums above.
    const activeStageMatches = activeStage
      ? await prisma.match.findMany({
          where: { stageId: activeStage.id },
          select: {
            id: true,
            isStarted: true,
            isFinished: true,
            kickoffTime: true,
            homeNation: { select: { code: true } },
            awayNation: { select: { code: true } },
          },
        })
      : [];

    // Provisional per-player points for a late team: every perf row (live or
    // finished) the player has in the active stage. Empty for eligible teams.
    const provisionalByPlayer = new Map<string, number>();
    let nextCountingStageName: string | null = null;
    if (isLate && activeStage) {
      const stageMatchIds = activeStageMatches.map((m) => m.id);
      if (stageMatchIds.length > 0 && playerIds.length > 0) {
        const perfs = await prisma.playerPerformance.findMany({
          where: { playerId: { in: playerIds }, matchId: { in: stageMatchIds } },
          select: { playerId: true, totalPoints: true },
        });
        for (const p of perfs) {
          provisionalByPlayer.set(
            p.playerId,
            (provisionalByPlayer.get(p.playerId) ?? 0) + p.totalPoints,
          );
        }
      }
      // The stage they DO start counting from = the next stage by order.
      const next = await prisma.stage.findFirst({
        where: { order: { gt: activeStage.order } },
        orderBy: { order: 'asc' },
        select: { name: true },
      });
      nextCountingStageName = next?.name ?? null;
    }

    const squad = squadPlayers.map(sp => {
      // Late teams see the active stage's provisional points (never banked);
      // eligible teams see the normal live overlay (banked + in-progress).
      const liveAdd = isLate
        ? (provisionalByPlayer.get(sp.playerId) ?? 0)
        : (livePointsByPlayer.get(sp.playerId) ?? 0);
      return {
        id: sp.id,
        playerId: sp.playerId,
        purchasePrice: sp.purchasePrice,
        points: sp.points,
        livePoints: sp.points + liveAdd,
        isStarting: sp.isStarting,
        isCaptain: sp.isCaptain,
        isViceCaptain: sp.isViceCaptain,
        benchOrder: sp.benchOrder,
        player: {
          id: sp.player.id,
          name: sp.player.displayName,
          displayName: sp.player.displayName,
          position: sp.player.position,
          currentPrice: sp.player.currentPrice,
          shirtNumber: sp.player.shirtNumber,
          photoUrl: sp.player.photoUrl,
          nation: {
            id: sp.player.nation.id,
            name: sp.player.nation.name,
            code: sp.player.nation.code,
            kitColor1: sp.player.nation.kitColor1,
            kitColor2: sp.player.nation.kitColor2,
          },
        },
        stats: {
          goals: 0,
          assists: 0,
          passAccuracy: 0,
          interceptions: 0,
          tackles: 0,
          dribbles: 0,
          minutes: 0,
        },
      };
    });

    const unlimitedTransfers = await computeUnlimitedTransfers(team.id);

    // Hydrate transfers queued for next round so the squad page can show a
    // "queued for next round" card with cancel buttons. Player lookups only
    // run when a queue exists (rare path).
    const pendingList = parsePendingTransfers((refreshedTeam ?? team).pendingTransfers);
    let queuedTransfers: Array<{
      playerOut: { id: string; displayName: string; position: string; nationCode: string } | null;
      playerIn: { id: string; displayName: string; position: string; nationCode: string } | null;
      priceIn: number;
      priceOut: number;
      queuedAt: string;
    }> = [];
    if (pendingList.length > 0) {
      const ids = Array.from(
        new Set(pendingList.flatMap((t) => [t.playerOutId, t.playerInId])),
      );
      const players = await prisma.player.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          displayName: true,
          position: true,
          nation: { select: { code: true } },
        },
      });
      const byId = new Map(players.map((p) => [p.id, p]));
      const summary = (id: string) => {
        const p = byId.get(id);
        return p
          ? { id: p.id, displayName: p.displayName, position: p.position, nationCode: p.nation.code }
          : null;
      };
      queuedTransfers = pendingList.map((t) => ({
        playerOut: summary(t.playerOutId),
        playerIn: summary(t.playerInId),
        priceIn: t.priceIn,
        priceOut: t.priceOut,
        queuedAt: t.queuedAt,
      }));
    }

    // Nations whose match in the ACTIVE stage has kicked off. The squad
    // page uses this to grey out / block illegal sub targets client-side
    // (played players can't enter the XI or have their bench slot moved).
    // Same gate as /api/squad/update: isStarted OR kickoff in the past —
    // empty when the stage isn't locked yet (pre-deadline, anything goes).
    const startedNationCodes: string[] = [];
    // Subset of startedNationCodes whose match is CURRENTLY in progress
    // (started, not finished). Lets the squad page word the sub-off warning
    // differently for "in play now" vs "already played" (finished).
    const liveNationCodes: string[] = [];
    if (activeStage?.deadlineTime && activeStage.deadlineTime <= new Date()) {
      const now = new Date();
      const codes = new Set<string>();
      const liveCodes = new Set<string>();
      for (const m of activeStageMatches) {
        if (m.isStarted || m.kickoffTime <= now) {
          codes.add(m.homeNation.code);
          codes.add(m.awayNation.code);
          if (m.isStarted && !m.isFinished) {
            liveCodes.add(m.homeNation.code);
            liveCodes.add(m.awayNation.code);
          }
        }
      }
      startedNationCodes.push(...Array.from(codes));
      liveNationCodes.push(...Array.from(liveCodes));
    }

    return NextResponse.json({
      squad,
      teamId: team.id,
      startedNationCodes,
      liveNationCodes,
      // Late-joiner provisional-points state. When isLate, the per-player
      // `livePoints` above are this stage's PROVISIONAL points (shown but not
      // counted); the team total/rank stay frozen. The page uses this to gate
      // its header total and show an explainer banner naming the round.
      isLate,
      lockedStageName: isLate ? (activeStage?.name ?? null) : null,
      nextCountingStageName,
      // Authoritative banked total (rank number). Late teams get the frozen
      // value here so the page header can show it instead of summing the
      // provisional pills.
      teamTotalPoints: effectiveTeam.totalPoints,
      bankBalance: refreshedTeam?.bankBalance ?? team.bankBalance,
      teamValue: refreshedTeam?.teamValue ?? team.teamValue,
      // Surface the transfer-budget fields so the squad page can drive the
      // transfer-mode UI (free transfers badge + hits calculation).
      freeTransfers: refreshedTeam?.freeTransfers ?? team.freeTransfers,
      transfersUsed: refreshedTeam?.transfersUsed ?? team.transfersUsed,
      // When true the squad page suppresses point-hit messaging since
      // transfers are effectively free.
      unlimitedTransfers,
      // Transfers queued while the current round is locked; applied at the
      // next stage boundary. Empty array when nothing is queued.
      queuedTransfers,
      // True iff there is at least one match currently in progress. The
      // squad page polls this endpoint every 60s while this is true so
      // the live-points pill ticks up. We keep the signal at the response
      // level (rather than embedded in each squad entry) so the client
      // can decide whether to start/stop its interval without diffing
      // per-row data.
      anyMatchLive: liveMatchCount > 0,
    });

  } catch (error) {
    console.error('Get squad error:', error);
    return NextResponse.json({ squad: [], error: 'Failed to fetch squad' }, { status: 500 });
  }
}
