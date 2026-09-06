import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const standardHeaders = true;
const legacyHeaders = false;

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders,
  legacyHeaders,
  skip: () => env.NODE_ENV === 'test',
  message: { message: 'Too many authentication attempts. Try again in a few minutes.', code: 'RATE_LIMITED' },
});

export const codeLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders,
  legacyHeaders,
  skip: () => env.NODE_ENV === 'test',
  message: { message: 'Too many code verification attempts. Try again in a few minutes.', code: 'RATE_LIMITED' },
});

export const globalLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 600,
  standardHeaders,
  legacyHeaders,
  skip: () => env.NODE_ENV === 'test',
  message: { message: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
});