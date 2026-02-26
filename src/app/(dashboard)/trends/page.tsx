'use client';

import { useState, useEffect } from 'react';
import { getFlagUrl } from '@/lib/flags';

interface TrendPlayer {
  playerId: string;
  displayName: string;
  position: string;
  currentPrice: number;
  nation: { name: string; code: string };
  count: number;
  netTransfers: number;
}

interface TrendsData {
  transfersIn: TrendPlayer[];
  transfersOut: TrendPlayer[];
  totalTransfers: number;
}

const POS_COLORS: Record<string, string> = {
  GK: 'bg-yellow-500/20 text-yellow-400',
  DEF: 'bg-blue-500/20 text-blue-400',
  MID: 'bg-green-500/20 text-green-400',
  FWD: 'bg-red-500/20 text-red-400',
};

export default function TrendsPage() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrends() {
      try {
        const res = await fetch('/api/trends');
        if (res.ok) {
          setData(await res.json());
        }
      } catch {
        console.error('Failed to fetch trends');
      } finally {
        setLoading(false);
      }
    }
    fetchTrends();
  }, []);

  function renderPlayerRow(player: TrendPlayer, type: 'in' | 'out', rank: number) {
    return (
      <div key={player.playerId} className="flex items-center gap-3 p-3 hover:bg-white/5 transition-colors">
        <span className="text-white/20 font-bold text-sm w-5 text-right">{rank}</span>
        <img src={getFlagUrl(player.nation.code)} alt="" className="w-5 h-3.5 rounded-sm object-cover" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{player.displayName}</p>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${POS_COLORS[player.position] || ''}`}>
              {player.position}
            </span>
            <span className="text-[10px] text-white/40">£{player.currentPrice.toFixed(1)}m</span>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold ${type === 'in' ? 'text-emerald-400' : 'text-red-400'}`}>
            {player.count}
          </p>
          <p className={`text-[10px] ${player.netTransfers > 0 ? 'text-emerald-400' : player.netTransfers < 0 ? 'text-red-400' : 'text-white/30'}`}>
            {player.netTransfers > 0 ? '+' : ''}{player.netTransfers} net
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Transfer Trends</h1>
        <p className="text-white/40 text-sm">
          Most popular transfers in the last 7 days
          {data && data.totalTransfers > 0 && (
            <span className="ml-2 text-white/20">({data.totalTransfers} total)</span>
          )}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data || (data.transfersIn.length === 0 && data.transfersOut.length === 0) ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
          <svg className="w-12 h-12 text-white/20 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <h3 className="text-lg font-bold text-white/60 mb-1">No Transfers Yet</h3>
          <p className="text-white/30 text-sm">Check back once the tournament begins</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Transfers In */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              <h3 className="text-sm font-bold text-emerald-400">Most Transferred In</h3>
            </div>
            <div className="divide-y divide-white/5">
              {data.transfersIn.map((p, i) => renderPlayerRow(p, 'in', i + 1))}
              {data.transfersIn.length === 0 && (
                <p className="p-4 text-white/30 text-sm text-center">No data</p>
              )}
            </div>
          </div>

          {/* Transfers Out */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
              <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              <h3 className="text-sm font-bold text-red-400">Most Transferred Out</h3>
            </div>
            <div className="divide-y divide-white/5">
              {data.transfersOut.map((p, i) => renderPlayerRow(p, 'out', i + 1))}
              {data.transfersOut.length === 0 && (
                <p className="p-4 text-white/30 text-sm text-center">No data</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
