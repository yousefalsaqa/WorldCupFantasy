'use client';

// ============================================
// FIXTURE DETAIL MODAL
//
// Tap a fixture card → bottom sheet with three tabs:
//   Stats     — possession bar, xG, shots… (FotMob-style rows)
//   Lineups   — formation pitch per team, real headshots, subs
//   Timeline  — goals / cards / subs / VAR, chronological
//
// Tabs are tappable AND horizontally swipeable. While the match is live
// the modal re-polls /api/fixtures/[id]/detail every 60s (the endpoint
// caches, so this costs at most 1 API-Football call per minute total
// across ALL viewers). Venue + referee sit in one muted header line —
// deliberately understated.
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { PlayerFace } from '@/components/kit';
import { getFlagUrl } from '@/lib/flags';

interface LineupPlayer {
  apiId: number;
  name: string;
  number: number;
  pos: string | null;
  grid: string | null;
  photoUrl: string | null;
}

interface Detail {
  available: boolean;
  referee: string | null;
  venue: { name: string; city: string } | null;
  status: { short: string; minute: number | null; isLive: boolean; isFinished: boolean };
  score: { home: number | null; away: number | null; penHome: number | null; penAway: number | null };
  teams: {
    home: { code: string; name: string; kitColor1: string; kitColor2: string };
    away: { code: string; name: string; kitColor1: string; kitColor2: string };
  };
  stats: Array<{ key: string; label: string; home: string | number; away: string | number }>;
  lineups: Array<{
    side: 'home' | 'away';
    formation: string | null;
    coach: string | null;
    startXI: LineupPlayer[];
    subs: LineupPlayer[];
  }>;
  events: Array<{
    minute: number;
    extra: number | null;
    side: 'home' | 'away' | null;
    type: string;
    detail: string;
    player: string | null;
    assist: string | null;
    comments: string | null;
  }>;
}

const TABS = ['Stats', 'Lineups', 'Timeline'] as const;
type Tab = (typeof TABS)[number];

