'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Kit from '@/components/kit';

interface Player {
  id: string;
  displayName: string;
  position: string;
  shirtNumber: number | null;
  points: number;
  isStarting: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  benchOrder: number | null;
  nation: {
    name: string;
    code: string;
    kitColor1: string;
    kitColor2: string;
    flagUrl: string;
  };
}

interface TeamData {
  teamId: string;
  teamName: string;
  managerName: string;
  totalPoints: number;
  starting: Player[];
  bench: Player[];
}

// Player Card Component
function PlayerCard({ player }: { player: Player }) {
  return (
    <div className="flex flex-col items-center" style={{ overflow: 'visible' }}>
      <div style={{ overflow: 'visible' }}>
        <Kit
          primaryColor={player.nation.kitColor1}
          secondaryColor={player.nation.kitColor2}
          number={player.shirtNumber}
          nationCode={player.nation.code}
          size="md"
          isCaptain={player.isCaptain}
          isViceCaptain={player.isViceCaptain}
        />
      </div>
      
      {/* Name plate */}
      <div className="mt-1 bg-gray-900/90 rounded px-3 py-0.5 min-w-[90px] text-center backdrop-blur-sm">
        <div className="text-xs font-bold text-white truncate">
          {player.displayName}
        </div>
      </div>
      
      {/* Points */}
      <div className="mt-0.5 bg-emerald-500 rounded px-3 py-0.5 min-w-[90px] text-center">
        <span className="text-white text-sm font-bold">{player.points}</span>
      </div>
    </div>
  );
}

// Bench Player Card
function BenchCard({ player, index }: { player: Player; index: number }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
      <div className="text-white/40 font-bold">{index + 1}</div>
      <Kit
        primaryColor={player.nation.kitColor1}
        secondaryColor={player.nation.kitColor2}
        number={player.shirtNumber}
        nationCode={player.nation.code}
        size="xs"
      />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{player.displayName}</p>
        <p className="text-white/40 text-xs">{player.position}</p>
      </div>
      <div className="bg-gray-600 rounded px-2 py-0.5">
        <span className="text-white text-xs font-bold">{player.points}</span>
      </div>
    </div>
  );
}

export default function TeamViewPage({ params }: { params: { teamId: string } }) {
  const { teamId } = params;
  const [team, setTeam] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTeam() {
      try {
        const res = await fetch(`/api/team/${teamId}/squad`);
        if (res.ok) {
          const data = await res.json();
          setTeam(data);
        }
      } catch (error) {
        console.error('Failed to fetch team:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchTeam();
  }, [teamId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/60">Loading team...</p>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/60">Team not found</p>
      </div>
    );
  }

  // Group starting players by position
  const forwards = team.starting.filter(p => p.position === 'FWD');
  const midfielders = team.starting.filter(p => p.position === 'MID');
  const defenders = team.starting.filter(p => p.position === 'DEF');
  const goalkeeper = team.starting.filter(p => p.position === 'GK');

  return (
    <div className="max-w-3xl mx-auto px-0 sm:px-4" style={{ overflowX: 'visible' }}>
      {/* Header */}
      <div className="bg-gradient-to-r from-rose-500 to-pink-500 p-4 flex items-center justify-between rounded-t-2xl">
        <Link 
          href="/leagues"
          className="flex items-center gap-2 text-white hover:text-white/80 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-medium">Back</span>
        </Link>
        
        <div className="text-center">
          <h1 className="text-xl font-bold text-white">{team.teamName}</h1>
          <p className="text-white/80 text-sm">{team.managerName}</p>
        </div>
        
        <div className="bg-white/20 rounded-lg px-3 py-1">
          <span className="text-white font-bold">{team.totalPoints} pts</span>
        </div>
      </div>

      {/* Pitch */}
      <div className="bg-gradient-to-b from-green-700 via-green-600 to-green-700 relative" style={{ overflow: 'visible' }}>
        {/* Pitch markings */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-16 border-2 border-white border-t-0" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-16 border-2 border-white border-b-0" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border-2 border-white rounded-full" />
          <div className="absolute top-1/2 left-0 right-0 border-t border-white" />
        </div>

        <div className="relative p-4 sm:p-6 space-y-4 sm:space-y-5" style={{ overflow: 'visible' }}>
          {/* Forwards */}
          <div className="flex justify-center gap-4 sm:gap-8 overflow-x-auto scrollbar-hide" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingLeft: '12px', paddingRight: '12px' }}>
            {forwards.map(player => (
              <div key={player.id} className="flex-shrink-0" style={{ paddingLeft: '4px', paddingRight: '4px' }}>
                <PlayerCard player={player} />
              </div>
            ))}
          </div>

          {/* Midfielders */}
          <div className="flex justify-center gap-3 sm:gap-6 overflow-x-auto scrollbar-hide" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingLeft: '12px', paddingRight: '12px' }}>
            {midfielders.map(player => (
              <div key={player.id} className="flex-shrink-0" style={{ paddingLeft: '4px', paddingRight: '4px' }}>
                <PlayerCard player={player} />
              </div>
            ))}
          </div>

          {/* Defenders */}
          <div className="flex justify-center gap-3 sm:gap-6 overflow-x-auto scrollbar-hide" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingLeft: '12px', paddingRight: '12px' }}>
            {defenders.map(player => (
              <div key={player.id} className="flex-shrink-0" style={{ paddingLeft: '4px', paddingRight: '4px' }}>
                <PlayerCard player={player} />
              </div>
            ))}
          </div>

          {/* Goalkeeper */}
          <div className="flex justify-center overflow-x-auto scrollbar-hide" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingLeft: '12px', paddingRight: '12px' }}>
            {goalkeeper.map(player => (
              <div key={player.id} className="flex-shrink-0" style={{ paddingLeft: '4px', paddingRight: '4px' }}>
                <PlayerCard player={player} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bench */}
      <div className="bg-slate-900/50 border border-white/10 p-4 rounded-b-2xl">
        <h3 className="text-white font-semibold mb-3">Substitutes</h3>
        <div className="grid grid-cols-2 gap-3">
          {team.bench.map((player, i) => (
            <BenchCard key={player.id} player={player} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
