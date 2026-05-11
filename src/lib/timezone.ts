/**
 * Single source of truth for the user's effective timezone.
 *
 * Precedence:
 *   1. Manual override stored in localStorage under TZ_KEY.
 *   2. Browser/host detection via Intl.DateTimeFormat().resolvedOptions().timeZone.
 *   3. Hard fallback of 'UTC' (only hit in obscure environments).
 *
 * Notes on SSR / hydration:
 * - Functions that touch localStorage / Intl are safe to import on the
 *   server but return the FALLBACK_TZ when window is undefined. Components
 *   that show time should call getUserTimezone() inside useEffect (and store
 *   it in state) to avoid hydration mismatches.
 */

export const TZ_KEY = 'fwc:tz';
export const FALLBACK_TZ = 'UTC';

/**
 * A curated list of common timezones for the picker UI. Ordered by rough
 * Western-hemisphere → Eastern-hemisphere flow so users in the Americas
 * find theirs near the top.
 */
export interface TimezoneOption {
  /** IANA tz id, e.g. "America/New_York". */
  id: string;
  /** Display label, e.g. "New York (EST/EDT)". */
  label: string;
  /** Coarse region grouping for the picker UI. */
  region: 'Americas' | 'Europe' | 'Africa' | 'Asia' | 'Oceania';
}

export const COMMON_TIMEZONES: readonly TimezoneOption[] = [
  // Americas
  { id: 'America/Los_Angeles', label: 'Los Angeles (PT)', region: 'Americas' },
  { id: 'America/Denver', label: 'Denver (MT)', region: 'Americas' },
  { id: 'America/Chicago', label: 'Chicago (CT)', region: 'Americas' },
  { id: 'America/New_York', label: 'New York (ET)', region: 'Americas' },
  { id: 'America/Toronto', label: 'Toronto (ET)', region: 'Americas' },
  { id: 'America/Mexico_City', label: 'Mexico City (CT)', region: 'Americas' },
  { id: 'America/Sao_Paulo', label: 'São Paulo (BRT)', region: 'Americas' },
  { id: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (ART)', region: 'Americas' },

  // Europe & Africa
  { id: 'Europe/London', label: 'London (GMT/BST)', region: 'Europe' },
  { id: 'Europe/Madrid', label: 'Madrid (CET/CEST)', region: 'Europe' },
  { id: 'Europe/Paris', label: 'Paris (CET/CEST)', region: 'Europe' },
  { id: 'Europe/Berlin', label: 'Berlin (CET/CEST)', region: 'Europe' },
  { id: 'Europe/Rome', label: 'Rome (CET/CEST)', region: 'Europe' },
  { id: 'Europe/Athens', label: 'Athens (EET/EEST)', region: 'Europe' },
  { id: 'Europe/Istanbul', label: 'Istanbul (TRT)', region: 'Europe' },
  { id: 'Africa/Cairo', label: 'Cairo (EET)', region: 'Africa' },
  { id: 'Africa/Lagos', label: 'Lagos (WAT)', region: 'Africa' },
  { id: 'Africa/Johannesburg', label: 'Johannesburg (SAST)', region: 'Africa' },

  // Asia & Oceania
  { id: 'Asia/Dubai', label: 'Dubai (GST)', region: 'Asia' },
  { id: 'Asia/Riyadh', label: 'Riyadh (AST)', region: 'Asia' },
  { id: 'Asia/Karachi', label: 'Karachi (PKT)', region: 'Asia' },
  { id: 'Asia/Kolkata', label: 'Mumbai/Delhi (IST)', region: 'Asia' },
  { id: 'Asia/Singapore', label: 'Singapore (SGT)', region: 'Asia' },
  { id: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)', region: 'Asia' },
  { id: 'Asia/Tokyo', label: 'Tokyo (JST)', region: 'Asia' },
  { id: 'Asia/Seoul', label: 'Seoul (KST)', region: 'Asia' },
  { id: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)', region: 'Oceania' },
  { id: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)', region: 'Oceania' },
];

/**
 * True iff the current environment is the browser. We can't trust
 * `typeof window` alone on the server because some bundlers shim it, so
 * also verify localStorage is a real object.
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** Auto-detect the system timezone without consulting any override. */
export function detectSystemTimezone(): string {
  if (!isBrowser()) return FALLBACK_TZ;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.length > 0 ? tz : FALLBACK_TZ;
  } catch {
    return FALLBACK_TZ;
  }
}

/**
 * Validate that an IANA tz string is recognised by the runtime. We test by
 * trying to format a date in that zone — anything unknown throws.
 */
export function isValidTimezone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * The user's effective timezone right now. Reads override first, then falls
 * back to system detection. Always safe to call.
 */
export function getUserTimezone(): string {
  if (!isBrowser()) return FALLBACK_TZ;
  try {
    const override = window.localStorage.getItem(TZ_KEY);
    if (override && isValidTimezone(override)) return override;
  } catch {
    // localStorage can throw in private mode / sandboxed iframes — fall through.
  }
  return detectSystemTimezone();
}

/**
 * Persist a manual override. Pass null to clear the override and revert to
 * system detection. Returns true iff the value was accepted.
 */
export function setUserTimezone(tz: string | null): boolean {
  if (!isBrowser()) return false;
  try {
    if (tz === null) {
      window.localStorage.removeItem(TZ_KEY);
      // Notify listeners (e.g. <Time> components) that timezone changed.
      window.dispatchEvent(new CustomEvent('fwc:tz-change', { detail: { tz: detectSystemTimezone() } }));
      return true;
    }
    if (!isValidTimezone(tz)) return false;
    window.localStorage.setItem(TZ_KEY, tz);
    window.dispatchEvent(new CustomEvent('fwc:tz-change', { detail: { tz } }));
    return true;
  } catch {
    return false;
  }
}

/** Has the user explicitly chosen a timezone? Useful to dim the "auto" label. */
export function hasManualTimezone(): boolean {
  if (!isBrowser()) return false;
  try {
    const override = window.localStorage.getItem(TZ_KEY);
    return Boolean(override && isValidTimezone(override));
  } catch {
    return false;
  }
}

/**
 * Friendly short abbreviation for a timezone at a given moment, e.g. "EST",
 * "BST". Falls back to the offset (e.g. "GMT-5") when the runtime won't
 * give us a name.
 */
export function getTimezoneAbbreviation(tz: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(at);
    return parts.find((p) => p.type === 'timeZoneName')?.value || tz;
  } catch {
    return tz;
  }
}
