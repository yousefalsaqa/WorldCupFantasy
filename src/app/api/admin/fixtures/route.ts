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

// GET /api/admin/fixtures
export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const matches = await prisma.match.findMany({
    orderBy: [{ kickoffTime: 'asc' }],
    include: {
      homeNation: true,
      awayNation: true,
      stage: true,
    },
  });

  return NextResponse.json({ matches });
}

// POST /api/admin/fixtures - Create a new fixture
export async function POST(request: Request) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { stageId, homeNationId, awayNationId, kickoffTime } = await request.json();

    if (!stageId || !homeNationId || !awayNationId || !kickoffTime) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 });
    }

    if (homeNationId === awayNationId) {
      return NextResponse.json({ error: 'Team cannot play against itself' }, { status: 400 });
    }

    const match = await prisma.match.create({
      data: {
        stageId,
        homeNationId,
        awayNationId,
        kickoffTime: new Date(kickoffTime),
      },
      include: {
        homeNation: true,
        awayNation: true,
        stage: true,
      },
    });

    // Audit
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'FIXTURE_CREATED',
        details: `Created: ${match.homeNation.name} vs ${match.awayNation.name} (${match.stage.name})`,
      },
    });

    return NextResponse.json({ match });
  } catch (error) {
    console.error('Create fixture error:', error);
    return NextResponse.json({ error: 'Failed to create fixture' }, { status: 500 });
  }
}
