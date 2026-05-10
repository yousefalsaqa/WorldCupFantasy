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
import { createPortal } from 'react-dom';
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

  // iOS Safari does not implement HTML5 drag-and-drop on touch. The squad
  // page uses native dragstart/dragover/drop events, which is why dragging
  // players felt broken on iPhone. This polyfill (10KB, zero deps) translates
  // touch events into the matching synthetic drag events – existing handlers
  // keep working, no other code changes needed. We dynamically import it so
  // it never runs during SSR (it touches `document` at module load).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Lazy import – also keeps the desktop bundle smaller until first use.
    void import('@dragdroptouch/drag-drop-touch');
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

  // Portal target. We can only reference document.body on the client, so we
  // gate this on a mount flag to avoid SSR mismatches.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    setPortalReady(true);
  }, []);

  // The modal markup is rendered through a React portal into <body> so that
  // no ancestor's stacking context (e.g. <main className="relative z-10">)
  // can ever paint over it.
  //
  // iOS Safari hardening – three layers, each independently sufficient:
  //   1. `isolation: isolate` forces this container into its own stacking
  //      context so nothing outside (including any squad-page modal at
  //      z-[9999]) can interact with our z-index ordering.
  //   2. `z-index: 2147483647` (max signed int32) is the absolute highest
  //      legal z-index – nothing can sit above it.
  //   3. The overlay does NOT use `backdrop-filter: blur()`. iOS Safari has
  //      a long-standing bug where backdrop-filter on a fullscreen-fixed
  //      element creates a GPU composite layer that lets sibling content
  //      paint behind the visible blur, ignoring z-index. Plain rgba dim
  //      is bulletproof.
  //   4. `translateZ(0)` on the dialog promotes it to its own GPU layer so
  //      iOS doesn't render it inside a parent's composite by mistake.
  const modal = open ? (
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ zIndex: 2147483647, isolation: 'isolate' }}
    >
      <div
        className="absolute inset-0 bg-black/80"
        onClick={cancel}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        className="relative w-full max-w-sm bg-[#10141f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        style={{ transform: 'translateZ(0)' }}
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
  ) : null;

  return (
    <Ctx.Provider value={value}>
      {children}
      {portalReady && modal ? createPortal(modal, document.body) : null}
    </Ctx.Provider>
  );
}
