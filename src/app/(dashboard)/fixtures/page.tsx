'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getFlagUrl } from '@/lib/flags';
import { useUserTimezone } from '@/hooks/useTimezone';
import {
  formatDateWithWeekday,
  formatTime as fmtTime,
  parseFixtureDateTime,
} from '@/lib/format-time';
import { TimezoneIndicator } from '@/components/timezone-picker';

// World Cup 2026 Stadiums
const STADIUMS = {
  // USA
  'metlife': { name: 'MetLife Stadium', city: 'East Rutherford, NJ', country: 'USA', capacity: 82500 },
  'rose_bowl': { name: 'Rose Bowl', city: 'Pasadena, CA', country: 'USA', capacity: 88400 },
  'att': { name: 'AT&T Stadium', city: 'Arlington, TX', country: 'USA', capacity: 80000 },
  'sofi': { name: 'SoFi Stadium', city: 'Inglewood, CA', country: 'USA', capacity: 70240 },
  'levis': { name: "Levi's Stadium", city: 'Santa Clara, CA', country: 'USA', capacity: 68500 },
  'hard_rock': { name: 'Hard Rock Stadium', city: 'Miami, FL', country: 'USA', capacity: 65326 },
  'mercedes': { name: 'Mercedes-Benz Stadium', city: 'Atlanta, GA', country: 'USA', capacity: 71000 },
  'nrg': { name: 'NRG Stadium', city: 'Houston, TX', country: 'USA', capacity: 72220 },
  'lincoln': { name: 'Lincoln Financial Field', city: 'Philadelphia, PA', country: 'USA', capacity: 69176 },
  'arrowhead': { name: 'Arrowhead Stadium', city: 'Kansas City, MO', country: 'USA', capacity: 76416 },
  'centurylink': { name: 'Lumen Field', city: 'Seattle, WA', country: 'USA', capacity: 69000 },
  // Mexico
  'azteca': { name: 'Estadio Azteca', city: 'Mexico City', country: 'Mexico', capacity: 87500 },
  'akron': { name: 'Estadio Akron', city: 'Guadalajara', country: 'Mexico', capacity: 49850 },
  'bbva': { name: 'Estadio BBVA', city: 'Monterrey', country: 'Mexico', capacity: 53500 },
  // Canada
  'bmo': { name: 'BMO Field', city: 'Toronto', country: 'Canada', capacity: 45500 },
  'bc_place': { name: 'BC Place', city: 'Vancouver', country: 'Canada', capacity: 54500 },
};

