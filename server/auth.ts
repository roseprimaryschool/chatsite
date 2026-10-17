import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import type { User, Session } from './types.js';

const SESSION_DURATION_DAYS = 30;

// In-memory sliding rate limiter: tracks action timestamps per key
interface RateLimitRecord {
  timestamps: number[];
}
const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Check if an action is allowed under the rate limit
 * @param key unique identifier (e.g. `ip:action` or `userId:action`)
 * @param limit max allowed actions in window
 * @param windowMs time window in milliseconds
 */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(key) || { timestamps: [] };
  // Prune timestamps outside window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);
  if (record.timestamps.length >= limit) {
    return true;
  }
  record.timestamps.push(now);
  rateLimitStore.set(key, record);
  return false;
}

// Clean up old rate limit records periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    record.timestamps = record.timestamps.filter((ts) => now - ts < 60000);
    if (record.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string, userAgent = ''): Promise<Session> {
  const token = crypto.randomBytes(32).toString('hex');
  const id = 'sess_' + crypto.randomUUID().slice(0, 8);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db.execute({
    sql: `INSERT INTO sessions (id, token, user_id, created_at, expires_at, user_agent)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, token, userId, now.toISOString(), expiresAt, userAgent.slice(0, 255)],
  });

  return {
    id,
    token,
    user_id: userId,
    created_at: now.toISOString(),
    expires_at: expiresAt,
    user_agent: userAgent,
  };
}

export async function getUserBySessionToken(token: string): Promise<User | null> {
  if (!token) return null;

  const result = await db.execute({
    sql: `SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.bio, u.custom_status,
                 u.role, u.is_banned, u.created_at, u.last_seen_at, s.expires_at
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          WHERE s.token = ?`,
    args: [token],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const expiresAt = new Date(row.expires_at as string);

  // Check if session expired
  if (expiresAt.getTime() < Date.now()) {
    await db.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] });
    return null;
  }

  // Update last seen
  const nowIso = new Date().toISOString();
  await db.execute({
    sql: 'UPDATE users SET last_seen_at = ? WHERE id = ?',
    args: [nowIso, row.id],
  });

  return {
    id: row.id as string,
    username: row.username as string,
    email: row.email as string,
    display_name: row.display_name as string,
    avatar_url: row.avatar_url as string,
    bio: (row.bio as string) || '',
    custom_status: (row.custom_status as string) || '',
    role: row.role as any,
    is_banned: Number(row.is_banned),
    created_at: row.created_at as string,
    last_seen_at: nowIso,
  };
}

export async function deleteSession(token: string): Promise<void> {
  await db.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] });
}

// Express Request augmentation
export interface AuthenticatedRequest extends Request {
  user?: User;
  token?: string;
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return next();
  }

  req.token = token;

  try {
    const user = await getUserBySessionToken(token);
    if (user) {
      if (user.is_banned) {
        res.status(403).json({ error: 'Your account has been banned due to violation of community terms.' });
        return;
      }
      req.user = user;
    }
  } catch (err) {
    console.error('Auth verification error:', err);
  }

  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  if (req.user.is_banned) {
    return res.status(403).json({ error: 'Your account has been suspended.' });
  }
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'moderator')) {
    return res.status(403).json({ error: 'Access restricted to administrators and moderators.' });
  }
  next();
}

export function sanitizeHtmlText(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
