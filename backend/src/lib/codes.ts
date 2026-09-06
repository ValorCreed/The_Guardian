import { randomInt } from 'node:crypto';

/** Generate a cryptographically random 6-digit code, e.g. for email verification. */
export function generateSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Format a 9-digit emergency access code.
 */
export function generateNineDigitCode(): string {
  return String(randomInt(0, 1_000_000_000)).padStart(9, '0');
}

/** Timing-safe string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Random URL-safe token used for credential tokens, recovery circle public ids etc. */
export function randomToken(bytes = 32): string {
  return require('crypto').randomBytes(bytes).toString('base64url');
}