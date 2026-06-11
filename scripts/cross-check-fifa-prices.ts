// ============================================
// CROSS-CHECK OUR PLAYERS vs FIFA's OFFICIAL FANTASY (play.fifa.com)
//
// Report-only — never writes to the DB. Reads the two JSON files
// downloaded from FIFA's public fantasy API:
//   scripts/fifa-players.json   (1,484 players, incl. 239 "transferred" cuts)
//   scripts/fifa-squads.json    (48 squads with FIFA abbreviations)
//
// What it checks, per the Jun-10 plan + Yousef's thresholds:
//   1. PRICE: FIFA's scale (3.5–10.5) is mapped onto ours (3.5–14.0) via
//      quantile mapping over matched players — keeps our curve shape,
//      corrects rankings using theirs. Then:
//        LOG  players where |our − expected| >= 0.7
//        FLAG players where |our − expected| >= 1.5  (decide before applying)
//   2. POSITION: FIFA uses the same GK/DEF/MID/FWD buckets — direct compare.
//   3. AVAILABILITY: our players matching a FIFA "transferred" row were cut
//      from the final squad — candidates for isAvailable=false.
//   4. COVERAGE: FIFA "playing" players we don't have, and our players FIFA
//      doesn't have.
//
// Output: console summary + full report at scripts/fifa-cross-check-report.md
//
//   npx tsx --env-file=.env scripts/cross-check-fifa-prices.ts
// ============================================

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LOG_THRESHOLD = 0.7;
const FLAG_THRESHOLD = 1.5;

interface FifaPlayer {
  id: number;
  firstName: string;
  lastName: string;
  knownName: string | null;
  squadId: number;
  position: string;
  price: number;
  status: string; // "playing" | "transferred"
  percentSelected: number;
}
interface FifaSquad { id: number; name: string; abbr: string; }

// ---------- name normalization (same approach as sync-from-api-football) ----------

