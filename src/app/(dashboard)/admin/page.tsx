'use client';

import { useEffect, useState } from 'react';

interface Stats {
  nations: number;
  players: number;
  users: number;
  teams: number;
  stages: number;
  matches: number;
  error?: string;
}

interface SyncStatus {
  nations: { mapped: number; total: number };
  matches: { mapped: number; total: number };
  players: { mapped: number; total: number };
}

interface LiveUpdateResult {
  message: string;
  matchesProcessed?: number;
  results?: Array<{
    matchId: string;
    status: string;
    playersUpdated: number;
    error?: string;
  }>;
  rateLimit?: number;
}

interface SearchPlayer {
  id: string;
  displayName: string;
  position: string;
  nation: { name: string; code: string };
}

interface PlayerMatch {
  id: string;
  match: {
    id: string;
    matchDate: string;
    homeNation: { name: string; code: string };
    awayNation: { name: string; code: string };
  };
  totalPoints: number;
  bonusPoints: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Live update state
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [updating, setUpdating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [updateResult, setUpdateResult] = useState<LiveUpdateResult | null>(null);

  // Emergency Override state
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchPlayer[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<SearchPlayer | null>(null);
  const [playerMatches, setPlayerMatches] = useState<PlayerMatch[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<string>('');
  const [overridePoints, setOverridePoints] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideResult, setOverrideResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    // Fetch stats
    fetch('/api/admin/stats')
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        }
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load stats');
        setLoading(false);
      });
    
