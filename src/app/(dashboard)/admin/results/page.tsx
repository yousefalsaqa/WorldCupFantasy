'use client';

import { useEffect, useState } from 'react';

interface Nation {
  name: string;
  code: string;
}

interface Match {
  id: string;
  kickoffTime: string;
  homeScore: number | null;
  awayScore: number | null;
  isStarted: boolean;
  isFinished: boolean;
  homeNation: Nation;
  awayNation: Nation;
  stage: { name: string };
}

interface Player {
  id: string;
  displayName: string;
  position: string;
  nation: Nation;
}

export default function AdminResultsPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  
  // Score form
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  
  // Performance entry
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [perfForm, setPerfForm] = useState({
    minutes: 90,
    goals: 0,
    assists: 0,
    cleanSheet: false,
    saves: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
  });

  useEffect(() => {
    loadMatches();
  }, []);

  async function loadMatches() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/fixtures');
      const data = await res.json();
      setMatches(data.matches || []);
    } catch (error) {
      console.error('Load error:', error);
    }
    setLoading(false);
  }

  async function loadMatchPlayers(match: Match) {
    try {
      // Get players from both nations
      const res = await fetch(`/api/admin/players?nations=${match.homeNation.code},${match.awayNation.code}`);
      const data = await res.json();
      setPlayers(data.players || []);
    } catch (error) {
      console.error('Load players error:', error);
    }
  }

  function selectMatch(match: Match) {
    setSelectedMatch(match);
    setHomeScore(match.homeScore ?? 0);
    setAwayScore(match.awayScore ?? 0);
    loadMatchPlayers(match);
  }

  async function saveMatchResult() {
    if (!selectedMatch) return;

    try {
      const res = await fetch('/api/admin/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: selectedMatch.id,
          homeScore,
          awayScore,
          isFinished: true,
        }),
      });

      if (res.ok) {
        alert('Result saved!');
        loadMatches();
        setSelectedMatch(null);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save result');
    }
  }

  async function savePlayerPerformance() {
    if (!selectedMatch || !selectedPlayer) return;

    try {
      const res = await fetch('/api/admin/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: selectedMatch.id,
          playerId: selectedPlayer,
          ...perfForm,
        }),
      });

      if (res.ok) {
        alert('Performance saved!');
        setSelectedPlayer('');
        setPerfForm({
          minutes: 90,
          goals: 0,
          assists: 0,
          cleanSheet: false,
          saves: 0,
          yellowCards: 0,
          redCards: 0,
          ownGoals: 0,
        });
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save');
      }
    } catch (error) {
      console.error('Save error:', error);
    }
  }

  // Split matches
  const pendingMatches = matches.filter(m => !m.isFinished);
  const completedMatches = matches.filter(m => m.isFinished);

  if (loading) {
    return <div className="text-white">Loading matches...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">⚽ Enter Results</h2>
        <p className="text-slate-400">Record match scores and player performances</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Match List */}
        <div className="space-y-4">
          <h3 className="font-semibold text-white">📋 Pending Matches</h3>
          {pendingMatches.length === 0 ? (
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 text-slate-400 text-center">
              No pending matches
            </div>
          ) : (
            <div className="space-y-2">
              {pendingMatches.map(match => (
                <button
                  key={match.id}
                  onClick={() => selectMatch(match)}
                  className={`w-full bg-slate-900 rounded-lg p-4 border text-left transition-colors
                    ${selectedMatch?.id === match.id 
                      ? 'border-amber-500' 
                      : 'border-slate-800 hover:border-slate-700'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-white font-medium">
                        {match.homeNation.name} vs {match.awayNation.name}
                      </span>
                      <div className="text-xs text-slate-500 mt-1">
                        {match.stage.name} • {new Date(match.kickoffTime).toLocaleDateString()}
                      </div>
                    </div>
                    {match.isStarted && !match.isFinished && (
                      <span className="text-green-400 text-sm animate-pulse">● LIVE</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <h3 className="font-semibold text-white mt-6">✅ Completed</h3>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {completedMatches.map(match => (
              <div
                key={match.id}
                className="bg-slate-900/50 rounded-lg p-3 border border-slate-800"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">
                    {match.homeNation.name} vs {match.awayNation.name}
                  </span>
                  <span className="text-amber-400 font-bold">
                    {match.homeScore} - {match.awayScore}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Result Entry */}
        {selectedMatch ? (
          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 space-y-6">
            <h3 className="font-semibold text-white">
              📝 {selectedMatch.homeNation.name} vs {selectedMatch.awayNation.name}
            </h3>

            {/* Score Entry */}
            <div className="bg-slate-800 rounded-lg p-4">
              <h4 className="text-sm text-slate-400 mb-3">Match Score</h4>
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <div className="text-sm text-slate-400 mb-2">{selectedMatch.homeNation.name}</div>
                  <input
                    type="number"
                    value={homeScore}
                    onChange={e => setHomeScore(parseInt(e.target.value) || 0)}
                    min="0"
                    className="w-20 text-center text-2xl font-bold bg-slate-700 border border-slate-600 rounded-lg py-2 text-white"
                  />
                </div>
                <span className="text-2xl text-slate-500">-</span>
                <div className="text-center">
                  <div className="text-sm text-slate-400 mb-2">{selectedMatch.awayNation.name}</div>
                  <input
                    type="number"
                    value={awayScore}
                    onChange={e => setAwayScore(parseInt(e.target.value) || 0)}
                    min="0"
                    className="w-20 text-center text-2xl font-bold bg-slate-700 border border-slate-600 rounded-lg py-2 text-white"
                  />
                </div>
              </div>
              <button
                onClick={saveMatchResult}
                className="w-full mt-4 bg-amber-500 hover:bg-amber-600 text-black font-semibold py-2 rounded-lg"
              >
                💾 Save Result
              </button>
            </div>

            {/* Player Performance */}
            <div className="bg-slate-800 rounded-lg p-4">
              <h4 className="text-sm text-slate-400 mb-3">Player Performance</h4>
              
              <select
                value={selectedPlayer}
                onChange={e => setSelectedPlayer(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white mb-4"
              >
                <option value="">Select player...</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.displayName} ({p.nation.code}) - {p.position}
                  </option>
                ))}
              </select>

              {selectedPlayer && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-slate-400">Minutes</label>
                      <input
                        type="number"
                        value={perfForm.minutes}
                        onChange={e => setPerfForm({ ...perfForm, minutes: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Goals</label>
                      <input
                        type="number"
                        value={perfForm.goals}
                        onChange={e => setPerfForm({ ...perfForm, goals: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Assists</label>
                      <input
                        type="number"
                        value={perfForm.assists}
                        onChange={e => setPerfForm({ ...perfForm, assists: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-xs text-slate-400">Saves</label>
                      <input
                        type="number"
                        value={perfForm.saves}
                        onChange={e => setPerfForm({ ...perfForm, saves: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Yellows</label>
                      <input
                        type="number"
                        value={perfForm.yellowCards}
                        onChange={e => setPerfForm({ ...perfForm, yellowCards: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Reds</label>
                      <input
                        type="number"
                        value={perfForm.redCards}
                        onChange={e => setPerfForm({ ...perfForm, redCards: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">OG</label>
                      <input
                        type="number"
                        value={perfForm.ownGoals}
                        onChange={e => setPerfForm({ ...perfForm, ownGoals: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={perfForm.cleanSheet}
                      onChange={e => setPerfForm({ ...perfForm, cleanSheet: e.target.checked })}
                      className="rounded"
                    />
                    Clean Sheet
                  </label>

                  <button
                    onClick={savePlayerPerformance}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg"
                  >
                    ➕ Add Performance
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 flex items-center justify-center text-slate-400">
            Select a match to enter results
          </div>
        )}
      </div>
    </div>
  );
}
