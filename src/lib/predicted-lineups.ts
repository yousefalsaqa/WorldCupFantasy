// ============================================
// Predicted lineups — admin-entered probable XIs (sourced from editorial
// sites like FotMob, transcribed by the admin). Stored as JSON on
// Match.predictedLineups, displayed in the fixture modal's Lineups tab
// ONLY until API-Football publishes the official team sheets, which then
// take over automatically.
//
// The name→player fuzzy matcher lives here so the admin API endpoint and
// the ops script (scripts/set-predicted-lineup.ts) can never disagree.
// ============================================

import { prisma } from './db';

export interface PredictedPlayer {
  playerId: string;
  /** Our DB displayName (not the editorial spelling). */
  name: string;
  number: number | null;
  /** G / D / M / F — same codes the confirmed-lineup renderer groups by. */
  pos: 'G' | 'D' | 'M' | 'F';
  photoUrl: string | null;
}

export interface PredictedSide {
  formation: string | null;
  players: PredictedPlayer[];
}

export interface PredictedLineups {
  home: PredictedSide;
  away: PredictedSide;
  updatedAt: string;
}

export function parsePredictedLineups(raw: string | null): PredictedLineups | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PredictedLineups;
  } catch {
    return null;
  }
}

const POS_CODE: Record<string, PredictedPlayer['pos']> = {
  GK: 'G',
  DEF: 'D',
  MID: 'M',
  FWD: 'F',
};

/** Lowercase, strip diacritics + punctuation. "Szczęsny" → "szczesny". */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[-\s]+/g, ' ')
    .trim();
}

export interface MatchResult {
  matched: PredictedPlayer[];
  /** Submitted names that couldn't be resolved to a unique squad player. */
  unmatched: Array<{ name: string; reason: string }>;
}

/**
 * Resolve editorial player names against one nation's squad.
 *
 * Tiers (first unique hit wins): exact normalized displayName → exact last
 * token → submitted-name tokens all contained in displayName (or vice
 * versa) → unique substring. Editorial sources usually print short forms
 * ("Son", "H. Ito", "Kim Min-jae") so last-token matching does most of the
 * work; anything ambiguous (two Lees) is reported back rather than guessed.
 */
export async function matchNamesToNationPlayers(
  nationId: string,
  names: string[],
): Promise<MatchResult> {
  const squad = await prisma.player.findMany({
    where: { nationId },
    select: {
      id: true,
      displayName: true,
      shirtNumber: true,
      position: true,
      photoUrl: true,
    },
  });
  const candidates = squad.map((p) => ({
    ...p,
    norm: normalize(p.displayName),
    tokens: normalize(p.displayName).split(' '),
  }));

  const matched: PredictedPlayer[] = [];
  const unmatched: MatchResult['unmatched'] = [];
  const taken = new Set<string>();

  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;
    const norm = normalize(name);
    const tokens = norm.split(' ');
    const last = tokens[tokens.length - 1];

    const available = candidates.filter((c) => !taken.has(c.id));
    const tiers: Array<typeof available> = [
      available.filter((c) => c.norm === norm),
      available.filter((c) => c.tokens[c.tokens.length - 1] === last && tokens.length === 1),
      available.filter((c) => tokens.every((t) => c.tokens.includes(t))),
      available.filter((c) => c.tokens.every((t) => tokens.includes(t))),
      available.filter((c) => c.norm.includes(norm) || norm.includes(c.norm)),
      available.filter((c) => c.tokens[c.tokens.length - 1] === last),
    ];

    let hit: (typeof available)[number] | null = null;
    let ambiguous: string[] | null = null;
    for (const tier of tiers) {
      if (tier.length === 1) {
        hit = tier[0];
        break;
      }
      if (tier.length > 1) {
        ambiguous = tier.map((c) => c.displayName);
        break;
      }
    }

    if (hit) {
      taken.add(hit.id);
      matched.push({
        playerId: hit.id,
        name: hit.displayName,
        number: hit.shirtNumber,
        pos: POS_CODE[hit.position] ?? 'M',
        photoUrl: hit.photoUrl,
      });
    } else {
      unmatched.push({
        name,
        reason: ambiguous
          ? `ambiguous — could be: ${ambiguous.join(', ')}`
          : 'no squad player matches',
      });
    }
  }

  return { matched, unmatched };
}
