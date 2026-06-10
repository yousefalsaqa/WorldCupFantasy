'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, X, Loader2, AlertCircle, Check } from 'lucide-react';

interface JoinLeagueModalProps {
  /** Called after successfully joining (e.g. refetch the league list). */
  onSuccess?: () => void;
}

export function JoinLeagueModal({ onSuccess }: JoinLeagueModalProps) {
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
      onSuccess?.();
      
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
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white/80 bg-white/5 ring-1 ring-white/15 hover:bg-white/10 hover:text-white transition-all"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Join League
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="relative w-full max-w-sm bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              className="absolute top-3 right-3 p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {success ? (
              // Success state
              <div className="p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/40 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-7 h-7 text-emerald-400" />
                </div>
                <h2 className="text-xl font-black text-white mb-1">You&apos;re in!</h2>
                <p className="text-white/50 text-sm">Welcome to the league</p>
              </div>
            ) : (
              // Form state
              <>
                <div className="px-6 pt-6 pb-4 bg-gradient-to-r from-sky-500/15 via-purple-500/10 to-transparent flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center">
                    <UserPlus className="w-5 h-5 text-sky-300" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white leading-tight">Join a league</h2>
                    <p className="text-white/50 text-xs">Got a code from a friend? Enter it here</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6 pt-4">
                  {error && (
                    <div className="flex items-center gap-2.5 px-3 py-2.5 mb-4 rounded-lg bg-rose-500/10 border border-rose-500/30">
                      <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      <p className="text-xs text-rose-300">{error}</p>
                    </div>
                  )}

                  <label htmlFor="code" className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
                    League code
                  </label>
                  <input
                    id="code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full px-4 py-2.5 mb-5 bg-white/5 border border-white/10 rounded-xl text-white text-center font-mono text-lg tracking-widest placeholder-white/20 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors"
                    placeholder="ABCD1234"
                    required
                    maxLength={8}
                    autoFocus
                  />

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white/70 font-medium hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || code.length !== 8}
                      className="flex-1 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 rounded-xl text-white font-bold hover:from-sky-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Joining...
                        </>
                      ) : (
                        'Join'
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


