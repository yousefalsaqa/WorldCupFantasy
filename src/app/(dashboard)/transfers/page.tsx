'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getFlagUrl } from '@/lib/flags';
import { useUnsavedChanges } from '@/contexts/unsaved-changes';

type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

interface Nation {
  id: string;
  name: string;
  code: string;
  kitColor1: string;
  kitColor2: string;
}

interface Player {
  id: string;
  name: string;
  displayName: string;
  position: Position;
  currentPrice: number;
  shirtNumber: number | null;
  nation: Nation;
}

interface SquadPlayer {
  id: string;
  playerId: string;
  purchasePrice: number;
  points: number;
  isStarting: boolean;
  player: Player;
}

interface Team {
  id: string;
  name: string;
  bankBalance: number;
  teamValue: number;
  freeTransfers: number;
}

interface TransferItem {
  playerOut: SquadPlayer;
  playerIn: Player;
}

const TRANSFER_HIT_COST = 4;
const MAX_PLAYERS_PER_NATION = 3;

export default function TransfersPage() {
  const router = useRouter();
  const { setDirty, forceClean } = useUnsavedChanges();
  const [team, setTeam] = useState<Team | null>(null);
  const [squadPlayers, setSquadPlayers] = useState<SquadPlayer[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [nations, setNations] = useState<Nation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Transfer state
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [selectedOut, setSelectedOut] = useState<SquadPlayer | null>(null);
  const [wildcardActive, setWildcardActive] = useState(false);
  const [activeChip, setActiveChip] = useState<string | null>(null);

  // Keep the layout-level unsaved-changes flag in sync with pending transfers.
  // The flag drives the confirmation modal when the user tries to navigate away.
  useEffect(() => {
    if (transfers.length > 0) {
      setDirty(
        true,
        `You have ${transfers.length} pending transfer${transfers.length === 1 ? '' : 's'} that hasn\u2019t been confirmed.`
      );
    } else {
      setDirty(false);
    }
    return () => setDirty(false);
  }, [transfers.length, setDirty]);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPosition, setFilterPosition] = useState<Position | ''>('');
  const [filterNation, setFilterNation] = useState('');

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch team and squad
        const squadRes = await fetch('/api/squad/get', { credentials: 'include' });
        if (squadRes.ok) {
          const data = await squadRes.json();
          if (data.squad) {
            setSquadPlayers(data.squad);
          }
        }

        // Fetch team info
        const teamRes = await fetch('/api/team', { credentials: 'include' });
        if (teamRes.ok) {
          const teamData = await teamRes.json();
          if (teamData.team) {
            setTeam(teamData.team);
          }
        }

        // Fetch all players
        const playersRes = await fetch('/api/players');
        if (playersRes.ok) {
          const playersData = await playersRes.json();
          // API returns array directly, not nested under 'players'
          const playersList = Array.isArray(playersData) ? playersData : (playersData.players || []);
          setAllPlayers(playersList);
          
          // Extract unique nations
          const nationMap = new Map<string, Nation>();
          playersList.forEach((p: Player) => {
            if (p.nation && !nationMap.has(p.nation.id)) {
              nationMap.set(p.nation.id, p.nation);
            }
          });
          setNations(Array.from(nationMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
        }
        // Fetch chip status
        const chipsRes = await fetch('/api/chips', { credentials: 'include' });
        if (chipsRes.ok) {
          const chipsData = await chipsRes.json();
          const active = chipsData.activeChip;
          setActiveChip(active ?? null);
          if (active === 'WILDCARD_1' || active === 'WILDCARD_2' || active === 'FREE_HIT') {
            setWildcardActive(true);
          }
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Calculate current squad state after pending transfers
  const currentSquad = useMemo(() => {
    const outIds = new Set(transfers.map(t => t.playerOut.playerId));
    return squadPlayers.filter(sp => !outIds.has(sp.playerId));
  }, [squadPlayers, transfers]);

  const incomingPlayers = useMemo(() => {
    return transfers.map(t => t.playerIn);
  }, [transfers]);

  // Calculate budget impact (World Cup = fixed prices, no selling profit)
  const budgetImpact = useMemo(() => {
    let change = 0;
    for (const transfer of transfers) {
      // In World Cup, sell price = purchase price (fixed prices)
      change += transfer.playerOut.purchasePrice - transfer.playerIn.currentPrice;
    }
    return change;
  }, [transfers]);

  const newBankBalance = (team?.bankBalance || 0) + budgetImpact;

  // Calculate transfer cost
  const transferCost = useMemo(() => {
    const extraTransfers = Math.max(0, transfers.length - (team?.freeTransfers || 0));
    return extraTransfers * TRANSFER_HIT_COST;
  }, [transfers.length, team?.freeTransfers]);

  // Nation counts after transfers
  const nationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    currentSquad.forEach(sp => {
      counts[sp.player.nation.id] = (counts[sp.player.nation.id] || 0) + 1;
    });
    incomingPlayers.forEach(p => {
      counts[p.nation.id] = (counts[p.nation.id] || 0) + 1;
    });
    return counts;
  }, [currentSquad, incomingPlayers]);

  // Filter available players
  const availablePlayers = useMemo(() => {
    const squadIds = new Set(squadPlayers.map(sp => sp.playerId));
    const incomingIds = new Set(incomingPlayers.map(p => p.id));

    return allPlayers.filter(player => {
      // Must not be in current squad (unless being transferred out)
      if (squadIds.has(player.id) && !transfers.some(t => t.playerOut.playerId === player.id)) {
        return false;
      }
      // Must not already be incoming
      if (incomingIds.has(player.id)) return false;
      
      // Position filter - when replacing, must match position
      if (selectedOut && player.position !== selectedOut.player.position) return false;
      if (!selectedOut && filterPosition && player.position !== filterPosition) return false;
      
      // Nation filter
      if (filterNation && player.nation.id !== filterNation) return false;
      
      // Search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          player.displayName.toLowerCase().includes(query) ||
          player.nation.name.toLowerCase().includes(query)
        );
      }
      
      return true;
    });
  }, [allPlayers, squadPlayers, incomingPlayers, transfers, selectedOut, filterPosition, filterNation, searchQuery]);

  // Check if a player can be brought in
  const canBringIn = (player: Player): { allowed: boolean; reason?: string } => {
    if (!selectedOut) {
      return { allowed: false, reason: 'Select a player to transfer out first' };
    }

    // Calculate what the balance would be after this transfer
    // We get money back from selling selectedOut, then spend on buying player
    // Net cost = player.currentPrice - selectedOut.purchasePrice
    const transferCost = player.currentPrice - selectedOut.purchasePrice;
    const balanceAfterTransfer = newBankBalance - transferCost;
    
    // Price check - balance must remain >= 0 after transfer
    if (balanceAfterTransfer < 0) {
      return { allowed: false, reason: `Insufficient funds. Need £${transferCost.toFixed(1)}m more` };
    }
    
    // Nation limit
    const nationCount = nationCounts[player.nation.id] || 0;
    if (nationCount >= MAX_PLAYERS_PER_NATION) {
      return { allowed: false, reason: 'Nation limit (3)' };
    }
    
    return { allowed: true };
  };

  // Add a transfer
  const addTransfer = (playerOut: SquadPlayer, playerIn: Player) => {
    setTransfers(prev => [...prev, { playerOut, playerIn }]);
    setSelectedOut(null);
    setSearchQuery('');
  };

  // Remove a transfer
  const removeTransfer = (index: number) => {
    setTransfers(prev => prev.filter((_, i) => i !== index));
  };

  // Confirm transfers
  const confirmTransfers = async () => {
    if (transfers.length === 0) return;

    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          transfers: transfers.map(t => ({
            playerOutId: t.playerOut.playerId,
            playerInId: t.playerIn.id,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to confirm transfers (status ${res.status})`);
        return;
      }

      // Synchronously remove the unsaved-changes guard BEFORE reloading. State
      // updates are async, so just calling setDirty(false) here lets the
      // beforeunload listener still fire on the immediately following reload
      // and the browser shows "Leave site?", which would silently abort the
      // refresh and leave the page showing stale pending transfers.
      setTransfers([]);
      forceClean();
      router.refresh();
      window.location.reload();
    } catch {
      setError('Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/60">Loading transfers...</p>
      </div>
    );
  }

  if (!team || squadPlayers.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-white mb-4">No Squad Found</h2>
          <p className="text-white/60 mb-6">You need to create a squad before making transfers.</p>
          <a href="/squad" className="px-6 py-3 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors">
            Create Squad
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Transfers</h1>
          <p className="text-white/60">Make changes to your squad</p>
        </div>

        {/* Transfer stats */}
        <div className="flex items-center gap-4">
          <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
            <p className="text-xs text-white/40">Free Transfers</p>
            <p className="text-lg font-bold text-white">{team.freeTransfers >= 999 ? '∞' : team.freeTransfers}</p>
          </div>
          <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
            <p className="text-xs text-white/40">Budget</p>
            <p className={`text-lg font-bold ${newBankBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              £{newBankBalance.toFixed(1)}m
            </p>
          </div>
        </div>
      </div>

      {/* Unlimited-transfers chip banner */}
      {wildcardActive && (
        <div className={`flex items-start gap-3 p-4 mb-6 rounded-lg border ${
          activeChip === 'FREE_HIT'
            ? 'bg-amber-500/10 border-amber-500/30'
            : 'bg-emerald-500/10 border-emerald-500/20'
        }`}>
          <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${activeChip === 'FREE_HIT' ? 'text-amber-400' : 'text-emerald-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {activeChip === 'FREE_HIT' ? (
            <div>
              <p className="text-sm text-amber-300 font-semibold">Free Hit Active &mdash; Unlimited Free Transfers</p>
              <p className="text-xs text-amber-400/70 mt-0.5">Your squad will revert to its previous state at the end of this stage.</p>
            </div>
          ) : (
            <p className="text-sm text-emerald-400 font-medium">Wildcard Active &mdash; Unlimited Free Transfers</p>
          )}
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-lg bg-red-500/10 border border-red-500/20">
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Pending Transfers */}
      {transfers.length > 0 && (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-white/10 mb-8 overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="font-semibold text-white">
              Pending Transfers ({transfers.length})
            </h2>
            {transferCost > 0 && (
              <span className="text-red-400 text-sm font-medium">-{transferCost} pts hit</span>
            )}
          </div>
          <div className="divide-y divide-white/5">
            {transfers.map((transfer, i) => (
              <div key={i} className="p-4 flex items-center gap-4">
                {/* Player Out */}
                <div className="flex-1 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                  </div>
                  <img 
                    src={getFlagUrl(transfer.playerOut.player.nation.code)} 
                    alt="" 
                    className="w-6 h-4 object-cover rounded-sm"
                  />
                  <div>
                    <p className="font-medium text-white">{transfer.playerOut.player.displayName}</p>
                    <p className="text-xs text-white/40">{transfer.playerOut.player.nation.name}</p>
                  </div>
                  <span className="text-sm text-white/60 ml-auto">
                    £{transfer.playerOut.purchasePrice.toFixed(1)}m
                  </span>
                </div>

                <svg className="w-5 h-5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>

                {/* Player In */}
                <div className="flex-1 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <img 
                    src={getFlagUrl(transfer.playerIn.nation.code)} 
                    alt="" 
                    className="w-6 h-4 object-cover rounded-sm"
                  />
                  <div>
                    <p className="font-medium text-white">{transfer.playerIn.displayName}</p>
                    <p className="text-xs text-white/40">{transfer.playerIn.nation.name}</p>
                  </div>
                  <span className="text-sm text-emerald-400 ml-auto">
                    £{transfer.playerIn.currentPrice.toFixed(1)}m
                  </span>
                </div>

                {/* Remove */}
                <button
                  onClick={() => removeTransfer(i)}
                  className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-red-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-white/10 flex items-center justify-between">
            <button
              onClick={() => setTransfers([])}
              className="px-4 py-2 text-white/60 hover:text-white transition-colors"
            >
              Cancel All
            </button>
            <button
              onClick={confirmTransfers}
              disabled={isSubmitting || newBankBalance < 0}
              className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg font-medium hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Confirming...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Confirm Transfers
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Current Squad */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h2 className="font-semibold text-white">Your Squad</h2>
            <p className="text-sm text-white/40">Select a player to transfer out</p>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {squadPlayers
              .sort((a, b) => {
                const posOrder = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
                return posOrder[a.player.position] - posOrder[b.player.position];
              })
              .map(sp => {
                const isSelected = selectedOut?.playerId === sp.playerId;
                const isPendingOut = transfers.some(t => t.playerOut.playerId === sp.playerId);

                return (
                  <button
                    key={sp.id}
                    onClick={() => {
                      if (!isPendingOut) {
                        setSelectedOut(isSelected ? null : sp);
                        setSearchQuery('');
                      }
                    }}
                    disabled={isPendingOut}
                    className={`w-full flex items-center justify-between p-4 border-b border-white/5 transition-colors text-left
                      ${isSelected ? 'bg-red-500/10 border-l-4 border-l-red-500' : 'hover:bg-white/5'}
                      ${isPendingOut ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded
                        ${sp.player.position === 'GK' ? 'bg-yellow-500/20 text-yellow-400' : ''}
                        ${sp.player.position === 'DEF' ? 'bg-blue-500/20 text-blue-400' : ''}
                        ${sp.player.position === 'MID' ? 'bg-green-500/20 text-green-400' : ''}
                        ${sp.player.position === 'FWD' ? 'bg-red-500/20 text-red-400' : ''}`}
                      >
                        {sp.player.position}
                      </span>
                      <img 
                        src={getFlagUrl(sp.player.nation.code)} 
                        alt="" 
                        className="w-6 h-4 object-cover rounded-sm"
                      />
                      <div>
                        <p className="font-medium text-white">{sp.player.displayName}</p>
                        <p className="text-xs text-white/40">{sp.player.nation.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-emerald-400">£{sp.purchasePrice.toFixed(1)}m</p>
                      <p className="text-xs text-white/40">{sp.points} pts</p>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Available Players */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h2 className="font-semibold text-white">
              {selectedOut ? `Replace ${selectedOut.player.displayName}` : 'Available Players'}
            </h2>
            {selectedOut && (
              <p className="text-sm text-white/40">Showing {selectedOut.player.position} players only</p>
            )}
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-white/10 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[150px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search players..."
                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/20"
              />
            </div>
            {!selectedOut && (
              <select
                value={filterPosition}
                onChange={(e) => setFilterPosition(e.target.value as Position | '')}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/20"
              >
                <option value="">All Positions</option>
                <option value="GK">GK</option>
                <option value="DEF">DEF</option>
                <option value="MID">MID</option>
                <option value="FWD">FWD</option>
              </select>
            )}
            <select
              value={filterNation}
              onChange={(e) => setFilterNation(e.target.value)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/20"
            >
              <option value="">All Nations</option>
              {nations.map(nation => (
                <option key={nation.id} value={nation.id}>{nation.name}</option>
              ))}
            </select>
          </div>

          {/* Player List */}
          <div className="max-h-[500px] overflow-y-auto">
            {!selectedOut && transfers.length === 0 ? (
              <div className="p-8 text-center text-white/40">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <p>Select a player from your squad to transfer out</p>
              </div>
            ) : availablePlayers.length === 0 ? (
              <div className="p-8 text-center text-white/40">
                No matching players found
              </div>
            ) : (
              availablePlayers.slice(0, 50).map(player => {
                const check = canBringIn(player);

                return (
                  <button
                    key={player.id}
                    onClick={() => selectedOut && check.allowed && addTransfer(selectedOut, player)}
                    disabled={!selectedOut || !check.allowed}
                    className={`w-full flex items-center justify-between p-4 border-b border-white/5 transition-colors text-left
                      ${selectedOut && check.allowed ? 'hover:bg-emerald-500/10 cursor-pointer' : 'opacity-50'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded
                        ${player.position === 'GK' ? 'bg-yellow-500/20 text-yellow-400' : ''}
                        ${player.position === 'DEF' ? 'bg-blue-500/20 text-blue-400' : ''}
                        ${player.position === 'MID' ? 'bg-green-500/20 text-green-400' : ''}
                        ${player.position === 'FWD' ? 'bg-red-500/20 text-red-400' : ''}`}
                      >
                        {player.position}
                      </span>
                      <img 
                        src={getFlagUrl(player.nation.code)} 
                        alt="" 
                        className="w-6 h-4 object-cover rounded-sm"
                      />
                      <div>
                        <p className="font-medium text-white">{player.displayName}</p>
                        <p className="text-xs text-white/40">{player.nation.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-emerald-400">£{player.currentPrice.toFixed(1)}m</p>
                      {!check.allowed && check.reason && (
                        <p className="text-xs text-red-400">{check.reason}</p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
