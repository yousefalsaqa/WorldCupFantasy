import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const position = searchParams.get('position');
    
    const players = await prisma.player.findMany({
      where: position ? { position } : undefined,
      include: {
        nation: true, // Include all nation fields
      },
      orderBy: { currentPrice: 'desc' },
    });

    return NextResponse.json(players);
  } catch (error) {
    console.error('Error fetching players:', error);
    return NextResponse.json(
      { error: 'Failed to fetch players' },
      { status: 500 }
    );
  }
}
