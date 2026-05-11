'use client';

import { useEffect, useMemo, useState } from 'react';
import { Globe, X, Check, Search, RotateCcw } from 'lucide-react';
import {
  COMMON_TIMEZONES,
  TimezoneOption,
  detectSystemTimezone,
  isValidTimezone,
  setUserTimezone,
} from '@/lib/timezone';
import { useUserTimezone } from '@/hooks/useTimezone';

/**
 * Full-width settings card variant for the /settings page. Shows the current
 * zone in plain English, badge for auto vs manual, and a "Change" button.
 */
export function TimezoneSettingCard() {
  const { timezone, abbreviation, hasOverride, systemTimezone } = useUserTimezone();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center">
          <Globe className="w-5 h-5 text-surface-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-surface-400">Timezone</p>
          <p className="text-laliga-cream truncate">
            {timezone}{' '}
            <span className="text-surface-500 text-sm">({abbreviation})</span>
          </p>
          <p className="text-xs text-surface-500 mt-0.5">
            {hasOverride
              ? `Manually set — system is ${systemTimezone}`
              : 'Auto-detected from your device'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
          {hasOverride && (
            <button
              type="button"
              onClick={() => setUserTimezone(null)}
              className="text-xs text-surface-400 hover:text-surface-200 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-surface-800 transition-colors"
              title="Revert to auto-detect"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Auto
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            Change
          </button>
        </div>
      </div>
      {open && <TimezonePickerModal currentTz={timezone} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Small inline button + modal for changing the timezone. Designed to be
 * dropped into page headers (fixtures, squad, transfers, dashboard).
 *
 * Shape: "Times in EDT · change". Tapping the link opens the picker.
 * The picker shows:
 *  - "Auto-detect (currently EDT)" as the default option
 *  - The COMMON_TIMEZONES list grouped by region
 *  - A search box for users who want a zone we didn't pre-list (we still
 *    only allow IANA ids that the runtime can format; anything else is
 *    rejected so we never persist garbage).
 */
export function TimezoneIndicator({ className = '' }: { className?: string }) {
  const { timezone, abbreviation, hasOverride } = useUserTimezone();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-200 transition-colors ${className}`}
        title="Change timezone"
      >
        <Globe className="w-3.5 h-3.5" />
        <span>
          Times in <span className="text-surface-200 font-medium">{abbreviation}</span>
          {!hasOverride && <span className="text-surface-500"> · auto</span>}
        </span>
        <span className="underline decoration-dotted decoration-surface-600 underline-offset-2">
          change
        </span>
      </button>
      {open && <TimezonePickerModal currentTz={timezone} onClose={() => setOpen(false)} />}
    </>
  );
}

interface TimezonePickerModalProps {
  currentTz: string;
  onClose: () => void;
}

function TimezonePickerModal({ currentTz, onClose }: TimezonePickerModalProps) {
  const [query, setQuery] = useState('');
  const [customError, setCustomError] = useState('');
  const systemTz = useMemo(() => detectSystemTimezone(), []);

  // Close on Escape — matches the app-wide modal behaviour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Lock body scroll while modal is open (same trick used elsewhere).
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const filtered = useMemo<TimezoneOption[]>(() => {
    if (!query.trim()) return COMMON_TIMEZONES.slice();
    const q = query.toLowerCase();
    return COMMON_TIMEZONES.filter(
      (tz) => tz.label.toLowerCase().includes(q) || tz.id.toLowerCase().includes(q),
    );
  }, [query]);

  const grouped = useMemo(() => {
    const groups: Record<string, TimezoneOption[]> = {};
    for (const tz of filtered) {
      (groups[tz.region] ||= []).push(tz);
    }
    return groups;
  }, [filtered]);

  const choose = (tz: string | null) => {
    if (tz === null) {
      setUserTimezone(null);
      onClose();
      return;
    }
    if (!isValidTimezone(tz)) {
      setCustomError(`"${tz}" isn't a valid timezone. Try a name like Europe/Madrid.`);
      return;
    }
    setUserTimezone(tz);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-md card p-6 animate-scale-in max-h-[85vh] flex flex-col rounded-b-none sm:rounded-2xl"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-surface-800"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-surface-400" />
        </button>

        <h2 className="font-display text-2xl text-laliga-cream mb-1">CHOOSE TIMEZONE</h2>
        <p className="text-surface-400 text-sm mb-4">
          All kickoffs, deadlines and countdowns will use this zone.
        </p>

        {/* Auto-detect row — also acts as "clear override" */}
        <button
          type="button"
          onClick={() => choose(null)}
          className="flex items-center justify-between gap-3 p-3 mb-3 rounded-xl bg-surface-800/60 hover:bg-surface-800 border border-surface-700 transition-colors"
        >
          <div className="text-left">
            <div className="text-sm font-semibold text-laliga-cream">Auto-detect</div>
            <div className="text-xs text-surface-400">Currently: {systemTz}</div>
          </div>
          {currentTz === systemTz && <Check className="w-4 h-4 text-emerald-400" />}
        </button>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCustomError('');
            }}
            placeholder="Search a city or zone..."
            className="input-field pl-10 text-sm"
          />
        </div>

        {/* Zone list */}
        <div className="overflow-y-auto flex-1 -mx-2 px-2">
          {Object.keys(grouped).length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-surface-400 mb-3">
                No common zones match &ldquo;{query}&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => choose(query.trim())}
                className="btn-secondary text-xs px-3 py-1.5"
              >
                Use &ldquo;{query.trim()}&rdquo; as-is
              </button>
              {customError && (
                <p className="text-xs text-laliga-red mt-3">{customError}</p>
              )}
            </div>
          ) : (
            Object.entries(grouped).map(([region, list]) => (
              <div key={region} className="mb-4">
                <div className="text-xs uppercase tracking-wider text-surface-500 mb-1.5 px-1">
                  {region}
                </div>
                <div className="space-y-1">
                  {list.map((tz) => (
                    <button
                      key={tz.id}
                      type="button"
                      onClick={() => choose(tz.id)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        currentTz === tz.id
                          ? 'bg-laliga-gold/10 border border-laliga-gold/30 text-laliga-cream'
                          : 'bg-surface-900 hover:bg-surface-800 border border-transparent text-surface-200'
                      }`}
                    >
                      <span className="text-left truncate">{tz.label}</span>
                      {currentTz === tz.id && (
                        <Check className="w-4 h-4 text-laliga-gold flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
