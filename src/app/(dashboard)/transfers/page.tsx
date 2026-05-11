'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeftRight,
  Sparkles,
  Wand2,
  RefreshCw,
  Crown,
  Users,
  Zap,
  History as HistoryIcon,
} from 'lucide-react';
import { getFlagUrl } from '@/lib/flags';
import { useUserTimezone } from '@/hooks/useTimezone';
import { formatAdminTimestamp, formatRelativePast } from '@/lib/format-time';

// ============================================
// Types — must mirror the shape returned by GET /api/transfers/history.
// We keep them inline (no shared types file) to avoid an extra import; the
// route handler comments call out the contract.
// ============================================

interface PlayerSummary {
  id: string;
  displayName: string;
  position: string;
  nation: { code: string; name: string };
}

interface TransferEntry {
  kind: 'transfer';
  id: string;
  createdAt: string;
  playerIn: PlayerSummary | null;
  playerOut: PlayerSummary | null;
  priceIn: number;
  priceOut: number;
  isFreeTransfer: boolean;
  isWildcard: boolean;
  isMercyTransfer: boolean;
}

interface ChipEntry {
  kind: 'chip';
  id: string;
  createdAt: string;
  chipId: string;
  stageName: string | null;
}

type Entry = TransferEntry | ChipEntry;

// Map our internal chip IDs to friendly names + icons. Kept in sync with the
// squad page chip card definitions.
const CHIP_META: Record<string, { name: string; icon: React.ComponentType<{ className?: string }> }> = {
  WILDCARD_1: { name: 'Wildcard 1', icon: RefreshCw },
  WILDCARD_2: { name: 'Wildcard 2', icon: RefreshCw },
  TRIPLE_CAPTAIN: { name: 'Triple Captain', icon: Crown },
  BENCH_BOOST: { name: 'Bench Boost', icon: Users },
  FREE_HIT: { name: 'Free Hit', icon: Wand2 },
  // Fallback for any future chip we add before remembering to update this map.
  UNKNOWN: { name: 'Chip', icon: Sparkles },
};

// Position pill colour for transfer rows. Matches the picker modal palette.
function positionTone(position: string): string {
  if (position === 'GK') return 'bg-amber-500/15 text-amber-300';
  if (position === 'DEF') return 'bg-sky-500/15 text-sky-300';
  if (position === 'MID') return 'bg-emerald-500/15 text-emerald-300';
  return 'bg-rose-500/15 text-rose-300';
}

