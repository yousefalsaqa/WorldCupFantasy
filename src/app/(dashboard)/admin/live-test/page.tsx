'use client';

// ============================================
// ADMIN — LIVE SCORING TEST SANDBOX
// Drives /api/admin/test-live-fixture against any real fixture in the
// world. Lets us validate the scoring engine before the WC starts
// without touching DB rows. See plan: live-points-test-sandbox.
//
// Quota math (free plan, 100/day):
//   • Fixture picker (find live OR by date)  → 1 call
//   • Single calculator run                  → 3 calls
//   • Polling at 5-min interval, 90 min     → ~54 calls
// We default polling OFF and surface both daily AND per-minute
// counters so it's hard to blow the quota by accident.
// ============================================

import { useEffect, useMemo, useRef, useState } from 'react';

// ============================================
// TYPES (mirroring sandbox + picker endpoints)
// ============================================
interface RateLimits {
  daily: { remaining: number; limit: number };
  minute: { remaining: number; limit: number };
}

interface PickerFixture {
  id: number;
  date: string;
  status: { short: string; elapsed: number | null };
  league: { id: number; name: string; country: string };
  home: { id: number; name: string };
  away: { id: number; name: string };
  goals: { home: number | null; away: number | null };
}

interface PointsBreakdown {
  appearance: number;
  goals: number;
  assists: number;
  cleanSheet: number;
  saves: number;
  penaltySaves: number;
  penaltyMisses: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  goalsConceeded: number;
  defensiveContributions: number;
  bonus: number;
}

interface PlayerPoint {
  apiPlayerId: number;
  playerName: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  minutesPlayed: number;
  goals: number;
  assists: number;
  ownGoals: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  goalsConceeded: number;
  cleanSheet: boolean;
  defensiveActions: number;
  totalPoints: number;
  points: PointsBreakdown;
}

interface SandboxResponse {
  fixture: {
    id: number;
    date: string;
    status: { short: string; long: string; elapsed: number | null };
    league: { id: number; name: string; country: string; season: number; round: string };
    teams: { home: { id: number; name: string }; away: { id: number; name: string } };
    goals: { home: number | null; away: number | null };
  };
  raw: { teamsReturned: number; playerRowsReturned: number; eventsReturned: number };
  stageId: string | null;
  playerPoints: PlayerPoint[];
  rateLimit: RateLimits;
  computedAt: string;
}

type Mode = 'date' | 'live';

