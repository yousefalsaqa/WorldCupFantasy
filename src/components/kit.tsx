'use client';

import { useId } from 'react';

interface KitProps {
  primaryColor: string;
  secondaryColor: string;
  number?: number | null;
  nationCode?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  showRemove?: boolean;
}

// Get contrasting color for text
function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

// Lighten/darken a color
function adjustColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

export default function Kit({
  primaryColor,
  secondaryColor,
  number,
  nationCode = '',
  size = 'md',
  isCaptain = false,
  isViceCaptain = false,
  showRemove = false,
}: KitProps) {
  const textColor = getContrastColor(primaryColor);
  const darkerPrimary = adjustColor(primaryColor, -15);
  const lighterPrimary = adjustColor(primaryColor, 12);

  // Pattern types based on nation
  const horizontalStripes = ['ARG', 'USA', 'PAR', 'URU', 'GRE'].includes(nationCode);
  const verticalStripes = ['POR', 'BEL', 'CIV', 'MEX', 'ITA', 'FRA'].includes(nationCode);
  const sash = ['PER', 'ECU'].includes(nationCode);
  const hoops = ['CRO', 'JPN'].includes(nationCode);
  const chest = ['GER', 'ENG', 'NED', 'BRA', 'ESP'].includes(nationCode);

  // Stable unique ID for SVG <defs>. useId is SSR-safe and survives re-renders,
  // so the pattern definitions don't get re-created on every state change.
  const reactId = useId().replace(/:/g, '-');
  const patternId = `kit-${nationCode || 'x'}${reactId}`;

  const sizes = {
    xs: 'w-9 h-11',
    sm: 'w-12 h-14',
    md: 'w-16 h-20',
    lg: 'w-20 h-24',
  };

  return (
    <div className={`relative ${sizes[size]}`} style={{ overflow: 'visible' }}>
      <svg viewBox="0 0 60 72" className="w-full h-full drop-shadow-lg">
        <defs>
          {/* Vertical 3D depth gradient */}
          <linearGradient id={`${patternId}-grad`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={lighterPrimary} />
            <stop offset="50%" stopColor={primaryColor} />
            <stop offset="100%" stopColor={darkerPrimary} />
          </linearGradient>

          {/* Horizontal sheen highlight */}
          <linearGradient id={`${patternId}-sheen`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="40%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="60%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          {/* Horizontal stripes pattern */}
          {horizontalStripes && (
            <pattern id={`${patternId}-hstripes`} patternUnits="userSpaceOnUse" width="60" height="8">
              <rect width="60" height="4" fill={primaryColor} />
              <rect y="4" width="60" height="4" fill={secondaryColor} />
            </pattern>
          )}

          {/* Vertical stripes pattern */}
          {verticalStripes && (
            <pattern id={`${patternId}-vstripes`} patternUnits="userSpaceOnUse" width="12" height="72">
              <rect width="6" height="72" fill={primaryColor} />
              <rect x="6" width="6" height="72" fill={secondaryColor} />
            </pattern>
          )}

          {/* Hoops/checkerboard pattern */}
          {hoops && (
            <pattern id={`${patternId}-hoops`} patternUnits="userSpaceOnUse" width="8" height="8">
              <rect width="4" height="4" fill={primaryColor} />
              <rect x="4" width="4" height="4" fill={secondaryColor} />
              <rect y="4" width="4" height="4" fill={secondaryColor} />
              <rect x="4" y="4" width="4" height="4" fill={primaryColor} />
            </pattern>
          )}
        </defs>

        {/* Drop shadow on the pitch under the kit */}
        <ellipse cx="30" cy="70" rx="18" ry="3" fill="rgba(0,0,0,0.25)" />

        {/* Shirt body */}
        <path
          d="M12 20 L12 65 Q12 68 15 68 L45 68 Q48 68 48 65 L48 20 L40 20 Q40 28 30 28 Q20 28 20 20 Z"
          fill={
            horizontalStripes ? `url(#${patternId}-hstripes)` :
            verticalStripes ? `url(#${patternId}-vstripes)` :
            hoops ? `url(#${patternId}-hoops)` :
            `url(#${patternId}-grad)`
          }
        />

        {/* Sheen overlay for shine */}
        <path
          d="M12 20 L12 65 Q12 68 15 68 L45 68 Q48 68 48 65 L48 20 L40 20 Q40 28 30 28 Q20 28 20 20 Z"
          fill={`url(#${patternId}-sheen)`}
          opacity="0.6"
        />

        {/* Left sleeve */}
        <path
          d="M12 20 L2 30 L2 38 Q2 40 4 40 L12 36 Z"
          fill={primaryColor}
        />

        {/* Right sleeve */}
        <path
          d="M48 20 L58 30 L58 38 Q58 40 56 40 L48 36 Z"
          fill={primaryColor}
        />

        {/* Captain armband - real armband on the left sleeve */}
        {isCaptain && (
          <>
            <path
              d="M5 32 Q4 33 5 35 L11 33 L11 31 Z"
              fill="#fbbf24"
              stroke="#000"
              strokeWidth="0.3"
            />
            <text x="7.5" y="34" fontSize="3" fontWeight="900" fill="#000" fontFamily="Arial Black">C</text>
          </>
        )}
        {isViceCaptain && !isCaptain && (
          <>
            <path
              d="M5 32 Q4 33 5 35 L11 33 L11 31 Z"
              fill="#e5e7eb"
              stroke="#000"
              strokeWidth="0.3"
            />
            <text x="7.5" y="34" fontSize="3" fontWeight="900" fill="#000" fontFamily="Arial Black">V</text>
          </>
        )}

        {/* Collar */}
        <path
          d="M20 20 L24 12 Q30 10 36 12 L40 20 Q30 24 20 20"
          fill={secondaryColor}
        />

        {/* Collar inner */}
        <path
          d="M23 18 L26 14 Q30 13 34 14 L37 18 Q30 20 23 18"
          fill={primaryColor}
        />

        {/* Sash overlay */}
        {sash && (
          <path
            d="M12 20 L48 65"
            stroke={secondaryColor}
            strokeWidth="8"
            fill="none"
          />
        )}

        {/* Chest band overlay */}
        {chest && (
          <rect x="12" y="32" width="36" height="10" fill={secondaryColor} opacity="0.9" />
        )}

        {/* Sleeve trim */}
        <path d="M2 38 L12 34" stroke={secondaryColor} strokeWidth="2" />
        <path d="M58 38 L48 34" stroke={secondaryColor} strokeWidth="2" />

        {/* Bottom trim */}
        <path d="M12 65 L48 65" stroke={secondaryColor} strokeWidth="2" />

        {/* Number */}
        {number && (
          <>
            {/* Number shadow */}
            <text
              x="31"
              y="52"
              textAnchor="middle"
              fill="rgba(0,0,0,0.3)"
              fontSize="20"
              fontWeight="900"
              fontFamily="Arial Black, sans-serif"
            >
              {number}
            </text>
            {/* Number */}
            <text
              x="30"
              y="51"
              textAnchor="middle"
              fill={textColor}
              fontSize="20"
              fontWeight="900"
              fontFamily="Arial Black, sans-serif"
              style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.2)' }}
            >
              {number}
            </text>
          </>
        )}
      </svg>

      {/* Captain badge (top-LEFT corner). Visual-only change – moved here so
          the live-points pill can live in the top-right slot regardless of
          captain status. The SVG armband on the sleeve (above) is unchanged. */}
      {isCaptain && (
        <div className="absolute -top-1 -left-1 w-4 h-4 sm:w-5 sm:h-5 bg-gradient-to-br from-yellow-300 to-amber-500 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(251,191,36,0.6)] ring-1 sm:ring-2 ring-yellow-200/80 z-10 animate-pulse-slow">
          <span className="text-[8px] sm:text-[10px] font-black text-black">C</span>
        </div>
      )}

      {/* Vice-Captain badge (top-LEFT corner) */}
      {isViceCaptain && !isCaptain && (
        <div className="absolute -top-1 -left-1 w-4 h-4 sm:w-5 sm:h-5 bg-gradient-to-br from-gray-200 to-gray-400 rounded-full flex items-center justify-center shadow-lg ring-1 sm:ring-2 ring-white/70 z-10">
          <span className="text-[8px] sm:text-[10px] font-black text-black">V</span>
        </div>
      )}

      {/* Remove indicator */}
      {showRemove && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-xs">×</span>
        </div>
      )}
    </div>
  );
}

