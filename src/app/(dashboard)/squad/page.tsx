'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Kit, { PlayerCard, EmptySlot } from '@/components/kit';
import { getFlagUrl } from '@/lib/flags';

// Types
interface Nation {
  id: string;
  name: string;
  code: string;
  kitColor1: string;
  kitColor2: string;
}

interface Player {
  id: string;
  displayName: string;
  position: string;
  currentPrice: number;
  shirtNumber: number | null;
  nation: Nation;
  isStarting?: boolean;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  points?: number;
  stats?: {
    goals: number;
    assists: number;
    passAccuracy: number;
    interceptions: number;
    tackles: number;
    dribbles: number;
  };
}

type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

// World Cup 2026 Fixtures (Group Stage)
interface Fixture {
  id: string;
  home: string;
  away: string;
  date: string;
  time: string;
  stage: string;
  isPlayed?: boolean;
  homeScore?: number;
  awayScore?: number;
}

const WORLD_CUP_FIXTURES: Fixture[] = [
  // Group A
  { id: '1', home: 'MEX', away: 'RSA', date: '2026-06-11', time: '20:00', stage: 'Group A' },
  { id: '2', home: 'KOR', away: 'TBD', date: '2026-06-12', time: '14:00', stage: 'Group A' },
  { id: '3', home: 'RSA', away: 'KOR', date: '2026-06-16', time: '14:00', stage: 'Group A' },
  { id: '4', home: 'TBD', away: 'MEX', date: '2026-06-16', time: '17:00', stage: 'Group A' },
  { id: '5', home: 'MEX', away: 'KOR', date: '2026-06-20', time: '17:00', stage: 'Group A' },
  { id: '6', home: 'TBD', away: 'RSA', date: '2026-06-20', time: '17:00', stage: 'Group A' },
  // Group B
  { id: '7', home: 'CAN', away: 'QAT', date: '2026-06-12', time: '17:00', stage: 'Group B' },
  { id: '8', home: 'SUI', away: 'TBD', date: '2026-06-12', time: '20:00', stage: 'Group B' },
  { id: '9', home: 'QAT', away: 'SUI', date: '2026-06-17', time: '14:00', stage: 'Group B' },
  { id: '10', home: 'TBD', away: 'CAN', date: '2026-06-17', time: '17:00', stage: 'Group B' },
  { id: '11', home: 'CAN', away: 'SUI', date: '2026-06-21', time: '14:00', stage: 'Group B' },
  { id: '12', home: 'TBD', away: 'QAT', date: '2026-06-21', time: '14:00', stage: 'Group B' },
  // Group C
  { id: '13', home: 'BRA', away: 'MAR', date: '2026-06-13', time: '14:00', stage: 'Group C' },
  { id: '14', home: 'HAI', away: 'SCO', date: '2026-06-13', time: '17:00', stage: 'Group C' },
  { id: '15', home: 'MAR', away: 'HAI', date: '2026-06-18', time: '14:00', stage: 'Group C' },
  { id: '16', home: 'SCO', away: 'BRA', date: '2026-06-18', time: '17:00', stage: 'Group C' },
  { id: '17', home: 'BRA', away: 'HAI', date: '2026-06-23', time: '17:00', stage: 'Group C' },
  { id: '18', home: 'SCO', away: 'MAR', date: '2026-06-23', time: '17:00', stage: 'Group C' },
  // Group D
  { id: '19', home: 'USA', away: 'PAR', date: '2026-06-13', time: '20:00', stage: 'Group D' },
  { id: '20', home: 'AUS', away: 'TBD', date: '2026-06-14', time: '14:00', stage: 'Group D' },
  { id: '21', home: 'PAR', away: 'AUS', date: '2026-06-18', time: '20:00', stage: 'Group D' },
  { id: '22', home: 'TBD', away: 'USA', date: '2026-06-19', time: '14:00', stage: 'Group D' },
  { id: '23', home: 'USA', away: 'AUS', date: '2026-06-23', time: '20:00', stage: 'Group D' },
  { id: '24', home: 'TBD', away: 'PAR', date: '2026-06-23', time: '20:00', stage: 'Group D' },
  // Group E
  { id: '25', home: 'GER', away: 'CUW', date: '2026-06-14', time: '14:00', stage: 'Group E' },
  { id: '26', home: 'CIV', away: 'ECU', date: '2026-06-14', time: '17:00', stage: 'Group E' },
  { id: '27', home: 'ECU', away: 'GER', date: '2026-06-19', time: '14:00', stage: 'Group E' },
  { id: '28', home: 'CUW', away: 'CIV', date: '2026-06-19', time: '17:00', stage: 'Group E' },
  { id: '29', home: 'GER', away: 'CIV', date: '2026-06-24', time: '17:00', stage: 'Group E' },
  { id: '30', home: 'ECU', away: 'CUW', date: '2026-06-24', time: '17:00', stage: 'Group E' },
  // Group F
  { id: '31', home: 'NED', away: 'JPN', date: '2026-06-14', time: '20:00', stage: 'Group F' },
  { id: '32', home: 'TUN', away: 'TBD', date: '2026-06-15', time: '14:00', stage: 'Group F' },
  { id: '33', home: 'JPN', away: 'TUN', date: '2026-06-19', time: '20:00', stage: 'Group F' },
  { id: '34', home: 'TBD', away: 'NED', date: '2026-06-20', time: '14:00', stage: 'Group F' },
  { id: '35', home: 'NED', away: 'TUN', date: '2026-06-24', time: '20:00', stage: 'Group F' },
  { id: '36', home: 'TBD', away: 'JPN', date: '2026-06-24', time: '20:00', stage: 'Group F' },
  // Group G
  { id: '37', home: 'BEL', away: 'EGY', date: '2026-06-15', time: '17:00', stage: 'Group G' },
  { id: '38', home: 'IRN', away: 'NZL', date: '2026-06-15', time: '20:00', stage: 'Group G' },
  { id: '39', home: 'EGY', away: 'IRN', date: '2026-06-20', time: '17:00', stage: 'Group G' },
  { id: '40', home: 'NZL', away: 'BEL', date: '2026-06-20', time: '20:00', stage: 'Group G' },
  { id: '41', home: 'BEL', away: 'IRN', date: '2026-06-25', time: '14:00', stage: 'Group G' },
  { id: '42', home: 'NZL', away: 'EGY', date: '2026-06-25', time: '14:00', stage: 'Group G' },
  // Group H
  { id: '43', home: 'ESP', away: 'CPV', date: '2026-06-16', time: '14:00', stage: 'Group H' },
  { id: '44', home: 'KSA', away: 'URU', date: '2026-06-16', time: '17:00', stage: 'Group H' },
  { id: '45', home: 'URU', away: 'ESP', date: '2026-06-21', time: '14:00', stage: 'Group H' },
  { id: '46', home: 'CPV', away: 'KSA', date: '2026-06-21', time: '17:00', stage: 'Group H' },
  { id: '47', home: 'ESP', away: 'KSA', date: '2026-06-26', time: '14:00', stage: 'Group H' },
  { id: '48', home: 'URU', away: 'CPV', date: '2026-06-26', time: '14:00', stage: 'Group H' },
  // Group I
  { id: '49', home: 'FRA', away: 'SEN', date: '2026-06-16', time: '20:00', stage: 'Group I' },
  { id: '50', home: 'NOR', away: 'TBD', date: '2026-06-17', time: '14:00', stage: 'Group I' },
  { id: '51', home: 'SEN', away: 'NOR', date: '2026-06-21', time: '20:00', stage: 'Group I' },
  { id: '52', home: 'TBD', away: 'FRA', date: '2026-06-22', time: '14:00', stage: 'Group I' },
  { id: '53', home: 'FRA', away: 'NOR', date: '2026-06-26', time: '20:00', stage: 'Group I' },
  { id: '54', home: 'TBD', away: 'SEN', date: '2026-06-26', time: '20:00', stage: 'Group I' },
  // Group J
  { id: '55', home: 'ARG', away: 'ALG', date: '2026-06-17', time: '17:00', stage: 'Group J' },
  { id: '56', home: 'AUT', away: 'JOR', date: '2026-06-17', time: '20:00', stage: 'Group J' },
  { id: '57', home: 'ALG', away: 'AUT', date: '2026-06-22', time: '14:00', stage: 'Group J' },
  { id: '58', home: 'ARG', away: 'JOR', date: '2026-06-22', time: '17:00', stage: 'Group J' },
  { id: '59', home: 'JOR', away: 'ALG', date: '2026-06-27', time: '14:00', stage: 'Group J' },
  { id: '60', home: 'AUT', away: 'ARG', date: '2026-06-27', time: '14:00', stage: 'Group J' },
  // Group K
  { id: '61', home: 'POR', away: 'UZB', date: '2026-06-18', time: '14:00', stage: 'Group K' },
  { id: '62', home: 'COL', away: 'TBD', date: '2026-06-18', time: '17:00', stage: 'Group K' },
  { id: '63', home: 'UZB', away: 'COL', date: '2026-06-23', time: '14:00', stage: 'Group K' },
  { id: '64', home: 'TBD', away: 'POR', date: '2026-06-23', time: '17:00', stage: 'Group K' },
  { id: '65', home: 'POR', away: 'COL', date: '2026-06-28', time: '17:00', stage: 'Group K' },
  { id: '66', home: 'TBD', away: 'UZB', date: '2026-06-28', time: '17:00', stage: 'Group K' },
  // Group L
  { id: '67', home: 'ENG', away: 'CRO', date: '2026-06-18', time: '20:00', stage: 'Group L' },
  { id: '68', home: 'GHA', away: 'PAN', date: '2026-06-19', time: '14:00', stage: 'Group L' },
  { id: '69', home: 'CRO', away: 'GHA', date: '2026-06-23', time: '20:00', stage: 'Group L' },
  { id: '70', home: 'PAN', away: 'ENG', date: '2026-06-24', time: '14:00', stage: 'Group L' },
  { id: '71', home: 'ENG', away: 'GHA', date: '2026-06-28', time: '20:00', stage: 'Group L' },
  { id: '72', home: 'CRO', away: 'PAN', date: '2026-06-28', time: '20:00', stage: 'Group L' },
];

