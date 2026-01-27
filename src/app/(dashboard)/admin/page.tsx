'use client';

import { useEffect, useState } from 'react';

interface Stats {
  nations: number;
  players: number;
  users: number;
  teams: number;
  stages: number;
  matches: number;
  error?: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        }
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load stats');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="text-white/50">Loading stats...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-black text-white mb-1">
          Admin Dashboard
        </h2>
        <p className="text-white/40">
          Manage nations, players, fixtures, and results
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400 text-sm">Error loading stats: {error}</p>
          <p className="text-white/40 text-xs mt-1">Check database connection or try refreshing</p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon="🌍" label="Nations" value={stats?.nations || 0} />
        <StatCard icon="👥" label="Players" value={stats?.players || 0} />
        <StatCard icon="👤" label="Users" value={stats?.users || 0} />
        <StatCard icon="⚽" label="Teams" value={stats?.teams || 0} />
        <StatCard icon="📅" label="Stages" value={stats?.stages || 0} />
        <StatCard icon="🎮" label="Matches" value={stats?.matches || 0} />
      </div>

      {/* Quick Actions */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h3 className="font-bold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ActionCard href="/admin/players" icon="➕" label="Add Player" />
          <ActionCard href="/admin/results" icon="📝" label="Enter Results" />
          <ActionCard href="/admin/fixtures" icon="📅" label="Manage Fixtures" />
          <ActionCard href="/admin/sync" icon="🔄" label="Sync API" />
        </div>
      </div>

      {/* Setup Checklist */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h3 className="font-bold text-white mb-4">Setup Checklist</h3>
        <div className="space-y-3">
          <ChecklistItem done={(stats?.nations || 0) >= 37} label="Nations seeded (37+ nations)" />
          <ChecklistItem done={(stats?.players || 0) > 0} label="Players added to nations" />
          <ChecklistItem done={(stats?.matches || 0) > 0} label="Group stage fixtures created" />
          <ChecklistItem done={false} label="Deadline times set for each stage" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="text-xs text-white/40 font-medium">{label}</div>
    </div>
  );
}

function ActionCard({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a
      href={href}
      className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl p-4 text-center transition-all"
    >
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-medium text-white/80 text-sm">{label}</div>
    </a>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm
        ${done ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/30'}`}>
        {done ? '✓' : '○'}
      </div>
      <span className={done ? 'text-white/70' : 'text-white/40'}>{label}</span>
    </div>
  );
}
