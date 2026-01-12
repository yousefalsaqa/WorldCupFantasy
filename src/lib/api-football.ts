// ============================================
// API-FOOTBALL INTEGRATION
// Free tier: 100 requests/day
// Smart polling for near-live updates
// ============================================

const API_BASE = 'https://v3.football.api-sports.io';
const LA_LIGA_ID = 140; // La Liga league ID
const CURRENT_SEASON = 2025; // 2025/26 season

interface ApiResponse<T> {
  response: T;
  errors: Record<string, string>;
  results: number;
}

interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    status: {
      short: string; // "NS", "1H", "HT", "2H", "FT", "PST", etc.
      elapsed: number | null;
    };
  };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
  };
}

interface ApiPlayer {
  player: {
    id: number;
    name: string;
    firstname: string;
    lastname: string;
    photo: string;
  };
  statistics: Array<{
    team: { id: number; name: string };
    games: {
      appearences: number;
      minutes: number;
      position: string;
      rating: string | null;
    };
    goals: { total: number; assists: number };
    cards: { yellow: number; red: number };
    penalty: { scored: number; missed: number; saved: number };
  }>;
}

interface ApiLineup {
  team: { id: number; name: string };
  formation: string;
  startXI: Array<{
    player: { id: number; name: string; number: number; pos: string };
  }>;
  substitutes: Array<{
    player: { id: number; name: string; number: number; pos: string };
  }>;
}

interface ApiFixtureEvent {
  time: { elapsed: number; extra: number | null };
  team: { id: number; name: string };
  player: { id: number; name: string };
  assist: { id: number | null; name: string | null };
  type: string; // "Goal", "Card", "subst"
  detail: string; // "Normal Goal", "Yellow Card", "Red Card", "Penalty", etc.
}

interface ApiFixtureStats {
  team: { id: number; name: string };
  statistics: Array<{
    type: string;
    value: number | string | null;
  }>;
}

interface ApiPlayerStats {
  player: {
    id: number;
    name: string;
  };
  statistics: Array<{
    games: { minutes: number; position: string; rating: string | null };
    goals: { total: number | null; assists: number | null };
    passes: { total: number | null; accuracy: string | null };
    tackles: { total: number | null; interceptions: number | null };
    duels: { won: number | null };
    cards: { yellow: number; red: number };
    penalty: { scored: number | null; missed: number | null; saved: number | null };
  }>;
}

class ApiFootballClient {
  private apiKey: string;
  private requestsToday: number = 0;
  private lastRequestDate: string = '';

  constructor() {
    this.apiKey = process.env.API_FOOTBALL_KEY || '';
  }

  private async fetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<ApiResponse<T>> {
    if (!this.apiKey) {
      throw new Error('API_FOOTBALL_KEY not configured');
    }

    // Track daily requests
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastRequestDate) {
      this.requestsToday = 0;
      this.lastRequestDate = today;
    }

    if (this.requestsToday >= 95) { // Leave 5 buffer
      throw new Error('Daily API limit nearly reached (95/100)');
    }

    const url = new URL(`${API_BASE}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString(), {
      headers: {
        'x-apisports-key': this.apiKey,
      },
    });

    this.requestsToday++;
    console.log(`[API-Football] Request ${this.requestsToday}/100: ${endpoint}`);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return response.json();
  }

  // Get remaining requests for today
  getRemainingRequests(): number {
    return Math.max(0, 100 - this.requestsToday);
  }

  // ============================================
  // FIXTURES
  // ============================================

  async getFixtures(round?: string): Promise<ApiFixture[]> {
    const params: Record<string, string> = {
      league: LA_LIGA_ID.toString(),
      season: CURRENT_SEASON.toString(),
    };
    if (round) params.round = round;

    const data = await this.fetch<ApiFixture[]>('/fixtures', params);
    return data.response;
  }

  async getLiveFixtures(): Promise<ApiFixture[]> {
    const data = await this.fetch<ApiFixture[]>('/fixtures', {
      league: LA_LIGA_ID.toString(),
      live: 'all',
    });
    return data.response;
  }

  async getFixtureById(fixtureId: number): Promise<ApiFixture | null> {
    const data = await this.fetch<ApiFixture[]>('/fixtures', {
      id: fixtureId.toString(),
    });
    return data.response[0] || null;
  }

  // ============================================
  // LINEUPS & EVENTS
  // ============================================

  async getLineups(fixtureId: number): Promise<ApiLineup[]> {
    const data = await this.fetch<ApiLineup[]>('/fixtures/lineups', {
      fixture: fixtureId.toString(),
    });
    return data.response;
  }

  async getFixtureEvents(fixtureId: number): Promise<ApiFixtureEvent[]> {
    const data = await this.fetch<ApiFixtureEvent[]>('/fixtures/events', {
      fixture: fixtureId.toString(),
    });
    return data.response;
  }

  async getFixturePlayerStats(fixtureId: number): Promise<{ team: { id: number }; players: ApiPlayerStats[] }[]> {
    const data = await this.fetch<{ team: { id: number }; players: ApiPlayerStats[] }[]>('/fixtures/players', {
      fixture: fixtureId.toString(),
    });
    return data.response;
  }

  // ============================================
  // TEAMS & PLAYERS
  // ============================================

  async getTeams(): Promise<{ team: { id: number; name: string; code: string; logo: string } }[]> {
    const data = await this.fetch<{ team: { id: number; name: string; code: string; logo: string } }[]>('/teams', {
      league: LA_LIGA_ID.toString(),
      season: CURRENT_SEASON.toString(),
    });
    return data.response;
  }

  async getSquad(teamId: number): Promise<{ team: { id: number; name: string }; players: Array<{ id: number; name: string; age: number; number: number; position: string; photo: string }> }[]> {
    const data = await this.fetch<{ team: { id: number; name: string }; players: Array<{ id: number; name: string; age: number; number: number; position: string; photo: string }> }[]>('/players/squads', {
      team: teamId.toString(),
    });
    return data.response;
  }

  async getPlayerStats(playerId: number): Promise<ApiPlayer[]> {
    const data = await this.fetch<ApiPlayer[]>('/players', {
      id: playerId.toString(),
      league: LA_LIGA_ID.toString(),
      season: CURRENT_SEASON.toString(),
    });
    return data.response;
  }

  // ============================================
  // ROUNDS (GAMEWEEKS)
  // ============================================

  async getRounds(): Promise<string[]> {
    const data = await this.fetch<string[]>('/fixtures/rounds', {
      league: LA_LIGA_ID.toString(),
      season: CURRENT_SEASON.toString(),
    });
    return data.response;
  }

  async getCurrentRound(): Promise<string> {
    const data = await this.fetch<string[]>('/fixtures/rounds', {
      league: LA_LIGA_ID.toString(),
      season: CURRENT_SEASON.toString(),
      current: 'true',
    });
    return data.response[0] || 'Regular Season - 1';
  }
}

// Export singleton instance
export const apiFootball = new ApiFootballClient();

// Export types
export type { 
  ApiFixture, 
  ApiPlayer, 
  ApiLineup, 
  ApiFixtureEvent, 
  ApiPlayerStats,
  ApiFixtureStats 
};


