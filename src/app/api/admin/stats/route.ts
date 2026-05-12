import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

// What a "healthy" squad looks like for a single nation. We're not strict
// about 23-man squads here – the admin just needs enough cover at each
// position to spot obvious gaps. Tweak these constants when the real squad
// announcements settle the question.
const MIN_PER_POSITION: Record<'GK' | 'DEF' | 'MID' | 'FWD', number> = {
  GK: 2,
  DEF: 6,
  MID: 6,
  FWD: 4,
};
const MIN_TOTAL = 18;
const MAX_TOTAL = 30;

interface NationBreakdown {
  code: string;
  name: string;
  group: string;
  total: number;
  gk: number;
  def: number;
  mid: number;
  fwd: number;
  unavailable: number;
  // Most useful field for the dashboard – ordered list of issues with this
  // squad. Empty array = healthy.
  issues: string[];
}

// GET /api/admin/stats - Get admin dashboard stats
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.isAdmin) {
      console.log('Non-admin accessing stats');
    }

    // Fan out all the cheap aggregate counts in parallel.
    const [
      nations,
      players,
      users,
      teams,
      stages,
      matches,
      unavailablePlayers,
      playersWithoutPhotos,
      playersWithoutShirtNumbers,
      lockRow,
      nationRows,
      playerRows,
    ] = await Promise.all([
      prisma.nation.count(),
      prisma.player.count(),
      prisma.user.count(),
      prisma.team.count(),
      prisma.stage.count(),
      prisma.match.count(),
      prisma.player.count({ where: { isAvailable: false } }),
      prisma.player.count({ where: { photoUrl: null } }),
      prisma.player.count({ where: { shirtNumber: null } }),
      prisma.appSetting.findUnique({ where: { key: 'PLAYER_TABLE_LOCKED' } }),
      prisma.nation.findMany({
        select: { id: true, code: true, name: true, group: true },
        orderBy: [{ group: 'asc' }, { name: 'asc' }],
      }),
      prisma.player.findMany({
        select: { nationId: true, position: true, isAvailable: true },
      }),
    ]);

    // Roll up players → per-nation buckets. Doing this in memory is cheaper
    // than 4 grouped queries per nation – we already have all the rows.
    const byNation = new Map<string, NationBreakdown>();
    for (const n of nationRows) {
      byNation.set(n.id, {
        code: n.code,
        name: n.name,
        // Prisma column is nullable (some nations are pre-draw / friendlies);
        // collapse null to empty string so the dashboard renders "—" instead
        // of crashing on the typed interface.
        group: n.group ?? '',
        total: 0,
        gk: 0,
        def: 0,
        mid: 0,
        fwd: 0,
        unavailable: 0,
        issues: [],
      });
    }
    for (const p of playerRows) {
      const row = byNation.get(p.nationId);
      if (!row) continue;
      row.total += 1;
      if (!p.isAvailable) row.unavailable += 1;
      // Only count AVAILABLE players in the position buckets, otherwise a
      // squad full of injured GKs would look fine.
      if (!p.isAvailable) continue;
      if (p.position === 'GK') row.gk += 1;
      else if (p.position === 'DEF') row.def += 1;
      else if (p.position === 'MID') row.mid += 1;
      else if (p.position === 'FWD') row.fwd += 1;
    }

    // Derive human-readable issues per nation.
    for (const row of Array.from(byNation.values())) {
      if (row.total === 0) {
        row.issues.push('No players yet');
        continue;
      }
      if (row.total < MIN_TOTAL) {
        row.issues.push(`Only ${row.total} players (min ${MIN_TOTAL})`);
      }
      if (row.total > MAX_TOTAL) {
        row.issues.push(`Too many: ${row.total} players (max ${MAX_TOTAL})`);
      }
      if (row.gk < MIN_PER_POSITION.GK) {
        row.issues.push(`Only ${row.gk} GK (need ${MIN_PER_POSITION.GK})`);
      }
      if (row.def < MIN_PER_POSITION.DEF) {
        row.issues.push(`Only ${row.def} DEF (need ${MIN_PER_POSITION.DEF})`);
      }
      if (row.mid < MIN_PER_POSITION.MID) {
        row.issues.push(`Only ${row.mid} MID (need ${MIN_PER_POSITION.MID})`);
      }
      if (row.fwd < MIN_PER_POSITION.FWD) {
        row.issues.push(`Only ${row.fwd} FWD (need ${MIN_PER_POSITION.FWD})`);
      }
    }

    const breakdown = Array.from(byNation.values());
    const nationsWithIssues = breakdown.filter((n) => n.issues.length > 0).length;

    console.log('Admin stats:', { nations, players, users, teams, stages, matches });

    return NextResponse.json({
      nations,
      players,
      users,
      teams,
      stages,
      matches,
      unavailablePlayers,
      playersWithoutPhotos,
      playersWithoutShirtNumbers,
      nationsWithIssues,
      playerTableLocked: lockRow?.value === 'true',
      playerTableLockedAt: lockRow?.updatedAt ?? null,
      breakdown,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({
      nations: 0,
      players: 0,
      users: 0,
      teams: 0,
      stages: 0,
      matches: 0,
      unavailablePlayers: 0,
      playersWithoutPhotos: 0,
      playersWithoutShirtNumbers: 0,
      nationsWithIssues: 0,
      playerTableLocked: false,
      playerTableLockedAt: null,
      breakdown: [],
      error: error instanceof Error ? error.message : 'Database error',
    });
  }
}
