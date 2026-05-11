/**
 * Single source of truth for the FIFA World Cup 2026 match schedule.
 *
 * The previous setup duplicated this table inside two different pages and
 * they drifted apart (the squad page had placeholder 20:00 times while the
 * fixtures page had different stadium assignments). To avoid that ever
 * happening again, every screen now imports from this module.
 *
 * Source: official FIFA media release ("Updated FIFA World Cup 2026 match
 * schedule reveals venues and kick-off times for all 104 matches",
 * April 23 2026) cross-referenced with NBC Sports and beIN Sports. All
 * kickoff times below are US Eastern Time (ET) on the listed calendar date
 * — June/July 2026 sits entirely within DST so the effective offset is
 * UTC-4 (EDT). `parseFixtureDateTime` in src/lib/format-time.ts handles the
 * UTC conversion so the user's preferred display zone shifts correctly.
 *
 * IDs 1–72 cover the 72 group-stage games; 73–104 cover the knockouts. We
 * keep the numbering consistent with FIFA's own match-number assignments
 * (M73 = first R32 game, M104 = the final) so we can cross-reference media
 * coverage and the dashboard's "next match" copy without translation.
 */

// All 16 host stadiums. Keys are short slugs used everywhere else.
export const WC_STADIUMS = {
  // USA (11)
  metlife: {
    name: 'MetLife Stadium',
    city: 'East Rutherford, NJ',
    country: 'USA',
    capacity: 82500,
  },
  att: { name: 'AT&T Stadium', city: 'Arlington, TX', country: 'USA', capacity: 80000 },
  sofi: { name: 'SoFi Stadium', city: 'Inglewood, CA', country: 'USA', capacity: 70240 },
  levis: {
    name: "Levi's Stadium",
    city: 'Santa Clara, CA',
    country: 'USA',
    capacity: 68500,
  },
  hard_rock: {
    name: 'Hard Rock Stadium',
    city: 'Miami, FL',
    country: 'USA',
    capacity: 65326,
  },
  mercedes: {
    name: 'Mercedes-Benz Stadium',
    city: 'Atlanta, GA',
    country: 'USA',
    capacity: 71000,
  },
  nrg: { name: 'NRG Stadium', city: 'Houston, TX', country: 'USA', capacity: 72220 },
  lincoln: {
    name: 'Lincoln Financial Field',
    city: 'Philadelphia, PA',
    country: 'USA',
    capacity: 69176,
  },
  arrowhead: {
    name: 'Arrowhead Stadium',
    city: 'Kansas City, MO',
    country: 'USA',
    capacity: 76416,
  },
  lumen: {
    name: 'Lumen Field',
    city: 'Seattle, WA',
    country: 'USA',
    capacity: 69000,
  },
  gillette: {
    name: 'Gillette Stadium',
    city: 'Foxborough, MA',
    country: 'USA',
    capacity: 65878,
  },
  // Mexico (3)
  azteca: {
    name: 'Estadio Banorte (Azteca)',
    city: 'Mexico City',
    country: 'Mexico',
    capacity: 87500,
  },
  akron: {
    name: 'Estadio Akron',
    city: 'Guadalajara',
    country: 'Mexico',
    capacity: 49850,
  },
  bbva: {
    name: 'Estadio BBVA',
    city: 'Monterrey',
    country: 'Mexico',
    capacity: 53500,
  },
  // Canada (2)
  bmo: { name: 'BMO Field', city: 'Toronto', country: 'Canada', capacity: 45500 },
  bc_place: {
    name: 'BC Place',
    city: 'Vancouver',
    country: 'Canada',
    capacity: 54500,
  },
} as const;

export type StadiumKey = keyof typeof WC_STADIUMS;

export interface WorldCupFixture {
  id: string;
  group: string; // '' for knockouts
  home: string; // 3-letter code OR placeholder like "W R32-1"
  away: string;
  date: string; // YYYY-MM-DD, ET calendar date
  time: string; // HH:MM 24-hour, ET clock time
  stadium: StadiumKey;
  stage: string;
}

/**
 * Group stage – 72 matches. Verified against FIFA's official release.
 * The Vancouver night games on Day 2/Day 4 etc. kick off at 21:00 PT which
 * is 00:00 ET on the FOLLOWING day; FIFA still lists those under the
 * preceding calendar date so we follow that convention here ("midnight ET"
 * = 00:00 of the listed date).
 */
