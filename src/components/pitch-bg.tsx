'use client';

/**
 * Broadcast-style football pitch background.
 * Deep two-tone grass, mowed stripes, SVG grain, full markings,
 * stadium lighting from the top and a soft vignette.
 * Sits behind the player rows (z-0).
 */
export default function PitchBg() {
  return (
    <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
      {/* Base grass: deep emerald with a vertical falloff so the "far end"
          (top) reads slightly lit and the near end sits darker */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, #1a8c43 0%, #166534 45%, #124e28 100%)',
        }}
      />

      {/* Irregular mottling — large soft patches of lighter/yellower and
          darker green, like real turf wear. Low-frequency turbulence drives
          the patch shapes so nothing repeats. */}
      <svg className="absolute inset-0 w-full h-full" aria-hidden>
        <filter id="pitch-mottle" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" stitchTiles="stitch" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.35
                    0 0 0 0 0.65
                    0 0 0 0 0.25
                    0.6 0.6 0 0 -0.45"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#pitch-mottle)" opacity="0.35" />
      </svg>

      {/* Fine blade-level grain */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.18] mix-blend-overlay" aria-hidden>
        <filter id="pitch-grain">
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#pitch-grain)" />
      </svg>

      {/* Field markings (SVG so they scale crisply) */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 140"
        preserveAspectRatio="none"
      >
        <g stroke="rgba(255,255,255,0.85)" strokeWidth="0.45" fill="none">
          {/* Outer pitch border */}
          <rect x="2" y="2" width="96" height="136" />

          {/* Halfway line */}
          <line x1="2" y1="70" x2="98" y2="70" />

          {/* Center circle */}
          <circle cx="50" cy="70" r="9" />

          {/* Top penalty box + goal box + arc + goal */}
          <rect x="25" y="2" width="50" height="16" />
          <rect x="38" y="2" width="24" height="6" />
          <path d="M 42 18 A 8 8 0 0 0 58 18" />
          <rect x="44" y="0" width="12" height="2" />

          {/* Bottom penalty box + goal box + arc + goal */}
          <rect x="25" y="122" width="50" height="16" />
          <rect x="38" y="132" width="24" height="6" />
          <path d="M 42 122 A 8 8 0 0 1 58 122" />
          <rect x="44" y="138" width="12" height="2" />

          {/* Corner arcs */}
          <path d="M 2 4 A 2 2 0 0 1 4 2" />
          <path d="M 96 2 A 2 2 0 0 1 98 4" />
          <path d="M 2 136 A 2 2 0 0 0 4 138" />
          <path d="M 96 138 A 2 2 0 0 0 98 136" />
        </g>
        {/* Spots */}
        <circle cx="50" cy="70" r="0.6" fill="rgba(255,255,255,0.85)" />
        <circle cx="50" cy="13" r="0.5" fill="rgba(255,255,255,0.85)" />
        <circle cx="50" cy="127" r="0.5" fill="rgba(255,255,255,0.85)" />
      </svg>

      {/* Stadium floodlight wash from the top */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_55%_at_50%_-10%,rgba(255,255,255,0.16),transparent_60%)]" />

      {/* Side shadows from the stands */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.28),transparent_12%,transparent_88%,rgba(0,0,0,0.28))]" />

      {/* Vignette anchoring the bottom */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,rgba(0,0,0,0.4)_100%)]" />
    </div>
  );
}