    // Fetch sync status
    fetch('/api/live/sync')
      .then(res => res.json())
      .then(data => {
        if (data.sync) {
          setSyncStatus(data.sync);
        }
      })
      .catch(() => {
        // Silently fail - sync status is optional
      });
  }, []);

  const handleLiveUpdate = async () => {
    setUpdating(true);
    setUpdateResult(null);
    try {
      const res = await fetch('/api/live/update', { method: 'POST' });
      const data = await res.json();
      setUpdateResult(data);
    } catch (err) {
      setUpdateResult({ message: 'Failed to update: ' + (err instanceof Error ? err.message : 'Unknown error') });
    } finally {
      setUpdating(false);
    }
  };

  const handleSync = async (syncType: string) => {
    setSyncing(true);
    try {
      const res = await fetch('/api/live/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncType }),
      });
      const data = await res.json();
      if (data.result) {
        // Refresh sync status
        const statusRes = await fetch('/api/live/sync');
        const statusData = await statusRes.json();
        if (statusData.sync) {
          setSyncStatus(statusData.sync);
        }
      }
      alert(`Sync completed: ${JSON.stringify(data.result || data.error)}`);
    } catch (err) {
      alert('Sync failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSyncing(false);
    }
  };

  // Emergency Override handlers
  const handlePlayerSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/admin/override?search=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSearchResults(data.players || []);
    } catch {
      setSearchResults([]);
    }
  };

  const handleSelectPlayer = async (player: SearchPlayer) => {
    setSelectedPlayer(player);
    setSearchResults([]);
    setSearchQuery(player.displayName);
    setSelectedMatch('');
    setOverrideResult(null);
    
    // Fetch player's matches
    try {
      const res = await fetch(`/api/admin/override?playerId=${player.id}`);
      const data = await res.json();
      if (data.player?.performances) {
        setPlayerMatches(data.player.performances);
      }
    } catch {
      setPlayerMatches([]);
    }
  };

  const handleApplyOverride = async () => {
    if (!selectedPlayer || !overridePoints) return;
    
    setOverrideLoading(true);
    setOverrideResult(null);
    
    try {
      const res = await fetch('/api/admin/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: selectedPlayer.id,
          matchId: selectedMatch || undefined,
          points: parseInt(overridePoints),
          reason: overrideReason,
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        setOverrideResult({ 
          success: true, 
          message: `Added ${overridePoints} points to ${selectedPlayer.displayName}${selectedMatch ? ' (match-specific)' : ' (total)'}` 
        });
        // Reset form
        setOverridePoints('');
        setOverrideReason('');
        // Refresh player matches
        handleSelectPlayer(selectedPlayer);
      } else {
        setOverrideResult({ success: false, message: data.error || 'Failed to apply override' });
      }
    } catch {
      setOverrideResult({ success: false, message: 'Network error' });
    } finally {
      setOverrideLoading(false);
    }
  };

  if (loading) {
    return <div className="text-white/50">Loading stats...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-black text-white mb-1">
          Admin Dashboard
        </h2>
        <p className="text-white/40">
          Manage nations, players, fixtures, and results
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400 text-sm">Error loading stats: {error}</p>
          <p className="text-white/40 text-xs mt-1">Check database connection or try refreshing</p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon="🌍" label="Nations" value={stats?.nations || 0} />
        <StatCard icon="👥" label="Players" value={stats?.players || 0} />
        <StatCard icon="👤" label="Users" value={stats?.users || 0} />
        <StatCard icon="⚽" label="Teams" value={stats?.teams || 0} />
        <StatCard icon="📅" label="Stages" value={stats?.stages || 0} />
        <StatCard icon="🎮" label="Matches" value={stats?.matches || 0} />
      </div>

      {/* Quick Actions */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h3 className="font-bold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <ActionCard href="/admin/players" icon="➕" label="Add Player" />
          <ActionCard href="/admin/results" icon="📝" label="Enter Results" />
          <ActionCard href="/admin/fixtures" icon="📅" label="Fixtures" />
          <ActionCard href="/admin/users" icon="👥" label="Users" />
          <ActionCard href="/admin/audit" icon="📋" label="Audit Log" />
        </div>
      </div>

      {/* Live Data Controls */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h3 className="font-bold text-white mb-4">Live Data (API-Football)</h3>
        
        {/* Sync Status */}
        {syncStatus && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-white">
                {syncStatus.nations.mapped}/{syncStatus.nations.total}
              </div>
              <div className="text-xs text-white/40">Nations Mapped</div>
            </div>
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-white">
                {syncStatus.matches.mapped}/{syncStatus.matches.total}
              </div>
              <div className="text-xs text-white/40">Matches Mapped</div>
            </div>
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-white">
                {syncStatus.players.mapped}/{syncStatus.players.total}
              </div>
              <div className="text-xs text-white/40">Players Mapped</div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={handleLiveUpdate}
            disabled={updating}
            className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 
                       text-green-400 rounded-lg font-medium transition-all disabled:opacity-50"
          >
            {updating ? '⏳ Updating...' : '▶️ Update Live Scores'}
          </button>
          
          <button
            onClick={() => handleSync('nations')}
            disabled={syncing}
            className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 
                       text-blue-400 rounded-lg font-medium transition-all disabled:opacity-50"
          >
            {syncing ? '⏳ Syncing...' : '🌍 Sync Nations'}
          </button>
          
          <button
            onClick={() => handleSync('players')}
            disabled={syncing}
            className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 
                       text-purple-400 rounded-lg font-medium transition-all disabled:opacity-50"
          >
            {syncing ? '⏳ Syncing...' : '👥 Sync Players'}
          </button>
        </div>

        {/* Update Result */}
        {updateResult && (
          <div className={`p-3 rounded-lg text-sm ${
            updateResult.matchesProcessed !== undefined 
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
          }`}>
            <p className="font-medium">{updateResult.message}</p>
            {updateResult.matchesProcessed !== undefined && (
              <p className="text-xs mt-1 opacity-70">
                Processed {updateResult.matchesProcessed} matches • 
                Rate limit: {updateResult.rateLimit} requests remaining
              </p>
            )}
          </div>
        )}

        <p className="text-white/30 text-xs mt-4">
          Note: Live updates run automatically via cron during matches. 
          Use this button for manual testing or immediate updates.
        </p>
      </div>

      {/* Emergency Override */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <button
          onClick={() => setOverrideOpen(!overrideOpen)}
          className="w-full flex items-center justify-between"
        >
          <h3 className="font-bold text-white">Emergency Override</h3>
          <span className="text-white/40">{overrideOpen ? '▼' : '▶'}</span>
        </button>
        
        {overrideOpen && (
          <div className="mt-4 space-y-4">
            <p className="text-white/40 text-sm">
              Manually add/subtract points if API-Football missed something.
            </p>
            
            {/* Player Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search player by name..."
                value={searchQuery}
                onChange={(e) => handlePlayerSearch(e.target.value)}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg 
                           text-white placeholder-white/30 focus:outline-none focus:border-white/30"
              />
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-white/10 
                                rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                  {searchResults.map((player) => (
                    <button
                      key={player.id}
                      onClick={() => handleSelectPlayer(player)}
                      className="w-full px-4 py-2 text-left hover:bg-white/10 flex items-center gap-3"
                    >
                      <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/60">
                        {player.position}
                      </span>
                      <span className="text-white">{player.displayName}</span>
                      <span className="text-white/40 text-sm">{player.nation.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Player Info */}
            {selectedPlayer && (
              <div className="bg-white/5 rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/60">
                    {selectedPlayer.position}
                  </span>
                  <span className="text-white font-medium">{selectedPlayer.displayName}</span>
                  <span className="text-white/40 text-sm">{selectedPlayer.nation.name}</span>
                </div>

                {/* Match Selection (optional) */}
                <div>
                  <label className="block text-white/40 text-sm mb-2">
                    Match (optional - leave empty for total adjustment)
                  </label>
                  <select
                    value={selectedMatch}
                    onChange={(e) => setSelectedMatch(e.target.value)}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg 
                               text-white focus:outline-none focus:border-white/30"
                  >
                    <option value="">Total Points Adjustment</option>
                    {playerMatches.map((pm) => (
                      <option key={pm.id} value={pm.match.id}>
                        {pm.match.homeNation.code} vs {pm.match.awayNation.code} 
                        ({new Date(pm.match.matchDate).toLocaleDateString()}) 
                        - {pm.totalPoints} pts
                      </option>
                    ))}
                  </select>
                </div>

                {/* Points Input */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white/40 text-sm mb-2">
                      Points (+/-)
                    </label>
                    <input
                      type="number"
                      value={overridePoints}
                      onChange={(e) => setOverridePoints(e.target.value)}
                      placeholder="e.g. 4 or -2"
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg 
                                 text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="block text-white/40 text-sm mb-2">
                      Reason (optional)
                    </label>
                    <input
                      type="text"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="e.g. Missed goal"
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg 
                                 text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                    />
                  </div>
                </div>

                {/* Apply Button */}
                <button
                  onClick={handleApplyOverride}
                  disabled={overrideLoading || !overridePoints}
                  className="w-full px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 
                             border border-amber-500/30 text-amber-400 rounded-lg 
                             font-medium transition-all disabled:opacity-50"
                >
                  {overrideLoading ? 'Applying...' : 'Apply Override'}
                </button>

                {/* Result Message */}
                {overrideResult && (
                  <div className={`p-3 rounded-lg text-sm ${
                    overrideResult.success 
                      ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                      : 'bg-red-500/10 border border-red-500/30 text-red-400'
                  }`}>
                    {overrideResult.message}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Setup Checklist */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h3 className="font-bold text-white mb-4">Setup Checklist</h3>
        <div className="space-y-3">
          <ChecklistItem done={(stats?.nations || 0) >= 37} label="Nations seeded (37+ nations)" />
          <ChecklistItem done={(stats?.players || 0) > 0} label="Players added to nations" />
          <ChecklistItem done={(stats?.matches || 0) > 0} label="Group stage fixtures created" />
          <ChecklistItem done={false} label="Deadline times set for each stage" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="text-xs text-white/40 font-medium">{label}</div>
    </div>
  );
}

function ActionCard({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a
      href={href}
      className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl p-4 text-center transition-all"
    >
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-medium text-white/80 text-sm">{label}</div>
    </a>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm
        ${done ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/30'}`}>
        {done ? '✓' : '○'}
      </div>
      <span className={done ? 'text-white/70' : 'text-white/40'}>{label}</span>
    </div>
  );
}
