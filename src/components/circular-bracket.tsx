'use client';

// ============================================================================
// CIRCULAR (RADIAL) KNOCKOUT BRACKET
//
// Radial bracket: teams around an outer ring, each round's winners spiralling
// inward to a centre trophy. Connector lines follow consecutive pairing (ties
// 2k & 2k+1 feed the next round's tie k), which is how KNOCKOUT_FIXTURES is
// authored, so the lines match the real bracket. Data comes from /api/bracket
// (seeds resolved from standings + real DB scores/winners overlaid). Tapping a
// tie calls onOpenMatch with the DB match id; the page deep-links it to the
// read-only fixture modal. Ties without a DB match yet (future rounds) are
// no-ops.
//
// The DEFAULT view zooms to the CURRENT round: once R32 is done there's no
// point spending the outer ring on 16 dead crests, so the live round's teams
// take the ring (16 at R16, 8 at QF, …) at much bigger sizes. The complete
// R32→Final circle stays available in a full-screen overlay via the
// "Full bracket" pill. While R32 itself is live the default IS the full view.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { getFlagUrl } from '@/lib/flags';

interface TieSide { code: string | null; label: string; score: number | null; winner: boolean; }
interface Tie { id: string; matchId: string | null; stageId: string; kickoff: string; home: TieSide; away: TieSide; finished: boolean; live: boolean; }
interface Round { stageId: string; ties: Tie[]; }

const polar = (angle: number, r: number) => ({ x: 50 + r * Math.cos(angle), y: 50 + r * Math.sin(angle) });
const avgPairs = (arr: number[]) => Array.from({ length: arr.length / 2 }, (_, i) => (arr[2 * i] + arr[2 * i + 1]) / 2);

function winnerCode(tie?: Tie): string | null {
  if (!tie) return null;
  if (tie.home.winner) return tie.home.code;
  if (tie.away.winner) return tie.away.code;
  return null;
}

// Lay the bracket out in TRUE tournament order. Each non-R32 tie names its two
// feeders in its side labels ("W M73"/"W M75"), so the whole tree is encoded.
// An in-order walk from the Final yields R32 leaves (and each inner round) in
// bracket order — so consecutive pairing (R32 ties 2k & 2k+1 → R16 tie k, etc.)
// matches reality, and the circle shows who could actually meet whom next.
function orderByBracket(rounds: Round[]) {
  const all = rounds.flatMap((r) => r.ties);
  const byId = new Map(all.map((t) => [t.id, t]));
  const feeders = (t: Tie): string[] => {
    const ids: string[] = [];
    for (const side of [t.home, t.away]) {
      const m = /^[WL]\s+(M\d+)$/.exec(side.label);
      if (m) ids.push(m[1]);
    }
    return ids;
  };
  const out: Record<string, Tie[]> = { R32: [], R16: [], QF: [], SF: [], F: [] };
  const visit = (id: string) => {
    const t = byId.get(id);
    if (!t) return;
    const f = feeders(t);
    if (f.length < 2) {
      if (t.stageId === 'R32') out.R32.push(t); // leaf
      return;
    }
    visit(f[0]);
    visit(f[1]);
    out[t.stageId]?.push(t);
  };
  const finalTie = all.find((t) => t.stageId === 'F');
  if (finalTie) visit(finalTie.id);
  const stage = (id: string) => rounds.find((r) => r.stageId === id)?.ties ?? [];
  // Fall back to raw API order if the tree didn't fully resolve (defensive).
  return {
    R32: out.R32.length === 16 ? out.R32 : stage('R32'),
    R16: out.R16.length === 8 ? out.R16 : stage('R16'),
    QF: out.QF.length === 4 ? out.QF : stage('QF'),
    SF: out.SF.length === 2 ? out.SF : stage('SF'),
    F: stage('F'),
  };
}

const START_LABEL: Record<number, string> = {
  0: 'Round of 32',
  1: 'Round of 16',
  2: 'Quarter-finals',
  3: 'Semi-finals',
};

