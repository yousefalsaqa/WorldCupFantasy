// ============================================
// KNOCKOUT BRACKET
//
// Returns the bracket as ordered rounds (R32 → Final), each tie seeded from the
// static KNOCKOUT_FIXTURES structure and OVERLAID with real results from synced
// DB Match rows where available.
//
// Resolution:
//   • Group seeds ("1A", "2B", "3C") → the nation in that group position, from
//     live standings (top-2 + GD/GF tiebreak, mirroring /api/standings).
//   • "W M73" / "L M101" → the winner/loser of that earlier tie once its DB
//     match has a result (resolved round-by-round in bracket order).
//   • Multi-option third-place slots ("3-A/B/C/D/F") stay as their label until a
//     DB match pins the actual team.
//
// A DB match is matched to a tie when it shares a resolved nation with that
// tie's slot in the same stage — every R32 tie has a resolvable 1X/2X host, so
// real teams + scores fill in as groups finish and fixtures sync. Read-only.
// ============================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { KNOCKOUT_FIXTURES } from '@/lib/world-cup-fixtures';

export const dynamic = 'force-dynamic';

const STAGE_LABEL_TO_ID: Record<string, string> = {
  'Round of 32': 'R32',
  'Round of 16': 'R16',
  'Quarter Final': 'QF',
  'Semi Final': 'SF',
  '3rd Place': '3RD',
  Final: 'F',
};

const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', '3RD', 'F'];

interface TieSide {
  code: string | null;   // resolved nation code, or null when still a placeholder
  label: string;         // human placeholder ("2A", "W M73", "3-A/B/C/D/F")
  score: number | null;
  winner: boolean;
}

interface Tie {
  id: string;            // bracket fixture id (e.g. "M73")
  matchId: string | null; // DB Match id once synced (for deep-linking to /fixtures)
  stageId: string;
  kickoff: string;       // ISO
  home: TieSide;
  away: TieSide;
  finished: boolean;
  live: boolean;
}

