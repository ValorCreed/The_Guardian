import AsyncStorage from '@react-native-async-storage/async-storage';

export const SECURITY_SCORE_NEEDS_SYNC_KEY = 'securityScoreNeedsInitialSync';
export const SECURITY_BACKUP_SNAPSHOT_PREFIX =
  'theguardian.security.backup.snapshot.v1';
export const SECURITY_LAST_BACKUP_INVALIDATING_CHANGE_KEY =
  'theguardian.security.last-backup-invalidating-change.v1';

const BACKUP_INVALIDATING_REASONS = new Set([
  'vault-password',
  'vault-item',
  'family-sharing',
]);

export type SecurityScoreChangeReason =
  | 'vault-password'
  | 'vault-item'
  | 'email-verification'
  | 'two-factor'
  | 'recovery-kit'
  | 'backup'
  | 'family-sharing'
  | 'subscription'
  | 'account-security'
  | string;

export type SecurityScoreChangeEvent = {
  reason: SecurityScoreChangeReason;
  changedAt: number;
  version: number;
};

type SecurityScoreChangeListener = (
  event: SecurityScoreChangeEvent
) => void;

type IdleTaskOptions = {
  delayMs?: number;
  timeoutMs?: number;
};

export type IdleTaskHandle = {
  cancel: () => void;
};

const listeners = new Set<SecurityScoreChangeListener>();

let eventVersion = 0;
let pendingEvent: SecurityScoreChangeEvent | null = null;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let pendingIdleTask: IdleTaskHandle | null = null;

/**
 * Schedules non-urgent work with requestIdleCallback so route transitions and
 * gesture animations get the main thread first. A short timer fallback keeps
 * the helper compatible with runtimes that do not expose requestIdleCallback.
 */
export function scheduleIdleTask(
  callback: () => void,
  options: IdleTaskOptions = {}
): IdleTaskHandle {
  const delayMs = Math.max(0, Number(options.delayMs || 0));
  const timeoutMs = Math.max(250, Number(options.timeoutMs || 1200));

  let cancelled = false;
  let completed = false;
  let delayTimer: ReturnType<typeof setTimeout> | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let idleHandle: any = null;

  const cancelIdleHandle = () => {
    if (idleHandle === null) return;

    const cancelIdleCallbackFn = (globalThis as any).cancelIdleCallback;

    if (typeof cancelIdleCallbackFn === 'function') {
      cancelIdleCallbackFn(idleHandle);
    } else {
      clearTimeout(idleHandle);
    }

    idleHandle = null;
  };

  const finish = () => {
    if (cancelled || completed) return;

    completed = true;

    if (delayTimer) {
      clearTimeout(delayTimer);
      delayTimer = null;
    }

    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }

    cancelIdleHandle();
    callback();
  };

  const requestIdleWork = () => {
    if (cancelled || completed) return;

    const requestIdleCallbackFn = (globalThis as any).requestIdleCallback;

    if (typeof requestIdleCallbackFn === 'function') {
      idleHandle = requestIdleCallbackFn(finish, { timeout: timeoutMs });

      /*
       * Some development runtimes expose a partial requestIdleCallback
       * implementation. Keep a fallback so background score updates cannot be
       * starved by continuous decorative animations.
       */
      fallbackTimer = setTimeout(finish, timeoutMs + 80);
      return;
    }

    idleHandle = setTimeout(finish, 16);
  };

  delayTimer = setTimeout(requestIdleWork, delayMs);

  return {
    cancel: () => {
      if (cancelled || completed) return;

      cancelled = true;

      if (delayTimer) {
        clearTimeout(delayTimer);
        delayTimer = null;
      }

      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }

      cancelIdleHandle();
    },
  };
}

/**
 * Marks the cached security score as stale and notifies every mounted
 * useSecurityScore hook. Multiple mutations that happen almost together are
 * collapsed into one notification to avoid duplicate scans.
 */
export function markSecurityScoreDirty(
  reason: SecurityScoreChangeReason = 'account-security'
) {
  const changedAt = Date.now();
  void (async () => {
    const writes: [string, string][] = [
      [SECURITY_SCORE_NEEDS_SYNC_KEY, 'true'],
    ];

    if (BACKUP_INVALIDATING_REASONS.has(String(reason))) {
      const email = String(
        (await AsyncStorage.getItem('userEmail').catch(() => null)) ||
          'anonymous'
      )
        .trim()
        .toLowerCase();

      writes.push([
        `${SECURITY_LAST_BACKUP_INVALIDATING_CHANGE_KEY}:${email}`,
        String(changedAt),
      ]);
    }

    await AsyncStorage.multiSet(writes);
  })().catch(() => undefined);

  eventVersion += 1;
  pendingEvent = {
    reason,
    changedAt,
    version: eventVersion,
  };

  if (notifyTimer) {
    clearTimeout(notifyTimer);
  }

  pendingIdleTask?.cancel();
  pendingIdleTask = null;

  notifyTimer = setTimeout(() => {
    notifyTimer = null;

    /*
     * Vault mutations commonly navigate back to Home. Delay the expensive
     * score scan until the Home entrance and score-ring focus animation have
     * had time to begin smoothly.
     */
    pendingIdleTask = scheduleIdleTask(
      () => {
        pendingIdleTask = null;

        const event = pendingEvent;
        pendingEvent = null;

        if (!event) return;

        listeners.forEach((listener) => {
          try {
            listener(event);
          } catch {
            // One listener must never prevent the remaining screens updating.
          }
        });
      },
      {
        delayMs: 900,
        timeoutMs: 1500,
      }
    );
  }, 90);
}

export function getSecurityScoreChangeVersion() {
  return eventVersion;
}

export function subscribeSecurityScoreChanges(
  listener: SecurityScoreChangeListener
) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}