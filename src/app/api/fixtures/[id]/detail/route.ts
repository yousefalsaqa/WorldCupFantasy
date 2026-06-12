import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiFootball, type APIFixtureFullDetail } from '@/lib/api-football';

export const dynamic = 'force-dynamic';

// ============================================
// GET /api/fixtures/[id]/detail
//
// Stats / lineups / events for the fixture modal. Fetched on demand from
// API-Football (1 call — by-id fixture requests bundle everything) and
// cached in Match.detailCache:
//
//   - finished + cached final  → served from cache forever (0 API cost)
//   - live                     → 60s TTL
//   - pre-kickoff              → 5 min TTL inside the last 90 min (lineups
//                                drop ~40 min out), 60 min TTL before that
//
// Read-only with respect to everything except the cache column.
// ============================================

const LIVE_TTL_MS = 60_000;
const PREMATCH_NEAR_TTL_MS = 5 * 60_000;
const PREMATCH_FAR_TTL_MS = 60 * 60_000;
const LINEUP_WINDOW_MS = 90 * 60_000;

interface CacheEnvelope {
  fetchedAt: string;
  final: boolean;
  payload: DetailPayload;
}

interface DetailPayload {
  available: boolean;
  referee: string | null;
  venue: { name: string; city: string } | null;
  status: { short: string; minute: number | null; isLive: boolean; isFinished: boolean };
  score: {
    home: number | null;
    away: number | null;
    penHome: number | null;
    penAway: number | null;
  };
  teams: {
    home: { code: string; name: string; kitColor1: string; kitColor2: string };
    away: { code: string; name: string; kitColor1: string; kitColor2: string };
  };
  stats: Array<{ key: string; label: string; home: string | number; away: string | number }>;
  lineups: Array<{
    side: 'home' | 'away';
    formation: string | null;
    coach: string | null;
    startXI: Array<LineupPlayer>;
    subs: Array<LineupPlayer>;
  }>;
  events: Array<{
    minute: number;
    extra: number | null;
    side: 'home' | 'away' | null;
    type: string;
    detail: string;
    player: string | null;
    assist: string | null;
    comments: string | null;
  }>;
}

interface LineupPlayer {
  apiId: number;
  name: string;
  number: number;
  pos: string | null;
  grid: string | null;
  photoUrl: string | null;
}

// The stat rows we surface, in display order. Possession renders as the
// bar at the top; the rest as home/label/away rows. Keys = API "type".
const STAT_ROWS: Array<{ apiType: string; key: string; label: string }> = [
  { apiType: 'Ball Possession', key: 'possession', label: 'Ball possession' },
  { apiType: 'expected_goals', key: 'xg', label: 'Expected goals (xG)' },
  { apiType: 'Total Shots', key: 'shots', label: 'Total shots' },
  { apiType: 'Shots on Goal', key: 'shotsOn', label: 'Shots on target' },
  { apiType: 'Corner Kicks', key: 'corners', label: 'Corners' },
  { apiType: 'Fouls', key: 'fouls', label: 'Fouls' },
  { apiType: 'Offsides', key: 'offsides', label: 'Offsides' },
  { apiType: 'Yellow Cards', key: 'yellows', label: 'Yellow cards' },
  { apiType: 'Red Cards', key: 'reds', label: 'Red cards' },
  { apiType: 'Goalkeeper Saves', key: 'saves', label: 'Saves' },
  { apiType: 'Passes %', key: 'passAcc', label: 'Pass accuracy' },
];

