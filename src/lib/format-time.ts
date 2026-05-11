/**
 * Centralised date/time formatters. Every screen in the app should display
 * times via these helpers (or the <Time> wrapper component) so a single
 * user timezone preference applies everywhere.
 *
 * Design notes:
 * - All formatters are PURE and SSR-safe. They accept an optional `tz`
 *   parameter; when omitted they fall back to UTC on the server and to the
 *   user's preferred zone in the browser. This is intentionally an opt-in
 *   resolution: a calling component that knows its TZ (e.g. via a hook)
 *   should pass it explicitly to keep server/client renders consistent.
 * - We use `Intl.DateTimeFormat` directly rather than `toLocaleString` to
 *   guarantee the timeZone option is honoured (some older runtimes silently
 *   ignored it on the Date prototype methods).
 * - All `Date` inputs that come from the API as strings should be parsed
 *   ONCE at the boundary; these helpers expect a real Date.
 */

import { getUserTimezone } from './timezone';

/** Resolve the timezone to use right now. SSR-safe. */
function resolveTz(tz?: string): string {
  if (tz) return tz;
  return getUserTimezone();
}

// ---------------------------------------------------------------------------
// Date / time formatters
// ---------------------------------------------------------------------------

/** "Jun 11" — short month + day, no year. */
export function formatDateShort(date: Date, tz?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTz(tz),
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/** "Wed, Jun 11" — short weekday + month + day, no year. */
export function formatDateWithWeekday(date: Date, tz?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTz(tz),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/** "Wednesday, June 11, 2026" — long form for headers. */
export function formatDateLong(date: Date, tz?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTz(tz),
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/** "7:00 PM" — 12-hour clock, locale-independent. */
export function formatTime(date: Date, tz?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTz(tz),
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * "Jun 11 · 7:00 PM" — combined short date + time. Used in the deadline tile
 * and the dashboard "next match" card.
 */
export function formatDateTime(date: Date, tz?: string): string {
  const t = resolveTz(tz);
  return `${formatDateShort(date, t)} · ${formatTime(date, t)}`;
}

/**
 * "Wed Jun 11 · 7:00 PM EDT" — full timestamp with TZ abbreviation. Used on
 * fixture detail rows where we want users to see the resolved zone.
 */
export function formatDateTimeWithZone(date: Date, tz?: string): string {
  const t = resolveTz(tz);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: t,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(date);
}

/**
 * "Jun 11, 2026, 2:34 PM" — for audit logs and admin tables where the
 * full year matters. Mirrors what most admin pages already do.
 */
export function formatAdminTimestamp(date: Date, tz?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTz(tz),
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

// ---------------------------------------------------------------------------
// Countdown / relative helpers (TZ-independent — they operate on durations)
// ---------------------------------------------------------------------------

/**
 * Decompose a positive millisecond duration into d/h/m/s. Returns zeros for
 * negative inputs so callers can render a "locked" state without branching.
 */
export interface CountdownParts {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
}

export function decomposeDuration(ms: number): CountdownParts {
  const isPast = ms <= 0;
  const safe = Math.max(0, ms);
  return {
    totalMs: safe,
    days: Math.floor(safe / 86_400_000),
    hours: Math.floor((safe / 3_600_000) % 24),
    minutes: Math.floor((safe / 60_000) % 60),
    seconds: Math.floor((safe / 1_000) % 60),
    isPast,
  };
}

/**
 * "in 30d 22h", "in 5h 12m", "in 3m". Used as a hint subtitle next to a
 * future kickoff or deadline. Returns `pastLabel` (default "Locked") for
 * dates that have already passed.
 */
export function formatCountdown(
  targetMs: number,
  nowMs: number = Date.now(),
  pastLabel = 'Locked',
): string {
  const { days, hours, minutes, isPast } = decomposeDuration(targetMs - nowMs);
  if (isPast) return pastLabel;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}

/**
 * "30d 22h" — same as formatCountdown but without the leading "in " and
 * with no past-label option. Useful inside stat cards where the surrounding
 * UI already conveys that it's a countdown.
 */
export function formatDuration(targetMs: number, nowMs: number = Date.now()): string {
  const { days, hours, minutes, isPast } = decomposeDuration(targetMs - nowMs);
  if (isPast) return '—';
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Relative past timestamps: "5m ago", "3h ago", "2d ago". For older dates
 * we hand back a formatted date instead of a runaway day count.
 */
export function formatRelativePast(date: Date, nowMs: number = Date.now(), tz?: string): string {
  const diffMs = nowMs - date.getTime();
  if (diffMs < 0) return formatDateTime(date, tz);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateShort(date, tz);
}

// ---------------------------------------------------------------------------
// Domain helpers
// ---------------------------------------------------------------------------

/**
 * Squad/transfer deadline = 1 hour before kickoff. Centralised so we can
 * change the rule in one place if the league ever revises it.
 */
export const DEADLINE_OFFSET_MS = 60 * 60 * 1000;

/** Compute the deadline Date for a given kickoff. */
export function deadlineFor(kickoff: Date): Date {
  return new Date(kickoff.getTime() - DEADLINE_OFFSET_MS);
}

/**
 * The static WORLD_CUP_FIXTURES table stores `date: '2026-06-11'` and
 * `time: '20:00'` without any zone info. The original UI labelled these as
 * "EST", so we treat the source as US Eastern Time. June–July 2026 falls
 * entirely within DST so the effective offset is UTC-4 (EDT) for every
 * match — hard-coding it is correct for the tournament window and avoids
 * pulling in a tz database.
 *
 * If we ever need to support matches outside the DST window we'll have to
 * switch to a proper IANA → offset resolution (e.g. via Intl).
 */
const FIXTURE_SOURCE_OFFSET = '-04:00';

/**
 * Combine a fixture date + time pair into a real Date instant, interpreting
 * the input as US Eastern Time. After this point everything is in absolute
 * UTC and the user's chosen display zone can render it correctly.
 */
export function parseFixtureDateTime(dateStr: string, timeStr: string): Date {
  // Pad seconds so Safari accepts the ISO string ("HH:MM" alone is fine in
  // modern engines but the explicit ":00" suffix is cheap insurance).
  return new Date(`${dateStr}T${timeStr}:00${FIXTURE_SOURCE_OFFSET}`);
}
