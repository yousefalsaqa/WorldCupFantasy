// ============================================
// STAGE SETTLEMENT — runs exactly once when a stage's last match goes FT,
// from advanceOnce() in stage-advance.ts, BEFORE the Free Hit revert (the
// squad that actually played the stage is the one that must be scored).
//
// Three jobs:
//   1. AUTO-SUBS: starters whose nation played but who got 0 minutes are
//      replaced (scoring-only — the saved lineup is untouched) by the
//      highest-priority bench player who DID play, GK for GK, formation
//      kept legal via canSubstitutePlayer. Skipped for Bench Boost teams
//      (their bench already scored).
//   2. VICE-CAPTAIN FALLBACK: if the captain's nation played but the
//      captain got 0 minutes, the armband multiplier (x2, or x3 with
//      Triple Captain) is applied to the vice-captain's stage points
//      instead — provided the vice actually played and counted (starter,
//      auto-subbed in, or bench-boosted).
//   3. HISTORY SNAPSHOT: writes TeamStage rawPoints / captainPoints /
//      transferHits / totalPoints so /history shows real numbers.
//
// Late joiners (first complete squad save — firstSquadSavedAt, falling
// back to createdAt — at/after the stage deadline) earned nothing this
// stage (squad-points gates them), so they get no adjustments and a
// zeroed snapshot.
//
// Idempotence: advanceOnce() flips the stage inactive in the same pass,
// so settlement cannot run twice for the same stage in normal operation.
// ============================================

import { prisma } from './db';
import { canSubstitutePlayer } from './validation';
import {
  parseActiveChips,
  hasTripleCaptain,
  hasBenchBoost,
  type ChipType,
} from './chips-active';

export interface SettlementResult {
  teamsSettled: number;
  autoSubs: number;
  vcFallbacks: number;
  pointsAdjusted: number;
}

interface StageRef {
  id: string;
  deadlineTime: Date | null;
}

