'use client';

import { useEffect, useState } from 'react';

interface Nation {
  id: string;
  name: string;
  code: string;
}

interface Stage {
  id: string;
  stageId: string;
  name: string;
  order: number;
  deadlineTime: string | null;
  isActive: boolean;
  isComplete: boolean;
}

interface Match {
  id: string;
  stageId: string;
  homeNationId: string;
  awayNationId: string;
  kickoffTime: string;
  homeScore: number | null;
  awayScore: number | null;
  isStarted: boolean;
  isFinished: boolean;
  homeNation: Nation;
  awayNation: Nation;
  stage: Stage;
}

export default function AdminFixturesPage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [nations, setNations] = useState<Nation[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Form state
  const [form, setForm] = useState({
    stageId: '',
    homeNationId: '',
    awayNationId: '',
    kickoffTime: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [stagesRes, nationsRes, matchesRes] = await Promise.all([
        fetch('/api/admin/stages'),
        fetch('/api/admin/nations'),
        fetch('/api/admin/fixtures'),
      ]);
      
      const stagesData = await stagesRes.json();
      const nationsData = await nationsRes.json();
      const matchesData = await matchesRes.json();
      
      setStages(stagesData.stages || []);
      setNations(nationsData.nations || []);
      setMatches(matchesData.matches || []);
    } catch (error) {
      console.error('Load error:', error);
    }
    setLoading(false);
  }

  const filteredMatches = selectedStage
    ? matches.filter(m => m.stageId === selectedStage)
    : matches;

  // Group by stage
  const matchesByStage = filteredMatches.reduce((acc, m) => {
    const stageName = m.stage.name;
    if (!acc[stageName]) acc[stageName] = [];
    acc[stageName].push(m);
    return acc;
  }, {} as Record<string, Match[]>);

  async function handleAddMatch() {
    if (!form.stageId || !form.homeNationId || !form.awayNationId || !form.kickoffTime) {
      alert('Please fill all fields');
      return;
    }

    try {
      const res = await fetch('/api/admin/fixtures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setShowAddModal(false);
        setForm({ stageId: '', homeNationId: '', awayNationId: '', kickoffTime: '' });
        loadData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to add match');
      }
    } catch (error) {
      console.error('Add error:', error);
      alert('Failed to add match');
    }
  }

  async function handleDeleteMatch(id: string) {
    if (!confirm('Delete this fixture?')) return;
    
    try {
      const res = await fetch(`/api/admin/fixtures/${id}`, { method: 'DELETE' });
      if (res.ok) loadData();
    } catch (error) {
      console.error('Delete error:', error);
    }
  }

  if (loading) {
    return <div className="text-white">Loading fixtures...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">📅 Fixtures</h2>
          <p className="text-slate-400">{matches.length} matches scheduled</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-amber-500 hover:bg-amber-600 text-black font-semibold px-4 py-2 rounded-lg"
        >
          ➕ Add Fixture
        </button>
      </div>

      {/* Stage Filter */}
      <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedStage('')}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors
              ${!selectedStage ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            All Stages
          </button>
          {stages.map(stage => (
            <button
              key={stage.id}
              onClick={() => setSelectedStage(stage.id)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors
                ${selectedStage === stage.id ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            >
              {stage.name}
            </button>
          ))}
        </div>
      </div>

      {/* Fixtures List */}
      {filteredMatches.length === 0 ? (
        <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 text-center">
          <p className="text-slate-400 mb-4">No fixtures scheduled yet.</p>
          <p className="text-sm text-slate-500">
            Add fixtures manually or sync from API-Football when available.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(matchesByStage).map(([stageName, stageMatches]) => (
            <div key={stageName} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className="bg-slate-800 px-4 py-2 flex items-center justify-between">
                <h3 className="font-semibold text-white">{stageName}</h3>
                <span className="text-sm text-slate-400">{stageMatches.length} matches</span>
              </div>
              <div className="divide-y divide-slate-800">
                {stageMatches
                  .sort((a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime())
                  .map(match => (
                    <div key={match.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-800/50">
                      <div className="flex items-center gap-4">
                        <div className="text-xs text-slate-500 w-32">
                          {new Date(match.kickoffTime).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        <div className="flex items-center gap-2 min-w-[200px]">
                          <span className="text-white font-medium text-right w-24 truncate">
                            {match.homeNation.name}
                          </span>
                          <span className="text-slate-500">vs</span>
                          <span className="text-white font-medium w-24 truncate">
                            {match.awayNation.name}
                          </span>
                        </div>
                        {match.isFinished && (
                          <span className="text-amber-400 font-bold">
                            {match.homeScore} - {match.awayScore}
                          </span>
                        )}
                        {match.isStarted && !match.isFinished && (
                          <span className="text-green-400 text-sm animate-pulse">● LIVE</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteMatch(match.id)}
                        className="text-slate-400 hover:text-red-400 text-sm"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Fixture Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-xl p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-xl font-bold text-white mb-4">➕ Add Fixture</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Stage</label>
                <select
                  value={form.stageId}
                  onChange={e => setForm({ ...form, stageId: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="">Select stage...</option>
                  {stages.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Home Nation</label>
                  <select
                    value={form.homeNationId}
                    onChange={e => setForm({ ...form, homeNationId: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Select...</option>
                    {nations.map(n => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Away Nation</label>
                  <select
                    value={form.awayNationId}
                    onChange={e => setForm({ ...form, awayNationId: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="">Select...</option>
                    {nations.map(n => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Kickoff Time</label>
                <input
                  type="datetime-local"
                  value={form.kickoffTime}
                  onChange={e => setForm({ ...form, kickoffTime: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMatch}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold px-4 py-2 rounded-lg"
              >
                Add Fixture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
