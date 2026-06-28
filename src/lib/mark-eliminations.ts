// ============================================
// MARK ELIMINATIONS — shared source of truth
//
// Sets `Nation.isEliminated` / `eliminatedAt` for nations that are out of the
// tournament. This is the ONE place the rule lives; the live cron, the admin
// results route, and scripts/apply-eliminations-mercy.ts all call it so the
// logic can never drift between paths.
//
// Two safe, idempotent sources:
//   a. Knockout losers — any finished KO match with a winnerId: the loser is
//      eliminated (eliminatedAt = that KO stage's stageId).
//   b. Group non-qualifiers — ONLY when the group stage is fully complete AND
//      all 16 R32 matches exist: any group nation not present in any knockout
//      match is eliminated (eliminatedAt = 'GR3'). The 16-match guard prevents
//      wrongly eliminating a qualifier whose R32 fixture hasn't been synced yet.
//
// WHY ORDERING MATTERS: the mercy rule (stage-advance → computeNextFreeTransfers)
// reads `Nation.isEliminated` live at the rollover. So this MUST run before
// maybeAdvanceStage() in the same cron tick, or the rollover reads 0 eliminations
// and mercy silently doesn't fire that round.
//
// Idempotent: re-marking an already-eliminated nation is a no-op (skipped), and
// the AuditLog is only written when something actually changes.
// ============================================

import { prisma } from './db';

const KO_STAGE_IDS = ['R32', 'R16', 'QF', 'SF', '3RD', 'F'];
const GROUP_STAGE_IDS = ['GR1', 'GR2', 'GR3'];

export interface MarkEliminationsResult {
  /** Nations newly marked eliminated via a KO loss this run. */
  koLosers: number;
  /** Nations newly marked eliminated as group non-qualifiers this run. */
  groupOut: number;
  /** Nations that were already eliminated (skipped). */
  alreadyMarked: number;
  /** True when the group non-qualifier pass was skipped (guard not satisfied). */
  groupPassSkipped: boolean;
  /** Codes of the nations newly marked, for logging. */
  marked: { code: string; at: string }[];
}

/**
 * Mark all currently-determinable eliminations. Safe to call every cron tick.
 *
 * @param opts.dryRun when true, computes what WOULD be marked but writes nothing
 *   (no Nation updates, no AuditLog). The returned summary still reflects the
 *   would-be changes so callers/scripts can preview.
 */
