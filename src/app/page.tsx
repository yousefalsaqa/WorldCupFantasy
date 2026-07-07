'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Crest from '@/components/crest';
import { getFlagUrl } from '@/lib/flags';
import { decomposeDuration } from '@/lib/format-time';

// All 48 qualifying nations. The final 6 entries are the March 2026 playoff
// winners (4 UEFA paths + 2 FIFA intercontinental pathways).
const NATIONS = [
  'MEX', 'RSA', 'KOR', 'CAN', 'QAT', 'SUI', 'BRA', 'MAR', 'HAI', 'SCO',
  'USA', 'PAR', 'AUS', 'GER', 'CUW', 'CIV', 'ECU', 'NED', 'JPN', 'TUN',
  'BEL', 'EGY', 'IRN', 'NZL', 'ESP', 'CPV', 'KSA', 'URU', 'FRA', 'SEN',
  'NOR', 'ARG', 'ALG', 'JOR', 'AUT', 'POR', 'UZB', 'COL', 'ENG', 'CRO', 'GHA', 'PAN',
  'CZE', 'BIH', 'TUR', 'SWE', 'IRQ', 'COD',
];

const HOSTS = ['USA', 'CAN', 'MEX'];

interface MarqueePlayer {
  id: string;
  displayName: string;
  currentPrice: number;
  photoUrl?: string | null;
  nation?: { code: string; kitColor1: string; kitColor2: string };
}

