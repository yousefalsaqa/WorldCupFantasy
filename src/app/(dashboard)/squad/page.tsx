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
}

type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

// Group Stage fixtures
const GROUP_FIXTURES: Record<string, string[]> = {
  'MEX': ['RSA', 'KOR'], 'RSA': ['MEX', 'KOR'], 'KOR': ['MEX', 'RSA'],
  'CAN': ['QAT', 'SUI'], 'QAT': ['CAN', 'SUI'], 'SUI': ['CAN', 'QAT'],
  'BRA': ['MAR', 'HAI', 'SCO'], 'MAR': ['BRA', 'HAI', 'SCO'], 'HAI': ['BRA', 'MAR', 'SCO'], 'SCO': ['BRA', 'MAR', 'HAI'],
  'USA': ['PAR', 'AUS'], 'PAR': ['USA', 'AUS'], 'AUS': ['USA', 'PAR'],
  'GER': ['CUW', 'CIV', 'ECU'], 'CUW': ['GER', 'CIV', 'ECU'], 'CIV': ['GER', 'CUW', 'ECU'], 'ECU': ['GER', 'CUW', 'CIV'],
  'NED': ['JPN', 'TUN'], 'JPN': ['NED', 'TUN'], 'TUN': ['NED', 'JPN'],
  'BEL': ['EGY', 'IRN', 'NZL'], 'EGY': ['BEL', 'IRN', 'NZL'], 'IRN': ['BEL', 'EGY', 'NZL'], 'NZL': ['BEL', 'EGY', 'IRN'],
  'ESP': ['CPV', 'KSA', 'URU'], 'CPV': ['ESP', 'KSA', 'URU'], 'KSA': ['ESP', 'CPV', 'URU'], 'URU': ['ESP', 'CPV', 'KSA'],
  'FRA': ['SEN', 'NOR'], 'SEN': ['FRA', 'NOR'], 'NOR': ['FRA', 'SEN'],
  'ARG': ['ALG', 'JOR'], 'ALG': ['ARG', 'JOR'], 'JOR': ['ARG', 'ALG'],
  'POR': ['UZB', 'COL'], 'UZB': ['POR', 'COL'], 'COL': ['POR', 'UZB'],
  'ENG': ['CRO', 'GHA', 'PAN'], 'CRO': ['ENG', 'GHA', 'PAN'], 'GHA': ['ENG', 'CRO', 'PAN'], 'PAN': ['ENG', 'CRO', 'GHA'],
};

