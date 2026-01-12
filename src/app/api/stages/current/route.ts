import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/stages/current - Get current active stage
export async function GET() {
  try {
    const stage = await prisma.stage.findFirst({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });

    if (!stage) {
      // Return first stage if none active
      const firstStage = await prisma.stage.findFirst({
        orderBy: { order: 'asc' },
      });
      return NextResponse.json({ stage: firstStage });
    }

    return NextResponse.json({ stage });
  } catch (error) {
    console.error('Get current stage error:', error);
    return NextResponse.json({ error: 'Failed to get stage' }, { status: 500 });
  }
}
