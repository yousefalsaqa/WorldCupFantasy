'use client';

import { getFlagUrl } from '@/lib/flags';
import { formatKickoff, type TickerFixture } from '@/lib/fixture-ticker';

// Compact, stage-grouped strip of real matches. Shared by the landing page
// hero and the authenticated dashboard.
export default function FixtureTicker({ items }: { items: TickerFixture[] }) {
  if (items.length === 0) return null;
  let lastStage: string | null = null;
  return (
    <div className="relative border-t border-white/10 bg-[#080b12]">
      <div className="max-w-[1360px] mx-auto px-5 sm:px-8 h-12 flex items-center gap-5 overflow-x-auto scrollbar-hide">
        {items.map((f) => {
          const live = f.isStarted && !f.isFinished;
          const showStageLabel = f.stageId !== lastStage;
          lastStage = f.stageId;
          return (
            <div key={f.id} className="flex items-center gap-3 shrink-0">
              {showStageLabel && (
                <span className="text-[10px] font-black tracking-[0.2em] text-accent/80 uppercase pr-3 border-r border-white/10 shrink-0">
                  {f.stageId}
                </span>
              )}
              <div className="flex items-center gap-2 shrink-0 text-xs font-bold">
                {live ? (
                  <span className="text-live flex items-center gap-1 tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
                    LIVE
                  </span>
                ) : f.isFinished ? (
                  <span className="text-white/25 tracking-wider">FT</span>
                ) : (
                  <span className="text-white/25 tracking-wider">{formatKickoff(f.kickoff)}</span>
                )}
                <img src={getFlagUrl(f.home, 'sm')} alt={f.home} className="w-4 h-3 rounded-[2px] object-cover" />
                <span className="text-white/65">{f.home}</span>
                {(f.isStarted || f.isFinished) && (
                  <span className="text-ink tabular-nums">{f.homeScore}-{f.awayScore}</span>
                )}
                <span className="text-white/65">{f.away}</span>
                <img src={getFlagUrl(f.away, 'sm')} alt={f.away} className="w-4 h-3 rounded-[2px] object-cover" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
