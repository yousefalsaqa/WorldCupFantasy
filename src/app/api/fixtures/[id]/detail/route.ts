import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parsePredictedLineups } from '@/lib/predicted-lineups';
import { parseCache, refreshFixtureDetail } from '@/lib/fixture-detail';

export const dynamic = 'force-dynamic';

// ============================================
// GET /api/fixtures/[id]/detail
//
// Stats / lineups / events for the fixture modal. Fetched on demand from
// API-Football (1 call — by-id fixture requests bundle everything) and
// cached in Match.detailCache via @/lib/fixture-detail:
//
//   - finished + content cached → served from cache forever (0 API cost)
//   - live                      → 60s TTL
//   - pre-kickoff               → 5 min TTL inside the last 90 min (lineups
//                                 drop ~40 min out), 60 min TTL before that
//
// A finished match whose stats/lineups/events haven't published yet caches
// with `final: false` (see refreshFixtureDetail), so it re-fetches on the
// live TTL instead of freezing empty. The live cron also re-warms it via
// healFixtureDetailCache. Read-only with respect to everything except the
// cache column.
// ============================================

const LIVE_TTL_MS = 60_000;
const PREMATCH_NEAR_TTL_MS = 5 * 60_000;
const PREMATCH_FAR_TTL_MS = 60 * 60_000;
const LINEUP_WINDOW_MS = 90 * 60_000;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        homeNation: { select: { code: true, name: true, kitColor1: true, kitColor2: true, apiFootballId: true } },
        awayNation: { select: { code: true, name: true, kitColor1: true, kitColor2: true, apiFootballId: true } },
      },
    });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Admin-entered predicted XI. Read fresh on EVERY request (it's on the
    // match row we already loaded) and attached outside the cached payload,
    // so an admin update shows up immediately regardless of cache TTLs.
    // The modal only renders it while the official lineups are absent.
    const predicted = parsePredictedLineups(match.predictedLineups);

    if (!match.apiFootballId) {
      return NextResponse.json({ available: false, predicted });
    }

    // Cache check
    const cached = parseCache(match.detailCache);
    if (cached) {
      // `final` is only set once the payload actually carries content
      // (see refreshFixtureDetail), so this never serves a frozen-empty FT.
      if (cached.final) return NextResponse.json({ ...cached.payload, predicted });
      const age = Date.now() - new Date(cached.fetchedAt).getTime();
      const msToKickoff = match.kickoffTime.getTime() - Date.now();
      const ttl = match.isStarted
        ? LIVE_TTL_MS
        : msToKickoff > LINEUP_WINDOW_MS
          ? PREMATCH_FAR_TTL_MS
          : PREMATCH_NEAR_TTL_MS;
      if (age < ttl) return NextResponse.json({ ...cached.payload, predicted });
    }

    // Fetch fresh (1 API-Football call — everything is bundled)
    const envelope = await refreshFixtureDetail(match);
    if (!envelope) {
      if (cached) return NextResponse.json({ ...cached.payload, predicted }); // stale > nothing
      return NextResponse.json({ available: false, predicted });
    }

    return NextResponse.json({ ...envelope.payload, predicted });
  } catch (error) {
    console.error('Fixture detail error:', error);
    return NextResponse.json({ error: 'Failed to load match detail' }, { status: 500 });
  }
}
