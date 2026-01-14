'use client';

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
  
  // Pattern types based on nation
  const horizontalStripes = ['ARG', 'USA', 'PAR', 'URU', 'GRE'].includes(nationCode);
  const verticalStripes = ['POR', 'BEL', 'CIV', 'MEX', 'ITA', 'FRA'].includes(nationCode);
  const sash = ['PER', 'ECU'].includes(nationCode);
  const hoops = ['CRO', 'JPN'].includes(nationCode);
  const chest = ['GER', 'ENG', 'NED', 'BRA', 'ESP'].includes(nationCode);
  
  // Unique ID for patterns
  const patternId = `kit-${nationCode}-${Math.random().toString(36).substr(2, 6)}`;
  
  const sizes = {
    xs: 'w-8 h-10',
    sm: 'w-12 h-14',
    md: 'w-16 h-20',
    lg: 'w-20 h-24',
  };

  return (
    <div className={`relative ${sizes[size]}`} style={{ overflow: 'visible' }}>
      <svg viewBox="0 0 60 72" className="w-full h-full drop-shadow-lg">
        <defs>
          {/* Gradient for depth */}
          <linearGradient id={`${patternId}-grad`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={primaryColor} />
            <stop offset="50%" stopColor={primaryColor} />
            <stop offset="100%" stopColor={darkerPrimary} />
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
        
        {/* Shadow */}
        <ellipse cx="30" cy="70" rx="18" ry="3" fill="rgba(0,0,0,0.15)" />
        
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
      
      {/* Captain badge */}
      {isCaptain && (
        <div className="absolute -top-0.5 -right-0.5 w-4 h-4 sm:w-5 sm:h-5 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full flex items-center justify-center shadow-lg ring-1 sm:ring-2 ring-yellow-300 z-10">
          <span className="text-[8px] sm:text-[10px] font-black text-black">C</span>
        </div>
      )}
      
      {/* Vice-Captain badge */}
      {isViceCaptain && !isCaptain && (
        <div className="absolute -top-0.5 -right-0.5 w-4 h-4 sm:w-5 sm:h-5 bg-gradient-to-br from-gray-300 to-gray-500 rounded-full flex items-center justify-center shadow-lg ring-1 sm:ring-2 ring-white z-10">
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
  showPoints?: number;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export function PlayerCard({
  player,
  onClick,
  showOpponent,
  showPoints,
  isCaptain,
  isViceCaptain,
  size = 'md',
}: PlayerCardProps) {
  const kitSize = size === 'xs' ? 'xs' : size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md';
  const nameSize = size === 'xs' ? 'text-[8px]' : size === 'sm' ? 'text-[9px]' : size === 'lg' ? 'text-sm' : 'text-xs';
  const plateWidth = size === 'xs' ? 'min-w-[50px]' : size === 'sm' ? 'min-w-[60px]' : size === 'lg' ? 'min-w-[100px]' : 'min-w-[75px]';
  
  return (
    <div 
      className={`flex flex-col items-center cursor-pointer group transition-transform hover:scale-105 hover:-translate-y-1 relative`}
      onClick={onClick}
      style={{ overflow: 'visible', padding: '2px' }}
    >
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
      </div>
      
      {/* Name plate */}
      <div className={`mt-1 px-2 py-0.5 bg-gray-900/95 rounded ${plateWidth} text-center backdrop-blur-sm`}>
        <div className={`text-white font-semibold truncate ${nameSize}`}>
          {player.displayName}
        </div>
        {showOpponent && (
          <div className="text-emerald-400 text-[10px] font-medium">
            vs {showOpponent}
          </div>
        )}
        {showPoints !== undefined && (
          <div className="text-emerald-400 text-[10px] font-bold">
            {showPoints} pts
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
    GK: 'from-yellow-500/20 to-yellow-600/20 border-yellow-500/30',
    DEF: 'from-blue-500/20 to-blue-600/20 border-blue-500/30',
    MID: 'from-green-500/20 to-green-600/20 border-green-500/30',
    FWD: 'from-red-500/20 to-red-600/20 border-red-500/30',
  };
  
  return (
    <div 
      className={`flex flex-col items-center cursor-pointer group transition-transform hover:scale-105 active:scale-95 touch-manipulation`}
      onClick={onClick}
    >
      {/* Smaller size to match xs player cards */}
      <div className={`w-8 h-10 sm:w-12 sm:h-14 rounded-xl bg-gradient-to-b ${posColors[position]} border-2 border-dashed flex items-center justify-center`}>
        <span className="text-2xl sm:text-3xl text-white/60 group-hover:text-white/90 group-active:text-white transition-colors font-light">+</span>
      </div>
      <div className="mt-1 px-2 py-0.5 bg-gray-900/50 rounded">
        <span className="text-white/60 text-[8px] sm:text-xs font-medium">{position}</span>
      </div>
    </div>
  );
}
