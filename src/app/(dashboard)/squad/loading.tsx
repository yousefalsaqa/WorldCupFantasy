/**
 * Next.js renders this skeleton automatically during the route transition to
 * /squad, before any client-side JS or data fetching runs. Replaces what was
 * a generic spinner with a recognisable pitch silhouette so users feel like
 * the page is already there while data loads in the background.
 */
export default function SquadLoading() {
  return (
    <div className="max-w-5xl mx-auto animate-pulse">
      {/* Header skeleton */}
      <div className="px-3 sm:px-0 mb-4">
        <div className="h-8 w-32 rounded-lg bg-white/10 mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-xl bg-white/5 border border-white/10 p-3 h-20" />
          ))}
        </div>
      </div>

      {/* Chips bar skeleton */}
      <div className="px-3 sm:px-0 mb-5">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-xl bg-white/5 h-16" />
            ))}
          </div>
        </div>
      </div>

      {/* Pitch skeleton */}
      <div className="relative rounded-2xl mb-5 sm:mb-6 overflow-hidden ring-1 ring-white/10 bg-gradient-to-b from-emerald-900/40 to-emerald-950/60">
        {/* Faint pitch lines */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white/30" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border border-white/30" />
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-12 border border-white/30 border-t-0" />
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-12 border border-white/30 border-b-0" />
        </div>
        <div className="relative z-10 p-2 sm:p-6 space-y-4 sm:space-y-7 min-h-[420px] sm:min-h-[520px]">
          {[2, 4, 4, 1].map((count, row) => (
            <div key={row} className="flex justify-center gap-1.5 sm:gap-6">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="w-12 h-14 sm:w-16 sm:h-20 rounded-lg bg-white/10" />
                  <div className="h-3 w-12 rounded bg-white/10" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Bench skeleton */}
      <div className="px-3 sm:px-0">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-3 sm:p-4">
          <div className="h-4 w-16 rounded bg-white/10 mb-3" />
          <div className="flex justify-around gap-2">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="w-10 h-12 sm:w-12 sm:h-14 rounded-lg bg-white/10" />
                <div className="h-2.5 w-10 rounded bg-white/10" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
