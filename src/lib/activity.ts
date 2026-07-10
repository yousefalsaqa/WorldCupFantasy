// ============================================
// ACTIVITY EVENTS — fine-grained, read-oriented tracking
// Distinct from audit.ts's AuditLog, which covers successful mutations.
// This covers views + attempts (including failed ones) that AuditLog never
// sees. See prisma/schema.prisma's ActivityEvent doc comment.
// ============================================

import { prisma } from './db';

export type ActivityType =
  | 'VIEW_OWN_SQUAD'
  | 'VIEW_TEAM'
  | 'VIEW_LEAGUE'
  | 'VIEW_LEAGUES_LIST'
  | 'TRANSFER_ATTEMPT';

export interface ActivityDetails {
  [key: string]: unknown;
}

/**
 * Log an activity event. Never throws — callers can fire this without
 * awaiting (the common case, for view-tracking on hot GET routes) or await
 * it when they want the write to land before responding.
 */
export async function logActivity(
  userId: string,
  type: ActivityType,
  details?: ActivityDetails,
): Promise<void> {
  try {
    await prisma.activityEvent.create({
      data: {
        userId,
        type,
        details: details ? JSON.stringify(details) : null,
      },
    });
  } catch (error) {
    console.error('Activity log failed:', error);
  }
}

/**
 * Combined, time-ordered activity for a user: real mutations (AuditLog) +
 * views/attempts (ActivityEvent). Used by scripts/user-activity-timeline.ts
 * — the single place to look when asked "what has this user actually done."
 */
export async function getUserActivityTimeline(userId: string, limit = 100) {
  const [auditLogs, activityEvents] = await Promise.all([
    prisma.auditLog.findMany({
      where: { userId },
      select: { action: true, details: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.activityEvent.findMany({
      where: { userId },
      select: { type: true, details: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  ]);

  const combined = [
    ...auditLogs.map((l) => ({ source: 'audit' as const, action: l.action, details: l.details, createdAt: l.createdAt })),
    ...activityEvents.map((e) => ({ source: 'activity' as const, action: e.type, details: e.details, createdAt: e.createdAt })),
  ];
  combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return combined.slice(0, limit);
}