function norm(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[ʻʼ’]/g, '') // ʻ ʼ ' joined: G'aniev → ganiev
    .replace(/[.''&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// strip Arabic-style prefixes for last-name comparison: Al Fakhouri ≈ Fakhoury
function stripPrefix(toks: string[]): string[] {
  return toks.filter((t, i) => !(i < toks.length - 1 && (t === 'al' || t === 'el')));
}
function tokenSet(s: string): string {
  return norm(s).split(' ').filter(Boolean).sort().join(' ');
}
function tokens(s: string): string[] {
  return norm(s).split(' ').filter(Boolean);
}
function joined(s: string): string {
  return norm(s).replace(/ /g, '');
}
// classic Levenshtein, early-exit when rows exceed max
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// ---------- quantile mapping ----------
// Given matched pairs, map a FIFA price to its percentile among FIFA prices,
// then read off the same percentile among OUR prices.
function buildQuantileMap(fifaPrices: number[], ourPrices: number[]) {
  const fx = [...fifaPrices].sort((a, b) => a - b);
  const fy = [...ourPrices].sort((a, b) => a - b);
  const n = fx.length;
  return (fifaPrice: number): number => {
    // mid-rank percentile of fifaPrice within fx
    let lo = 0, hi = 0;
    for (const v of fx) { if (v < fifaPrice) lo++; if (v <= fifaPrice) hi++; }
    const q = ((lo + hi) / 2) / n;
    const idx = q * (fy.length - 1);
    const i0 = Math.floor(idx), i1 = Math.ceil(idx);
    return fy[i0] + (fy[i1] - fy[i0]) * (idx - i0);
  };
}

async function main() {
  const fifaPlayers: FifaPlayer[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fifa-players.json'), 'utf8'));
  const fifaSquads: FifaSquad[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fifa-squads.json'), 'utf8'));

  const squadById = new Map(fifaSquads.map((s) => [s.id, s]));

  const dbPlayers = await prisma.player.findMany({
    select: {
      id: true, firstName: true, lastName: true, displayName: true,
      position: true, currentPrice: true, isAvailable: true,
      availabilityNote: true, apiFootballId: true,
      nation: { select: { code: true, name: true } },
    },
  });

  // -- nation code sanity: FIFA abbr should equal our Nation.code
  const ourCodes = new Set(dbPlayers.map((p) => p.nation.code));
  const fifaCodes = new Set(fifaSquads.map((s) => s.abbr));
  const codeMismatches = [
    ...[...fifaCodes].filter((c) => !ourCodes.has(c)).map((c) => `FIFA has ${c}, DB doesn't`),
    ...[...ourCodes].filter((c) => !fifaCodes.has(c)).map((c) => `DB has ${c}, FIFA doesn't`),
  ];

  // -- index DB players per nation
  const dbByNation = new Map<string, typeof dbPlayers>();
  for (const p of dbPlayers) {
    const arr = dbByNation.get(p.nation.code) || [];
    arr.push(p);
    dbByNation.set(p.nation.code, arr);
  }

  type DbPlayer = (typeof dbPlayers)[number];
  const matchedDbIds = new Set<string>();
  const matches: Array<{ db: DbPlayer; fifa: FifaPlayer; how: string }> = [];
  const unmatchedFifa: FifaPlayer[] = [];

  // candidate keys for a DB player (NO bare last name — namesakes like the
  // three Ecuador Caicedos must go through the both-side-unique strategies)
  function dbKeys(p: DbPlayer): string[] {
    const keys = new Set<string>();
    keys.add(tokenSet(`${p.firstName} ${p.lastName}`));
    keys.add(tokenSet(p.displayName));
    return [...keys].filter(Boolean);
  }
  // candidate keys for a FIFA player
  function fifaKeys(f: FifaPlayer): string[] {
    const keys = new Set<string>();
    keys.add(tokenSet(`${f.firstName} ${f.lastName}`));
    if (f.knownName) keys.add(tokenSet(f.knownName));
    return [...keys].filter(Boolean);
  }
  // all tokens a FIFA player's names contain
  function fifaAllTokens(f: FifaPlayer): Set<string> {
    return new Set([
      ...tokens(`${f.firstName} ${f.lastName}`),
      ...(f.knownName ? tokens(f.knownName) : []),
    ]);
  }

  const playing = fifaPlayers.filter((f) => f.status === 'playing');
  const transferred = fifaPlayers.filter((f) => f.status === 'transferred');

  for (const f of playing) {
    const squad = squadById.get(f.squadId)!;
    const pool = (dbByNation.get(squad.abbr) || []).filter((p) => !matchedDbIds.has(p.id));
    if (pool.length === 0) { unmatchedFifa.push(f); continue; }

    const fKeys = fifaKeys(f);
    const squadPlaying = playing.filter((o) => o.squadId === f.squadId);

    let hit: DbPlayer | undefined;
    let how = '';

    // 1) exact key overlap (full/known name vs full/display name), unique
    const exact = pool.filter((p) => dbKeys(p).some((k) => fKeys.includes(k)));
    if (exact.length === 1) { hit = exact[0]; how = 'exact'; }

    // 2) subset: DB displayName tokens ⊆ FIFA name tokens — but only if THIS
    //    FIFA player is the only one in the squad subsuming that DB player
    //    (stops FIFA "Jordy Caicedo" stealing our "Caicedo" from Moisés)
    if (!hit) {
      const subsumes = (o: FifaPlayer, dt: string[]) => {
        const all = fifaAllTokens(o);
        return dt.length > 0 && dt.every((t) => all.has(t));
      };
      const sub = pool.filter((p) => {
        const dt = tokens(p.displayName);
        if (!subsumes(f, dt)) return false;
        const rivals = squadPlaying.filter((o) => o.id !== f.id && subsumes(o, dt));
        return rivals.length === 0;
      });
      if (sub.length === 1) { hit = sub[0]; how = 'subset'; }
    }

    // 3) initial style: DB "M. Olise" → initial + last tokens must equal
    //    FIFA first-initial + last name, unique on BOTH sides
    if (!hit) {
      const iniKey = (first: string, last: string) => {
        const ft = tokens(first), lt = tokens(last);
        if (!ft.length || !lt.length) return '';
        return `${ft[0][0]}|${lt.join(' ')}`;
      };
      const dbIniKey = (p: DbPlayer) => {
        const dt = tokens(p.displayName);
        if (dt.length < 2) return '';
        return `${dt[0][0]}|${dt.slice(1).join(' ')}`;
      };
      const fKey = iniKey(f.firstName, f.lastName);
      if (fKey) {
        const fifaRivals = squadPlaying.filter((o) => iniKey(o.firstName, o.lastName) === fKey);
        const ini = pool.filter((p) => dbIniKey(p) === fKey);
        if (fifaRivals.length === 1 && ini.length === 1) { hit = ini[0]; how = 'initial+last'; }
      }
    }

    // 4) unique last name within nation (both sides unique)
    if (!hit) {
      const lastKey = tokenSet(f.lastName);
      if (lastKey) {
        const sameLastFifa = squadPlaying.filter((o) => tokenSet(o.lastName) === lastKey);
        const byLast = pool.filter((p) =>
          tokenSet(p.lastName) === lastKey ||
          tokenSet(tokens(p.displayName).slice(-lastKey.split(' ').length).join(' ')) === lastKey);
        if (sameLastFifa.length === 1 && byLast.length === 1) {
          hit = byLast[0]; how = 'unique-last';
        }
      }
    }

    // 5) reverse subset: FIFA name tokens ⊆ DB tokens, unique both sides
    //    e.g. FIFA "Pau Cubarsí" ⊆ DB "Pau Cubarsí Paredes",
    //         FIFA "Paul Okon" ⊆ DB "Paul Okon-Engstler"
    if (!hit) {
      const fTok = [...fifaAllTokens(f)];
      const dbAllTokens = (p: DbPlayer) =>
        new Set([...tokens(p.displayName), ...tokens(`${p.firstName} ${p.lastName}`)]);
      const fifaTokSubsetOf = (o: FifaPlayer, dset: Set<string>) => {
        const ot = [...fifaAllTokens(o)];
        return ot.length > 0 && ot.every((t) => dset.has(t));
      };
      const rev = pool.filter((p) => {
        const dset = dbAllTokens(p);
        if (!(fTok.length > 0 && fTok.every((t) => dset.has(t)))) return false;
        const rivals = squadPlaying.filter((o) => o.id !== f.id && fifaTokSubsetOf(o, dset));
        return rivals.length === 0;
      });
      if (rev.length === 1) { hit = rev[0]; how = 'rev-subset'; }
    }

    // 6) initial + last-name-subset: DB "B. Doak" vs FIFA "Ben Gannon-Doak"
    if (!hit) {
      const fInit = (tokens(f.firstName)[0] || '')[0] || '';
      const fLast = new Set(tokens(f.lastName));
      const ini = pool.filter((p) => {
        const dt = tokens(p.displayName);
        if (dt.length < 2 || dt[0].length !== 1) return false;
        return dt[0] === fInit && dt.slice(1).every((t) => fLast.has(t));
      });
      if (ini.length === 1) {
        const p = ini[0];
        const dt = tokens(p.displayName);
        const rivals = squadPlaying.filter((o) =>
          o.id !== f.id &&
          ((tokens(o.firstName)[0] || '')[0] || '') === dt[0] &&
          dt.slice(1).every((t) => new Set(tokens(o.lastName)).has(t)));
        if (rivals.length === 0) { hit = p; how = 'initial+last-subset'; }
      }
    }

    // 7) fuzzy: edit distance <= 2 between joined names (spelling variants
    //    like Kadish/Kadesh, Al Brake/Al Braik, Jin-Seob/Jin-Seop) —
    //    unique best match, verified in reverse
    if (!hit) {
      const fJoined = [joined(`${f.firstName} ${f.lastName}`), f.knownName ? joined(f.knownName) : '']
        .filter(Boolean);
      const dbJoined = (p: DbPlayer) =>
        [joined(`${p.firstName} ${p.lastName}`), joined(p.displayName)].filter(Boolean);
      const distTo = (cands: string[]) => {
        let best = 3;
        for (const a of fJoined) for (const b of cands) {
          const max = Math.min(2, Math.max(1, Math.floor(Math.min(a.length, b.length) / 5)));
          const d = editDistance(a, b, max);
          if (d <= max) best = Math.min(best, d);
        }
        return best;
      };
      const scored = pool
        .map((p) => ({ p, d: distTo(dbJoined(p)) }))
        .filter((x) => x.d <= 2)
        .sort((a, b) => a.d - b.d);
      if (scored.length === 1 || (scored.length > 1 && scored[0].d < scored[1].d)) {
        // reverse check: no other FIFA player in squad is as close to this DB row
        const target = dbJoined(scored[0].p);
        const rival = squadPlaying.some((o) => {
          if (o.id === f.id) return false;
          const oj = [joined(`${o.firstName} ${o.lastName}`), o.knownName ? joined(o.knownName) : ''].filter(Boolean);
          for (const a of oj) for (const b of target) {
            const max = Math.min(2, Math.max(1, Math.floor(Math.min(a.length, b.length) / 5)));
            if (editDistance(a, b, max) <= Math.min(max, scored[0].d)) return true;
          }
          return false;
        });
        if (!rival) { hit = scored[0].p; how = `fuzzy(${scored[0].d})`; }
      }
    }

    if (hit) { matchedDbIds.add(hit.id); matches.push({ db: hit, fifa: f, how }); }
    else unmatchedFifa.push(f);
  }

  // ---------- pass 2: API-Football-assisted matching ----------
  // For DB leftovers, fetch the player's official full name from
  // API-Football (/players/profiles) and retry against FIFA leftovers.
  // Bridges transliteration gaps (Z. Ismaeel↔Zaid Ismael) and nicknames
  // (Meme↔Mohanad Ali). Responses cached so reruns cost zero quota.
  const PROFILE_CACHE = path.join(__dirname, '.api-profile-cache.json');
  const profileCache: Record<string, { firstname: string; lastname: string; name: string }> =
    fs.existsSync(PROFILE_CACHE) ? JSON.parse(fs.readFileSync(PROFILE_CACHE, 'utf8')) : {};
  const API_KEY = process.env.API_FOOTBALL_KEY || '';

  async function fetchProfile(apiId: number) {
    const key = String(apiId);
    if (profileCache[key]) return profileCache[key];
    if (!API_KEY) return null;
    const res = await fetch(`https://v3.football.api-sports.io/players/profiles?player=${apiId}`, {
      headers: { 'x-apisports-key': API_KEY },
    });
    if (!res.ok) { console.log(`  (profile ${apiId}: HTTP ${res.status})`); return null; }
    const data = await res.json();
    const pl = data?.response?.[0]?.player;
    if (!pl) return null;
    profileCache[key] = { firstname: pl.firstname || '', lastname: pl.lastname || '', name: pl.name || '' };
    fs.writeFileSync(PROFILE_CACHE, JSON.stringify(profileCache), 'utf8');
    await new Promise((r) => setTimeout(r, 200));
    return profileCache[key];
  }

  {
    const leftoverDb = dbPlayers.filter((p) => !matchedDbIds.has(p.id));
    const fifaLeftBySquad = new Map<string, FifaPlayer[]>();
    for (const f of unmatchedFifa) {
      const abbr = squadById.get(f.squadId)!.abbr;
      (fifaLeftBySquad.get(abbr) || fifaLeftBySquad.set(abbr, []).get(abbr)!).push(f);
    }
    const claimedFifa = new Set<number>();

    for (const p of leftoverDb) {
      const fifaCands = (fifaLeftBySquad.get(p.nation.code) || []).filter((f) => !claimedFifa.has(f.id));
      if (!fifaCands.length || !p.apiFootballId) continue;
      const prof = await fetchProfile(p.apiFootballId);
      if (!prof) continue;

      const apiTokens = new Set([
        ...tokens(prof.firstname), ...tokens(prof.lastname), ...tokens(prof.name),
        ...tokens(p.displayName), ...tokens(`${p.firstName} ${p.lastName}`),
      ]);
      const apiJoined = [
        joined(`${prof.firstname} ${prof.lastname}`), joined(prof.name),
        joined(p.displayName),
      ].filter((s) => s.length > 2);

      // initial + last-name comparison material from the DB side
      const dt = tokens(p.displayName);
      const dbInit = dt.length >= 2 && dt[0].length === 1 ? dt[0] : (dt[0]?.[0] || '');
      const dbLastJoined = stripPrefix(dt.length >= 2 ? dt.slice(1) : dt).join('');

      let best: { f: FifaPlayer; score: number } | undefined;
      for (const f of fifaCands) {
        const fTok = [...fifaAllTokens(f)];
        const fJoin = [joined(`${f.firstName} ${f.lastName}`), f.knownName ? joined(f.knownName) : ''].filter(Boolean);
        let score = 0;
        if (fTok.every((t) => apiTokens.has(t))) score = 100;                  // FIFA ⊆ API tokens
        else {
          const overlap = fTok.filter((t) => apiTokens.has(t) && t.length > 1).length;
          // full-name fuzzy, threshold scaled to name length (cap 2 — a
          // distance of 3 already pairs Sabra↔Sadeh, too loose)
          let fullFuzzy = false;
          for (const a of apiJoined) for (const b of fJoin) {
            const max = Math.min(2, Math.floor(Math.min(a.length, b.length) / 4));
            if (max > 0 && editDistance(a, b, max) <= max) fullFuzzy = true;
          }
          // initial + last-name fuzzy: "M. Ghaedi" vs "Mehdi Ghayedi".
          // FIFA's Arabic entries chain the full name through firstName
          // ("Zaid Ismael Khaleel" / "Al Dulaimi") with the usable form in
          // knownName ("Zaid Ismael") — so derive init+last from both.
          const fifaInitLast: Array<[string, string]> = [];
          fifaInitLast.push([
            (tokens(f.firstName)[0] || '')[0] || '',
            stripPrefix(tokens(f.lastName)).join(''),
          ]);
          if (f.knownName) {
            const kt = tokens(f.knownName);
            if (kt.length >= 2) fifaInitLast.push([kt[0][0], stripPrefix(kt.slice(1)).join('')]);
          }
          const lastFuzzy = !!dbInit && dbLastJoined.length >= 4 &&
            fifaInitLast.some(([fInit, fLastJoined]) =>
              dbInit === fInit && fLastJoined.length > 0 &&
              editDistance(dbLastJoined, fLastJoined, 2) <=
                Math.min(2, Math.max(1, Math.floor(Math.min(dbLastJoined.length, fLastJoined.length) / 4))));
          // overlap of generic given names (Ibrahim, Mohammad…) pairs
          // wrong people — require a surname token in the overlap
          const fLastTok = new Set([
            ...tokens(f.lastName),
            ...(f.knownName ? tokens(f.knownName).slice(1) : []),
          ]);
          const overlapToks = fTok.filter((t) => apiTokens.has(t) && t.length > 1);
          if (fullFuzzy) score = 45;
          else if (lastFuzzy) score = 40;
          else if (overlap >= 2 && overlapToks.some((t) => fLastTok.has(t))) score = 20 + overlap;
        }
        if (score > 0 && (!best || score > best.score)) best = { f, score };
      }
      if (best && best.score >= 20) {
        claimedFifa.add(best.f.id);
        matchedDbIds.add(p.id);
        matches.push({ db: p, fifa: best.f, how: `api(${best.score})` });
      }
    }

    // drop claimed from unmatched list
    for (let i = unmatchedFifa.length - 1; i >= 0; i--) {
      if (claimedFifa.has(unmatchedFifa[i].id)) unmatchedFifa.splice(i, 1);
    }
  }

  // our players FIFA cut (matched against "transferred" rows: exact keys,
  // subset either direction, or initial+last)
  const unmatchedDb = dbPlayers.filter((p) => !matchedDbIds.has(p.id));
  const cutCandidates: Array<{ db: DbPlayer; fifa: FifaPlayer }> = [];
  for (const p of unmatchedDb) {
    const dt = tokens(p.displayName);
    const dset = new Set([...dt, ...tokens(`${p.firstName} ${p.lastName}`)]);
    const f = transferred.find((t) => {
      const squad = squadById.get(t.squadId)!;
      if (squad.abbr !== p.nation.code) return false;
      if (dbKeys(p).some((k) => fifaKeys(t).includes(k))) return true;
      const fAll = fifaAllTokens(t);
      if (dt.length > 0 && dt.every((tok) => fAll.has(tok))) return true;          // DB ⊆ FIFA
      const fTok = [...fAll];
      if (fTok.length > 0 && fTok.every((tok) => dset.has(tok))) return true;      // FIFA ⊆ DB
      const fInit = (tokens(t.firstName)[0] || '')[0] || '';
      // initial matches and the rest of the DB name appears ANYWHERE in the
      // FIFA name chain ("A. Yahya" ↔ "Ahmed Yahya Mahmood Al Hajjaj")
      if (dt.length >= 2 && dt[0].length === 1 && dt[0] === fInit &&
          dt.slice(1).every((tok) => fAll.has(tok))) return true;
      return false;
    });
    if (f) cutCandidates.push({ db: p, fifa: f });
  }
  // ---------- pass 3: leftover pairing (AFTER cut detection, so a cut
  // player can't be wrongly paired with his replacement) ----------
  // Within a nation+position group with equal counts on both sides, pair
  // by shared-token signal first, then pair a lone remainder. Tagged
  // 'leftover' for manual review (e.g. IRQ "Meme" ↔ "Mohanad Ali",
  // whose nickname is Meme).
  {
    const cutIds = new Set(cutCandidates.map((c) => c.db.id));
    const claimedFifa = new Set<number>();
    const byNation = new Map<string, FifaPlayer[]>();
    for (const f of unmatchedFifa) {
      const abbr = squadById.get(f.squadId)!.abbr;
      (byNation.get(abbr) || byNation.set(abbr, []).get(abbr)!).push(f);
    }
    for (const [abbr, fifaLeft] of byNation) {
      const dbLeft = dbPlayers.filter(
        (p) => p.nation.code === abbr && !matchedDbIds.has(p.id) && !cutIds.has(p.id));
      for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
        let fPos = fifaLeft.filter((f) => f.position === pos && !claimedFifa.has(f.id));
        let dPos = dbLeft.filter((p) => p.position === pos && !matchedDbIds.has(p.id));
        if (fPos.length === 0 || fPos.length !== dPos.length) continue;
        // shared-token pairs first (tokens > 1 char, e.g. "hashim")
        for (const p of [...dPos]) {
          const dset = new Set(
            [...tokens(p.displayName), ...tokens(`${p.firstName} ${p.lastName}`)]
              .filter((t) => t.length > 1));
          const sig = fPos.filter((f) => [...fifaAllTokens(f)].some((t) => dset.has(t)));
          if (sig.length === 1) {
            claimedFifa.add(sig[0].id);
            matchedDbIds.add(p.id);
            matches.push({ db: p, fifa: sig[0], how: 'leftover-signal' });
            fPos = fPos.filter((f) => f.id !== sig[0].id);
            dPos = dPos.filter((x) => x.id !== p.id);
          }
        }
        // lone remainder on both sides → pair it
        if (fPos.length === 1 && dPos.length === 1) {
          claimedFifa.add(fPos[0].id);
          matchedDbIds.add(dPos[0].id);
          matches.push({ db: dPos[0], fifa: fPos[0], how: 'leftover-1to1' });
        }
      }
    }
    for (let i = unmatchedFifa.length - 1; i >= 0; i--) {
      if (claimedFifa.has(unmatchedFifa[i].id)) unmatchedFifa.splice(i, 1);
    }
  }

  const trulyUnmatchedDb = dbPlayers.filter(
    (p) => !matchedDbIds.has(p.id) && !cutCandidates.some((c) => c.db.id === p.id));

  // ---------- price analysis ----------
  const mapPrice = buildQuantileMap(
    matches.map((m) => m.fifa.price),
    matches.map((m) => m.db.currentPrice));

  type Diff = {
    id: string; code: string; name: string; pos: string;
    ours: number; fifa: number; expected: number; rounded: number; diff: number; pct: number;
  };
  const diffs: Diff[] = matches.map((m) => {
    const expected = mapPrice(m.fifa.price);
    return {
      id: m.db.id, code: m.db.nation.code, name: m.db.displayName, pos: m.db.position,
      ours: m.db.currentPrice, fifa: m.fifa.price,
      expected: Math.round(expected * 10) / 10,
      rounded: Math.max(3.5, Math.round(expected * 2) / 2),
      diff: Math.round((m.db.currentPrice - expected) * 10) / 10,
      pct: m.fifa.percentSelected,
    };
  });
  const flagged = diffs.filter((d) => Math.abs(d.diff) >= FLAG_THRESHOLD)
    .sort((a, b) => a.diff - b.diff);
  const logged = diffs.filter((d) => Math.abs(d.diff) >= LOG_THRESHOLD && Math.abs(d.diff) < FLAG_THRESHOLD)
    .sort((a, b) => a.diff - b.diff);

  // ---------- position mismatches ----------
  const posMismatches = matches
    .filter((m) => m.db.position !== m.fifa.position)
    .map((m) => ({
      id: m.db.id, code: m.db.nation.code, name: m.db.displayName,
      ours: m.db.position, fifa: m.fifa.position,
      price: m.db.currentPrice, how: m.how,
    }));

  // ---------- report ----------
  const fmtDiff = (d: Diff) =>
    `| ${d.code} | ${d.name} | ${d.pos} | £${d.ours.toFixed(1)} | £${d.expected.toFixed(1)} | ${d.diff > 0 ? '+' : ''}${d.diff.toFixed(1)} | ${d.fifa.toFixed(1)} | ${d.pct}% |`;
  const diffHeader =
    '| Nat | Player | Pos | Ours | Expected | Diff | FIFA raw | FIFA picked |\n|---|---|---|---|---|---|---|---|';

  const lines: string[] = [];
  lines.push('# FIFA fantasy cross-check report');
  lines.push(`Generated ${new Date().toISOString()} — report only, nothing applied.`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- FIFA "playing": ${playing.length} | our DB: ${dbPlayers.length}`);
  lines.push(`- Matched: ${matches.length} (${(matches.length / playing.length * 100).toFixed(1)}% of FIFA)`);
  lines.push(`- FIFA players we don't have: ${unmatchedFifa.length}`);
  lines.push(`- Our players FIFA cut (transferred): ${cutCandidates.length}`);
  lines.push(`- Our players with no FIFA row at all: ${trulyUnmatchedDb.length}`);
  lines.push(`- Position mismatches: ${posMismatches.length}`);
  lines.push(`- Price FLAG (|diff| >= ${FLAG_THRESHOLD}): ${flagged.length}`);
  lines.push(`- Price LOG  (${LOG_THRESHOLD} <= |diff| < ${FLAG_THRESHOLD}): ${logged.length}`);
  if (codeMismatches.length) {
    lines.push('', '## ⚠ Nation code mismatches', ...codeMismatches.map((c) => `- ${c}`));
  }

  lines.push('', `## 🚩 FLAGGED — |diff| >= £${FLAG_THRESHOLD}m (decide what to do)`);
  lines.push('Negative diff = we are CHEAP vs FIFA (likely Feb–Jun breakout). Positive = we are EXPENSIVE.');
  lines.push('', diffHeader, ...flagged.map(fmtDiff));

  lines.push('', `## 📋 LOGGED — £${LOG_THRESHOLD}m <= |diff| < £${FLAG_THRESHOLD}m`);
  lines.push('', diffHeader, ...logged.map(fmtDiff));

  lines.push('', '## 🔄 Position mismatches (ours vs FIFA)');
  lines.push('', '| Nat | Player | Ours | FIFA | Our price | Matched via |', '|---|---|---|---|---|---|');
  lines.push(...posMismatches.map((m) =>
    `| ${m.code} | ${m.name} | ${m.ours} | ${m.fifa} | £${m.price.toFixed(1)} | ${m.how} |`));

  const softMatches = matches.filter((m) =>
    m.how.startsWith('fuzzy') || m.how.startsWith('api') || m.how.startsWith('leftover'));
  lines.push('', '## 👀 Soft matches (fuzzy / API-Football-assisted) — eyeball these');
  lines.push('', '| Nat | Our player | FIFA name | Pos ours/FIFA | Via |', '|---|---|---|---|---|');
  lines.push(...softMatches.map((m) =>
    `| ${m.db.nation.code} | ${m.db.displayName} | ${m.fifa.knownName || `${m.fifa.firstName} ${m.fifa.lastName}`} | ${m.db.position}/${m.fifa.position} | ${m.how} |`));

  lines.push('', '## 🚪 Our players FIFA marks "transferred" (cut from final squad)');
  lines.push('', '| Nat | Player | Our price | isAvailable | Note |', '|---|---|---|---|---|');
  lines.push(...cutCandidates.map((c) =>
    `| ${c.db.nation.code} | ${c.db.displayName} | £${c.db.currentPrice.toFixed(1)} | ${c.db.isAvailable} | ${c.db.availabilityNote || ''} |`));

  lines.push('', '## ❓ FIFA "playing" players we could not match');
  lines.push('', '| Nat | FIFA name | Pos | FIFA price |', '|---|---|---|---|');
  lines.push(...unmatchedFifa.map((f) => {
    const sq = squadById.get(f.squadId)!;
    const name = f.knownName || `${f.firstName} ${f.lastName}`;
    return `| ${sq.abbr} | ${name} | ${f.position} | ${f.price.toFixed(1)} |`;
  }));

  lines.push('', '## ❓ Our players with no FIFA row (playing or transferred)');
  lines.push('', '| Nat | Player | Pos | Our price | apiFootballId |', '|---|---|---|---|---|');
  lines.push(...trulyUnmatchedDb.map((p) =>
    `| ${p.nation.code} | ${p.displayName} | ${p.position} | £${p.currentPrice.toFixed(1)} | ${p.apiFootballId} |`));

  const reportPath = path.join(__dirname, 'fifa-cross-check-report.md');
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');

  // machine-readable plan for apply-fifa-sync.ts: reprice everyone whose
  // scale-adjusted diff is >= LOG_THRESHOLD, to the rounded expected price
  const plan = {
    generated: new Date().toISOString(),
    priceChanges: diffs
      .filter((d) => Math.abs(d.diff) >= LOG_THRESHOLD && d.rounded !== d.ours)
      .map((d) => ({
        id: d.id, code: d.code, name: d.name, pos: d.pos,
        from: d.ours, to: d.rounded, fifa: d.fifa,
        band: Math.abs(d.diff) >= FLAG_THRESHOLD ? 'FLAG' : 'LOG',
      })),
    cuts: cutCandidates.map((c) => ({
      id: c.db.id, code: c.db.nation.code, name: c.db.displayName,
    })),
    posFixes: posMismatches,
  };
  fs.writeFileSync(path.join(__dirname, 'fifa-sync-plan.json'), JSON.stringify(plan, null, 2), 'utf8');

  // console: summary + flagged only (full detail in the file)
  console.log(lines.slice(0, 20).join('\n'));
  console.log(`\n🚩 FLAGGED (${flagged.length}):`);
  for (const d of flagged) {
    console.log(`  ${d.code} ${d.name.padEnd(26)} ours £${d.ours.toFixed(1)}  expected £${d.expected.toFixed(1)}  diff ${d.diff > 0 ? '+' : ''}${d.diff.toFixed(1)}  (FIFA raw ${d.fifa.toFixed(1)}, picked ${d.pct}%)`);
  }
  console.log(`\nFull report: ${reportPath}`);
}

main().finally(() => prisma.$disconnect());