export default function TransfersHistoryPage() {
  const { timezone } = useUserTimezone();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/transfers/history', { credentials: 'include' });
        if (!res.ok) {
          // The auth interceptor will catch 401 globally, so anything we see
          // here is a real error worth surfacing.
          const data = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(data.error || `Failed to load history (status ${res.status})`);
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) setEntries(data.entries || []);
      } catch (err) {
        console.error('Load transfers history failed:', err);
        if (!cancelled) setError('Could not reach the server. Check your connection and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-12">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.4)]">
            <HistoryIcon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Activity</h1>
            <p className="text-white/40 text-xs sm:text-sm">
              All your transfers and chip activations, newest first
            </p>
          </div>
        </div>
        <Link
          href="/squad"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 hover:bg-amber-500/25 text-xs sm:text-sm font-bold transition-colors self-start sm:self-auto"
        >
          <ArrowLeftRight className="w-4 h-4" />
          Make a transfer
        </Link>
      </div>

      {/* Body */}
      {loading ? (
        <div className="py-16 text-center text-white/40">Loading activity…</div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-white/40 text-sm mb-4">
            No transfers or chip activations yet. Once the tournament starts,
            every swap and chip will appear here.
          </p>
          <Link
            href="/squad"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-colors"
          >
            Go to my squad
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) =>
            entry.kind === 'transfer' ? (
              <TransferRow key={entry.id} entry={entry} timezone={timezone} />
            ) : (
              <ChipRow key={entry.id} entry={entry} timezone={timezone} />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

// ============================================
// Row renderers — split out for readability and to keep the main component
// focused on data flow.
// ============================================

function TransferRow({ entry, timezone }: { entry: TransferEntry; timezone: string }) {
  const priceDelta = entry.priceIn - entry.priceOut;
  // Free transfers and chip-bought transfers (wildcard / free hit) cost
  // nothing. Otherwise the user took a -4 hit.
  const tookHit = !entry.isFreeTransfer && !entry.isWildcard;
  return (
    <li className="rounded-xl bg-white/5 border border-white/10 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-white/40" />
          <span className="text-xs uppercase tracking-wider text-white/40 font-bold">Transfer</span>
          {entry.isWildcard && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-300 font-bold">
              Wildcard
            </span>
          )}
          {entry.isMercyTransfer && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
              Mercy
            </span>
          )}
          {entry.isFreeTransfer && !entry.isWildcard && !entry.isMercyTransfer && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-300 font-bold">
              Free
            </span>
          )}
          {tookHit && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 font-bold">
              -4 pts
            </span>
          )}
        </div>
        <span
          className="text-[10px] text-white/40 whitespace-nowrap"
          title={formatAdminTimestamp(new Date(entry.createdAt), timezone)}
        >
          {formatRelativePast(new Date(entry.createdAt), Date.now(), timezone)}
        </span>
      </div>

      <div className="flex items-stretch gap-2 sm:gap-3">
        <PlayerCell player={entry.playerOut} fallback="Unknown" />
        <div className="flex items-center text-white/30 font-bold text-xs">→</div>
        <PlayerCell player={entry.playerIn} fallback="Unknown" />
      </div>

      <div className="mt-2 text-[11px] text-white/50 flex items-center gap-3">
        <span>
          £{entry.priceOut.toFixed(1)}m → £{entry.priceIn.toFixed(1)}m
        </span>
        <span
          className={
            priceDelta === 0
              ? 'text-white/40'
              : priceDelta < 0
              ? 'text-emerald-300'
              : 'text-amber-300'
          }
        >
          {priceDelta === 0 ? '£0.0m' : `${priceDelta < 0 ? '−' : '+'}£${Math.abs(priceDelta).toFixed(1)}m`}
        </span>
      </div>
    </li>
  );
}

function PlayerCell({ player, fallback }: { player: PlayerSummary | null; fallback: string }) {
  if (!player) {
    return (
      <div className="flex-1 min-w-0 flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
        <div className="w-6 h-4 rounded-sm bg-white/10" />
        <div className="text-sm text-white/40 truncate">{fallback}</div>
      </div>
    );
  }
  return (
    <div className="flex-1 min-w-0 flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
      <img
        src={getFlagUrl(player.nation.code)}
        alt=""
        className="w-6 h-4 rounded-sm object-cover flex-shrink-0"
      />
      <div className="min-w-0">
        <p className="text-sm text-white font-semibold truncate">{player.displayName}</p>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className={`px-1.5 py-0.5 rounded font-bold ${positionTone(player.position)}`}>
            {player.position}
          </span>
          <span className="text-white/40 truncate">{player.nation.name}</span>
        </div>
      </div>
    </div>
  );
}

function ChipRow({ entry, timezone }: { entry: ChipEntry; timezone: string }) {
  const meta = CHIP_META[entry.chipId] ?? CHIP_META.UNKNOWN;
  const Icon = meta.icon;
  return (
    <li className="rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-amber-300" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span className="text-xs uppercase tracking-wider text-amber-300/80 font-bold">
                Chip activated
              </span>
            </div>
            <p className="text-sm font-bold text-white truncate">
              {meta.name}
              {entry.stageName && (
                <span className="text-white/40 font-normal"> · {entry.stageName}</span>
              )}
            </p>
          </div>
        </div>
        <span
          className="text-[10px] text-white/40 whitespace-nowrap"
          title={formatAdminTimestamp(new Date(entry.createdAt), timezone)}
        >
          {formatRelativePast(new Date(entry.createdAt), Date.now(), timezone)}
        </span>
      </div>
    </li>
  );
}
