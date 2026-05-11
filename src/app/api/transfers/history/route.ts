import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// Dynamic because we read auth cookies; not a candidate for static generation.
export const dynamic = 'force-dynamic';

/**
 * GET /api/transfers/history
 *
 * Returns a unified, time-ordered activity feed for the current user:
 *   - every Transfer row (player out → player in, price delta, free vs paid)
 *   - every chip activation logged in AuditLog (CHIP_ACTIVATED action)
 *
 * Why a unified feed: the new History page on the dashboard replaces the
 * old /transfers tab and we want a single chronological view rather than
 * two side-by-side tables. The shape is intentionally flat so the client
 * can render one virtual list.
 *
 * Performance: caps the result at the most recent 100 entries — that's
 * plenty for a season's worth of activity and bounds the response size.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ entries: [] }, { status: 401 });
    }
    const session = await verifyToken(token);
    if (!session) {
      return NextResponse.json({ entries: [] }, { status: 401 });
    }

    const team = await prisma.team.findUnique({
      where: { userId: session.userId },
      select: { id: true },
    });
    if (!team) {
      // No team yet (e.g. user logged in but hasn't built a squad). Empty
      // feed instead of 404 — the page renders an empty state in that case.
      return NextResponse.json({ entries: [] });
    }

    // Fire both queries in parallel. They hit different tables so there's no
    // contention, and we save a round-trip vs sequential awaits.
    const [transfers, chipLogs] = await Promise.all([
      prisma.transfer.findMany({
        where: { teamId: team.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.auditLog.findMany({
        where: { userId: session.userId, action: 'CHIP_ACTIVATED' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    // Resolve player details for every player referenced by a transfer in a
    // single query. We need displayName + nation + position to render the
    // history rows usefully, and N+1 lookups would be a pain on cold paths.
    const playerIds = Array.from(
      new Set(
        transfers.flatMap((t) => [t.playerInId, t.playerOutId]),
      ),
    );
    const players = playerIds.length
      ? await prisma.player.findMany({
          where: { id: { in: playerIds } },
          select: {
            id: true,
            displayName: true,
            position: true,
            nation: { select: { code: true, name: true } },
          },
        })
      : [];
    const playerMap = new Map(players.map((p) => [p.id, p]));

    // Project both sources into a single envelope shape. `kind` discriminates
    // for the client renderer.
    type TransferEntry = {
      kind: 'transfer';
      id: string;
      createdAt: string;
      playerIn: {
        id: string;
        displayName: string;
        position: string;
        nation: { code: string; name: string };
      } | null;
      playerOut: {
        id: string;
        displayName: string;
        position: string;
        nation: { code: string; name: string };
      } | null;
      priceIn: number;
      priceOut: number;
      isFreeTransfer: boolean;
      isWildcard: boolean;
      isMercyTransfer: boolean;
    };
    type ChipEntry = {
      kind: 'chip';
      id: string;
      createdAt: string;
      chipId: string;
      stageName: string | null;
    };
    type Entry = TransferEntry | ChipEntry;

    const transferEntries: TransferEntry[] = transfers.map((t) => ({
      kind: 'transfer',
      id: t.id,
      createdAt: t.createdAt.toISOString(),
      playerIn: playerMap.get(t.playerInId) ?? null,
      playerOut: playerMap.get(t.playerOutId) ?? null,
      priceIn: t.priceIn,
      priceOut: t.priceOut,
      isFreeTransfer: t.isFreeTransfer,
      isWildcard: t.isWildcard,
      isMercyTransfer: t.isMercyTransfer,
    }));

    const chipEntries: ChipEntry[] = chipLogs.map((log) => {
      // The auditLog `details` field is a JSON string we wrote when the
      // chip was activated. Decode defensively — old rows may not match.
      let chipId = 'UNKNOWN';
      let stageName: string | null = null;
      try {
        const parsed = JSON.parse(log.details);
        chipId = parsed.chipId ?? chipId;
        stageName = parsed.stageName ?? null;
      } catch {
        // Fall back to raw string if the row predates JSON-encoded details.
        chipId = log.details || chipId;
      }
      return {
        kind: 'chip',
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        chipId,
        stageName,
      };
    });

    const entries: Entry[] = [...transferEntries, ...chipEntries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('GET /api/transfers/history failed:', error);
    return NextResponse.json(
      { entries: [], error: 'Failed to load transfer history' },
      { status: 500 },
    );
  }
}
