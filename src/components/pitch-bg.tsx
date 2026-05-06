'use client';

/**
 * Realistic football pitch background.
 * Mowed stripes, full markings, vignette, goal nets and corner arcs.
 * Sits behind the player rows (z-0).
 */
export default function PitchBg() {
  return (
    <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
      {/* Base pitch color */}
      <div className="absolute inset-0 bg-[#1f7a3a]" />

      {/* Mowed stripes (alternating darker / lighter horizontal bands) */}
      <div
        className="absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(255,255,255,0.06) 0 8%, rgba(0,0,0,0.10) 8% 16%)',
        }}
      />

      {/* Subtle "grass texture" using radial noise */}
      <div
        className="absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(circle at 10% 10%, rgba(255,255,255,0.18) 0, transparent 30%), radial-gradient(circle at 90% 90%, rgba(0,0,0,0.25) 0, transparent 35%)',
        }}
      />

      {/* Vignette / stadium lighting */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_rgba(0,0,0,0.45)_100%)]" />

      {/* Field markings (SVG so they scale crisply) */}
      <svg
        className="absolute inset-0 w-full h-full opacity-90"
        viewBox="0 0 100 140"
        preserveAspectRatio="none"
      >
        {/* Outer pitch border */}
        <rect x="2" y="2" width="96" height="136" fill="none" stroke="white" strokeWidth="0.4" />

        {/* Halfway line */}
        <line x1="2" y1="70" x2="98" y2="70" stroke="white" strokeWidth="0.4" />

        {/* Center circle + spot */}
        <circle cx="50" cy="70" r="9" fill="none" stroke="white" strokeWidth="0.4" />
        <circle cx="50" cy="70" r="0.6" fill="white" />

        {/* Top penalty box */}
        <rect x="25" y="2" width="50" height="16" fill="none" stroke="white" strokeWidth="0.4" />
        {/* Top goal box */}
        <rect x="38" y="2" width="24" height="6" fill="none" stroke="white" strokeWidth="0.4" />
        {/* Top penalty arc */}
        <path d="M 42 18 A 8 8 0 0 0 58 18" fill="none" stroke="white" strokeWidth="0.4" />
        {/* Top penalty spot */}
        <circle cx="50" cy="13" r="0.5" fill="white" />
        {/* Top goal */}
        <rect x="44" y="0" width="12" height="2" fill="none" stroke="white" strokeWidth="0.4" />

        {/* Bottom penalty box */}
        <rect x="25" y="122" width="50" height="16" fill="none" stroke="white" strokeWidth="0.4" />
        {/* Bottom goal box */}
        <rect x="38" y="132" width="24" height="6" fill="none" stroke="white" strokeWidth="0.4" />
        {/* Bottom penalty arc */}
        <path d="M 42 122 A 8 8 0 0 1 58 122" fill="none" stroke="white" strokeWidth="0.4" />
        {/* Bottom penalty spot */}
        <circle cx="50" cy="127" r="0.5" fill="white" />
        {/* Bottom goal */}
        <rect x="44" y="138" width="12" height="2" fill="none" stroke="white" strokeWidth="0.4" />

        {/* Corner arcs */}
        <path d="M 2 4 A 2 2 0 0 1 4 2" fill="none" stroke="white" strokeWidth="0.4" />
        <path d="M 96 2 A 2 2 0 0 1 98 4" fill="none" stroke="white" strokeWidth="0.4" />
        <path d="M 2 136 A 2 2 0 0 0 4 138" fill="none" stroke="white" strokeWidth="0.4" />
        <path d="M 96 138 A 2 2 0 0 0 98 136" fill="none" stroke="white" strokeWidth="0.4" />
      </svg>

      {/* Inner glow / "lights on" feel */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-20%,_rgba(255,255,255,0.10),transparent_60%)]" />
    </div>
  );
}
