import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface SignedPayload {
  sub: string;
  sid: string;
  mode: 'NORMAL' | 'DURESS';
  deviceId?: string | null;
}

export function signUserToken(payload: SignedPayload): string {
  return jwt.sign(
    { sid: payload.sid, mode: payload.mode, deviceId: payload.deviceId ?? undefined },
    env.JWT_SECRET,
    { subject: String(payload.sub), expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );
}

export function verifyUserToken(token: string): SignedPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as SignedPayload;
  if (!decoded.sub || !decoded.sid) {
    throw new Error('Malformed token.');
  }
  return {
    sub: decoded.sub,
    sid: decoded.sid,
    mode: decoded.mode === 'DURESS' ? 'DURESS' : 'NORMAL',
    deviceId: decoded.deviceId ?? null,
  };
}