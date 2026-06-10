import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { apiFootball } from '@/lib/api-football';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// One nation = one API request, paced at 1 req/sec inside the client. 48
// nations × 1s = 48s, plus DB writes. Give Vercel some headroom.
export const maxDuration = 120;

async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    return user?.isAdmin ? user : null;
  } catch {
    return null;
  }
}

/**
 * Normalise a name for fuzzy matching.
 *
 * Removes diacritics, lowercases, strips punctuation/whitespace.
 *   "M. Salah"  → "msalah"
 *   "Mané"      → "mane"
 *   "P.M. Sarr" → "pmsarr"
 */
function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * POST /api/admin/sync/photos
 *
 * For every nation that has an `apiFootballId` set, fetch the team squad from
 * API-Football and update existing Player rows with `photoUrl` and
 * `shirtNumber` *only* – we never overwrite displayName, position, or price.
 * This is designed to be run AFTER prices/positions are finalised so it
 * doesn't fight admin's manual data.
 *
 * Body (optional JSON):
 *   { dryRun?: boolean, nationCodes?: string[] }
 *     - dryRun: if true, just count matches without writing
 *     - nationCodes: limit sync to these nations (helps stay under rate limit)
 *
 * Response:
 *   {
 *     matched: number,         // players we updated
 *     unmatched: Array<{       // squad members we couldn't find in our DB
 *       nationCode, apiName, apiPosition
 *     }>,
 *     skippedNations: string[],// nations with no apiFootballId
 *     errors: Array<{ nationCode, message }>,
 *     remainingRequests: number,
 *   }
 */
export async function POST(request: Request) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { dryRun?: boolean; nationCodes?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine.
  }
  const dryRun = body?.dryRun === true;
  const nationFilter = Array.isArray(body?.nationCodes)
    ? new Set(body.nationCodes.map((c) => c.toUpperCase()))
    : null;

  // Pull the nations we'll try to sync. We need apiFootballId to even ask
  // the API; skip the rest (and report them so admin can wire them up).
  const nations = await prisma.nation.findMany({
    select: { id: true, code: true, name: true, apiFootballId: true },
    orderBy: { code: 'asc' },
  });

  const skippedNations: string[] = [];
  const errors: Array<{ nationCode: string; message: string }> = [];
  const unmatched: Array<{ nationCode: string; apiName: string; apiPosition: string }> = [];
  let matched = 0;

  for (const nation of nations) {
    if (nationFilter && !nationFilter.has(nation.code)) continue;
    if (!nation.apiFootballId) {
      skippedNations.push(nation.code);
      continue;
    }

    // Existing players for this nation, keyed by normalised displayName.
    const existing = await prisma.player.findMany({
      where: { nationId: nation.id },
      select: { id: true, firstName: true, lastName: true, displayName: true },
    });
    const byNormName = new Map<string, { id: string; displayName: string }>();
    for (const p of existing) {
      byNormName.set(normalize(p.displayName), { id: p.id, displayName: p.displayName });
      // Also key by surname-only and "first + last" so we catch more cases.
      byNormName.set(normalize(p.lastName), { id: p.id, displayName: p.displayName });
      byNormName.set(normalize(`${p.firstName} ${p.lastName}`), {
        id: p.id,
        displayName: p.displayName,
      });
    }

    let squadResponse: Awaited<ReturnType<typeof apiFootball.getTeamSquad>>;
    try {
      squadResponse = await apiFootball.getTeamSquad(nation.apiFootballId);
    } catch (err) {
      errors.push({
        nationCode: nation.code,
        message: err instanceof Error ? err.message : 'Unknown API error',
      });
      continue;
    }

    // API-Football's squad endpoint returns an array wrapping a single
    // team object whose `.players` is the actual roster.
    const apiPlayers = squadResponse[0]?.players || [];

    for (const apiPlayer of apiPlayers) {
      // API-Football returns the full name like "Mohamed Salah". Try matching
      // by full name first, then by last token.
      const fullNorm = normalize(apiPlayer.name);
      const surnameNorm = normalize(apiPlayer.name.split(/\s+/).pop() || '');

      const match = byNormName.get(fullNorm) || byNormName.get(surnameNorm);
      if (!match) {
        unmatched.push({
          nationCode: nation.code,
          apiName: apiPlayer.name,
          apiPosition: apiPlayer.position,
        });
        continue;
      }

      if (!dryRun) {
        await prisma.player.update({
          where: { id: match.id },
          data: {
            // Only fields that are safe to overwrite from API data:
            ...(apiPlayer.photo ? { photoUrl: apiPlayer.photo } : {}),
            ...(apiPlayer.number != null ? { shirtNumber: apiPlayer.number } : {}),
          },
        });
      }
      matched++;
    }
  }

  if (!dryRun) {
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'PLAYERS_PHOTO_SYNC',
        details: `Synced photos & shirt numbers from API-Football. matched=${matched}, unmatched=${unmatched.length}, errors=${errors.length}`,
      },
    });
  }

  return NextResponse.json({
    dryRun,
    matched,
    unmatched,
    skippedNations,
    errors,
    remainingRequests: apiFootball.getRemainingRequests(),
  });
}
