'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';

export function CreateTeamForm() {
  const router = useRouter();
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (teamName.length < 3) {
      setError('Team name must be at least 3 characters');
      return;
    }

    if (teamName.length > 30) {
      setError('Team name cannot exceed 30 characters');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create team');
        return;
      }

      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card max-w-md mx-auto p-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-laliga-red/10 border border-laliga-red/20">
            <AlertCircle className="w-5 h-5 text-laliga-red flex-shrink-0" />
            <p className="text-sm text-laliga-red">{error}</p>
          </div>
        )}

        {/* Team Name Input */}
        <div>
          <label htmlFor="teamName" className="block text-sm font-medium text-surface-300 mb-2">
            Team Name
          </label>
          <input
            id="teamName"
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="input-field"
            placeholder="e.g., Madrid Masters"
            required
            minLength={3}
            maxLength={30}
            autoFocus
          />
          <p className="text-xs text-surface-500 mt-2">
            Choose a memorable name for your team (3-30 characters)
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || teamName.length < 3}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating Team...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Create Team
            </>
          )}
        </button>
      </form>
    </div>
  );
}


