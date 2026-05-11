import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// CSV imports can be large – allow up to 60 seconds before Vercel kills us.
export const maxDuration = 60;

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
 * Bulk-import players from a CSV blob.
 *
 * Expected CSV columns (case-insensitive, order doesn't matter):
 *   nationCode    – 3-letter FIFA code, must match an existing Nation
 *   position      – GK | DEF | MID | FWD
 *   displayName   – Name shown on the player card (e.g. "L. Messi")
 *   firstName     – (optional) defaults to first token of displayName
 *   lastName      – (optional) defaults to last token of displayName
 *   price         – fantasy price in millions (e.g. 5.5). Snapped to 0.5.
 *   shirtNumber   – (optional) integer
 *   photoUrl      – (optional)
 *
 * Rows are upserted by the composite key (nationCode + displayName).
 * The result is a per-row summary: created / updated / skipped (with reason).
 *
 * We accept either:
 *   - { csv: "...full csv text..." }  – JSON body
 *   - raw text/csv body
 */
export async function POST(request: Request) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 0. Refuse if the player table is locked. Bulk import is the most
  //    destructive write surface in the admin UI, so this is the place the
  //    lock has to bite (in addition to the seed script).
  const lock = await prisma.appSetting.findUnique({ where: { key: 'PLAYER_TABLE_LOCKED' } });
  if (lock?.value === 'true') {
    return NextResponse.json(
      {
        error:
          'Player table is locked. Unlock it from the admin dashboard before importing.',
      },
      { status: 423 }, // 423 Locked
    );
  }

  // 1. Pull CSV text out of whatever body shape the client sent.
  let csvText = '';
  const contentType = request.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const body = await request.json();
      csvText = typeof body?.csv === 'string' ? body.csv : '';
    } else {
      csvText = await request.text();
    }
  } catch {
    return NextResponse.json({ error: 'Could not read request body' }, { status: 400 });
  }

  if (!csvText.trim()) {
    return NextResponse.json({ error: 'No CSV content provided' }, { status: 400 });
  }

  // 2. Parse.
  let rows: Record<string, string>[];
  try {
    rows = parseCsv(csvText);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to parse CSV' },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 });
  }

  // 3. Pre-load all nations so we don't hit the DB once per row.
  const nations = await prisma.nation.findMany({ select: { id: true, code: true } });
  const nationByCode = new Map(nations.map((n) => [n.code.toUpperCase(), n.id]));

  // 4. Walk rows, upserting each. Track per-row outcome for the response.
  const VALID_POSITIONS = new Set(['GK', 'DEF', 'MID', 'FWD']);
  type Outcome =
    | { row: number; status: 'created' | 'updated'; displayName: string; nationCode: string }
    | { row: number; status: 'skipped'; reason: string };
  const outcomes: Outcome[] = [];

  let createdCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const rowNum = i + 2; // header is row 1, first data row is row 2

    const nationCode = (raw.nationcode || raw.nation_code || raw.nation || '').toUpperCase().trim();
    const position = (raw.position || '').toUpperCase().trim();
    const displayName = (raw.displayname || raw.display_name || raw.name || '').trim();

    if (!nationCode || !position || !displayName) {
      outcomes.push({
        row: rowNum,
        status: 'skipped',
        reason: 'Missing required field (nationCode, position, or displayName)',
      });
      continue;
    }

    const nationId = nationByCode.get(nationCode);
    if (!nationId) {
      outcomes.push({ row: rowNum, status: 'skipped', reason: `Unknown nationCode "${nationCode}"` });
      continue;
    }

    if (!VALID_POSITIONS.has(position)) {
      outcomes.push({ row: rowNum, status: 'skipped', reason: `Invalid position "${position}"` });
      continue;
    }

    // Split displayName as a sensible default for first/last when not provided.
    const parts = displayName.split(/\s+/);
    const firstName = (raw.firstname || raw.first_name || parts.slice(0, -1).join(' ') || parts[0]).trim();
    const lastName = (raw.lastname || raw.last_name || parts.slice(-1).join(' ')).trim();

    // Price: snap to nearest 0.5 in [4.0, 15.0]. Defaults from the existing
    // dataset's medians per position so new entries don't look out-of-place.
    const priceParsed = parseFloat(raw.price || raw.currentprice || raw.current_price || '');
    const defaultPriceByPos: Record<string, number> = { GK: 4.5, DEF: 5.0, MID: 6.5, FWD: 7.0 };
    let price = Number.isFinite(priceParsed) ? priceParsed : defaultPriceByPos[position];
    price = Math.max(4.0, Math.min(15.0, Math.round(price * 2) / 2));

    const shirtParsed = parseInt(raw.shirtnumber || raw.shirt_number || raw.number || '', 10);
    const shirtNumber = Number.isFinite(shirtParsed) ? shirtParsed : null;

    const photoUrl = raw.photourl || raw.photo_url || raw.photo || null;

    // Upsert by (nationId, displayName) – the natural key for a tournament
    // squad. There's no DB-level unique constraint on this pair, so we
    // do a manual findFirst → update | create.
    const existing = await prisma.player.findFirst({
      where: { nationId, displayName },
    });

    if (existing) {
      await prisma.player.update({
        where: { id: existing.id },
        data: {
          firstName,
          lastName,
          position,
          currentPrice: price,
          shirtNumber,
          // Only overwrite photoUrl if the row supplied one – preserves
          // anything the photo-sync job has set.
          ...(photoUrl ? { photoUrl } : {}),
        },
      });
      updatedCount++;
      outcomes.push({ row: rowNum, status: 'updated', displayName, nationCode });
    } else {
      await prisma.player.create({
        data: {
          firstName,
          lastName,
          displayName,
          position,
          nationId,
          currentPrice: price,
          shirtNumber,
          photoUrl,
        },
      });
      createdCount++;
      outcomes.push({ row: rowNum, status: 'created', displayName, nationCode });
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'PLAYERS_BULK_IMPORTED',
      details: `Imported ${createdCount + updatedCount} players via CSV (${createdCount} new, ${updatedCount} updated, ${outcomes.length - createdCount - updatedCount} skipped)`,
    },
  });

  return NextResponse.json({
    totalRows: rows.length,
    created: createdCount,
    updated: updatedCount,
    skipped: outcomes.length - createdCount - updatedCount,
    outcomes,
  });
}

/**
 * Minimal CSV parser tailored for our use-case.
 *
 * - First row = header, lowercase'd for case-insensitive lookups.
 * - Supports double-quoted fields ("Doe, John"), with "" inside meaning a literal ".
 * - Blank lines are ignored.
 * - Trailing CRs are stripped.
 *
 * Returns an array of records keyed by header name.
 */
function parseCsv(text: string): Record<string, string>[] {
  const rows = splitCsvLines(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.length === 1 && cells[0].trim() === '') continue; // blank line
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (cells[c] ?? '').trim();
    }
    out.push(obj);
  }
  return out;
}

function splitCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      // Handle \r\n as a single line break.
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
    } else {
      field += ch;
    }
  }

  // Flush the trailing row if no final newline.
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }

  return rows;
}