// Group Stage Fixtures (all times in EST). Playoff-winner slots that were
// originally TBD were filled in following the March 2026 UEFA play-offs and
// FIFA inter-confederation play-offs.
const GROUP_FIXTURES: Fixture[] = [
  // Group A (Mexico, South Korea, South Africa, Czech Republic – UEFA Path D winner)
  { id: '1', group: 'A', home: 'MEX', away: 'RSA', date: '2026-06-11', time: '20:00', stadium: 'azteca', stage: 'Group A' },
  { id: '2', group: 'A', home: 'KOR', away: 'CZE', date: '2026-06-12', time: '14:00', stadium: 'rose_bowl', stage: 'Group A' },
  { id: '3', group: 'A', home: 'RSA', away: 'KOR', date: '2026-06-16', time: '14:00', stadium: 'att', stage: 'Group A' },
  { id: '4', group: 'A', home: 'CZE', away: 'MEX', date: '2026-06-16', time: '17:00', stadium: 'sofi', stage: 'Group A' },
  { id: '5', group: 'A', home: 'MEX', away: 'KOR', date: '2026-06-20', time: '17:00', stadium: 'azteca', stage: 'Group A' },
  { id: '6', group: 'A', home: 'CZE', away: 'RSA', date: '2026-06-20', time: '17:00', stadium: 'arrowhead', stage: 'Group A' },

  // Group B (Canada, Qatar, Switzerland, Bosnia & Herzegovina – UEFA Path A winner)
  { id: '7', group: 'B', home: 'CAN', away: 'QAT', date: '2026-06-12', time: '17:00', stadium: 'bmo', stage: 'Group B' },
  { id: '8', group: 'B', home: 'SUI', away: 'BIH', date: '2026-06-12', time: '20:00', stadium: 'bc_place', stage: 'Group B' },
  { id: '9', group: 'B', home: 'QAT', away: 'SUI', date: '2026-06-17', time: '14:00', stadium: 'hard_rock', stage: 'Group B' },
  { id: '10', group: 'B', home: 'BIH', away: 'CAN', date: '2026-06-17', time: '17:00', stadium: 'bmo', stage: 'Group B' },
  { id: '11', group: 'B', home: 'CAN', away: 'SUI', date: '2026-06-21', time: '14:00', stadium: 'bc_place', stage: 'Group B' },
  { id: '12', group: 'B', home: 'BIH', away: 'QAT', date: '2026-06-21', time: '14:00', stadium: 'centurylink', stage: 'Group B' },
  
  // Group C (Brazil, Morocco, Haiti, Scotland)
  { id: '13', group: 'C', home: 'BRA', away: 'MAR', date: '2026-06-13', time: '14:00', stadium: 'sofi', stage: 'Group C' },
  { id: '14', group: 'C', home: 'HAI', away: 'SCO', date: '2026-06-13', time: '17:00', stadium: 'hard_rock', stage: 'Group C' },
  { id: '15', group: 'C', home: 'MAR', away: 'HAI', date: '2026-06-18', time: '14:00', stadium: 'mercedes', stage: 'Group C' },
  { id: '16', group: 'C', home: 'SCO', away: 'BRA', date: '2026-06-18', time: '17:00', stadium: 'metlife', stage: 'Group C' },
  { id: '17', group: 'C', home: 'BRA', away: 'HAI', date: '2026-06-23', time: '17:00', stadium: 'nrg', stage: 'Group C' },
  { id: '18', group: 'C', home: 'SCO', away: 'MAR', date: '2026-06-23', time: '17:00', stadium: 'lincoln', stage: 'Group C' },
  
  // Group D (USA, Australia, Paraguay, Turkey – UEFA Path C winner)
  { id: '19', group: 'D', home: 'USA', away: 'PAR', date: '2026-06-13', time: '20:00', stadium: 'metlife', stage: 'Group D' },
  { id: '20', group: 'D', home: 'AUS', away: 'TUR', date: '2026-06-14', time: '14:00', stadium: 'att', stage: 'Group D' },
  { id: '21', group: 'D', home: 'PAR', away: 'AUS', date: '2026-06-18', time: '20:00', stadium: 'arrowhead', stage: 'Group D' },
  { id: '22', group: 'D', home: 'TUR', away: 'USA', date: '2026-06-19', time: '14:00', stadium: 'sofi', stage: 'Group D' },
  { id: '23', group: 'D', home: 'USA', away: 'AUS', date: '2026-06-23', time: '20:00', stadium: 'metlife', stage: 'Group D' },
  { id: '24', group: 'D', home: 'TUR', away: 'PAR', date: '2026-06-23', time: '20:00', stadium: 'rose_bowl', stage: 'Group D' },
  
  // Group E (Germany, Curaçao, Ivory Coast, Ecuador)
  { id: '25', group: 'E', home: 'GER', away: 'CUW', date: '2026-06-14', time: '14:00', stadium: 'levis', stage: 'Group E' },
  { id: '26', group: 'E', home: 'CIV', away: 'ECU', date: '2026-06-14', time: '17:00', stadium: 'nrg', stage: 'Group E' },
  { id: '27', group: 'E', home: 'ECU', away: 'GER', date: '2026-06-19', time: '14:00', stadium: 'mercedes', stage: 'Group E' },
  { id: '28', group: 'E', home: 'CUW', away: 'CIV', date: '2026-06-19', time: '17:00', stadium: 'hard_rock', stage: 'Group E' },
  { id: '29', group: 'E', home: 'GER', away: 'CIV', date: '2026-06-24', time: '17:00', stadium: 'sofi', stage: 'Group E' },
  { id: '30', group: 'E', home: 'ECU', away: 'CUW', date: '2026-06-24', time: '17:00', stadium: 'centurylink', stage: 'Group E' },
  
  // Group F (Netherlands, Japan, Tunisia, Sweden – UEFA Path B winner)
  { id: '31', group: 'F', home: 'NED', away: 'JPN', date: '2026-06-14', time: '20:00', stadium: 'rose_bowl', stage: 'Group F' },
  { id: '32', group: 'F', home: 'TUN', away: 'SWE', date: '2026-06-15', time: '14:00', stadium: 'lincoln', stage: 'Group F' },
  { id: '33', group: 'F', home: 'JPN', away: 'TUN', date: '2026-06-19', time: '20:00', stadium: 'att', stage: 'Group F' },
  { id: '34', group: 'F', home: 'SWE', away: 'NED', date: '2026-06-20', time: '14:00', stadium: 'akron', stage: 'Group F' },
  { id: '35', group: 'F', home: 'NED', away: 'TUN', date: '2026-06-24', time: '20:00', stadium: 'metlife', stage: 'Group F' },
  { id: '36', group: 'F', home: 'SWE', away: 'JPN', date: '2026-06-24', time: '20:00', stadium: 'bbva', stage: 'Group F' },
  
  // Group G (Belgium, Egypt, Iran, New Zealand)
  { id: '37', group: 'G', home: 'BEL', away: 'EGY', date: '2026-06-15', time: '17:00', stadium: 'metlife', stage: 'Group G' },
  { id: '38', group: 'G', home: 'IRN', away: 'NZL', date: '2026-06-15', time: '20:00', stadium: 'arrowhead', stage: 'Group G' },
  { id: '39', group: 'G', home: 'EGY', away: 'IRN', date: '2026-06-20', time: '17:00', stadium: 'nrg', stage: 'Group G' },
  { id: '40', group: 'G', home: 'NZL', away: 'BEL', date: '2026-06-20', time: '20:00', stadium: 'levis', stage: 'Group G' },
  { id: '41', group: 'G', home: 'BEL', away: 'IRN', date: '2026-06-25', time: '14:00', stadium: 'hard_rock', stage: 'Group G' },
  { id: '42', group: 'G', home: 'NZL', away: 'EGY', date: '2026-06-25', time: '14:00', stadium: 'mercedes', stage: 'Group G' },
  
  // Group H (Spain, Saudi Arabia, Cape Verde, Uruguay)
  { id: '43', group: 'H', home: 'ESP', away: 'CPV', date: '2026-06-16', time: '14:00', stadium: 'azteca', stage: 'Group H' },
  { id: '44', group: 'H', home: 'KSA', away: 'URU', date: '2026-06-16', time: '17:00', stadium: 'bbva', stage: 'Group H' },
  { id: '45', group: 'H', home: 'URU', away: 'ESP', date: '2026-06-21', time: '14:00', stadium: 'akron', stage: 'Group H' },
  { id: '46', group: 'H', home: 'CPV', away: 'KSA', date: '2026-06-21', time: '17:00', stadium: 'centurylink', stage: 'Group H' },
  { id: '47', group: 'H', home: 'ESP', away: 'KSA', date: '2026-06-26', time: '14:00', stadium: 'rose_bowl', stage: 'Group H' },
  { id: '48', group: 'H', home: 'URU', away: 'CPV', date: '2026-06-26', time: '14:00', stadium: 'levis', stage: 'Group H' },
  
  // Group I (France, Senegal, Norway, Iraq – FIFA Pathway 2 winner)
  { id: '49', group: 'I', home: 'FRA', away: 'SEN', date: '2026-06-16', time: '20:00', stadium: 'metlife', stage: 'Group I' },
  { id: '50', group: 'I', home: 'NOR', away: 'IRQ', date: '2026-06-17', time: '14:00', stadium: 'sofi', stage: 'Group I' },
  { id: '51', group: 'I', home: 'SEN', away: 'NOR', date: '2026-06-21', time: '20:00', stadium: 'att', stage: 'Group I' },
  { id: '52', group: 'I', home: 'IRQ', away: 'FRA', date: '2026-06-22', time: '14:00', stadium: 'hard_rock', stage: 'Group I' },
  { id: '53', group: 'I', home: 'FRA', away: 'NOR', date: '2026-06-26', time: '20:00', stadium: 'sofi', stage: 'Group I' },
  { id: '54', group: 'I', home: 'IRQ', away: 'SEN', date: '2026-06-26', time: '20:00', stadium: 'nrg', stage: 'Group I' },
  
  // Group J (Argentina, Algeria, Jordan, Austria)
  { id: '55', group: 'J', home: 'ARG', away: 'ALG', date: '2026-06-17', time: '17:00', stadium: 'hard_rock', stage: 'Group J' },
  { id: '56', group: 'J', home: 'AUT', away: 'JOR', date: '2026-06-17', time: '20:00', stadium: 'lincoln', stage: 'Group J' },
  { id: '57', group: 'J', home: 'ALG', away: 'AUT', date: '2026-06-22', time: '14:00', stadium: 'arrowhead', stage: 'Group J' },
  { id: '58', group: 'J', home: 'ARG', away: 'JOR', date: '2026-06-22', time: '17:00', stadium: 'nrg', stage: 'Group J' },
  { id: '59', group: 'J', home: 'JOR', away: 'ALG', date: '2026-06-27', time: '14:00', stadium: 'centurylink', stage: 'Group J' },
  { id: '60', group: 'J', home: 'AUT', away: 'ARG', date: '2026-06-27', time: '14:00', stadium: 'hard_rock', stage: 'Group J' },
  
  // Group K (Portugal, Uzbekistan, Colombia, DR Congo – FIFA Pathway 1 winner)
  { id: '61', group: 'K', home: 'POR', away: 'UZB', date: '2026-06-18', time: '14:00', stadium: 'sofi', stage: 'Group K' },
  { id: '62', group: 'K', home: 'COL', away: 'COD', date: '2026-06-18', time: '17:00', stadium: 'mercedes', stage: 'Group K' },
  { id: '63', group: 'K', home: 'UZB', away: 'COL', date: '2026-06-23', time: '14:00', stadium: 'levis', stage: 'Group K' },
  { id: '64', group: 'K', home: 'COD', away: 'POR', date: '2026-06-23', time: '17:00', stadium: 'arrowhead', stage: 'Group K' },
  { id: '65', group: 'K', home: 'POR', away: 'COL', date: '2026-06-28', time: '17:00', stadium: 'azteca', stage: 'Group K' },
  { id: '66', group: 'K', home: 'COD', away: 'UZB', date: '2026-06-28', time: '17:00', stadium: 'bbva', stage: 'Group K' },
  
  // Group L (England, Croatia, Ghana, Panama)
  { id: '67', group: 'L', home: 'ENG', away: 'CRO', date: '2026-06-18', time: '20:00', stadium: 'metlife', stage: 'Group L' },
  { id: '68', group: 'L', home: 'GHA', away: 'PAN', date: '2026-06-19', time: '14:00', stadium: 'att', stage: 'Group L' },
  { id: '69', group: 'L', home: 'CRO', away: 'GHA', date: '2026-06-23', time: '20:00', stadium: 'rose_bowl', stage: 'Group L' },
  { id: '70', group: 'L', home: 'PAN', away: 'ENG', date: '2026-06-24', time: '14:00', stadium: 'bmo', stage: 'Group L' },
  { id: '71', group: 'L', home: 'ENG', away: 'GHA', date: '2026-06-28', time: '20:00', stadium: 'sofi', stage: 'Group L' },
  { id: '72', group: 'L', home: 'CRO', away: 'PAN', date: '2026-06-28', time: '20:00', stadium: 'nrg', stage: 'Group L' },
];

