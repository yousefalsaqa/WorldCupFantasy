'use client';

import { useState } from 'react';

export default function AdminSyncPage() {
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  function addLog(message: string) {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  }

  async function syncTeams() {
    setLoading(true);
    addLog('Starting teams sync...');
    
    try {
      const res = await fetch('/api/admin/sync/teams', { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        addLog(`✅ Teams synced successfully: ${data.count || 0} teams`);
      } else {
        addLog(`❌ Failed: ${data.error}`);
      }
    } catch (error) {
      addLog(`❌ Error: ${error}`);
    }
    
    setLoading(false);
  }

  async function syncPlayers() {
    setLoading(true);
    addLog('Starting players sync...');
    addLog('Note: World Cup squads not announced yet. Check API-Football closer to tournament.');
    
    // This would sync from API-Football once squads are announced
    setTimeout(() => {
      addLog('⚠️ World Cup 2026 squads not yet available in API');
      addLog('Add players manually via Admin → Players');
      setLoading(false);
    }, 1500);
  }

  async function syncFixtures() {
    setLoading(true);
    addLog('Starting fixtures sync...');
    
    try {
      const res = await fetch('/api/admin/sync/fixtures', { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        addLog(`✅ Fixtures synced: ${data.count || 0} matches`);
      } else {
        addLog(`❌ Failed: ${data.error}`);
      }
    } catch (error) {
      addLog(`❌ Error: ${error}`);
    }
    
    setLoading(false);
  }

  async function testApiConnection() {
    setLoading(true);
    addLog('Testing API-Football connection...');
    
    try {
      const res = await fetch('/api/admin/sync/test');
      const data = await res.json();
      
      if (res.ok && data.connected) {
        addLog('✅ API-Football connection successful');
        addLog(`   Requests remaining: ${data.requestsRemaining || 'N/A'}`);
      } else {
        addLog(`❌ Connection failed: ${data.error || 'Unknown error'}`);
        addLog('   Check your API key in .env file');
      }
    } catch (error) {
      addLog(`❌ Error: ${error}`);
    }
    
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">🔄 API Sync</h2>
        <p className="text-slate-400">Sync data from API-Football</p>
      </div>

      {/* API Key Info */}
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <h3 className="font-semibold text-white mb-3">📋 Setup</h3>
        <div className="space-y-2 text-sm text-slate-400">
          <p>1. Get free API key from <a href="https://www.api-football.com/" target="_blank" rel="noopener" className="text-amber-400 hover:underline">api-football.com</a></p>
          <p>2. Add to your <code className="bg-slate-800 px-2 py-0.5 rounded">.env</code> file:</p>
          <pre className="bg-slate-800 p-3 rounded-lg text-green-400 font-mono mt-2">
            API_FOOTBALL_KEY=your_api_key_here
          </pre>
          <p className="mt-3">Free tier: 100 requests/day - enough for near-live updates</p>
        </div>
      </div>

      {/* Sync Actions */}
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <h3 className="font-semibold text-white mb-4">⚡ Sync Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SyncButton
            onClick={testApiConnection}
            disabled={loading}
            icon="🔌"
            label="Test Connection"
          />
          <SyncButton
            onClick={syncTeams}
            disabled={loading}
            icon="🌍"
            label="Sync Teams"
          />
          <SyncButton
            onClick={syncPlayers}
            disabled={loading}
            icon="👥"
            label="Sync Players"
          />
          <SyncButton
            onClick={syncFixtures}
            disabled={loading}
            icon="📅"
            label="Sync Fixtures"
          />
        </div>
      </div>

      {/* Activity Log */}
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">📜 Activity Log</h3>
          <button
            onClick={() => setLog([])}
            className="text-sm text-slate-400 hover:text-white"
          >
            Clear
          </button>
        </div>
        <div className="bg-slate-950 rounded-lg p-4 font-mono text-sm max-h-64 overflow-y-auto">
          {log.length === 0 ? (
            <p className="text-slate-500">No activity yet. Run a sync action to see logs.</p>
          ) : (
            log.map((entry, i) => (
              <p key={i} className="text-slate-300 mb-1">{entry}</p>
            ))
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <h4 className="font-semibold text-amber-400 mb-2">⚠️ Important Notes</h4>
        <ul className="text-sm text-amber-200/70 space-y-1">
          <li>• World Cup 2026 data may not be available until closer to the tournament</li>
          <li>• You can add teams, players, and fixtures manually via the admin panel</li>
          <li>• API sync will help with live match updates during the tournament</li>
          <li>• Free tier allows ~100 API calls per day - plan sync timing accordingly</li>
        </ul>
      </div>
    </div>
  );
}

function SyncButton({
  onClick,
  disabled,
  icon,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:hover:bg-slate-800 border border-slate-700 rounded-lg p-4 text-center transition-colors"
    >
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-sm font-medium text-white">{label}</div>
    </button>
  );
}
