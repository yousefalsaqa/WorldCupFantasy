import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const position = searchParams.get('position');
    // Optional row cap — the public landing page uses ?limit=6 to fetch just
    // the marquee names instead of all ~1,250 rows.
    const limitParam = parseInt(searchParams.get('limit') || '', 10);
    const take = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : undefined;

    // Only select fields the squad/transfers UI actually uses. Cuts payload
    // size dramatically (faster parse on iPhone, fewer dropped requests on cellular).
    const players = await prisma.player.findMany({
      where: position ? { position } : undefined,
      take,
      select: {
        id: true,
        displayName: true,
        position: true,
        currentPrice: true,
        shirtNumber: true,
        photoUrl: true,
        nation: {
          select: {
            id: true,
            name: true,
            code: true,
            kitColor1: true,
            kitColor2: true,
          },
        },
      },
      orderBy: { currentPrice: 'desc' },
    });

    return NextResponse.json(players, {
      headers: {
        // Short browser cache + SWR so repeat squad-page visits feel instant
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('Error fetching players:', error);
    return NextResponse.json(
      { error: 'Failed to fetch players' },
      { status: 500 }
    );
  }
}