// Knockout fixtures (dates from July 1-19)
const KNOCKOUT_FIXTURES: Fixture[] = [
  // Round of 32 (July 1-4)
  { id: 'R32-1', group: '', home: '1A', away: '2B', date: '2026-07-01', time: '12:00', stadium: 'metlife', stage: 'Round of 32' },
  { id: 'R32-2', group: '', home: '1C', away: '2D', date: '2026-07-01', time: '16:00', stadium: 'rose_bowl', stage: 'Round of 32' },
  { id: 'R32-3', group: '', home: '1E', away: '2F', date: '2026-07-01', time: '20:00', stadium: 'att', stage: 'Round of 32' },
  { id: 'R32-4', group: '', home: '1G', away: '2H', date: '2026-07-02', time: '12:00', stadium: 'sofi', stage: 'Round of 32' },
  { id: 'R32-5', group: '', home: '1B', away: '2A', date: '2026-07-02', time: '16:00', stadium: 'azteca', stage: 'Round of 32' },
  { id: 'R32-6', group: '', home: '1D', away: '2C', date: '2026-07-02', time: '20:00', stadium: 'hard_rock', stage: 'Round of 32' },
  { id: 'R32-7', group: '', home: '1F', away: '2E', date: '2026-07-03', time: '12:00', stadium: 'mercedes', stage: 'Round of 32' },
  { id: 'R32-8', group: '', home: '1H', away: '2G', date: '2026-07-03', time: '16:00', stadium: 'nrg', stage: 'Round of 32' },
  { id: 'R32-9', group: '', home: '1I', away: '2J', date: '2026-07-03', time: '20:00', stadium: 'levis', stage: 'Round of 32' },
  { id: 'R32-10', group: '', home: '1K', away: '2L', date: '2026-07-04', time: '12:00', stadium: 'lincoln', stage: 'Round of 32' },
  { id: 'R32-11', group: '', home: '1J', away: '2I', date: '2026-07-04', time: '16:00', stadium: 'arrowhead', stage: 'Round of 32' },
  { id: 'R32-12', group: '', home: '1L', away: '2K', date: '2026-07-04', time: '20:00', stadium: 'bc_place', stage: 'Round of 32' },
  { id: 'R32-13', group: '', home: '3rd Best', away: '3rd Best', date: '2026-07-05', time: '16:00', stadium: 'bbva', stage: 'Round of 32' },
  { id: 'R32-14', group: '', home: '3rd Best', away: '3rd Best', date: '2026-07-05', time: '20:00', stadium: 'akron', stage: 'Round of 32' },
  { id: 'R32-15', group: '', home: '3rd Best', away: '3rd Best', date: '2026-07-06', time: '16:00', stadium: 'centurylink', stage: 'Round of 32' },
  { id: 'R32-16', group: '', home: '3rd Best', away: '3rd Best', date: '2026-07-06', time: '20:00', stadium: 'bmo', stage: 'Round of 32' },
  
  // Round of 16 (July 8–11) – feeders are the 16 R32 winners, paired sequentially.
  { id: 'R16-1', group: '', home: 'W R32-1', away: 'W R32-2', date: '2026-07-08', time: '14:00', stadium: 'metlife', stage: 'Round of 16' },
  { id: 'R16-2', group: '', home: 'W R32-3', away: 'W R32-4', date: '2026-07-08', time: '18:00', stadium: 'rose_bowl', stage: 'Round of 16' },
  { id: 'R16-3', group: '', home: 'W R32-5', away: 'W R32-6', date: '2026-07-09', time: '14:00', stadium: 'att', stage: 'Round of 16' },
  { id: 'R16-4', group: '', home: 'W R32-7', away: 'W R32-8', date: '2026-07-09', time: '18:00', stadium: 'sofi', stage: 'Round of 16' },
  { id: 'R16-5', group: '', home: 'W R32-9', away: 'W R32-10', date: '2026-07-10', time: '14:00', stadium: 'azteca', stage: 'Round of 16' },
  { id: 'R16-6', group: '', home: 'W R32-11', away: 'W R32-12', date: '2026-07-10', time: '18:00', stadium: 'hard_rock', stage: 'Round of 16' },
  { id: 'R16-7', group: '', home: 'W R32-13', away: 'W R32-14', date: '2026-07-11', time: '14:00', stadium: 'mercedes', stage: 'Round of 16' },
  { id: 'R16-8', group: '', home: 'W R32-15', away: 'W R32-16', date: '2026-07-11', time: '18:00', stadium: 'nrg', stage: 'Round of 16' },

  // Quarter Finals (July 13–14) – feeders are the 8 R16 winners.
  { id: 'QF-1', group: '', home: 'W R16-1', away: 'W R16-2', date: '2026-07-13', time: '14:00', stadium: 'metlife', stage: 'Quarter Final' },
  { id: 'QF-2', group: '', home: 'W R16-3', away: 'W R16-4', date: '2026-07-13', time: '18:00', stadium: 'sofi', stage: 'Quarter Final' },
  { id: 'QF-3', group: '', home: 'W R16-5', away: 'W R16-6', date: '2026-07-14', time: '14:00', stadium: 'azteca', stage: 'Quarter Final' },
  { id: 'QF-4', group: '', home: 'W R16-7', away: 'W R16-8', date: '2026-07-14', time: '18:00', stadium: 'att', stage: 'Quarter Final' },

  // Semi Finals (July 16–17) – feeders are the 4 QF winners.
  { id: 'SF-1', group: '', home: 'W QF-1', away: 'W QF-2', date: '2026-07-16', time: '18:00', stadium: 'metlife', stage: 'Semi Final' },
  { id: 'SF-2', group: '', home: 'W QF-3', away: 'W QF-4', date: '2026-07-17', time: '18:00', stadium: 'azteca', stage: 'Semi Final' },

  // Third Place Play-off (July 19) – losers of the two semi-finals.
  { id: '3RD', group: '', home: 'L SF-1', away: 'L SF-2', date: '2026-07-19', time: '14:00', stadium: 'hard_rock', stage: '3rd Place' },

  // Final (July 19) – winners of the two semi-finals.
  { id: 'FINAL', group: '', home: 'W SF-1', away: 'W SF-2', date: '2026-07-19', time: '18:00', stadium: 'metlife', stage: 'Final' },
];

