'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getFlagUrl } from '@/lib/flags';
import { useUserTimezone } from '@/hooks/useTimezone';
import {
  formatDateWithWeekday,
  formatTime as fmtTime,
  parseFixtureDateTime,
} from '@/lib/format-time';
import { TimezoneIndicator } from '@/components/timezone-picker';
import {
  WC_STADIUMS as STADIUMS,
  WORLD_CUP_FIXTURES as GROUP_FIXTURES,
  KNOCKOUT_FIXTURES,
  NATION_NAMES,
} from '@/lib/world-cup-fixtures';

// 3-letter nation code → ISO flag slug used by the CDN. Kept local because
// the flag rendering helper lives in this page.
const FLAG_CODES: Record<string, string> = {
  MEX: 'mx', RSA: 'za', KOR: 'kr', CAN: 'ca', QAT: 'qa', SUI: 'ch',
  BRA: 'br', MAR: 'ma', HAI: 'ht', SCO: 'gb-sct', USA: 'us', PAR: 'py',
  AUS: 'au', GER: 'de', CUW: 'cw', CIV: 'ci', ECU: 'ec', NED: 'nl',
  JPN: 'jp', TUN: 'tn', BEL: 'be', EGY: 'eg', IRN: 'ir', NZL: 'nz',
  ESP: 'es', CPV: 'cv', KSA: 'sa', URU: 'uy', FRA: 'fr', SEN: 'sn',
  NOR: 'no', ARG: 'ar', ALG: 'dz', JOR: 'jo', AUT: 'at', POR: 'pt',
  UZB: 'uz', COL: 'co', ENG: 'gb-eng', CRO: 'hr', GHA: 'gh', PAN: 'pa',
  CZE: 'cz', BIH: 'ba', TUR: 'tr', SWE: 'se', IRQ: 'iq', COD: 'cd',
};

type FilterOption = 'all' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'knockout';

