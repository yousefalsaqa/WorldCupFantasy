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
  availabilityNote?: string | null;
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

  // CSV bulk-import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    totalRows: number;
    created: number;
    updated: number;
    skipped: number;
    outcomes: Array<{ row: number; status: string; reason?: string; displayName?: string; nationCode?: string }>;
  } | null>(null);

  // Player-table lock state. We read it on mount so the lock badge and the
  // CSV-disabled state stay in sync with whatever the dashboard toggle shows.
  const [tableLocked, setTableLocked] = useState(false);

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
      const [nationsRes, playersRes, lockRes] = await Promise.all([
        fetch('/api/admin/nations'),
        fetch('/api/admin/players'),
        fetch('/api/admin/settings/player-lock'),
      ]);

      const nationsData = await nationsRes.json();
      const playersData = await playersRes.json();
      const lockData = lockRes.ok ? await lockRes.json() : { locked: false };

      setNations(nationsData.nations || []);
      setPlayers(playersData.players || []);
      setTableLocked(!!lockData.locked);
    } catch (error) {
      console.error('Load error:', error);
    }
    setLoading(false);
  }

  // Flip a player's availability flag. When marking unavailable we prompt
  // for an optional note (e.g. "ACL until Sept") so the admin remembers
  // why later. The PUT endpoint already accepts both `isAvailable` and
  // `availabilityNote`, so we just hit it directly.
  async function toggleAvailability(player: Player) {
    const becomingUnavailable = player.isAvailable;
    let note: string | null = player.availabilityNote ?? null;

    if (becomingUnavailable) {
      const entered = prompt(
        `Mark ${player.displayName} unavailable.\n\nOptional reason (e.g. "Injured – ACL", "Suspended", "Cut from squad"):`,
        player.availabilityNote ?? '',
      );
      if (entered === null) return; // user cancelled
      note = entered.trim() || null;
    } else {
      // Coming back from unavailable: clear the old note so it doesn't
      // linger and confuse the next admin.
      note = null;
    }

    // Optimistic update so the UI feels snappy.
    const previous = players;
    setPlayers(
      players.map((p) =>
        p.id === player.id
          ? { ...p, isAvailable: !becomingUnavailable, availabilityNote: note }
          : p,
      ),
    );

    try {
      const res = await fetch(`/api/admin/players/${player.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isAvailable: !becomingUnavailable,
          availabilityNote: note,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPlayers(previous);
        alert(data.error || 'Failed to update availability');
      }
    } catch (err) {
      setPlayers(previous);
      alert('Network error: ' + (err instanceof Error ? err.message : 'unknown'));
    }
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

  // ---------------------- CSV bulk import ----------------------

  /** Build a starter CSV template containing one row per existing nation
   * (currently empty squad-wise). Lets the admin open it in Excel/Sheets
   * and fill in players without hunting for the right nation codes. */
  function downloadCsvTemplate() {
    const header = 'nationCode,position,displayName,firstName,lastName,shirtNumber,price';
    const example = [
      // A handful of example rows to show the expected shape.
      'BRA,GK,Alisson,Alisson,Becker,1,6.0',
      'ARG,FWD,L. Messi,Lionel,Messi,10,12.0',
      // Then one comment-style placeholder per nation – CSV doesn't have
      // real comments so we leave them as empty data rows the user can fill.
      ...nations.map((n) => `${n.code},,,,,,`),
    ];
    const blob = new Blob([[header, ...example].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wc26-players-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCsvUpload(file: File) {
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const res = await fetch('/api/admin/players/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Import failed');
      } else {
        setImportResult(data);
        loadData();
      }
    } catch (err) {
      console.error('CSV import error:', err);
      alert('CSV import failed – see console.');
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return <div className="text-white">Loading players...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            👥 Player Management
            {tableLocked && (
              <span
                title="The player table is locked. Bulk imports are disabled, but you can still edit individual players."
                className="text-xs font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-300 px-2 py-1 rounded-full"
              >
                🔒 Locked
              </span>
            )}
          </h2>
          <p className="text-slate-400">{players.length} players total</p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-amber-500 hover:bg-amber-600 text-black font-semibold px-4 py-2 rounded-lg"
        >
          ➕ Add Player
        </button>
      </div>

      {tableLocked && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-200">
          <strong>Player table is locked.</strong> Bulk CSV imports and seed
          wipes are blocked. You can still add, edit, or mark players
          unavailable here. Toggle the lock from <a href="/admin" className="underline">/admin</a>.
        </div>
      )}

      {/* CSV bulk import */}
      <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h3 className="font-semibold text-white">📥 Bulk import (CSV)</h3>
            <p className="text-sm text-slate-400 mt-1">
              Upload a CSV with columns&nbsp;
              <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-300 text-xs">nationCode, position, displayName, firstName, lastName, shirtNumber, price</code>.
              Rows are upserted by <span className="text-white">(nationCode + displayName)</span> – safe to re-run.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={downloadCsvTemplate}
              className="text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-3 py-2 rounded-lg"
            >
              ⬇ Template
            </button>
            <label
              className={`text-sm font-semibold px-3 py-2 rounded-lg cursor-pointer ${
                importing || tableLocked
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-black'
              }`}
              title={tableLocked ? 'Player table is locked. Unlock from /admin to bulk import.' : undefined}
            >
              {tableLocked ? '🔒 Locked' : importing ? 'Importing…' : '⬆ Upload CSV'}
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={importing || tableLocked}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCsvUpload(file);
                  // Reset so re-uploading the same file works.
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {importResult && (
          <div className="mt-4 bg-slate-950 border border-slate-800 rounded-lg p-4 text-sm">
            <div className="flex flex-wrap gap-4 mb-2">
              <span className="text-emerald-400 font-semibold">{importResult.created} created</span>
              <span className="text-sky-400 font-semibold">{importResult.updated} updated</span>
              <span className={importResult.skipped > 0 ? 'text-amber-400 font-semibold' : 'text-slate-500'}>
                {importResult.skipped} skipped
              </span>
              <span className="text-slate-500">{importResult.totalRows} total rows</span>
            </div>
            {importResult.skipped > 0 && (
              <details className="text-slate-400">
                <summary className="cursor-pointer hover:text-white">Show skipped rows</summary>
                <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto font-mono text-xs">
                  {importResult.outcomes
                    .filter((o) => o.status === 'skipped')
                    .map((o, i) => (
                      <li key={i}>
                        Row {o.row}: <span className="text-amber-300">{o.reason}</span>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </div>
        )}
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
                      <div key={player.id} className={`px-4 py-3 flex items-center justify-between hover:bg-slate-800/50 ${!player.isAvailable ? 'opacity-60' : ''}`}>
                        <div className="flex items-center gap-4 min-w-0">
                          <span className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0
                            ${player.position === 'GK' ? 'bg-amber-500/20 text-amber-400' : ''}
                            ${player.position === 'DEF' ? 'bg-green-500/20 text-green-400' : ''}
                            ${player.position === 'MID' ? 'bg-blue-500/20 text-blue-400' : ''}
                            ${player.position === 'FWD' ? 'bg-red-500/20 text-red-400' : ''}
                          `}>
                            {player.position}
                          </span>
                          <div className="min-w-0">
                            <div className="text-white font-medium truncate">
                              {player.shirtNumber && (
                                <span className="text-slate-500 mr-2">#{player.shirtNumber}</span>
                              )}
                              {player.displayName}
                              {!player.isAvailable && (
                                <span className="ml-2 text-xs text-red-400 font-normal">🚫 Unavailable</span>
                              )}
                            </div>
                            {!player.isAvailable && player.availabilityNote && (
                              <div className="text-xs text-red-400/70 italic truncate">
                                {player.availabilityNote}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-amber-400 font-bold">
                            £{player.currentPrice.toFixed(1)}m
                          </span>
                          <button
                            onClick={() => toggleAvailability(player)}
                            className={`text-sm px-2 py-1 rounded border transition-colors ${
                              player.isAvailable
                                ? 'text-rose-400/80 hover:text-rose-300 border-rose-500/20 hover:border-rose-500/40 hover:bg-rose-500/10'
                                : 'text-emerald-400/80 hover:text-emerald-300 border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/10'
                            }`}
                            title={
                              player.isAvailable
                                ? 'Mark player unavailable (injury, suspension, cut from squad)'
                                : 'Bring player back into the available pool'
                            }
                          >
                            {player.isAvailable ? '🚫 Mark unavailable' : '✓ Mark available'}
                          </button>
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
