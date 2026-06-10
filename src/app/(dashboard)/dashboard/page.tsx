'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFlagUrl } from '@/lib/flags';
import { useUserTimezone } from '@/hooks/useTimezone';
import { formatDateShort } from '@/lib/format-time';

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
  deadlineTime: string | null;
}

// Host nations
const HOST_FLAGS = ['us', 'ca', 'mx'];

export default function DashboardPage() {
  const { timezone } = useUserTimezone();
  const [user, setUser] = useState<User | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [currentStage, setCurrentStage] = useState<Stage | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [teamName, setTeamName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    // Hard timeout so the spinner never spins forever on iOS Safari if a
    // serverless cold-start or dropped Postgres connection stalls a request.
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 20000);
    try {
      const [userRes, teamRes, stageRes] = await Promise.all([
        fetch('/api/auth/me', { signal: ctrl.signal }),
        fetch('/api/team', { signal: ctrl.signal }),
        fetch('/api/stages/current', { signal: ctrl.signal }),
      ]);

      const userData = await userRes.json();
      const teamData = await teamRes.json();
      const stageData = await stageRes.json();

      setUser(userData.user);
      if (teamRes.ok && teamData.team) {
        setTeam(teamData.team);
      } else {
        setTeam(null);
      }
      setCurrentStage(stageData.stage);
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

      if (res.ok) {
        // Redirect to squad builder after creating team
        window.location.href = '/squad';
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create team');
      }
    } catch (error) {
      console.error('Create team error:', error);
      alert('Failed to create team. Please try again.');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white">
            {team ? `Welcome, ${user?.username}` : 'Get Started'}
          </h1>
          <p className="text-white/40 text-sm">
            {team ? team.name : 'Create your World Cup squad'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Host flags - hidden on very small screens */}
          <div className="hidden sm:flex -space-x-2">
            {HOST_FLAGS.map(code => (
              <img
                key={code}
                src={getFlagUrl(code, 'md')}
                alt=""
                className="w-7 h-5 sm:w-8 sm:h-6 rounded shadow-md ring-2 ring-[#0a0e17]"
              />
            ))}
          </div>
          {user?.isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-red-500/20 to-blue-500/20 border border-white/10 rounded-xl text-white/80 hover:text-white hover:border-white/20 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="font-semibold text-xs sm:text-sm">Admin</span>
            </Link>
          )}
        </div>
      </div>

      {/* No Team State */}
      {!team && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-red-500/20 to-blue-500/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Create Your Squad</h2>
          <p className="text-white/40 mb-8 max-w-sm mx-auto">
            Pick 15 players from 48 nations. Compete with friends. Win glory.
          </p>
          
          {!showCreateTeam ? (
            <button
              onClick={() => setShowCreateTeam(true)}
              className="px-8 py-3 bg-white text-[#0a0e17] font-black rounded-xl hover:bg-white/90 transition-all"
            >
              Create Team
            </button>
          ) : (
            <div className="max-w-xs mx-auto space-y-4">
              <input
                type="text"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="Enter team name..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:border-white/30 outline-none"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateTeam(false)}
                  className="flex-1 bg-white/5 border border-white/10 text-white/70 py-2.5 rounded-xl hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={createTeam}
                  className="flex-1 bg-white text-[#0a0e17] font-bold py-2.5 rounded-xl hover:bg-white/90 transition-all"
                >
                  Create
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Team Dashboard */}
      {team && (
        <>
          {/* Empty-squad hero — the one thing a new user must do is pick
              their 15. Until teamValue is non-zero nothing else on this
              page matters, so this card leads and everything else demotes. */}
          {team.teamValue === 0 && (
            <Link
              href="/squad"
              className="block relative overflow-hidden rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-500/15 via-pink-500/10 to-purple-600/15 p-6 sm:p-8 group hover:border-rose-400/50 transition-all"
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    'radial-gradient(ellipse 400px 200px at 80% 0%, rgba(244,63,94,0.15), transparent 70%)',
                }}
              />
              <div className="relative flex items-center justify-between gap-4">
                <div>
                  <p className="text-rose-300 text-xs font-bold uppercase tracking-widest mb-1.5">Get Started</p>
                  <h2 className="text-xl sm:text-2xl font-black text-white mb-1">Pick your 15 players</h2>
                  <p className="text-white/50 text-sm">
                    £100m budget · 48 nations
                    {currentStage?.deadlineTime
                      ? ` · deadline ${formatDateShort(new Date(currentStage.deadlineTime), timezone)}`
                      : ''}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-rose-500 to-pink-600 rounded-xl font-black text-white text-sm shadow-lg shadow-rose-500/30 group-hover:shadow-rose-500/50 transition-shadow">
                    Build Your Squad
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
                <div className="hidden sm:flex w-24 h-24 rounded-2xl bg-white/5 border border-white/10 items-center justify-center text-5xl font-black text-white/20 group-hover:text-white/30 transition-colors">
                  15
                </div>
              </div>
            </Link>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              label="Total Points"
              value={team.totalPoints.toString()}
              icon={<ChartIcon />}
              highlight
            />
            <StatCard
              label="Bank"
              value={`£${team.bankBalance.toFixed(1)}m`}
              icon={<BankIcon />}
            />
            <StatCard
              label="Team Value"
              value={`£${team.teamValue.toFixed(1)}m`}
              icon={<TrendIcon />}
            />
            <StatCard
              label="Free Transfers"
              value={team.freeTransfers.toString()}
              icon={<TransferIcon />}
            />
          </div>

          {/* Current Stage */}
          {currentStage && (
            <div className="bg-gradient-to-r from-white/5 to-transparent border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                    <TrophyIcon />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{currentStage.name}</h3>
                    <p className="text-sm text-white/40">
                      {currentStage.deadlineTime
                        ? `Deadline: ${formatDateShort(new Date(currentStage.deadlineTime), timezone)}`
                        : 'Pre-tournament'}
                    </p>
                  </div>
                </div>
                <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-bold">
                  ACTIVE
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 gap-3">
            <QuickAction href="/squad" icon={<SquadIcon />} label="My Squad" />
            <QuickAction href="/fixtures" icon={<CalendarIcon />} label="Fixtures" />
            <QuickAction href="/standings" icon={<StandingsIcon />} label="Standings" />
            <QuickAction href="/transfers" icon={<TransferIcon />} label="Activity" />
            <QuickAction href="/leagues" icon={<TrophyIcon />} label="Leagues" />
            <QuickAction href="/history" icon={<HistoryIcon />} label="History" />
            <QuickAction href="/trends" icon={<TrendsIcon />} label="Trends" />
            <QuickAction href="/dream-team" icon={<StarIcon />} label="Dream Team" />
          </div>

          {/* Groups Preview */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Tournament Groups</h3>
              <Link href="/fixtures" className="text-sm text-rose-400 hover:text-rose-300 font-medium">
                View all fixtures →
              </Link>
            </div>
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
              {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(group => (
                <Link
                  key={group}
                  href={`/standings?group=${group}`}
                  className="aspect-square bg-white/5 rounded-lg flex items-center justify-center font-bold text-white/60 hover:bg-rose-500/20 hover:text-rose-400 transition-all cursor-pointer border border-transparent hover:border-rose-500/30"
                >
                  {group}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Icons
function ChartIcon() {
  return (
    <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function BankIcon() {
  return (
    <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function TransferIcon() {
  return (
    <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

function SquadIcon() {
  return (
    <svg className="w-6 h-6 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="w-6 h-6 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="w-6 h-6 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function StandingsIcon() {
  return (
    <svg className="w-6 h-6 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v18H3z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9h18" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v18" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg className="w-6 h-6 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function TrendsIcon() {
  return (
    <svg className="w-6 h-6 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 border transition-all
      ${highlight
        ? 'bg-gradient-to-br from-red-500/10 to-blue-500/10 border-white/20'
        : 'bg-white/5 border-white/10 hover:border-white/20'
      }`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl sm:text-2xl font-black ${highlight ? 'text-white' : 'text-white/80'}`}>
        {value}
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl p-3.5 text-center transition-all group"
    >
      <div className="mb-1.5 flex justify-center group-hover:scale-110 transition-transform">{icon}</div>
      <div className="font-semibold text-white/70 group-hover:text-white text-xs sm:text-sm">{label}</div>
    </Link>
  );
}
