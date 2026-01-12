import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { syncService } from '@/lib/sync-service';
import { apiFootball } from '@/lib/api-football';
import { logAudit } from '@/lib/audit';

// Manual sync trigger (admin only)
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  try {
    const session = await requireAdmin();
    const { action } = await request.json();

    const remaining = apiFootball.getRemainingRequests();
    console.log(`[Sync API] Action: ${action}, Remaining requests: ${remaining}`);

    let result: Record<string, unknown> = {};

    switch (action) {
      case 'teams':
        // Sync all La Liga teams (1 request)
        result = await syncService.syncTeams();
        break;

      case 'fixtures':
        // Sync current round fixtures (1 request)
        const round = await apiFootball.getCurrentRound();
        result = await syncService.syncFixtures(round);
        break;

      case 'live':
        // Smart sync - check live matches
        result = await syncService.smartSync();
        break;

      case 'full':
        // Full sync - teams + fixtures (2+ requests)
        const teamsResult = await syncService.syncTeams();
        const currentRound = await apiFootball.getCurrentRound();
        const fixturesResult = await syncService.syncFixtures(currentRound);
        result = {
          teams: teamsResult,
          fixtures: fixturesResult,
        };
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: teams, fixtures, live, or full' },
          { status: 400 }
        );
    }

    await logAudit('ADMIN_ACTION', {
      action: 'API_SYNC',
      syncType: action,
      result,
      remainingRequests: apiFootball.getRemainingRequests(),
    }, session.userId, ip);

    return NextResponse.json({
      success: true,
      action,
      result,
      remainingRequests: apiFootball.getRemainingRequests(),
    });

  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }
      if (error.message.includes('API limit')) {
        return NextResponse.json({ error: error.message }, { status: 429 });
      }
      if (error.message.includes('API_FOOTBALL_KEY')) {
        return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
      }
    }

    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Sync failed' },
      { status: 500 }
    );
  }
}

// Get sync status
export async function GET() {
  try {
    await requireAdmin();

    return NextResponse.json({
      remainingRequests: apiFootball.getRemainingRequests(),
      maxRequests: 100,
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}


