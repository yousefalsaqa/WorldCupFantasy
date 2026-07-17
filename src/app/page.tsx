'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Crest from '@/components/crest';
import { getFlagUrl } from '@/lib/flags';
import { decomposeDuration } from '@/lib/format-time';
import { PlayerCard } from '@/components/kit';
import PitchBg from '@/components/pitch-bg';
import FormationPicker from '@/components/formation-picker';
import FixtureTicker from '@/components/fixture-ticker';
import { buildTicker, type TickerFixture } from '@/lib/fixture-ticker';
import { SQUAD, TOURNAMENT, VALID_FORMATIONS } from '@/lib/wc-constants';
import {
  Coins,
  Wallet,
  Trophy,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

const HOSTS = ['USA', 'CAN', 'MEX'];
const FORMATION_STRINGS = VALID_FORMATIONS.map((f) => `${f.DEF}-${f.MID}-${f.FWD}`);
const round1 = (n: number) => Math.round(n * 10) / 10;

interface DemoPlayer {
  id: string;
  displayName: string;
  position: string;
  currentPrice: number;
  shirtNumber: number | null;
  photoUrl?: string | null;
  nation?: { code: string; name: string; kitColor1: string; kitColor2: string };
}

// Spreads picks across a position's price range instead of grabbing the
// literal most-expensive N — keeps the demo XI looking like a real,
// budget-plausible squad (a star or two up top, real depth underneath)
// rather than an all-superstar line that blows straight through the budget.
function pickSpread<T>(arr: T[], n: number): T[] {
  if (arr.length === 0 || n <= 0) return [];
  if (arr.length <= n) return arr;
  const picks: T[] = [];
  for (let i = 0; i < n; i++) {
    // Top-heavy spread (0-35th percentile) — a couple of genuine premiums
    // plus real depth, without drifting down to bargain-bin prices that
    // left the demo squad looking barely spent against the £115m budget.
    const pct = n === 1 ? 0.15 : i * (0.35 / (n - 1));
    picks.push(arr[Math.min(arr.length - 1, Math.floor(pct * arr.length))]);
  }
  return picks;
}

function parseFormationStr(f: string) {
  const parts = f.split('-').map(Number);
  const DEF = parts[0];
  const FWD = parts[parts.length - 1];
  const MID = 10 - DEF - FWD;
  return { DEF, MID, FWD };
}

const SCORING_EVENTS = [
  { label: 'GOAL', delta: 5 },
  { label: 'ASSIST', delta: 3 },
  { label: 'CLEAN SHEET', delta: 4 },
  { label: 'BONUS', delta: 2 },
];

// The real global top 6 by total points as of the SF stage — actual squads
// playing right now, not a mocked-up example table. Trend compares each
// team's rank before vs. after the SF stage's points landed.
const LEAGUE_ROWS = [
  { rank: 1, team: 'chimbohimbo', manager: 'yousef alsaqa', gw: 46, total: 528, trend: 'flat' as const },
  { rank: 2, team: 'Micho’s Bichos', manager: 'micho_bicho', gw: 66, total: 488, trend: 'flat' as const },
  { rank: 3, team: 'Doudisfoodies', manager: 'Kbeyk', gw: 68, total: 445, trend: 'up' as const },
  { rank: 4, team: 'wesh ol olo', manager: 'david', gw: 28, total: 439, trend: 'down' as const },
  { rank: 5, team: 'Everybody jump', manager: 'Mounir', gw: 33, total: 419, trend: 'down' as const },
  { rank: 6, team: 'balls', manager: 'ayaan', gw: 60, total: 404, trend: 'flat' as const },
];

const RULES = [
  { n: '01', title: 'BUDGET', body: `£${SQUAD.initialBudget.toFixed(0)}M to build a squad of 15 players from any of the 48 nations, each priced by real world output.` },
  { n: '02', title: 'TRANSFERS', body: 'Free transfers roll over between matchdays. Go beyond your limit and it costs 4 points per extra move, so squads reward planning over panic.' },
  { n: '03', title: 'CAPTAINCY', body: 'Name a captain every matchday for double points, or deploy Triple Captain for a one off ×3. Choose a vice in case your armband doesn\'t start.' },
  { n: '04', title: 'CHIPS', body: 'Wildcard, Free Hit, Bench Boost and Triple Captain give you four one time levers to swing a knockout round without burning transfers.' },
  { n: '05', title: 'MERCY RULE', body: 'Lose a player to elimination and you\'re compensated with extra transfers, so one bad group stage doesn\'t sink your whole tournament.' },
];

export default function Home() {
  // Mounted-on-client guard so the static SSR HTML paints first on iOS Safari
  // before any interval-driven demo state or network fetches start up.
  const [mounted, setMounted] = useState(false);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [kickedOff, setKickedOff] = useState(false);
  const [fixtures, setFixtures] = useState<TickerFixture[]>([]);
  const [pool, setPool] = useState<{ gk: DemoPlayer[]; def: DemoPlayer[]; mid: DemoPlayer[]; fwd: DemoPlayer[] }>({ gk: [], def: [], mid: [], fwd: [] });
  const [formation, setFormation] = useState('4-3-3');

  // Demo motion state — each on its own interval so the panel feels alive
  // rather than everything flipping in lockstep.
  const [captainTick, setCaptainTick] = useState(0);
  const [liveTick, setLiveTick] = useState(0);
  const [heroPoints, setHeroPoints] = useState<Record<string, number>>({});
  const [scoreTick, setScoreTick] = useState(0);
  const [scorePoints, setScorePoints] = useState<Record<string, number>>({});

  useEffect(() => {
    setMounted(true);
    const targetDate = new Date('2026-06-11T18:00:00Z');
    const updateCountdown = () => {
      const diff = targetDate.getTime() - Date.now();
      if (diff > 0) setCountdown(decomposeDuration(diff));
      else setKickedOff(true);
    };
    updateCountdown();
    const id = setInterval(updateCountdown, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    fetch('/api/fixtures/scores')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.matches && setFixtures(d.matches))
      .catch(() => {});

    Promise.all([
      fetch('/api/players?position=GK&limit=15').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/players?position=DEF&limit=40').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/players?position=MID&limit=40').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/players?position=FWD&limit=25').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([gk, def, mid, fwd]) => {
        // A fixed 15-man squad (2 GK / 5 DEF / 5 MID / 3 FWD) — the real
        // squad composition. Switching formation only changes how many of
        // each position START; it never changes who's IN the squad, so
        // total squad value stays constant and the rest sit on the bench.
        setPool({
          gk: pickSpread(Array.isArray(gk) ? gk : [], 2),
          def: pickSpread(Array.isArray(def) ? def : [], 5),
          mid: pickSpread(Array.isArray(mid) ? mid : [], 5),
          fwd: pickSpread(Array.isArray(fwd) ? fwd : [], 3),
        });
      })
      .catch(() => {});
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const t1 = setInterval(() => setCaptainTick((t) => t + 1), 4200);
    const t2 = setInterval(() => setLiveTick((t) => t + 1), 2400);
    const t4 = setInterval(() => setScoreTick((t) => t + 1), 3000);
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t4); };
  }, [mounted]);

  // A fixed 15-man squad (pool.gk/def/mid/fwd, sized 2/5/5/3). Formation only
  // decides how many of each position START — the squad itself, and its
  // total value, never changes when you flip formations. Whoever doesn't
  // start sits on the bench.
  const formationCounts = useMemo(() => parseFormationStr(formation), [formation]);
  const startingFwd = pool.fwd.slice(0, formationCounts.FWD);
  const startingMid = pool.mid.slice(0, formationCounts.MID);
  const startingDef = pool.def.slice(0, formationCounts.DEF);
  const startingGk = pool.gk.slice(0, 1);
  const allStarters = useMemo(
    () => [...startingFwd, ...startingMid, ...startingDef, ...startingGk],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pool, formation],
  );
  const bench = useMemo(
    () => [...pool.gk.slice(1), ...pool.def.slice(formationCounts.DEF), ...pool.mid.slice(formationCounts.MID), ...pool.fwd.slice(formationCounts.FWD)],
    [pool, formationCounts],
  );

  const wholeSquad = useMemo(() => [...pool.gk, ...pool.def, ...pool.mid, ...pool.fwd], [pool]);
  const teamValue = useMemo(() => round1(wholeSquad.reduce((s, p) => s + p.currentPrice, 0)), [wholeSquad]);
  const bank = useMemo(() => Math.max(0.3, round1(SQUAD.initialBudget - teamValue)), [teamValue]);

  const captainCandidates = useMemo(
    () => [...allStarters].sort((a, b) => b.currentPrice - a.currentPrice).slice(0, 2),
    [allStarters],
  );
  const captainId = captainCandidates.length > 0 ? captainCandidates[captainTick % captainCandidates.length].id : undefined;
  const liveId = allStarters.length > 0 ? allStarters[liveTick % allStarters.length].id : undefined;

  useEffect(() => {
    if (!liveId) return;
    setHeroPoints((prev) => ({ ...prev, [liveId]: Math.min(15, (prev[liveId] ?? 2) + 2) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTick, liveId]);

  const watchList = useMemo(
    () => [...startingFwd.slice(0, 2), ...startingMid.slice(0, 1), ...startingDef.slice(0, 1)].filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pool, formation],
  );
  const activeWatchIdx = watchList.length > 0 ? scoreTick % watchList.length : 0;
  const activeEvent = SCORING_EVENTS[scoreTick % SCORING_EVENTS.length];
  useEffect(() => {
    const p = watchList[activeWatchIdx];
    if (!p) return;
    setScorePoints((prev) => ({ ...prev, [p.id]: Math.min(23, (prev[p.id] ?? 3) + activeEvent.delta) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreTick]);

  const tickerItems = useMemo(() => buildTicker(fixtures), [fixtures]);

  function renderRow(players: DemoPlayer[], delay: number) {
    return (
      <div className="flex justify-center gap-1 sm:gap-3 animate-slide-down" style={{ animationDelay: `${delay}ms` }}>
        {players.map((p) => (
          <PlayerCard
            key={p.id}
            player={p}
            size="xs"
            isCaptain={p.id === captainId}
            livePoints={heroPoints[p.id] ?? 0}
            isPlaying={p.id === liveId}
          />
        ))}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0e17] text-ink overflow-x-hidden pt-safe pb-safe">
      <BackgroundTexture />

      {/* ============ NAV ============ */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0e17]/92 backdrop-blur-sm">
        <div className="max-w-[1360px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Crest size={30} />
            <div className="leading-tight">
              <div className="font-display text-lg tracking-wide text-ink leading-none">FANTASY</div>
              <div className="text-white/40 text-[9px] tracking-[0.25em] leading-none mt-0.5">WORLD CUP &apos;26</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-8 text-[11px] font-bold tracking-[0.15em] text-white/45">
            <a href="#squad-demo" className="hover:text-ink transition-colors">GAME</a>
            <a href="#scoring" className="hover:text-ink transition-colors">PLAYERS</a>
            <a href="#leagues" className="hover:text-ink transition-colors">LEAGUES</a>
          </div>
          <Link
            href="/login"
            className="px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/15 text-ink text-xs font-bold tracking-wide transition-colors"
          >
            SIGN IN
          </Link>
        </div>
      </nav>

      {/* ============ HERO ============ */}
      <section id="squad-demo" className="relative min-h-[100dvh] flex flex-col">
        <div className="flex-1 max-w-[1360px] w-full mx-auto px-5 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center py-10 lg:py-6">
          {/* Left: statement */}
          <div className="lg:col-span-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="flex -space-x-1.5">
                {HOSTS.map((code) => (
                  <img key={code} src={getFlagUrl(code, 'md')} alt={code} className="w-6 h-4 rounded-[2px] border border-black/40 object-cover" />
                ))}
              </div>
              <span className="text-white/35 text-[10px] font-bold tracking-[0.25em] uppercase">2026 · USA · Canada · Mexico</span>
            </div>

            <h1 className="font-display uppercase leading-[0.9] tracking-tight text-[3.1rem] sm:text-6xl lg:text-[4.4rem]">
              <span className="block text-ink">48 Nations.</span>
              <span className="block text-ink">104 Matches.</span>
              <span className="block text-accent">One Squad.</span>
            </h1>

            <p className="mt-6 text-white/55 text-[15px] sm:text-base leading-relaxed max-w-md">
              Draft real World Cup players into your XI, name a captain every matchday, and survive the knockouts as the tournament plays out.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href="/register"
                className="px-7 py-3 rounded-lg bg-accent hover:bg-accent/90 text-ink font-bold text-sm tracking-wide shadow-[0_10px_30px_-8px_rgba(214,41,107,0.55)] transition-colors"
              >
                Build My Squad
              </Link>
              <a href="#how-it-works" className="group inline-flex items-center gap-1.5 text-sm font-bold text-white/60 hover:text-ink transition-colors">
                View How It Works
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </a>
            </div>

            <div className="mt-10 flex items-center gap-5 sm:gap-7 text-left">
              <Stat value={TOURNAMENT.totalTeams} label="Nations" />
              <div className="w-px h-8 bg-white/10" />
              <Stat value={TOURNAMENT.totalMatches} label="Matches" />
              <div className="w-px h-8 bg-white/10" />
              <Stat value={`£${SQUAD.initialBudget.toFixed(0)}M`} label="Budget" />
            </div>
          </div>

          {/* Right: live squad-builder preview — the real PitchBg / PlayerCard
              / FormationPicker components, not a mockup. */}
          <div className="lg:col-span-7">
            <div className="relative rounded-2xl ring-1 ring-white/10 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.75)] overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-3 bg-[#0d1220] border-b border-white/10">
                <div className="flex items-center gap-1.5 min-w-0 text-[10px] sm:text-[11px] font-bold text-white/45 tracking-[0.1em] sm:tracking-[0.15em] uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse shrink-0" />
                  <span className="truncate">3rd Place &amp; Final<span className="hidden sm:inline"> · Deadline Sat 21:00</span></span>
                </div>
                {mounted && (
                  <div className="shrink-0">
                    <FormationPicker formations={FORMATION_STRINGS} current={formation} onChange={setFormation} />
                  </div>
                )}
              </div>

              <div className="relative">
                <PitchBg />
                <div className="relative z-10 p-2 sm:p-6 space-y-3 sm:space-y-6 min-h-[260px] sm:min-h-[340px] overflow-x-auto scrollbar-hide">
                  {renderRow(startingFwd, 0)}
                  {renderRow(startingMid, 60)}
                  {renderRow(startingDef, 120)}
                  {renderRow(startingGk, 180)}
                </div>
              </div>

              {/* Bench — whoever isn't starting this formation, same as the
                  real squad page's dugout. */}
              <div className="px-3 sm:px-5 py-3 bg-[#0a0e17] border-t border-white/10">
                <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-2">Substitutes</p>
                <div className="flex justify-center gap-1.5 sm:gap-3">
                  {bench.map((p) => (
                    <PlayerCard key={p.id} player={p} size="xs" />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 px-4 py-3 bg-[#0d1220] border-t border-white/10">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10">
                    <Coins className="w-3.5 h-3.5 text-white/50" />
                    <span className="text-ink font-black text-xs tabular-nums">£{teamValue.toFixed(1)}m</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10">
                    <Wallet className="w-3.5 h-3.5 text-emerald-300" />
                    <span className="text-emerald-300 font-black text-xs tabular-nums">£{bank.toFixed(1)}m</span>
                  </span>
                </div>
                <span className="text-[10px] text-white/35 font-bold uppercase tracking-wider">2 Free Transfers</span>
              </div>
            </div>
          </div>
        </div>

        <FixtureTicker items={tickerItems} />
      </section>

      {/* ============ SECTION 2 · LIVE SCORING ============ */}
      <section id="scoring" className="border-t border-white/10 py-20 sm:py-28">
        <div className="max-w-[1360px] mx-auto px-5 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5">
            <Eyebrow>Live Scoring</Eyebrow>
            <h2 className="font-display uppercase text-3xl sm:text-4xl leading-[0.95] mt-3">
              Every kick, <span className="text-accent">every point,</span> live.
            </h2>
            <p className="mt-4 text-white/55 text-sm sm:text-base leading-relaxed max-w-md">
              Goals, assists, clean sheets and bonus points land on your squad the moment they&apos;re confirmed. No waiting for a gameweek to end.
            </p>
          </div>
          <div className="lg:col-span-7">
            <div className="rounded-2xl bg-[#0d1220] ring-1 ring-white/10 overflow-hidden">
              <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
                <span className="text-[10px] font-bold text-white/45 tracking-[0.2em] uppercase">Live Points</span>
              </div>
              <div>
                {watchList.length === 0 && (
                  <div className="px-5 py-8 text-center text-white/30 text-sm">Loading players…</div>
                )}
                {watchList.map((p, i) => {
                  const active = i === activeWatchIdx;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-white/5 last:border-b-0 transition-colors ${active ? 'bg-accent/10' : ''}`}
                    >
                      <div className="w-7 h-7 rounded-full bg-white/5 ring-1 ring-white/10 flex items-center justify-center overflow-hidden shrink-0">
                        {p.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photoUrl} alt="" className="w-full h-full object-cover object-top" />
                        ) : (
                          <span className="text-[10px] font-black text-white/50">{p.displayName.slice(0, 1)}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-ink text-sm font-bold truncate">{p.displayName}</p>
                        <p className="text-white/35 text-[11px]">{p.nation?.name ?? p.position}</p>
                      </div>
                      {active && (
                        <span className="hidden sm:inline text-[10px] font-black tracking-wider text-live px-2 py-1 rounded-md bg-live/10 ring-1 ring-live/30">
                          {activeEvent.label}
                        </span>
                      )}
                      <span className="text-emerald-400 font-black text-sm tabular-nums w-10 text-right">{scorePoints[p.id] ?? 3}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ SECTION 3 · PRIVATE LEAGUES ============ */}
      <section id="leagues" className="border-t border-white/10 py-20 sm:py-28">
        <div className="max-w-[1360px] mx-auto px-5 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5">
            <Eyebrow>Private Leagues</Eyebrow>
            <h2 className="font-display uppercase text-3xl sm:text-4xl leading-[0.95] mt-3">
              Bragging rights, <span className="text-accent">settled weekly.</span>
            </h2>
            <p className="mt-4 text-white/55 text-sm sm:text-base leading-relaxed max-w-md">
              Create a league with a share code, invite your group, and track the table matchday by matchday until someone lifts it.
            </p>
          </div>
          <div className="lg:col-span-7">
            <div className="rounded-2xl bg-[#0d1220] ring-1 ring-white/10 overflow-hidden">
              <div className="grid grid-cols-[2.5rem_1fr_5rem_4rem] sm:grid-cols-[3rem_1fr_1fr_5rem_4rem] gap-2 px-4 sm:px-5 py-2.5 border-b border-white/10 text-[10px] font-bold text-white/40 tracking-widest uppercase">
                <span>#</span>
                <span>Team</span>
                <span className="hidden sm:block">Manager</span>
                <span className="text-right">GW</span>
                <span className="text-right">Total</span>
              </div>
              {LEAGUE_ROWS.map((r) => (
                <div
                  key={r.rank}
                  className={`grid grid-cols-[2.5rem_1fr_5rem_4rem] sm:grid-cols-[3rem_1fr_1fr_5rem_4rem] gap-2 items-center px-4 sm:px-5 py-3 border-b border-white/5 last:border-b-0 ${r.rank === 1 ? 'bg-accent/[0.06]' : ''}`}
                >
                  <span className={`flex items-center gap-1 font-black text-sm tabular-nums ${r.rank === 1 ? 'text-accent' : 'text-white/50'}`}>
                    {r.rank === 1 && <Trophy className="w-3.5 h-3.5" />}
                    {r.rank}
                  </span>
                  <span className="text-ink text-sm font-bold truncate">{r.team}</span>
                  <span className="hidden sm:block text-white/40 text-xs truncate">{r.manager}</span>
                  <span className="text-white/50 text-xs text-right tabular-nums">{r.gw}</span>
                  <span className="flex items-center justify-end gap-1 text-ink font-black text-sm tabular-nums">
                    {r.total.toLocaleString()}
                    {r.trend === 'up' && <TrendingUp className="w-3 h-3 text-emerald-400" />}
                    {r.trend === 'down' && <TrendingDown className="w-3 h-3 text-white/30" />}
                    {r.trend === 'flat' && <Minus className="w-3 h-3 text-white/20" />}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ SECTION 4 · RULES ============ */}
      <section id="how-it-works" className="border-t border-white/10 py-20 sm:py-28">
        <div className="max-w-[1360px] mx-auto px-5 sm:px-8">
          <Eyebrow>How It Works</Eyebrow>
          <h2 className="font-display uppercase text-3xl sm:text-4xl leading-[0.95] mt-3 max-w-2xl">
            Budget, transfers, and captaincy: <span className="text-accent">the whole system.</span>
          </h2>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-9">
            {RULES.map((r) => (
              <div key={r.n} className="flex gap-4 border-l-2 border-white/10 pl-5">
                <span className="font-display text-3xl sm:text-4xl text-white/15 leading-none shrink-0">{r.n}</span>
                <div>
                  <h3 className="font-display text-lg tracking-wide text-ink">{r.title}</h3>
                  <p className="text-white/50 text-sm mt-1.5 leading-relaxed">{r.body}</p>
                </div>
              </div>
            ))}
            <div className="flex gap-4 border-l-2 border-accent/30 pl-5">
              <Shield className="w-8 h-8 text-accent/70 shrink-0" strokeWidth={1.5} />
              <div>
                <h3 className="font-display text-lg tracking-wide text-ink">ONE PLATFORM, EVERY ROUND</h3>
                <p className="text-white/50 text-sm mt-1.5 leading-relaxed">
                  From the group stage through the Final, squads, prices, and leagues carry through automatically as the bracket tightens.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ SECTION 5 · FINAL CTA ============ */}
      <section className="relative border-t border-white/10 bg-[#0d1220] py-20 sm:py-28 overflow-hidden">
        <div className="relative max-w-[1360px] mx-auto px-5 sm:px-8 text-center">
          <h2 className="font-display uppercase text-4xl sm:text-6xl leading-[0.95]">
            The squad you build now
            <br />
            decides <span className="text-accent">who lifts the table.</span>
          </h2>

          <div className="mt-9 flex justify-center">
            {kickedOff ? (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-live/10 ring-1 ring-live/40">
                <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
                <span className="text-live text-xs font-bold tracking-[0.2em] uppercase">Matches In Progress</span>
              </span>
            ) : (
              <div className="flex gap-3">
                <CountdownUnit value={countdown.days} label="Days" />
                <CountdownUnit value={countdown.hours} label="Hrs" />
                <CountdownUnit value={countdown.minutes} label="Min" />
              </div>
            )}
          </div>

          <Link
            href="/register"
            className="mt-9 inline-block px-8 py-3.5 rounded-lg bg-accent hover:bg-accent/90 text-ink font-bold text-sm tracking-wide shadow-[0_10px_30px_-8px_rgba(214,41,107,0.55)] transition-colors"
          >
            Build My Squad
          </Link>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-white/10 py-8">
        <div className="max-w-[1360px] mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Crest size={22} />
            <span className="text-white/40 text-xs font-bold tracking-wide">FANTASY WORLD CUP &apos;26</span>
          </div>
          <p className="text-white/25 text-[11px] text-center sm:text-right">
            An independent fantasy competition built around the 2026 FIFA World Cup. Not affiliated with FIFA.
          </p>
        </div>
      </footer>
    </main>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.25em] text-white/35 uppercase">
      <span className="w-4 h-px bg-accent" />
      {children}
    </div>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl sm:text-3xl text-ink leading-none tabular-nums">{value}</div>
      <div className="text-white/30 text-[10px] uppercase tracking-widest mt-1">{label}</div>
    </div>
  );
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center mb-1.5">
        <span className="font-display text-2xl text-ink tabular-nums">{value.toString().padStart(2, '0')}</span>
      </div>
      <span className="text-[9px] text-white/30 uppercase tracking-wider font-bold">{label}</span>
    </div>
  );
}

// Near-black base + two faint stadium-floodlight beams + fine grain — no
// blurred color blobs (costly to composite on iOS Safari; see squad-builder
// history) and no neon glow, just enough texture to read as "broadcast", not
// "flat gradient template".
function BackgroundTexture() {
  return (
    <div className="fixed inset-0 pointer-events-none -z-10">
      <div className="absolute inset-0 bg-[#0a0e17]" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{ background: 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.7) 50%, transparent 58%)' }}
      />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{ background: 'linear-gradient(70deg, transparent 60%, rgba(214,41,107,0.8) 68%, transparent 76%)' }}
      />
      <svg className="absolute inset-0 w-full h-full opacity-[0.035] mix-blend-overlay" aria-hidden>
        <filter id="landing-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#landing-grain)" />
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_70%_at_50%_0%,transparent_55%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}
