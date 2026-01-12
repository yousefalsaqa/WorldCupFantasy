import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

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

// GET /api/admin/nations - Get all nations
export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const nations = await prisma.nation.findMany({
    orderBy: [{ group: 'asc' }, { name: 'asc' }],
    include: {
      _count: {
        select: { players: true },
      },
    },
  });

  return NextResponse.json({ nations });
}

// POST /api/admin/nations - Create a nation
export async function POST(request: Request) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, code, group } = body;

    if (!name || !code) {
      return NextResponse.json({ error: 'Name and code are required' }, { status: 400 });
    }

    const nation = await prisma.nation.create({
      data: {
        name,
        code: code.toUpperCase(),
        group: group || null,
      },
    });

    return NextResponse.json({ nation });
  } catch (error: unknown) {
    console.error('Create nation error:', error);
    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'Nation already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create nation' }, { status: 500 });
  }
}