export default function Home() {
  // Mounted-on-client guard so the static SSR HTML paints first on iOS Safari.
  // Heavy work (countdown timer, scrolling flag parade) is gated behind this –
  // they were the main reason the landing page felt sluggish on first load.
  const [mounted, setMounted] = useState(false);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [kickedOff, setKickedOff] = useState(false);
  const [stars, setStars] = useState<MarqueePlayer[]>([]);

  // Marquee names for the hero — top 6 by price, real headshots.
  useEffect(() => {
    fetch('/api/players?limit=6')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setStars(d.filter((p: MarqueePlayer) => p.photoUrl)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setMounted(true);
    const targetDate = new Date('2026-06-11T18:00:00Z');

    const updateCountdown = () => {
      const diff = targetDate.getTime() - Date.now();
      if (diff > 0) {
        const { days, hours, minutes, seconds } = decomposeDuration(diff);
        setCountdown({ days, hours, minutes, seconds });
      } else {
        setKickedOff(true);
      }
    };

    updateCountdown();
    // Tick once a minute instead of every second. The seconds field still
    // refreshes on the next mount; in exchange the page stops re-rendering 60
    // times a minute, which on iOS Safari was thrashing the compositor while
    // the marquee animation was running.
    const interval = setInterval(updateCountdown, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0e17] overflow-hidden pt-safe pb-safe">
      {/* Background – use CSS radial-gradients instead of two giant blurred
          circles. blur-[150px] on a 600px square is a known iOS Safari GPU
          stall (compositor spends ~hundreds of ms per frame). A radial
          gradient gives the same look for free. */}
      <div className="fixed inset-0 pointer-events-none">
        {/* color washes */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 600px 600px at 25% 0%, rgba(244,63,94,0.16), transparent 60%), radial-gradient(ellipse 700px 500px at 50% 38%, rgba(168,85,247,0.08), transparent 65%), radial-gradient(ellipse 600px 600px at 75% 100%, rgba(59,130,246,0.12), transparent 60%)',
          }}
        />
        {/* fine grid, faded out radially so it only reads near the hero */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '52px 52px',
            maskImage: 'radial-gradient(ellipse 80% 55% at 50% 32%, black 30%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 55% at 50% 32%, black 30%, transparent 100%)',
          }}
        />
        {/* vignette to pull focus inward */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(ellipse 120% 90% at 50% 40%, transparent 55%, rgba(0,0,0,0.45) 100%)',
          }}
        />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <Crest size={34} />
          <div>
            <div className="text-white font-black text-sm leading-tight tracking-tight">FANTASY</div>
            <div className="text-white/40 text-[10px] tracking-widest leading-tight">WORLD CUP</div>
          </div>
        </div>
        <Link
          href="/login"
          className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-medium text-sm transition-all"
        >
          Sign In
        </Link>
      </nav>

      {/* Flag Parade - FIRST THING YOU SEE
          Only render once mounted: avoids 80+ flag <img> being created during
          the very first paint, which on iPhone Safari was the main reason the
          page felt "stuck". Static fallback (the host flags below) is enough
          to make the page feel populated until the parade fades in. */}
      <div className="relative overflow-hidden py-3 mb-2 min-h-[52px]">
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#0a0e17] to-transparent z-10"></div>
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#0a0e17] to-transparent z-10"></div>
        {mounted && (
          <div className="flex animate-scroll gap-4">
            {[...NATIONS, ...NATIONS].map((code, i) => (
              <img
                key={`${code}-${i}`}
                src={getFlagUrl(code, 'md')}
                alt={code}
                width={44}
                height={28}
                loading="lazy"
                decoding="async"
                className="w-11 h-7 rounded-md shadow-lg object-cover flex-shrink-0 opacity-80 hover:opacity-100 hover:scale-110 transition-all"
              />
            ))}
          </div>
        )}
      </div>

      {/* Hero Section */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-2 pb-12">
        {/* Host Nations */}
        <div className="flex items-center justify-center gap-2.5 mb-5">
          <div className="flex -space-x-1.5">
            {HOSTS.map(code => (
              <img
                key={code}
                src={getFlagUrl(code, 'md')}
                alt={code}
                className="w-8 h-[22px] rounded shadow-lg border-2 border-[#0a0e17] object-cover"
              />
            ))}
          </div>
          <span className="text-white/30 text-xs font-medium tracking-wider uppercase">2026 Hosts</span>
        </div>

        {/* Main Title */}
        <div className="text-center mb-7">
          <h1 className="text-[3.4rem] sm:text-7xl md:text-8xl font-black tracking-tighter leading-[0.88]">
            <span className="block bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">WORLD</span>
            <span className="block bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
              CUP <span className="bg-gradient-to-br from-rose-400 via-pink-500 to-purple-500 bg-clip-text text-transparent">'26</span>
            </span>
          </h1>
          <p className="mt-3 text-white/40 text-xs md:text-sm tracking-[0.35em] uppercase font-medium">Fantasy Football</p>
        </div>

        {/* Countdown – ticks once a minute, not every second. Saves a full
            page re-render 59 times a minute on iOS Safari for a date that's
            still weeks away. Flips to a LIVE badge once the first ball is kicked. */}
        <div className="text-center mb-8">
          {kickedOff ? (
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-600/15 ring-1 ring-red-500/40">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-red-300 font-black text-sm tracking-widest uppercase">Tournament Live</span>
            </div>
          ) : (
            <>
              <p className="text-white/30 text-xs uppercase tracking-widest mb-3">Kicks Off June 11 · Estadio Azteca</p>
              <div className="flex justify-center gap-3">
                <CountdownUnit value={countdown.days} label="Days" />
                <CountdownUnit value={countdown.hours} label="Hrs" />
                <CountdownUnit value={countdown.minutes} label="Min" />
              </div>
            </>
          )}
        </div>

        {/* Marquee players — real headshots, top 6 by price */}
        {stars.length > 0 && (
          <div className="flex justify-center mb-10">
            <div className="flex items-end gap-3 sm:gap-5">
              {stars.map((p, i) => (
                <div key={p.id} className={`flex flex-col items-center ${i >= 4 ? 'hidden sm:flex' : ''}`}>
                  <div
                    className="w-12 h-12 sm:w-16 sm:h-16 rounded-full p-[2px] shadow-xl"
                    style={{
                      background: `linear-gradient(160deg, ${p.nation?.kitColor1 || '#334155'}, ${p.nation?.kitColor2 || '#0f172a'})`,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.photoUrl!}
                      alt={p.displayName}
                      loading="lazy"
                      className="w-full h-full rounded-full object-cover object-top bg-slate-800"
                    />
                  </div>
                  <span className="mt-1.5 text-white/70 text-[10px] sm:text-xs font-bold truncate max-w-[64px] sm:max-w-[80px]">{p.displayName}</span>
                  <span className="text-white/30 text-[9px] sm:text-[10px] font-semibold">£{p.currentPrice.toFixed(1)}m</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA — one action, no decoys. Sign In already lives in the nav. */}
        <div className="flex justify-center mb-9">
          <Link
            href="/register"
            className="group relative w-full max-w-xs sm:w-auto sm:max-w-none px-10 py-3.5 bg-gradient-to-r from-rose-500 via-pink-500 to-rose-500 bg-[length:200%_100%] hover:bg-[position:100%_0] rounded-2xl font-black text-white text-base shadow-[0_8px_30px_rgba(244,63,94,0.35)] hover:shadow-[0_8px_40px_rgba(244,63,94,0.5)] ring-1 ring-white/20 transition-all duration-300 text-center"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              Build Your Squad
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </Link>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-8 mb-8">
          <StatBadge value="48" label="Nations" />
          <StatBadge value="104" label="Matches" />
          <StatBadge value="£108M" label="Budget" />
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-2 md:gap-4 max-w-3xl mx-auto">
          <FeatureCard 
            icon={<BoltIcon />}
            title="Live Scoring"
            description="Real-time points"
          />
          <FeatureCard 
            icon={<UsersIcon />}
            title="Private Leagues"
            description="Play with friends"
          />
          <FeatureCard 
            icon={<ShieldIcon />}
            title="Mercy Rule"
            description="Extra transfers"
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}</style>
    </main>
  );
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center mb-1">
        <span className="text-xl font-black text-white tabular-nums">{value.toString().padStart(2, '0')}</span>
      </div>
      <span className="text-[9px] text-white/30 uppercase tracking-wider font-medium">{label}</span>
    </div>
  );
}

function StatBadge({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-xl font-black text-white mb-0.5">{value}</div>
      <div className="text-[10px] text-white/30 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 md:p-4 text-center hover:bg-white/[0.04] transition-all">
      <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-rose-500/10 flex items-center justify-center mx-auto mb-1.5 md:mb-2 text-rose-400">
        {icon}
      </div>
      <h3 className="text-white font-bold text-xs md:text-sm mb-0.5">{title}</h3>
      <p className="text-white/40 text-[10px] md:text-xs">{description}</p>
    </div>
  );
}

function BoltIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}
