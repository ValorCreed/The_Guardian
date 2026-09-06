import type { NextFunction, Request, Response } from 'express';
import { verifyUserToken } from '../lib/token';
import { query, row } from '../db/pool';
import { unauthorized } from '../lib/errors';

export interface AuthedRequest extends Request {
  userId?: number;
  sessionId?: string;
  sessionMode?: 'NORMAL' | 'DURESS';
  deviceId?: string | null;
  deviceName?: string | null;
  deviceType?: string | null;
}

const DEVICE_HEADER_MAX = 120;

function sanitizeHeader(value: string | undefined, max: number): string | null {
  if (!value) return null;
  const clean = value.trim().slice(0, max).replace(/[\u0000-\u001f]/g, '');
  return clean || null;
}

export function captureDeviceHeaders(req: AuthedRequest): void {
  req.deviceId = sanitizeHeader(req.header('X-Guardian-Device-Id'), DEVICE_HEADER_MAX);
  req.deviceName = sanitizeHeader(req.header('X-Guardian-Device-Name'), DEVICE_HEADER_MAX);
  req.deviceType = sanitizeHeader(req.header('X-Guardian-Device-Type'), DEVICE_HEADER_MAX);
}

export async function requireAuth(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  captureDeviceHeaders(req);

  const header = req.header('Authorization') ?? req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    next(unauthorized());
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(unauthorized());
    return;
  }

  let payload: { sub: string; sid: string; mode: 'NORMAL' | 'DURESS' };
  try {
    payload = verifyUserToken(token);
  } catch {
    next(unauthorized('Your session is invalid or has expired.'));
    return;
  }

  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    next(unauthorized());
    return;
  }

  const session = await row<{ id: string; user_id: number; mode: string; expires_at: Date }>(
    `SELECT s.id, s.user_id, s.mode, s.expires_at
       FROM sessions s
      WHERE s.id = $1 AND s.user_id = $2 AND s.expires_at > now() AND s.revoked_at IS NULL`,
    [payload.sid, userId]
  );

  if (!session) {
    next(unauthorized('Your session has been revoked. Please sign in again.'));
    return;
  }

  req.userId = userId;
  req.sessionId = payload.sid;
  req.sessionMode = payload.mode === 'DURESS' ? 'DURESS' : 'NORMAL';

  await query(
    `UPDATE sessions SET last_active_at = now() WHERE id = $1`,
    [session.id]
  );

  next();
}

/** Allow an optional "email query param" style parse reused by many routes. */

export function cleanEmail(v: string | undefined): string {
  return (v ?? '').trim().toLowerCase().replace(/\s+/g, '');
}