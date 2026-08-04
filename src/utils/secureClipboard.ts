import { AppState, AppStateStatus } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import {
  AppOperationError,
  safeLogError,
  toAppOperationError,
} from './asyncResilience';

const DEFAULT_CLEAR_AFTER_MS = 30_000;

let clearTimer: ReturnType<typeof setTimeout> | null = null;
let lastSensitiveValue = '';
let lastCopiedAt = 0;
let clearAfterMs = DEFAULT_CLEAR_AFTER_MS;
let appStateSubscription: { remove: () => void } | null = null;
let currentAppState: AppStateStatus = AppState.currentState;

const normalizeClipboardValue = (value: string) => String(value || '');

async function clearClipboardIfStillSensitive() {
  const sensitiveValue = lastSensitiveValue;

  if (!sensitiveValue) return false;

  try {
    const currentClipboardValue = await Clipboard.getStringAsync();

    /*
     * Only clear if the clipboard still contains the sensitive value we copied.
     * This prevents The Guardian from deleting something else copied later.
     */
    if (currentClipboardValue === sensitiveValue) {
      await Clipboard.setStringAsync('');
      lastSensitiveValue = '';
      lastCopiedAt = 0;
      return true;
    }
  } catch (readError) {
    safeLogError('SECURE_CLIPBOARD_READ', readError);

    /*
     * Some platforms can fail on getStringAsync(). Clear defensively only while
     * a known sensitive value is pending.
     */
    try {
      await Clipboard.setStringAsync('');
      lastSensitiveValue = '';
      lastCopiedAt = 0;
      return true;
    } catch (clearError) {
      safeLogError('SECURE_CLIPBOARD_CLEAR', clearError);
    }
  }

  return false;
}

function clearPendingTimer() {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
}

function scheduleClipboardClear() {
  clearPendingTimer();

  const copiedAt = lastCopiedAt;
  const delayMs = Math.max(0, clearAfterMs - (Date.now() - copiedAt));

  clearTimer = setTimeout(() => {
    void clearClipboardIfStillSensitive().catch((error) =>
      safeLogError('SECURE_CLIPBOARD_TIMER', error)
    );
  }, delayMs);
}

function ensureClipboardLifecycleWatcher() {
  if (appStateSubscription) return;

  appStateSubscription = AppState.addEventListener('change', (nextState) => {
    void (async () => {
      try {
        const previousState = currentAppState;
        currentAppState = nextState;

        if (!lastSensitiveValue || !lastCopiedAt) return;

        const ageMs = Date.now() - lastCopiedAt;

        /*
         * JS timers may pause in the background. Clear immediately after resume
         * when the configured lifetime has already elapsed.
         */
        if (
          previousState.match(/inactive|background/) &&
          nextState === 'active' &&
          ageMs >= clearAfterMs
        ) {
          clearPendingTimer();
          await clearClipboardIfStillSensitive();
          return;
        }

        if (nextState === 'active') {
          scheduleClipboardClear();
        }
      } catch (error) {
        safeLogError('SECURE_CLIPBOARD_LIFECYCLE', error);
      }
    })();
  });
}

export async function setSecureClipboard(
  value: string,
  options?: { clearAfterMs?: number }
) {
  const text = normalizeClipboardValue(value);

  if (!text) {
    throw new AppOperationError('There is nothing to copy.', {
      code: 'UNKNOWN_ERROR',
    });
  }

  try {
    ensureClipboardLifecycleWatcher();

    clearAfterMs = Math.max(
      1_000,
      Math.min(options?.clearAfterMs ?? DEFAULT_CLEAR_AFTER_MS, 120_000)
    );
    await Clipboard.setStringAsync(text);

    // Commit the in-memory marker only after the platform confirms the copy.
    lastSensitiveValue = text;
    lastCopiedAt = Date.now();
    scheduleClipboardClear();
  } catch (error) {
    safeLogError('SECURE_CLIPBOARD_COPY', error);
    throw toAppOperationError(error, 'Could not copy this value.');
  }
}

export async function clearSensitiveClipboardNow() {
  clearPendingTimer();

  try {
    await clearClipboardIfStillSensitive();
  } catch (error) {
    safeLogError('SECURE_CLIPBOARD_CLEAR_NOW', error);
  }
}

export function getSecureClipboardMessage(label: string) {
  return `${label} copied. The clipboard will clear in 30 seconds.`;
}
