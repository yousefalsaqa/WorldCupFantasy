import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const position = searchParams.get('position');

    // Only select fields the squad/transfers UI actually uses. Cuts payload
    // size dramatically (faster parse on iPhone, fewer dropped requests on cellular).
    const players = await prisma.player.findMany({
      where: position ? { position } : undefined,
      select: {
        id: true,
        displayName: true,
        position: true,
        currentPrice: true,
        shirtNumber: true,
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
