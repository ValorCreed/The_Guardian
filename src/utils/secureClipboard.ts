import { AppState, AppStateStatus } from 'react-native';
import * as Clipboard from 'expo-clipboard';

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
     * This prevents The Guardian from deleting something else the user copied later.
     */
    if (currentClipboardValue === sensitiveValue) {
      await Clipboard.setStringAsync('');
      lastSensitiveValue = '';
      lastCopiedAt = 0;
      return true;
    }
  } catch {
    /*
     * Some platforms/dev builds can fail on getStringAsync(). In that case, clear
     * defensively only if we still have a known sensitive value pending.
     */
    try {
      await Clipboard.setStringAsync('');
      lastSensitiveValue = '';
      lastCopiedAt = 0;
      return true;
    } catch {
      // Clipboard clearing must never crash the app.
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
    clearClipboardIfStillSensitive();
  }, delayMs);
}

function ensureClipboardLifecycleWatcher() {
  if (appStateSubscription) return;

  appStateSubscription = AppState.addEventListener('change', async nextState => {
    const previousState = currentAppState;
    currentAppState = nextState;

    if (!lastSensitiveValue || !lastCopiedAt) return;

    const ageMs = Date.now() - lastCopiedAt;

    /*
     * When the app returns from background, JS timers may have been paused.
     * If the clear time already passed while the app was inactive, clear now.
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

    /*
     * Keep the timer accurate after app-state changes while the app is still alive.
     */
    if (nextState === 'active') {
      scheduleClipboardClear();
    }
  });
}

export async function setSecureClipboard(value: string, options?: { clearAfterMs?: number }) {
  const text = normalizeClipboardValue(value);

  if (!text) return;

  ensureClipboardLifecycleWatcher();

  clearAfterMs = options?.clearAfterMs ?? DEFAULT_CLEAR_AFTER_MS;
  lastSensitiveValue = text;
  lastCopiedAt = Date.now();

  await Clipboard.setStringAsync(text);
  scheduleClipboardClear();
}

export async function clearSensitiveClipboardNow() {
  clearPendingTimer();
  await clearClipboardIfStillSensitive();
}

export function getSecureClipboardMessage(label: string) {
  return `${label} copied. For your safety, the clipboard will clear in 30 seconds.`;
}
