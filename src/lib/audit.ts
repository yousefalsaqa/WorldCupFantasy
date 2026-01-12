// ============================================
// AUDIT LOGGING - Track important actions
// ============================================

import { prisma } from './db';

export type AuditAction = 
  | 'USER_REGISTER'
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'USER_LOGIN_FAILED'
  | 'TEAM_CREATED'
  | 'SQUAD_UPDATED'
  | 'TRANSFER_MADE'
  | 'CHIP_ACTIVATED'
  | 'CHIP_DEACTIVATED'
  | 'LEAGUE_CREATED'
  | 'LEAGUE_JOINED'
  | 'ADMIN_ACTION'
  | 'SECURITY_ALERT';

export interface AuditDetails {
  [key: string]: unknown;
}

/**
 * Log an audit event
 */
export async function logAudit(
  action: AuditAction,
  details: AuditDetails,
  userId?: string,
  ipAddress?: string
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        details: JSON.stringify(details),
        ipAddress,
      },
    });
  } catch (error) {
    // Don't let audit failures break the app
    console.error('Audit log failed:', error);
  }
}

/**
 * Log a security alert (failed login attempts, suspicious activity)
 */
export async function logSecurityAlert(
  message: string,
  details: AuditDetails,
  ipAddress?: string
): Promise<void> {
  await logAudit('SECURITY_ALERT', { message, ...details }, undefined, ipAddress);
}

/**
 * Get recent audit logs for a user
 */
export async function getUserAuditLogs(
  userId: string,
  limit: number = 50
) {
  return prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Get recent security alerts (admin only)
 */
export async function getSecurityAlerts(limit: number = 100) {
  return prisma.auditLog.findMany({
    where: { action: 'SECURITY_ALERT' },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}


