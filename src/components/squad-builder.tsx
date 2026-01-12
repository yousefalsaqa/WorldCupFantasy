'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  Search,
  X,
  ChevronDown,
  ArrowUpDown,
  Filter,
  Loader2,
  AlertCircle,
  Check,
  Plus,
  Minus,
  Star,
} from 'lucide-react';
import { cn, formatPrice, calculateSellPrice } from '@/lib/utils';
import { POSITION_LIMITS, MAX_PLAYERS_PER_CLUB, SQUAD_SIZE } from '@/lib/constants';
import { PlayerCard } from './player-card';
// import PitchView from './pitch-view'; // Commented out - interface mismatch, component not currently used

type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  position: Position;
  currentPrice: number;
  photoUrl: string | null;
  club: {
    id: string;
    name: string;
    shortName: string;
    badgeUrl: string | null;
  };
}

interface SquadPlayer {
  id: string;
  playerId: string;
  purchasePrice: number;
  isStarting: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  benchOrder: number | null;
  player: Player;
}

interface Club {
  id: string;
  name: string;
  shortName: string;
}

interface SquadBuilderProps {
  initialSquad: SquadPlayer[];
  initialBankBalance: number;
  initialTeamValue: number;
  allPlayers: Player[];
  clubs: Club[];
}

