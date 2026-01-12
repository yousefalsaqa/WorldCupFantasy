'use client';

import PlayerKit, { EmptySlot } from './player-kit';

interface Player {
  id: string;
  displayName: string;
  position: string;
  shirtNumber: number | null;
  nation: {
    code: string;
    kitColor1: string;
    kitColor2: string;
  };
}

interface SquadPlayer {
  id: string;
  player: Player;
  isStarting: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  benchOrder: number | null;
}

interface PitchViewProps {
  squad: SquadPlayer[];
  onPlayerClick?: (squadPlayer: SquadPlayer) => void;
  onEmptyClick?: (position: string) => void;
  nextOpponents?: Record<string, string>; // nationCode -> opponent string
}

export default function PitchView({ 
  squad, 
  onPlayerClick, 
  onEmptyClick,
  nextOpponents = {},
}: PitchViewProps) {
  // Split into starting XI and bench
  const starting = squad.filter(sp => sp.isStarting);
  const bench = squad.filter(sp => !sp.isStarting).sort((a, b) => (a.benchOrder || 0) - (b.benchOrder || 0));

  // Group starting XI by position
  const gk = starting.filter(sp => sp.player.position === 'GK');
  const def = starting.filter(sp => sp.player.position === 'DEF');
  const mid = starting.filter(sp => sp.player.position === 'MID');
  const fwd = starting.filter(sp => sp.player.position === 'FWD');

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Pitch */}
      <div className="relative bg-gradient-to-b from-[#2d8a4e] to-[#1e6b3a] rounded-t-3xl overflow-hidden">
        {/* Pitch lines */}
        <div className="absolute inset-0">
          {/* Center circle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-2 border-white/20 rounded-full"></div>
          {/* Center line */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/20"></div>
          {/* Penalty areas */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-20 border-2 border-b-0 border-white/20"></div>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-20 border-2 border-t-0 border-white/20"></div>
        </div>

        {/* Players on pitch */}
        <div className="relative z-10 py-6 px-4 space-y-4">
          {/* Forwards */}
          <div className="flex justify-center gap-4">
            {fwd.length > 0 ? (
              fwd.map(sp => (
                <PlayerKit
                  key={sp.id}
                  kitColor1={sp.player.nation.kitColor1}
                  kitColor2={sp.player.nation.kitColor2}
                  number={sp.player.shirtNumber || undefined}
                  name={sp.player.displayName}
                  opponent={nextOpponents[sp.player.nation.code]}
                  isCaptain={sp.isCaptain}
                  isViceCaptain={sp.isViceCaptain}
                  onClick={() => onPlayerClick?.(sp)}
                />
              ))
            ) : (
              <EmptySlot position="FWD" onClick={() => onEmptyClick?.('FWD')} />
            )}
          </div>

          {/* Midfielders */}
          <div className="flex justify-center gap-4">
            {mid.length > 0 ? (
              mid.map(sp => (
                <PlayerKit
                  key={sp.id}
                  kitColor1={sp.player.nation.kitColor1}
                  kitColor2={sp.player.nation.kitColor2}
                  number={sp.player.shirtNumber || undefined}
                  name={sp.player.displayName}
                  opponent={nextOpponents[sp.player.nation.code]}
                  isCaptain={sp.isCaptain}
                  isViceCaptain={sp.isViceCaptain}
                  onClick={() => onPlayerClick?.(sp)}
                />
              ))
            ) : (
              <>
                <EmptySlot position="MID" onClick={() => onEmptyClick?.('MID')} />
                <EmptySlot position="MID" onClick={() => onEmptyClick?.('MID')} />
              </>
            )}
          </div>

          {/* Defenders */}
          <div className="flex justify-center gap-4">
            {def.length > 0 ? (
              def.map(sp => (
                <PlayerKit
                  key={sp.id}
                  kitColor1={sp.player.nation.kitColor1}
                  kitColor2={sp.player.nation.kitColor2}
                  number={sp.player.shirtNumber || undefined}
                  name={sp.player.displayName}
                  opponent={nextOpponents[sp.player.nation.code]}
                  isCaptain={sp.isCaptain}
                  isViceCaptain={sp.isViceCaptain}
                  onClick={() => onPlayerClick?.(sp)}
                />
              ))
            ) : (
              <>
                <EmptySlot position="DEF" onClick={() => onEmptyClick?.('DEF')} />
                <EmptySlot position="DEF" onClick={() => onEmptyClick?.('DEF')} />
                <EmptySlot position="DEF" onClick={() => onEmptyClick?.('DEF')} />
              </>
            )}
          </div>

          {/* Goalkeeper */}
          <div className="flex justify-center">
            {gk.length > 0 ? (
              gk.map(sp => (
                <PlayerKit
                  key={sp.id}
                  kitColor1={sp.player.nation.kitColor1}
                  kitColor2={sp.player.nation.kitColor2}
                  number={sp.player.shirtNumber || undefined}
                  name={sp.player.displayName}
                  opponent={nextOpponents[sp.player.nation.code]}
                  isCaptain={sp.isCaptain}
                  isViceCaptain={sp.isViceCaptain}
                  onClick={() => onPlayerClick?.(sp)}
                />
              ))
            ) : (
              <EmptySlot position="GK" onClick={() => onEmptyClick?.('GK')} />
            )}
          </div>
        </div>
      </div>

      {/* Bench */}
      <div className="bg-[#1a1a2e] rounded-b-3xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-white/40 uppercase tracking-wider">Substitutes</span>
          <span className="text-xs text-white/30">{bench.length}/4</span>
        </div>
        <div className="flex justify-around">
          {bench.length > 0 ? (
            bench.map(sp => (
              <PlayerKit
                key={sp.id}
                kitColor1={sp.player.nation.kitColor1}
                kitColor2={sp.player.nation.kitColor2}
                number={sp.player.shirtNumber || undefined}
                name={sp.player.displayName}
                opponent={nextOpponents[sp.player.nation.code]}
                onClick={() => onPlayerClick?.(sp)}
                size="sm"
                isOnBench
              />
            ))
          ) : (
            <>
              <EmptySlot position="GK" onClick={() => onEmptyClick?.('GK')} size="sm" />
              <EmptySlot position="DEF" onClick={() => onEmptyClick?.('DEF')} size="sm" />
              <EmptySlot position="MID" onClick={() => onEmptyClick?.('MID')} size="sm" />
              <EmptySlot position="FWD" onClick={() => onEmptyClick?.('FWD')} size="sm" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