// Player card with kit, name, and info
export type PlayerStatus = 'available' | 'doubt' | 'injured' | 'suspended';

interface PlayerCardProps {
  player: {
    id: string;
    displayName: string;
    position: string;
    shirtNumber?: number | null;
    nation?: {
      code: string;
      name: string;
      kitColor1: string;
      kitColor2: string;
    };
  };
  onClick?: () => void;
  showOpponent?: string;
  /** Difficulty 1 (easy) → 5 (hard). Colors the opponent badge FPL-style. */
  difficulty?: 1 | 2 | 3 | 4 | 5;
  showPoints?: number;
  /** Live/total points pill */
  livePoints?: number;
  /** Last 5 game points to render as form dots */
  form?: number[];
  /** Player availability status */
  status?: PlayerStatus;
  /** True when this player's nation is currently playing */
  isPlaying?: boolean;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  /** Highlight when player is selected for substitution */
  selectedForSub?: boolean;
  /** Dim card when not a valid swap target during sub-mode */
  dimmed?: boolean;
  /** Glow this card when it IS a valid swap target during sub-mode */
  validTarget?: boolean;
  /** Drag-and-drop handlers (HTML5 DnD on desktop) */
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

function difficultyClasses(d?: 1 | 2 | 3 | 4 | 5): string {
  switch (d) {
    case 1: return 'bg-emerald-500 text-white';
    case 2: return 'bg-emerald-700/90 text-emerald-100';
    case 3: return 'bg-slate-500/90 text-white';
    case 4: return 'bg-rose-600/95 text-white';
    case 5: return 'bg-rose-900 text-rose-100';
    default: return 'bg-slate-700/90 text-white';
  }
}

function statusBadge(status?: PlayerStatus) {
  if (!status || status === 'available') return null;
  const map = {
    doubt: { bg: 'bg-amber-400', text: '?', ring: 'ring-amber-300' },
    injured: { bg: 'bg-red-500', text: '+', ring: 'ring-red-300' },
    suspended: { bg: 'bg-red-700', text: '!', ring: 'ring-red-400' },
  } as const;
  const s = map[status];
  // Bottom-left corner so it never collides with the captain/vice badge
  // (top-left) or the live-points pill (top-right).
  return (
    <div className={`absolute -bottom-1 -left-1 z-10 w-4 h-4 sm:w-5 sm:h-5 rounded-full ${s.bg} ring-1 sm:ring-2 ${s.ring} flex items-center justify-center shadow-md`}>
      <span className="text-black text-[9px] sm:text-[10px] font-black leading-none">{s.text}</span>
    </div>
  );
}

function formDotColor(pts: number): string {
  if (pts >= 8) return 'bg-emerald-400';
  if (pts >= 5) return 'bg-emerald-600';
  if (pts >= 2) return 'bg-amber-400';
  if (pts >= 1) return 'bg-orange-500';
  return 'bg-rose-600';
}

export function PlayerCard({
  player,
  onClick,
  showOpponent,
  difficulty,
  showPoints,
  livePoints,
  form,
  status,
  isPlaying,
  isCaptain,
  isViceCaptain,
  selectedForSub,
  dimmed,
  validTarget,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  size = 'md',
}: PlayerCardProps) {
  const kitSize = size === 'xs' ? 'xs' : size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md';
  const nameSize = size === 'xs' ? 'text-[9px]' : size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-sm' : 'text-xs';
  const plateWidth = size === 'xs' ? 'min-w-[58px]' : size === 'sm' ? 'min-w-[68px]' : size === 'lg' ? 'min-w-[100px]' : 'min-w-[78px]';

  return (
    <div
      className={`flex flex-col items-center cursor-pointer group relative transition-all duration-200 active:scale-95 ${
        selectedForSub ? '' : dimmed ? 'opacity-30 grayscale' : 'hover:-translate-y-1 hover:scale-[1.04]'
      } ${validTarget ? 'animate-pulse' : ''}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{ overflow: 'visible', padding: '2px' }}
    >
      {/* Selected-for-sub ring (player you picked) */}
      {selectedForSub && (
        <div className="absolute -inset-1 rounded-2xl bg-amber-400/20 ring-2 ring-amber-400 animate-pulse pointer-events-none" />
      )}

      {/* Valid drop / swap target glow */}
      {validTarget && !selectedForSub && (
        <div className="absolute -inset-1 rounded-2xl bg-emerald-400/15 ring-2 ring-emerald-400 pointer-events-none shadow-[0_0_15px_rgba(52,211,153,0.6)]" />
      )}

      <div className="relative" style={{ overflow: 'visible' }}>
        <Kit
          primaryColor={player.nation?.kitColor1 || '#FFFFFF'}
          secondaryColor={player.nation?.kitColor2 || '#000000'}
          number={player.shirtNumber}
          nationCode={player.nation?.code || ''}
          size={kitSize}
          isCaptain={isCaptain}
          isViceCaptain={isViceCaptain}
        />

        {/* Status badge bottom-left */}
        {statusBadge(status)}

        {/* Live points pill – always top-right now that captain/vice live in
            the top-LEFT slot. Coexists cleanly: C/V badge top-left, points
            top-right, status (if any) bottom-left. */}
        {livePoints !== undefined && (
          <div className="absolute -top-1 -right-1 z-10 min-w-[18px] h-[18px] sm:min-w-[22px] sm:h-[22px] px-1 rounded-full bg-emerald-500 ring-2 ring-emerald-300/70 flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.6)]">
            <span className="text-white text-[9px] sm:text-[11px] font-black leading-none">{livePoints}</span>
          </div>
        )}

        {/* Live "playing" indicator */}
        {isPlaying && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-600 ring-1 ring-red-300/60 shadow">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            <span className="text-white text-[8px] font-black tracking-wider">LIVE</span>
          </div>
        )}
      </div>

      {/* Name plate */}
      <div className={`mt-1 px-1.5 py-0.5 bg-slate-950/95 rounded-md ring-1 ring-white/10 ${plateWidth} text-center backdrop-blur-sm shadow-md`}>
        <div className={`text-white font-bold truncate leading-tight ${nameSize}`}>
          {player.displayName}
        </div>

        {/* Opponent (FDR colored) */}
        {showOpponent && (
          <div className={`mt-0.5 px-1 py-[1px] rounded-sm text-[9px] font-extrabold tracking-wide ${difficultyClasses(difficulty)}`}>
            {showOpponent}
          </div>
        )}

        {showPoints !== undefined && (
          <div className="text-emerald-400 text-[10px] font-bold">
            {showPoints} pts
          </div>
        )}

        {/* Form dots (last up to 5 games) */}
        {form && form.length > 0 && (
          <div className="flex items-center justify-center gap-[2px] mt-0.5">
            {form.slice(-5).map((p, i) => (
              <span
                key={i}
                className={`w-1 h-1 sm:w-[5px] sm:h-[5px] rounded-full ${formDotColor(p)}`}
                title={`Last ${form.slice(-5).length - i}: ${p} pts`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Empty slot for squad builder
interface EmptySlotProps {
  position: string;
  onClick?: () => void;
}

export function EmptySlot({ position, onClick }: EmptySlotProps) {
  const posColors: Record<string, string> = {
    GK: 'from-amber-500/30 to-amber-700/20 border-amber-400/50 text-amber-200',
    DEF: 'from-sky-500/30 to-sky-700/20 border-sky-400/50 text-sky-200',
    MID: 'from-emerald-500/30 to-emerald-700/20 border-emerald-400/50 text-emerald-200',
    FWD: 'from-rose-500/30 to-rose-700/20 border-rose-400/50 text-rose-200',
  };

  return (
    <div
      className={`flex flex-col items-center cursor-pointer group transition-all hover:scale-110 active:scale-95 touch-manipulation`}
      onClick={onClick}
    >
      <div className={`w-9 h-11 sm:w-12 sm:h-14 rounded-xl bg-gradient-to-b ${posColors[position]} border-2 border-dashed flex items-center justify-center shadow-inner backdrop-blur-sm group-hover:shadow-lg`}>
        <span className="text-2xl sm:text-3xl group-hover:text-white transition-colors font-light leading-none">+</span>
      </div>
      <div className="mt-1 px-2 py-0.5 bg-slate-950/80 rounded-md ring-1 ring-white/10">
        <span className="text-white/70 text-[9px] sm:text-xs font-bold tracking-wide">{position}</span>
      </div>
    </div>
  );
}