function getNextOpponent(nationCode: string): string {
  return GROUP_FIXTURES[nationCode]?.[0] || '-';
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
      <div className="max-w-5xl mx-auto px-4 py-6">
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
        <div className="relative bg-gradient-to-b from-green-700 via-green-600 to-green-700 rounded-2xl p-6 mb-6 overflow-hidden">
          {/* Pitch markings */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border border-white rounded-full" />
          </div>

          <div className="relative z-10 space-y-4">
            {/* FWD row */}
            <div className="flex justify-center gap-3">
              {[...Array(3)].map((_, i) => (
                fwds[i] ? (
                  <div key={fwds[i].id} className="group cursor-pointer" onClick={() => removePlayer(fwds[i].id)}>
                    <PlayerCard player={fwds[i]} showOpponent={getNextOpponent(fwds[i].nation?.code || '')} />
                  </div>
                ) : (
                  <EmptySlot key={`fwd-${i}`} position="FWD" onClick={() => openModal('FWD')} />
                )
              ))}
            </div>

            {/* MID row */}
            <div className="flex justify-center gap-3">
              {[...Array(5)].map((_, i) => (
                mids[i] ? (
                  <div key={mids[i].id} className="group cursor-pointer" onClick={() => removePlayer(mids[i].id)}>
                    <PlayerCard player={mids[i]} showOpponent={getNextOpponent(mids[i].nation?.code || '')} />
                  </div>
                ) : (
                  <EmptySlot key={`mid-${i}`} position="MID" onClick={() => openModal('MID')} />
                )
              ))}
            </div>

            {/* DEF row */}
            <div className="flex justify-center gap-3">
              {[...Array(5)].map((_, i) => (
                defs[i] ? (
                  <div key={defs[i].id} className="group cursor-pointer" onClick={() => removePlayer(defs[i].id)}>
                    <PlayerCard player={defs[i]} showOpponent={getNextOpponent(defs[i].nation?.code || '')} />
                  </div>
                ) : (
                  <EmptySlot key={`def-${i}`} position="DEF" onClick={() => openModal('DEF')} />
                )
              ))}
            </div>

            {/* GK row */}
            <div className="flex justify-center gap-6">
              {[...Array(2)].map((_, i) => (
                gks[i] ? (
                  <div key={gks[i].id} className="group cursor-pointer" onClick={() => removePlayer(gks[i].id)}>
                    <PlayerCard player={gks[i]} showOpponent={getNextOpponent(gks[i].nation?.code || '')} />
                  </div>
                ) : (
                  <EmptySlot key={`gk-${i}`} position="GK" onClick={() => openModal('GK')} />
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
    <div className="max-w-5xl mx-auto px-4 py-6">
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
      <div className="relative bg-gradient-to-b from-green-700 via-green-600 to-green-700 rounded-2xl p-6 mb-6 overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border border-white rounded-full" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-14 border-t border-l border-r border-white" />
        </div>

        <div className="relative z-10 space-y-5">
          {/* FWD */}
          <div className="flex justify-center gap-6">
            {fwds.map(p => (
              <PlayerCard
                key={p.id}
                player={p}
                onClick={() => setSelectedPlayer(p)}
                showOpponent={getNextOpponent(p.nation?.code || '')}
                isCaptain={captainId === p.id}
                isViceCaptain={viceCaptainId === p.id}
              />
            ))}
          </div>

          {/* MID */}
          <div className="flex justify-center gap-4">
            {mids.map(p => (
              <PlayerCard
                key={p.id}
                player={p}
                onClick={() => setSelectedPlayer(p)}
                showOpponent={getNextOpponent(p.nation?.code || '')}
                isCaptain={captainId === p.id}
                isViceCaptain={viceCaptainId === p.id}
              />
            ))}
          </div>

          {/* DEF */}
          <div className="flex justify-center gap-4">
            {defs.map(p => (
              <PlayerCard
                key={p.id}
                player={p}
                onClick={() => setSelectedPlayer(p)}
                showOpponent={getNextOpponent(p.nation?.code || '')}
                isCaptain={captainId === p.id}
                isViceCaptain={viceCaptainId === p.id}
              />
            ))}
          </div>

          {/* GK */}
          <div className="flex justify-center">
            {gks.map(p => (
              <PlayerCard
                key={p.id}
                player={p}
                onClick={() => setSelectedPlayer(p)}
                showOpponent={getNextOpponent(p.nation?.code || '')}
                isCaptain={captainId === p.id}
                isViceCaptain={viceCaptainId === p.id}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bench */}
      <div className="bg-slate-900/50 rounded-2xl border border-white/10 p-4 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">Substitutes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

      {/* Player Detail Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="relative h-32 bg-gradient-to-br from-green-600 to-green-800 p-6 flex items-end">
              <button 
                onClick={() => setSelectedPlayer(null)}
                className="absolute top-4 right-4 text-white/60 hover:text-white bg-black/20 p-2 rounded-full backdrop-blur-md"
              >
                ✕
              </button>
              
              <div className="flex items-center gap-4">
                <Kit
                  primaryColor={selectedPlayer.nation?.kitColor1 || '#FFF'}
                  secondaryColor={selectedPlayer.nation?.kitColor2 || '#000'}
                  number={selectedPlayer.shirtNumber}
                  nationCode={selectedPlayer.nation?.code || ''}
                  size="md"
                  isCaptain={captainId === selectedPlayer.id}
                  isViceCaptain={viceCaptainId === selectedPlayer.id}
                />
                <div className="text-white">
                  <h2 className="text-2xl font-bold leading-tight">{selectedPlayer.displayName}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <img src={getFlagUrl(selectedPlayer.nation?.code || '')} alt="" className="w-5 h-3 rounded-sm object-cover" />
                    <span className="text-white/70 text-sm font-medium uppercase tracking-wider">{selectedPlayer.nation?.name}</span>
                    <span className="text-white/30">•</span>
                    <span className="text-white/70 text-sm font-medium">{selectedPlayer.position}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Quick Actions */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  onClick={() => {
                    swapPlayer(selectedPlayer);
                    if (!playerToSub) setSelectedPlayer(null); // Close if first step
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                    playerToSub?.id === selectedPlayer.id
                      ? 'bg-amber-500/20 border-amber-500 text-amber-500'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <span className="text-lg mb-1">{playerToSub?.id === selectedPlayer.id ? '🎯' : '🔄'}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    {playerToSub?.id === selectedPlayer.id ? 'Selecting...' : 'Substitute'}
                  </span>
                </button>

                <button
                  onClick={() => setCaptain(selectedPlayer.id)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                    captainId === selectedPlayer.id
                      ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <span className="text-lg font-black mb-1">C</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">Captain</span>
                </button>

                <button
                  onClick={() => setViceCaptain(selectedPlayer.id)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                    viceCaptainId === selectedPlayer.id
                      ? 'bg-gray-400/20 border-gray-400 text-gray-400'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <span className="text-lg font-black mb-1">V</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">Vice-Capt</span>
                </button>

                <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/5 border border-white/10 text-emerald-400">
                  <span className="text-lg font-bold mb-1">{selectedPlayer.points || 0}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Total Pts</span>
                </div>
              </div>

              {/* Sub Mode Hint */}
              {playerToSub && playerToSub.id !== selectedPlayer.id && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-center">
                  <p className="text-amber-500 text-sm font-medium">
                    Select a player to swap with <span className="font-bold">{playerToSub.displayName}</span>
                  </p>
                  <button 
                    onClick={() => setPlayerToSub(null)}
                    className="mt-2 text-xs text-amber-500 underline"
                  >
                    Cancel Substitution
                  </button>
                </div>
              )}

              {/* World Cup Stats */}
              <div>
                <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">World Cup 2026 Stats</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <StatItem label="Goals" value={Math.floor(Math.random() * 3)} />
                  <StatItem label="Assists" value={Math.floor(Math.random() * 2)} />
                  <StatItem label="Pass Accuracy" value={`${80 + Math.floor(Math.random() * 15)}%`} />
                  <StatItem label="Interceptions" value={Math.floor(Math.random() * 5)} />
                  <StatItem label="Tackles" value={Math.floor(Math.random() * 8)} />
                  <StatItem label="Dribbles" value={Math.floor(Math.random() * 10)} />
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
    <div className="bg-white/5 rounded-xl p-3 border border-white/5">
      <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );
}
