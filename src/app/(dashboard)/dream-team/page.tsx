'use client';

import { useState, useEffect } from 'react';
import { PlayerFace } from '@/components/kit';

const STAGES = [
  { id: '', name: 'Overall' },
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

interface DreamPlayer {
  playerId: string;
  displayName: string;
  position: string;
  shirtNumber: number | null;
  currentPrice: number;
  photoUrl: string | null;
  nation: { name: string; code: string; kitColor1: string; kitColor2: string };
  totalPoints: number;
}

export default function DreamTeamPage() {
  const [selectedStage, setSelectedStage] = useState('');
  const [dreamTeam, setDreamTeam] = useState<DreamPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    async function fetchDreamTeam() {
      setLoading(true);
      try {
        const url = selectedStage
          ? `/api/dream-team?stageId=${selectedStage}`
          : '/api/dream-team';
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setDreamTeam(data.dreamTeam || []);
          setHasData(data.hasData || false);
        }
      } catch {
        console.error('Failed to fetch dream team');
      } finally {
        setLoading(false);
      }
    }
    fetchDreamTeam();
  }, [selectedStage]);

  const gks = dreamTeam.filter(p => p.position === 'GK');
  const defs = dreamTeam.filter(p => p.position === 'DEF');
  const mids = dreamTeam.filter(p => p.position === 'MID');
  const fwds = dreamTeam.filter(p => p.position === 'FWD');
  const totalPoints = dreamTeam.reduce((sum, p) => sum + p.totalPoints, 0);

  function renderPlayer(player: DreamPlayer) {
    return (
      <div key={player.playerId} className="flex flex-col items-center">
        <div className="relative">
          <PlayerFace
            photoUrl={player.photoUrl}
            primaryColor={player.nation.kitColor1}
            secondaryColor={player.nation.kitColor2}
            number={player.shirtNumber}
            nationCode={player.nation.code}
            size="sm"
          />
        </div>
        <div className="mt-1 px-2 py-0.5 bg-gray-900/95 rounded min-w-[50px] text-center backdrop-blur-sm">
          <div className="text-white font-semibold truncate text-[8px]">
            {player.displayName}
          </div>
          <div className="text-yellow-400 text-[10px] font-bold">
            {player.totalPoints} pts
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Dream Team</h1>
          <p className="text-white/40 text-sm">
            Best performing XI
            {hasData && <span className="ml-2 text-yellow-400 font-bold">{totalPoints} pts</span>}
          </p>
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
          <div className="w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !hasData || dreamTeam.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
          <svg className="w-12 h-12 text-white/20 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <h3 className="text-lg font-bold text-white/60 mb-1">No Dream Team Yet</h3>
          <p className="text-white/30 text-sm">Will be available after the first matches are played</p>
        </div>
      ) : (
        <>
          {/* Pitch */}
          <div className="relative bg-gradient-to-b from-green-700 via-green-600 to-green-700 rounded-2xl p-4 sm:p-6 overflow-hidden">
            {/* Pitch markings */}
            <div className="absolute inset-0 opacity-20 rounded-2xl">
              <div className="absolute top-1/2 left-0 right-0 h-px bg-white" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border border-white rounded-full" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-14 border-t border-l border-r border-white" />
            </div>

            {/* Gold overlay for Dream Team feel */}
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent rounded-2xl pointer-events-none" />

            <div className="relative z-10 space-y-4 sm:space-y-6">
              {/* FWD */}
              {fwds.length > 0 && (
                <div className="flex justify-center gap-4 sm:gap-8">
                  {fwds.map(renderPlayer)}
                </div>
              )}

              {/* MID */}
              {mids.length > 0 && (
                <div className="flex justify-center gap-3 sm:gap-6">
                  {mids.map(renderPlayer)}
                </div>
              )}

              {/* DEF */}
              {defs.length > 0 && (
                <div className="flex justify-center gap-3 sm:gap-6">
                  {defs.map(renderPlayer)}
                </div>
              )}

              {/* GK */}
              {gks.length > 0 && (
                <div className="flex justify-center gap-4 sm:gap-8">
                  {gks.map(renderPlayer)}
                </div>
              )}
            </div>
          </div>

          {/* Player List */}
          <div className="mt-6 bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Points Breakdown</h3>
              <span className="text-sm font-bold text-yellow-400">{totalPoints} total</span>
            </div>
            <div className="divide-y divide-white/5">
              {dreamTeam
                .sort((a, b) => b.totalPoints - a.totalPoints)
                .map((p, i) => (
                  <div key={p.playerId} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-white/20 font-bold text-sm w-5 text-right">{i + 1}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      p.position === 'GK' ? 'bg-yellow-500/20 text-yellow-400' :
                      p.position === 'DEF' ? 'bg-blue-500/20 text-blue-400' :
                      p.position === 'MID' ? 'bg-green-500/20 text-green-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {p.position}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-white truncate block">{p.displayName}</span>
                      <span className="text-[10px] text-white/40">{p.nation.name}</span>
                    </div>
                    <span className="text-sm font-bold text-yellow-400">{p.totalPoints}</span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
