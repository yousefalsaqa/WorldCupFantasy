'use client';

// ============================================
// ADMIN — PREDICTED LINEUPS (visual builder)
//
// Mini squad-builder for probable XIs: pick a fixture, pick each side's
// formation, then tap pitch slots and search that nation's players —
// with real headshots, so you can confirm identity before placing.
// Players can go in ANY slot (no position restrictions — real managers
// play people out of position). Save sends exact player ids in pitch
// order; no name matching involved.
//
// Shown in the fixture modal's Lineups tab until the official team
// sheets arrive from API-Football, which replace it automatically.
// ============================================

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PlayerFace } from '@/components/kit';

interface AdminMatch {
  id: string;
  kickoffTime: string;
  isStarted: boolean;
  isFinished: boolean;
  predictedLineups: string | null;
  homeNation: { name: string; code: string; kitColor1: string; kitColor2: string };
  awayNation: { name: string; code: string; kitColor1: string; kitColor2: string };
  stage: { name: string };
}

interface PoolPlayer {
  id: string;
  displayName: string;
  position: string;
  shirtNumber: number | null;
  photoUrl?: string | null;
  nation: { id: string; name: string; code: string; kitColor1: string; kitColor2: string };
}

type Side = 'home' | 'away';
type Slots = Array<PoolPlayer | null>;

const FORMATIONS = [
  '4-4-2', '4-3-3', '4-2-3-1', '4-5-1', '4-4-1-1', '4-1-4-1', '4-3-2-1', '4-2-2-2',
  '3-4-3', '3-5-2', '3-4-2-1', '3-4-1-2', '3-5-1-1',
  '5-3-2', '5-4-1', '5-2-2-1',
];

