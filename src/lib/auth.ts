// ============================================
// FANTASY LA LIGA - AUTHENTICATION
// Secure JWT-based authentication system
// ============================================

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-for-dev-only'
);

const COOKIE_NAME = 'fantasy-laliga-session';
const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = '7d'; // 7 days

export interface JWTPayload {
  userId: string;
  email: string;
  username: string;
  isAdmin: boolean;
  iat: number;
  exp: number;
}

/**
 * Hash a password securely
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Create a JWT token
 */
export async function createToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Set the auth cookie securely
 */
export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,        // Not accessible via JavaScript
    secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
    sameSite: 'lax',       // CSRF protection
    maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
    path: '/',
  });
}

/**
 * Remove the auth cookie (logout)
 */
export async function removeAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Get the current session from cookies
 */
export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  
  if (!token) return null;
  
  return verifyToken(token);
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(): Promise<JWTPayload> {
  const session = await getSession();
  
  if (!session) {
    throw new Error('Unauthorized');
  }
  
  return session;
}

/**
 * Require admin authentication
 */
export async function requireAdmin(): Promise<JWTPayload> {
  const session = await requireAuth();
  
  if (!session.isAdmin) {
    throw new Error('Forbidden');
  }
  
  return session;
}

/**
 * Rate limiting helper - simple in-memory store
 * For production, use Redis or similar
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
): { allowed: boolean; remaining: number; resetAt: Date } {
  const now = Date.now();
  const record = rateLimitStore.get(key);
  
  if (!record || record.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1, resetAt: new Date(now + windowMs) };
  }
  
  if (record.count >= maxAttempts) {
    return { allowed: false, remaining: 0, resetAt: new Date(record.resetAt) };
  }
  
  record.count++;
  return { allowed: true, remaining: maxAttempts - record.count, resetAt: new Date(record.resetAt) };
}

/**
 * Clean up expired rate limit entries (call periodically)
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, record] of rateLimitStore) {
    if (record.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

// Clean up every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimits, 5 * 60 * 1000);
}



