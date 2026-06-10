import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// This route is dynamic because it reads cookies for authentication
export const dynamic = 'force-dynamic';

// Verify admin middleware
async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });
    return user?.isAdmin ? user : null;
  } catch {
    return null;
  }
}

// GET /api/admin/players - Get all players
export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const players = await prisma.player.findMany({
    orderBy: [{ nation: { name: 'asc' } }, { position: 'asc' }, { displayName: 'asc' }],
    include: {
      nation: true,
    },
  });

  return NextResponse.json({ players });
}

// POST /api/admin/players - Create a player
export async function POST(request: Request) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { firstName, lastName, displayName, position, nationId, currentPrice, shirtNumber } = body;

    // Validation
    if (!firstName || !lastName || !displayName || !position || !nationId) {
      return NextResponse.json({ 
        error: 'First name, last name, display name, position, and nation are required' 
      }, { status: 400 });
    }

    if (!['GK', 'DEF', 'MID', 'FWD'].includes(position)) {
      return NextResponse.json({ error: 'Invalid position' }, { status: 400 });
    }

    const price = parseFloat(currentPrice) || 5.0;
    if (price < 4.0 || price > 15.0) {
      return NextResponse.json({ error: 'Price must be between £4.0m and £15.0m' }, { status: 400 });
    }

    // Check nation exists
    const nation = await prisma.nation.findUnique({ where: { id: nationId } });
    if (!nation) {
      return NextResponse.json({ error: 'Nation not found' }, { status: 400 });
    }

    const player = await prisma.player.create({
      data: {
        firstName,
        lastName,
        displayName,
        position,
        nationId,
        currentPrice: Math.round(price * 2) / 2, // Round to 0.5
        shirtNumber: shirtNumber || null,
      },
      include: { nation: true },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'PLAYER_CREATED',
        details: `Created player: ${displayName} (${nation.name}) - £${player.currentPrice}m`,
      },
    });

    return NextResponse.json({ player });
  } catch (error) {
    console.error('Create player error:', error);
    return NextResponse.json({ error: 'Failed to create player' }, { status: 500 });
  }
}
