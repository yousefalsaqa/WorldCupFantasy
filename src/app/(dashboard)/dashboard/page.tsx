'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Coins,
  Wallet,
  Repeat,
  ShieldAlert,
  Crown,
  ShieldHalf,
  CalendarClock,
  Trophy,
  History,
  TrendingUp,
  Star,
} from 'lucide-react';
import { getFlagUrl } from '@/lib/flags';
import { useUserTimezone } from '@/hooks/useTimezone';
import { formatDateShort, formatTime, decomposeDuration } from '@/lib/format-time';
import { PlayerCard } from '@/components/kit';
import PitchBg from '@/components/pitch-bg';
import FixtureTicker from '@/components/fixture-ticker';
import { buildTicker, type TickerFixture } from '@/lib/fixture-ticker';
import PointsBreakdownModal from '@/components/points-breakdown-modal';

interface User {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
}

interface Team {
  id: string;
  name: string;
  totalPoints: number;
  bankBalance: number;
  teamValue: number;
  freeTransfers: number;
}

interface Stage {
  id: string;
  stageId: string;
  name: string;
  isActive: boolean;
  isComplete: boolean;
  deadlineTime: string | null;
}

interface SquadPlayer {
  id: string;
  playerId: string;
  isStarting: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  benchOrder: number | null;
  points: number;
  livePoints: number;
  player: {
    id: string;
    displayName: string;
    position: string;
    currentPrice: number;
    shirtNumber: number | null;
    photoUrl: string | null;
    isAvailable: boolean;
    availabilityNote: string | null;
    nation: { code: string; name: string; kitColor1: string; kitColor2: string; isEliminated: boolean };
  };
}

interface LeagueSummary {
  id: string;
  name: string;
  code: string;
  isGlobal: boolean;
  memberCount: number;
  isOwner: boolean;
}

