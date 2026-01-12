'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, X, Loader2, AlertCircle, Check } from 'lucide-react';

interface JoinLeagueModalProps {
  teamId: string;
}

export function JoinLeagueModal({ teamId }: JoinLeagueModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/leagues/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.toUpperCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to join league');
        return;
      }

      setSuccess(true);
      router.refresh();
      
      setTimeout(() => {
        closeModal();
      }, 1500);
    } catch {
      setError('Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setIsOpen(false);
    setCode('');
    setError('');
    setSuccess(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="btn-secondary flex items-center gap-2"
      >
        <UserPlus className="w-4 h-4" />
        Join League
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

            {success ? (
              // Success state
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="font-display text-2xl text-laliga-cream mb-2">
                  JOINED!
                </h2>
                <p className="text-surface-400">
                  You&apos;ve successfully joined the league
                </p>
              </div>
            ) : (
              // Form state
              <>
                <h2 className="font-display text-2xl text-laliga-cream mb-2">
                  JOIN LEAGUE
                </h2>
                <p className="text-surface-400 mb-6">
                  Enter the league code to join your friends
                </p>

                {error && (
                  <div className="flex items-center gap-3 p-4 mb-6 rounded-lg bg-laliga-red/10 border border-laliga-red/20">
                    <AlertCircle className="w-5 h-5 text-laliga-red flex-shrink-0" />
                    <p className="text-sm text-laliga-red">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <div className="mb-6">
                    <label htmlFor="code" className="block text-sm font-medium text-surface-300 mb-2">
                      League Code
                    </label>
                    <input
                      id="code"
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      className="input-field text-center font-mono text-lg tracking-wider"
                      placeholder="ABCD1234"
                      required
                      maxLength={8}
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
                      disabled={isLoading || code.length !== 8}
                      className="btn-primary flex-1 flex items-center justify-center gap-2"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Joining...
                        </>
                      ) : (
                        'Join League'
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


