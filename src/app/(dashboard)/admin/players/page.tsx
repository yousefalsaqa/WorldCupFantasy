'use client';

import { useEffect, useState } from 'react';

interface Nation {
  id: string;
  name: string;
  code: string;
  group: string | null;
}

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  currentPrice: number;
  nationId: string;
  nation: Nation;
  shirtNumber: number | null;
  isAvailable: boolean;
}

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const;

export default function AdminPlayersPage() {
  const [nations, setNations] = useState<Nation[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNation, setSelectedNation] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  
  // Form state
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    displayName: '',
    position: 'MID' as 'GK' | 'DEF' | 'MID' | 'FWD',
    nationId: '',
    currentPrice: 5.0,
    shirtNumber: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [nationsRes, playersRes] = await Promise.all([
        fetch('/api/admin/nations'),
        fetch('/api/admin/players'),
      ]);
      
      const nationsData = await nationsRes.json();
      const playersData = await playersRes.json();
      
      setNations(nationsData.nations || []);
      setPlayers(playersData.players || []);
    } catch (error) {
      console.error('Load error:', error);
    }
    setLoading(false);
  }

  // Filter players
  const filteredPlayers = players.filter(p => {
    const matchesNation = !selectedNation || p.nationId === selectedNation;
    const matchesSearch = !searchQuery || 
      p.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.nation.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesNation && matchesSearch;
  });

  // Group by nation
  const groupedByNation = filteredPlayers.reduce((acc, p) => {
    const nation = p.nation.name;
    if (!acc[nation]) acc[nation] = [];
    acc[nation].push(p);
    return acc;
  }, {} as Record<string, Player[]>);

  async function handleSavePlayer() {
    const endpoint = editingPlayer 
      ? `/api/admin/players/${editingPlayer.id}` 
      : '/api/admin/players';
    const method = editingPlayer ? 'PUT' : 'POST';
    
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          shirtNumber: form.shirtNumber ? parseInt(form.shirtNumber) : null,
        }),
      });
      
      if (res.ok) {
        setShowAddModal(false);
        setEditingPlayer(null);
        resetForm();
        loadData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save player');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save player');
    }
  }

  async function handleDeletePlayer(id: string) {
    if (!confirm('Are you sure you want to delete this player?')) return;
    
    try {
      const res = await fetch(`/api/admin/players/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  }

  function resetForm() {
    setForm({
      firstName: '',
      lastName: '',
      displayName: '',
      position: 'MID',
      nationId: '',
      currentPrice: 5.0,
      shirtNumber: '',
    });
  }

  function openAddModal() {
    resetForm();
    setEditingPlayer(null);
    setShowAddModal(true);
  }

  function openEditModal(player: Player) {
    setForm({
      firstName: player.firstName,
      lastName: player.lastName,
      displayName: player.displayName,
      position: player.position,
      nationId: player.nationId,
      currentPrice: player.currentPrice,
      shirtNumber: player.shirtNumber?.toString() || '',
    });
    setEditingPlayer(player);
    setShowAddModal(true);
  }

  if (loading) {
    return <div className="text-white">Loading players...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">👥 Player Management</h2>
          <p className="text-slate-400">{players.length} players total</p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-amber-500 hover:bg-amber-600 text-black font-semibold px-4 py-2 rounded-lg"
        >
          ➕ Add Player
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-slate-400 mb-1">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search players..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div className="w-48">
            <label className="block text-sm text-slate-400 mb-1">Filter by Nation</label>
            <select
              value={selectedNation}
              onChange={e => setSelectedNation(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
            >
              <option value="">All Nations</option>
              {nations.map(n => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Players List */}
      {filteredPlayers.length === 0 ? (
        <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 text-center">
          <p className="text-slate-400 mb-4">
            {players.length === 0 
              ? 'No players yet. Add players manually or sync from API.' 
              : 'No players match your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByNation)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([nationName, nationPlayers]) => (
              <div key={nationName} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <div className="bg-slate-800 px-4 py-2 flex items-center justify-between">
                  <h3 className="font-semibold text-white">🏴 {nationName}</h3>
                  <span className="text-sm text-slate-400">{nationPlayers.length} players</span>
                </div>
                <div className="divide-y divide-slate-800">
                  {nationPlayers
                    .sort((a, b) => {
                      const posOrder = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
                      return posOrder[a.position] - posOrder[b.position];
                    })
                    .map(player => (
                      <div key={player.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-800/50">
                        <div className="flex items-center gap-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium
                            ${player.position === 'GK' ? 'bg-amber-500/20 text-amber-400' : ''}
                            ${player.position === 'DEF' ? 'bg-green-500/20 text-green-400' : ''}
                            ${player.position === 'MID' ? 'bg-blue-500/20 text-blue-400' : ''}
                            ${player.position === 'FWD' ? 'bg-red-500/20 text-red-400' : ''}
                          `}>
                            {player.position}
                          </span>
                          <span className="text-white font-medium">
                            {player.shirtNumber && 
                              <span className="text-slate-500 mr-2">#{player.shirtNumber}</span>
                            }
                            {player.displayName}
                          </span>
                          {!player.isAvailable && (
                            <span className="text-xs text-red-400">🚫 Unavailable</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-amber-400 font-bold">
                            £{player.currentPrice.toFixed(1)}m
                          </span>
                          <button
                            onClick={() => openEditModal(player)}
                            className="text-slate-400 hover:text-white text-sm"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => handleDeletePlayer(player.id)}
                            className="text-slate-400 hover:text-red-400 text-sm"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-xl p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-xl font-bold text-white mb-4">
              {editingPlayer ? '✏️ Edit Player' : '➕ Add Player'}
            </h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">First Name</label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={e => setForm({ ...form, firstName: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={e => setForm({ ...form, lastName: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={e => setForm({ ...form, displayName: e.target.value })}
                  placeholder="e.g., Mbappé"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Position</label>
                  <select
                    value={form.position}
                    onChange={e => setForm({ ...form, position: e.target.value as typeof form.position })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    {POSITIONS.map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Nation</label>
                  <select
                    value={form.nationId}
                    onChange={e => setForm({ ...form, nationId: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Select nation...</option>
                    {nations.map(n => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Price (£m) <span className="text-amber-400">*Editable*</span>
                  </label>
                  <input
                    type="number"
                    value={form.currentPrice}
                    onChange={e => setForm({ ...form, currentPrice: parseFloat(e.target.value) || 0 })}
                    step="0.5"
                    min="4"
                    max="15"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Shirt Number</label>
                  <input
                    type="number"
                    value={form.shirtNumber}
                    onChange={e => setForm({ ...form, shirtNumber: e.target.value })}
                    min="1"
                    max="99"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingPlayer(null);
                }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePlayer}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold px-4 py-2 rounded-lg"
              >
                {editingPlayer ? 'Save Changes' : 'Add Player'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