export default function FixtureDetailModal({
  matchId,
  kickoffLabel,
  onClose,
}: {
  matchId: string;
  /** Pre-formatted kickoff time in the viewer's zone (shown pre-match). */
  kickoffLabel: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('Stats');
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/fixtures/${matchId}/detail`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.available !== false) setDetail(data as Detail);
      else setDetail(null);
    } catch {
      // keep whatever we have
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!detail?.status.isLive) return;
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [detail?.status.isLive, load]);

  // Body scroll lock while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Swipe between tabs (horizontal only — vertical is content scroll)
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
    const idx = TABS.indexOf(tab);
    const next = dx < 0 ? Math.min(idx + 1, TABS.length - 1) : Math.max(idx - 1, 0);
    setTab(TABS[next]);
  };

  const flag = (code: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={getFlagUrl(code, 'md')}
      alt={code}
      className="w-8 h-6 rounded shadow-md"
    />
  );

  const live = detail?.status.isLive ?? false;
  const finished = detail?.status.isFinished ?? false;
  const started = live || finished;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-slate-900 ring-1 ring-white/10 rounded-t-2xl sm:rounded-2xl max-h-[82dvh] sm:max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-white/10 relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/70 flex items-center justify-center text-sm"
            aria-label="Close"
          >
            ✕
          </button>

          {detail ? (
            <>
              <div className="flex items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-1 w-20">
                  {flag(detail.teams.home.code)}
                  <span className="text-white text-xs font-bold truncate max-w-full">{detail.teams.home.name}</span>
                </div>
                <div className="flex flex-col items-center min-w-[84px]">
                  {started ? (
                    <>
                      <span className={`text-2xl font-black ${live ? 'text-emerald-300' : 'text-white'}`}>
                        {detail.score.home ?? 0} - {detail.score.away ?? 0}
                      </span>
                      {detail.score.penHome != null && detail.score.penAway != null && (
                        <span className="text-[10px] text-white/50">({detail.score.penHome}-{detail.score.penAway} pens)</span>
                      )}
                      {live ? (
                        <span className="flex items-center gap-1 mt-0.5">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                          </span>
                          <span className="text-[10px] font-black tracking-wider text-emerald-300">
                            {detail.status.short === 'HT' ? 'HT' : `${detail.status.minute ?? ''}'`}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold tracking-wider text-white/40 mt-0.5">FT</span>
                      )}
                    </>
                  ) : (
                    <span className="text-sm font-bold text-white whitespace-nowrap">{kickoffLabel}</span>
                  )}
                </div>
                <div className="flex flex-col items-center gap-1 w-20">
                  {flag(detail.teams.away.code)}
                  <span className="text-white text-xs font-bold truncate max-w-full">{detail.teams.away.name}</span>
                </div>
              </div>

              {/* Venue · referee — one quiet line, no boxes */}
              {(detail.venue || detail.referee) && (
                <p className="mt-2 text-center text-[10px] text-white/35 truncate">
                  {detail.venue ? `${detail.venue.name}, ${detail.venue.city}` : ''}
                  {detail.venue && detail.referee ? ' · ' : ''}
                  {detail.referee ? `Referee: ${detail.referee}` : ''}
                </p>
              )}
            </>
          ) : (
            <div className="h-16 flex items-center justify-center">
              <span className="text-white/40 text-sm">{loading ? 'Loading…' : 'Match data not available yet'}</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-black tracking-wide transition-colors ${
                tab === t
                  ? 'text-emerald-300 border-b-2 border-emerald-400 bg-emerald-500/5'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain p-4"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {!detail ? (
            <Empty text={loading ? 'Loading…' : 'Nothing to show yet.'} />
          ) : tab === 'Stats' ? (
            <StatsTab detail={detail} />
          ) : tab === 'Lineups' ? (
            <LineupsTab detail={detail} />
          ) : (
            <TimelineTab detail={detail} />
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-center text-white/35 text-sm py-10">{text}</p>;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function num(v: string | number): number {
  return typeof v === 'number' ? v : parseFloat(v) || 0;
}

function StatsTab({ detail }: { detail: Detail }) {
  if (detail.stats.length === 0) {
    return (
      <Empty
        text={detail.status.isLive || detail.status.isFinished
          ? 'Stats appear a few minutes into the match.'
          : 'Stats will appear once the match kicks off.'}
      />
    );
  }

  const possession = detail.stats.find((s) => s.key === 'possession');
  const rest = detail.stats.filter((s) => s.key !== 'possession');
  const homePct = possession ? num(possession.home) : 50;

  return (
    <div className="space-y-4">
      {possession && (
        <div>
          <p className="text-center text-[11px] font-bold text-white/50 uppercase tracking-wider mb-2">
            Ball possession
          </p>
          <div className="flex h-8 rounded-full overflow-hidden text-xs font-black">
            <div
              className="bg-emerald-500 text-emerald-950 flex items-center pl-3"
              style={{ width: `${homePct}%` }}
            >
              {possession.home}
            </div>
            <div className="bg-white/85 text-slate-900 flex items-center justify-end pr-3 flex-1">
              {possession.away}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {rest.map((s) => {
          const h = num(s.home);
          const a = num(s.away);
          return (
            <div key={s.key} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
              <span className={`justify-self-start min-w-[2.2rem] text-center text-sm font-black px-2 py-0.5 rounded-full ${
                h > a ? 'bg-emerald-500 text-emerald-950' : 'text-white/80'
              }`}>
                {s.home}
              </span>
              <span className="text-center text-xs text-white/60">{s.label}</span>
              <span className={`justify-self-end min-w-[2.2rem] text-center text-sm font-black px-2 py-0.5 rounded-full ${
                a > h ? 'bg-white/85 text-slate-900' : 'text-white/80'
              }`}>
                {s.away}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lineups
// ---------------------------------------------------------------------------

function LineupsTab({ detail }: { detail: Detail }) {
  if (detail.lineups.length === 0) {
    return <Empty text="Lineups drop roughly 40 minutes before kickoff." />;
  }
  return (
    <div className="space-y-6">
      {(['home', 'away'] as const).map((side) => {
        const lu = detail.lineups.find((l) => l.side === side);
        if (!lu) return null;
        const team = detail.teams[side];
        return (
          <div key={side}>
            <div className="flex items-center gap-2 mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={getFlagUrl(team.code, 'sm')} alt={team.code} className="w-5 h-4 rounded" />
              <span className="text-white text-sm font-bold">{team.name}</span>
              {lu.formation && (
                <span className="text-[10px] font-mono text-white/50 bg-white/5 px-1.5 py-0.5 rounded">{lu.formation}</span>
              )}
              {lu.coach && <span className="ml-auto text-[10px] text-white/35 truncate">Coach: {lu.coach}</span>}
            </div>

            {/* Pitch: rows come from API grid "row:col" (GK = row 1) */}
            <div className="rounded-xl bg-gradient-to-b from-green-800/60 to-green-700/40 ring-1 ring-white/10 p-3 space-y-3">
              {groupByGridRow(lu.startXI).map((row, i) => (
                <div key={i} className="flex justify-around">
                  {row.map((p) => (
                    <div key={p.apiId} className="flex flex-col items-center w-14">
                      <PlayerFace
                        photoUrl={p.photoUrl}
                        primaryColor={team.kitColor1}
                        secondaryColor={team.kitColor2}
                        number={p.number}
                        nationCode={team.code}
                        size="xs"
                      />
                      <span className="mt-0.5 text-[8px] text-white font-semibold truncate max-w-full text-center">
                        {shortName(p.name)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {lu.subs.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-wider mb-1">Substitutes</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {lu.subs.map((p) => (
                    <span key={p.apiId} className="text-[10px] text-white/60">
                      <span className="text-white/35 font-mono">{p.number}</span> {shortName(p.name)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** "1:1" GK row first, then defenders etc. Falls back to position groups
 * when the API didn't send grid data. */
function groupByGridRow(players: LineupPlayer[]): LineupPlayer[][] {
  const withGrid = players.filter((p) => p.grid);
  if (withGrid.length === players.length && players.length > 0) {
    const rows = new Map<number, LineupPlayer[]>();
    for (const p of players) {
      const [r, c] = p.grid!.split(':').map(Number);
      if (!rows.has(r)) rows.set(r, []);
      rows.get(r)!.push({ ...p, grid: `${r}:${c}` });
    }
    return Array.from(rows.keys())
      .sort((a, b) => a - b)
      .map((r) =>
        rows.get(r)!.sort((a, b) => Number(a.grid!.split(':')[1]) - Number(b.grid!.split(':')[1])),
      );
  }
  // Fallback: G / D / M / F buckets
  const order = ['G', 'D', 'M', 'F'];
  return order
    .map((pos) => players.filter((p) => p.pos === pos))
    .filter((row) => row.length > 0);
}

function shortName(name: string): string {
  const parts = name.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : name;
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function eventIcon(type: string, detail: string): string {
  if (type === 'Goal') {
    if (detail === 'Own Goal') return '⚽ (OG)';
    if (detail === 'Penalty') return '⚽ (pen)';
    if (detail === 'Missed Penalty') return '✗ pen';
    return '⚽';
  }
  if (type === 'Card') {
    if (detail === 'Red Card') return '🟥';
    if (detail === 'Second Yellow card') return '🟨🟥';
    return '🟨';
  }
  if (type === 'subst') return '🔁';
  return '';
}

function TimelineTab({ detail }: { detail: Detail }) {
  if (detail.events.length === 0) {
    return (
      <Empty
        text={detail.status.isLive || detail.status.isFinished
          ? 'No events yet — goals, cards and subs land here.'
          : 'Events will appear once the match kicks off.'}
      />
    );
  }
  const events = [...detail.events].sort(
    (a, b) => a.minute - b.minute || (a.extra ?? 0) - (b.extra ?? 0),
  );
  return (
    <div className="space-y-1">
      {events.map((e, i) => {
        const isVar = e.type === 'Var';
        const team = e.side ? detail.teams[e.side] : null;
        return (
          <div
            key={i}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${
              e.type === 'Goal' ? 'bg-emerald-500/10' : isVar ? 'bg-violet-500/10' : ''
            }`}
          >
            <span className="w-9 text-right text-[11px] font-black text-white/50 font-mono shrink-0">
              {e.minute}{e.extra ? `+${e.extra}` : ''}&apos;
            </span>
            {team && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={getFlagUrl(team.code, 'sm')} alt={team.code} className="w-4 h-3 rounded shrink-0" />
            )}
            {isVar ? (
              <span className="px-1.5 py-0.5 rounded bg-violet-500/25 text-violet-300 text-[9px] font-black tracking-wider shrink-0">
                VAR
              </span>
            ) : (
              <span className="text-sm shrink-0">{eventIcon(e.type, e.detail)}</span>
            )}
            <span className="text-xs text-white min-w-0 truncate">
              {e.type === 'subst' ? (
                <>
                  <span className="text-emerald-300">{e.assist ?? '—'}</span>
                  <span className="text-white/40"> in · </span>
                  <span className="text-white/70">{e.player ?? '—'}</span>
                  <span className="text-white/40"> out</span>
                </>
              ) : (
                <>
                  {e.player}
                  {e.type === 'Goal' && e.assist && (
                    <span className="text-white/40"> (assist: {e.assist})</span>
                  )}
                  {isVar && <span className="text-white/50"> — {e.detail}</span>}
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
