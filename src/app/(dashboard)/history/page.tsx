'use client';

import { useState, useEffect } from 'react';
import { getFlagUrl } from '@/lib/flags';

const STAGES = [
  { id: 'GR1', name: 'Group Stage - Round 1' },
  { id: 'GR2', name: 'Group Stage - Round 2' },
  { id: 'GR3', name: 'Group Stage - Round 3' },
  { id: 'R32', name: 'Round of 32' },
  { id: 'R16', name: 'Round of 16' },
  { id: 'QF', name: 'Quarter Finals' },
  { id: 'SF', name: 'Semi Finals' },
  { id: '3RD', name: 'Third Place' },
  { id: 'F', name: 'Final' },
];

interface MatchDetail {
  matchId: string;
  opponent: string;
  minutesPlayed: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  saves: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  goalsConceeded: number;
  bonusPoints: number;
  totalPoints: number;
}

interface PlayerBreakdown {
  playerId: string;
  displayName: string;
  position: string;
  nation: { name: string; code: string; kitColor1: string; kitColor2: string };
  shirtNumber: number | null;
  isStarting: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  totalPoints: number;
  matches: MatchDetail[];
}

interface TeamStageData {
  rawPoints: number;
  captainPoints: number;
  transferHits: number;
  totalPoints: number;
  chipUsed: string | null;
  // Multi-chip array (chip stacking). Empty array if none active.
  chipsUsed: string[];
}

interface GameweekData {
  stage: { stageId: string; name: string };
  teamStage: TeamStageData | null;
  players: PlayerBreakdown[];
  hasData: boolean;
}

const CHIP_NAMES: Record<string, string> = {
  WILDCARD_1: 'Wildcard',
  WILDCARD_2: 'Wildcard 2',
  TRIPLE_CAPTAIN: 'Triple Captain',
  BENCH_BOOST: 'Bench Boost',
  FREE_HIT: 'Free Hit',
};