export async function markEliminations(
  opts: { dryRun?: boolean } = {},
): Promise<MarkEliminationsResult> {
  const dryRun = opts.dryRun ?? false;

  const stages = await prisma.stage.findMany({
    select: { id: true, stageId: true },
  });
  const stageIdById = new Map(stages.map((s) => [s.id, s.stageId]));
  const koDbStageIds = new Set(
    stages.filter((s) => KO_STAGE_IDS.includes(s.stageId)).map((s) => s.id),
  );
  const groupDbStageIds = stages
    .filter((s) => GROUP_STAGE_IDS.includes(s.stageId))
    .map((s) => s.id);

  const nations = await prisma.nation.findMany({
    select: { id: true, code: true, group: true, isEliminated: true },
  });
  const nationById = new Map(nations.map((n) => [n.id, n]));

  const allMatches = await prisma.match.findMany({
    select: {
      id: true,
      stageId: true,
      homeNationId: true,
      awayNationId: true,
      homeScore: true,
      awayScore: true,
      isFinished: true,
      winnerId: true,
    },
  });

  // nationId -> eliminatedAt stage label (last write wins; KO is more specific
  // than a group exit, and a nation can only be eliminated once anyway).
  const toEliminate = new Map<string, string>();

  // ---- a) Knockout losers ----
  for (const m of allMatches) {
    if (!koDbStageIds.has(m.stageId) || !m.isFinished || !m.winnerId) continue;
    const loserId = m.winnerId === m.homeNationId ? m.awayNationId : m.homeNationId;
    toEliminate.set(loserId, stageIdById.get(m.stageId) ?? 'KO');
  }
  const koLoserIds = new Set(toEliminate.keys());

  // ---- b) Group eliminations ----
  // Two sub-rules, both safe (no false positives):
  //   b1. 4th place in a COMPLETED group is out for certain — 4th never
  //       advances (only top-2 + best-8 third-places of 12 qualify). This fires
  //       per-group the moment that group finishes, regardless of other groups
  //       or whether R32 is synced yet — the earliest safe signal.
  //   b2. Once ALL groups are complete AND all 16 R32 fixtures are synced, any
  //       group nation not present in a knockout match is out (catches the
  //       third-placed teams that missed the best-8 cut). The 16-match guard
  //       prevents wrongly eliminating a qualifier whose R32 fixture is unsynced.
  let groupPassSkipped = true;

  // Per-group standings from finished GROUP matches (both teams in the same
  // group). Mirrors the standings API tiebreak: pts, then GD, then GF.
  const groupOf = new Map<string, string>();
  for (const n of nations) if (n.group) groupOf.set(n.id, n.group);
  type Acc = { P: number; pts: number; gd: number; gf: number };
  const acc = new Map<string, Acc>();
  for (const id of Array.from(groupOf.keys())) acc.set(id, { P: 0, pts: 0, gd: 0, gf: 0 });
  for (const m of allMatches) {
    if (!m.isFinished || m.homeScore == null || m.awayScore == null) continue;
    const hg = groupOf.get(m.homeNationId);
    const ag = groupOf.get(m.awayNationId);
    if (!hg || !ag || hg !== ag) continue; // group matches only
    const h = acc.get(m.homeNationId)!;
    const a = acc.get(m.awayNationId)!;
    h.P++; a.P++;
    h.gf += m.homeScore; a.gf += m.awayScore;
    h.gd += m.homeScore - m.awayScore; a.gd += m.awayScore - m.homeScore;
    if (m.homeScore > m.awayScore) h.pts += 3;
    else if (m.awayScore > m.homeScore) a.pts += 3;
    else { h.pts++; a.pts++; }
  }

  // Bucket nations by group.
  const byGroup = new Map<string, string[]>();
  for (const [id, g] of Array.from(groupOf)) {
    const arr = byGroup.get(g) ?? [];
    arr.push(id);
    byGroup.set(g, arr);
  }

  // b1) 4th place in each completed group.
  for (const [, ids] of Array.from(byGroup)) {
    const complete = ids.length === 4 && ids.every((id) => acc.get(id)!.P === 3);
    if (!complete) continue;
    groupPassSkipped = false;
    const sorted = ids.slice().sort((x, y) => {
      const ax = acc.get(x)!, ay = acc.get(y)!;
      return ay.pts - ax.pts || ay.gd - ax.gd || ay.gf - ax.gf;
    });
    const fourth = sorted[3];
    if (fourth && !toEliminate.has(fourth)) toEliminate.set(fourth, 'GR3');
  }

  // b2) Third-placed non-qualifiers once everything is known.
  const groupComplete =
    groupDbStageIds.length === 3 &&
    (await prisma.match.count({
      where: { stageId: { in: groupDbStageIds }, isFinished: false },
    })) === 0 &&
    (await prisma.match.count({ where: { stageId: { in: groupDbStageIds } } })) > 0;
  const r32 = stages.find((s) => s.stageId === 'R32');
  const r32Count = r32 ? allMatches.filter((m) => m.stageId === r32.id).length : 0;

  if (groupComplete && r32Count >= 16) {
    groupPassSkipped = false;
    const koParticipants = new Set<string>();
    for (const m of allMatches) {
      if (!koDbStageIds.has(m.stageId)) continue;
      koParticipants.add(m.homeNationId);
      koParticipants.add(m.awayNationId);
    }
    for (const n of nations) {
      if (!n.group) continue; // only real group teams
      if (!koParticipants.has(n.id) && !toEliminate.has(n.id)) {
        toEliminate.set(n.id, 'GR3');
      }
    }
  }

  // ---- Apply ----
  let koLosers = 0;
  let groupOut = 0;
  let alreadyMarked = 0;
  const marked: { code: string; at: string }[] = [];

  for (const [nationId, at] of Array.from(toEliminate)) {
    const n = nationById.get(nationId);
    if (!n) continue;
    if (n.isEliminated) {
      alreadyMarked++;
      continue;
    }
    if (koLoserIds.has(nationId)) koLosers++;
    else groupOut++;
    marked.push({ code: n.code, at });
    if (!dryRun) {
      await prisma.nation.update({
        where: { id: nationId },
        data: { isEliminated: true, eliminatedAt: at },
      });
    }
  }

  if (!dryRun && marked.length > 0) {
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'ELIMINATIONS_MARKED',
        details: JSON.stringify({
          koLosers,
          groupOut,
          marked,
        }),
      },
    });
  }

  return { koLosers, groupOut, alreadyMarked, groupPassSkipped, marked };
}