// Visual tier by how many teams sit on the outer ring. Fewer teams → bigger
// crests, thicker lines. Class lists (not template strings) so Tailwind sees
// every literal.
const TIERS: Record<number, {
  crest: string; empty: string; nodes: string[]; pip: string; line: number;
}> = {
  32: {
    crest: 'w-6 h-[18px] sm:w-8 sm:h-6',
    empty: 'w-6 h-[18px] sm:w-8 sm:h-6 text-[7px]',
    nodes: ['w-5 h-[15px]', 'w-5 h-[15px]', 'w-4 h-3', 'w-4 h-3'],
    pip: 'w-2 h-2',
    line: 0.4,
  },
  16: {
    crest: 'w-9 h-[27px] sm:w-12 sm:h-9',
    empty: 'w-9 h-[27px] sm:w-12 sm:h-9 text-[8px]',
    nodes: ['w-7 h-[21px]', 'w-6 h-[18px]', 'w-5 h-[15px]'],
    pip: 'w-2.5 h-2.5',
    line: 0.5,
  },
  8: {
    crest: 'w-12 h-9 sm:w-16 sm:h-12',
    empty: 'w-12 h-9 sm:w-16 sm:h-12 text-[9px]',
    nodes: ['w-9 h-[27px]', 'w-7 h-[21px]'],
    pip: 'w-3 h-3',
    line: 0.6,
  },
  4: {
    crest: 'w-16 h-12 sm:w-20 sm:h-[60px]',
    empty: 'w-16 h-12 sm:w-20 sm:h-[60px] text-[10px]',
    nodes: ['w-10 h-[30px]'],
    pip: 'w-3.5 h-3.5',
    line: 0.7,
  },
};

