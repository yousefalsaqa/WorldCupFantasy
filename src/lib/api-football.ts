// ============================================
// API-FOOTBALL INTEGRATION SERVICE
// World Cup 2026 Live Data Provider
// ============================================

const API_BASE_URL = 'https://v3.football.api-sports.io';
const API_KEY = process.env.API_FOOTBALL_KEY || '1c07d3496f14ec9145fdc1e6ae980630';

// World Cup 2026 constants
export const WORLD_CUP_LEAGUE_ID = 1;
export const WORLD_CUP_SEASON = 2026;

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface APIFootballResponse<T> {
  get: string;
  parameters: Record<string, string>;
  errors: string[] | Record<string, string>;
  results: number;
  paging: { current: number; total: number };
  response: T;
}

export interface APITeam {
  team: {
    id: number;
    name: string;
    code: string;
    country: string;
    logo: string;
    national: boolean;
  };
}

export interface APIFixture {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;
    timestamp: number;
    venue: {
      id: number | null;
      name: string;
      city: string;
    };
    status: {
      long: string;
      short: string;  // NS, 1H, HT, 2H, ET, P, FT, AET, PEN
      elapsed: number | null;
      extra: number | null;
    };
  };
  league: {
    id: number;
    name: string;
    country: string;
    round: string;
    season: number;
  };
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null };
    away: { id: number; name: string; logo: string; winner: boolean | null };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
}

export interface APIEvent {
  time: {
    elapsed: number;
    extra: number | null;
  };
  team: {
    id: number;
    name: string;
    logo: string;
  };
  player: {
    id: number;
    name: string;
  };
  assist: {
    id: number | null;
    name: string | null;
  };
  type: 'Goal' | 'Card' | 'subst' | 'Var';
  detail: string;  // Normal Goal, Penalty, Own Goal, Yellow Card, Red Card, etc.
  comments: string | null;
}

export interface APIPlayerStats {
  player: {
    id: number;
    name: string;
    photo: string;
  };
  statistics: Array<{
    games: {
      minutes: number;
      number: number;
      position: string;  // G, D, M, F
      rating: string | null;
      captain: boolean;
      substitute: boolean;
    };
    goals: {
      total: number | null;
      conceded: number | null;
      assists: number | null;
      saves: number | null;
    };
    cards: {
      yellow: number;
      red: number;
    };
    penalty: {
      won: number | null;
      committed: number | null;
      scored: number;
      missed: number;
      saved: number | null;
    };
    passes: {
      total: number;
      key: number | null;
      accuracy: string | null;
    };
  }>;
}

export interface APITeamPlayersResponse {
  team: {
    id: number;
    name: string;
    logo: string;
    update: string;
  };
  players: APIPlayerStats[];
}

// Match statuses
export const MATCH_STATUS = {
  NOT_STARTED: ['NS', 'TBD'],
  LIVE: ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'],
  FINISHED: ['FT', 'AET', 'PEN'],
  POSTPONED: ['PST', 'SUSP', 'INT', 'ABD', 'AWD', 'WO'],
} as const;

// ============================================
// API CLIENT
// ============================================

class APIFootballClient {
  private rateLimitRemaining = 100;
  private lastRequestTime = 0;
  private minRequestInterval = 1000; // 1 second between requests

  private async makeRequest<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<APIFootballResponse<T>> {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();

    const url = new URL(`${API_BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });

    console.log(`[API-Football] Fetching: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      headers: {
        'x-apisports-key': API_KEY,
      },
      next: { revalidate: 0 }, // No caching for live data
    });

    if (!response.ok) {
      throw new Error(`API-Football request failed: ${response.status} ${response.statusText}`);
    }

    // Track rate limits
    const remaining = response.headers.get('x-ratelimit-requests-remaining');
    if (remaining) {
      this.rateLimitRemaining = parseInt(remaining, 10);
      console.log(`[API-Football] Rate limit remaining: ${this.rateLimitRemaining}`);
    }

    const data = await response.json();
    
    // Check for API errors
    if (data.errors && Object.keys(data.errors).length > 0) {
      console.error('[API-Football] API Error:', data.errors);
      throw new Error(`API-Football error: ${JSON.stringify(data.errors)}`);
    }

