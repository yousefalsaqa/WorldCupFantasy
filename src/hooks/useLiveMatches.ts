// ============================================
// LIVE MATCHES HOOK
// Real-time polling for live match data
// ============================================

import { useState, useEffect, useCallback } from 'react';

interface LiveMatch {
  id: string;
  apiFootballId: number | null;
  kickoffTime: string;
  homeNation: {
    id: string;
    name: string;
    code: string;
  };
  awayNation: {
    id: string;
    name: string;
    code: string;
  };
  stage: {
    id: string;
    stageId: string;
    name: string;
  };
  homeScore: number | null;
  awayScore: number | null;
  isStarted: boolean;
  isFinished: boolean;
  currentMinute: number | null;
  live: {
    status: string;
    statusLong: string;
    elapsed: number | null;
    homeScore: number | null;
    awayScore: number | null;
  } | null;
}

interface LiveMatchesResponse {
  matches: LiveMatch[];
  liveCount: number;
  apiStatus: 'ok' | 'error';
  apiError: string | null;
  lastUpdated: string;
}

interface UseLiveMatchesOptions {
  pollInterval?: number; // milliseconds, default 30 seconds
  enabled?: boolean;
}

export function useLiveMatches(options: UseLiveMatchesOptions = {}) {
  const { pollInterval = 30000, enabled = true } = options;
  
  const [data, setData] = useState<LiveMatchesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMatches = useCallback(async () => {
    try {
      const response = await fetch('/api/live/matches');
      if (!response.ok) {
        throw new Error('Failed to fetch live matches');
      }
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    fetchMatches();

    // Set up polling
    const interval = setInterval(fetchMatches, pollInterval);

    return () => clearInterval(interval);
  }, [enabled, pollInterval, fetchMatches]);

  // Manually refresh
  const refresh = useCallback(() => {
    setLoading(true);
    fetchMatches();
  }, [fetchMatches]);

  return {
    matches: data?.matches || [],
    liveCount: data?.liveCount || 0,
    apiStatus: data?.apiStatus,
    lastUpdated: data?.lastUpdated,
    loading,
    error,
    refresh,
  };
}

// ============================================
// MATCH STATUS HELPERS
// ============================================

export function getMatchStatusText(match: LiveMatch): string {
  if (match.live) {
    switch (match.live.status) {
      case '1H':
        return `${match.live.elapsed}'`;
      case '2H':
        return `${match.live.elapsed}'`;
      case 'HT':
        return 'HT';
      case 'ET':
        return `ET ${match.live.elapsed}'`;
      case 'P':
        return 'Penalties';
      case 'FT':
      case 'AET':
      case 'PEN':
        return 'FT';
      default:
        return match.live.statusLong;
    }
  }

  if (match.isFinished) return 'FT';
  if (match.isStarted) return 'Live';
  
  // Show kickoff time
  const kickoff = new Date(match.kickoffTime);
  return kickoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function isMatchLive(match: LiveMatch): boolean {
  return match.live?.status 
    ? ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'].includes(match.live.status)
    : match.isStarted && !match.isFinished;
}

export function getMatchScore(match: LiveMatch): { home: number; away: number } | null {
  if (match.live) {
    return {
      home: match.live.homeScore ?? 0,
      away: match.live.awayScore ?? 0,
    };
  }
  
  if (match.homeScore !== null && match.awayScore !== null) {
    return {
      home: match.homeScore,
      away: match.awayScore,
    };
  }
  
  return null;
}