// One rendered radial bracket starting at round index `start`
// (0=R32, 1=R16, 2=QF, 3=SF). The rounds from `start` onward supply:
// outer ring = that round's teams, then one winner ring per round, then the
// centre trophy (the Final tie).
function RadialView({
  ordered,
  start,
  onOpenTie,
}: {
  ordered: ReturnType<typeof orderByBracket>;
  start: number;
  onOpenTie: (tie?: Tie) => void;
}) {
  const roundTies = [ordered.R32, ordered.R16, ordered.QF, ordered.SF].slice(start);
  const fin = ordered.F[0];
  const outer = roundTies[0];
  const slots = outer.length * 2;
  const tier = TIERS[slots] ?? TIERS[32];

  // Ring radii: outer teams at 43, innermost winner ring at 9.5, evenly spaced.
  const nRings = roundTies.length + 1; // teams ring + one winner ring per round
  const RAD = Array.from({ length: nRings }, (_, i) => 43 - (i * (43 - 9.5)) / (nRings - 1));

  const TAU = Math.PI * 2;
  const angles: number[][] = [Array.from({ length: slots }, (_, t) => (t / slots) * TAU - Math.PI / 2)];
  for (let i = 1; i < nRings; i++) angles.push(avgPairs(angles[i - 1]));

  const lines: Array<{ a: { x: number; y: number }; b: { x: number; y: number }; live: boolean }> = [];
  const push = (a: { x: number; y: number }, b: { x: number; y: number }, live: boolean) => lines.push({ a, b, live });
  // Child runs radially in to the parent's ring, then laterally to the node.
  const elbow = (childA: number, childR: number, parentA: number, parentR: number, live: boolean) => {
    push(polar(childA, childR), polar(childA, parentR), live);   // radial in ("down")
    push(polar(childA, parentR), polar(parentA, parentR), live); // lateral to the node ("into")
  };
  for (let lvl = 0; lvl < roundTies.length; lvl++) {
    const parents = roundTies[lvl]; // winner ring lvl+1 belongs to this round's ties
    for (let k = 0; k < parents.length; k++) {
      const live = !!parents[k]?.live;
      elbow(angles[lvl][2 * k], RAD[lvl], angles[lvl + 1][k], RAD[lvl + 1], live);
      elbow(angles[lvl][2 * k + 1], RAD[lvl], angles[lvl + 1][k], RAD[lvl + 1], live);
    }
  }
  // Finalists (last winner ring, 2 nodes) run straight in to the trophy.
  const finalRing = angles[nRings - 1];
  if (finalRing.length === 2) {
    push(polar(finalRing[0], RAD[nRings - 1]), { x: 50, y: 50 }, !!fin?.live);
    push(polar(finalRing[1], RAD[nRings - 1]), { x: 50, y: 50 }, !!fin?.live);
  }

  const champion = winnerCode(fin);

  return (
    <div className="relative w-full max-w-[44rem] mx-auto aspect-square select-none">
      {/* soft glow behind the trophy */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-amber-400/10 blur-2xl pointer-events-none" />

      {/* Connector lines */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
        {lines.map((ln, i) => (
          <line
            key={i}
            x1={ln.a.x} y1={ln.a.y} x2={ln.b.x} y2={ln.b.y}
            stroke={ln.live ? 'rgba(16,185,129,0.75)' : 'rgba(255,255,255,0.22)'}
            strokeWidth={ln.live ? tier.line + 0.15 : tier.line}
            strokeLinecap="round"
          />
        ))}
      </svg>

      {/* Outer ring — the starting round's teams (each tie's home then away). */}
      {outer.map((tie, j) => (
        [tie.home, tie.away].map((side, s) => {
          const { x, y } = polar(angles[0][2 * j + s], RAD[0]);
          return (
            <Crest
              key={`t-${j}-${s}`} x={x} y={y} side={side} live={tie.live}
              crestClass={tier.crest} emptyClass={tier.empty}
              onClick={() => onOpenTie(tie)}
            />
          );
        })
      ))}

      {/* Winner nodes per round (crest if decided, else faint pip). */}
      {roundTies.map((ties, lvl) =>
        ties.map((tie, k) => {
          const p = polar(angles[lvl + 1][k], RAD[lvl + 1]);
          return (
            <Node
              key={`n-${lvl}-${k}`} x={p.x} y={p.y}
              code={winnerCode(tie)} live={tie.live}
              flagClass={tier.nodes[Math.min(lvl, tier.nodes.length - 1)]} pipClass={tier.pip}
              onClick={() => onOpenTie(tie)}
            />
          );
        }),
      )}

      {/* Centre trophy / champion */}
      <button
        type="button"
        onClick={() => onOpenTie(fin)}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center"
        aria-label="Final"
      >
        {champion ? (
          <span className="relative">
            <Flag code={champion} className="w-11 h-8 ring-2 ring-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.6)]" />
            <span className="absolute -bottom-2 -right-2 text-sm">🏆</span>
          </span>
        ) : (
          <span className="text-3xl drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]">🏆</span>
        )}
      </button>
    </div>
  );
}

export default function CircularBracket({
  onOpenMatch,
}: {
  // Called with the DB match id when a synced tie is tapped (null ties — future
  // rounds / not-yet-synced — are no-ops).
  onOpenMatch: (matchId: string) => void;
}) {
  const openTie = (tie?: Tie) => { if (tie?.matchId) onOpenMatch(tie.matchId); };
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [anyLive, setAnyLive] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/bracket');
      if (!res.ok) return;
      const data = await res.json();
      const rs: Round[] = data.rounds ?? [];
      setRounds(rs);
      setAnyLive(rs.some((r) => r.ties.some((t) => t.live)));
    } catch {
      /* keep last good render */
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!anyLive) return;
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [anyLive, load]);

  if (!rounds) {
    return (
      <div className="relative w-full max-w-[44rem] mx-auto aspect-square flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const ordered = orderByBracket(rounds);

  // Zoom to the current round: the first one that isn't fully finished.
  // (Clamped to SF — a "Final only" ring is just 2 teams, SF start shows it
  // better.) While R32 is live this resolves to 0 = the full bracket anyway.
  const seq = [ordered.R32, ordered.R16, ordered.QF, ordered.SF];
  let start = 0;
  while (start < 3 && seq[start].length > 0 && seq[start].every((t) => t.finished)) start++;

  return (
    <div className="w-full">
      {/* Header: current-round label + full-bracket toggle */}
      <div className="flex items-center justify-between max-w-[44rem] mx-auto px-4 mb-1">
        <span className="text-xs font-bold uppercase tracking-widest text-white/40">{START_LABEL[start]}</span>
        {start > 0 && (
          <button
            type="button"
            onClick={() => setShowFull(true)}
            className="px-3 py-1 rounded-full text-xs font-bold bg-white/[0.06] text-white/70 ring-1 ring-white/10 hover:bg-white/10 hover:text-white transition-colors"
          >
            Full bracket
          </button>
        )}
      </div>

      <RadialView ordered={ordered} start={start} onOpenTie={openTie} />

      {/* Full-bracket overlay: the complete R32→Final circle, read-only feel
          (taps still open match details). */}
      {showFull && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-6"
          onClick={() => setShowFull(false)}
        >
          <div
            className="relative w-full max-w-3xl max-h-full overflow-auto rounded-2xl bg-[#0d1220] ring-1 ring-white/10 p-3 sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold uppercase tracking-widest text-white/40">Full bracket · Round of 32 → Final</span>
              <button
                type="button"
                onClick={() => setShowFull(false)}
                aria-label="Close full bracket"
                className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/[0.06] text-white/70 ring-1 ring-white/10 hover:bg-white/10 hover:text-white transition-colors"
              >
                ✕ Close
              </button>
            </div>
            <RadialView ordered={ordered} start={0} onOpenTie={openTie} />
          </div>
        </div>
      )}
    </div>
  );
}

// One outer team slot: flag, dimmed if it lost the tie.
function Crest({ x, y, side, live, crestClass, emptyClass, onClick }: {
  x: number; y: number; side: TieSide; live: boolean; crestClass: string; emptyClass: string; onClick: () => void;
}) {
  const lost = (side.score != null || side.winner) && !side.winner && (side.code != null);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ left: `${x}%`, top: `${y}%` }}
      className="absolute -translate-x-1/2 -translate-y-1/2 z-10 p-0.5 active:scale-90 transition-transform"
      aria-label={side.code ?? side.label}
    >
      {side.code ? (
        <Flag
          code={side.code}
          className={`${crestClass} ${live ? 'ring-2 ring-emerald-400 rounded-[1px]' : side.winner ? 'ring-1 ring-amber-300/70 rounded-[1px]' : ''} ${lost ? 'opacity-35 grayscale' : ''}`}
        />
      ) : (
        <span className={`block ${emptyClass} rounded-[2px] bg-white/[0.05] font-bold text-white/40 flex items-center justify-center text-center leading-tight`}>
          {side.label.length <= 3 ? side.label : ''}
        </span>
      )}
    </button>
  );
}

// Inner winner node: crest if decided, else pip.
function Node({ x, y, code, live, flagClass, pipClass, onClick }: {
  x: number; y: number; code: string | null; live: boolean; flagClass: string; pipClass: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ left: `${x}%`, top: `${y}%` }}
      className="absolute -translate-x-1/2 -translate-y-1/2 z-10 p-1 active:scale-90 transition-transform"
      aria-label={code ?? 'Undecided tie'}
    >
      {code ? (
        <Flag code={code} className={`${flagClass} ${live ? 'ring-2 ring-emerald-400 rounded-[1px]' : ''}`} />
      ) : (
        <span className={`block ${pipClass} rounded-full ${live ? 'bg-emerald-400/80 animate-pulse' : 'bg-white/15 ring-1 ring-white/10'}`} />
      )}
    </button>
  );
}

// Plain rectangular flag. getFlagUrl maps the 3-letter nation code → CDN slug
// itself, so we pass the code straight through (same as the rest of the app —
// no error-fallback box, which was flickering in on transient CDN hiccups).
function Flag({ code, className = '' }: { code: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={getFlagUrl(code, 'md')}
      alt={code}
      decoding="async"
      className={`rounded-[1px] object-contain drop-shadow-md ${className}`}
    />
  );
}