    return data;
  }

  // ============================================
  // TEAMS (Nations)
  // ============================================

  async getWorldCupTeams(): Promise<APITeam[]> {
    const response = await this.makeRequest<APITeam[]>('/teams', {
      league: WORLD_CUP_LEAGUE_ID,
      season: WORLD_CUP_SEASON,
    });
    return response.response;
  }

  // ============================================
  // FIXTURES
  // ============================================

  async getWorldCupFixtures(): Promise<APIFixture[]> {
    const response = await this.makeRequest<APIFixture[]>('/fixtures', {
      league: WORLD_CUP_LEAGUE_ID,
      season: WORLD_CUP_SEASON,
    });
    return response.response;
  }

  async getLiveFixtures(): Promise<APIFixture[]> {
    // Get all live World Cup matches
    const response = await this.makeRequest<APIFixture[]>('/fixtures', {
      league: WORLD_CUP_LEAGUE_ID,
      season: WORLD_CUP_SEASON,
      live: 'all',
    });
    return response.response;
  }

  async getFixtureById(fixtureId: number): Promise<APIFixture | null> {
    const response = await this.makeRequest<APIFixture[]>('/fixtures', {
      id: fixtureId,
    });
    return response.response[0] || null;
  }

  async getTodaysFixtures(): Promise<APIFixture[]> {
    const today = new Date().toISOString().split('T')[0];
    const response = await this.makeRequest<APIFixture[]>('/fixtures', {
      league: WORLD_CUP_LEAGUE_ID,
      season: WORLD_CUP_SEASON,
      date: today,
    });
    return response.response;
  }

  // ============================================
  // EVENTS (Goals, Cards, Subs)
  // ============================================

  async getFixtureEvents(fixtureId: number): Promise<APIEvent[]> {
    const response = await this.makeRequest<APIEvent[]>('/fixtures/events', {
      fixture: fixtureId,
    });
    return response.response;
  }

  // ============================================
  // PLAYER STATISTICS
  // ============================================

  async getFixturePlayerStats(fixtureId: number): Promise<APITeamPlayersResponse[]> {
    const response = await this.makeRequest<APITeamPlayersResponse[]>('/fixtures/players', {
      fixture: fixtureId,
    });
    return response.response;
  }

  // ============================================
  // PLAYERS (for mapping)
  // ============================================

  async getTeamSquad(teamId: number): Promise<{
    team: { id: number; name: string };
    players: Array<{
      id: number;
      name: string;
      age: number;
      number: number | null;
      position: string;
      photo: string;
    }>;
  }[]> {
    const response = await this.makeRequest<any[]>('/players/squads', {
      team: teamId,
    });
    return response.response;
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  getRateLimitRemaining(): number {
    return this.rateLimitRemaining;
  }

  isMatchLive(status: string): boolean {
    return MATCH_STATUS.LIVE.includes(status as any);
  }

  isMatchFinished(status: string): boolean {
    return MATCH_STATUS.FINISHED.includes(status as any);
  }

  isMatchNotStarted(status: string): boolean {
    return MATCH_STATUS.NOT_STARTED.includes(status as any);
  }
}

// Export singleton instance
export const apiFootball = new APIFootballClient();

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert API-Football position code to our position code
 */
export function convertPosition(apiPosition: string): 'GK' | 'DEF' | 'MID' | 'FWD' {
  switch (apiPosition) {
    case 'G':
      return 'GK';
    case 'D':
      return 'DEF';
    case 'M':
      return 'MID';
    case 'F':
    case 'A':
      return 'FWD';
    default:
      return 'MID'; // Default fallback
  }
}

/**
 * Extract goal type from event detail
 */
export function getGoalType(detail: string): 'normal' | 'penalty' | 'own_goal' {
  if (detail === 'Own Goal') return 'own_goal';
  if (detail === 'Penalty') return 'penalty';
  return 'normal';
}

/**
 * Check if event is a penalty shootout event (don't count for fantasy)
 */
export function isPenaltyShootout(event: APIEvent): boolean {
  return event.comments === 'Penalty Shootout';
}

/**
 * Check if this is a regular match goal (not shootout)
 */
export function isMatchGoal(event: APIEvent): boolean {
  return event.type === 'Goal' && !isPenaltyShootout(event) && event.detail !== 'Missed Penalty';
}

/**
 * Check if this is a penalty miss during regular play
 */
export function isPenaltyMiss(event: APIEvent): boolean {
  return event.type === 'Goal' && event.detail === 'Missed Penalty' && !isPenaltyShootout(event);
}

/**
 * Check if this is a penalty save
 */
export function isPenaltySave(event: APIEvent): boolean {
  // Penalty saves aren't directly in events, we get them from player stats
  return false;
}

/**
 * Get card type from event
 */
export function getCardType(detail: string): 'yellow' | 'red' | 'second_yellow' | null {
  if (detail === 'Yellow Card') return 'yellow';
  if (detail === 'Red Card') return 'red';
  if (detail === 'Second Yellow card') return 'second_yellow';
  return null;
}
