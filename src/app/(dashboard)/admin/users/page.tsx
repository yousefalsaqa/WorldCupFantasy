'use client';

import { useEffect, useState } from 'react';
import { useUserTimezone } from '@/hooks/useTimezone';
import { formatDateShort } from '@/lib/format-time';

interface UserData {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  team: {
    id: string;
    name: string;
    totalPoints: number;
    bankBalance: number;
    _count: { squadPlayers: number };
  } | null;
}

export default function AdminUsersPage() {
  const { timezone } = useUserTimezone();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setUsers(data.users || []);
      }
    } catch (err) {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(search.toLowerCase()) ||
    user.email.toLowerCase().includes(search.toLowerCase()) ||
    (user.team?.name || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="text-white/50">Loading users...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-white mb-1">User Management</h2>
        <p className="text-white/40">View and manage all registered users</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-2xl font-black text-white">{users.length}</div>
          <div className="text-xs text-white/40">Total Users</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-2xl font-black text-white">
            {users.filter(u => u.team).length}
          </div>
          <div className="text-xs text-white/40">With Teams</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-2xl font-black text-white">
            {users.filter(u => u.isAdmin).length}
          </div>
          <div className="text-xs text-white/40">Admins</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-2xl font-black text-white">
            {users.filter(u => !u.team).length}
          </div>
          <div className="text-xs text-white/40">No Team Yet</div>
        </div>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Search by username, email, or team name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl 
                     text-white placeholder-white/30 focus:outline-none focus:border-white/30"
        />
      </div>

      {/* Users Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Team</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-white/40 uppercase">Points</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-white/40 uppercase">Budget</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-white/40 uppercase">Players</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{user.username}</span>
                      {user.isAdmin && (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
                          Admin
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/60 text-sm">{user.email}</td>
                  <td className="px-4 py-3">
                    {user.team ? (
                      <span className="text-white">{user.team.name}</span>
                    ) : (
                      <span className="text-white/30">No team</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-green-400 font-medium">
                      {user.team?.totalPoints || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-white/60">
                    £{(user.team?.bankBalance || 0).toFixed(1)}m
                  </td>
                  <td className="px-4 py-3 text-right text-white/60">
                    {user.team?._count.squadPlayers || 0}
                  </td>
                  <td className="px-4 py-3 text-white/40 text-sm">
                    {formatDateShort(new Date(user.createdAt), timezone)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-white/10">
          {filteredUsers.map((user) => (
            <div key={user.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{user.username}</span>
                  {user.isAdmin && (
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
                      Admin
                    </span>
                  )}
                </div>
                <span className="text-green-400 font-bold">
                  {user.team?.totalPoints || 0} pts
                </span>
              </div>
              <div className="text-white/40 text-sm">{user.email}</div>
              {user.team && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/60">{user.team.name}</span>
                  <span className="text-white/40">
                    {user.team._count.squadPlayers} players • £{user.team.bankBalance.toFixed(1)}m
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {filteredUsers.length === 0 && (
          <div className="p-8 text-center text-white/40">
            {search ? 'No users match your search' : 'No users found'}
          </div>
        )}
      </div>
    </div>
  );
}
