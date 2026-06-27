import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { computeUnlimitedTransfers } from '@/lib/unlimited-transfers';
import { parsePendingTransfers } from '@/lib/pending-transfers';
import { liveTeamDeltas } from '@/lib/live-team-totals';

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

    // The per-player pill shows ACTIVE-STAGE points (computed further down
    // from this stage's PlayerPerformance rows), NOT the cumulative
    // SquadPlayer.points column. Captain multiplier is intentionally not
    // applied to the pill — the armband communicates ×2/×3 visually, and the
    // doubling lives in Team.totalPoints via updateSquadPoints.
    const playerIds = squadPlayers.map(sp => sp.playerId);

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

    // Per-player points for the ACTIVE STAGE ONLY — this is what the card
    // pill shows, so it "resets" every round automatically. We deliberately
    // do NOT read SquadPlayer.points: that column accumulates from when a
    // player JOINED the team (never reset at rollover), so held-since-GR1
    // players and transferred-in players were on different bases — the pills
    // mixed rounds. Sourcing from this stage's PlayerPerformance rows makes
    // every player consistent (this round's points), while the banked
    // leaderboard total (Team.totalPoints) is unaffected. `live` = all perf
    // rows this stage (in-progress + finished); `banked` = finished only.
    const activeStageLiveByPlayer = new Map<string, number>();
    const activeStageBankedByPlayer = new Map<string, number>();
    if (activeStage && playerIds.length > 0) {
      const stageMatchIds = activeStageMatches.map((m) => m.id);
      const finishedMatchIds = new Set(
        activeStageMatches.filter((m) => m.isFinished).map((m) => m.id),
      );
      if (stageMatchIds.length > 0) {
        const perfs = await prisma.playerPerformance.findMany({
          where: { playerId: { in: playerIds }, matchId: { in: stageMatchIds } },
          select: { playerId: true, matchId: true, totalPoints: true },
        });
        for (const p of perfs) {
          activeStageLiveByPlayer.set(
            p.playerId,
            (activeStageLiveByPlayer.get(p.playerId) ?? 0) + p.totalPoints,
          );
          if (finishedMatchIds.has(p.matchId)) {
            activeStageBankedByPlayer.set(
              p.playerId,
              (activeStageBankedByPlayer.get(p.playerId) ?? 0) + p.totalPoints,
            );
          }
        }
      }
    }

    // Late joiners: the stage they DO start counting from = the next stage by
    // order. (Their per-player pills are the same active-stage figures above —
    // shown but never banked into the team total.)
    let nextCountingStageName: string | null = null;
    if (isLate && activeStage) {
      const next = await prisma.stage.findFirst({
        where: { order: { gt: activeStage.order } },
        orderBy: { order: 'asc' },
        select: { name: true },
      });
      nextCountingStageName = next?.name ?? null;
    }

    const squad = squadPlayers.map(sp => {
      // Per-round pill (see active-stage maps above). `points` = banked this
      // stage (finished matches), `livePoints` = banked + in-progress this
      // stage. Same basis for late and eligible teams; late teams' figures
      // just don't roll into the banked team total below.
      return {
        id: sp.id,
        playerId: sp.playerId,
        purchasePrice: sp.purchasePrice,
        points: activeStageBankedByPlayer.get(sp.playerId) ?? 0,
        livePoints: activeStageLiveByPlayer.get(sp.playerId) ?? 0,
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

    // Pre-Free-Hit squad for the Planned view. While a Free Hit is active for
    // the CURRENT stage, next round reverts to the squad captured at activation
    // (maybeRevertFreeHit only reverts AFTER the stage ends — so an un-reverted
    // snapshot whose stage is still active is exactly "Free Hit live this
    // round"). The Planned view must preview THAT squad, not the temporary
    // Free Hit XI. Null whenever no Free Hit is live.
    let plannedBaseSquad:
      | Array<{ playerId: string; isStarting: boolean; isCaptain: boolean; isViceCaptain: boolean; benchOrder: number | null }>
      | null = null;
    if (!reverted && team.freeHitSnapshot) {
      try {
        const snap = JSON.parse(team.freeHitSnapshot) as FreeHitSnapshot;
        if (snap.stageId === activeStage?.id && Array.isArray(snap.players)) {
          plannedBaseSquad = snap.players.map((p) => ({
            playerId: p.playerId,
            isStarting: p.isStarting,
            isCaptain: p.isCaptain,
            isViceCaptain: p.isViceCaptain,
            benchOrder: p.benchOrder,
          }));
        }
      } catch { /* corrupt snapshot — handled by maybeRevertFreeHit, ignore here */ }
    }

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
    // Pending points hit from queued over-allotment transfers (-4 each),
    // charged to next round when they apply. Shown as a "losing points" badge.
    const queuedHit = pendingList.filter((t) => !t.isWildcard && t.isFree === false).length * 4;

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
      // Live-inclusive authoritative total = banked + in-progress delta. This
      // is the exact number the league/standings show (captain x mult, bench
      // boost, AND transfer hits all handled by the canonical banking math),
      // so the squad header can match it instead of summing raw pills. Late
      // teams resolve to 0 (delta is late-gated, totalPoints frozen).
      teamLivePoints: effectiveTeam.totalPoints + ((await liveTeamDeltas([team.id])).get(team.id) ?? 0),
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
      // Pending points hit (-pts) from over-allotment queued transfers,
      // applied next round. Drives the "losing points" indicator.
      queuedHit,
      // The user's saved next-round lineup (raw JSON string) for the planned
      // squad, or null. The squad page hydrates the Planned view from this.
      plannedLineup: (refreshedTeam ?? team).plannedLineup ?? null,
      // Pre-Free-Hit squad (ids + roles) when a Free Hit is live this round.
      // The Planned view bases its preview on this (next round reverts to it)
      // instead of the temporary Free Hit XI. Null when no Free Hit is active.
      plannedBaseSquad,
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