function transform(
  detail: APIFixtureFullDetail,
  match: {
    homeNation: { code: string; name: string; kitColor1: string; kitColor2: string; apiFootballId: number | null };
    awayNation: { code: string; name: string; kitColor1: string; kitColor2: string; apiFootballId: number | null };
  },
  photoByApiId: Map<number, string | null>,
): DetailPayload {
  const status = detail.fixture.status;
  const isLive = apiFootball.isMatchLive(status.short);
  const isFinished = apiFootball.isMatchFinished(status.short);

  const homeApiId = detail.teams.home.id;
  const sideOf = (teamId: number): 'home' | 'away' =>
    teamId === homeApiId ? 'home' : 'away';

  // Stats: API returns one statistics[] block per team.
  const statsBlocks = detail.statistics ?? [];
  const homeBlock = statsBlocks.find((b) => b.team.id === homeApiId);
  const awayBlock = statsBlocks.find((b) => b.team.id !== homeApiId);
  const statValue = (
    block: typeof homeBlock,
    apiType: string,
  ): string | number | null => {
    const row = block?.statistics.find((s) => s.type === apiType);
    return row?.value ?? null;
  };
  const stats = STAT_ROWS.flatMap((row) => {
    const home = statValue(homeBlock, row.apiType);
    const away = statValue(awayBlock, row.apiType);
    // Skip rows the API hasn't populated (early minutes / lesser feeds).
    if (home === null && away === null) return [];
    return [{ key: row.key, label: row.label, home: home ?? 0, away: away ?? 0 }];
  });

  const mapPlayer = (p: { player: { id: number; name: string; number: number; pos: string | null; grid: string | null } }): LineupPlayer => ({
    apiId: p.player.id,
    name: p.player.name,
    number: p.player.number,
    pos: p.player.pos,
    grid: p.player.grid,
    photoUrl: photoByApiId.get(p.player.id) ?? null,
  });

  const lineups = (detail.lineups ?? []).map((l) => ({
    side: sideOf(l.team.id),
    formation: l.formation,
    coach: l.coach?.name ?? null,
    startXI: l.startXI.map(mapPlayer),
    subs: l.substitutes.map(mapPlayer),
  }));

  const events = (detail.events ?? []).map((e) => ({
    minute: e.time.elapsed,
    extra: e.time.extra,
    side: e.team?.id ? sideOf(e.team.id) : null,
    type: e.type,
    detail: e.detail,
    player: e.player?.name ?? null,
    assist: e.assist?.name ?? null,
    comments: e.comments,
  }));

  return {
    available: true,
    referee: detail.fixture.referee,
    venue: detail.fixture.venue?.name
      ? { name: detail.fixture.venue.name, city: detail.fixture.venue.city }
      : null,
    status: { short: status.short, minute: status.elapsed, isLive, isFinished },
    score: {
      home: detail.goals.home,
      away: detail.goals.away,
      penHome: detail.score.penalty.home,
      penAway: detail.score.penalty.away,
    },
    teams: {
      home: {
        code: match.homeNation.code,
        name: match.homeNation.name,
        kitColor1: match.homeNation.kitColor1,
        kitColor2: match.homeNation.kitColor2,
      },
      away: {
        code: match.awayNation.code,
        name: match.awayNation.name,
        kitColor1: match.awayNation.kitColor1,
        kitColor2: match.awayNation.kitColor2,
      },
    },
    stats,
    lineups,
    events,
  };
}

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
    if (!match.apiFootballId) {
      return NextResponse.json({ available: false });
    }

    // Cache check
    let cached: CacheEnvelope | null = null;
    if (match.detailCache) {
      try {
        cached = JSON.parse(match.detailCache) as CacheEnvelope;
      } catch {
        cached = null;
      }
    }
    if (cached) {
      if (cached.final) return NextResponse.json(cached.payload);
      const age = Date.now() - new Date(cached.fetchedAt).getTime();
      const msToKickoff = match.kickoffTime.getTime() - Date.now();
      const ttl = match.isStarted
        ? LIVE_TTL_MS
        : msToKickoff > LINEUP_WINDOW_MS
          ? PREMATCH_FAR_TTL_MS
          : PREMATCH_NEAR_TTL_MS;
      if (age < ttl) return NextResponse.json(cached.payload);
    }

    // Fetch fresh (1 API-Football call — everything is bundled)
    const detail = await apiFootball.getFixtureFullDetail(match.apiFootballId);
    if (!detail) {
      if (cached) return NextResponse.json(cached.payload); // stale > nothing
      return NextResponse.json({ available: false });
    }

    // Map lineup players to our DB photos via apiFootballId (one query).
    const apiIds = (detail.lineups ?? []).flatMap((l) => [
      ...l.startXI.map((p) => p.player.id),
      ...l.substitutes.map((p) => p.player.id),
    ]);
    const dbPlayers = apiIds.length > 0
      ? await prisma.player.findMany({
          where: { apiFootballId: { in: apiIds } },
          select: { apiFootballId: true, photoUrl: true },
        })
      : [];
    const photoByApiId = new Map<number, string | null>(
      dbPlayers.map((p) => [p.apiFootballId!, p.photoUrl]),
    );

    const payload = transform(detail, match, photoByApiId);

    const envelope: CacheEnvelope = {
      fetchedAt: new Date().toISOString(),
      final: payload.status.isFinished,
      payload,
    };
    await prisma.match.update({
      where: { id: match.id },
      data: { detailCache: JSON.stringify(envelope) },
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Fixture detail error:', error);
    return NextResponse.json({ error: 'Failed to load match detail' }, { status: 500 });
  }
}
