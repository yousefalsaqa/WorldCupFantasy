'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

interface Standing {
  rank: number;
  teamId: string;
  teamName: string;
  managerName: string;
  totalPoints: number;
  teamValue: number;
  isCurrentUser?: boolean;
}

export default function LeaguesPage() {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [leagueName, setLeagueName] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserTeamId, setCurrentUserTeamId] = useState<string | null>(null);
  const [anyMatchLive, setAnyMatchLive] = useState(false);
  // Last time we successfully refreshed standings. Surfaced in the UI
  // so the user can see how stale the table is without F5'ing.
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Track previous "live" state across polls so we can fire one final
  // refresh when matches transition from in-progress to all-FT (the
  // "end of gameday" moment).
  const wasLiveRef = useRef(false);

  const refreshStandings = useCallback(async () => {
    try {
      const res = await fetch('/api/leagues/standings');
      if (res.ok) {
        const data = await res.json();
        setStandings(data.standings ?? []);
        setLeagueName(data.leagueName || 'Global League');
        setAnyMatchLive(!!data.anyMatchLive);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to refresh standings:', error);
    }
  }, []);

  useEffect(() => {
    async function fetchInitial() {
      try {
        const teamRes = await fetch('/api/team', { credentials: 'include' });
        if (teamRes.ok) {
          const teamData = await teamRes.json();
          if (teamData.team) setCurrentUserTeamId(teamData.team.id);
        }
        await refreshStandings();
      } finally {
        setLoading(false);
      }
    }
    fetchInitial();
  }, [refreshStandings]);

  // Polling loop. Per user-requested behavior: only poll while at least
  // one match is in progress (so we catch the moment a goal banks in
  // real time and the end-of-gameday transition), and stop once
  // everything has settled to FT. The "one final refresh after the
  // last live match flips" is handled by the wasLiveRef check below.
  useEffect(() => {
    if (!anyMatchLive) {
      if (wasLiveRef.current) {
        // Live → all FT transition. Do one last refresh so the table
        // reflects whatever just got banked in the closing minute.
        wasLiveRef.current = false;
        refreshStandings();
      }
      return;
    }
    wasLiveRef.current = true;
    // 60s cadence mirrors /squad's live pill — fast enough to feel
    // responsive, slow enough not to hammer Neon during a full slate
    // of WC matches.
    const interval = setInterval(refreshStandings, 60_000);
    return () => clearInterval(interval);
  }, [anyMatchLive, refreshStandings]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/60">Loading standings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{leagueName}</h1>
          <p className="text-white/60">Click on any team to view their squad</p>
        </div>
        {/* Live indicator + last-refresh stamp. We only show "Live" while
            matches are actually in progress; otherwise it sits at "Idle" so
            users can tell the table isn't auto-updating (per the
            poll-only-during-gameday rule). */}
        <div className="flex items-center gap-2 text-xs text-white/40">
          {anyMatchLive ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live — auto-refreshing
            </span>
          ) : (
            <span className="text-white/30">Idle (no live matches)</span>
          )}
          {lastUpdated && (
            <>
              <span className="text-white/20">·</span>
              <span>Updated {lastUpdated.toLocaleTimeString()}</span>
            </>
          )}
          <button
            type="button"
            onClick={refreshStandings}
            className="ml-2 px-2 py-0.5 rounded border border-white/10 text-white/60 hover:text-white hover:border-white/20"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Standings Table */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl overflow-hidden border border-white/10">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-white/5 text-xs uppercase tracking-wider text-white/40 font-medium">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-5">Team & Manager</div>
          <div className="col-span-3 text-right">Points</div>
          <div className="col-span-3 text-right">Value</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-white/5">
          {standings.length === 0 ? (
            <div className="px-4 py-8 text-center text-white/40">
              No teams in the league yet
            </div>
          ) : (
            standings.map((team, index) => {
              const isYou = team.teamId === currentUserTeamId;
              return (
                <Link
                  key={team.teamId}
                  href={`/leagues/team/${team.teamId}`}
                  className={`grid grid-cols-12 gap-2 px-4 py-4 hover:bg-white/5 transition-colors cursor-pointer group ${isYou ? 'bg-emerald-500/10 border-l-4 border-emerald-500' : ''}`}
                >
                  {/* Rank */}
                  <div className="col-span-1 flex items-center justify-center">
                    <span className={`
                      w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                      ${index === 0 ? 'bg-yellow-500/20 text-yellow-400' : ''}
                      ${index === 1 ? 'bg-gray-400/20 text-gray-300' : ''}
                      ${index === 2 ? 'bg-amber-600/20 text-amber-500' : ''}
                      ${index > 2 ? 'bg-white/5 text-white/60' : ''}
                    `}>
                      {team.rank}
                    </span>
                  </div>

                  {/* Team & Manager */}
                  <div className="col-span-5 flex flex-col justify-center">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold group-hover:text-emerald-400 transition-colors ${isYou ? 'text-emerald-400' : 'text-white'}`}>
                        {team.teamName}
                      </span>
                      {isYou && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500 text-white">
                          You
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-white/40">{team.managerName}</span>
                  </div>

                  {/* Points */}
                  <div className="col-span-3 flex items-center justify-end">
                    <span className={`text-xl font-bold ${isYou ? 'text-emerald-400' : 'text-white'}`}>{team.totalPoints}</span>
                    <span className="text-xs text-white/40 ml-1">pts</span>
                  </div>

                  {/* Value */}
                  <div className="col-span-3 flex items-center justify-end">
                    <span className="text-white/60">£{team.teamValue.toFixed(1)}m</span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* League Info */}
      <div className="mt-8 grid grid-cols-3 gap-4">
        <div className="bg-white/5 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{standings.length}</div>
          <div className="text-xs text-white/40 uppercase">Teams</div>
        </div>
        <div className="bg-white/5 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">
            {standings[0]?.totalPoints || 0}
          </div>
          <div className="text-xs text-white/40 uppercase">Top Score</div>
        </div>
        <div className="bg-white/5 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">
            {Math.round(standings.reduce((sum, t) => sum + t.totalPoints, 0) / (standings.length || 1))}
          </div>
          <div className="text-xs text-white/40 uppercase">Average</div>
        </div>
      </div>
    </div>
  );
}
