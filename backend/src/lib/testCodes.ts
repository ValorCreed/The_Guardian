import { env } from '../config/env';

const store = new Map<string, string>();

/**
 * Test-only store that keeps verification codes readable so integration tests
 * can complete email-code flows. It is only populated when NODE_ENV === 'test'
 * and never in production.
 */
export function recordTestCode(email: string, code: string): void {
  if (env.NODE_ENV === 'test') {
    store.set(email.toLowerCase(), code);
  }
}

export function getTestCode(email: string): string | undefined {
  return store.get(email.toLowerCase());
}

export function clearTestCodes(): void {
  store.clear();
}