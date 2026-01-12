'use client';

import { cn, formatPrice } from '@/lib/utils';
import { POSITION_COLORS } from '@/lib/constants';

type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

interface PlayerCardProps {
  player: {
    id: string;
    displayName: string;
    position: Position;
    currentPrice: number;
    photoUrl?: string | null;
    club: {
      shortName: string;
      name: string;
    };
  };
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  showPrice?: boolean;
  compact?: boolean;
}

export function PlayerCard({
  player,
  onClick,
  selected = false,
  disabled = false,
  showPrice = true,
  compact = false,
}: PlayerCardProps) {
  const positionColor = POSITION_COLORS[player.position];

  if (compact) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
          selected
            ? 'bg-laliga-gold/10 border-laliga-gold'
            : 'bg-surface-800/50 border-surface-700 hover:border-surface-600',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${positionColor}20` }}
        >
          <span className="text-sm font-bold" style={{ color: positionColor }}>
            {player.displayName.charAt(0)}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-laliga-cream truncate">
            {player.displayName}
          </p>
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold px-1.5 py-0.5 rounded"
              style={{ 
                backgroundColor: `${positionColor}20`,
                color: positionColor,
              }}
            >
              {player.position}
            </span>
            <span className="text-xs text-surface-500">{player.club.shortName}</span>
          </div>
        </div>

        {/* Price */}
        {showPrice && (
          <div className="text-right">
            <p className="font-semibold text-laliga-gold">
              {formatPrice(player.currentPrice)}
            </p>
          </div>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative w-full p-4 rounded-xl border transition-all text-left overflow-hidden group',
        selected
          ? 'bg-laliga-gold/10 border-laliga-gold shadow-glow'
          : 'bg-surface-800/50 border-surface-700 hover:border-surface-600 hover:bg-surface-800/70',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {/* Position badge */}
      <div
        className="absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded"
        style={{ 
          backgroundColor: `${positionColor}20`,
          color: positionColor,
        }}
      >
        {player.position}
      </div>

      {/* Avatar */}
      <div className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
          style={{ 
            background: `linear-gradient(135deg, ${positionColor}40, ${positionColor}10)`,
          }}
        >
          <span className="text-xl font-bold text-laliga-cream">
            {player.displayName.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </span>
        </div>

        <div className="flex-1 pt-1">
          <p className="font-semibold text-laliga-cream mb-1">
            {player.displayName}
          </p>
          <p className="text-sm text-surface-400 mb-3">
            {player.club.name}
          </p>
          
          {showPrice && (
            <p className="text-lg font-bold text-laliga-gold">
              {formatPrice(player.currentPrice)}
            </p>
          )}
        </div>
      </div>

      {/* Selected indicator */}
      {selected && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-laliga-gold" />
      )}
    </button>
  );
}