type MatchdayState = 'before' | 'during' | 'after';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { timezone } = useUserTimezone();
  const [user, setUser] = useState<User | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [liveTotalPoints, setLiveTotalPoints] = useState<number | null>(null);
  const [roundPoints, setRoundPoints] = useState<{ points: number; stageId: string | null }>({ points: 0, stageId: null });
  const [unlimitedTransfers, setUnlimitedTransfers] = useState(false);
  const [currentStage, setCurrentStage] = useState<Stage | null>(null);
  const [squad, setSquad] = useState<SquadPlayer[]>([]);
  const [isLate, setIsLate] = useState(false);
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [fixtures, setFixtures] = useState<TickerFixture[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [showPoints, setShowPoints] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [teamName, setTeamName] = useState('');

  useEffect(() => {
    loadData();
    const onVisible = () => { if (document.visibilityState === 'visible') loadData(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  // Deadline countdown ticks once a minute — cheap, and matches the landing
  // page's own countdown cadence.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  async function loadData() {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 20000);
    try {
      const [userRes, teamRes, stageRes] = await Promise.all([
        fetch('/api/auth/me', { signal: ctrl.signal }),
        fetch('/api/team', { signal: ctrl.signal, cache: 'no-store' }),
        fetch('/api/stages/current', { signal: ctrl.signal }),
      ]);

      const userData = await userRes.json();
      const teamData = await teamRes.json();
      const stageData = await stageRes.json();

      setUser(userData.user);
      setCurrentStage(stageData.stage);

      if (teamRes.ok && teamData.team) {
        setTeam(teamData.team);
        setLiveTotalPoints(typeof teamData.liveTotalPoints === 'number' ? teamData.liveTotalPoints : teamData.team.totalPoints);
        setUnlimitedTransfers(Boolean(teamData.unlimitedTransfers));

        fetch('/api/team/stages-summary', { signal: ctrl.signal })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d) setRoundPoints({ points: d.currentRoundPoints ?? 0, stageId: d.currentStageId ?? null }); })
          .catch(() => {});

        fetch('/api/squad/get', { signal: ctrl.signal })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d?.squad) { setSquad(d.squad); setIsLate(Boolean(d.isLate)); } })
          .catch(() => {});

        fetch('/api/leagues', { signal: ctrl.signal })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d?.leagues) setLeagues(d.leagues); })
          .catch(() => {});
      } else {
        setTeam(null);
      }

      fetch('/api/fixtures/scores', { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d?.matches) setFixtures(d.matches); })
        .catch(() => {});
    } catch (error) {
      console.error('Load error:', error);
      setTeam(null);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  async function createTeam() {
    if (!teamName.trim()) return;
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamName }),
      });
      if (res.ok) window.location.href = '/squad';
      else { const data = await res.json(); alert(data.error || 'Failed to create team'); }
    } catch (error) {
      console.error('Create team error:', error);
      alert('Failed to create team. Please try again.');
    }
  }

  // ---- Derived state ----
  const squadComplete = squad.length === 15;
  const startingXI = squad.filter((s) => s.isStarting);
  const bench = squad.filter((s) => !s.isStarting).sort((a, b) => (a.benchOrder ?? 99) - (b.benchOrder ?? 99));
  const captain = squad.find((s) => s.isCaptain);
  const vice = squad.find((s) => s.isViceCaptain);

  const fwds = startingXI.filter((s) => s.player.position === 'FWD');
  const mids = startingXI.filter((s) => s.player.position === 'MID');
  const defs = startingXI.filter((s) => s.player.position === 'DEF');
  const gks = startingXI.filter((s) => s.player.position === 'GK');

  const warnings = useMemo(
    () => squad
      .filter((s) => s.player.nation.isEliminated || !s.player.isAvailable)
      .map((s) => ({
        id: s.id,
        name: s.player.displayName,
        starting: s.isStarting,
        reason: s.player.nation.isEliminated ? 'Nation eliminated' : (s.player.availabilityNote || 'Unavailable'),
      })),
    [squad],
  );

  const stageMatches = useMemo(
    () => (currentStage ? fixtures.filter((f) => f.stageId === currentStage.stageId) : []),
    [fixtures, currentStage],
  );
  const matchdayState: MatchdayState = useMemo(() => {
    if (stageMatches.some((m) => m.isStarted && !m.isFinished)) return 'during';
    if (stageMatches.length > 0 && stageMatches.every((m) => m.isFinished)) return 'after';
    return 'before';
  }, [stageMatches]);

  const deadline = currentStage?.deadlineTime ? new Date(currentStage.deadlineTime) : null;
  const countdown = deadline ? decomposeDuration(Math.max(0, deadline.getTime() - now)) : null;

  // Next fixture: prefer the current stage, fall back to the next one with
  // any not-yet-started match.
  const nextFixture = useMemo(() => {
    const upcoming = fixtures
      .filter((f) => !f.isStarted && new Date(f.kickoff).getTime() > now)
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
    return upcoming[0] ?? null;
  }, [fixtures, now]);

  // Live-state player tracking: which of the starting XI's nations have
  // finished / are live / haven't kicked off, using the current stage's
  // real match data.
  const nationStatus = useMemo(() => {
    const map = new Map<string, 'done' | 'live' | 'upcoming'>();
    for (const m of stageMatches) {
      const status: 'done' | 'live' | 'upcoming' = m.isFinished ? 'done' : m.isStarted ? 'live' : 'upcoming';
      map.set(m.home, status);
      map.set(m.away, status);
    }
    return map;
  }, [stageMatches]);
  const completedCount = startingXI.filter((s) => nationStatus.get(s.player.nation.code) === 'done').length;
  const liveNowCount = startingXI.filter((s) => nationStatus.get(s.player.nation.code) === 'live').length;

  const bestPerformer = useMemo(() => {
    if (startingXI.length === 0) return null;
    return [...startingXI].sort((a, b) => (b.livePoints || b.points) - (a.livePoints || a.points))[0];
  }, [startingXI]);

  const tickerItems = useMemo(() => buildTicker(fixtures), [fixtures]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ---- No team yet ----
  if (!team) {
    return (
      <div className="max-w-md mx-auto pt-16">
        <p className="text-[10px] font-bold text-white/35 uppercase tracking-[0.2em]">Get Started</p>
        <h1 className="font-display text-3xl text-ink mt-1">Build your squad</h1>
        <p className="text-white/50 text-sm mt-2">15 players, 48 nations, one budget.</p>
        {!showCreateTeam ? (
          <button
            onClick={() => setShowCreateTeam(true)}
            className="mt-6 px-6 py-2.5 rounded-lg bg-accent hover:bg-accent/90 text-ink font-bold text-sm transition-colors"
          >
            Create Team
          </button>
        ) : (
          <div className="mt-6 space-y-3">
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Team name…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-ink placeholder-white/30 focus:border-white/30 outline-none text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setShowCreateTeam(false)} className="flex-1 bg-white/5 border border-white/10 text-white/60 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={createTeam} className="flex-1 bg-accent text-ink font-bold py-2 rounded-lg text-sm">Create</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      {/* ---- Account summary ---- */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <p className="text-white/35 text-[11px] font-bold uppercase tracking-[0.2em]">{greeting()}, {user?.username}</p>
          <h1 className="font-display text-2xl sm:text-3xl text-ink mt-0.5 leading-none">{team.name}</h1>
          {currentStage && (
            <p className="text-white/40 text-xs mt-1.5">{currentStage.name}{isLate && ' · this round is provisional (joined late)'}</p>
          )}
        </div>

        {matchdayState === 'during' ? (
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-live/10 ring-1 ring-live/40 self-start lg:self-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
            <span className="text-live text-xs font-bold tracking-wider uppercase">Matches in progress</span>
          </span>
        ) : countdown && deadline && deadline.getTime() > now ? (
          <div className="flex items-center gap-3">
            <span className="text-white/35 text-[10px] font-bold uppercase tracking-widest">Deadline</span>
            <div className="flex gap-1.5">
              <DeadlineUnit value={countdown.days} label="D" />
              <DeadlineUnit value={countdown.hours} label="H" />
              <DeadlineUnit value={countdown.minutes} label="M" />
            </div>
          </div>
        ) : null}
      </div>

      {/* ---- Squad-incomplete notice (compact, not a marketing hero) ---- */}
      {team.teamValue === 0 && (
        <Link href="/squad" className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-accent/30 bg-accent/[0.06] hover:border-accent/50 transition-colors">
          <span className="text-sm text-ink font-bold">Your squad is empty. Pick your 15 to get started</span>
          <span className="text-accent text-sm font-bold shrink-0">Build squad →</span>
        </Link>
      )}

      {/* ---- Stat strip ---- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button type="button" onClick={() => setShowPoints(true)} className="text-left">
          <StatTile label={`${roundPoints.stageId ?? currentStage?.stageId ?? 'Round'} Points`} value={(liveTotalPoints ?? team.totalPoints).toString()} accent />
        </button>
        <StatTile label="Budget Left" value={`£${team.bankBalance.toFixed(1)}m`} icon={<Wallet className="w-3.5 h-3.5" />} />
        <StatTile label="Squad Value" value={`£${team.teamValue.toFixed(1)}m`} icon={<Coins className="w-3.5 h-3.5" />} />
        <StatTile label="Free Transfers" value={unlimitedTransfers ? '∞' : team.freeTransfers.toString()} icon={<Repeat className="w-3.5 h-3.5" />} />
      </div>

      {/* ---- Pitch + briefing ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8">
          <div className="rounded-xl ring-1 ring-white/10 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#0d1220] border-b border-white/10">
              <span className="text-[11px] font-bold text-white/45 tracking-[0.15em] uppercase">Your Starting XI</span>
              <Link href="/squad" className="text-[11px] font-bold text-accent hover:text-accent/80 uppercase tracking-wide">Edit →</Link>
            </div>
            <div className="relative">
              <PitchBg />
              <div className="relative z-10 p-3 sm:p-6 space-y-3 sm:space-y-5 min-h-[280px]">
                <PitchRow players={fwds} captainId={captain?.playerId} viceId={vice?.playerId} />
                <PitchRow players={mids} captainId={captain?.playerId} viceId={vice?.playerId} />
                <PitchRow players={defs} captainId={captain?.playerId} viceId={vice?.playerId} />
                <PitchRow players={gks} captainId={captain?.playerId} viceId={vice?.playerId} />
              </div>
            </div>
            {bench.length > 0 && (
              <div className="px-3 sm:px-5 py-3 bg-[#0a0e17] border-t border-white/10">
                <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-2">Substitutes</p>
                <div className="flex justify-center gap-1.5 sm:gap-3">
                  {bench.map((s) => (
                    <PlayerCard
                      key={s.id}
                      player={s.player}
                      size="xs"
                      eliminated={s.player.nation.isEliminated}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Matchday briefing */}
        <div className="lg:col-span-4">
          <div className="rounded-xl ring-1 ring-white/10 bg-[#0d1220] h-full flex flex-col">
            <div className="px-4 py-2.5 border-b border-white/10">
              <span className="text-[11px] font-bold text-white/45 tracking-[0.15em] uppercase">Matchday Briefing</span>
            </div>
            <div className="p-4 space-y-4 flex-1">
              {matchdayState === 'before' && (
                <>
                  <ChecklistRow ok={squadComplete} label="Squad complete" />
                  <ChecklistRow ok={!!captain} label="Captain selected" detail={captain ? captain.player.displayName : undefined} />
                  <ChecklistRow ok={warnings.length === 0} label={warnings.length === 0 ? 'No player warnings' : `${warnings.length} player warning${warnings.length > 1 ? 's' : ''}`} warn={warnings.length > 0} />
                </>
              )}
              {matchdayState === 'during' && (
                <>
                  <BriefingStat label="Players completed" value={`${completedCount}/${startingXI.length}`} />
                  <BriefingStat label="Live now" value={liveNowCount.toString()} live={liveNowCount > 0} />
                  <BriefingStat label="Live points" value={(liveTotalPoints ?? team.totalPoints).toString()} />
                </>
              )}
              {matchdayState === 'after' && (
                <>
                  <BriefingStat label="Round points" value={roundPoints.points.toString()} />
                  {bestPerformer && (
                    <BriefingStat label="Best performer" value={`${bestPerformer.player.displayName} · ${bestPerformer.livePoints || bestPerformer.points} pts`} />
                  )}
                </>
              )}

              <div className="pt-3 border-t border-white/10">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1.5">Captain / Vice</p>
                <div className="flex items-center gap-2 text-sm">
                  <Crown className="w-3.5 h-3.5 text-accent" />
                  <span className="text-ink font-bold">{captain?.player.displayName ?? '—'}</span>
                  <span className="text-white/25">/</span>
                  <span className="text-white/50">{vice?.player.displayName ?? '—'}</span>
                </div>
              </div>

              {nextFixture && (
                <Link href={`/fixtures?match=${nextFixture.id}`} className="block pt-3 border-t border-white/10 hover:opacity-80 transition-opacity">
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1.5">Next Fixture</p>
                  <div className="flex items-center gap-2 text-sm">
                    <img src={getFlagUrl(nextFixture.home, 'sm')} alt={nextFixture.home} className="w-4 h-3 rounded-[2px] object-cover" />
                    <span className="text-ink font-bold">{nextFixture.home} v {nextFixture.away}</span>
                    <img src={getFlagUrl(nextFixture.away, 'sm')} alt={nextFixture.away} className="w-4 h-3 rounded-[2px] object-cover" />
                  </div>
                  <p className="text-white/40 text-xs mt-1">
                    {formatDateShort(new Date(nextFixture.kickoff), timezone)} · {formatTime(new Date(nextFixture.kickoff), timezone)}
                  </p>
                </Link>
              )}
            </div>
            <Link href="/squad?transfer=1" className="block text-center py-2.5 border-t border-white/10 text-accent text-xs font-bold uppercase tracking-wide hover:text-accent/80 transition-colors">
              Make Transfers
            </Link>
          </div>
        </div>
      </div>

      {/* ---- Lower section ---- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Upcoming fixtures */}
        <div className="rounded-xl ring-1 ring-white/10 bg-[#0d1220]">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <span className="text-[11px] font-bold text-white/45 tracking-[0.15em] uppercase flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" />Fixtures</span>
            <Link href="/fixtures" className="text-[11px] font-bold text-accent uppercase tracking-wide">All →</Link>
          </div>
          <div className="divide-y divide-white/5">
            {fixtures
              .filter((f) => !f.isFinished)
              .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
              .slice(0, 4)
              .map((f) => (
                <Link key={f.id} href={`/fixtures?match=${f.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-white/[0.03] transition-colors">
                  <span className="flex items-center gap-1.5 text-white/70">
                    <img src={getFlagUrl(f.home, 'sm')} alt="" className="w-4 h-3 rounded-[2px] object-cover" />
                    {f.home} v {f.away}
                    <img src={getFlagUrl(f.away, 'sm')} alt="" className="w-4 h-3 rounded-[2px] object-cover" />
                  </span>
                  <span className="text-white/35 text-xs tabular-nums">{formatDateShort(new Date(f.kickoff), timezone)}</span>
                </Link>
              ))}
            {fixtures.filter((f) => !f.isFinished).length === 0 && (
              <p className="px-4 py-4 text-white/30 text-sm">No fixtures remaining.</p>
            )}
          </div>
        </div>

        {/* Your leagues */}
        <div className="rounded-xl ring-1 ring-white/10 bg-[#0d1220]">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <span className="text-[11px] font-bold text-white/45 tracking-[0.15em] uppercase flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" />Your Leagues</span>
            <Link href="/leagues" className="text-[11px] font-bold text-accent uppercase tracking-wide">All →</Link>
          </div>
          <div className="divide-y divide-white/5">
            {leagues.filter((l) => !l.isGlobal).slice(0, 4).map((l) => (
              <Link key={l.id} href={`/leagues?leagueId=${l.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-white/[0.03] transition-colors">
                <span className="text-ink font-bold truncate">{l.name}</span>
                <span className="text-white/35 text-xs shrink-0">{l.memberCount} teams</span>
              </Link>
            ))}
            {leagues.filter((l) => !l.isGlobal).length === 0 && (
              <p className="px-4 py-4 text-white/30 text-sm">You haven&apos;t joined a private league yet.</p>
            )}
          </div>
        </div>

        {/* Player warnings */}
        <div className="rounded-xl ring-1 ring-white/10 bg-[#0d1220]">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <span className="text-[11px] font-bold text-white/45 tracking-[0.15em] uppercase flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" />Player Warnings</span>
          </div>
          <div className="divide-y divide-white/5">
            {warnings.slice(0, 4).map((w) => (
              <div key={w.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-ink font-bold truncate">{w.name}{w.starting && <span className="text-live text-[10px] font-black ml-1.5 align-middle">STARTING</span>}</span>
                <span className="text-white/40 text-xs shrink-0">{w.reason}</span>
              </div>
            ))}
            {warnings.length === 0 && (
              <p className="px-4 py-4 text-white/30 text-sm flex items-center gap-1.5"><ShieldHalf className="w-3.5 h-3.5" />No issues with your squad.</p>
            )}
          </div>
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-white/10">
            <Link href="/history" className="text-[11px] font-bold text-white/40 hover:text-ink uppercase tracking-wide flex items-center gap-1"><History className="w-3 h-3" />History</Link>
            <Link href="/trends" className="text-[11px] font-bold text-white/40 hover:text-ink uppercase tracking-wide flex items-center gap-1"><TrendingUp className="w-3 h-3" />Trends</Link>
            <Link href="/dream-team" className="text-[11px] font-bold text-white/40 hover:text-ink uppercase tracking-wide flex items-center gap-1"><Star className="w-3 h-3" />Dream Team</Link>
          </div>
        </div>
      </div>

      {/* ---- Live tournament ticker ---- */}
      <div className="-mx-4 sm:-mx-6">
        <FixtureTicker items={tickerItems} />
      </div>

      {showPoints && <PointsBreakdownModal onClose={() => setShowPoints(false)} />}
    </div>
  );
}

function DeadlineUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="w-9 h-9 rounded-md bg-white/5 border border-white/10 flex flex-col items-center justify-center">
      <span className="font-display text-sm text-ink leading-none tabular-nums">{value.toString().padStart(2, '0')}</span>
      <span className="text-[7px] text-white/30 font-bold">{label}</span>
    </div>
  );
}

function StatTile({ label, value, icon, accent }: { label: string; value: string; icon?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-lg px-3.5 py-3 border ${accent ? 'bg-accent/[0.08] border-accent/30' : 'bg-white/[0.03] border-white/10'}`}>
      <div className="flex items-center gap-1.5 mb-1 text-white/40">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className={`font-display text-xl leading-none tabular-nums ${accent ? 'text-accent' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

function ChecklistRow({ ok, label, detail, warn }: { ok: boolean; label: string; detail?: string; warn?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`w-4 h-4 rounded-sm flex items-center justify-center text-[10px] font-black shrink-0 ${
        warn ? 'bg-live/20 text-live' : ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/40'
      }`}>
        {warn ? '!' : ok ? '✓' : '·'}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-ink font-bold truncate">{label}</p>
        {detail && <p className="text-white/40 text-xs truncate">{detail}</p>}
      </div>
    </div>
  );
}

function BriefingStat({ label, value, live }: { label: string; value: string; live?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/40 text-xs font-bold uppercase tracking-wide">{label}</span>
      <span className={`font-display text-lg tabular-nums ${live ? 'text-live' : 'text-ink'}`}>{value}</span>
    </div>
  );
}

function PitchRow({ players, captainId, viceId }: { players: SquadPlayer[]; captainId?: string; viceId?: string }) {
  if (players.length === 0) return null;
  return (
    <div className="flex justify-center gap-1 sm:gap-3">
      {players.map((s) => (
        <PlayerCard
          key={s.id}
          player={s.player}
          size="xs"
          isCaptain={s.playerId === captainId}
          isViceCaptain={s.playerId === viceId}
          livePoints={s.livePoints || s.points}
          eliminated={s.player.nation.isEliminated}
        />
      ))}
    </div>
  );
}
