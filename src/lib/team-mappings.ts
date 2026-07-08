// ============================================
// API-FOOTBALL TEAM ID MAPPINGS
// Maps our nation codes to API-Football team IDs
// ============================================

/**
 * Mapping of 3-letter nation codes to API-Football team IDs
 * These IDs are used to fetch live data from the API
 * 
 * Source: API-Football /teams endpoint for World Cup
 */
export const NATION_TO_API_ID: Record<string, number> = {
  // Group A
  'MEX': 16,    // Mexico (host)
  'USA': 2384,  // United States (host)
  'CAN': 5529,  // Canada (host)
  
  // European Teams
  'ENG': 10,    // England
  'FRA': 2,     // France
  'ESP': 9,     // Spain
  'GER': 25,    // Germany
  'NED': 1118,  // Netherlands
  'POR': 27,    // Portugal
  'BEL': 1,     // Belgium
  'CRO': 3,     // Croatia
  'SRB': 14,    // Serbia
  'SUI': 15,    // Switzerland
  'DEN': 21,    // Denmark
  'POL': 24,    // Poland
  'AUT': 775,   // Austria
  'SCO': 1108,  // Scotland
  'UKR': 772,   // Ukraine
  'WAL': 767,   // Wales
  'ITA': 768,   // Italy
  'SWE': 22,    // Sweden
  'NOR': 23,    // Norway
  'CZE': 770,   // Czech Republic
  'HUN': 769,   // Hungary
  'SVN': 773,   // Slovenia
  'GRE': 19,    // Greece
  'ROU': 774,   // Romania
  
  // South American Teams
  'ARG': 26,    // Argentina
  'BRA': 6,     // Brazil
  'URU': 7,     // Uruguay
  'COL': 2385,  // Colombia
  'ECU': 2382,  // Ecuador
  'CHI': 2379,  // Chile
  'PER': 2381,  // Peru
  'PAR': 2380,  // Paraguay
  'VEN': 2386,  // Venezuela
  'BOL': 2378,  // Bolivia
  
  // African Teams
  'MAR': 31,    // Morocco
  'SEN': 13,    // Senegal
  'NGA': 1118,  // Nigeria - need to verify
  'CMR': 1530,  // Cameroon
  'GHA': 1504,  // Ghana
  'ALG': 29,    // Algeria
  'EGY': 30,    // Egypt
  'TUN': 28,    // Tunisia
  'CIV': 1531,  // Ivory Coast
  'MLI': 1532,  // Mali
  'RSA': 1533,  // South Africa
  
  // Asian Teams
  'JPN': 12,    // Japan
  'KOR': 17,    // South Korea
  'AUS': 20,    // Australia
  'IRN': 32,    // Iran
  'KSA': 33,    // Saudi Arabia
  'QAT': 1569,  // Qatar
  'IRQ': 1571,  // Iraq
  'UAE': 1570,  // United Arab Emirates
  'UZB': 2383,  // Uzbekistan
  'CHN': 2387,  // China
  'IND': 1572,  // India
  
  // CONCACAF Teams
  'CRC': 2389,  // Costa Rica
  'JAM': 2388,  // Jamaica
  'PAN': 2390,  // Panama
  'HON': 2391,  // Honduras
  'SLV': 2392,  // El Salvador
  
  // Oceania Teams
  'NZL': 2393,  // New Zealand
};

/**
 * Reverse mapping: API-Football ID to our nation code
 */
export const API_ID_TO_NATION: Record<number, string> = Object.entries(NATION_TO_API_ID).reduce(
  (acc, [code, id]) => {
    acc[id] = code;
    return acc;
  },
  {} as Record<number, string>
);

/**
 * Get API-Football team ID from nation code
 */
export function getApiTeamId(nationCode: string): number | null {
  return NATION_TO_API_ID[nationCode] || null;
}

/**
 * Get nation code from API-Football team ID
 */
export function getNationCode(apiTeamId: number): string | null {
  return API_ID_TO_NATION[apiTeamId] || null;
}

// ============================================
// POSITION MAPPINGS
// ============================================

/**
 * API-Football position codes to our position codes
 */
export const API_POSITION_MAP: Record<string, 'GK' | 'DEF' | 'MID' | 'FWD'> = {
  'G': 'GK',
  'D': 'DEF',
  'M': 'MID',
  'F': 'FWD',
  'A': 'FWD',
  'Goalkeeper': 'GK',
  'Defender': 'DEF',
  'Midfielder': 'MID',
  'Attacker': 'FWD',
  'Forward': 'FWD',
};

/**
 * Convert API-Football position to our position code
 */
export function mapPosition(apiPosition: string): 'GK' | 'DEF' | 'MID' | 'FWD' {
  return API_POSITION_MAP[apiPosition] || 'MID';
}

// ============================================
// MATCH STATUS HELPERS
// ============================================

export const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'];
export const FINISHED_STATUSES = ['FT', 'AET', 'PEN'];
export const NOT_STARTED_STATUSES = ['NS', 'TBD'];

export function isLiveStatus(status: string): boolean {
  return LIVE_STATUSES.includes(status);
}

export function isFinishedStatus(status: string): boolean {
  return FINISHED_STATUSES.includes(status);
}

export function isNotStartedStatus(status: string): boolean {
  return NOT_STARTED_STATUSES.includes(status);
}

// ============================================
// STAGE MAPPINGS
// ============================================

/**
 * Map API-Football round names to our stage IDs
 */
export const ROUND_TO_STAGE: Record<string, string> = {
  'Group A - 1': 'GR1',
  'Group B - 1': 'GR1',
  'Group C - 1': 'GR1',
  'Group D - 1': 'GR1',
  'Group E - 1': 'GR1',
  'Group F - 1': 'GR1',
  'Group G - 1': 'GR1',
  'Group H - 1': 'GR1',
  'Group I - 1': 'GR1',
  'Group J - 1': 'GR1',
  'Group K - 1': 'GR1',
  'Group L - 1': 'GR1',
  'Group A - 2': 'GR2',
  'Group B - 2': 'GR2',
  'Group C - 2': 'GR2',
  'Group D - 2': 'GR2',
  'Group E - 2': 'GR2',
  'Group F - 2': 'GR2',
  'Group G - 2': 'GR2',
  'Group H - 2': 'GR2',
  'Group I - 2': 'GR2',
  'Group J - 2': 'GR2',
  'Group K - 2': 'GR2',
  'Group L - 2': 'GR2',
  'Group A - 3': 'GR3',
  'Group B - 3': 'GR3',
  'Group C - 3': 'GR3',
  'Group D - 3': 'GR3',
  'Group E - 3': 'GR3',
  'Group F - 3': 'GR3',
  'Group G - 3': 'GR3',
  'Group H - 3': 'GR3',
  'Group I - 3': 'GR3',
  'Group J - 3': 'GR3',
  'Group K - 3': 'GR3',
  'Group L - 3': 'GR3',
  'Round of 32': 'R32',
  'Round of 16': 'R16',
  'Quarter-finals': 'QF',
  'Semi-finals': 'SF',
  '3rd Place Final': 'F', // shares stage "F" with the Final — see the 3RD/F merge
  'Final': 'F',
};

/**
 * Convert API round name to our stage ID
 */
export function mapRoundToStage(round: string): string | null {
  return ROUND_TO_STAGE[round] || null;
}