// Nation names for display
const NATION_NAMES: Record<string, string> = {
  'MEX': 'Mexico', 'RSA': 'South Africa', 'KOR': 'Korea Republic',
  'CAN': 'Canada', 'QAT': 'Qatar', 'SUI': 'Switzerland',
  'BRA': 'Brazil', 'MAR': 'Morocco', 'HAI': 'Haiti', 'SCO': 'Scotland',
  'USA': 'USA', 'PAR': 'Paraguay', 'AUS': 'Australia',
  'GER': 'Germany', 'CUW': 'Curaçao', 'CIV': 'Ivory Coast', 'ECU': 'Ecuador',
  'NED': 'Netherlands', 'JPN': 'Japan', 'TUN': 'Tunisia',
  'BEL': 'Belgium', 'EGY': 'Egypt', 'IRN': 'Iran', 'NZL': 'New Zealand',
  'ESP': 'Spain', 'CPV': 'Cabo Verde', 'KSA': 'Saudi Arabia', 'URU': 'Uruguay',
  'FRA': 'France', 'SEN': 'Senegal', 'NOR': 'Norway',
  'ARG': 'Argentina', 'ALG': 'Algeria', 'JOR': 'Jordan', 'AUT': 'Austria',
  'POR': 'Portugal', 'UZB': 'Uzbekistan', 'COL': 'Colombia',
  'ENG': 'England', 'CRO': 'Croatia', 'GHA': 'Ghana', 'PAN': 'Panama',
  'TBD': 'TBD',
};

