// App logo: a football-shield crest. Pure CSS (clip-path) so it costs
// nothing on mobile — no image request, no SVG filter work.
const SHIELD = 'polygon(50% 0%, 100% 12%, 100% 58%, 50% 100%, 0% 58%, 0% 12%)';

export default function Crest({ size = 40 }: { size?: number }) {
  const h = Math.round(size * 1.12);
  return (
    <div
      className="relative shrink-0 [filter:drop-shadow(0_3px_10px_rgba(236,72,153,0.35))]"
      style={{ width: size, height: h }}
    >
      {/* gradient rim */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-rose-400 via-pink-500 to-purple-600"
        style={{ clipPath: SHIELD }}
      />
      {/* dark core */}
      <div
        className="absolute bg-[#10141f]"
        style={{ clipPath: SHIELD, inset: Math.max(2, Math.round(size * 0.07)) }}
      />
      {/* top shine */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-transparent"
        style={{ clipPath: SHIELD }}
      />
      {/* content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-black leading-none bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent"
          style={{ fontSize: size * 0.4, letterSpacing: '-0.04em' }}
        >
          26
        </span>
        {/* tiny football */}
        <svg
          viewBox="0 0 16 16"
          style={{ width: size * 0.2, height: size * 0.2, marginTop: size * 0.05 }}
        >
          <circle cx="8" cy="8" r="7" fill="white" fillOpacity="0.9" />
          <polygon points="8,4.5 11.3,6.9 10.1,10.7 5.9,10.7 4.7,6.9" fill="#10141f" />
        </svg>
      </div>
    </div>
  );
}
