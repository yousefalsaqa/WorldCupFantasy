'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Loader2, AlertCircle, Copy, Check } from 'lucide-react';

interface CreateLeagueModalProps {
  userId: string;
}

export function CreateLeagueModal({ userId }: CreateLeagueModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: leagueName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create league');
        return;
      }

      setCreatedCode(data.league.code);
      router.refresh();
    } catch {
      setError('Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const copyCode = () => {
    if (createdCode) {
      navigator.clipboard.writeText(createdCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const closeModal = () => {
    setIsOpen(false);
    setLeagueName('');
    setError('');
    setCreatedCode(null);
    setCopied(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="btn-primary flex items-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Create League
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeModal} />
          
          <div className="relative w-full max-w-md card p-6 animate-scale-in">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-surface-800"
            >
              <X className="w-5 h-5 text-surface-400" />
            </button>

            {createdCode ? (
              // Success state
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="font-display text-2xl text-laliga-cream mb-2">
                  LEAGUE CREATED!
                </h2>
                <p className="text-surface-400 mb-6">
                  Share this code with friends to join your league
                </p>
                
                <div className="flex items-center justify-center gap-3 p-4 rounded-lg bg-surface-800 mb-6">
                  <span className="font-mono text-2xl font-bold text-laliga-gold tracking-wider">
                    {createdCode}
                  </span>
                  <button
                    onClick={copyCode}
                    className="p-2 rounded-lg hover:bg-surface-700 transition-colors"
                  >
                    {copied ? (
                      <Check className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Copy className="w-5 h-5 text-surface-400" />
                    )}
                  </button>
                </div>

                <button onClick={closeModal} className="btn-secondary w-full">
                  Done
                </button>
              </div>
            ) : (
              // Form state
              <>
                <h2 className="font-display text-2xl text-laliga-cream mb-2">
                  CREATE LEAGUE
                </h2>
                <p className="text-surface-400 mb-6">
                  Start a private league and invite your friends
                </p>

                {error && (
                  <div className="flex items-center gap-3 p-4 mb-6 rounded-lg bg-laliga-red/10 border border-laliga-red/20">
                    <AlertCircle className="w-5 h-5 text-laliga-red flex-shrink-0" />
                    <p className="text-sm text-laliga-red">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <div className="mb-6">
                    <label htmlFor="leagueName" className="block text-sm font-medium text-surface-300 mb-2">
                      League Name
                    </label>
                    <input
                      id="leagueName"
                      type="text"
                      value={leagueName}
                      onChange={(e) => setLeagueName(e.target.value)}
                      className="input-field"
                      placeholder="e.g., Office Champions"
                      required
                      minLength={3}
                      maxLength={40}
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="btn-secondary flex-1"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || leagueName.length < 3}
                      className="btn-primary flex-1 flex items-center justify-center gap-2"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        'Create League'
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}