interface Fixture {
  id: string;
  group: string;
  home: string;
  away: string;
  date: string;
  time: string;
  stadium: keyof typeof STADIUMS;
  stage: string;
}

const NATION_NAMES: Record<string, string> = {
  'MEX': 'Mexico', 'RSA': 'South Africa', 'KOR': 'Korea Republic',
  'CAN': 'Canada', 'QAT': 'Qatar', 'SUI': 'Switzerland',
  'BRA': 'Brazil', 'MAR': 'Morocco', 'HAI': 'Haiti', 'SCO': 'Scotland',
  'USA': 'USA', 'PAR': 'Paraguay', 'AUS': 'Australia',
  'GER': 'Germany', 'CUW': 'Curaçao', 'CIV': 'Côte d\'Ivoire', 'ECU': 'Ecuador',
  'NED': 'Netherlands', 'JPN': 'Japan', 'TUN': 'Tunisia',
  'BEL': 'Belgium', 'EGY': 'Egypt', 'IRN': 'Iran', 'NZL': 'New Zealand',
  'ESP': 'Spain', 'CPV': 'Cabo Verde', 'KSA': 'Saudi Arabia', 'URU': 'Uruguay',
  'FRA': 'France', 'SEN': 'Senegal', 'NOR': 'Norway',
  'ARG': 'Argentina', 'ALG': 'Algeria', 'JOR': 'Jordan', 'AUT': 'Austria',
  'POR': 'Portugal', 'UZB': 'Uzbekistan', 'COL': 'Colombia',
  'ENG': 'England', 'CRO': 'Croatia', 'GHA': 'Ghana', 'PAN': 'Panama',
  // 2026 playoff winners (UEFA paths A–D + FIFA intercontinental pathways 1–2).
  // Finals took place 31 March 2026 – source: wikipedia.org/wiki/2026_FIFA_World_Cup_qualification.
  'CZE': 'Czech Republic',           // UEFA Path D → Group A
  'BIH': 'Bosnia & Herzegovina',     // UEFA Path A → Group B
  'TUR': 'Turkey',                   // UEFA Path C → Group D
  'SWE': 'Sweden',                   // UEFA Path B → Group F
  'IRQ': 'Iraq',                     // FIFA Pathway 2 → Group I
  'COD': 'DR Congo',                 // FIFA Pathway 1 → Group K
};

