import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

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

// PUT /api/admin/players/[id] - Update a player
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { firstName, lastName, displayName, position, nationId, currentPrice, shirtNumber, isAvailable, availabilityNote } = body;

    // Check player exists
    const existingPlayer = await prisma.player.findUnique({
      where: { id },
      include: { nation: true },
    });

    if (!existingPlayer) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (displayName !== undefined) updates.displayName = displayName;
    if (position !== undefined) {
      if (!['GK', 'DEF', 'MID', 'FWD'].includes(position)) {
        return NextResponse.json({ error: 'Invalid position' }, { status: 400 });
      }
      updates.position = position;
    }
    if (nationId !== undefined) {
      const nation = await prisma.nation.findUnique({ where: { id: nationId } });
      if (!nation) {
        return NextResponse.json({ error: 'Nation not found' }, { status: 400 });
      }
      updates.nationId = nationId;
    }
    if (currentPrice !== undefined) {
      const price = parseFloat(currentPrice) || 5.0;
      if (price < 4.0 || price > 15.0) {
        return NextResponse.json({ error: 'Price must be between £4.0m and £15.0m' }, { status: 400 });
      }
      updates.currentPrice = Math.round(price * 2) / 2;
    }
    if (shirtNumber !== undefined) updates.shirtNumber = shirtNumber;
    if (isAvailable !== undefined) updates.isAvailable = isAvailable;
    // availabilityNote can legitimately be set to null (cleared when a
    // player comes back from injury), so we accept any non-undefined value.
    if (availabilityNote !== undefined) {
      updates.availabilityNote =
        typeof availabilityNote === 'string' && availabilityNote.length > 0
          ? availabilityNote
          : null;
    }

    const player = await prisma.player.update({
      where: { id },
      data: updates,
      include: { nation: true },
    });

    // Audit log for price changes
    if (currentPrice !== undefined && currentPrice !== existingPlayer.currentPrice) {
      await prisma.auditLog.create({
        data: {
          userId: admin.id,
          action: 'PLAYER_PRICE_CHANGED',
          details: `${player.displayName}: £${existingPlayer.currentPrice}m → £${player.currentPrice}m`,
        },
      });
    }

    // Audit log for availability changes – the admin will want to see in
    // the audit log when squad members got marked in/out of contention.
    if (isAvailable !== undefined && isAvailable !== existingPlayer.isAvailable) {
      await prisma.auditLog.create({
        data: {
          userId: admin.id,
          action: isAvailable ? 'PLAYER_MARKED_AVAILABLE' : 'PLAYER_MARKED_UNAVAILABLE',
          details: isAvailable
            ? `${player.displayName} marked available`
            : `${player.displayName} marked unavailable${
                player.availabilityNote ? ` – ${player.availabilityNote}` : ''
              }`,
        },
      });
    }

    return NextResponse.json({ player });
  } catch (error) {
    console.error('Update player error:', error);
    return NextResponse.json({ error: 'Failed to update player' }, { status: 500 });
  }
}

// DELETE /api/admin/players/[id] - Delete a player
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;

    const player = await prisma.player.findUnique({
      where: { id },
      include: { nation: true },
    });

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Check if player is in any squad
    const inSquads = await prisma.squadPlayer.count({ where: { playerId: id } });
    if (inSquads > 0) {
      return NextResponse.json({ 
        error: `Cannot delete: player is in ${inSquads} squad(s)` 
      }, { status: 400 });
    }

    await prisma.player.delete({ where: { id } });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'PLAYER_DELETED',
        details: `Deleted player: ${player.displayName} (${player.nation.name})`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete player error:', error);
    return NextResponse.json({ error: 'Failed to delete player' }, { status: 500 });
  }
}
