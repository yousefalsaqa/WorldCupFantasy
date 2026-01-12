import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

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

// GET /api/admin/stages
export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stages = await prisma.stage.findMany({
    orderBy: { order: 'asc' },
  });

  return NextResponse.json({ stages });
}

// PUT /api/admin/stages - Update stage deadline
export async function PUT(request: Request) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { stageId, deadlineTime, isActive, isComplete } = await request.json();

    const stage = await prisma.stage.update({
      where: { id: stageId },
      data: {
        ...(deadlineTime && { deadlineTime: new Date(deadlineTime) }),
        ...(typeof isActive === 'boolean' && { isActive }),
        ...(typeof isComplete === 'boolean' && { isComplete }),
      },
    });

    return NextResponse.json({ stage });
  } catch (error) {
    console.error('Update stage error:', error);
    return NextResponse.json({ error: 'Failed to update stage' }, { status: 500 });
  }
}
