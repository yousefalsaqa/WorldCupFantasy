import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/db';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const API_FOOTBALL_HOST = 'v3.football.api-sports.io';

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

// GET /api/admin/sync/test - Test API-Football connection
export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!API_FOOTBALL_KEY) {
    return NextResponse.json({
      connected: false,
      error: 'API_FOOTBALL_KEY not configured in .env',
    });
  }

  try {
    const response = await fetch(`https://${API_FOOTBALL_HOST}/status`, {
      headers: {
        'x-apisports-key': API_FOOTBALL_KEY,
      },
    });

    const data = await response.json();

    if (data.response?.account) {
      return NextResponse.json({
        connected: true,
        account: data.response.account.firstname,
        requestsRemaining: data.response.requests?.current 
          ? `${data.response.requests.limit_day - data.response.requests.current}/${data.response.requests.limit_day}`
          : 'Unknown',
      });
    }

    return NextResponse.json({
      connected: false,
      error: data.errors?.token || 'Invalid response from API',
    });
  } catch (error) {
    console.error('API test error:', error);
    return NextResponse.json({
      connected: false,
      error: 'Failed to connect to API-Football',
    });
  }
}
