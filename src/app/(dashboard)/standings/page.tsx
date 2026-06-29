'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getFlagUrl } from '@/lib/flags';
import CircularBracket from '@/components/circular-bracket';

interface GroupStanding {
  nationId: string;
  nationName: string;
  nationCode: string;
  group: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  isEliminated: boolean;
  isLive: boolean;
}

interface StandingsData {
  standings: Record<string, GroupStanding[]>;
  groups: string[];
}

const ALL_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// Qualification zone by finishing position (0-indexed):
//   0,1 → through (top two advance), 2 → best-third bubble, 3 → out.
function zone(index: number): 'through' | 'bubble' | 'out' {
  if (index <= 1) return 'through';
  if (index === 2) return 'bubble';
  return 'out';
}

const ZONE_DOT: Record<string, string> = {
  through: 'bg-emerald-400',
  bubble: 'bg-amber-400',
  out: 'bg-white/25',
};

function StandingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [standingsData, setStandingsData] = useState<StandingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  // Default to the knockout bracket — that's the live phase of the tournament.
  const [view, setView] = useState<'groups' | 'bracket'>('bracket');

  const fetchStandings = useCallback(async () => {
    try {
      const res = await fetch('/api/standings');
      if (res.ok) setStandingsData(await res.json());
    } catch (error) {
      console.error('Failed to fetch standings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStandings();
  }, [fetchStandings]);

  // Deep-link ?group=X opens that group's sheet.
  useEffect(() => {
    const g = searchParams.get('group');
    if (g && ALL_GROUPS.includes(g)) setOpenGroup(g);
  }, [searchParams]);

  // Light live-poll: only while a match is in progress somewhere. (The bracket
  // view self-fetches + polls inside CircularBracket.)
  const anyLive = standingsData
    ? Object.values(standingsData.standings).some((rows) => rows.some((r) => r.isLive))
    : false;
  useEffect(() => {
    if (!anyLive) return;
    const id = setInterval(fetchStandings, 30000);
    return () => clearInterval(id);
  }, [anyLive, fetchStandings]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!standingsData) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="text-center py-12 text-white/40">Failed to load standings</div>
      </div>
    );
  }

  const groups = standingsData.groups.length ? standingsData.groups : ALL_GROUPS;
  const openRows = openGroup ? standingsData.standings[openGroup] ?? [] : [];

  return (
    <div className="max-w-5xl mx-auto space-y-4 px-1">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white">
            {view === 'groups' ? 'Group Standings' : 'Knockout Bracket'}
          </h1>
          <p className="text-white/40 text-xs sm:text-sm">
            {view === 'groups' ? 'Tap a group for the full table' : 'Tap a game to see more details'}
          </p>
        </div>
        {anyLive && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> LIVE
          </span>
        )}
      </div>

      {/* Groups | Bracket toggle */}
      <div className="inline-flex p-0.5 rounded-xl bg-white/[0.06] border border-white/10">
        {(['groups', 'bracket'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              view === v ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            {v === 'groups' ? 'Groups' : 'Bracket'}
          </button>
        ))}
      </div>

      {view === 'bracket' ? (
        <div className="flex items-center justify-center min-h-[64vh] -mx-5">
          <CircularBracket onOpenMatch={(matchId) => router.push(`/fixtures?match=${matchId}`)} />
        </div>
      ) : (
      <>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-white/45">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Through</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> 3rd-place bubble</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-white/25" /> Out</span>
      </div>

      {/* Group cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {groups.map((group) => {
          const rows = standingsData.standings[group] ?? [];
          const groupLive = rows.some((r) => r.isLive);
          const complete = rows.length > 0 && rows.every((r) => r.played === 3);
          return (
            <button
              key={group}
              onClick={() => setOpenGroup(group)}
              className={`text-left bg-white/[0.04] border rounded-xl p-2.5 transition-all active:scale-[0.98] hover:bg-white/[0.07] ${
                groupLive ? 'border-emerald-500/40 ring-1 ring-emerald-500/20' : 'border-white/10'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-black text-white/80 uppercase tracking-wide">Group {group}</span>
                {groupLive ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ) : complete ? (
                  <span className="text-[8px] font-bold text-emerald-300/70 uppercase">Done</span>
                ) : null}
              </div>
              <div className="space-y-1">
                {rows.length === 0 ? (
                  <div className="text-[10px] text-white/30 py-1">No games yet</div>
                ) : (
                  rows.map((r, i) => (
                    <div
                      key={r.nationId}
                      className={`flex items-center gap-1.5 rounded-md px-1 py-0.5 ${
                        r.isLive ? 'bg-emerald-500/10' : ''
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ZONE_DOT[zone(i)]}`} />
                      <img
                        src={getFlagUrl(r.nationCode, 'sm')}
                        alt=""
                        className={`w-4 h-3 rounded-[2px] shrink-0 ${r.isEliminated ? 'grayscale opacity-50' : ''}`}
                      />
                      <span className={`text-[11px] font-bold truncate flex-1 min-w-0 ${r.isEliminated ? 'text-white/35 line-through' : 'text-white/85'}`}>
                        {r.nationCode}
                      </span>
                      <span className="text-[11px] font-black text-white tabular-nums">{r.points}</span>
                    </div>
                  ))
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom-sheet: full table for the tapped group */}
      {openGroup && (
        <div
          className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={() => setOpenGroup(null)}
        >
          <div
            className="w-full sm:max-w-lg bg-slate-900 border-t sm:border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet header */}
            <div className="sticky top-0 bg-slate-900/95 backdrop-blur px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-base font-black text-white">Group {openGroup}</h2>
              <button
                onClick={() => setOpenGroup(null)}
                className="w-8 h-8 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 flex items-center justify-center text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-white/40 uppercase tracking-wider">
                    <th className="text-left px-2 py-1.5 font-bold">#</th>
                    <th className="text-left px-1 py-1.5 font-bold">Nation</th>
                    <th className="text-center px-1 py-1.5 font-bold">P</th>
                    <th className="text-center px-1 py-1.5 font-bold">W</th>
                    <th className="text-center px-1 py-1.5 font-bold">D</th>
                    <th className="text-center px-1 py-1.5 font-bold">L</th>
                    <th className="text-center px-1 py-1.5 font-bold">GD</th>
                    <th className="text-center px-2 py-1.5 font-bold">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {openRows.map((r, i) => (
                    <tr
                      key={r.nationId}
                      className={`border-t border-white/5 ${r.isLive ? 'bg-emerald-500/10' : ''}`}
                    >
                      <td className="px-2 py-2">
                        <span className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${ZONE_DOT[zone(i)]}`} />
                          <span className="text-white/70 font-bold">{i + 1}</span>
                        </span>
                      </td>
                      <td className="px-1 py-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <img
                            src={getFlagUrl(r.nationCode, 'md')}
                            alt=""
                            className={`w-5 h-4 rounded-[2px] shrink-0 ${r.isEliminated ? 'grayscale opacity-50' : ''}`}
                          />
                          <span className={`font-semibold truncate ${r.isEliminated ? 'text-white/40 line-through' : 'text-white'}`}>
                            {r.nationName}
                          </span>
                          {r.isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
                        </span>
                      </td>
                      <td className="px-1 py-2 text-center text-white/70">{r.played}</td>
                      <td className="px-1 py-2 text-center text-white/70">{r.wins}</td>
                      <td className="px-1 py-2 text-center text-white/70">{r.draws}</td>
                      <td className="px-1 py-2 text-center text-white/70">{r.losses}</td>
                      <td className={`px-1 py-2 text-center font-semibold ${
                        r.goalDifference > 0 ? 'text-emerald-400' : r.goalDifference < 0 ? 'text-rose-400' : 'text-white/70'
                      }`}>
                        {r.goalDifference > 0 ? '+' : ''}{r.goalDifference}
                      </td>
                      <td className="px-2 py-2 text-center font-black text-white">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-white/35 px-2 py-2 leading-snug">
                Top 2 of each group advance, plus the 8 best third-placed teams. GF used as a
                further tiebreak.
              </p>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

export default function StandingsPage() {
  return (
    <Suspense fallback={
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <StandingsContent />
    </Suspense>
  );
}