export default function HistoryPage() {
  const [selectedStage, setSelectedStage] = useState(STAGES[0].id);
  const [data, setData] = useState<GameweekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/gameweek/${selectedStage}`, { credentials: 'include' });
        if (res.ok) {
          setData(await res.json());
        } else {
          setData(null);
        }
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [selectedStage]);

  const starting = data?.players.filter(p => p.isStarting) ?? [];
  const bench = data?.players.filter(p => !p.isStarting) ?? [];

  function renderBreakdownRow(label: string, value: number) {
    if (value === 0) return null;
    return (
      <div className="flex justify-between text-xs py-0.5">
        <span className="text-white/50">{label}</span>
        <span className={value > 0 ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
          {value > 0 ? `+${value}` : value}
        </span>
      </div>
    );
  }

  function renderMatchBreakdown(m: MatchDetail) {
    return (
      <div key={m.matchId} className="bg-white/[0.02] rounded-lg p-2 mt-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-white/60 font-medium">vs {m.opponent}</span>
          <span className="text-xs font-bold text-white">{m.totalPoints} pts</span>
        </div>
        <div className="space-y-0">
          {renderBreakdownRow('Appearance', m.minutesPlayed >= 60 ? 2 : m.minutesPlayed > 0 ? 1 : 0)}
          {renderBreakdownRow(`Goals (${m.goals})`, m.goals > 0 ? m.goals : 0)}
          {renderBreakdownRow(`Assists (${m.assists})`, m.assists > 0 ? m.assists : 0)}
          {m.cleanSheet && renderBreakdownRow('Clean Sheet', 1)}
          {renderBreakdownRow('Saves', m.saves > 0 ? Math.floor(m.saves / 3) : 0)}
          {renderBreakdownRow('Pen Saves', m.penaltiesSaved)}
          {renderBreakdownRow('Pen Missed', m.penaltiesMissed > 0 ? -m.penaltiesMissed * 2 : 0)}
          {renderBreakdownRow('Yellow Cards', m.yellowCards > 0 ? -m.yellowCards : 0)}
          {renderBreakdownRow('Red Cards', m.redCards > 0 ? -m.redCards * 3 : 0)}
          {renderBreakdownRow('Own Goals', m.ownGoals > 0 ? -m.ownGoals * 2 : 0)}
          {renderBreakdownRow('Bonus', m.bonusPoints)}
        </div>
      </div>
    );
  }

  function renderPlayer(p: PlayerBreakdown) {
    const isExpanded = expandedPlayer === p.playerId;

    return (
      <div key={p.playerId}>
        <button
          onClick={() => setExpandedPlayer(isExpanded ? null : p.playerId)}
          className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              p.position === 'GK' ? 'bg-yellow-500/20 text-yellow-400' :
              p.position === 'DEF' ? 'bg-blue-500/20 text-blue-400' :
              p.position === 'MID' ? 'bg-green-500/20 text-green-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              {p.position}
            </span>
            <img src={getFlagUrl(p.nation.code)} alt="" className="w-5 h-3.5 rounded-sm object-cover" />
            <div>
              <span className="text-sm font-medium text-white">{p.displayName}</span>
              {p.isCaptain && <span className="ml-1.5 text-[10px] font-black text-yellow-400">(C)</span>}
              {p.isViceCaptain && <span className="ml-1.5 text-[10px] font-black text-white/40">(V)</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${p.totalPoints > 0 ? 'text-emerald-400' : 'text-white/40'}`}>
              {p.totalPoints}
            </span>
            <svg className={`w-4 h-4 text-white/30 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        {isExpanded && (
          <div className="px-3 pb-3">
            {p.matches.length > 0 ? (
              p.matches.map(m => renderMatchBreakdown(m))
            ) : (
              <p className="text-xs text-white/30 text-center py-2">No match data</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Points History</h1>
          <p className="text-white/40 text-sm">See how your points were earned each stage</p>
        </div>
        <select
          value={selectedStage}
          onChange={e => setSelectedStage(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm font-medium cursor-pointer hover:bg-white/10 transition-colors"
        >
          {STAGES.map(s => (
            <option key={s.id} value={s.id} className="bg-slate-900">{s.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data || !data.hasData ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
          <svg className="w-12 h-12 text-white/20 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <h3 className="text-lg font-bold text-white/60 mb-1">No Data Yet</h3>
          <p className="text-white/30 text-sm">Points breakdown will appear after matches are played</p>
        </div>
      ) : (
        <>
          {/* Stage Summary */}
          {data.teamStage && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                <p className="text-[10px] text-white/40 uppercase tracking-wider">Total</p>
                <p className="text-xl font-black text-white">{data.teamStage.totalPoints}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                <p className="text-[10px] text-white/40 uppercase tracking-wider">Raw</p>
                <p className="text-xl font-bold text-white/80">{data.teamStage.rawPoints}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                <p className="text-[10px] text-white/40 uppercase tracking-wider">Captain</p>
                <p className="text-xl font-bold text-yellow-400">+{data.teamStage.captainPoints}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                <p className="text-[10px] text-white/40 uppercase tracking-wider">Hits</p>
                <p className={`text-xl font-bold ${data.teamStage.transferHits > 0 ? 'text-red-400' : 'text-white/40'}`}>
                  {data.teamStage.transferHits > 0 ? `-${data.teamStage.transferHits}` : '0'}
                </p>
              </div>
            </div>
          )}

          {/* Active Chips — stacking-aware, renders one pill per chip. Falls
              back to the legacy single `chipUsed` if the new array isn't
              populated yet (older TeamStage rows). */}
          {(() => {
            const chips = data.teamStage?.chipsUsed?.length
              ? data.teamStage.chipsUsed
              : data.teamStage?.chipUsed
                ? [data.teamStage.chipUsed]
                : [];
            if (chips.length === 0) return null;
            return (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 mb-6 flex items-center gap-2 flex-wrap">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">
                  {chips.length === 1 ? 'Chip:' : 'Chips:'}
                </span>
                {chips.map((c) => (
                  <span
                    key={c}
                    className="text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5"
                  >
                    {CHIP_NAMES[c] || c}
                  </span>
                ))}
              </div>
            );
          })()}

          {/* Starting XI */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-bold text-white">Starting XI</h3>
            </div>
            <div className="divide-y divide-white/5">
              {starting.length > 0 ? starting.map(renderPlayer) : (
                <p className="p-4 text-white/30 text-sm text-center">No starting XI data</p>
              )}
            </div>
          </div>

          {/* Bench */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-bold text-white/60">Substitutes</h3>
            </div>
            <div className="divide-y divide-white/5">
              {bench.length > 0 ? bench.map(renderPlayer) : (
                <p className="p-4 text-white/30 text-sm text-center">No bench data</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