export async function settleStage(stage: StageRef): Promise<SettlementResult> {
  const result: SettlementResult = { teamsSettled: 0, autoSubs: 0, vcFallbacks: 0, pointsAdjusted: 0 };

  // Stage facts: which nations actually played, and per-player minutes/points
  const matches = await prisma.match.findMany({
    where: { stageId: stage.id, isFinished: true },
    select: { id: true, homeNationId: true, awayNationId: true },
  });
  if (matches.length === 0) return result;
  const playedNationIds = new Set(matches.flatMap((m) => [m.homeNationId, m.awayNationId]));

  const perfs = await prisma.playerPerformance.findMany({
    where: { matchId: { in: matches.map((m) => m.id) } },
    select: { playerId: true, minutesPlayed: true, totalPoints: true },
  });
  const minutesByPlayer = new Map<string, number>();
  const pointsByPlayer = new Map<string, number>();
  for (const p of perfs) {
    minutesByPlayer.set(p.playerId, (minutesByPlayer.get(p.playerId) || 0) + p.minutesPlayed);
    pointsByPlayer.set(p.playerId, (pointsByPlayer.get(p.playerId) || 0) + p.totalPoints);
  }
  const played = (playerId: string) => (minutesByPlayer.get(playerId) || 0) > 0;
  const stagePts = (playerId: string) => pointsByPlayer.get(playerId) || 0;

  // Per-team chip sets for this stage
  const teamStages = await prisma.teamStage.findMany({
    where: { stageId: stage.id },
    select: { teamId: true, chipsUsed: true, chipUsed: true },
  });
  const chipsByTeam = new Map<string, ChipType[]>();
  for (const ts of teamStages) {
    let chips = parseActiveChips(ts.chipsUsed);
    if (chips.length === 0 && ts.chipUsed) chips = [ts.chipUsed as ChipType];
    chipsByTeam.set(ts.teamId, chips);
  }

  // Per-team transfer hits this stage (each non-free, non-chip transfer
  // already cost 4 points at transfer time; here we just record them).
  const stageTransfers = await prisma.transfer.groupBy({
    by: ['teamId'],
    where: {
      stageId: stage.id,
      isFreeTransfer: false,
      isWildcard: false,
      isMercyTransfer: false,
    },
    _count: { id: true },
  });
  const hitsByTeam = new Map(stageTransfers.map((t) => [t.teamId, t._count.id * 4]));

  const teams = await prisma.team.findMany({
    include: {
      squadPlayers: {
        include: { player: { select: { id: true, position: true, nationId: true } } },
      },
    },
  });

  for (const team of teams) {
    if (team.squadPlayers.length === 0) continue;
    const isLate =
      !!stage.deadlineTime &&
      (team.firstSquadSavedAt ?? team.createdAt) >= stage.deadlineTime;

    const chips = chipsByTeam.get(team.id) ?? [];
    const captainMultiplier = hasTripleCaptain(chips) ? 3 : 2;
    const benchBoost = hasBenchBoost(chips);

    const starters = team.squadPlayers.filter((sp) => sp.isStarting);
    const benchSorted = team.squadPlayers
      .filter((sp) => !sp.isStarting)
      .sort((a, b) => (a.benchOrder ?? 99) - (b.benchOrder ?? 99));

    // ---- 1) Auto-subs (scoring-only) ----
    const subbedInIds: string[] = [];
    let autoSubPoints = 0;
    if (!isLate && !benchBoost) {
      const formation = { DEF: 0, MID: 0, FWD: 0 };
      for (const sp of starters) {
        const pos = sp.player.position;
        if (pos === 'DEF' || pos === 'MID' || pos === 'FWD') formation[pos]++;
      }
      const usedBench = new Set<string>();
      for (const sp of starters) {
        if (!playedNationIds.has(sp.player.nationId)) continue; // nation didn't play: nothing to sub
        if (played(sp.playerId)) continue;
        for (const cand of benchSorted) {
          if (usedBench.has(cand.playerId)) continue;
          if (!played(cand.playerId)) continue;
          const legal = canSubstitutePlayer(
            formation,
            { position: sp.player.position } as Parameters<typeof canSubstitutePlayer>[1],
            { position: cand.player.position } as Parameters<typeof canSubstitutePlayer>[2],
          );
          if (!legal) continue;
          usedBench.add(cand.playerId);
          subbedInIds.push(cand.playerId);
          const outPos = sp.player.position;
          const inPos = cand.player.position;
          if (outPos === 'DEF' || outPos === 'MID' || outPos === 'FWD') formation[outPos]--;
          if (inPos === 'DEF' || inPos === 'MID' || inPos === 'FWD') formation[inPos]++;
          autoSubPoints += stagePts(cand.playerId);
          result.autoSubs++;
          break;
        }
      }
    }

    // ---- 2) Vice-captain fallback ----
    let vcBonus = 0;
    const captain = team.squadPlayers.find((sp) => sp.isCaptain);
    const vice = team.squadPlayers.find((sp) => sp.isViceCaptain);
    if (
      !isLate &&
      captain &&
      vice &&
      playedNationIds.has(captain.player.nationId) &&
      !played(captain.playerId) &&
      played(vice.playerId)
    ) {
      const viceCounted = vice.isStarting || benchBoost || subbedInIds.includes(vice.playerId);
      if (viceCounted) {
        vcBonus = (captainMultiplier - 1) * stagePts(vice.playerId);
        if (vcBonus !== 0) result.vcFallbacks++;
      }
    }

    // ---- Apply adjustment to the running leaderboard total ----
    const adjustment = autoSubPoints + vcBonus;
    if (adjustment !== 0) {
      await prisma.team.update({
        where: { id: team.id },
        data: { totalPoints: { increment: adjustment } },
      });
      result.pointsAdjusted += adjustment;
    }

    // ---- 3) History snapshot ----
    // rawPoints: everyone who counted, at 1x. captainPoints: the extra from
    // the armband (captain's bonus, or the vice fallback we just applied).
    let raw = 0;
    if (!isLate) {
      for (const sp of starters) raw += stagePts(sp.playerId);
      for (const id of subbedInIds) raw += stagePts(id);
      if (benchBoost) for (const sp of benchSorted) raw += stagePts(sp.playerId);
    }
    let captainExtra = 0;
    if (!isLate && captain && played(captain.playerId)) {
      captainExtra = (captainMultiplier - 1) * stagePts(captain.playerId);
    } else {
      captainExtra = vcBonus;
    }
    const hits = isLate ? 0 : hitsByTeam.get(team.id) ?? 0;

    await prisma.teamStage.upsert({
      where: { teamId_stageId: { teamId: team.id, stageId: stage.id } },
      create: {
        teamId: team.id,
        stageId: stage.id,
        rawPoints: raw,
        captainPoints: captainExtra,
        transferHits: hits,
        totalPoints: raw + captainExtra - hits,
      },
      update: {
        rawPoints: raw,
        captainPoints: captainExtra,
        transferHits: hits,
        totalPoints: raw + captainExtra - hits,
      },
    });
    result.teamsSettled++;
  }

  return result;
}
