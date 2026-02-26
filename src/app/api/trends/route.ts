import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get all recent transfers
    const recentTransfers = await prisma.transfer.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { playerInId: true, playerOutId: true },
    });

    if (recentTransfers.length === 0) {
      return NextResponse.json({ transfersIn: [], transfersOut: [], totalTransfers: 0 });
    }

    // Count transfers in
    const inCounts: Record<string, number> = {};
    const outCounts: Record<string, number> = {};

    for (const t of recentTransfers) {
      inCounts[t.playerInId] = (inCounts[t.playerInId] || 0) + 1;
      outCounts[t.playerOutId] = (outCounts[t.playerOutId] || 0) + 1;
    }

    // Top 10 in
    const topInIds = Object.entries(inCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);

    // Top 10 out
    const topOutIds = Object.entries(outCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);

    const allPlayerIds = Array.from(new Set([...topInIds, ...topOutIds]));

    const players = allPlayerIds.length > 0
      ? await prisma.player.findMany({
          where: { id: { in: allPlayerIds } },
          include: {
            nation: { select: { name: true, code: true, kitColor1: true, kitColor2: true } },
          },
        })
      : [];

    const playerMap = new Map(players.map(p => [p.id, p]));

    const transfersIn = topInIds.map(id => {
      const p = playerMap.get(id);
      return p ? {
        playerId: id,
        displayName: p.displayName,
        position: p.position,
        currentPrice: p.currentPrice,
        nation: p.nation,
        count: inCounts[id],
        netTransfers: (inCounts[id] || 0) - (outCounts[id] || 0),
      } : null;
    }).filter(Boolean);

    const transfersOut = topOutIds.map(id => {
      const p = playerMap.get(id);
      return p ? {
        playerId: id,
        displayName: p.displayName,
        position: p.position,
        currentPrice: p.currentPrice,
        nation: p.nation,
        count: outCounts[id],
        netTransfers: (inCounts[id] || 0) - (outCounts[id] || 0),
      } : null;
    }).filter(Boolean);

    return NextResponse.json({
      transfersIn,
      transfersOut,
      totalTransfers: recentTransfers.length,
    });
  } catch (error) {
    console.error('Error fetching trends:', error);
    return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 500 });
  }
}