export const WORLD_CUP_FIXTURES: WorldCupFixture[] = [
  // --- Group A: Mexico, South Africa, South Korea, Czechia ---
  { id: '1', group: 'A', home: 'MEX', away: 'RSA', date: '2026-06-11', time: '15:00', stadium: 'azteca', stage: 'Group A' },
  { id: '2', group: 'A', home: 'KOR', away: 'CZE', date: '2026-06-11', time: '22:00', stadium: 'akron', stage: 'Group A' },
  { id: '3', group: 'A', home: 'CZE', away: 'RSA', date: '2026-06-18', time: '12:00', stadium: 'mercedes', stage: 'Group A' },
  { id: '4', group: 'A', home: 'MEX', away: 'KOR', date: '2026-06-18', time: '21:00', stadium: 'akron', stage: 'Group A' },
  { id: '5', group: 'A', home: 'CZE', away: 'MEX', date: '2026-06-24', time: '21:00', stadium: 'azteca', stage: 'Group A' },
  { id: '6', group: 'A', home: 'RSA', away: 'KOR', date: '2026-06-24', time: '21:00', stadium: 'bbva', stage: 'Group A' },

  // --- Group B: Canada, Bosnia & Herzegovina, Qatar, Switzerland ---
  { id: '7', group: 'B', home: 'CAN', away: 'BIH', date: '2026-06-12', time: '15:00', stadium: 'bmo', stage: 'Group B' },
  { id: '8', group: 'B', home: 'QAT', away: 'SUI', date: '2026-06-13', time: '15:00', stadium: 'levis', stage: 'Group B' },
  { id: '9', group: 'B', home: 'SUI', away: 'BIH', date: '2026-06-18', time: '15:00', stadium: 'sofi', stage: 'Group B' },
  { id: '10', group: 'B', home: 'CAN', away: 'QAT', date: '2026-06-18', time: '18:00', stadium: 'bc_place', stage: 'Group B' },
  { id: '11', group: 'B', home: 'SUI', away: 'CAN', date: '2026-06-24', time: '15:00', stadium: 'bc_place', stage: 'Group B' },
  { id: '12', group: 'B', home: 'BIH', away: 'QAT', date: '2026-06-24', time: '15:00', stadium: 'lumen', stage: 'Group B' },

  // --- Group C: Brazil, Morocco, Haiti, Scotland ---
  { id: '13', group: 'C', home: 'BRA', away: 'MAR', date: '2026-06-13', time: '18:00', stadium: 'metlife', stage: 'Group C' },
  { id: '14', group: 'C', home: 'HAI', away: 'SCO', date: '2026-06-13', time: '21:00', stadium: 'gillette', stage: 'Group C' },
  { id: '15', group: 'C', home: 'SCO', away: 'MAR', date: '2026-06-19', time: '18:00', stadium: 'gillette', stage: 'Group C' },
  { id: '16', group: 'C', home: 'BRA', away: 'HAI', date: '2026-06-19', time: '21:00', stadium: 'lincoln', stage: 'Group C' },
  { id: '17', group: 'C', home: 'SCO', away: 'BRA', date: '2026-06-24', time: '18:00', stadium: 'hard_rock', stage: 'Group C' },
  { id: '18', group: 'C', home: 'MAR', away: 'HAI', date: '2026-06-24', time: '18:00', stadium: 'mercedes', stage: 'Group C' },

  // --- Group D: USA, Paraguay, Australia, Türkiye ---
  { id: '19', group: 'D', home: 'USA', away: 'PAR', date: '2026-06-12', time: '21:00', stadium: 'sofi', stage: 'Group D' },
  // AUS-TUR kicks off Friday Jun 12 21:00 PT in Vancouver = 00:00 ET Jun 13.
  { id: '20', group: 'D', home: 'AUS', away: 'TUR', date: '2026-06-13', time: '00:00', stadium: 'bc_place', stage: 'Group D' },
  { id: '21', group: 'D', home: 'USA', away: 'AUS', date: '2026-06-19', time: '15:00', stadium: 'lumen', stage: 'Group D' },
  { id: '22', group: 'D', home: 'TUR', away: 'PAR', date: '2026-06-19', time: '00:00', stadium: 'levis', stage: 'Group D' }, // PT evening = "midnight ET"
  { id: '23', group: 'D', home: 'TUR', away: 'USA', date: '2026-06-25', time: '22:00', stadium: 'sofi', stage: 'Group D' },
  { id: '24', group: 'D', home: 'PAR', away: 'AUS', date: '2026-06-25', time: '22:00', stadium: 'levis', stage: 'Group D' },

  // --- Group E: Germany, Curaçao, Ivory Coast, Ecuador ---
  { id: '25', group: 'E', home: 'GER', away: 'CUW', date: '2026-06-14', time: '13:00', stadium: 'nrg', stage: 'Group E' },
  { id: '26', group: 'E', home: 'CIV', away: 'ECU', date: '2026-06-14', time: '19:00', stadium: 'lincoln', stage: 'Group E' },
  { id: '27', group: 'E', home: 'GER', away: 'CIV', date: '2026-06-20', time: '16:00', stadium: 'bmo', stage: 'Group E' },
  { id: '28', group: 'E', home: 'ECU', away: 'CUW', date: '2026-06-20', time: '20:00', stadium: 'arrowhead', stage: 'Group E' },
  { id: '29', group: 'E', home: 'ECU', away: 'GER', date: '2026-06-25', time: '16:00', stadium: 'metlife', stage: 'Group E' },
  { id: '30', group: 'E', home: 'CUW', away: 'CIV', date: '2026-06-25', time: '16:00', stadium: 'lincoln', stage: 'Group E' },

  // --- Group F: Netherlands, Japan, Sweden, Tunisia ---
  { id: '31', group: 'F', home: 'NED', away: 'JPN', date: '2026-06-14', time: '16:00', stadium: 'att', stage: 'Group F' },
  { id: '32', group: 'F', home: 'SWE', away: 'TUN', date: '2026-06-14', time: '22:00', stadium: 'bbva', stage: 'Group F' },
  { id: '33', group: 'F', home: 'NED', away: 'SWE', date: '2026-06-20', time: '13:00', stadium: 'nrg', stage: 'Group F' },
  { id: '34', group: 'F', home: 'TUN', away: 'JPN', date: '2026-06-20', time: '00:00', stadium: 'bbva', stage: 'Group F' },
  { id: '35', group: 'F', home: 'JPN', away: 'SWE', date: '2026-06-25', time: '19:00', stadium: 'att', stage: 'Group F' },
  { id: '36', group: 'F', home: 'TUN', away: 'NED', date: '2026-06-25', time: '19:00', stadium: 'arrowhead', stage: 'Group F' },

  // --- Group G: Belgium, Egypt, Iran, New Zealand ---
  { id: '37', group: 'G', home: 'BEL', away: 'EGY', date: '2026-06-15', time: '15:00', stadium: 'lumen', stage: 'Group G' },
  { id: '38', group: 'G', home: 'IRN', away: 'NZL', date: '2026-06-15', time: '21:00', stadium: 'sofi', stage: 'Group G' },
  { id: '39', group: 'G', home: 'BEL', away: 'IRN', date: '2026-06-21', time: '15:00', stadium: 'sofi', stage: 'Group G' },
  { id: '40', group: 'G', home: 'NZL', away: 'EGY', date: '2026-06-21', time: '21:00', stadium: 'bc_place', stage: 'Group G' },
  { id: '41', group: 'G', home: 'EGY', away: 'IRN', date: '2026-06-26', time: '23:00', stadium: 'lumen', stage: 'Group G' },
  { id: '42', group: 'G', home: 'NZL', away: 'BEL', date: '2026-06-26', time: '23:00', stadium: 'bc_place', stage: 'Group G' },

  // --- Group H: Spain, Cape Verde, Saudi Arabia, Uruguay ---
  { id: '43', group: 'H', home: 'ESP', away: 'CPV', date: '2026-06-15', time: '12:00', stadium: 'mercedes', stage: 'Group H' },
  { id: '44', group: 'H', home: 'KSA', away: 'URU', date: '2026-06-15', time: '18:00', stadium: 'hard_rock', stage: 'Group H' },
  { id: '45', group: 'H', home: 'ESP', away: 'KSA', date: '2026-06-21', time: '12:00', stadium: 'mercedes', stage: 'Group H' },
  { id: '46', group: 'H', home: 'URU', away: 'CPV', date: '2026-06-21', time: '18:00', stadium: 'hard_rock', stage: 'Group H' },
  { id: '47', group: 'H', home: 'CPV', away: 'KSA', date: '2026-06-26', time: '20:00', stadium: 'nrg', stage: 'Group H' },
  { id: '48', group: 'H', home: 'URU', away: 'ESP', date: '2026-06-26', time: '20:00', stadium: 'akron', stage: 'Group H' },

  // --- Group I: France, Senegal, Iraq, Norway ---
  { id: '49', group: 'I', home: 'FRA', away: 'SEN', date: '2026-06-16', time: '15:00', stadium: 'metlife', stage: 'Group I' },
  { id: '50', group: 'I', home: 'IRQ', away: 'NOR', date: '2026-06-16', time: '18:00', stadium: 'gillette', stage: 'Group I' },
  { id: '51', group: 'I', home: 'FRA', away: 'IRQ', date: '2026-06-22', time: '17:00', stadium: 'lincoln', stage: 'Group I' },
  { id: '52', group: 'I', home: 'NOR', away: 'SEN', date: '2026-06-22', time: '20:00', stadium: 'metlife', stage: 'Group I' },
  { id: '53', group: 'I', home: 'NOR', away: 'FRA', date: '2026-06-26', time: '15:00', stadium: 'gillette', stage: 'Group I' },
  { id: '54', group: 'I', home: 'SEN', away: 'IRQ', date: '2026-06-26', time: '15:00', stadium: 'bmo', stage: 'Group I' },

  // --- Group J: Argentina, Algeria, Jordan, Austria ---
  { id: '55', group: 'J', home: 'ARG', away: 'ALG', date: '2026-06-16', time: '21:00', stadium: 'arrowhead', stage: 'Group J' },
  // Austria–Jordan: "Tue Jun 16 12:00 AM ET" → 00:00 on Jun 16 (PT evening Jun 15).
  { id: '56', group: 'J', home: 'AUT', away: 'JOR', date: '2026-06-16', time: '00:00', stadium: 'levis', stage: 'Group J' },
  { id: '57', group: 'J', home: 'ARG', away: 'AUT', date: '2026-06-22', time: '13:00', stadium: 'att', stage: 'Group J' },
  { id: '58', group: 'J', home: 'JOR', away: 'ALG', date: '2026-06-22', time: '23:00', stadium: 'levis', stage: 'Group J' },
  { id: '59', group: 'J', home: 'ALG', away: 'AUT', date: '2026-06-27', time: '22:00', stadium: 'arrowhead', stage: 'Group J' },
  { id: '60', group: 'J', home: 'JOR', away: 'ARG', date: '2026-06-27', time: '22:00', stadium: 'att', stage: 'Group J' },

  // --- Group K: Portugal, Uzbekistan, Colombia, DR Congo ---
  { id: '61', group: 'K', home: 'POR', away: 'COD', date: '2026-06-17', time: '13:00', stadium: 'nrg', stage: 'Group K' },
  { id: '62', group: 'K', home: 'UZB', away: 'COL', date: '2026-06-17', time: '22:00', stadium: 'azteca', stage: 'Group K' },
  { id: '63', group: 'K', home: 'POR', away: 'UZB', date: '2026-06-23', time: '13:00', stadium: 'nrg', stage: 'Group K' },
  { id: '64', group: 'K', home: 'COL', away: 'COD', date: '2026-06-23', time: '22:00', stadium: 'akron', stage: 'Group K' },
  { id: '65', group: 'K', home: 'COL', away: 'POR', date: '2026-06-27', time: '19:30', stadium: 'hard_rock', stage: 'Group K' },
  { id: '66', group: 'K', home: 'COD', away: 'UZB', date: '2026-06-27', time: '19:30', stadium: 'mercedes', stage: 'Group K' },

  // --- Group L: England, Croatia, Ghana, Panama ---
  { id: '67', group: 'L', home: 'ENG', away: 'CRO', date: '2026-06-17', time: '16:00', stadium: 'att', stage: 'Group L' },
  { id: '68', group: 'L', home: 'GHA', away: 'PAN', date: '2026-06-17', time: '19:00', stadium: 'bmo', stage: 'Group L' },
  { id: '69', group: 'L', home: 'ENG', away: 'GHA', date: '2026-06-23', time: '16:00', stadium: 'gillette', stage: 'Group L' },
  { id: '70', group: 'L', home: 'PAN', away: 'CRO', date: '2026-06-23', time: '19:00', stadium: 'bmo', stage: 'Group L' },
  { id: '71', group: 'L', home: 'PAN', away: 'ENG', date: '2026-06-27', time: '17:00', stadium: 'metlife', stage: 'Group L' },
  { id: '72', group: 'L', home: 'CRO', away: 'GHA', date: '2026-06-27', time: '17:00', stadium: 'lincoln', stage: 'Group L' },
];

