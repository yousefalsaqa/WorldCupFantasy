'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getFlagUrl } from '@/lib/flags';
import Link from 'next/link';

interface GroupStanding {
  nationId: string;
  nationName: string;
  nationCode: string;
  group: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

interface StandingsData {
  standings: Record<string, GroupStanding[]>;
  groups: string[];
}

function StandingsContent() {
  const searchParams = useSearchParams();
  const [standingsData, setStandingsData] = useState<StandingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  useEffect(() => {
    const groupParam = searchParams.get('group');
    if (groupParam && ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].includes(groupParam)) {
      setSelectedGroup(groupParam);
    } else {
      setSelectedGroup(null);
    }
  }, [searchParams]);

  useEffect(() => {
    async function fetchStandings() {
      try {
        const groupParam = selectedGroup || '';
        const url = groupParam ? `/api/standings?group=${groupParam}` : '/api/standings';
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setStandingsData(data);
        }
      } catch (error) {
        console.error('Failed to fetch standings:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchStandings();
  }, [selectedGroup]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!standingsData) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-12 text-white/40">
          Failed to load standings
        </div>
      </div>
    );
  }

  const groupsToShow = selectedGroup ? [selectedGroup] : standingsData.groups;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white mb-2">Group Standings</h1>
          <p className="text-white/40 text-sm">Tournament group tables</p>
        </div>
        {selectedGroup && (
          <Link
            href="/standings"
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all text-sm"
          >
            View All Groups
          </Link>
        )}
      </div>

      {/* Group Filter */}
      {!selectedGroup && (
        <div className="flex flex-wrap gap-2">
          {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(group => (
            <Link
              key={group}
              href={`/standings?group=${group}`}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all font-medium"
            >
              Group {group}
            </Link>
          ))}
        </div>
      )}

      {/* Standings Tables */}
      <div className="space-y-6">
        {groupsToShow.map(group => {
          const groupStandings = standingsData.standings[group] || [];
          
          return (
            <div key={group} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="bg-white/5 px-6 py-4 border-b border-white/10">
                <h2 className="text-xl font-bold text-white">Group {group}</h2>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Pos</th>
                      <th className="text-left px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Nation</th>
                      <th className="text-center px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">P</th>
                      <th className="text-center px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">W</th>
                      <th className="text-center px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">D</th>
                      <th className="text-center px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">L</th>
                      <th className="text-center px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">GF</th>
                      <th className="text-center px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">GA</th>
                      <th className="text-center px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">GD</th>
                      <th className="text-center px-6 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupStandings.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-6 py-8 text-center text-white/40">
                          No matches played yet
                        </td>
                      </tr>
                    ) : (
                      groupStandings.map((standing, index) => (
                        <tr
                          key={standing.nationId}
                          className="border-b border-white/5 hover:bg-white/5 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <span className="text-white font-bold">{index + 1}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={getFlagUrl(standing.nationCode, 'md')}
                                alt={standing.nationName}
                                className="w-8 h-6 rounded shadow-md"
                              />
                              <span className="text-white font-semibold">{standing.nationName}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center text-white/80">{standing.played}</td>
                          <td className="px-6 py-4 text-center text-white/80">{standing.wins}</td>
                          <td className="px-6 py-4 text-center text-white/80">{standing.draws}</td>
                          <td className="px-6 py-4 text-center text-white/80">{standing.losses}</td>
                          <td className="px-6 py-4 text-center text-white/80">{standing.goalsFor}</td>
                          <td className="px-6 py-4 text-center text-white/80">{standing.goalsAgainst}</td>
                          <td className={`px-6 py-4 text-center font-semibold ${
                            standing.goalDifference > 0 ? 'text-green-400' :
                            standing.goalDifference < 0 ? 'text-red-400' : 'text-white/80'
                          }`}>
                            {standing.goalDifference > 0 ? '+' : ''}{standing.goalDifference}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-white font-bold text-lg">{standing.points}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function StandingsPage() {
  return (
    <Suspense fallback={
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    }>
      <StandingsContent />
    </Suspense>
  );
}
