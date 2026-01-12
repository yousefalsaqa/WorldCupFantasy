'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

interface User {
  id: string;
  isAdmin: boolean;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (!data.user?.isAdmin) {
          router.push('/dashboard');
        } else {
          setUser(data.user);
        }
        setLoading(false);
      })
      .catch(() => {
        router.push('/login');
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center">
        <div className="text-white/50">Loading...</div>
      </div>
    );
  }

  if (!user?.isAdmin) {
    return null;
  }

  const navItems = [
    { href: '/admin', label: 'Dashboard', icon: '📊', exact: true },
    { href: '/admin/nations', label: 'Nations', icon: '🌍' },
    { href: '/admin/players', label: 'Players', icon: '👥' },
    { href: '/admin/fixtures', label: 'Fixtures', icon: '📅' },
    { href: '/admin/results', label: 'Results', icon: '⚽' },
    { href: '/admin/sync', label: 'API Sync', icon: '🔄' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e17]">
      {/* Admin Header */}
      <div className="bg-gradient-to-r from-red-500/10 via-transparent to-blue-500/10 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-blue-500 flex items-center justify-center">
              <span className="text-white font-black text-sm">🛡️</span>
            </div>
            <div>
              <h1 className="font-black text-white">Admin Panel</h1>
              <p className="text-xs text-white/40">World Cup 2026 Fantasy</p>
            </div>
          </div>
          <Link 
            href="/dashboard" 
            className="text-white/50 hover:text-white text-sm flex items-center gap-2 transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Admin Nav */}
      <div className="border-b border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1 overflow-x-auto py-2">
            {navItems.map(item => {
              const isActive = item.exact 
                ? pathname === item.href
                : pathname.startsWith(item.href);
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2
                    ${isActive 
                      ? 'bg-white/10 text-white' 
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
