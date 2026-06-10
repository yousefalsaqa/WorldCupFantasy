// ============================================
// SYNC NATIONS + FIXTURES + PLAYERS (free-plan compatible)
//
// Usage:
//   npx tsx --env-file=.env scripts/sync-from-api-football.ts          (dry run)
//   npx tsx --env-file=.env scripts/sync-from-api-football.ts --apply  (write to DB)
//
// The API-Football FREE plan blocks season-2026 queries (/teams, /fixtures
// with league+season). So this script:
//   1. Seeds the 72 group-stage matches from the repo's own verified
//      schedule (src/lib/world-cup-fixtures.ts) - no API needed.
//      apiFootballId stamping happens later (paid plan, or day-of via
//      /fixtures?date=, which the free plan allows for +-1 day).
//   2. Resolves each nation's API team id: tries the static
//      NATION_TO_API_ID first but VALIDATES it against the squad
//      response's team name (the static table proved unreliable), falling
//      back to /teams?search=<name>. Squad fetches are NOT season-gated.
//   3. Maps existing players to API ids by name+position and CREATES the
//      missing squad players with default prices.
//
// API responses are cached in .sync-cache.json so repeated runs
// (dry run -> apply) cost ZERO extra quota. Delete the file to refetch.
// ============================================

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { NATION_TO_API_ID, mapPosition } from '../src/lib/team-mappings';
import { WORLD_CUP_FIXTURES } from '../src/lib/world-cup-fixtures';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.API_FOOTBALL_KEY || '';
const CACHE_FILE = path.join(process.cwd(), '.sync-cache.json');

// Same defaults the CSV importer uses for unpriced players.
const DEFAULT_PRICE: Record<string, number> = { GK: 4.5, DEF: 5.0, MID: 6.5, FWD: 7.0 };

// Alternative API-side names for nations whose DB name differs.
const NAME_ALIASES: Record<string, string[]> = {
  KOR: ['South Korea'],
  CZE: ['Czech Republic'],
  CPV: ['Cape Verde Islands', 'Cape Verde'],
  CIV: ['Ivory Coast'],
  TUR: ['Turkey'],
  COD: ['Congo DR'],
  USA: ['United States'],
};

// Extra search terms beyond the nation's own DB name.
const SEARCH_TERMS: Record<string, string[]> = {
  CPV: ['Cape Verde', 'Cabo Verde'],
  CIV: ['Ivory Coast'],
  COD: ['Congo'],
  BIH: ['Bosnia'],
  TUR: ['Turkey'],
};

// ---------- tiny cached fetch ----------

type Cache = Record<string, unknown>;
const cache: Cache = fs.existsSync(CACHE_FILE)
  ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
  : {};

let apiCallsMade = 0;
let lastRateHeaders = '';

