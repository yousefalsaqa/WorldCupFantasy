'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertTriangle } from 'lucide-react';

interface UnsavedChangesContextValue {
  isDirty: boolean;
  /** Mark the current page dirty / clean. Pass an optional label shown in the modal. */
  setDirty: (dirty: boolean, label?: string) => void;
  /**
   * Run `proceed` if the page has no unsaved changes, otherwise open the
   * confirmation modal and only run it if the user chooses "Leave without saving".
   * Returns immediately; the result is handled via the modal.
   */
  guard: (proceed: () => void) => void;
  /**
   * Synchronously remove the dirty state AND detach the beforeunload listener.
   * Call this immediately before any programmatic reload/redirect (e.g. after a
   * successful save) to avoid the browser's "Leave site?" prompt firing because
   * React state updates are async.
   */
  forceClean: () => void;
}

const Ctx = createContext<UnsavedChangesContextValue | null>(null);

export function useUnsavedChanges(): UnsavedChangesContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      isDirty: false,
      setDirty: () => {},
      guard: (proceed) => proceed(),
      forceClean: () => {},
    };
  }
  return ctx;
}

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  const [label, setLabel] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState(false);

  // Refs are the source of truth for the beforeunload guard so toggling them
  // takes effect synchronously – no waiting for React to commit.
  const dirtyRef = useRef(false);
  const pendingRef = useRef<(() => void) | null>(null);

  const setDirty = useCallback((dirty: boolean, nextLabel?: string) => {
    dirtyRef.current = dirty;
    setIsDirty(dirty);
    if (dirty) setLabel(nextLabel);
    else setLabel(undefined);
  }, []);

  const forceClean = useCallback(() => {
    dirtyRef.current = false;
    pendingRef.current = null;
    setIsDirty(false);
    setLabel(undefined);
    setOpen(false);
  }, []);

  const guard = useCallback(
    (proceed: () => void) => {
      if (!dirtyRef.current) {
        proceed();
        return;
      }
      pendingRef.current = proceed;
      setOpen(true);
    },
    []
  );

  // Single always-on beforeunload listener that reads from the ref. This avoids
  // the previous race where setIsDirty(false) was async, so the listener
  // remained attached during a programmatic reload and the browser prompted
  // "Leave site?" even though we'd just saved successfully.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const cancel = () => {
    pendingRef.current = null;
    setOpen(false);
  };

  const leave = () => {
    const fn = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    dirtyRef.current = false;
    setIsDirty(false);
    setLabel(undefined);
    if (fn) fn();
  };

  const value = useMemo<UnsavedChangesContextValue>(
    () => ({ isDirty, setDirty, guard, forceClean }),
    [isDirty, setDirty, guard, forceClean]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={cancel}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-title"
            className="relative w-full max-w-sm bg-[#10141f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 id="unsaved-title" className="text-white font-semibold text-base">
                    Unsaved changes
                  </h2>
                  <p className="text-white/60 text-sm mt-1">
                    {label ?? 'You have unsaved changes that will be lost if you leave this page.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 pt-0">
              <button
                type="button"
                onClick={cancel}
                className="px-3 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 active:scale-[0.98] text-white font-medium text-sm transition"
                autoFocus
              >
                Stay on page
              </button>
              <button
                type="button"
                onClick={leave}
                className="px-3 py-2.5 rounded-lg bg-rose-500 hover:bg-rose-600 active:scale-[0.98] text-white font-semibold text-sm transition"
              >
                Leave without saving
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
