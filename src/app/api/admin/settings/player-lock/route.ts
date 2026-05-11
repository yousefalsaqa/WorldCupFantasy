import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// Cookie-reading routes can't be statically optimized.
export const dynamic = 'force-dynamic';

const SETTING_KEY = 'PLAYER_TABLE_LOCKED';

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

// GET — read current lock state.
// Returns `{ locked: false, updatedAt: null, updatedBy: null }` when the
// setting row hasn't been written yet, so the dashboard can treat absence as
// "unlocked".
export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
    return NextResponse.json({
      locked: row?.value === 'true',
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    });
  } catch (err) {
    console.error('Read player-lock setting error:', err);
    return NextResponse.json({ error: 'Failed to read lock state' }, { status: 500 });
  }
}

// POST — flip the lock on or off. Body: `{ locked: boolean }`.
// Always upserts so the row exists after the first toggle.
export async function POST(request: Request) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { locked?: unknown };
    if (typeof body.locked !== 'boolean') {
      return NextResponse.json({ error: '`locked` must be boolean' }, { status: 400 });
    }

    const value = body.locked ? 'true' : 'false';

    const row = await prisma.appSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value, updatedBy: admin.id },
      create: { key: SETTING_KEY, value, updatedBy: admin.id },
    });

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: body.locked ? 'PLAYER_TABLE_LOCKED' : 'PLAYER_TABLE_UNLOCKED',
        details: body.locked
          ? `Locked the player table — bulk imports and seed wipes are blocked.`
          : `Unlocked the player table — bulk imports and seed wipes are allowed.`,
      },
    });

    return NextResponse.json({
      locked: row.value === 'true',
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    });
  } catch (err) {
    console.error('Write player-lock setting error:', err);
    return NextResponse.json({ error: 'Failed to update lock state' }, { status: 500 });
  }
}
