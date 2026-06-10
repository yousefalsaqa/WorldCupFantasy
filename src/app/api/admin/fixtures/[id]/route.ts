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

// DELETE /api/admin/fixtures/[id]
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
    
    const match = await prisma.match.findUnique({
      where: { id },
      include: { homeNation: true, awayNation: true, stage: true },
    });

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    await prisma.match.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'FIXTURE_DELETED',
        details: `Deleted: ${match.homeNation.name} vs ${match.awayNation.name}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete fixture error:', error);
    return NextResponse.json({ error: 'Failed to delete fixture' }, { status: 500 });
  }
}

// PUT /api/admin/fixtures/[id] - Update fixture (kickoff time, etc)
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

    const match = await prisma.match.update({
      where: { id },
      data: {
        ...(body.kickoffTime && { kickoffTime: new Date(body.kickoffTime) }),
        ...(body.stageId && { stageId: body.stageId }),
      },
      include: { homeNation: true, awayNation: true, stage: true },
    });

    return NextResponse.json({ match });
  } catch (error) {
    console.error('Update fixture error:', error);
    return NextResponse.json({ error: 'Failed to update fixture' }, { status: 500 });
  }
}