function formationRows(formation: string): number[] {
  const parts = formation.split('-').map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return [1, ...parts];
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function PredictedLineupsAdmin() {
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [pool, setPool] = useState<PoolPlayer[]>([]);
  const [matchId, setMatchId] = useState('');
  const [formations, setFormations] = useState<Record<Side, string>>({ home: '4-4-2', away: '4-4-2' });
  const [slots, setSlots] = useState<Record<Side, Slots>>({
    home: Array(11).fill(null),
    away: Array(11).fill(null),
  });
  const [picker, setPicker] = useState<{ side: Side; idx: number } | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Body scroll lock while the picker sheet is open — without it, iOS
  // pans the page when the search input focuses and the fixed sheet
  // visually slides off behind the keyboard.
  useEffect(() => {
    if (!picker) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [picker]);

  useEffect(() => {
    (async () => {
      try {
        const [fxRes, plRes] = await Promise.all([
          fetch('/api/admin/fixtures'),
          fetch('/api/players'),
        ]);
        if (!fxRes.ok) {
          setLoadError(fxRes.status === 401 ? 'Admin access required' : 'Failed to load fixtures');
          return;
        }
        const fx = await fxRes.json();
        setMatches(fx.matches || []);
        if (plRes.ok) setPool(await plRes.json());
      } catch {
        setLoadError('Failed to load');
      }
    })();
  }, []);

  const selected = matches.find((m) => m.id === matchId) || null;

  // Prefill builder from a previously-saved prediction once both the
  // match and the player pool are available.
  useEffect(() => {
    if (!selected || pool.length === 0) return;
    setMsg(null);
    if (!selected.predictedLineups) {
      setFormations({ home: '4-4-2', away: '4-4-2' });
      setSlots({ home: Array(11).fill(null), away: Array(11).fill(null) });
      return;
    }
    try {
      const saved = JSON.parse(selected.predictedLineups) as {
        home: { formation: string | null; players: Array<{ playerId: string }> };
        away: { formation: string | null; players: Array<{ playerId: string }> };
      };
      const byId = new Map(pool.map((p) => [p.id, p]));
      const toSlots = (players: Array<{ playerId: string }>): Slots => {
        const s: Slots = Array(11).fill(null);
        players.slice(0, 11).forEach((p, i) => { s[i] = byId.get(p.playerId) ?? null; });
        return s;
      };
      setFormations({
        home: saved.home.formation || '4-4-2',
        away: saved.away.formation || '4-4-2',
      });
      setSlots({ home: toSlots(saved.home.players), away: toSlots(saved.away.players) });
    } catch {
      // corrupted JSON — start fresh
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, pool.length, selected?.predictedLineups]);

  const nationCodeFor = (side: Side) =>
    side === 'home' ? selected?.homeNation.code : selected?.awayNation.code;

  const placedIds = useMemo(() => {
    const ids = new Set<string>();
    (['home', 'away'] as const).forEach((s) => slots[s].forEach((p) => p && ids.add(p.id)));
    return ids;
  }, [slots]);

  const pickerCandidates = useMemo(() => {
    if (!picker) return [];
    const code = nationCodeFor(picker.side);
    const q = norm(search.trim());
    return pool
      .filter((p) => p.nation?.code === code)
      .filter((p) => !placedIds.has(p.id))
      .filter((p) => !q || norm(p.displayName).includes(q))
      .sort((a, b) => (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker, search, pool, placedIds, matchId]);

  function setSlot(side: Side, idx: number, player: PoolPlayer | null) {
    setSlots((prev) => {
      const next = { ...prev, [side]: [...prev[side]] };
      next[side][idx] = player;
      return next;
    });
  }

  async function save() {
    if (!selected) return;
    const missing = (['home', 'away'] as const).filter((s) => slots[s].some((p) => !p));
    if (missing.length > 0) {
      setMsg({ ok: false, text: 'Fill all 11 slots on both teams first.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/predicted-lineup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          home: { formation: formations.home, playerIds: slots.home.map((p) => p!.id) },
          away: { formation: formations.away, playerIds: slots.away.map((p) => p!.id) },
        }),
      });
      const data = await res.json();
      if (data.saved) {
        setMsg({ ok: true, text: 'Saved — live in the fixture modal now.' });
        setMatches((prev) => prev.map((m) => m.id === matchId ? { ...m, predictedLineups: JSON.stringify({ home: { formation: formations.home, players: slots.home.map((p) => ({ playerId: p!.id })) }, away: { formation: formations.away, players: slots.away.map((p) => ({ playerId: p!.id })) } }) } : m));
      } else {
        const issues = [...(data.home?.unmatched ?? []), ...(data.away?.unmatched ?? [])]
          .map((u: { name: string; reason: string }) => `${u.name} (${u.reason})`).join(', ');
        setMsg({ ok: false, text: data.error || issues || 'Save failed' });
      }
    } catch {
      setMsg({ ok: false, text: 'Request failed' });
    } finally {
      setBusy(false);
    }
  }

  async function clearPrediction() {
    if (!matchId || !confirm('Clear the saved prediction for this match?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/predicted-lineup?matchId=${encodeURIComponent(matchId)}`, { method: 'DELETE' });
      if (res.ok) {
        setMatches((prev) => prev.map((m) => m.id === matchId ? { ...m, predictedLineups: null } : m));
        setSlots({ home: Array(11).fill(null), away: Array(11).fill(null) });
        setMsg({ ok: true, text: 'Prediction cleared.' });
      }
    } finally {
      setBusy(false);
    }
  }

  function teamBuilder(side: Side) {
    if (!selected) return null;
    const nation = side === 'home' ? selected.homeNation : selected.awayNation;
    const rows = formationRows(formations[side]);
    const filled = slots[side].filter(Boolean).length;
    let slotIdx = -1;
    return (
      <div key={side}>
        <div className="flex items-center gap-2 mb-2 min-w-0">
          <span className="text-white text-sm font-bold truncate min-w-0">{nation.name}</span>
          <select
            value={formations[side]}
            onChange={(e) => setFormations((prev) => ({ ...prev, [side]: e.target.value }))}
            className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-xs cursor-pointer shrink-0"
          >
            {FORMATIONS.map((f) => (
              <option key={f} value={f} className="bg-slate-900">{f}</option>
            ))}
          </select>
          <span className={`ml-auto text-[11px] font-black shrink-0 ${filled === 11 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {filled}/11
          </span>
        </div>
        <div className="rounded-xl bg-gradient-to-b from-green-800/60 to-green-700/40 ring-1 ring-white/10 p-3 space-y-3">
          {rows.map((count, r) => (
            <div key={r} className="flex justify-around">
              {Array.from({ length: count }).map((_, c) => {
                slotIdx++;
                const idx = slotIdx;
                const p = slots[side][idx];
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    onClick={() => {
                      if (p) {
                        setSlot(side, idx, null); // tap a filled slot to clear it
                      } else {
                        setSearch('');
                        setPicker({ side, idx });
                      }
                    }}
                    className="flex flex-col items-center flex-1 min-w-0 max-w-[56px] group"
                    title={p ? `Remove ${p.displayName}` : 'Add player'}
                  >
                    {p ? (
                      <>
                        <PlayerFace
                          photoUrl={p.photoUrl}
                          primaryColor={p.nation.kitColor1}
                          secondaryColor={p.nation.kitColor2}
                          number={p.shirtNumber}
                          nationCode={p.nation.code}
                          size="xs"
                        />
                        <span className="mt-0.5 text-[8px] text-white font-semibold truncate max-w-full text-center group-hover:text-red-300">
                          {p.displayName}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="w-9 h-11 rounded-lg border-2 border-dashed border-white/30 flex items-center justify-center text-white/50 text-lg group-hover:border-white/60 group-hover:text-white">
                          +
                        </span>
                        <span className="mt-0.5 text-[8px] text-white/30">add</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin" className="text-white/40 text-sm hover:text-white">← Admin</Link>
        <h1 className="text-2xl font-black text-white mt-2">Predicted Lineups</h1>
        <p className="text-white/40 text-sm">
          Pick a formation, tap a slot, search the player — faces confirm you got the right one.
          Any player can go in any slot. Shown in the fixture modal until official lineups drop.
        </p>
      </div>

      {loadError ? (
        <p className="text-red-300">{loadError}</p>
      ) : (
        <div className="space-y-5">
          <select
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm cursor-pointer"
          >
            <option value="" className="bg-slate-900">Select a fixture…</option>
            {[...matches.filter((m) => !m.isStarted), ...matches.filter((m) => m.isStarted)].map((m) => (
              <option key={m.id} value={m.id} className="bg-slate-900">
                {m.homeNation.code} vs {m.awayNation.code} — {new Date(m.kickoffTime).toLocaleString()} ({m.stage.name})
                {m.predictedLineups ? ' ✓' : ''}{m.isStarted ? ' [started]' : ''}
              </option>
            ))}
          </select>

          {selected && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {teamBuilder('home')}
                {teamBuilder('away')}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={save}
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 text-sm font-black disabled:opacity-40"
                >
                  {busy ? 'Saving…' : 'Save prediction'}
                </button>
                {selected.predictedLineups && (
                  <button
                    onClick={clearPrediction}
                    disabled={busy}
                    className="px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-300 text-sm font-bold disabled:opacity-40"
                  >
                    Clear saved
                  </button>
                )}
                {msg && (
                  <span className={`text-sm font-bold ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                    {msg.ok ? '✓ ' : '✗ '}{msg.text}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Player picker with faces. Top-anchored on phones: the search bar
          sits ABOVE the keyboard so iOS never pans the viewport (bottom
          sheets get shoved off-screen when the keyboard opens). 60dvh
          leaves room for the keyboard underneath. */}
      {picker && selected && (
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm pt-safe-or-3 sm:pt-0 px-0 sm:px-4"
          onClick={() => setPicker(null)}
        >
          <div
            className="w-full sm:max-w-md bg-slate-900 ring-1 ring-white/10 rounded-b-2xl sm:rounded-2xl max-h-[60dvh] sm:max-h-[70vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-white/10">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${nationCodeFor(picker.side)} players…`}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {pickerCandidates.length === 0 ? (
                <p className="p-6 text-center text-white/35 text-sm">No unplaced players match.</p>
              ) : (
                pickerCandidates.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSlot(picker.side, picker.idx, p); setPicker(null); }}
                    className="w-full px-3 py-2 flex items-center gap-3 hover:bg-white/5 border-b border-white/5 text-left"
                  >
                    <PlayerFace
                      photoUrl={p.photoUrl}
                      primaryColor={p.nation.kitColor1}
                      secondaryColor={p.nation.kitColor2}
                      number={p.shirtNumber}
                      nationCode={p.nation.code}
                      size="xs"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-white text-sm font-semibold truncate">{p.displayName}</span>
                      <span className="text-white/40 text-xs">#{p.shirtNumber ?? '–'} · {p.position}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
