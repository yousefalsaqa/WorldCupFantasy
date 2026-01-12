'use client';

import { useEffect, useState } from 'react';

interface Nation {
  id: string;
  name: string;
  code: string;
  group: string | null;
  isEliminated: boolean;
  eliminatedAt: string | null;
  _count: {
    players: number;
  };
}

export default function AdminNationsPage() {
  const [nations, setNations] = useState<Nation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string>('');

  useEffect(() => {
    loadNations();
  }, []);

  async function loadNations() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/nations');
      const data = await res.json();
      setNations(data.nations || []);
    } catch (error) {
      console.error('Load error:', error);
    }
    setLoading(false);
  }

  // Group nations by group
  const groups = Array.from(new Set(nations.map(n => n.group).filter(Boolean) as string[])).sort();
  const filteredNations = selectedGroup 
    ? nations.filter(n => n.group === selectedGroup)
    : nations;

  // Group by group letter
  const nationsByGroup = filteredNations.reduce((acc, n) => {
    const group = n.group || 'TBD';
    if (!acc[group]) acc[group] = [];
    acc[group].push(n);
    return acc;
  }, {} as Record<string, Nation[]>);

  if (loading) {
    return <div className="text-white">Loading nations...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">🌍 Nations</h2>
          <p className="text-slate-400">{nations.length} qualified nations</p>
        </div>
      </div>

      {/* Filter by Group */}
      <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedGroup('')}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors
              ${!selectedGroup ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            All Groups
          </button>
          {groups.map(group => (
            <button
              key={group}
              onClick={() => setSelectedGroup(group as string)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors
                ${selectedGroup === group ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              Group {group}
            </button>
          ))}
        </div>
      </div>

      {/* Nations Grid by Group */}
      <div className="space-y-6">
        {Object.entries(nationsByGroup)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([group, groupNations]) => (
            <div key={group} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">
                  Group {group}
                </h3>
                <span className="text-sm text-slate-400">{groupNations.length} nations</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
                {groupNations
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(nation => (
                    <NationCard key={nation.id} nation={nation} />
                  ))}
              </div>
            </div>
          ))}
      </div>

      {/* Legend */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
        <h4 className="font-semibold text-white mb-2">📋 Notes</h4>
        <ul className="text-sm text-slate-400 space-y-1">
          <li>• Some groups have TBD slots for playoff winners</li>
          <li>• Players can be added once World Cup squads are announced</li>
          <li>• Nations marked as eliminated will trigger mercy rule transfers</li>
        </ul>
      </div>
    </div>
  );
}

function NationCard({ nation }: { nation: Nation }) {
  return (
    <div className={`bg-slate-800 rounded-lg p-4 border transition-colors
      ${nation.isEliminated ? 'border-red-500/50 opacity-60' : 'border-slate-700 hover:border-slate-600'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏴</span>
          <span className="font-medium text-white">{nation.name}</span>
        </div>
        <span className="text-xs text-slate-500 font-mono">{nation.code}</span>
      </div>
      
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">
          {nation._count.players} players
        </span>
        {nation.isEliminated && (
          <span className="text-red-400 text-xs">
            ❌ Out ({nation.eliminatedAt})
          </span>
        )}
      </div>
    </div>
  );
}