export async function GET() {
  try {
    // ---- Group standings → seed map ("1A","2A","3A", …) ----
    const nations = await prisma.nation.findMany({
      where: { group: { not: null } },
      select: { id: true, code: true, group: true },
    });
    const finished = await prisma.match.findMany({
      where: { isFinished: true, homeScore: { not: null }, awayScore: { not: null } },
      select: { homeNationId: true, awayNationId: true, homeScore: true, awayScore: true },
    });
    type Acc = { code: string; group: string; pts: number; gd: number; gf: number };
    const acc = new Map<string, Acc>();
    const groupOf = new Map<string, string>();
    for (const n of nations) {
      acc.set(n.id, { code: n.code, group: n.group!, pts: 0, gd: 0, gf: 0 });
      groupOf.set(n.id, n.group!);
    }
    for (const m of finished) {
      const hg = groupOf.get(m.homeNationId), ag = groupOf.get(m.awayNationId);
      if (!hg || !ag || hg !== ag) continue; // group matches only
      const h = acc.get(m.homeNationId)!, a = acc.get(m.awayNationId)!;
      h.gf += m.homeScore!; a.gf += m.awayScore!;
      h.gd += m.homeScore! - m.awayScore!; a.gd += m.awayScore! - m.homeScore!;
      if (m.homeScore! > m.awayScore!) h.pts += 3;
      else if (m.awayScore! > m.homeScore!) a.pts += 3;
      else { h.pts++; a.pts++; }
    }
    const byGroup = new Map<string, Acc[]>();
    for (const a of Array.from(acc.values())) {
      const arr = byGroup.get(a.group) ?? [];
      arr.push(a);
      byGroup.set(a.group, arr);
    }
    const seedMap = new Map<string, string>(); // "1A" -> code
    for (const [g, rows] of Array.from(byGroup)) {
      rows.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
      rows.forEach((r, i) => seedMap.set(`${i + 1}${g}`, r.code));
    }

    // nationId → code (covers winner lookups; Match has no winner relation).
    const allNations = await prisma.nation.findMany({ select: { id: true, code: true } });
    const codeById = new Map(allNations.map((n) => [n.id, n.code]));

    // ---- DB knockout matches by stage ----
    const koStages = await prisma.stage.findMany({
      where: { stageId: { in: ROUND_ORDER } },
      select: { id: true, stageId: true },
    });
    const stageIdByDbId = new Map(koStages.map((s) => [s.id, s.stageId]));
    const koMatches = await prisma.match.findMany({
      where: { stageId: { in: koStages.map((s) => s.id) } },
      select: {
        id: true,
        stageId: true,
        homeScore: true, awayScore: true, isFinished: true, isStarted: true,
        kickoffTime: true, winnerId: true,
        homeNation: { select: { code: true } },
        awayNation: { select: { code: true } },
      },
    });
    const dbByStage = new Map<string, typeof koMatches>();
    for (const m of koMatches) {
      const sid = stageIdByDbId.get(m.stageId);
      if (!sid) continue;
      const arr = dbByStage.get(sid) ?? [];
      arr.push(m);
      dbByStage.set(sid, arr);
    }

    const winnerByFixture = new Map<string, string>();
    const loserByFixture = new Map<string, string>();

    const resolveLabel = (label: string): string | null => {
      const seed = /^([123])([A-L])$/.exec(label);
      if (seed) return seedMap.get(label) ?? null;
      const w = /^W (M\d+)$/.exec(label);
      if (w) return winnerByFixture.get(w[1]) ?? null;
      const l = /^L (M\d+)$/.exec(label);
      if (l) return loserByFixture.get(l[1]) ?? null;
      return null;
    };

    // Process fixtures in round order so W/L references resolve from earlier ties.
    const fixtures = KNOCKOUT_FIXTURES.slice().sort(
      (a, b) =>
        ROUND_ORDER.indexOf(STAGE_LABEL_TO_ID[a.stage]) - ROUND_ORDER.indexOf(STAGE_LABEL_TO_ID[b.stage]),
    );
    const consumed = new Set<typeof koMatches[number]>();
    const ties: Tie[] = [];

    for (const fx of fixtures) {
      const stageId = STAGE_LABEL_TO_ID[fx.stage];
      let homeCode = resolveLabel(fx.home);
      let awayCode = resolveLabel(fx.away);

      // Find a DB match in this stage sharing a resolved nation with the tie.
      const pool = dbByStage.get(stageId) ?? [];
      const db = pool.find((m) => {
        if (consumed.has(m)) return false;
        const codes = [m.homeNation.code, m.awayNation.code];
        return (homeCode && codes.includes(homeCode)) || (awayCode && codes.includes(awayCode));
      });

      let homeScore: number | null = null;
      let awayScore: number | null = null;
      let finishedTie = false;
      let liveTie = false;

      if (db) {
        consumed.add(db);
        // Orient the DB match onto home/away by whichever resolved seed it shares.
        const dbHome = db.homeNation.code, dbAway = db.awayNation.code;
        const keepOrientation = !awayCode || dbHome === homeCode || dbAway === awayCode;
        if (keepOrientation) {
          homeCode = dbHome; awayCode = dbAway;
          homeScore = db.homeScore; awayScore = db.awayScore;
        } else {
          homeCode = dbAway; awayCode = dbHome;
          homeScore = db.awayScore; awayScore = db.homeScore;
        }
        finishedTie = db.isFinished;
        liveTie = db.isStarted && !db.isFinished;
        const winnerCodeDb = db.winnerId ? codeById.get(db.winnerId) : undefined;
        if (db.isFinished && winnerCodeDb) {
          winnerByFixture.set(fx.id, winnerCodeDb);
          loserByFixture.set(fx.id, winnerCodeDb === dbHome ? dbAway : dbHome);
        }
      }

      const winnerCode = winnerByFixture.get(fx.id) ?? null;
      ties.push({
        id: fx.id,
        matchId: db?.id ?? null,
        stageId,
        kickoff: new Date(`${fx.date}T${fx.time}:00-04:00`).toISOString(),
        home: { code: homeCode, label: fx.home, score: homeScore, winner: !!winnerCode && winnerCode === homeCode },
        away: { code: awayCode, label: fx.away, score: awayScore, winner: !!winnerCode && winnerCode === awayCode },
        finished: finishedTie,
        live: liveTie,
      });
    }

    const rounds = ROUND_ORDER.map((stageId) => ({
      stageId,
      ties: ties.filter((t) => t.stageId === stageId),
    }));

    return NextResponse.json({ rounds });
  } catch (error) {
    console.error('Error building bracket:', error);
    return NextResponse.json({ error: 'Failed to build bracket' }, { status: 500 });
  }
}