function FixturesContent() {
  const searchParams = useSearchParams();
  const { timezone, abbreviation } = useUserTimezone();
  const [filter, setFilter] = useState<FilterOption>('all');

  // Read initial filter from URL
  useEffect(() => {
    const groupParam = searchParams.get('group');
    if (groupParam && ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].includes(groupParam)) {
      setFilter(groupParam as FilterOption);
    }
  }, [searchParams]);

  const allFixtures = [...GROUP_FIXTURES, ...KNOCKOUT_FIXTURES];

  const filteredFixtures = allFixtures.filter(f => {
    if (filter === 'all') return true;
    if (filter === 'knockout') return f.stage.includes('Round') || f.stage.includes('Final') || f.stage === '3rd Place';
    return f.group === filter;
  });

  // Sort by date and time. parseFixtureDateTime anchors the timezone-naive
  // strings to Eastern Time (the source zone the FIFA schedule was logged
  // in) so the sort is consistent across all user timezones.
  filteredFixtures.sort((a, b) => {
    return parseFixtureDateTime(a.date, a.time).getTime() -
      parseFixtureDateTime(b.date, b.time).getTime();
  });

  // Render the calendar day in the user's timezone. For "midnight ET"
  // matches (e.g. Vancouver night games) this means the day label might
  // shift backwards a day for West Coast users — which is correct, since
  // the kickoff is 9 PM PT the *previous* date.
  const formatDate = (dateStr: string, timeStr: string) => {
    const date = parseFixtureDateTime(dateStr, timeStr);
    return formatDateWithWeekday(date, timezone);
  };

  // The fixture data stores `time: '15:00'` without a zone. The source
  // schedule is Eastern Time (FIFA's official release), so we anchor
  // there via parseFixtureDateTime, then render the absolute moment in
  // the user's chosen zone. Result: a 15:00 ET kickoff displays as
  // "3:00 PM EDT" for ET users, "12:00 PM PDT" for West Coast users,
  // "11:00 PM GST" for Dubai users, etc.
  const formatTime = (dateStr: string, timeStr: string) => {
    const date = parseFixtureDateTime(dateStr, timeStr);
    return `${fmtTime(date, timezone)} ${abbreviation}`;
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white mb-2">Fixtures</h1>
        <div className="flex items-center gap-2">
          <TimezoneIndicator />
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterButton>
        {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(g => (
          <FilterButton key={g} active={filter === g} onClick={() => setFilter(g as FilterOption)}>
            {g}
          </FilterButton>
        ))}
        <FilterButton active={filter === 'knockout'} onClick={() => setFilter('knockout')}>Knockouts</FilterButton>
      </div>

      {/* Fixtures List — grouped under date headers so the schedule scans
          like a TV guide. Grouping key = calendar day in the USER's zone. */}
      <div className="space-y-3">
        {filteredFixtures.map((fixture, i) => {
          const stadium = STADIUMS[fixture.stadium];
          const dayLabel = formatDate(fixture.date, fixture.time);
          const prevLabel = i > 0
            ? formatDate(filteredFixtures[i - 1].date, filteredFixtures[i - 1].time)
            : null;
          const showHeader = dayLabel !== prevLabel;
          const isToday = dayLabel === formatDateWithWeekday(new Date(), timezone);

          return (
            <div key={fixture.id}>
              {showHeader && (
                <div className={`flex items-center gap-2 pt-3 pb-1 ${i === 0 ? '!pt-0' : ''}`}>
                  <span className={`text-xs font-black uppercase tracking-widest ${isToday ? 'text-emerald-400' : 'text-white/50'}`}>
                    {dayLabel}
                  </span>
                  {isToday && (
                    <span className="px-1.5 py-[1px] rounded-md bg-emerald-500/15 ring-1 ring-emerald-400/40 text-emerald-300 text-[9px] font-black tracking-wider">
                      TODAY
                    </span>
                  )}
                  <div className="flex-1 h-px bg-white/10" />
                </div>
              )}
            <div className={`bg-white/5 border rounded-xl p-4 hover:bg-white/[0.07] transition-all ${isToday ? 'border-emerald-500/25' : 'border-white/10'}`}>
              {/* Stage & Date Row */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-white/40 uppercase tracking-wider">{fixture.stage}</span>
                <span className="text-xs text-white/50">{formatDate(fixture.date, fixture.time)}</span>
              </div>

              {/* Teams Row */}
              <div className="flex items-center justify-between gap-2 mb-3">
                {/* Home Team */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <TeamCell code={fixture.home} side="home" />
                </div>

                {/* Time */}
                <div className="px-2 sm:px-4 py-1.5 sm:py-2 bg-white/10 rounded-lg flex-shrink-0">
                  <span className="text-white font-bold text-[10px] sm:text-sm whitespace-nowrap">{formatTime(fixture.date, fixture.time)}</span>
                </div>

                {/* Away Team */}
                <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
                  <TeamCell code={fixture.away} side="away" />
                </div>
              </div>

              {/* Stadium Row */}
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 text-white/40 text-[10px] sm:text-xs">
                <svg className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="truncate">{stadium.city}</span>
              </div>
            </div>
            </div>
          );
        })}
      </div>

      {filteredFixtures.length === 0 && (
        <div className="text-center py-12 text-white/40">
          No fixtures found for this filter.
        </div>
      )}
    </div>
  );
}

export default function FixturesPage() {
  return (
    <Suspense fallback={
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white mb-2">Fixtures</h1>
          <p className="text-white/40 text-sm">Loading...</p>
        </div>
      </div>
    }>
      <FixturesContent />
    </Suspense>
  );
}

function FilterButton({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all
        ${active
          ? 'bg-rose-500 text-white'
          : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
        }`}
    >
      {children}
    </button>
  );
}

/**
 * Render one side of a fixture's team display.
 *
 * Three rendering modes, picked in order:
 *   1. Real nation with a flag code → show flag + full name (e.g. "🇧🇷 Brazil").
 *   2. Group-stage placeholder like "1A" / "2B" / "3rd Best" (R32 seeding) →
 *      compact muted pill (fits inside the existing 3-char box).
 *   3. Knockout placeholder like "W M73" / "L M101" (R16+ feeders) → italic
 *      label, no box, full width – these are too long for the pill and the
 *      box was rendering useless slices.
 */
function TeamCell({ code, side }: { code: string; side: 'home' | 'away' }) {
  const flag = FLAG_CODES[code];
  const name = NATION_NAMES[code] ?? code;
  const isHome = side === 'home';
  const containerAlign = isHome ? '' : 'flex-row-reverse text-right';
  const textAlign = isHome ? '' : 'text-right';

  if (flag) {
    return (
      <div className={`flex items-center gap-2 min-w-0 ${containerAlign}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getFlagUrl(flag, 'md')}
          alt={code}
          className="w-6 h-4 sm:w-8 sm:h-6 rounded shadow-md flex-shrink-0"
        />
        <span className={`text-white font-semibold text-xs sm:text-sm truncate ${textAlign}`}>
          {name}
        </span>
      </div>
    );
  }

  const isShortPlaceholder = code.length <= 9 && !/^[WL] /.test(code);
  if (isShortPlaceholder) {
    return (
      <div className={`flex items-center gap-2 min-w-0 ${containerAlign}`}>
        <div className="px-1.5 h-4 sm:h-6 bg-white/10 rounded flex items-center justify-center text-[9px] sm:text-[10px] text-white/60 flex-shrink-0 font-mono">
          {code}
        </div>
        <span className={`text-white/70 font-semibold text-xs sm:text-sm truncate italic ${textAlign}`}>
          {name}
        </span>
      </div>
    );
  }

  return (
    <span className={`text-white/70 font-semibold text-xs sm:text-sm truncate italic ${textAlign} w-full`}>
      {name}
    </span>
  );
}