/**
 * Knockout stage – 32 matches (R32 → Final). Bracket pairings use FIFA's
 * official match-number conventions; the home/away strings are bracket
 * labels until the teams are decided (e.g. "1A" = winner of Group A,
 * "3-A/B/C/D/F" = third-place team from one of those groups).
 */
export const KNOCKOUT_FIXTURES: WorldCupFixture[] = [
  // Round of 32 (June 28 – July 3)
  { id: 'M73', group: '', home: '2A', away: '2B', date: '2026-06-28', time: '15:00', stadium: 'sofi', stage: 'Round of 32' },
  { id: 'M76', group: '', home: '1C', away: '2F', date: '2026-06-29', time: '13:00', stadium: 'nrg', stage: 'Round of 32' },
  { id: 'M74', group: '', home: '1E', away: '3-A/B/C/D/F', date: '2026-06-29', time: '16:30', stadium: 'gillette', stage: 'Round of 32' },
  { id: 'M75', group: '', home: '1F', away: '2C', date: '2026-06-29', time: '21:00', stadium: 'bbva', stage: 'Round of 32' },
  { id: 'M78', group: '', home: '2E', away: '2I', date: '2026-06-30', time: '13:00', stadium: 'att', stage: 'Round of 32' },
  { id: 'M77', group: '', home: '1I', away: '3-C/D/F/G/H', date: '2026-06-30', time: '17:00', stadium: 'metlife', stage: 'Round of 32' },
  { id: 'M79', group: '', home: '1A', away: '3-C/E/F/H/I', date: '2026-06-30', time: '21:00', stadium: 'azteca', stage: 'Round of 32' },
  { id: 'M80', group: '', home: '1L', away: '3-E/H/I/J/K', date: '2026-07-01', time: '12:00', stadium: 'mercedes', stage: 'Round of 32' },
  { id: 'M82', group: '', home: '1G', away: '3-A/E/H/I/J', date: '2026-07-01', time: '16:00', stadium: 'lumen', stage: 'Round of 32' },
  { id: 'M81', group: '', home: '1D', away: '3-B/E/F/I/J', date: '2026-07-01', time: '20:00', stadium: 'levis', stage: 'Round of 32' },
  { id: 'M84', group: '', home: '1H', away: '2J', date: '2026-07-02', time: '15:00', stadium: 'sofi', stage: 'Round of 32' },
  { id: 'M83', group: '', home: '2K', away: '2L', date: '2026-07-02', time: '19:00', stadium: 'bmo', stage: 'Round of 32' },
  { id: 'M85', group: '', home: '1B', away: '3-E/F/G/I/J', date: '2026-07-02', time: '23:00', stadium: 'bc_place', stage: 'Round of 32' },
  { id: 'M88', group: '', home: '2D', away: '2G', date: '2026-07-03', time: '14:00', stadium: 'att', stage: 'Round of 32' },
  { id: 'M86', group: '', home: '1J', away: '2H', date: '2026-07-03', time: '18:00', stadium: 'hard_rock', stage: 'Round of 32' },
  { id: 'M87', group: '', home: '1K', away: '3-D/E/I/J/L', date: '2026-07-03', time: '21:30', stadium: 'arrowhead', stage: 'Round of 32' },

  // Round of 16 (July 4–7)
  { id: 'M90', group: '', home: 'W M73', away: 'W M75', date: '2026-07-04', time: '13:00', stadium: 'nrg', stage: 'Round of 16' },
  { id: 'M89', group: '', home: 'W M74', away: 'W M77', date: '2026-07-04', time: '17:00', stadium: 'lincoln', stage: 'Round of 16' },
  { id: 'M91', group: '', home: 'W M76', away: 'W M78', date: '2026-07-05', time: '16:00', stadium: 'metlife', stage: 'Round of 16' },
  { id: 'M92', group: '', home: 'W M79', away: 'W M80', date: '2026-07-05', time: '20:00', stadium: 'azteca', stage: 'Round of 16' },
  { id: 'M93', group: '', home: 'W M83', away: 'W M84', date: '2026-07-06', time: '15:00', stadium: 'att', stage: 'Round of 16' },
  { id: 'M94', group: '', home: 'W M81', away: 'W M82', date: '2026-07-06', time: '20:00', stadium: 'lumen', stage: 'Round of 16' },
  { id: 'M95', group: '', home: 'W M86', away: 'W M88', date: '2026-07-07', time: '12:00', stadium: 'mercedes', stage: 'Round of 16' },
  { id: 'M96', group: '', home: 'W M85', away: 'W M87', date: '2026-07-07', time: '16:00', stadium: 'bc_place', stage: 'Round of 16' },

  // Quarter-finals (July 9–11)
  { id: 'M97', group: '', home: 'W M89', away: 'W M90', date: '2026-07-09', time: '16:00', stadium: 'gillette', stage: 'Quarter Final' },
  { id: 'M98', group: '', home: 'W M93', away: 'W M94', date: '2026-07-10', time: '15:00', stadium: 'sofi', stage: 'Quarter Final' },
  { id: 'M99', group: '', home: 'W M91', away: 'W M92', date: '2026-07-11', time: '17:00', stadium: 'hard_rock', stage: 'Quarter Final' },
  { id: 'M100', group: '', home: 'W M95', away: 'W M96', date: '2026-07-11', time: '21:00', stadium: 'arrowhead', stage: 'Quarter Final' },

  // Semi-finals (July 14–15)
  { id: 'M101', group: '', home: 'W M97', away: 'W M98', date: '2026-07-14', time: '15:00', stadium: 'att', stage: 'Semi Final' },
  { id: 'M102', group: '', home: 'W M99', away: 'W M100', date: '2026-07-15', time: '15:00', stadium: 'mercedes', stage: 'Semi Final' },

  // Third-place play-off (July 18)
  { id: 'M103', group: '', home: 'L M101', away: 'L M102', date: '2026-07-18', time: '17:00', stadium: 'hard_rock', stage: '3rd Place' },

  // Final (July 19)
  { id: 'M104', group: '', home: 'W M101', away: 'W M102', date: '2026-07-19', time: '15:00', stadium: 'metlife', stage: 'Final' },
];

