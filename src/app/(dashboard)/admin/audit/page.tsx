'use client';

import { useEffect, useState } from 'react';

interface AuditEntry {
  id: string;
  action: string;
  details: string;
  userId: string | null;
  createdAt: string;
  user?: { username: string } | null;
}

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAuditLog();
  }, []);

  const fetchAuditLog = async () => {
    try {
      const res = await fetch('/api/admin/audit');
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setEntries(data.entries || []);
      }
    } catch {
      setError('Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

  const parseDetails = (details: string) => {
    try {
      return JSON.parse(details);
    } catch {
      return { raw: details };
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes('OVERRIDE')) return 'text-amber-400 bg-amber-500/20';
    if (action.includes('DELETE')) return 'text-red-400 bg-red-500/20';
    if (action.includes('CREATE')) return 'text-green-400 bg-green-500/20';
    if (action.includes('UPDATE')) return 'text-blue-400 bg-blue-500/20';
    return 'text-white/60 bg-white/10';
  };

  if (loading) {
    return <div className="text-white/50">Loading audit log...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-white mb-1">Audit Log</h2>
        <p className="text-white/40">Track all admin actions and changes</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-2xl font-black text-white">{entries.length}</div>
          <div className="text-xs text-white/40">Total Entries</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-2xl font-black text-amber-400">
            {entries.filter(e => e.action.includes('OVERRIDE')).length}
          </div>
          <div className="text-xs text-white/40">Overrides</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-2xl font-black text-green-400">
            {entries.filter(e => e.action.includes('CREATE')).length}
          </div>
          <div className="text-xs text-white/40">Creates</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="text-2xl font-black text-blue-400">
            {entries.filter(e => e.action.includes('UPDATE')).length}
          </div>
          <div className="text-xs text-white/40">Updates</div>
        </div>
      </div>

      {/* Log Entries */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="divide-y divide-white/5">
          {entries.length === 0 ? (
            <div className="p-8 text-center text-white/40">
              No audit entries yet. Actions will be logged here.
            </div>
          ) : (
            entries.map((entry) => {
              const details = parseDetails(entry.details);
              return (
                <div key={entry.id} className="p-4 hover:bg-white/5">
                  <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-2">
                    <span className={`text-xs px-2 py-1 rounded font-medium w-fit ${getActionColor(entry.action)}`}>
                      {entry.action}
                    </span>
                    <span className="text-white/40 text-sm">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                    {entry.user && (
                      <span className="text-white/60 text-sm">
                        by {entry.user.username}
                      </span>
                    )}
                  </div>
                  
                  {/* Details */}
                  <div className="text-sm space-y-1">
                    {details.playerName && (
                      <p className="text-white">
                        Player: <span className="text-white/60">{details.playerName}</span>
                      </p>
                    )}
                    {details.pointsAdded !== undefined && (
                      <p className="text-white">
                        Points: <span className={details.pointsAdded >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {details.pointsAdded >= 0 ? '+' : ''}{details.pointsAdded}
                        </span>
                      </p>
                    )}
                    {details.reason && (
                      <p className="text-white/40">
                        Reason: {details.reason}
                      </p>
                    )}
                    {details.matchId && (
                      <p className="text-white/40 text-xs">
                        Match ID: {details.matchId}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