const FLAG_CODES: Record<string, string> = {
  'MEX': 'mx', 'RSA': 'za', 'KOR': 'kr', 'CAN': 'ca', 'QAT': 'qa', 'SUI': 'ch',
  'BRA': 'br', 'MAR': 'ma', 'HAI': 'ht', 'SCO': 'gb-sct', 'USA': 'us', 'PAR': 'py',
  'AUS': 'au', 'GER': 'de', 'CUW': 'cw', 'CIV': 'ci', 'ECU': 'ec', 'NED': 'nl',
  'JPN': 'jp', 'TUN': 'tn', 'BEL': 'be', 'EGY': 'eg', 'IRN': 'ir', 'NZL': 'nz',
  'ESP': 'es', 'CPV': 'cv', 'KSA': 'sa', 'URU': 'uy', 'FRA': 'fr', 'SEN': 'sn',
  'NOR': 'no', 'ARG': 'ar', 'ALG': 'dz', 'JOR': 'jo', 'AUT': 'at', 'POR': 'pt', 'UZB': 'uz',
  'COL': 'co', 'ENG': 'gb-eng', 'CRO': 'hr', 'GHA': 'gh', 'PAN': 'pa',
  // Playoff winners
  'CZE': 'cz', 'BIH': 'ba', 'TUR': 'tr', 'SWE': 'se', 'IRQ': 'iq', 'COD': 'cd',
};

