import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { parseActiveChips, type ChipType } from '@/lib/chips-active';

export const dynamic = 'force-dynamic';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;
  const decoded = await verifyToken(token);
  if (!decoded) return null;
  return { userId: decoded.userId };
}

interface InferPlayer { playerId: string; position: string; points: number; isCaptain: boolean }

// Best-guess captain for a pre-snapshot round. The settled captainPoints =
// (mult − 1) × the captain's stage points, so the captain is a player whose
// stage points equal captainPoints/(mult−1). Used to correct the rewind when
// the manager changed captain after the round. Ambiguous when that value is 0
// (many blanks) — we then keep the rewind's pick or any match, preferring
// attackers. Returns the chosen captain id (or null to leave as-is).
function inferCaptainId(players: InferPlayer[], captainPoints: number, mult: number): string | null {
  if (mult <= 1) return null;
  const current = players.find((p) => p.isCaptain) ?? null;
  const target = captainPoints / (mult - 1);
  if (!Number.isInteger(target)) return current?.playerId ?? null;
  if (current && current.points === target) return current.playerId; // already consistent
  const cands = players.filter((p) => p.points === target);
  if (cands.length === 0) return current?.playerId ?? null;
  const order: Record<string, number> = { FWD: 0, MID: 1, DEF: 2, GK: 3 };
  cands.sort((a, b) => (order[a.position] ?? 9) - (order[b.position] ?? 9));
  return cands[0].playerId;
}

