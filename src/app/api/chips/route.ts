import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

type ChipType = 'WILDCARD_1' | 'WILDCARD_2' | 'TRIPLE_CAPTAIN' | 'BENCH_BOOST';

const CHIP_META: Record<ChipType, { name: string; description: string }> = {
  WILDCARD_1: { name: 'Wildcard', description: 'Unlimited transfers for this stage' },
  WILDCARD_2: { name: 'Wildcard 2', description: 'Second wildcard, available after Round of 32' },
  TRIPLE_CAPTAIN: { name: 'Triple Captain', description: 'Captain scores 3x points this stage' },
  BENCH_BOOST: { name: 'Bench Boost', description: 'All bench players score points this stage' },
};

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;
  const decoded = await verifyToken(token);
  if (!decoded) return null;
  return { userId: decoded.userId };
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 });
    }

    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
      select: {
        wildcard1Used: true,
        wildcard2Used: true,
        tripleCaptainUsed: true,
        benchBoostUsed: true,
      },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const activeStage = await prisma.stage.findFirst({
      where: { isActive: true },
      select: { id: true, stageId: true, name: true },
    });

    let activeChip: string | null = null;
    if (activeStage) {
      const teamStage = await prisma.teamStage.findUnique({
        where: { teamId_stageId: { teamId: (await prisma.team.findUnique({ where: { userId: session.userId } }))!.id, stageId: activeStage.id } },
        select: { chipUsed: true },
      });
      activeChip = teamStage?.chipUsed ?? null;
    }

    const knockoutStages = ['R32', 'R16', 'QF', 'SF', '3RD', 'F'];
    const isKnockoutUnlocked = activeStage ? knockoutStages.includes(activeStage.stageId) : false;

    const chips = [
      {
        id: 'WILDCARD_1' as ChipType,
        ...CHIP_META.WILDCARD_1,
        used: team.wildcard1Used,
        available: !team.wildcard1Used && activeChip === null,
        active: activeChip === 'WILDCARD_1',
      },
      {
        id: 'WILDCARD_2' as ChipType,
        ...CHIP_META.WILDCARD_2,
        used: team.wildcard2Used,
        available: !team.wildcard2Used && isKnockoutUnlocked && activeChip === null,
        active: activeChip === 'WILDCARD_2',
      },
      {
        id: 'TRIPLE_CAPTAIN' as ChipType,
        ...CHIP_META.TRIPLE_CAPTAIN,
        used: team.tripleCaptainUsed,
        available: !team.tripleCaptainUsed && activeChip === null,
        active: activeChip === 'TRIPLE_CAPTAIN',
      },
      {
        id: 'BENCH_BOOST' as ChipType,
        ...CHIP_META.BENCH_BOOST,
        used: team.benchBoostUsed,
        available: !team.benchBoostUsed && activeChip === null,
        active: activeChip === 'BENCH_BOOST',
      },
    ];

    return NextResponse.json({ chips, activeChip, activeStage });
  } catch (error) {
    console.error('Error fetching chips:', error);
    return NextResponse.json({ error: 'Failed to fetch chips' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 });
    }

    const { chipId } = await request.json() as { chipId: ChipType };

    if (!chipId || !CHIP_META[chipId]) {
      return NextResponse.json({ error: 'Invalid chip' }, { status: 400 });
    }

    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Check chip hasn't been used
    const usedMap: Record<ChipType, boolean> = {
      WILDCARD_1: team.wildcard1Used,
      WILDCARD_2: team.wildcard2Used,
      TRIPLE_CAPTAIN: team.tripleCaptainUsed,
      BENCH_BOOST: team.benchBoostUsed,
    };

    if (usedMap[chipId]) {
      return NextResponse.json({ error: 'This chip has already been used' }, { status: 400 });
    }

    // Get active stage
    const activeStage = await prisma.stage.findFirst({
      where: { isActive: true },
    });

    if (!activeStage) {
      return NextResponse.json({ error: 'No active stage' }, { status: 400 });
    }

    // Wildcard 2 only available in knockout stages
    if (chipId === 'WILDCARD_2') {
      const knockoutStages = ['R32', 'R16', 'QF', 'SF', '3RD', 'F'];
      if (!knockoutStages.includes(activeStage.stageId)) {
        return NextResponse.json({ error: 'Wildcard 2 is only available in knockout stages' }, { status: 400 });
      }
    }

    // Check no chip already active for this stage
    const existingTeamStage = await prisma.teamStage.findUnique({
      where: { teamId_stageId: { teamId: team.id, stageId: activeStage.id } },
    });

    if (existingTeamStage?.chipUsed) {
      return NextResponse.json({ error: 'A chip is already active for this stage' }, { status: 400 });
    }

    // Activate the chip in a transaction
    await prisma.$transaction(async (tx) => {
      // Mark chip as used on team
      const updateField: Record<string, boolean> = {};
      if (chipId === 'WILDCARD_1') updateField.wildcard1Used = true;
      if (chipId === 'WILDCARD_2') updateField.wildcard2Used = true;
      if (chipId === 'TRIPLE_CAPTAIN') updateField.tripleCaptainUsed = true;
      if (chipId === 'BENCH_BOOST') updateField.benchBoostUsed = true;

      await tx.team.update({
        where: { id: team.id },
        data: updateField,
      });

      // Upsert TeamStage with chipUsed
      await tx.teamStage.upsert({
        where: { teamId_stageId: { teamId: team.id, stageId: activeStage.id } },
        create: {
          teamId: team.id,
          stageId: activeStage.id,
          chipUsed: chipId,
        },
        update: {
          chipUsed: chipId,
        },
      });

      // Log audit
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'CHIP_ACTIVATED',
          details: JSON.stringify({ chipId, stageName: activeStage.name }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: `${CHIP_META[chipId].name} activated!`,
      chipId,
    });
  } catch (error) {
    console.error('Error activating chip:', error);
    return NextResponse.json({ error: 'Failed to activate chip' }, { status: 500 });
  }
}