// Get fixtures for a nation
function getNationFixtures(nationCode: string): Fixture[] {
  return WORLD_CUP_FIXTURES.filter(f => f.home === nationCode || f.away === nationCode)
    .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());
}

// Get next opponent for a nation (first upcoming unplayed game)
function getNextOpponent(nationCode: string): string {
  const now = new Date();
  const fixtures = getNationFixtures(nationCode);
  
  // Find the next unplayed game
  const nextFixture = fixtures.find(f => {
    const fixtureDate = new Date(`${f.date}T${f.time}`);
    return fixtureDate > now && !f.isPlayed;
  });
  
  if (!nextFixture) {
    // If no upcoming games, show last opponent or dash
    const lastFixture = fixtures[fixtures.length - 1];
    if (lastFixture) {
      const opponent = lastFixture.home === nationCode ? lastFixture.away : lastFixture.home;
      return opponent;
    }
    return '-';
  }
  
  const opponent = nextFixture.home === nationCode ? nextFixture.away : nextFixture.home;
  return opponent;
}

// Format fixture date for display
function formatFixtureDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Position limits
const POSITION_LIMITS: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const MAX_PER_NATION = 3;

export default function SquadPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'loading' | 'builder' | 'view'>('loading');
  
  // All available players (for builder)
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  
  // Squad state
  const [squad, setSquad] = useState<Player[]>([]);
  const [startingXI, setStartingXI] = useState<Player[]>([]);
  const [bench, setBench] = useState<Player[]>([]);
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [viceCaptainId, setViceCaptainId] = useState<string | null>(null);
  const [bankBalance, setBankBalance] = useState(100);
  const [teamValue, setTeamValue] = useState(0);
  const [formation, setFormation] = useState('4-4-2');
  
  // Builder state
  const [showModal, setShowModal] = useState(false);
  const [selectingPosition, setSelectingPosition] = useState<Position | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'price' | 'name'>('price');

  // View mode state
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerToSub, setPlayerToSub] = useState<Player | null>(null);

  // Prevent body scroll when modal is open and lock scroll position
  useEffect(() => {
    if (selectedPlayer) {
      // Save current scroll position
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    } else {
      // Restore scroll position
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    return () => {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    };
  }, [selectedPlayer]);

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch all players for builder
        const playersRes = await fetch('/api/players');
        if (playersRes.ok) {
          const data = await playersRes.json();
          const players = Array.isArray(data) ? data : (data.players || []);
          setAllPlayers(players);
        }
        
        // Fetch existing squad
        const squadRes = await fetch('/api/squad/get', { credentials: 'include' });
        if (squadRes.ok) {
          const squadData = await squadRes.json();
          
          if (squadData.squad && squadData.squad.length === 15) {
            // User has complete squad - VIEW mode
            setBankBalance(squadData.bankBalance || 0);
            setTeamValue(squadData.teamValue || 0);
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const players: Player[] = squadData.squad.map((sp: any) => ({
              id: sp.player.id,
              displayName: sp.player.displayName,
              position: sp.player.position,
              currentPrice: sp.purchasePrice || sp.player.currentPrice,
              shirtNumber: sp.player.shirtNumber,
              nation: sp.player.nation,
              isStarting: sp.isStarting,
              isCaptain: sp.isCaptain,
              isViceCaptain: sp.isViceCaptain,
              points: sp.points || 0,
              stats: sp.stats || {
                goals: 0,
                assists: 0,
                passAccuracy: 0,
                interceptions: 0,
                tackles: 0,
                dribbles: 0,
              },
            }));
            
            setSquad(players);
            const starting = players.filter(p => p.isStarting);
            setStartingXI(starting);
            setBench(players.filter(p => !p.isStarting));
            
            // Set formation based on starting XI
            const defs = starting.filter(p => p.position === 'DEF').length;
            const mids = starting.filter(p => p.position === 'MID').length;
            const fwds = starting.filter(p => p.position === 'FWD').length;
            setFormation(`${defs}-${mids}-${fwds}`);
            
            const captain = players.find(p => p.isCaptain);
            const vice = players.find(p => p.isViceCaptain);
            if (captain) setCaptainId(captain.id);
            if (vice) setViceCaptainId(vice.id);
            
            setMode('view');
          } else if (squadData.squad && squadData.squad.length > 0) {
            // Partial squad - BUILDER mode with existing players
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const players: Player[] = squadData.squad.map((sp: any) => ({
              id: sp.player.id,
              displayName: sp.player.displayName,
              position: sp.player.position,
              currentPrice: sp.purchasePrice || sp.player.currentPrice,
              shirtNumber: sp.player.shirtNumber,
              nation: sp.player.nation,
            }));
            setSquad(players);
            setBankBalance(squadData.bankBalance || 100);
            setMode('builder');
          } else {
            // No squad - BUILDER mode
            setMode('builder');
          }
        } else {
          setMode('builder');
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setMode('builder');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Calculate squad stats
  const squadValue = useMemo(() => squad.reduce((sum, p) => sum + p.currentPrice, 0), [squad]);
  const remainingBudget = useMemo(() => 100 - squadValue, [squadValue]);
  
  const positionCounts = useMemo(() => {
    const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    squad.forEach(p => counts[p.position as Position]++);
    return counts;
  }, [squad]);

  const nationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    squad.forEach(p => {
      counts[p.nation?.id || ''] = (counts[p.nation?.id || ''] || 0) + 1;
    });
    return counts;
  }, [squad]);

  // Filter available players for modal
  const availablePlayers = useMemo(() => {
    if (!selectingPosition) return [];
    
    const squadIds = new Set(squad.map(p => p.id));
    
    return allPlayers
      .filter(p => {
        if (squadIds.has(p.id)) return false;
        if (p.position !== selectingPosition) return false;
        if (p.currentPrice > remainingBudget) return false;
        if ((nationCounts[p.nation?.id || ''] || 0) >= MAX_PER_NATION) return false;
        if (searchTerm && !p.displayName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => sortBy === 'price' ? b.currentPrice - a.currentPrice : a.displayName.localeCompare(b.displayName));
  }, [allPlayers, squad, selectingPosition, remainingBudget, nationCounts, searchTerm, sortBy]);

  // Add player to squad
  const addPlayer = (player: Player) => {
    setSquad(prev => [...prev, player]);
    setShowModal(false);
    setSelectingPosition(null);
    setSearchTerm('');
  };

  // Remove player from squad
  const removePlayer = (playerId: string) => {
    setSquad(prev => prev.filter(p => p.id !== playerId));
  };

  // Open modal for position
  const openModal = (position: Position) => {
    if (positionCounts[position] < POSITION_LIMITS[position]) {
      setSelectingPosition(position);
      setShowModal(true);
    }
  };

  // Save initial squad
  const saveSquad = async () => {
    if (squad.length !== 15) {
      alert('Please select all 15 players');
      return;
    }
    
    setSaving(true);
    try {
      // Auto-select starting 11 (4-4-2)
      const gks = squad.filter(p => p.position === 'GK');
      const defs = squad.filter(p => p.position === 'DEF');
      const mids = squad.filter(p => p.position === 'MID');
      const fwds = squad.filter(p => p.position === 'FWD');
      
      const starting: Player[] = [
        gks[0], // 1 GK
        ...defs.slice(0, 4), // 4 DEF
        ...mids.slice(0, 4), // 4 MID
        ...fwds.slice(0, 2), // 2 FWD
      ];
      
      const benchPlayers = squad.filter(p => !starting.includes(p));
      
      // Captain = highest priced, Vice = second highest
      const sortedByPrice = [...starting].sort((a, b) => b.currentPrice - a.currentPrice);
      const captain = sortedByPrice[0];
      const vice = sortedByPrice[1];
      
      const res = await fetch('/api/squad/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          players: squad.map(p => ({ playerId: p.id, purchasePrice: p.currentPrice })),
          startingXI: starting.map(p => p.id),
          bench: benchPlayers.map(p => p.id),
          captainId: captain.id,
          viceCaptainId: vice.id,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to save');
        return;
      }
      
      // Refresh to view mode
      window.location.reload();
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save squad');
    } finally {
      setSaving(false);
    }
  };

  // Swap player between starting/bench (view mode)
  const swapPlayer = (player: Player) => {
    if (!playerToSub) {
      setPlayerToSub(player);
      return;
    }

    // Try to swap playerToSub with player
    const p1 = playerToSub;
    const p2 = player;

    // Can't swap if they are both starting or both on bench
    if (p1.isStarting === p2.isStarting) {
      setPlayerToSub(p2); // Just switch focus
      return;
    }

    // Determine who is coming OUT and who is coming IN
    const playerOut = p1.isStarting ? p1 : p2;
    const playerIn = p1.isStarting ? p2 : p1;

    // Check formation rules
    const currentStarting = [...startingXI];
    const nextStarting = currentStarting.map(p => p.id === playerOut.id ? { ...playerIn, isStarting: true } : p);
    
    // Position counts in potential new formation
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    nextStarting.forEach(p => counts[p.position as Position]++);

    // Formation Rules
    const isValid = 
      counts.GK === 1 &&
      counts.DEF >= 3 && counts.DEF <= 5 &&
      counts.MID >= 2 && counts.MID <= 5 &&
      counts.FWD >= 1 && counts.FWD <= 3;

    if (!isValid) {
      alert(`Invalid formation! A valid squad needs:\n- 1 Goalkeeper\n- 3-5 Defenders\n- 2-5 Midfielders\n- 1-3 Forwards`);
      setPlayerToSub(null);
      return;
    }

    // Apply the swap
    setStartingXI(nextStarting);
    setBench(prev => prev.map(p => p.id === playerIn.id ? { ...playerOut, isStarting: false } : p));
    setPlayerToSub(null);
    setSelectedPlayer(null);

    // Update formation string
    setFormation(`${counts.DEF}-${counts.MID}-${counts.FWD}`);
  };

  const setCaptain = (playerId: string) => {
    if (viceCaptainId === playerId) setViceCaptainId(null);
    setCaptainId(playerId);
  };

  const setViceCaptain = (playerId: string) => {
    if (captainId === playerId) setCaptainId(null);
    setViceCaptainId(playerId);
  };

  // Save squad changes (view mode)
  const saveChanges = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/squad/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          startingXI: startingXI.map(p => p.id),
          bench: bench.map(p => p.id),
          captainId,
          viceCaptainId,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to save');
        return;
      }
      
      alert('Squad saved!');
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading || mode === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/60">Loading...</div>
      </div>
    );
  }

  // ============================================
  // BUILDER MODE
  // ============================================
  if (mode === 'builder') {
    const gks = squad.filter(p => p.position === 'GK');
    const defs = squad.filter(p => p.position === 'DEF');
    const mids = squad.filter(p => p.position === 'MID');
    const fwds = squad.filter(p => p.position === 'FWD');

    return (
      <div className="max-w-5xl mx-auto px-0 sm:px-4 py-6" style={{ overflowX: 'auto', overflowY: 'visible', width: '100%' }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Build Your Squad</h1>
            <p className="text-white/60">Select 15 players within your £100m budget</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-center">
              <p className="text-[10px] text-white/40 uppercase">Players</p>
              <p className="text-lg font-bold text-white">{squad.length}/15</p>
            </div>
            <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-center">
              <p className="text-[10px] text-white/40 uppercase">Budget</p>
              <p className={`text-lg font-bold ${remainingBudget >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                £{remainingBudget.toFixed(1)}m
              </p>
            </div>
          </div>
        </div>

        {/* Pitch */}
        <div className="relative bg-gradient-to-b from-green-700 via-green-600 to-green-700 rounded-2xl p-1 sm:p-6 mb-6 overflow-x-auto" style={{ overflowY: 'visible' }}>
          {/* Pitch markings */}
          <div className="absolute inset-0 opacity-20 rounded-2xl">
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border border-white rounded-full" />
          </div>

          <div className="relative z-10 space-y-3 sm:space-y-5 min-w-max sm:min-w-0" style={{ overflow: 'visible' }}>
            {/* FWD row */}
            <div className="flex justify-center gap-0.5 sm:gap-6 overflow-x-auto pb-3 scrollbar-hide" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 'max-content' }}>
              {[...Array(3)].map((_, i) => (
                fwds[i] ? (
                  <div key={fwds[i].id} className="group cursor-pointer flex-shrink-0" onClick={() => removePlayer(fwds[i].id)}>
                    <PlayerCard player={fwds[i]} showOpponent={getNextOpponent(fwds[i].nation?.code || '')} size="xs" />
                  </div>
                ) : (
                  <div key={`fwd-${i}`} className="flex-shrink-0">
                    <EmptySlot position="FWD" onClick={() => openModal('FWD')} />
                  </div>
                )
              ))}
            </div>

            {/* MID row */}
            <div className="flex justify-center gap-0.5 sm:gap-4 overflow-x-auto pb-3 scrollbar-hide" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 'max-content' }}>
              {[...Array(5)].map((_, i) => (
                mids[i] ? (
                  <div key={mids[i].id} className="group cursor-pointer flex-shrink-0" onClick={() => removePlayer(mids[i].id)}>
                    <PlayerCard player={mids[i]} showOpponent={getNextOpponent(mids[i].nation?.code || '')} size="xs" />
                  </div>
                ) : (
                  <div key={`mid-${i}`} className="flex-shrink-0">
                    <EmptySlot position="MID" onClick={() => openModal('MID')} />
                  </div>
                )
              ))}
            </div>

            {/* DEF row */}
            <div className="flex justify-center gap-0.5 sm:gap-4 overflow-x-auto pb-3 scrollbar-hide" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 'max-content' }}>
              {[...Array(5)].map((_, i) => (
                defs[i] ? (
                  <div key={defs[i].id} className="group cursor-pointer flex-shrink-0" onClick={() => removePlayer(defs[i].id)}>
                    <PlayerCard player={defs[i]} showOpponent={getNextOpponent(defs[i].nation?.code || '')} size="xs" />
                  </div>
                ) : (
                  <div key={`def-${i}`} className="flex-shrink-0">
                    <EmptySlot position="DEF" onClick={() => openModal('DEF')} />
                  </div>
                )
              ))}
            </div>

            {/* GK row */}
            <div className="flex justify-center gap-1 sm:gap-6 overflow-x-auto pb-3 scrollbar-hide" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 'max-content' }}>
              {[...Array(2)].map((_, i) => (
                gks[i] ? (
                  <div key={gks[i].id} className="group cursor-pointer flex-shrink-0" onClick={() => removePlayer(gks[i].id)}>
                    <PlayerCard player={gks[i]} showOpponent={getNextOpponent(gks[i].nation?.code || '')} size="xs" />
                  </div>
                ) : (
                  <div key={`gk-${i}`} className="flex-shrink-0">
                    <EmptySlot position="GK" onClick={() => openModal('GK')} />
                  </div>
                )
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSquad([])}
            className="px-4 py-2 text-white/60 hover:text-white transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={saveSquad}
            disabled={saving || squad.length !== 15 || remainingBudget < 0}
            className="px-8 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-bold hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving ? 'Saving...' : 'Save Squad'}
          </button>
        </div>

        {/* Player Selection Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Select {selectingPosition}</h2>
                <button onClick={() => { setShowModal(false); setSelectingPosition(null); }} className="text-white/60 hover:text-white">
                  ✕
                </button>
              </div>
              
              {/* Filters */}
              <div className="p-4 border-b border-white/10 flex gap-3">
                <input
                  type="text"
                  placeholder="Search players..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40"
                />
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as 'price' | 'name')}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white"
                >
                  <option value="price">By Price</option>
                  <option value="name">By Name</option>
                </select>
              </div>
              
              {/* Player List */}
              <div className="max-h-[50vh] overflow-y-auto">
                {availablePlayers.length === 0 ? (
                  <div className="p-8 text-center text-white/40">No players available</div>
                ) : (
                  availablePlayers.slice(0, 50).map(player => (
                    <button
                      key={player.id}
                      onClick={() => addPlayer(player)}
                      className="w-full p-4 flex items-center gap-4 hover:bg-white/5 border-b border-white/5 text-left"
                    >
                      <Kit
                        primaryColor={player.nation?.kitColor1 || '#FFF'}
                        secondaryColor={player.nation?.kitColor2 || '#000'}
                        number={player.shirtNumber}
                        nationCode={player.nation?.code || ''}
                        size="sm"
                      />
                      <img src={getFlagUrl(player.nation?.code || '')} alt="" className="w-6 h-4 rounded-sm object-cover" />
                      <div className="flex-1">
                        <p className="text-white font-medium">{player.displayName}</p>
                        <p className="text-white/40 text-sm">{player.nation?.name}</p>
                      </div>
                      <p className="text-emerald-400 font-bold">£{player.currentPrice.toFixed(1)}m</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // VIEW MODE (Starting 11 + Bench)
  // ============================================
  
  // All formations - we'll filter based on available players
  const ALL_FORMATIONS = [
    '4-4-2', '4-3-3', '4-5-1', '4-4-1-1', '4-2-3-1', '4-3-2-1', '4-1-2-3', '4-1-4-1', '4-2-2-2', '4-1-3-2',
    '3-5-2', '3-4-3', '3-4-2-1', '3-5-1-1', '3-4-1-2',
    '5-3-2', '5-4-1', '5-2-2-1', '5-3-1-1',
  ];
  
  // Parse formation to get DEF-MID-FWD counts
  const parseFormation = (f: string): { def: number; mid: number; fwd: number } => {
    const parts = f.split('-').map(Number);
    const def = parts[0];
    const fwd = parts[parts.length - 1];
    const mid = 10 - def - fwd;
    return { def, mid, fwd };
  };
  
  // Count available players by position (all 15 in squad)
  const allSquadPlayers = [...startingXI, ...bench];
  const availableGKs = allSquadPlayers.filter(p => p.position === 'GK').length;
  const availableDEFs = allSquadPlayers.filter(p => p.position === 'DEF').length;
  const availableMIDs = allSquadPlayers.filter(p => p.position === 'MID').length;
  const availableFWDs = allSquadPlayers.filter(p => p.position === 'FWD').length;
  
  // Filter formations that are possible with current squad
  const validFormations = ALL_FORMATIONS.filter(f => {
    const { def, mid, fwd } = parseFormation(f);
    return def <= availableDEFs && mid <= availableMIDs && fwd <= availableFWDs;
  });
  
  // Change formation
  const changeFormation = (newFormation: string) => {
    const { def, mid, fwd } = parseFormation(newFormation);
    
    const gkPlayers = allSquadPlayers.filter(p => p.position === 'GK');
    const defPlayers = allSquadPlayers.filter(p => p.position === 'DEF');
    const midPlayers = allSquadPlayers.filter(p => p.position === 'MID');
    const fwdPlayers = allSquadPlayers.filter(p => p.position === 'FWD');
    
    // Build new starting 11
    const newStarting: Player[] = [
      gkPlayers[0],
      ...defPlayers.slice(0, def),
      ...midPlayers.slice(0, mid),
      ...fwdPlayers.slice(0, fwd),
    ].filter(Boolean);
    
    // Everyone else goes to bench
    const startingIds = new Set(newStarting.map(p => p.id));
    const newBench = allSquadPlayers.filter(p => !startingIds.has(p.id));
    
    setStartingXI(newStarting.map(p => ({ ...p, isStarting: true })));
    setBench(newBench.map(p => ({ ...p, isStarting: false })));
    setFormation(newFormation);
  };
  
  // Current players on pitch by position
  const gks = startingXI.filter(p => p.position === 'GK');
  const defs = startingXI.filter(p => p.position === 'DEF');
  const mids = startingXI.filter(p => p.position === 'MID');
  const fwds = startingXI.filter(p => p.position === 'FWD');

  return (
    <div className="max-w-5xl mx-auto px-0 sm:px-4 py-6" style={{ overflowX: 'auto', overflowY: 'visible', width: '100%' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">My Squad</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-white/40 text-sm">Formation:</span>
            <select
              value={formation}
              onChange={(e) => changeFormation(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-3 py-1 text-white text-sm font-bold cursor-pointer hover:bg-white/20 transition-colors"
            >
              {validFormations.map(f => (
                <option key={f} value={f} className="bg-slate-900">{f}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-center">
            <p className="text-[10px] text-white/40 uppercase">Value</p>
            <p className="text-lg font-bold text-white">£{teamValue.toFixed(1)}m</p>
          </div>
          <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-center">
            <p className="text-[10px] text-white/40 uppercase">Bank</p>
            <p className="text-lg font-bold text-emerald-400">£{bankBalance.toFixed(1)}m</p>
          </div>
        </div>
      </div>

      {/* Pitch */}
      <div className="relative bg-gradient-to-b from-green-700 via-green-600 to-green-700 rounded-2xl p-1 sm:p-6 mb-6 overflow-x-auto" style={{ overflowY: 'visible' }}>
        <div className="absolute inset-0 opacity-20 rounded-2xl">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border border-white rounded-full" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-14 border-t border-l border-r border-white" />
        </div>

        <div className="relative z-10 space-y-3 sm:space-y-5 min-w-max sm:min-w-0" style={{ overflow: 'visible' }}>
          {/* FWD */}
          <div className="flex justify-center gap-0.5 sm:gap-6 overflow-x-auto pb-3 scrollbar-hide" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 'max-content' }}>
            {fwds.map(p => (
              <div key={p.id} className="flex-shrink-0">
                <PlayerCard
                  player={p}
                  onClick={() => setSelectedPlayer(p)}
                  showOpponent={getNextOpponent(p.nation?.code || '')}
                  isCaptain={captainId === p.id}
                  isViceCaptain={viceCaptainId === p.id}
                  size="xs"
                />
              </div>
            ))}
          </div>

          {/* MID */}
          <div className="flex justify-center gap-0.5 sm:gap-4 overflow-x-auto pb-3 scrollbar-hide" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 'max-content' }}>
            {mids.map(p => (
              <div key={p.id} className="flex-shrink-0">
                <PlayerCard
                  player={p}
                  onClick={() => setSelectedPlayer(p)}
                  showOpponent={getNextOpponent(p.nation?.code || '')}
                  isCaptain={captainId === p.id}
                  isViceCaptain={viceCaptainId === p.id}
                  size="xs"
                />
              </div>
            ))}
          </div>

          {/* DEF */}
          <div className="flex justify-center gap-0.5 sm:gap-4 overflow-x-auto pb-3 scrollbar-hide" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 'max-content' }}>
            {defs.map(p => (
              <div key={p.id} className="flex-shrink-0">
                <PlayerCard
                  player={p}
                  onClick={() => setSelectedPlayer(p)}
                  showOpponent={getNextOpponent(p.nation?.code || '')}
                  isCaptain={captainId === p.id}
                  isViceCaptain={viceCaptainId === p.id}
                  size="xs"
                />
              </div>
            ))}
          </div>

          {/* GK */}
          <div className="flex justify-center gap-1 sm:gap-6 overflow-x-auto pb-3 scrollbar-hide" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 'max-content' }}>
            {gks.map(p => (
              <div key={p.id} className="flex-shrink-0">
                <PlayerCard
                  player={p}
                  onClick={() => setSelectedPlayer(p)}
                  showOpponent={getNextOpponent(p.nation?.code || '')}
                  isCaptain={captainId === p.id}
                  isViceCaptain={viceCaptainId === p.id}
                  size="xs"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bench */}
      <div className="bg-slate-900/50 rounded-2xl border border-white/10 p-3 sm:p-4 mb-6">
        <h2 className="text-base sm:text-lg font-bold text-white mb-3 sm:mb-4">Substitutes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          {bench.map((p, i) => (
            <div
              key={p.id}
              onClick={() => setSelectedPlayer(p)}
              className="flex items-center gap-3 p-3 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-colors"
            >
              <div className="text-white/40 font-bold">{i + 1}</div>
              <Kit
                primaryColor={p.nation?.kitColor1 || '#FFF'}
                secondaryColor={p.nation?.kitColor2 || '#000'}
                number={p.shirtNumber}
                nationCode={p.nation?.code || ''}
                size="xs"
              />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{p.displayName}</p>
                <p className="text-white/40 text-xs">{p.position}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-white/40 text-sm">Click players to manage your team</p>
        <button
          onClick={saveChanges}
          disabled={saving}
          className="px-8 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-bold hover:from-pink-600 hover:to-rose-600 disabled:opacity-50 transition-all"
        >
          {saving ? 'Saving...' : 'Save Squad'}
        </button>
      </div>

      {/* Player Detail Modal - Compact Card */}
      {selectedPlayer && (
        <div 
          className="fixed inset-0 bg-black/80 z-[9999] backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedPlayer(null);
          }}
          style={{ 
            position: 'fixed', 
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            overflow: 'hidden'
          }}
        >
          <div 
            className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Compact Header with X button */}
            <div className="relative bg-gradient-to-br from-green-600 to-green-800 p-4 rounded-t-2xl">
              <button 
                onClick={() => setSelectedPlayer(null)}
                className="absolute top-3 right-3 text-white bg-black/80 hover:bg-black p-2 rounded-full transition-all touch-manipulation shadow-lg"
                style={{ 
                  minWidth: '36px', 
                  minHeight: '36px',
                  WebkitTapHighlightColor: 'transparent'
                }}
              >
                <span className="text-xl font-bold leading-none block">✕</span>
              </button>
              
              <div className="flex items-center gap-3 pr-10">
                <Kit
                  primaryColor={selectedPlayer.nation?.kitColor1 || '#FFF'}
                  secondaryColor={selectedPlayer.nation?.kitColor2 || '#000'}
                  number={selectedPlayer.shirtNumber}
                  nationCode={selectedPlayer.nation?.code || ''}
                  size="xs"
                  isCaptain={captainId === selectedPlayer.id}
                  isViceCaptain={viceCaptainId === selectedPlayer.id}
                />
                <div className="text-white flex-1">
                  <h2 className="text-lg font-bold leading-tight">{selectedPlayer.displayName}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <img src={getFlagUrl(selectedPlayer.nation?.code || '')} alt="" className="w-4 h-3 rounded-sm object-cover" />
                    <span className="text-white/70 text-xs font-medium">{selectedPlayer.nation?.name}</span>
                    <span className="text-white/30">•</span>
                    <span className="text-white/70 text-xs font-medium">{selectedPlayer.position}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Compact Content */}
            <div className="p-4 space-y-4">
              {/* Quick Actions */}
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => {
                    swapPlayer(selectedPlayer);
                    if (!playerToSub) setSelectedPlayer(null);
                  }}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all text-xs ${
                    playerToSub?.id === selectedPlayer.id
                      ? 'bg-amber-500/20 border-amber-500 text-amber-500'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <span className="text-sm mb-0.5">🔄</span>
                  <span className="text-[9px] font-bold">Sub</span>
                </button>

                <button
                  onClick={() => setCaptain(selectedPlayer.id)}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all text-xs ${
                    captainId === selectedPlayer.id
                      ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <span className="text-sm font-black mb-0.5">C</span>
                  <span className="text-[9px] font-bold">Capt</span>
                </button>

                <button
                  onClick={() => setViceCaptain(selectedPlayer.id)}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all text-xs ${
                    viceCaptainId === selectedPlayer.id
                      ? 'bg-gray-400/20 border-gray-400 text-gray-400'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <span className="text-sm font-black mb-0.5">V</span>
                  <span className="text-[9px] font-bold">V-Capt</span>
                </button>

                <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-white/5 border border-white/10 text-emerald-400">
                  <span className="text-sm font-bold mb-0.5">{selectedPlayer.points || 0}</span>
                  <span className="text-[9px] font-bold text-white/40">Points</span>
                </div>
              </div>

              {/* Sub Mode Hint */}
              {playerToSub && playerToSub.id !== selectedPlayer.id && (
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-center">
                  <p className="text-amber-500 text-xs font-medium">
                    Select player to swap with <span className="font-bold">{playerToSub.displayName}</span>
                  </p>
                  <button 
                    onClick={() => setPlayerToSub(null)}
                    className="mt-1 text-[10px] text-amber-500 underline"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* World Cup Stats */}
              <div>
                <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Stats</h3>
                <div className="grid grid-cols-3 gap-2">
                  <StatItem label="Goals" value={selectedPlayer.stats?.goals || 0} />
                  <StatItem label="Assists" value={selectedPlayer.stats?.assists || 0} />
                  <StatItem label="Pass %" value={selectedPlayer.stats?.passAccuracy ? `${selectedPlayer.stats.passAccuracy}%` : '0%'} />
                  <StatItem label="Inter" value={selectedPlayer.stats?.interceptions || 0} />
                  <StatItem label="Tackles" value={selectedPlayer.stats?.tackles || 0} />
                  <StatItem label="Dribbles" value={selectedPlayer.stats?.dribbles || 0} />
                </div>
              </div>

              {/* Upcoming Games */}
              <div>
                <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Fixtures</h3>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {getNationFixtures(selectedPlayer.nation?.code || '').map((fixture) => {
                    const isHome = fixture.home === selectedPlayer.nation?.code;
                    const opponent = isHome ? fixture.away : fixture.home;
                    const opponentName = NATION_NAMES[opponent] || opponent;
                    const fixtureDate = new Date(`${fixture.date}T${fixture.time}`);
                    const isPast = fixtureDate < new Date();
                    const isPlayed = fixture.isPlayed;
                    
                    return (
                      <div 
                        key={fixture.id} 
                        className={`flex items-center justify-between p-2 rounded-lg border ${
                          isPast ? 'bg-white/5 border-white/5' : 'bg-white/10 border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-medium ${isPast ? 'text-white/30' : 'text-white/60'}`}>
                            {formatFixtureDate(fixture.date)}
                          </span>
                          <span className={`text-xs ${isPast ? 'text-white/40' : 'text-white'}`}>
                            {isHome ? 'vs' : '@'} {opponentName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isPlayed ? (
                            <span className="text-xs font-bold text-emerald-400">
                              {fixture.homeScore}-{fixture.awayScore}
                            </span>
                          ) : isPast ? (
                            <span className="text-[10px] text-white/30">-</span>
                          ) : (
                            <span className="text-[10px] text-amber-400 font-medium">
                              {fixture.time.replace(':00', '')} EST
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {getNationFixtures(selectedPlayer.nation?.code || '').length === 0 && (
                    <div className="text-center text-white/30 text-xs py-2">No fixtures found</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/5 rounded-lg p-2 border border-white/5">
      <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  );
}
