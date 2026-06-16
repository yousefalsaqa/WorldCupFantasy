// ============================================
// FIXTURE DETAIL — shared fetch / transform / cache for the modal.
//
// The Stats / Lineups / Timeline payload behind /api/fixtures/[id]/detail.
// Extracted here so BOTH the on-demand route AND the live-cron heal sweep
// populate Match.detailCache through one code path.
//
// SELF-HEALING: API-Football marks a fixture FT on the scoreline feed
// before it publishes the per-fixture stats/lineups/events bundle (the same
// post-FT lag that the minutes re-score works around). If the only fetch
// attempt lands in that window the payload comes back empty. We therefore:
//   1. Only mark a cache `final` (= serve forever) once it actually carries
//      content, so an empty FT snapshot stays re-fetchable instead of
//      freezing empty permanently.
//   2. Re-warm missing/empty caches for recently-finished matches from the
//      live cron, so the detail appears without anyone opening the modal at
//      the right moment (see healFixtureDetailCache).
// ============================================
import { prisma } from '@/lib/db';
import { apiFootball, type APIFixtureFullDetail } from '@/lib/api-football';

// Only heal matches that finished recently — bounds the candidate set to the
// current matchday and stops us re-pulling a genuinely-bare match forever.
const RECENT_WINDOW_HOURS = 18;

export interface CacheEnvelope {
  fetchedAt: string;
  final: boolean;
  payload: DetailPayload;
}

export interface DetailPayload {
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

/** The subset of Match (with nations) the transform/refresh needs. */
export interface FixtureDetailMatch {
  id: string;
  apiFootballId: number | null;
  homeNation: { code: string; name: string; kitColor1: string; kitColor2: string; apiFootballId: number | null };
  awayNation: { code: string; name: string; kitColor1: string; kitColor2: string; apiFootballId: number | null };
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
  match: FixtureDetailMatch,
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

/** A payload "has content" once any of the three tabs can show something. */
export function payloadHasContent(p: DetailPayload): boolean {
  return p.stats.length > 0 || p.lineups.length > 0 || p.events.length > 0;
}

/** Parse the stored cache (null/garbage → null). */
export function parseCache(detailCache: string | null): CacheEnvelope | null {
  if (!detailCache) return null;
  try {
    return JSON.parse(detailCache) as CacheEnvelope;
  } catch {
    return null;
  }
}

/**
 * A cache needs (re-)warming when it's absent or content-empty. A
 * content-bearing cache — final or not — is left alone here; the route's
 * TTL logic decides whether to refresh a still-live one.
 */
export function cacheNeedsHeal(detailCache: string | null): boolean {
  const cached = parseCache(detailCache);
  return !cached || !payloadHasContent(cached.payload);
}

/**
 * Fetch the fixture detail from API-Football, transform it, and write
 * Match.detailCache. Returns the envelope, or null when API-Football has
 * nothing for us yet (in which case the cache is left untouched, so the
 * next attempt re-tries). The `final` flag is gated on real content so an
 * empty FT snapshot never freezes forever.
 */
export async function refreshFixtureDetail(
  match: FixtureDetailMatch,
): Promise<CacheEnvelope | null> {
  if (!match.apiFootballId) return null;

  const detail = await apiFootball.getFixtureFullDetail(match.apiFootballId);
  if (!detail) return null;

  // Map lineup players to our DB photos via apiFootballId (one query).
  // API-Football occasionally emits a lineup entry with a null player id
  // (seen: IRN-NZL 2026-06-15) — filter those out or Prisma rejects the
  // `in` query and the whole detail fetch throws.
  const apiIds = (detail.lineups ?? [])
    .flatMap((l) => [
      ...l.startXI.map((p) => p.player.id),
      ...l.substitutes.map((p) => p.player.id),
    ])
    .filter((id): id is number => typeof id === 'number');
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
    // Only "final" (served forever, no TTL) once content actually landed —
    // otherwise a post-FT lag snapshot would freeze the modal empty.
    final: payload.status.isFinished && payloadHasContent(payload),
    payload,
  };
  await prisma.match.update({
    where: { id: match.id },
    data: { detailCache: JSON.stringify(envelope) },
  });

  return envelope;
}

export interface DetailHealOutcome {
  matchId: string;
  fixtureId: number;
  label: string;
  status: 'healed' | 'already-cached' | 'still-empty' | 'error';
  error?: string;
}

/**
 * Re-warm Match.detailCache for recently-finished matches whose cache is
 * missing or content-empty. Idempotent: a match with a content-bearing
 * cache is skipped (zero API cost). Mirrors rescorePendingFinishedMatches —
 * piggybacks the live cron, costs at most one API call per unhealed match
 * per run, and collapses to zero once API-Football publishes the bundle.
 */
export async function healFixtureDetailCache(): Promise<DetailHealOutcome[]> {
  const since = new Date(Date.now() - RECENT_WINDOW_HOURS * 3600 * 1000);
  const candidates = await prisma.match.findMany({
    where: {
      isFinished: true,
      apiFootballId: { not: null },
      kickoffTime: { gte: since },
    },
    include: {
      homeNation: { select: { code: true, name: true, kitColor1: true, kitColor2: true, apiFootballId: true } },
      awayNation: { select: { code: true, name: true, kitColor1: true, kitColor2: true, apiFootballId: true } },
    },
    orderBy: { kickoffTime: 'asc' },
  });

  const outcomes: DetailHealOutcome[] = [];
  for (const match of candidates) {
    const label = `${match.homeNation.code}-${match.awayNation.code}`;
    const fixtureId = match.apiFootballId!;
    if (!cacheNeedsHeal(match.detailCache)) {
      outcomes.push({ matchId: match.id, fixtureId, label, status: 'already-cached' });
      continue;
    }
    try {
      const env = await refreshFixtureDetail(match);
      const healed = env != null && payloadHasContent(env.payload);
      outcomes.push({ matchId: match.id, fixtureId, label, status: healed ? 'healed' : 'still-empty' });
    } catch (error) {
      outcomes.push({
        matchId: match.id,
        fixtureId,
        label,
        status: 'error',
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
  return outcomes;
}