async function api<T>(endpoint: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(`${API_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, String(v)));
  const key = url.toString();

  if (cache[key]) return cache[key] as T;

  if (!API_KEY) throw new Error('API_FOOTBALL_KEY is empty - check .env');

  // Free plan allows 10 requests/minute - space calls at 6.5s.
  await new Promise((r) => setTimeout(r, 6500));
  let res = await fetch(key, { headers: { 'x-apisports-key': API_KEY } });
  if (res.status === 429) {
    console.log('  (429 rate-limited, waiting 65s...)');
    await new Promise((r) => setTimeout(r, 65000));
    res = await fetch(key, { headers: { 'x-apisports-key': API_KEY } });
  }
  if (!res.ok) throw new Error(`API ${res.status} for ${key}`);
  apiCallsMade++;
  lastRateHeaders = `day ${res.headers.get('x-ratelimit-requests-remaining')}/${res.headers.get('x-ratelimit-requests-limit')}, min ${res.headers.get('x-ratelimit-remaining')}/${res.headers.get('x-ratelimit-limit')}`;

  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`API error for ${key}: ${JSON.stringify(data.errors)}`);
  }
  cache[key] = data.response;
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
  return data.response as T;
}

// ---------- name matching helpers ----------

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.''&-]/g, ' ')
    .replace(/\b(and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s: string): string {
  return norm(s).split(' ').sort().join(' ');
}

function nationNamesMatch(code: string, dbName: string, apiName: string): boolean {
  const candidates = [dbName, ...(NAME_ALIASES[code] || [])];
  const a = norm(apiName);
  return candidates.some((c) => {
    const d = norm(c);
    return tokenSet(c) === tokenSet(apiName) || a.includes(d) || d.includes(a);
  });
}

// ---------- types ----------

interface ApiTeamSearch {
  team: { id: number; name: string; code: string | null; national: boolean };
}
interface ApiSquadPlayer {
  id: number;
  name: string;
  number: number | null;
  position: string;
  photo: string | null;
}
interface ApiSquad {
  team: { id: number; name: string };
  players: ApiSquadPlayer[];
}
interface ApiFixture {
  fixture: { id: number; date: string };
  league: { round: string };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
}

// Fetch + validate a squad for a given team id. Returns null when the id
// points at the wrong team (the static table has several bad entries).
async function fetchValidatedSquad(
  code: string,
  dbName: string,
  teamId: number,
): Promise<{ teamId: number; teamName: string; players: ApiSquadPlayer[] } | null> {
  const squads = await api<ApiSquad[]>('/players/squads', { team: teamId });
  const teamName = squads[0]?.team?.name ?? '';
  const players = squads[0]?.players ?? [];
  if (!players.length) return null;
  if (!nationNamesMatch(code, dbName, teamName)) return null;
  return { teamId, teamName, players };
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing to DB)' : 'DRY RUN (no writes)'}\n`);

  const dbNations = await prisma.nation.findMany();
  const nationByCode = new Map(dbNations.map((n) => [n.code, n]));

  // ================= 1. GROUP-STAGE MATCHES (from repo schedule) =================
  const stages = await prisma.stage.findMany();
  const stageByKey = new Map(stages.map((s) => [s.stageId, s]));
  const existingMatches = await prisma.match.findMany();

  // Group round by calendar window: R1 Jun 11-17, R2 Jun 18-23, R3 Jun 24-27.
  function groupRoundStage(date: string): string {
    if (date <= '2026-06-17') return 'GR1';
    if (date <= '2026-06-23') return 'GR2';
    return 'GR3';
  }

  let fxCreate = 0;
  let fxUpdate = 0;
  const fxSkipped: string[] = [];
  // (homeNationId, awayNationId, stage db id) of every seeded group match,
  // used by the fixture-id stamping pass below.
  const seededPairs: { homeId: string; awayId: string; stageDbId: string }[] = [];

  for (const fx of WORLD_CUP_FIXTURES) {
    const home = nationByCode.get(fx.home);
    const away = nationByCode.get(fx.away);
    if (!home || !away) {
      fxSkipped.push(`M${fx.id} ${fx.home} vs ${fx.away} (unknown code)`);
      continue;
    }
    const stage = stageByKey.get(groupRoundStage(fx.date));
    if (!stage) {
      fxSkipped.push(`M${fx.id} ${fx.home} vs ${fx.away} (stage missing in DB)`);
      continue;
    }
    // Schedule times are US Eastern (EDT, UTC-4).
    const kickoffTime = new Date(`${fx.date}T${fx.time}:00-04:00`);
    seededPairs.push({ homeId: home.id, awayId: away.id, stageDbId: stage.id });

    const existing = existingMatches.find(
      (m) => m.homeNationId === home.id && m.awayNationId === away.id && m.stageId === stage.id,
    );
    if (existing) {
      fxUpdate++;
      if (APPLY) {
        await prisma.match.update({ where: { id: existing.id }, data: { kickoffTime } });
      }
    } else {
      fxCreate++;
      if (APPLY) {
        await prisma.match.create({
          data: { stageId: stage.id, homeNationId: home.id, awayNationId: away.id, kickoffTime },
        });
      }
    }
  }

  console.log(`Group-stage matches: ${fxCreate} to create, ${fxUpdate} to update, ${fxSkipped.length} skipped`);
  fxSkipped.forEach((s) => console.log('  SKIPPED:', s));
  if (existingMatches.length) {
    console.log(`  NOTE: DB already had ${existingMatches.length} match rows (check for simulator leftovers)`);
  }

  // ================= 2+3. RESOLVE TEAM IDS + SYNC SQUADS =================
  console.log('\nResolving team ids + syncing squads...');
  let mapped = 0;
  let created = 0;
  const nationApiId = new Map<string, number>();
  const ambiguous: string[] = [];
  const staleByNation: string[] = [];
  const problems: string[] = [];

  for (const n of dbNations) {
    // 1st candidate: static table (NGA entry is a known-bad placeholder).
    let squad: { teamId: number; teamName: string; players: ApiSquadPlayer[] } | null = null;
    const staticId = n.code === 'NGA' ? undefined : NATION_TO_API_ID[n.code];
    if (staticId) {
      squad = await fetchValidatedSquad(n.code, n.name, staticId);
    }

    // Fallback: search by name, senior men's national teams only.
    if (!squad) {
      const terms = [...(SEARCH_TERMS[n.code] || []), n.name, ...(NAME_ALIASES[n.code] || [])];
      const tried = new Set<number>();
      for (const term of terms) {
        if (squad) break;
        // API rejects non-alphanumeric search input ("Curaçao", "Côte d'Ivoire")
        const safeTerm = term
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-zA-Z0-9 ]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const results = await api<ApiTeamSearch[]>('/teams', { search: safeTerm });
        const nationals = results.filter(
          (t) =>
            t.team.national &&
            !/(\sW$)|(\sW\s)|(\sU\d{2}\b)/.test(t.team.name) &&
            nationNamesMatch(n.code, n.name, t.team.name),
        );
        for (const t of nationals) {
          if (tried.has(t.team.id)) continue;
          tried.add(t.team.id);
          squad = await fetchValidatedSquad(n.code, n.name, t.team.id);
          if (squad) break;
        }
      }
    }

    if (!squad) {
      problems.push(`${n.code} ${n.name}: could not resolve a valid team id / squad`);
      continue;
    }

    nationApiId.set(n.id, squad.teamId);
    if (APPLY) {
      await prisma.nation.update({
        where: { id: n.id },
        data: { apiFootballId: squad.teamId },
      });
    }

    // ----- players -----
    const dbPlayers = await prisma.player.findMany({ where: { nationId: n.id } });
    const matchedDbIds = new Set<string>();
    let nMapped = 0;
    let nCreated = 0;

    type DbPlayer = (typeof dbPlayers)[number];

    // "Mat Ryan" / "M. Ryan" / "Ryan" are the same person; "P.M. Sarr" /
    // "I. Sarr" are not. Same last token + first tokens prefix-compatible
    // (or one name is last-name-only) = duplicate rows for one player.
    function compatibleNames(a: DbPlayer, b: DbPlayer): boolean {
      const ta = norm(a.displayName).split(' ');
      const tb = norm(b.displayName).split(' ');
      if (ta[ta.length - 1] !== tb[tb.length - 1]) return false;
      if (ta.length === 1 || tb.length === 1) return true;
      return ta[0].startsWith(tb[0]) || tb[0].startsWith(ta[0]);
    }

    function findCandidates(ap: ApiSquadPlayer): DbPlayer[] {
      const pos = mapPosition(ap.position);
      const apName = norm(ap.name); // e.g. "k mbappe"
      const apTokens = apName.split(' ');
      const apLast = apTokens[apTokens.length - 1];
      const apFirstInitial = apTokens[0]?.[0] ?? '';

      // candidates: display-name containment OR last-name token match
      let candidates = dbPlayers.filter((p) => {
        if (matchedDbIds.has(p.id)) return false;
        const dn = norm(p.displayName);
        const ln = norm(p.lastName);
        const lnLast = ln.split(' ').pop() || ln;
        return dn === apName || dn.includes(apLast) || apName.includes(dn) || lnLast === apLast;
      });

      // narrow by position (Lisandro vs Lautaro Martínez), then first initial
      if (candidates.length > 1) {
        const samePos = candidates.filter((p) => p.position === pos);
        if (samePos.length >= 1) candidates = samePos;
      }
      if (candidates.length > 1 && apFirstInitial) {
        const narrowed = candidates.filter((p) => norm(p.firstName).startsWith(apFirstInitial));
        if (narrowed.length >= 1) candidates = narrowed;
      }
      // duplicate DB rows for the same person: take the first.
      if (
        candidates.length > 1 &&
        candidates.every((a) => candidates.every((b) => compatibleNames(a, b)))
      ) {
        console.log(`  ${n.code}: duplicate DB rows for "${ap.name}" - mapping the first`);
        candidates = [candidates[0]];
      }
      return candidates;
    }

    async function mapPlayer(ap: ApiSquadPlayer, p: DbPlayer) {
      matchedDbIds.add(p.id);
      nMapped++;
      if (APPLY) {
        await prisma.player.update({
          where: { id: p.id },
          data: {
            apiFootballId: ap.id,
            shirtNumber: ap.number ?? p.shirtNumber,
            ...(ap.photo ? { photoUrl: ap.photo } : {}),
          },
        });
      }
    }

    async function createPlayer(ap: ApiSquadPlayer) {
      const pos = mapPosition(ap.position);
      nCreated++;
      if (APPLY) {
        const parts = ap.name.split(' ');
        await prisma.player.create({
          data: {
            firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : ap.name,
            lastName: parts[parts.length - 1],
            displayName: ap.name,
            position: pos,
            nationId: n.id,
            currentPrice: DEFAULT_PRICE[pos],
            shirtNumber: ap.number,
            photoUrl: ap.photo,
            apiFootballId: ap.id,
          },
        });
      }
    }

    // First pass: defer anything ambiguous until everyone else has claimed
    // their row (fixes "M. Sarr" being compared before P.M./I. Sarr match).
    const deferred: ApiSquadPlayer[] = [];
    for (const ap of squad.players) {
      const candidates = findCandidates(ap);
      if (candidates.length === 1) await mapPlayer(ap, candidates[0]);
      else if (candidates.length > 1) deferred.push(ap);
      else await createPlayer(ap);
    }
    // Second pass: retry the ambiguous ones against the remaining pool.
    for (const ap of deferred) {
      const candidates = findCandidates(ap);
      if (candidates.length === 1) await mapPlayer(ap, candidates[0]);
      else if (candidates.length === 0) await createPlayer(ap);
      else
        ambiguous.push(`${n.code}: "${ap.name}" matches ${candidates.map((c) => c.displayName).join(' / ')}`);
    }

    const stale = dbPlayers.filter((p) => !matchedDbIds.has(p.id));
    if (stale.length) {
      staleByNation.push(`${n.code}: ${stale.map((p) => p.displayName).join(', ')}`);
    }

    mapped += nMapped;
    created += nCreated;
    console.log(
      `  ${n.code} (${squad.teamName}, id ${squad.teamId}): squad ${squad.players.length} -> map ${nMapped}, create ${nCreated}, stale ${stale.length}`,
    );
  }

  // ================= 4. STAMP FIXTURE IDS (paid plan) =================
  console.log('\nStamping Match.apiFootballId from /fixtures (season 2026)...');
  let stamped = 0;
  const stampSkipped: string[] = [];
  try {
    const apiFixtures = await api<ApiFixture[]>('/fixtures', { league: 1, season: 2026 });
    console.log(`API returned ${apiFixtures.length} fixtures`);

    const nationByApiTeamId = new Map<number, string>(); // api team id -> nation db id
    for (const [nationDbId, apiTeamId] of nationApiId) nationByApiTeamId.set(apiTeamId, nationDbId);

    for (const fx of apiFixtures) {
      const homeId = nationByApiTeamId.get(fx.teams.home.id);
      const awayId = nationByApiTeamId.get(fx.teams.away.id);
      if (!homeId || !awayId) {
        // knockout placeholders (teams TBD) land here - expected pre-groups
        stampSkipped.push(`${fx.teams.home.name} vs ${fx.teams.away.name} (${fx.league.round})`);
        continue;
      }
      const pair = seededPairs.find((p) => p.homeId === homeId && p.awayId === awayId);
      if (!pair) {
        stampSkipped.push(
          `${fx.teams.home.name} vs ${fx.teams.away.name} (${fx.league.round}) - no seeded match for this pairing`,
        );
        continue;
      }
      stamped++;
      if (APPLY) {
        await prisma.match.updateMany({
          where: { homeNationId: homeId, awayNationId: awayId, stageId: pair.stageDbId },
          data: { apiFootballId: fx.fixture.id, kickoffTime: new Date(fx.fixture.date) },
        });
      }
    }
  } catch (e) {
    console.log(`  fixture stamping failed: ${e instanceof Error ? e.message : e}`);
  }
  console.log(`Fixture ids stamped: ${stamped} (${stampSkipped.length} skipped)`);
  stampSkipped.slice(0, 10).forEach((s) => console.log('  SKIPPED:', s));
  if (stampSkipped.length > 10) console.log(`  ... and ${stampSkipped.length - 10} more`);

  // ================= SUMMARY =================
  console.log('\n========== SUMMARY ==========');
  console.log(`Mode: ${APPLY ? 'APPLIED' : 'DRY RUN - nothing written'}`);
  console.log(`Nation API ids: ${nationApiId.size}/${dbNations.length} resolved`);
  console.log(`Group matches: ${fxCreate} create + ${fxUpdate} update (${fxSkipped.length} skipped)`);
  console.log(`Players: ${mapped} existing mapped to API ids, ${created} new to create`);
  if (problems.length) {
    console.log('\nPROBLEMS:');
    problems.forEach((s) => console.log('  ', s));
  }
  if (ambiguous.length) {
    console.log(`\nAMBIGUOUS matches (left unmapped, fix by hand): ${ambiguous.length}`);
    ambiguous.forEach((a) => console.log('  ', a));
  }
  if (staleByNation.length) {
    console.log('\nSTALE players (in DB but NOT in the official squad - will never score):');
    staleByNation.forEach((s) => console.log('  ', s));
  }
  console.log(`Fixture ids: ${stamped} stamped`);
  console.log(`\nAPI calls made this run: ${apiCallsMade} (rest from cache)`);
  if (lastRateHeaders) console.log(`Rate limits after last call: ${lastRateHeaders}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