type FilterOption = 'all' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'knockout';

function FixturesContent() {
  const searchParams = useSearchParams();
  const { timezone, abbreviation } = useUserTimezone();
  const [filter, setFilter] = useState<FilterOption>('all');
  
  // Read initial filter from URL
  useEffect(() => {
    const groupParam = searchParams.get('group');
    if (groupParam && ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].includes(groupParam)) {
      setFilter(groupParam as FilterOption);
    }
  }, [searchParams]);
  
  const allFixtures = [...GROUP_FIXTURES, ...KNOCKOUT_FIXTURES];
  
  const filteredFixtures = allFixtures.filter(f => {
    if (filter === 'all') return true;
    if (filter === 'knockout') return f.stage.includes('Round') || f.stage.includes('Final') || f.stage === '3rd Place';
    return f.group === filter;
  });
  
  // Sort by date and time. parseFixtureDateTime anchors the timezone-naive
  // strings to Eastern Time (the source zone the FIFA schedule was logged
  // in) so the sort is consistent across all user timezones.
  filteredFixtures.sort((a, b) => {
    return parseFixtureDateTime(a.date, a.time).getTime() -
      parseFixtureDateTime(b.date, b.time).getTime();
  });

  // Anchor calendar-day formatting at noon to dodge timezone off-by-one.
  const formatDate = (dateStr: string) => {
    return formatDateWithWeekday(new Date(dateStr + 'T12:00:00'), timezone);
  };

  // The fixture data stores `time: '20:00'` without a zone. The original
  // schedule was logged in Eastern Time (the UI used to label everything
  // "EST"), so we treat the source as ET via parseFixtureDateTime, then
  // render the absolute moment in the user's chosen zone. Result: a 20:00
  // ET kickoff displays as "8:00 PM EDT" for ET users, "5:00 PM PDT" for
  // West Coast users, "4:00 AM GST" next day for Dubai users, etc.
  const formatTime = (dateStr: string, timeStr: string) => {
    const date = parseFixtureDateTime(dateStr, timeStr);
    return `${fmtTime(date, timezone)} ${abbreviation}`;
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white mb-2">Fixtures</h1>
        <div className="flex items-center gap-2">
          <TimezoneIndicator />
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterButton>
        {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(g => (
          <FilterButton key={g} active={filter === g} onClick={() => setFilter(g as FilterOption)}>
            {g}
          </FilterButton>
        ))}
        <FilterButton active={filter === 'knockout'} onClick={() => setFilter('knockout')}>Knockouts</FilterButton>
      </div>

      {/* Fixtures List */}
      <div className="space-y-3">
        {filteredFixtures.map(fixture => {
          const stadium = STADIUMS[fixture.stadium];
          const isKnockout = !fixture.group;
          
          return (
            <div key={fixture.id} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.07] transition-all">
              {/* Stage & Date Row */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-white/40 uppercase tracking-wider">{fixture.stage}</span>
                <span className="text-xs text-white/50">{formatDate(fixture.date)}</span>
              </div>
              
              {/* Teams Row */}
              <div className="flex items-center justify-between gap-2 mb-3">
                {/* Home Team */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <TeamCell code={fixture.home} side="home" />
                </div>

                {/* Time */}
                <div className="px-2 sm:px-4 py-1.5 sm:py-2 bg-white/10 rounded-lg flex-shrink-0">
                  <span className="text-white font-bold text-[10px] sm:text-sm whitespace-nowrap">{formatTime(fixture.date, fixture.time)}</span>
                </div>

                {/* Away Team */}
                <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
                  <TeamCell code={fixture.away} side="away" />
                </div>
              </div>
              
              {/* Stadium Row */}
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 text-white/40 text-[10px] sm:text-xs">
                <svg className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="truncate">{stadium.city}</span>
              </div>
            </div>
          );
        })}
      </div>
      
      {filteredFixtures.length === 0 && (
        <div className="text-center py-12 text-white/40">
          No fixtures found for this filter.
        </div>
      )}
    </div>
  );
}

