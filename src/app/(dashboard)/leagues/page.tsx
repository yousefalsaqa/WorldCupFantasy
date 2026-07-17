'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Copy, Check, Trash2, Globe, Users, Trophy } from 'lucide-react';
import { CreateLeagueModal } from '@/components/create-league-modal';
import { JoinLeagueModal } from '@/components/join-league-modal';

interface Standing {
  rank: number;
  teamId: string;
  teamName: string;
  managerName: string;
  /** Banked + in-progress (server computes the live overlay). */
  totalPoints: number;
  /** Points for the active round only (banked + live). Banks into total when
   * the round ends; column then recomputes for the next round. */
  roundPoints?: number;
  /** In-progress portion of totalPoints; > 0 marks a row earning live. */
  liveDelta?: number;
  teamValue: number;
  isCurrentUser?: boolean;
}

interface MyLeague {
  id: string;
  name: string;
  code: string;
  isGlobal: boolean;
  memberCount: number;
  isOwner: boolean;
}

export default function LeaguesPage() {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [roundLabel, setRoundLabel] = useState<string | null>(null);
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

  // League switcher: the global league plus any private leagues the
  // user's team belongs to. Selecting one swaps the standings table.
  const [myLeagues, setMyLeagues] = useState<MyLeague[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [selectedMeta, setSelectedMeta] = useState<{ isGlobal: boolean; isOwner: boolean; code: string | null }>({
    isGlobal: true, isOwner: false, code: null,
  });
  const [copied, setCopied] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [motwOpen, setMotwOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const fetchMyLeagues = useCallback(async () => {
    try {
      const res = await fetch('/api/leagues', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const leagues: MyLeague[] = data.leagues ?? [];
        // Global first, then private leagues by name
        leagues.sort((a, b) => Number(b.isGlobal) - Number(a.isGlobal) || a.name.localeCompare(b.name));
        setMyLeagues(leagues);
      }
    } catch (error) {
      console.error('Failed to fetch leagues:', error);
    }
  }, []);

  const refreshStandings = useCallback(async (leagueId?: string | null) => {
    try {
      const url = leagueId
        ? `/api/leagues/standings?leagueId=${encodeURIComponent(leagueId)}`
        : '/api/leagues/standings';
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStandings(data.standings ?? []);
        setRoundLabel(data.roundLabel ?? null);
        setLeagueName(data.leagueName || 'Global League');
        setAnyMatchLive(!!data.anyMatchLive);
        setSelectedMeta({
          isGlobal: data.isGlobal ?? true,
          isOwner: !!data.isOwner,
          code: data.code ?? null,
        });
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
        // Deep link from elsewhere in the app (e.g. the dashboard's "Your
        // Leagues" list) — /leagues?leagueId=X opens straight into that league
        // instead of always landing on the global table.
        const urlLeagueId = searchParams.get('leagueId');
        if (urlLeagueId) setSelectedLeagueId(urlLeagueId);
        await Promise.all([fetchMyLeagues(), refreshStandings(urlLeagueId)]);
      } finally {
        setLoading(false);
      }
    }
    fetchInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchMyLeagues, refreshStandings]);

  const selectLeague = (id: string | null) => {
    setSelectedLeagueId(id);
    setDeleteConfirm(false);
    refreshStandings(id);
  };

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
        refreshStandings(selectedLeagueId);
      }
      return;
    }
    wasLiveRef.current = true;
    // 60s cadence mirrors /squad's live pill — fast enough to feel
    // responsive, slow enough not to hammer Neon during a full slate
    // of WC matches.
    const interval = setInterval(() => refreshStandings(selectedLeagueId), 60_000);
    return () => clearInterval(interval);
  }, [anyMatchLive, refreshStandings, selectedLeagueId]);

  const copyCode = () => {
    if (selectedMeta.code) {
      navigator.clipboard.writeText(selectedMeta.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const deleteLeague = async () => {
    if (!selectedLeagueId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/leagues/${selectedLeagueId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setDeleteConfirm(false);
        await fetchMyLeagues();
        selectLeague(null); // back to global
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete league');
      }
    } catch {
      alert('Failed to delete league — check your connection.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/60">Loading standings...</p>
      </div>
    );
  }

  // Manager of the (current) round = top round-points scorer, if any > 0.
  // Used for the trophy marker + its explainer popup. Scales per round.
  const bestRoundPts = Math.max(0, ...standings.map((t) => t.roundPoints ?? 0));
  const managerOfWeek = bestRoundPts > 0
    ? standings.find((t) => (t.roundPoints ?? 0) === bestRoundPts) ?? null
    : null;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      {/* League switcher + actions */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {myLeagues.map((l) => {
          const active = l.isGlobal ? selectedLeagueId === null || selectedLeagueId === l.id : selectedLeagueId === l.id;
          return (
            <button
              key={l.id}
              onClick={() => selectLeague(l.isGlobal ? null : l.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                active
                  ? 'bg-rose-500/20 ring-1 ring-rose-400 text-white'
                  : 'bg-white/5 ring-1 ring-white/10 text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              {l.isGlobal ? <Globe className="w-3 h-3" /> : <Users className="w-3 h-3" />}
              {l.isGlobal ? 'Global' : l.name}
              <span className="text-white/30">{l.memberCount}</span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <CreateLeagueModal onSuccess={fetchMyLeagues} />
          <JoinLeagueModal onSuccess={fetchMyLeagues} />
        </div>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">{leagueName}</h1>
          <p className="text-white/50 text-sm">Click on any team to view their squad</p>
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
            onClick={() => refreshStandings(selectedLeagueId)}
            className="ml-2 px-2 py-0.5 rounded border border-white/10 text-white/60 hover:text-white hover:border-white/20"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Private-league toolbar: invite code + owner controls */}
      {!selectedMeta.isGlobal && selectedMeta.code && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-white/40 text-xs uppercase tracking-wider font-bold">Invite code</span>
            <span className="font-mono text-base font-bold text-amber-300 tracking-widest">{selectedMeta.code}</span>
            <button
              onClick={copyCode}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Copy invite code"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/50" />}
            </button>
          </div>
          {selectedMeta.isOwner && (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 ring-1 ring-rose-500/30 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete league
            </button>
          )}
        </div>
      )}

      {/* Standings Table */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl overflow-hidden border border-white/10">
        {/* Table Header — three data columns: this round / total / value */}
        <div className="grid grid-cols-12 gap-2 sm:gap-3 pl-3 pr-6 sm:pl-4 sm:pr-10 py-3 bg-white/5 text-[10px] sm:text-xs uppercase tracking-wider text-white/40 font-medium">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-4">Team &amp; Manager</div>
          <div className="col-span-2 text-right" title={roundLabel ? `${roundLabel} points` : 'This round'}>{roundLabel ?? 'Round'}</div>
          <div className="col-span-2 text-right pr-4 sm:pr-7">Total</div>
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
              const isMotw = managerOfWeek?.teamId === team.teamId;
              const earningLive = (team.liveDelta ?? 0) > 0;
              return (
                <div
                  key={team.teamId}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/leagues/team/${team.teamId}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/leagues/team/${team.teamId}`); }}
                  className={`grid grid-cols-12 gap-2 sm:gap-3 pl-3 pr-6 sm:pl-4 sm:pr-10 py-3.5 hover:bg-white/5 transition-colors cursor-pointer group ${isYou ? 'bg-emerald-500/10 border-l-4 border-emerald-500' : ''}`}
                >
                  {/* Rank */}
                  <div className="col-span-1 flex items-center justify-center">
                    <span className={`
                      w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm
                      ${index === 0 ? 'bg-yellow-500/20 text-yellow-400' : ''}
                      ${index === 1 ? 'bg-gray-400/20 text-gray-300' : ''}
                      ${index === 2 ? 'bg-amber-600/20 text-amber-500' : ''}
                      ${index > 2 ? 'bg-white/5 text-white/60' : ''}
                    `}>
                      {team.rank}
                    </span>
                  </div>

                  {/* Team & Manager — min-w-0 at each level so truncate can
                      actually shrink inside the grid cell (long team names
                      were overflowing and getting clipped). */}
                  <div className="col-span-4 flex flex-col justify-center min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isMotw && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMotwOpen(true); }}
                          className="shrink-0 -m-2 p-2 rounded-md hover:bg-amber-400/15 transition-colors relative z-10"
                          aria-label="Manager of the week"
                        >
                          <Trophy className="w-4 h-4 text-amber-400" fill="currentColor" />
                        </button>
                      )}
                      <span className={`font-semibold text-sm sm:text-base truncate min-w-0 group-hover:text-emerald-400 transition-colors ${isYou ? 'text-emerald-400' : 'text-white'}`}>
                        {team.teamName}
                      </span>
                      {isYou && (
                        <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-emerald-500 text-white flex-shrink-0">
                          You
                        </span>
                      )}
                    </div>
                    <span className="text-xs sm:text-sm text-white/40 truncate">{team.managerName}</span>
                  </div>

                  {/* This round — the ONLY live signal (pulsing dot + green) */}
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    {earningLive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    )}
                    <span className={`text-base sm:text-lg font-bold tabular-nums ${earningLive ? 'text-emerald-400' : 'text-white/80'}`}>
                      {team.roundPoints ?? 0}
                    </span>
                  </div>

                  {/* Total — nudged left so it isn't crammed against Value */}
                  <div className="col-span-2 flex items-center justify-end pr-4 sm:pr-7">
                    <span className={`text-base sm:text-lg font-bold tabular-nums ${isYou ? 'text-emerald-400' : 'text-white'}`}>
                      {team.totalPoints}
                    </span>
                  </div>

                  {/* Value */}
                  <div className="col-span-3 flex items-center justify-end">
                    <span className="text-base sm:text-lg font-bold tabular-nums text-white/55">
                      £{team.teamValue.toFixed(1)}m
                    </span>
                  </div>
                </div>
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

      {/* Manager of the Week explainer — opened by tapping the trophy */}
      {motwOpen && managerOfWeek && (
        <div
          className="fixed inset-0 bg-black/80 z-[9999] backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setMotwOpen(false)}
        >
          <div
            className="bg-slate-900 border border-amber-500/25 rounded-2xl w-full max-w-[17rem] overflow-hidden shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-3 flex items-center gap-2.5 bg-gradient-to-r from-amber-500/20 to-transparent">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-amber-950 flex items-center justify-center shadow-lg shrink-0">
                <Trophy className="w-5 h-5" fill="currentColor" />
              </div>
              <h3 className="text-base font-black text-white leading-tight">Manager of the Week</h3>
            </div>

            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="min-w-0">
                  <p className="text-white font-bold text-sm truncate">{managerOfWeek.managerName}</p>
                  <p className="text-white/40 text-xs truncate">{managerOfWeek.teamName}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-amber-300 font-black text-lg leading-none tabular-nums">{managerOfWeek.roundPoints ?? 0}</span>
                  <span className="text-white/40 text-[10px] uppercase tracking-wider ml-0.5">{roundLabel ?? 'pts'}</span>
                </div>
              </div>
              <p className="text-amber-100/80 text-xs leading-snug">
                {anyMatchLive
                  ? `${managerOfWeek.managerName} is currently winning ${roundLabel ?? 'this round'} — still being played, so it can change.`
                  : `${managerOfWeek.managerName} is Manager of the Week for ${roundLabel ?? 'this round'}. A new winner is crowned each round.`}
              </p>
            </div>

            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={() => setMotwOpen(false)}
                className="w-full px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 ring-1 ring-white/15 text-white font-bold text-sm transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete-league confirmation */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/80 z-50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDeleteConfirm(false)}
        >
          <div
            className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-white mb-2">Delete {leagueName}?</h3>
            <p className="text-white/60 text-sm mb-6">
              The league and its table are gone for good. Members keep their teams
              and stay in the Global league — only this private league disappears.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white/70 font-medium hover:bg-white/10 transition-colors"
              >
                Keep it
              </button>
              <button
                onClick={deleteLeague}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 rounded-xl text-white font-bold hover:from-rose-600 hover:to-rose-700 disabled:opacity-50 transition-all"
              >
                {deleting ? 'Deleting...' : 'Delete league'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