export function SquadBuilder({
  initialSquad,
  initialBankBalance,
  initialTeamValue,
  allPlayers,
  clubs,
}: SquadBuilderProps) {
  const router = useRouter();
  const [squad, setSquad] = useState<SquadPlayer[]>(initialSquad);
  const [bankBalance, setBankBalance] = useState(initialBankBalance);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Player selection modal
  const [isSelectingPlayer, setIsSelectingPlayer] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClub, setFilterClub] = useState<string>('');
  const [sortBy, setSortBy] = useState<'price' | 'name'>('price');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Calculate position counts
  const positionCounts = useMemo(() => {
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    squad.forEach(sp => counts[sp.player.position]++);
    return counts;
  }, [squad]);

  // Calculate club counts
  const clubCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    squad.forEach(sp => {
      counts[sp.player.club.id] = (counts[sp.player.club.id] || 0) + 1;
    });
    return counts;
  }, [squad]);

  // Filter and sort players
  const filteredPlayers = useMemo(() => {
    let filtered = allPlayers.filter(player => {
      // Exclude players already in squad
      if (squad.some(sp => sp.playerId === player.id)) return false;
      
      // Position filter
      if (selectedPosition && player.position !== selectedPosition) return false;
      
      // Club filter
      if (filterClub && player.club.id !== filterClub) return false;
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          player.displayName.toLowerCase().includes(query) ||
          player.club.name.toLowerCase().includes(query) ||
          player.club.shortName.toLowerCase().includes(query)
        );
      }
      
      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'price') {
        return sortOrder === 'asc' 
          ? a.currentPrice - b.currentPrice 
          : b.currentPrice - a.currentPrice;
      } else {
        return sortOrder === 'asc'
          ? a.displayName.localeCompare(b.displayName)
          : b.displayName.localeCompare(a.displayName);
      }
    });

    return filtered;
  }, [allPlayers, squad, selectedPosition, filterClub, searchQuery, sortBy, sortOrder]);

  // Check if player can be added
  const canAddPlayer = useCallback((player: Player) => {
    // Check budget
    if (player.currentPrice > bankBalance) return false;
    
    // Check position limit
    if (positionCounts[player.position] >= POSITION_LIMITS[player.position].total) return false;
    
    // Check club limit
    if ((clubCounts[player.club.id] || 0) >= MAX_PLAYERS_PER_CLUB) return false;
    
    // Check squad size
    if (squad.length >= SQUAD_SIZE) return false;
    
    return true;
  }, [bankBalance, positionCounts, clubCounts, squad.length]);

  // Add player to squad
  const addPlayer = async (player: Player) => {
    if (!canAddPlayer(player)) return;

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/squad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to add player');
        return;
      }

      // Update local state
      const newSquadPlayer: SquadPlayer = {
        id: `temp-${Date.now()}`,
        playerId: player.id,
        purchasePrice: player.currentPrice,
        isStarting: false,
        isCaptain: false,
        isViceCaptain: false,
        benchOrder: squad.length + 1,
        player,
      };

      setSquad(prev => [...prev, newSquadPlayer]);
      setBankBalance(prev => prev - player.currentPrice);
      
      // Close modal if position is now full
      if (selectedPosition && positionCounts[selectedPosition] + 1 >= POSITION_LIMITS[selectedPosition].total) {
        setIsSelectingPlayer(false);
        setSelectedPosition(null);
      }

      router.refresh();
    } catch {
      setError('Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  // Remove player from squad
  const removePlayer = async (playerId: string) => {
    const squadPlayer = squad.find(sp => sp.playerId === playerId);
    if (!squadPlayer) return;

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/squad', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to remove player');
        return;
      }

      // Update local state
      setSquad(prev => prev.filter(sp => sp.playerId !== playerId));
      setBankBalance(prev => prev + squadPlayer.purchasePrice);

      router.refresh();
    } catch {
      setError('Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  // Open player selection for a position
  const openPlayerSelection = (position: Position) => {
    setSelectedPosition(position);
    setIsSelectingPlayer(true);
    setSearchQuery('');
    setFilterClub('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-laliga-cream mb-2">
            SQUAD SELECTION
          </h1>
          <p className="text-surface-400">
            Build your dream La Liga squad of 15 players
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4">
          <div className="px-4 py-2 rounded-lg bg-surface-800 border border-surface-700">
            <p className="text-xs text-surface-400">Budget</p>
            <p className="text-lg font-bold text-laliga-gold">{formatPrice(bankBalance)}</p>
          </div>
          <div className="px-4 py-2 rounded-lg bg-surface-800 border border-surface-700">
            <p className="text-xs text-surface-400">Squad</p>
            <p className="text-lg font-bold text-laliga-cream">{squad.length}/{SQUAD_SIZE}</p>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-lg bg-laliga-red/10 border border-laliga-red/20">
          <AlertCircle className="w-5 h-5 text-laliga-red flex-shrink-0" />
          <p className="text-sm text-laliga-red">{error}</p>
          <button onClick={() => setError('')} className="ml-auto">
            <X className="w-4 h-4 text-laliga-red" />
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Pitch View */}
        <div className="lg:col-span-2">
          {/* PitchView temporarily disabled - interface mismatch */}
          <div className="bg-gradient-to-b from-[#2d8a4e] to-[#1e6b3a] rounded-lg p-8 text-center text-white/60">
            <p>Squad Builder - Pitch View (Coming Soon)</p>
          </div>
        </div>

        {/* Squad List */}
        <div>
          <div className="card">
            <div className="p-4 border-b border-surface-800">
              <h2 className="font-semibold text-laliga-cream">Squad List</h2>
            </div>
            
            {/* Position Breakdown */}
            <div className="p-4 border-b border-surface-800">
              <div className="grid grid-cols-4 gap-2">
                {(['GK', 'DEF', 'MID', 'FWD'] as Position[]).map(pos => (
                  <button
                    key={pos}
                    onClick={() => openPlayerSelection(pos)}
                    disabled={positionCounts[pos] >= POSITION_LIMITS[pos].total}
                    className={cn(
                      'p-3 rounded-lg text-center transition-all',
                      positionCounts[pos] >= POSITION_LIMITS[pos].total
                        ? 'bg-surface-800/50 opacity-50'
                        : 'bg-surface-800 hover:bg-surface-700 cursor-pointer'
                    )}
                  >
                    <span className={cn(
                      'text-xs font-bold px-2 py-0.5 rounded',
                      pos === 'GK' && 'bg-position-gk/20 text-position-gk',
                      pos === 'DEF' && 'bg-position-def/20 text-position-def',
                      pos === 'MID' && 'bg-position-mid/20 text-position-mid',
                      pos === 'FWD' && 'bg-position-fwd/20 text-position-fwd',
                    )}>
                      {pos}
                    </span>
                    <p className="text-sm font-semibold text-laliga-cream mt-2">
                      {positionCounts[pos]}/{POSITION_LIMITS[pos].total}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Player List */}
            <div className="max-h-[400px] overflow-y-auto scrollbar-hide">
              {squad.length === 0 ? (
                <div className="p-8 text-center">
                  <Users className="w-12 h-12 text-surface-600 mx-auto mb-3" />
                  <p className="text-surface-400">No players yet</p>
                  <p className="text-sm text-surface-500">Click on a position to add players</p>
                </div>
              ) : (
                <div className="divide-y divide-surface-800">
                  {squad.map(sp => (
                    <div
                      key={sp.id}
                      className="flex items-center justify-between p-3 hover:bg-surface-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          'text-xs font-bold px-2 py-0.5 rounded',
                          sp.player.position === 'GK' && 'bg-position-gk/20 text-position-gk',
                          sp.player.position === 'DEF' && 'bg-position-def/20 text-position-def',
                          sp.player.position === 'MID' && 'bg-position-mid/20 text-position-mid',
                          sp.player.position === 'FWD' && 'bg-position-fwd/20 text-position-fwd',
                        )}>
                          {sp.player.position}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-laliga-cream">
                            {sp.player.displayName}
                          </p>
                          <p className="text-xs text-surface-500">{sp.player.club.shortName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-laliga-gold">
                          {formatPrice(sp.purchasePrice)}
                        </span>
                        <button
                          onClick={() => removePlayer(sp.playerId)}
                          disabled={isLoading}
                          className="p-1 rounded hover:bg-laliga-red/20 text-surface-400 hover:text-laliga-red transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Player Selection Modal */}
      {isSelectingPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              setIsSelectingPlayer(false);
              setSelectedPosition(null);
            }}
          />
          
          <div className="relative w-full max-w-4xl max-h-[90vh] card overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-4 border-b border-surface-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-lg text-laliga-cream">
                  Select {selectedPosition}
                </h2>
                <span className={cn(
                  'text-xs font-bold px-2 py-0.5 rounded',
                  selectedPosition === 'GK' && 'bg-position-gk/20 text-position-gk',
                  selectedPosition === 'DEF' && 'bg-position-def/20 text-position-def',
                  selectedPosition === 'MID' && 'bg-position-mid/20 text-position-mid',
                  selectedPosition === 'FWD' && 'bg-position-fwd/20 text-position-fwd',
                )}>
                  {positionCounts[selectedPosition!]}/{POSITION_LIMITS[selectedPosition!].total}
                </span>
              </div>
              <button
                onClick={() => {
                  setIsSelectingPlayer(false);
                  setSelectedPosition(null);
                }}
                className="p-2 rounded-lg hover:bg-surface-800 transition-colors"
              >
                <X className="w-5 h-5 text-surface-400" />
              </button>
            </div>

            {/* Filters */}
            <div className="p-4 border-b border-surface-800 flex flex-wrap gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search players..."
                  className="input-field pl-10 py-2"
                />
              </div>

              {/* Club Filter */}
              <select
                value={filterClub}
                onChange={(e) => setFilterClub(e.target.value)}
                className="input-field py-2 w-auto"
              >
                <option value="">All Clubs</option>
                {clubs.map(club => (
                  <option key={club.id} value={club.id}>
                    {club.name} {clubCounts[club.id] ? `(${clubCounts[club.id]})` : ''}
                  </option>
                ))}
              </select>

              {/* Sort */}
              <button
                onClick={() => {
                  if (sortBy === 'price') {
                    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                  } else {
                    setSortBy('price');
                    setSortOrder('desc');
                  }
                }}
                className={cn(
                  'btn-ghost flex items-center gap-2',
                  sortBy === 'price' && 'text-laliga-gold'
                )}
              >
                Price
                <ArrowUpDown className="w-4 h-4" />
              </button>
            </div>

            {/* Player List */}
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {filteredPlayers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-surface-600 mx-auto mb-3" />
                  <p className="text-surface-400">No players found</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {filteredPlayers.slice(0, 50).map(player => {
                    const canAdd = canAddPlayer(player);
                    const isClubFull = (clubCounts[player.club.id] || 0) >= MAX_PLAYERS_PER_CLUB;
                    const isTooExpensive = player.currentPrice > bankBalance;

                    return (
                      <div
                        key={player.id}
                        className={cn(
                          'flex items-center justify-between p-4 rounded-lg border transition-all',
                          canAdd
                            ? 'bg-surface-800/50 border-surface-700 hover:border-laliga-gold/50 cursor-pointer'
                            : 'bg-surface-900/50 border-surface-800 opacity-60'
                        )}
                        onClick={() => canAdd && addPlayer(player)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-surface-700 flex items-center justify-center">
                            <span className="text-sm font-bold text-laliga-cream">
                              {player.displayName.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-laliga-cream">
                              {player.displayName}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-surface-500">
                              <span>{player.club.shortName}</span>
                              {isClubFull && (
                                <span className="text-laliga-red">(Club full)</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={cn(
                            'font-semibold',
                            isTooExpensive ? 'text-laliga-red' : 'text-laliga-gold'
                          )}>
                            {formatPrice(player.currentPrice)}
                          </p>
                          {canAdd && (
                            <Plus className="w-4 h-4 text-laliga-gold ml-auto mt-1" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