export default function FixturesPage() {
  return (
    <Suspense fallback={
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white mb-2">Fixtures</h1>
          <p className="text-white/40 text-sm">Loading...</p>
        </div>
      </div>
    }>
      <FixturesContent />
    </Suspense>
  );
}

function FilterButton({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all
        ${active 
          ? 'bg-rose-500 text-white' 
          : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
        }`}
    >
      {children}
    </button>
  );
}

/**
 * Render one side of a fixture's team display.
 *
 * Three rendering modes, picked in order:
 *   1. Real nation with a flag code → show flag + full name (e.g. "🇧🇷 Brazil").
 *   2. Group-stage placeholder like "1A" / "2B" / "3rd Best" (R32 seeding) →
 *      compact muted pill (fits inside the existing 3-char box).
 *   3. Knockout placeholder like "W R32-1" / "L SF-2" (R16+ feeders) → italic
 *      label, no box, full width – these are too long for the pill and the
 *      box was rendering useless slices like "W R".
 */
function TeamCell({ code, side }: { code: string; side: 'home' | 'away' }) {
  const flag = FLAG_CODES[code];
  const name = NATION_NAMES[code] ?? code;
  const isHome = side === 'home';
  const containerAlign = isHome ? '' : 'flex-row-reverse text-right';
  const textAlign = isHome ? '' : 'text-right';

  if (flag) {
    return (
      <div className={`flex items-center gap-2 min-w-0 ${containerAlign}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getFlagUrl(flag, 'md')}
          alt={code}
          className="w-6 h-4 sm:w-8 sm:h-6 rounded shadow-md flex-shrink-0"
        />
        <span className={`text-white font-semibold text-xs sm:text-sm truncate ${textAlign}`}>
          {name}
        </span>
      </div>
    );
  }

  // Short group-stage style placeholder (1A, 2B, 3rd Best …) – preserve the
  // existing pill so R32 rows still look like R32 rows.
  const isShortPlaceholder = code.length <= 9 && !/^[WL] /.test(code);
  if (isShortPlaceholder) {
    return (
      <div className={`flex items-center gap-2 min-w-0 ${containerAlign}`}>
        <div className="px-1.5 h-4 sm:h-6 bg-white/10 rounded flex items-center justify-center text-[9px] sm:text-[10px] text-white/60 flex-shrink-0 font-mono">
          {code}
        </div>
        <span className={`text-white/70 font-semibold text-xs sm:text-sm truncate italic ${textAlign}`}>
          {name}
        </span>
      </div>
    );
  }

  // Knockout feeder label ("W R32-1", "L SF-2"). Italic, no pill, the label
  // is the team name.
  return (
    <span className={`text-white/70 font-semibold text-xs sm:text-sm truncate italic ${textAlign} w-full`}>
      {name}
    </span>
  );
}