// Best-guess starting XI for a PRE-SNAPSHOT round (no stored lineup). We know
// the settled rawPoints = sum of the 11 starters' stage points, so we search
// for the set of 4 to bench whose points sum to (total − rawPoints), leaving a
// valid formation (1 GK / 3-5 DEF / 2-5 MID / 1-3 FWD) with the captain
// starting. Among valid solutions we prefer to bench the LOWEST scorers (so
// the strongest XI starts). Returns the starter id set, or null when no exact
// match exists (e.g. auto-subs shifted rawPoints) — caller falls back to the
// rewind flags. Inherently a guess where players blanked: a 0-pt starter and a
// 0-pt benched player are indistinguishable from points alone.
function inferStarters(players: InferPlayer[], rawPoints: number): Set<string> | null {
  if (players.length !== 15) return null;
  const total = players.reduce((n, p) => n + p.points, 0);
  const benchTarget = total - rawPoints;
  if (benchTarget < 0) return null;
  const captainId = players.find((p) => p.isCaptain)?.playerId;
  const benchable = players.map((_, i) => i).filter((i) => players[i].playerId !== captainId);
  const lexLess = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] < b[i]; }
    return false;
  };
  let best: number[] | null = null;
  let bestKey: number[] | null = null;
  const n = benchable.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const idxs = [benchable[a], benchable[b], benchable[c], benchable[d]];
          if (idxs.reduce((s, i) => s + players[i].points, 0) !== benchTarget) continue;
          const benchSet = new Set(idxs);
          let gk = 0, def = 0, mid = 0, fwd = 0;
          for (let i = 0; i < 15; i++) {
            if (benchSet.has(i)) continue;
            const pos = players[i].position;
            if (pos === 'GK') gk++; else if (pos === 'DEF') def++; else if (pos === 'MID') mid++; else if (pos === 'FWD') fwd++;
          }
          if (!(gk === 1 && def >= 3 && def <= 5 && mid >= 2 && mid <= 5 && fwd >= 1 && fwd <= 3)) continue;
          const key = idxs.map((i) => players[i].points).sort((x, y) => y - x);
          if (!bestKey || lexLess(key, bestKey)) { bestKey = key; best = idxs; }
        }
  if (!best) return null;
  const benchSet = new Set(best);
  return new Set(players.filter((_, i) => !benchSet.has(i)).map((p) => p.playerId));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ stageId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 });
    }

    const { stageId } = await params;

    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
      select: { id: true },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Get the stage
    const stage = await prisma.stage.findFirst({
      where: { stageId },
      select: { id: true, stageId: true, name: true, order: true },
    });

    if (!stage) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    // Get TeamStage data
    const teamStage = await prisma.teamStage.findUnique({
      where: { teamId_stageId: { teamId: team.id, stageId: stage.id } },
    });

    // Get all matches in this stage
    const matches = await prisma.match.findMany({
      where: { stageId: stage.id },
      include: {
        homeNation: { select: { id: true, name: true, code: true } },
        awayNation: { select: { id: true, name: true, code: true } },
      },
    });

    // Determine the squad as it was DURING this stage.
    //
    // Preferred: the squadSnapshot written by settleStage when the stage was
    // settled — an exact record of the players + lineup flags that played it.
    //
    // Fallback (rounds settled before snapshotting existed): rewind the current
    // squad through every transfer made in a LATER stage. Each later transfer
    // swapped playerOut → playerIn and the incoming player inherited the slot's
    // flags, so undoing it (playerIn → playerOut, carrying flags back) recovers
    // the historical owner. This gets the players exactly right but can only
    // approximate lineup/captain if they were changed after a transfer.
    type HistSlot = { playerId: string; isStarting: boolean; isCaptain: boolean; isViceCaptain: boolean; benchOrder: number | null };

    let histSlots: HistSlot[] | null = null;
    let usedSnapshot = false;
    if (teamStage?.squadSnapshot) {
      try {
        const parsed = JSON.parse(teamStage.squadSnapshot);
        if (Array.isArray(parsed) && parsed.every((s) => typeof s?.playerId === 'string')) {
          histSlots = parsed.map((s) => ({
            playerId: s.playerId,
            isStarting: !!s.isStarting,
            isCaptain: !!s.isCaptain,
            isViceCaptain: !!s.isViceCaptain,
            benchOrder: typeof s.benchOrder === 'number' ? s.benchOrder : null,
          }));
          usedSnapshot = true;
        }
      } catch {
        histSlots = null; // corrupt snapshot → fall through to rewind
      }
    }

    if (!histSlots) {
      const currentSquad = await prisma.squadPlayer.findMany({
        where: { teamId: team.id },
        select: { playerId: true, isStarting: true, isCaptain: true, isViceCaptain: true, benchOrder: true },
      });

      const allStages = await prisma.stage.findMany({ select: { id: true, order: true } });
      const orderByStageDbId = new Map(allStages.map((s) => [s.id, s.order]));

      // Newest transfers first so chained swaps in a single later stage rewind
      // in the right order.
      const teamTransfers = await prisma.transfer.findMany({
        where: { teamId: team.id },
        select: { playerInId: true, playerOutId: true, stageId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      const laterTransfers = teamTransfers.filter(
        (t) => t.stageId && (orderByStageDbId.get(t.stageId) ?? -1) > stage.order,
      );

      const slotByPlayer = new Map<string, HistSlot>();
      for (const sp of currentSquad) slotByPlayer.set(sp.playerId, { ...sp });
      for (const t of laterTransfers) {
        const inSlot = slotByPlayer.get(t.playerInId);
        if (!inSlot) continue; // already rewound past, or not a tracked slot
        slotByPlayer.delete(t.playerInId);
        slotByPlayer.set(t.playerOutId, { ...inSlot, playerId: t.playerOutId });
      }
      histSlots = Array.from(slotByPlayer.values());
    }
    const histPlayers = await prisma.player.findMany({
      where: { id: { in: histSlots.map((s) => s.playerId) } },
      include: {
        nation: { select: { id: true, name: true, code: true, kitColor1: true, kitColor2: true } },
      },
    });
    const playerById = new Map(histPlayers.map((p) => [p.id, p]));

    const squadPlayers = histSlots
      .map((s) => {
        const player = playerById.get(s.playerId);
        return player
          ? { playerId: s.playerId, isStarting: s.isStarting, isCaptain: s.isCaptain, isViceCaptain: s.isViceCaptain, benchOrder: s.benchOrder, player }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Get performance data for all squad players in this stage's matches
    const matchIds = matches.map(m => m.id);
    const playerIds = squadPlayers.map(sp => sp.playerId);

    const performances = matchIds.length > 0 && playerIds.length > 0
      ? await prisma.playerPerformance.findMany({
          where: {
            matchId: { in: matchIds },
            playerId: { in: playerIds },
          },
          include: {
            match: {
              include: {
                homeNation: { select: { name: true, code: true } },
                awayNation: { select: { name: true, code: true } },
              },
            },
          },
        })
      : [];

    // Build per-player breakdown
    const playerBreakdowns = squadPlayers.map(sp => {
      const playerPerfs = performances.filter(p => p.playerId === sp.playerId);
      const totalPoints = playerPerfs.reduce((sum, p) => sum + p.totalPoints, 0);

      const matchDetails = playerPerfs.map(perf => ({
        matchId: perf.matchId,
        opponent: perf.match.homeNation.code === sp.player.nation.code
          ? perf.match.awayNation.name
          : perf.match.homeNation.name,
        minutesPlayed: perf.minutesPlayed,
        goals: perf.goals,
        assists: perf.assists,
        cleanSheet: perf.cleanSheet,
        saves: perf.saves,
        yellowCards: perf.yellowCards,
        redCards: perf.redCards,
        ownGoals: perf.ownGoals,
        penaltiesSaved: perf.penaltiesSaved,
        penaltiesMissed: perf.penaltiesMissed,
        goalsConceeded: perf.goalsConceeded,
        bonusPoints: perf.bonusPoints,
        totalPoints: perf.totalPoints,
      }));

      return {
        playerId: sp.playerId,
        displayName: sp.player.displayName,
        position: sp.player.position,
        nation: sp.player.nation,
        photoUrl: sp.player.photoUrl,
        shirtNumber: sp.player.shirtNumber,
        isStarting: sp.isStarting,
        isCaptain: sp.isCaptain,
        isViceCaptain: sp.isViceCaptain,
        benchOrder: sp.benchOrder,
        totalPoints,
        matches: matchDetails,
      };
    });

    // For a PRE-SNAPSHOT round, the rewind carried the CURRENT lineup flags
    // back, so the starter/bench split reflects today's XI, not the one that
    // played the round. Re-derive a best-guess lineup from the settled
    // rawPoints so the formation at least adds up correctly. We skip this when
    // Bench Boost was active (every player counted, so rawPoints == total and
    // there's no bench to infer) and fall back silently if no exact subset
    // exists. `lineupInferred` tells the client the split is a best guess.
    let lineupInferred = false;
    if (!usedSnapshot && teamStage && playerBreakdowns.length === 15) {
      let chips = parseActiveChips(teamStage.chipsUsed);
      if (chips.length === 0 && teamStage.chipUsed) chips = [teamStage.chipUsed as ChipType];
      const benchBoost = chips.includes('BENCH_BOOST');
      const mult = chips.includes('TRIPLE_CAPTAIN') ? 3 : 2;

      // Resolve the captain from the settled captainPoints (the rewind may
      // show a captain swapped in later), and force that player to start.
      const correctedCaptainId = inferCaptainId(
        playerBreakdowns.map((p) => ({ playerId: p.playerId, position: p.position, points: p.totalPoints, isCaptain: p.isCaptain })),
        teamStage.captainPoints,
        mult,
      );
      const ipForInfer = playerBreakdowns.map((p) => ({
        playerId: p.playerId,
        position: p.position,
        points: p.totalPoints,
        isCaptain: correctedCaptainId ? p.playerId === correctedCaptainId : p.isCaptain,
      }));

      if (!benchBoost) {
        const starters = inferStarters(ipForInfer, teamStage.rawPoints);
        if (starters) {
          // Bench order: weakest first (best guess at sub priority).
          const benchSorted = playerBreakdowns
            .filter((p) => !starters.has(p.playerId))
            .sort((a, b) => a.totalPoints - b.totalPoints)
            .map((p) => p.playerId);
          for (const p of playerBreakdowns) {
            p.isStarting = starters.has(p.playerId);
            p.benchOrder = p.isStarting ? null : benchSorted.indexOf(p.playerId) + 1;
            if (correctedCaptainId) p.isCaptain = p.playerId === correctedCaptainId;
          }
          // Vice-captain: a vice must be a starter and not the captain. The
          // rewind can leave the vice flag on a now-benched player ("vice on
          // the bench"). Keep the rewound vice if it's a valid non-captain
          // starter; otherwise best-guess the highest-scoring non-captain
          // starter so a valid vice always shows on the pitch.
          let viceId = playerBreakdowns.find((p) => p.isViceCaptain && p.isStarting && !p.isCaptain)?.playerId ?? null;
          if (!viceId) {
            const cand = playerBreakdowns
              .filter((p) => p.isStarting && !p.isCaptain)
              .sort((a, b) => b.totalPoints - a.totalPoints)[0];
            viceId = cand?.playerId ?? null;
          }
          for (const p of playerBreakdowns) p.isViceCaptain = p.playerId === viceId;
          lineupInferred = true;
        }
      }
    }

    return NextResponse.json({
      lineupInferred,
      stage: {
        stageId: stage.stageId,
        name: stage.name,
      },
      teamStage: teamStage
        ? {
            rawPoints: teamStage.rawPoints,
            captainPoints: teamStage.captainPoints,
            transferHits: teamStage.transferHits,
            totalPoints: teamStage.totalPoints,
            chipUsed: teamStage.chipUsed,
            // Multi-chip array for the history badges. Falls back to the
            // legacy single chip if the new column hasn't been populated.
            chipsUsed: (() => {
              const arr = parseActiveChips(teamStage.chipsUsed);
              if (arr.length > 0) return arr;
              if (teamStage.chipUsed) return [teamStage.chipUsed as ChipType];
              return [];
            })(),
          }
        : null,
      players: playerBreakdowns,
      hasData: performances.length > 0,
    });
  } catch (error) {
    console.error('Error fetching gameweek data:', error);
    return NextResponse.json({ error: 'Failed to fetch gameweek data' }, { status: 500 });
  }
}