// ============================================
// COMPONENT
// ============================================
export default function LiveTestPage() {
  // --- mode + picker state ---
  const [mode, setMode] = useState<Mode>('date');
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [league, setLeague] = useState<string>('');
  // Season auto-suggests for European-style leagues: Jan-Jul belongs to
  // the previous calendar year's season (e.g. May 2026 → La Liga 2025-26
  // → season=2025). Calendar-year leagues (Brazil, MLS, etc.) need to
  // override this manually.
  const suggestSeason = (d: string): string => {
    const parts = d.split('-');
    if (parts.length < 2) return '';
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return '';
    return String(month <= 7 ? year - 1 : year);
  };
  const [season, setSeason] = useState<string>(() => suggestSeason(new Date().toISOString().slice(0, 10)));
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerFixtures, setPickerFixtures] = useState<PickerFixture[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);

  // --- run state ---
  const [fixtureId, setFixtureId] = useState<string>('');
  const [stageId, setStageId] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<SandboxResponse | null>(null);
  // Previous totals per apiPlayerId — drives the "+N" diff badges.
  const [prevTotals, setPrevTotals] = useState<Map<number, number>>(new Map());

  // --- polling state ---
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [intervalSec, setIntervalSec] = useState<number>(300); // 5 min default
  const pollTimerRef = useRef<number | null>(null);
  const [tickCount, setTickCount] = useState(0);

  // Latest rate-limit snapshot (from whichever endpoint returned most recently).
  const [rateLimit, setRateLimit] = useState<RateLimits | null>(null);

  // ============================================
  // PICKER
  // ============================================
  const fetchPicker = async () => {
    setPickerLoading(true);
    setPickerError(null);
    try {
      const params = new URLSearchParams({ mode });
      if (mode === 'date') {
        if (!date) {
          setPickerError('Pick a date first');
          setPickerLoading(false);
          return;
        }
        params.set('date', date);
        if (league.trim()) {
          if (!season.trim()) {
            setPickerError(
              'Season is required when filtering by League. For European ' +
                'leagues use the START year, e.g. 2025 for the 2025-26 season.',
            );
            setPickerLoading(false);
            return;
          }
          params.set('league', league.trim());
          params.set('season', season.trim());
        }
      }
      const res = await fetch(`/api/admin/live-fixtures-global?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setPickerError(data.error || `HTTP ${res.status}`);
        setPickerFixtures([]);
      } else {
        setPickerFixtures(data.fixtures ?? []);
        if (data.rateLimit) setRateLimit(data.rateLimit);
      }
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : 'Network error');
      setPickerFixtures([]);
    } finally {
      setPickerLoading(false);
    }
  };

  // ============================================
  // RUN CALCULATOR
  // ============================================
  const runCalculator = async () => {
    if (!fixtureId.trim()) {
      setRunError('Enter a fixture ID first');
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const params = new URLSearchParams({ fixtureId: fixtureId.trim() });
      if (stageId.trim()) params.set('stageId', stageId.trim());
      const res = await fetch(`/api/admin/test-live-fixture?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setRunError(data.error || `HTTP ${res.status}`);
      } else {
        // Diff against previous totals BEFORE we overwrite.
        if (result) {
          const prev = new Map<number, number>();
          for (const p of result.playerPoints) {
            prev.set(p.apiPlayerId, p.totalPoints);
          }
          setPrevTotals(prev);
        }
        setResult(data);
        if (data.rateLimit) setRateLimit(data.rateLimit);
        setTickCount((n) => n + 1);
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setRunning(false);
    }
  };

  // ============================================
  // POLLING — drives runCalculator on a timer.
  // Uses window.setInterval because Node's setInterval typings collide
  // with the browser type in this client-only file.
  // ============================================
  useEffect(() => {
    if (!pollingEnabled || !fixtureId.trim()) {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    pollTimerRef.current = window.setInterval(() => {
      runCalculator();
    }, intervalSec * 1000);
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingEnabled, intervalSec, fixtureId]);

  // ============================================
  // SNAPSHOT DOWNLOAD
  // ============================================
  const downloadSnapshot = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `live-test-${result.fixture.id}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ============================================
  // DERIVED — quota gauge + polling impact estimate
  // ============================================
  const callsPerHour = useMemo(() => Math.floor(3600 / intervalSec) * 3, [intervalSec]);
  const hoursUntilDailyExhausted = useMemo(() => {
    if (!rateLimit || callsPerHour === 0) return null;
    return rateLimit.daily.remaining / callsPerHour;
  }, [rateLimit, callsPerHour]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-white mb-1">Live Scoring Sandbox</h2>
        <p className="text-white/40 max-w-3xl">
          Run <code className="bg-white/10 px-1 rounded">LiveScoringCalculator</code> against any
          fixture in the world without touching the database. Use this to validate scoring math
          against real API data before the World Cup kicks off. Each calculator run costs 3 API
          requests.
        </p>
      </div>

      {/* Rate limit gauge */}
      {rateLimit && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="grid grid-cols-2 gap-4">
            <RateGauge
              label="Daily quota"
              remaining={rateLimit.daily.remaining}
              limit={rateLimit.daily.limit}
              warnAt={20}
            />
            <RateGauge
              label="Per-minute quota"
              remaining={rateLimit.minute.remaining}
              limit={rateLimit.minute.limit}
              warnAt={3}
            />
          </div>
          {pollingEnabled && hoursUntilDailyExhausted !== null && (
            <p className="text-xs text-white/40 mt-3">
              At {intervalSec}s interval = {callsPerHour} calls/hour.{' '}
              <span className={hoursUntilDailyExhausted < 1 ? 'text-rose-300' : 'text-white/60'}>
                Daily quota lasts ~{hoursUntilDailyExhausted.toFixed(1)} hours at this rate.
              </span>
            </p>
          )}
        </div>
      )}

      {/* Fixture picker */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="font-bold text-white mb-1">Find a fixture</h3>
          <p className="text-white/40 text-sm">One call to API-Football populates the picker below.</p>
        </div>

        <div className="flex gap-2">
          <ModeButton active={mode === 'date'} onClick={() => setMode('date')}>
            Finished / by date
          </ModeButton>
          <ModeButton active={mode === 'live'} onClick={() => setMode('live')}>
            Live now
          </ModeButton>
        </div>

        {mode === 'date' && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-3 items-end">
              <Field label="Date (YYYY-MM-DD)">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    // Keep the season in sync when the user changes date, but
                    // only if the user hasn't typed a custom one yet.
                    const suggested = suggestSeason(e.target.value);
                    if (season === '' || season === suggestSeason(date)) {
                      setSeason(suggested);
                    }
                  }}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-white/30"
                />
              </Field>
              <Field label="League ID (optional)">
                <input
                  type="number"
                  value={league}
                  onChange={(e) => setLeague(e.target.value)}
                  placeholder="e.g. 140 (La Liga)"
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:border-white/30 w-44"
                />
              </Field>
              <Field label="Season (required w/ league)">
                <input
                  type="number"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  placeholder="e.g. 2025"
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:border-white/30 w-32"
                />
              </Field>
            </div>
            {league.trim() && (
              <p className="text-xs text-white/40">
                Season = START year of the season. La Liga 2025-26 → 2025. Premier League
                2024-25 → 2024. Calendar-year leagues (Brazil, MLS) use the actual year.
              </p>
            )}
          </div>
        )}

        <button
          onClick={fetchPicker}
          disabled={pickerLoading}
          className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 rounded-lg font-medium transition-all disabled:opacity-50"
        >
          {pickerLoading ? 'Loading...' : `Search fixtures (1 API call)`}
        </button>

        {pickerError && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm p-3 rounded-lg">
            {pickerError}
          </div>
        )}

        {pickerFixtures.length > 0 && (
          <div className="max-h-72 overflow-y-auto border border-white/5 rounded-lg divide-y divide-white/5">
            {pickerFixtures.map((f) => (
              <button
                key={f.id}
                onClick={() => setFixtureId(String(f.id))}
                className="w-full px-3 py-2 text-left hover:bg-white/5 flex items-center gap-3 text-sm"
              >
                <span className="font-mono text-xs text-white/30 w-20">{f.id}</span>
                <span className="text-white/30 text-xs w-20">
                  {f.status.short}
                  {f.status.elapsed !== null ? `·${f.status.elapsed}'` : ''}
                </span>
                <span className="text-white/40 text-xs w-32 truncate">{f.league.country} · {f.league.name}</span>
                <span className="text-white flex-1 truncate">
                  {f.home.name} {f.goals.home ?? '-'}–{f.goals.away ?? '-'} {f.away.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Run controls */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <h3 className="font-bold text-white">Run calculator</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="Fixture ID">
            <input
              type="number"
              value={fixtureId}
              onChange={(e) => setFixtureId(e.target.value)}
              placeholder="e.g. 1519357"
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:border-white/30 w-44"
            />
          </Field>
          <Field label="Stage (optional)">
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-white/30"
            >
              <option value="">Regular (no knockout bonus)</option>
              <option value="R32">R32</option>
              <option value="R16">R16</option>
              <option value="QF">Quarter-final</option>
              <option value="SF">Semi-final</option>
              <option value="3RD">Third-place</option>
              <option value="F">Final</option>
            </select>
          </Field>
          <button
            onClick={runCalculator}
            disabled={running || !fixtureId.trim()}
            className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-300 rounded-lg font-medium transition-all disabled:opacity-50"
          >
            {running ? 'Running...' : 'Run Once (3 API calls)'}
          </button>
        </div>

        {runError && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm p-3 rounded-lg">
            {runError}
          </div>
        )}

        {/* Polling */}
        <details className="border border-white/10 rounded-lg">
          <summary className="px-4 py-2 cursor-pointer text-white/70 text-sm">
            Polling (default OFF — uses 3 calls per tick)
          </summary>
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <Field label="Interval (seconds, min 60)">
                <input
                  type="number"
                  value={intervalSec}
                  onChange={(e) => setIntervalSec(Math.max(60, parseInt(e.target.value, 10) || 60))}
                  min={60}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-white/30 w-32"
                />
              </Field>
              <button
                onClick={() => setPollingEnabled((v) => !v)}
                disabled={!fixtureId.trim()}
                className={`px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 border ${
                  pollingEnabled
                    ? 'bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/30 text-rose-300'
                    : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30 text-amber-300'
                }`}
              >
                {pollingEnabled ? 'Stop polling' : 'Start polling'}
              </button>
            </div>
            {pollingEnabled && (
              <p className="text-xs text-amber-300/70">
                Polling active · {tickCount} ticks fired this session.
              </p>
            )}
          </div>
        </details>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-white">
                {result.fixture.teams.home.name}{' '}
                <span className="text-white/40">{result.fixture.goals.home ?? '-'}</span>
                {' – '}
                <span className="text-white/40">{result.fixture.goals.away ?? '-'}</span>{' '}
                {result.fixture.teams.away.name}
              </h3>
              <p className="text-white/40 text-sm">
                {result.fixture.league.country} · {result.fixture.league.name} ·{' '}
                {result.fixture.league.round} · Status {result.fixture.status.short}
                {result.fixture.status.elapsed !== null ? ` · ${result.fixture.status.elapsed}'` : ''}
              </p>
              <p className="text-white/30 text-xs mt-1">
                Returned {result.raw.teamsReturned} teams, {result.raw.playerRowsReturned} player
                rows, {result.raw.eventsReturned} events · computed at{' '}
                {new Date(result.computedAt).toLocaleTimeString()}
              </p>
            </div>
            <button
              onClick={downloadSnapshot}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 rounded-lg text-sm transition-all"
            >
              Download JSON
            </button>
          </div>

          {result.playerPoints.length === 0 ? (
            <p className="text-amber-300/80 text-sm">
              No player rows returned. Either the fixture hasn&apos;t kicked off yet, or this
              league doesn&apos;t expose per-player stats.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="text-white/40 text-xs uppercase tracking-wider">
                    <th className="text-left px-2 py-2">Player</th>
                    <th className="text-center px-2 py-2">Pos</th>
                    <th className="text-right px-2 py-2">Min</th>
                    <th className="text-right px-2 py-2">G</th>
                    <th className="text-right px-2 py-2">A</th>
                    <th className="text-right px-2 py-2">Y/R</th>
                    <th className="text-right px-2 py-2">Sav</th>
                    <th className="text-right px-2 py-2">CS</th>
                    <th className="text-right px-2 py-2">CnW</th>
                    <th className="text-right px-2 py-2" title="Defensive actions (T+I+B+DuW). Bold when over threshold (10 DEF/GK, 12 MID/FWD).">DA</th>
                    <th className="text-right px-2 py-2 font-bold text-white/60">Total</th>
                    <th className="text-right px-2 py-2">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {result.playerPoints.map((p) => {
                    const prev = prevTotals.get(p.apiPlayerId);
                    const delta = prev !== undefined ? p.totalPoints - prev : null;
                    return (
                      <tr key={p.apiPlayerId} className="border-t border-white/5">
                        <td className="px-2 py-1.5 text-white/90">{p.playerName}</td>
                        <td className="px-2 py-1.5 text-center text-white/60">{p.position}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-white/70">{p.minutesPlayed}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-white/70">
                          {p.goals || ''}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-white/70">
                          {p.assists || ''}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-white/70">
                          {p.yellowCards || p.redCards
                            ? `${p.yellowCards}/${p.redCards}`
                            : ''}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-white/70">
                          {p.saves || ''}
                        </td>
                        <td className="px-2 py-1.5 text-right text-white/70">
                          {p.cleanSheet ? '✓' : ''}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-white/40">
                          {p.goalsConceeded || ''}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right tabular-nums ${
                            p.points.defensiveContributions > 0
                              ? 'font-bold text-emerald-300'
                              : 'text-white/40'
                          }`}
                          title={
                            p.points.defensiveContributions > 0
                              ? `+${p.points.defensiveContributions} bonus (${p.defensiveActions} actions)`
                              : `${p.defensiveActions} actions (below threshold)`
                          }
                        >
                          {p.defensiveActions || ''}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-bold text-white">
                          {p.totalPoints}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {delta !== null && delta !== 0 && (
                            <span
                              className={
                                delta > 0
                                  ? 'text-emerald-300'
                                  : 'text-rose-300'
                              }
                            >
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// SMALL HELPERS
// ============================================
function RateGauge({
  label,
  remaining,
  limit,
  warnAt,
}: {
  label: string;
  remaining: number;
  limit: number;
  warnAt: number;
}) {
  const pct = limit > 0 ? (remaining / limit) * 100 : 0;
  const tone =
    remaining <= warnAt ? 'text-rose-300' : remaining <= warnAt * 2 ? 'text-amber-300' : 'text-emerald-300';
  return (
    <div>
      <div className="flex justify-between text-xs text-white/40 mb-1">
        <span>{label}</span>
        <span className={`tabular-nums ${tone}`}>
          {remaining} / {limit}
        </span>
      </div>
      <div className="h-2 bg-white/5 rounded overflow-hidden">
        <div
          className={`h-full ${
            remaining <= warnAt ? 'bg-rose-400' : remaining <= warnAt * 2 ? 'bg-amber-400' : 'bg-emerald-400'
          }`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-white/40 mb-1">{label}</span>
      {children}
    </label>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
        active
          ? 'bg-white/10 border-white/20 text-white'
          : 'bg-transparent border-white/10 text-white/50 hover:text-white/80'
      }`}
    >
      {children}
    </button>
  );
}
