'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getFlagUrl } from '@/lib/flags';

// All 48 qualifying nations
const NATIONS = [
  'MEX', 'RSA', 'KOR', 'CAN', 'QAT', 'SUI', 'BRA', 'MAR', 'HAI', 'SCO',
  'USA', 'PAR', 'AUS', 'GER', 'CUW', 'CIV', 'ECU', 'NED', 'JPN', 'TUN',
  'BEL', 'EGY', 'IRN', 'NZL', 'ESP', 'CPV', 'KSA', 'URU', 'FRA', 'SEN',
  'NOR', 'ARG', 'ALG', 'JOR', 'POR', 'UZB', 'COL', 'ENG', 'CRO', 'GHA', 'PAN'
];

const HOSTS = ['USA', 'CAN', 'MEX'];

export default function Home() {
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const targetDate = new Date('2026-06-11T18:00:00Z');
    
    const updateCountdown = () => {
      const now = new Date();
      const diff = targetDate.getTime() - now.getTime();
      
      if (diff > 0) {
        setCountdown({
          days: Math.floor(diff / (1000 * 60 * 60 * 24)),
          hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((diff % (1000 * 60)) / 1000),
        });
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0e17] overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-rose-500/10 rounded-full blur-[150px]"></div>
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[150px]"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 via-pink-500 to-purple-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
            <span className="text-white font-black text-lg">26</span>
          </div>
          <div>
            <div className="text-white font-black tracking-tight">FANTASY</div>
            <div className="text-white/40 text-xs tracking-widest">WORLD CUP</div>
          </div>
        </div>
        <Link 
          href="/login"
          className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-medium text-sm transition-all"
        >
          Sign In
        </Link>
      </nav>

      {/* Flag Parade - FIRST THING YOU SEE */}
      <div className="relative overflow-hidden py-4 mb-4">
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#0a0e17] to-transparent z-10"></div>
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#0a0e17] to-transparent z-10"></div>
        <div className="flex animate-scroll gap-6">
          {[...NATIONS, ...NATIONS].map((code, i) => (
            <img
              key={`${code}-${i}`}
              src={getFlagUrl(code, 'lg')}
              alt={code}
              className="w-16 h-10 rounded-lg shadow-xl object-cover flex-shrink-0 hover:scale-110 transition-transform"
            />
          ))}
        </div>
      </div>

      {/* Hero Section */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-4 pb-16">
        {/* Host Nations */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="flex -space-x-2">
            {HOSTS.map(code => (
              <img
                key={code}
                src={getFlagUrl(code, 'md')}
                alt={code}
                className="w-10 h-7 rounded-md shadow-lg border-2 border-[#0a0e17] object-cover"
              />
            ))}
          </div>
          <span className="text-white/30 text-sm font-medium tracking-wider uppercase">2026 Hosts</span>
        </div>

        {/* Main Title */}
        <div className="text-center mb-8">
          <h1 className="text-6xl md:text-8xl font-black text-white tracking-tighter leading-none mb-2">
            <span className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">WORLD</span>
            <span className="relative ml-3 bg-gradient-to-br from-rose-400 via-pink-500 to-purple-500 bg-clip-text text-transparent">'26</span>
          </h1>
          <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-none">
            <span className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">CUP</span>
          </h1>
          <p className="mt-4 text-white/40 text-base tracking-[0.3em] uppercase font-medium">Fantasy Football</p>
        </div>

        {/* Countdown */}
        <div className="text-center mb-10">
          <p className="text-white/30 text-xs uppercase tracking-widest mb-3">Tournament Begins</p>
          <div className="flex justify-center gap-3">
            <CountdownUnit value={countdown.days} label="Days" />
            <CountdownUnit value={countdown.hours} label="Hrs" />
            <CountdownUnit value={countdown.minutes} label="Min" />
            <CountdownUnit value={countdown.seconds} label="Sec" />
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
          <Link 
            href="/register"
            className="group relative px-8 py-4 bg-gradient-to-r from-rose-500 to-pink-600 rounded-xl font-bold text-white shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40 transition-all"
          >
            <span className="relative z-10 flex items-center gap-2">
              Build Your Squad
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </Link>
          <Link 
            href="/login"
            className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium text-white/70 hover:text-white transition-all"
          >
            View Leagues
          </Link>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-10 mb-12">
          <StatBadge value="48" label="Nations" />
          <StatBadge value="104" label="Matches" />
          <StatBadge value="£100M" label="Budget" />
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-4 max-w-3xl mx-auto">
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
    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 text-center hover:bg-white/[0.04] transition-all">
      <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center mx-auto mb-2 text-rose-400">
        {icon}
      </div>
      <h3 className="text-white font-bold text-sm mb-0.5">{title}</h3>
      <p className="text-white/40 text-xs">{description}</p>
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
