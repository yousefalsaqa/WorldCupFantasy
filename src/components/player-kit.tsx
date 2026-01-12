'use client';

import { getFlagUrl } from '@/lib/flags';

interface PlayerKitProps {
  kitColor1: string;
  kitColor2: string;
  number?: number;
  name: string;
  nationCode?: string;
  opponent?: string;
  points?: number;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  isOnBench?: boolean;
  showFlag?: boolean;
}

// Helper to determine if a color is dark
function isColorDark(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

// Get contrasting color for text on kit
function getContrastColor(kitColor: string, accentColor: string): string {
  // If the accent color provides good contrast, use it
  // Otherwise use white or black
  const kitDark = isColorDark(kitColor);
  const accentDark = isColorDark(accentColor);
  
  // If both colors are similar darkness, force contrast
  if (kitDark === accentDark) {
    return kitDark ? '#FFFFFF' : '#1a1a2e';
  }
  return accentColor;
}

export default function PlayerKit({
  kitColor1,
  kitColor2,
  number,
  name,
  nationCode,
  opponent,
  points,
  isCaptain,
  isViceCaptain,
  onClick,
  size = 'md',
  isOnBench = false,
  showFlag = true,
}: PlayerKitProps) {
  const sizes = {
    sm: { kit: 'w-14 h-16', text: 'text-[9px]', number: 'text-sm', badge: 'w-4 h-4 text-[8px]', flag: 16 },
    md: { kit: 'w-16 h-20', text: 'text-[10px]', number: 'text-base', badge: 'w-5 h-5 text-[10px]', flag: 18 },
    lg: { kit: 'w-20 h-24', text: 'text-xs', number: 'text-lg', badge: 'w-6 h-6 text-xs', flag: 22 },
  };

  const s = sizes[size];
  
  // Ensure number color contrasts with kit
  const numberColor = getContrastColor(kitColor1, kitColor2);
  
  // Generate unique gradient ID
  const gradientId = `kit-${name.replace(/\s+/g, '-')}-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div 
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 transition-all duration-200
        ${isOnBench ? 'opacity-80' : ''}
        ${onClick ? 'cursor-pointer hover:scale-105 hover:-translate-y-1' : ''}
      `}
    >
      {/* Kit container */}
      <div className={`relative ${s.kit}`}>
        {/* Shirt SVG */}
        <svg viewBox="0 0 60 70" className="w-full h-full drop-shadow-md">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={kitColor1} stopOpacity="1" />
              <stop offset="100%" stopColor={kitColor1} stopOpacity="0.85" />
            </linearGradient>
          </defs>
          {/* Shirt body */}
          <path
            d="M10 18 L10 65 Q10 68 13 68 L47 68 Q50 68 50 65 L50 18 L42 18 L42 25 Q42 30 30 30 Q18 30 18 25 L18 18 Z"
            fill={`url(#${gradientId})`}
            stroke={numberColor}
            strokeWidth="0.5"
          />
          {/* Left sleeve */}
          <path
            d="M10 18 L0 28 L0 35 L10 30 Z"
            fill={kitColor1}
            stroke={numberColor}
            strokeWidth="0.5"
          />
          {/* Right sleeve */}
          <path
            d="M50 18 L60 28 L60 35 L50 30 Z"
            fill={kitColor1}
            stroke={numberColor}
            strokeWidth="0.5"
          />
          {/* Collar */}
          <path
            d="M18 18 L22 10 Q30 8 38 10 L42 18 Q30 22 18 18"
            fill={kitColor1}
            stroke={numberColor}
            strokeWidth="0.5"
          />
          {/* Number */}
          <text
            x="30"
            y="50"
            textAnchor="middle"
            fill={numberColor}
            fontSize="18"
            fontWeight="800"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {number || '?'}
          </text>
        </svg>

        {/* Captain / Vice Captain badge */}
        {(isCaptain || isViceCaptain) && (
          <div className={`absolute -top-1 -right-1 ${s.badge} rounded-full flex items-center justify-center font-black shadow-lg
            ${isCaptain 
              ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-black ring-1 ring-amber-300' 
              : 'bg-gradient-to-br from-gray-200 to-gray-400 text-black ring-1 ring-white/50'
            }`}
          >
            {isCaptain ? 'C' : 'V'}
          </div>
        )}

        {/* Points badge */}
        {points !== undefined && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-md">
            {points}
          </div>
        )}
      </div>

      {/* Player info box */}
      <div className="bg-gradient-to-b from-[#2a2a4a] to-[#1e1e36] rounded-md px-2 py-1 min-w-[60px] shadow-lg border border-white/5">
        {/* Flag + Name row */}
        <div className="flex items-center justify-center gap-1">
          {showFlag && nationCode && (
            <img
              src={getFlagUrl(nationCode, 'sm')}
              alt={nationCode}
              width={s.flag}
              height={Math.round(s.flag * 0.75)}
              className="rounded-[2px] shadow-sm flex-shrink-0"
            />
          )}
          <span className={`${s.text} font-bold text-white truncate max-w-[45px]`}>
            {name}
          </span>
        </div>
        {/* Opponent */}
        {opponent && (
          <div className={`${s.text} text-white/50 text-center`}>
            {opponent}
          </div>
        )}
      </div>
    </div>
  );
}

// Empty slot component
export function EmptySlot({
  position,
  onClick,
  size = 'md',
}: {
  position: string;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: { kit: 'w-14 h-16' },
    md: { kit: 'w-16 h-20' },
    lg: { kit: 'w-20 h-24' },
  };

  const positionColors: Record<string, { bg: string; border: string }> = {
    GK: { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b' },
    DEF: { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e' },
    MID: { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6' },
    FWD: { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444' },
  };

  const colors = positionColors[position] || { bg: 'rgba(255,255,255,0.05)', border: '#666' };

  return (
    <div 
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 cursor-pointer group hover:scale-105 transition-all"
    >
      <div className={`relative ${sizes[size].kit}`}>
        <svg viewBox="0 0 60 70" className="w-full h-full opacity-50 group-hover:opacity-80 transition-opacity">
          <path
            d="M10 18 L10 65 Q10 68 13 68 L47 68 Q50 68 50 65 L50 18 L42 18 L42 25 Q42 30 30 30 Q18 30 18 25 L18 18 Z"
            fill={colors.bg}
            stroke={colors.border}
            strokeWidth="2"
            strokeDasharray="4 2"
          />
          <path d="M10 18 L0 28 L0 35 L10 30 Z" fill={colors.bg} stroke={colors.border} strokeWidth="2" strokeDasharray="4 2" />
          <path d="M50 18 L60 28 L60 35 L50 30 Z" fill={colors.bg} stroke={colors.border} strokeWidth="2" strokeDasharray="4 2" />
          <text x="30" y="48" textAnchor="middle" fill={colors.border} fontSize="20" fontWeight="bold">+</text>
        </svg>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-md px-3 py-1">
        <span className="text-[10px] font-bold text-white/40">{position}</span>
      </div>
    </div>
  );
}
