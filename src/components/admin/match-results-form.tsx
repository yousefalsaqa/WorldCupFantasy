'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  Save,
  Loader2,
  AlertCircle,
  Check,
  Plus,
  X,
  Trophy,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

interface Club {
  id: string;
  name: string;
  shortName: string;
}

interface Player {
  id: string;
  displayName: string;
  position: Position;
  club: Club;
}

interface Fixture {
  id: string;
  homeClub: Club;
  awayClub: Club;
  homeScore: number | null;
  awayScore: number | null;
  isStarted: boolean;
  isFinished: boolean;
  kickoffTime: Date;
}

interface Gameweek {
  id: string;
  number: number;
  name: string;
  fixtures?: Fixture[];
}

interface MatchResultsFormProps {
  currentGameweek: (Gameweek & { fixtures: Fixture[] }) | null;
  gameweeks: Gameweek[];
  players: Player[];
}

interface PlayerPerformance {
  playerId: string;
  minutesPlayed: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  yellowCards: number;
  redCards: number;
  saves: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  ownGoals: number;
  longShotGoals: number;
}

export function MatchResultsForm({
  currentGameweek,
  gameweeks,
  players,
}: MatchResultsFormProps) {
  const router = useRouter();
  const [selectedGW, setSelectedGW] = useState(currentGameweek?.id || '');
  const [selectedFixture, setSelectedFixture] = useState<string>('');
  const [homeScore, setHomeScore] = useState<number>(0);
  const [awayScore, setAwayScore] = useState<number>(0);
  const [performances, setPerformances] = useState<PlayerPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedGameweek = gameweeks.find(gw => gw.id === selectedGW);
  const fixtures = currentGameweek?.fixtures || [];
  const fixture = fixtures.find(f => f.id === selectedFixture);

  // Get players for the selected fixture's teams
  const fixtureTeamIds = fixture 
    ? [fixture.homeClub.id, fixture.awayClub.id]
    : [];
  const availablePlayers = players.filter(p => 
    fixtureTeamIds.includes(p.club.id)
  );

  const addPerformance = (playerId: string) => {
    if (performances.some(p => p.playerId === playerId)) return;
    
    setPerformances(prev => [...prev, {
      playerId,
      minutesPlayed: 90,
      goals: 0,
      assists: 0,
      cleanSheet: false,
      yellowCards: 0,
      redCards: 0,
      saves: 0,
      penaltiesSaved: 0,
      penaltiesMissed: 0,
      ownGoals: 0,
      longShotGoals: 0,
    }]);
  };

  const removePerformance = (playerId: string) => {
    setPerformances(prev => prev.filter(p => p.playerId !== playerId));
  };

  const updatePerformance = (playerId: string, field: keyof PlayerPerformance, value: number | boolean) => {
    setPerformances(prev => prev.map(p => 
      p.playerId === playerId ? { ...p, [field]: value } : p
    ));
  };

  const handleSubmit = async () => {
    if (!selectedFixture) {
      setError('Please select a fixture');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/admin/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixtureId: selectedFixture,
          homeScore,
          awayScore,
          performances,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to save results');
        return;
      }

      setSuccess('Results saved successfully!');
      router.refresh();
      
      // Reset form
      setTimeout(() => {
        setSelectedFixture('');
        setPerformances([]);
        setSuccess('');
      }, 2000);
    } catch {
      setError('Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Gameweek & Fixture Selection */}
      <div className="card p-6">
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Gameweek Selector */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-2">
              Gameweek
            </label>
            <select
              value={selectedGW}
              onChange={(e) => {
                setSelectedGW(e.target.value);
                setSelectedFixture('');
              }}
              className="input-field"
            >
              <option value="">Select gameweek</option>
              {gameweeks.map(gw => (
                <option key={gw.id} value={gw.id}>
                  {gw.name}
                </option>
              ))}
            </select>
          </div>

          {/* Fixture Selector */}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-2">
              Match
            </label>
            <select
              value={selectedFixture}
              onChange={(e) => {
                setSelectedFixture(e.target.value);
                setPerformances([]);
              }}
              className="input-field"
              disabled={!selectedGW}
            >
              <option value="">Select match</option>
              {fixtures.map(f => (
                <option key={f.id} value={f.id}>
                  {f.homeClub.shortName} vs {f.awayClub.shortName}
                  {f.isFinished && ' ✓'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Match Result Entry */}
      {fixture && (
        <>
          {/* Score Entry */}
          <div className="card p-6">
            <h3 className="font-semibold text-laliga-cream mb-4">Match Score</h3>
            
            <div className="flex items-center justify-center gap-6">
              <div className="text-center">
                <p className="text-lg font-bold text-laliga-cream mb-2">
                  {fixture.homeClub.name}
                </p>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={homeScore}
                  onChange={(e) => setHomeScore(parseInt(e.target.value) || 0)}
                  className="input-field w-20 text-center text-2xl font-bold"
                />
              </div>
              
              <span className="text-2xl text-surface-500">-</span>
              
              <div className="text-center">
                <p className="text-lg font-bold text-laliga-cream mb-2">
                  {fixture.awayClub.name}
                </p>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={awayScore}
                  onChange={(e) => setAwayScore(parseInt(e.target.value) || 0)}
                  className="input-field w-20 text-center text-2xl font-bold"
                />
              </div>
            </div>
          </div>

          {/* Player Performances */}
          <div className="card">
            <div className="p-4 border-b border-surface-800 flex items-center justify-between">
              <h3 className="font-semibold text-laliga-cream">Player Performances</h3>
              <span className="text-sm text-surface-400">
                {performances.length} players added
              </span>
            </div>

            {/* Add Player */}
            <div className="p-4 border-b border-surface-800">
              <label className="block text-sm font-medium text-surface-300 mb-2">
                Add Player
              </label>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    addPerformance(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="input-field"
              >
                <option value="">Select player to add...</option>
                {availablePlayers
                  .filter(p => !performances.some(perf => perf.playerId === p.id))
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.displayName} ({p.club.shortName}) - {p.position}
                    </option>
                  ))}
              </select>
            </div>

            {/* Performance List */}
            <div className="divide-y divide-surface-800 max-h-[500px] overflow-y-auto">
              {performances.length === 0 ? (
                <div className="p-8 text-center text-surface-400">
                  Add players who participated in the match
                </div>
              ) : (
                performances.map(perf => {
                  const player = players.find(p => p.id === perf.playerId)!;
                  return (
                    <div key={perf.playerId} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            'text-xs font-bold px-2 py-0.5 rounded',
                            player.position === 'GK' && 'bg-position-gk/20 text-position-gk',
                            player.position === 'DEF' && 'bg-position-def/20 text-position-def',
                            player.position === 'MID' && 'bg-position-mid/20 text-position-mid',
                            player.position === 'FWD' && 'bg-position-fwd/20 text-position-fwd',
                          )}>
                            {player.position}
                          </span>
                          <span className="font-medium text-laliga-cream">
                            {player.displayName}
                          </span>
                          <span className="text-sm text-surface-500">
                            {player.club.shortName}
                          </span>
                        </div>
                        <button
                          onClick={() => removePerformance(perf.playerId)}
                          className="p-1 rounded hover:bg-laliga-red/20 text-surface-400 hover:text-laliga-red"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                        <div>
                          <label className="block text-xs text-surface-500 mb-1">Minutes</label>
                          <input
                            type="number"
                            min="0"
                            max="120"
                            value={perf.minutesPlayed}
                            onChange={(e) => updatePerformance(perf.playerId, 'minutesPlayed', parseInt(e.target.value) || 0)}
                            className="input-field py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-surface-500 mb-1">Goals</label>
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={perf.goals}
                            onChange={(e) => updatePerformance(perf.playerId, 'goals', parseInt(e.target.value) || 0)}
                            className="input-field py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-surface-500 mb-1">Long-shot</label>
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={perf.longShotGoals}
                            onChange={(e) => updatePerformance(perf.playerId, 'longShotGoals', parseInt(e.target.value) || 0)}
                            className="input-field py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-surface-500 mb-1">Assists</label>
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={perf.assists}
                            onChange={(e) => updatePerformance(perf.playerId, 'assists', parseInt(e.target.value) || 0)}
                            className="input-field py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-surface-500 mb-1">Yellow</label>
                          <input
                            type="number"
                            min="0"
                            max="2"
                            value={perf.yellowCards}
                            onChange={(e) => updatePerformance(perf.playerId, 'yellowCards', parseInt(e.target.value) || 0)}
                            className="input-field py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-surface-500 mb-1">Red</label>
                          <input
                            type="number"
                            min="0"
                            max="1"
                            value={perf.redCards}
                            onChange={(e) => updatePerformance(perf.playerId, 'redCards', parseInt(e.target.value) || 0)}
                            className="input-field py-1.5 text-sm"
                          />
                        </div>
                        {player.position === 'GK' && (
                          <>
                            <div>
                              <label className="block text-xs text-surface-500 mb-1">Saves</label>
                              <input
                                type="number"
                                min="0"
                                max="20"
                                value={perf.saves}
                                onChange={(e) => updatePerformance(perf.playerId, 'saves', parseInt(e.target.value) || 0)}
                                className="input-field py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-surface-500 mb-1">Pen Saves</label>
                              <input
                                type="number"
                                min="0"
                                max="5"
                                value={perf.penaltiesSaved}
                                onChange={(e) => updatePerformance(perf.playerId, 'penaltiesSaved', parseInt(e.target.value) || 0)}
                                className="input-field py-1.5 text-sm"
                              />
                            </div>
                          </>
                        )}
                        <div>
                          <label className="block text-xs text-surface-500 mb-1">Own Goals</label>
                          <input
                            type="number"
                            min="0"
                            max="5"
                            value={perf.ownGoals}
                            onChange={(e) => updatePerformance(perf.playerId, 'ownGoals', parseInt(e.target.value) || 0)}
                            className="input-field py-1.5 text-sm"
                          />
                        </div>
                        <div className="flex items-end">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={perf.cleanSheet}
                              onChange={(e) => updatePerformance(perf.playerId, 'cleanSheet', e.target.checked)}
                              className="w-4 h-4 rounded border-surface-600 bg-surface-800"
                            />
                            <span className="text-xs text-surface-400">Clean Sheet</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Alerts */}
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-laliga-red/10 border border-laliga-red/20">
              <AlertCircle className="w-5 h-5 text-laliga-red" />
              <p className="text-sm text-laliga-red">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Check className="w-5 h-5 text-emerald-400" />
              <p className="text-sm text-emerald-400">{success}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Match Results
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}


