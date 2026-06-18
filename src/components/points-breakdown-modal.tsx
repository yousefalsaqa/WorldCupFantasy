'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Trophy, ChevronRight } from 'lucide-react';
import { PlayerFace } from '@/components/kit';

// ── Types mirroring the two endpoints this popup reads ──────────────────
interface StageSummary {
  stageId: string;
  name: string;
  order: number;
  isActive: boolean;
  isComplete: boolean;
  points: { rawPoints: number; captainPoints: number; transferHits: number; totalPoints: number } | null;
  chips: string[];
}

interface GwPlayer {
  playerId: string;
  displayName: string;
  position: string;
  isStarting: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  benchOrder: number | null;
  totalPoints: number;
  shirtNumber: number | null;
  photoUrl: string | null;
  nation: { code: string; kitColor1: string; kitColor2: string } | null;
}

const ROWS = ['FWD', 'MID', 'DEF', 'GK'] as const;

// Short chip labels for the per-round badges (compact for the tight row).
const CHIP_BADGE: Record<string, { label: string; cls: string }> = {
  TRIPLE_CAPTAIN: { label: '3×C', cls: 'bg-amber-500/20 text-amber-300 ring-amber-400/40' },
  BENCH_BOOST: { label: 'BB', cls: 'bg-violet-500/20 text-violet-200 ring-violet-400/40' },
  WILDCARD_1: { label: 'WC', cls: 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40' },
  WILDCARD_2: { label: 'WC2', cls: 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40' },
  FREE_HIT: { label: 'FH', cls: 'bg-sky-500/20 text-sky-200 ring-sky-400/40' },
};

// One read-only mini player chip: kit face + name + points pill + armband.
function MiniChip({ p }: { p: GwPlayer }) {
  return (
    <div className="flex flex-col items-center w-[52px] shrink-0">
      <div className="relative">
        <PlayerFace
          photoUrl={p.photoUrl}
          primaryColor={p.nation?.kitColor1 || '#FFF'}
          secondaryColor={p.nation?.kitColor2 || '#000'}
          number={p.shirtNumber}
          nationCode={p.nation?.code || ''}
          size="xs"
        />
        {p.isCaptain && (
          <span className="absolute -top-1 -left-1 z-10 w-4 h-4 rounded-full bg-amber-400 text-amber-950 text-[8px] font-black flex items-center justify-center ring-1 ring-amber-200">C</span>
        )}
        {p.isViceCaptain && !p.isCaptain && (
          <span className="absolute -top-1 -left-1 z-10 w-4 h-4 rounded-full bg-white/80 text-slate-900 text-[8px] font-black flex items-center justify-center">V</span>
        )}
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-10 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-black leading-tight shadow tabular-nums">
          {p.totalPoints}
        </span>
      </div>
      <span className="mt-1 text-[8px] text-white/80 font-semibold truncate w-full text-center leading-tight">
        {p.displayName}
      </span>
    </div>
  );
}

// Tappable per-gameweek points breakdown. Lists every round with its score;
// expanding a played round fetches that round's team (starting XI + bench)
// with each player's points for the round.
export default function PointsBreakdownModal({ onClose }: { onClose: () => void }) {
  const [summary, setSummary] = useState<{ totalPoints: number; stages: StageSummary[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [teamByStage, setTeamByStage] = useState<Record<string, GwPlayer[] | 'loading' | 'empty'>>({});
  // True for rounds whose lineup was estimated from the settled points (no
  // stored snapshot existed — pre-GR3). Drives the "best guess" note.
  const [inferredByStage, setInferredByStage] = useState<Record<string, boolean>>({});

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/team/stages-summary', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) { setSummary(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const toggleStage = useCallback((stageId: string, hasPoints: boolean) => {
    if (!hasPoints) return;
    setOpenStage((cur) => (cur === stageId ? null : stageId));
    setTeamByStage((prev) => {
      if (prev[stageId]) return prev;
      // Lazy-load the round's team the first time it's expanded.
      fetch(`/api/gameweek/${stageId}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const players: GwPlayer[] = d?.players ?? [];
          setTeamByStage((p) => ({ ...p, [stageId]: players.length ? players : 'empty' }));
          if (d?.lineupInferred) setInferredByStage((p) => ({ ...p, [stageId]: true }));
        })
        .catch(() => setTeamByStage((p) => ({ ...p, [stageId]: 'empty' })));
      return { ...prev, [stageId]: 'loading' };
    });
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 w-full max-w-2xl sm:rounded-2xl rounded-t-2xl border border-white/10 shadow-2xl max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-emerald-600/20 to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-white leading-tight">Points breakdown</h2>
              <p className="text-xs text-white/40">Tap a round to see that week&apos;s team</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {summary && (
              <div className="text-right">
                <p className="text-[10px] text-white/40 uppercase font-bold leading-none">Total</p>
                <p className="text-emerald-400 font-black text-lg leading-tight">{summary.totalPoints}</p>
              </div>
            )}
            <button onClick={onClose} className="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/5">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-3 space-y-2">
          {loading && (
            <div className="py-10 text-center text-white/40 text-sm">Loading…</div>
          )}
          {!loading && summary?.stages.map((s) => {
            const hasPoints = !!s.points;
            const team = teamByStage[s.stageId];
            const open = openStage === s.stageId;
            return (
              <div key={s.stageId} className="rounded-xl border border-white/10 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleStage(s.stageId, hasPoints)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left ${
                    hasPoints ? 'hover:bg-white/[0.06]' : 'opacity-60 cursor-default'
                  } ${s.isActive ? 'bg-emerald-500/5' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{s.name}</p>
                      {/* Chips played this round (Triple Captain / Bench Boost /
                          Wildcard / Free Hit). */}
                      {s.chips?.map((c) => {
                        const b = CHIP_BADGE[c];
                        return b ? (
                          <span key={c} className={`shrink-0 px-1 py-[1px] rounded text-[8px] font-black ring-1 ${b.cls}`}>
                            {b.label}
                          </span>
                        ) : null;
                      })}
                    </div>
                    <p className="text-[11px] text-white/40">
                      {s.isActive ? 'In progress' : s.points ? `${s.points.rawPoints} pts + ${s.points.captainPoints} (C)${s.points.transferHits ? ` − ${s.points.transferHits} hits` : ''}` : 'Upcoming'}
                    </p>
                  </div>
                  {s.points ? (
                    <span className="font-black text-emerald-400 text-base tabular-nums shrink-0">{s.points.totalPoints}</span>
                  ) : (
                    <span className="text-white/30 text-sm shrink-0">—</span>
                  )}
                  {hasPoints && (
                    <ChevronRight className={`w-4 h-4 text-white/40 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                  )}
                </button>

                {open && (
                  <div className="border-t border-white/10 bg-black/20 p-2">
                    {team === 'loading' && <p className="py-3 text-center text-white/40 text-xs">Loading team…</p>}
                    {team === 'empty' && <p className="py-3 text-center text-white/40 text-xs">No lineup data for this round.</p>}
                    {Array.isArray(team) && (() => {
                      const starters = team.filter((p) => p.isStarting);
                      const bench = team
                        .filter((p) => !p.isStarting)
                        .sort((a, b) => (a.benchOrder ?? 99) - (b.benchOrder ?? 99));
                      return (
                        <div>
                          {inferredByStage[s.stageId] && (
                            <p className="text-[9px] text-amber-300/70 text-center mb-1.5 leading-tight">
                              Estimated lineup — this round predates lineup history, so the starting XI is inferred from the points.
                            </p>
                          )}
                          {/* Read-only mini pitch */}
                          <div className="rounded-xl bg-gradient-to-b from-emerald-800/30 to-emerald-950/40 ring-1 ring-emerald-500/10 p-2 space-y-2.5 overflow-x-auto">
                            {ROWS.map((pos) => {
                              const row = starters.filter((p) => p.position === pos);
                              if (row.length === 0) return null;
                              return (
                                <div key={pos} className="flex justify-center gap-2 min-w-max">
                                  {row.map((p) => <MiniChip key={p.playerId} p={p} />)}
                                </div>
                              );
                            })}
                          </div>
                          {bench.length > 0 && (
                            <div className="mt-2">
                              <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold mb-1 text-center">Bench</p>
                              <div className="flex justify-center gap-2 flex-wrap opacity-80">
                                {bench.map((p) => <MiniChip key={p.playerId} p={p} />)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
