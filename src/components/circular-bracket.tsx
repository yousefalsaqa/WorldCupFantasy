'use client';

// ============================================================================
// CIRCULAR (RADIAL) KNOCKOUT BRACKET
//
// 32 teams on the outer ring; each round's winners spiral inward toward a
// centre trophy: R32(32 crests) → R16(16) → QF(8) → SF(4) → Final(2) → 🏆.
// Connector lines follow consecutive pairing (R32 ties 2k & 2k+1 feed R16 tie
// k, etc.), which is how KNOCKOUT_FIXTURES is authored, so the lines match the
// real bracket. Data comes from /api/bracket (seeds resolved from standings +
// real DB scores/winners overlaid). Tapping a tie calls onOpenTie with the
// resolved codes; the page maps that to the DB match and opens the detail modal.
//
// Phone-first caveat (accepted): 32 crests on a square is tight — crests are
// small and the centre rounds are compact. Tap targets are padded past the
// visible crest so they stay hittable.
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
  const r32 = ordered.R32; // 16 ties → 32 teams, in true bracket order
  const r16 = ordered.R16; // 8
  const qf = ordered.QF;   // 4
  const sf = ordered.SF;   // 2
  const fin = ordered.F[0];

  // ── Full-circle radial bracket ─────────────────────────────────────────
  // 32 teams evenly around the ring; each round's winners spiral inward to the
  // trophy. Connectors use an "elbow": each child runs radially INWARD to the
  // next ring, then a short lateral hop to the shared winner node — the clean
  // "down, then into each other" look (not a straight diagonal).
  const TAU = Math.PI * 2;
  const RAD = [43, 34.5, 26.5, 18, 9.5]; // radius by depth: teams, l1, l2, l3, finalists
  const l0 = Array.from({ length: 32 }, (_, t) => (t / 32) * TAU - Math.PI / 2);
  const l1 = avgPairs(l0); // 16
  const l2 = avgPairs(l1); // 8
  const l3 = avgPairs(l2); // 4
  const l4 = avgPairs(l3); // 2

  const lines: Array<{ a: { x: number; y: number }; b: { x: number; y: number }; live: boolean }> = [];
  const push = (a: { x: number; y: number }, b: { x: number; y: number }, live: boolean) => lines.push({ a, b, live });
  // Child runs radially in to the parent's ring, then laterally to the node.
  const elbow = (childA: number, childR: number, parentA: number, parentR: number, live: boolean) => {
    push(polar(childA, childR), polar(childA, parentR), live);   // radial in ("down")
    push(polar(childA, parentR), polar(parentA, parentR), live); // lateral to the node ("into")
  };
  for (let j = 0; j < 16; j++) {
    const live = !!r32[j]?.live;
    elbow(l0[2 * j], RAD[0], l1[j], RAD[1], live);
    elbow(l0[2 * j + 1], RAD[0], l1[j], RAD[1], live);
  }
  for (let k = 0; k < 8; k++) {
    const live = !!r16[k]?.live;
    elbow(l1[2 * k], RAD[1], l2[k], RAD[2], live);
    elbow(l1[2 * k + 1], RAD[1], l2[k], RAD[2], live);
  }
  for (let m = 0; m < 4; m++) {
    const live = !!qf[m]?.live;
    elbow(l2[2 * m], RAD[2], l3[m], RAD[3], live);
    elbow(l2[2 * m + 1], RAD[2], l3[m], RAD[3], live);
  }
  for (let n = 0; n < 2; n++) {
    const live = !!sf[n]?.live;
    elbow(l3[2 * n], RAD[3], l4[n], RAD[4], live);
    elbow(l3[2 * n + 1], RAD[3], l4[n], RAD[4], live);
  }
  // Finalists run straight in to the trophy.
  push(polar(l4[0], RAD[4]), { x: 50, y: 50 }, !!fin?.live);
  push(polar(l4[1], RAD[4]), { x: 50, y: 50 }, !!fin?.live);

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
            strokeWidth={ln.live ? 0.55 : 0.4}
            strokeLinecap="round"
          />
        ))}
      </svg>

      {/* Outer ring — 32 team crests (each R32 tie's home then away). */}
      {r32.map((tie, j) => (
        [tie.home, tie.away].map((side, s) => {
          const { x, y } = polar(l0[2 * j + s], RAD[0]);
          return <Crest key={`t-${j}-${s}`} x={x} y={y} side={side} live={tie.live} onClick={() => openTie(tie)} />;
        })
      ))}

      {/* Winner nodes per round (small crest if decided, else faint pip). */}
      {r32.map((tie, j) => { const p = polar(l1[j], RAD[1]); return <Node key={`n1-${j}`} x={p.x} y={p.y} code={winnerCode(tie)} live={tie.live} onClick={() => openTie(tie)} size="md" />; })}
      {r16.map((tie, k) => { const p = polar(l2[k], RAD[2]); return <Node key={`n2-${k}`} x={p.x} y={p.y} code={winnerCode(tie)} live={tie.live} onClick={() => openTie(tie)} size="md" />; })}
      {qf.map((tie, m) => { const p = polar(l3[m], RAD[3]); return <Node key={`n3-${m}`} x={p.x} y={p.y} code={winnerCode(tie)} live={tie.live} onClick={() => openTie(tie)} size="sm" />; })}
      {sf.map((tie, n) => { const p = polar(l4[n], RAD[4]); return <Node key={`n4-${n}`} x={p.x} y={p.y} code={winnerCode(tie)} live={tie.live} onClick={() => openTie(tie)} size="sm" />; })}

      {/* Centre trophy / champion */}
      <button
        type="button"
        onClick={() => openTie(fin)}
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

// One outer team slot: flag + tiny score, dimmed if it lost the tie.
function Crest({ x, y, side, live, onClick }: { x: number; y: number; side: TieSide; live: boolean; onClick: () => void }) {
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
          className={`w-6 h-[18px] sm:w-8 sm:h-6 ${live ? 'ring-2 ring-emerald-400 rounded-[1px]' : side.winner ? 'ring-1 ring-amber-300/70 rounded-[1px]' : ''} ${lost ? 'opacity-35 grayscale' : ''}`}
        />
      ) : (
        <span className="block w-6 h-[18px] sm:w-8 sm:h-6 rounded-[2px] bg-white/[0.05] text-[7px] font-bold text-white/40 flex items-center justify-center text-center leading-tight">
          {side.label.length <= 3 ? side.label : ''}
        </span>
      )}
    </button>
  );
}

// Inner winner pip.
function Node({ x, y, code, live, onClick, size }: { x: number; y: number; code: string | null; live: boolean; onClick: () => void; size: 'sm' | 'md' }) {
  const dim = size === 'md' ? 'w-5 h-[15px]' : 'w-4 h-3';
  const pip = size === 'md' ? 'w-2 h-2' : 'w-1.5 h-1.5';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ left: `${x}%`, top: `${y}%` }}
      className="absolute -translate-x-1/2 -translate-y-1/2 z-10 p-1 active:scale-90 transition-transform"
      aria-label={code ?? 'Undecided tie'}
    >
      {code ? (
        <Flag code={code} className={`${dim} ${live ? 'ring-2 ring-emerald-400 rounded-[1px]' : ''}`} />
      ) : (
        <span className={`block ${pip} rounded-full ${live ? 'bg-emerald-400/80 animate-pulse' : 'bg-white/15 ring-1 ring-white/10'}`} />
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