export const ALL_WC_FIXTURES: WorldCupFixture[] = [
  ...WORLD_CUP_FIXTURES,
  ...KNOCKOUT_FIXTURES,
];

/**
 * Nation name lookup — keyed by the 3-letter codes used in fixture rows.
 * Single source of truth for both fixture pages and the squad header.
 */
export const NATION_NAMES: Record<string, string> = {
  MEX: 'Mexico',
  RSA: 'South Africa',
  KOR: 'Korea Republic',
  CZE: 'Czechia',
  CAN: 'Canada',
  BIH: 'Bosnia & Herzegovina',
  QAT: 'Qatar',
  SUI: 'Switzerland',
  BRA: 'Brazil',
  MAR: 'Morocco',
  HAI: 'Haiti',
  SCO: 'Scotland',
  USA: 'USA',
  PAR: 'Paraguay',
  AUS: 'Australia',
  TUR: 'Türkiye',
  GER: 'Germany',
  CUW: 'Curaçao',
  CIV: 'Ivory Coast',
  ECU: 'Ecuador',
  NED: 'Netherlands',
  JPN: 'Japan',
  SWE: 'Sweden',
  TUN: 'Tunisia',
  BEL: 'Belgium',
  EGY: 'Egypt',
  IRN: 'Iran',
  NZL: 'New Zealand',
  ESP: 'Spain',
  CPV: 'Cape Verde',
  KSA: 'Saudi Arabia',
  URU: 'Uruguay',
  FRA: 'France',
  SEN: 'Senegal',
  IRQ: 'Iraq',
  NOR: 'Norway',
  ARG: 'Argentina',
  ALG: 'Algeria',
  AUT: 'Austria',
  JOR: 'Jordan',
  POR: 'Portugal',
  COD: 'DR Congo',
  UZB: 'Uzbekistan',
  COL: 'Colombia',
  ENG: 'England',
  CRO: 'Croatia',
  GHA: 'Ghana',
  PAN: 'Panama',
};
