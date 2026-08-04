import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, usePathname } from 'expo-router';

import { api } from '../services/api';
import { clearOfflineVaultMemoryCache } from '../services/offlineVault';
import { AppOperationError, safeLogError } from '../utils/asyncResilience';

export const AUTO_LOCK_ON_APP_CLOSE = -1;
export const AUTO_LOCK_MODE_ON_APP_CLOSE = 'app_close';
export const AUTO_LOCK_MODE_TIMEOUT = 'timeout';

export type AutoLockMode =
  | typeof AUTO_LOCK_MODE_ON_APP_CLOSE
  | typeof AUTO_LOCK_MODE_TIMEOUT;

export type AutoLockSettings = {
  mode: AutoLockMode;
  timeout: number;
};

const DEFAULT_TIMEOUT = 30000;
export const LAST_BACKGROUND_AT_KEY = 'lastBackgroundAt';
export const AUTO_LOCK_TIMEOUT_KEY = 'autoLockTimeout';

const AUTH_SCREENS = [
  '/',
  '/index',
  '/login',
  '/signin',
  '/signup',
  '/forgotpassword',
  '/resetpassword',
  '/verifyemail',
  '/twofactor',
  '/verification',
  '/accountrecovery',
];

const shouldUseAutoLock = (pathname: string) => {
  return !AUTH_SCREENS.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
};

const parseStoredTimeout = (savedTimeout: string | null) => {
  if (!savedTimeout) return DEFAULT_TIMEOUT;

  if (
    savedTimeout === AUTO_LOCK_MODE_ON_APP_CLOSE ||
    savedTimeout === String(AUTO_LOCK_ON_APP_CLOSE)
  ) {
    return AUTO_LOCK_ON_APP_CLOSE;
  }

  const timeout = Number(savedTimeout);

  if (!Number.isFinite(timeout) || timeout <= 0) {
    return DEFAULT_TIMEOUT;
  }

  return timeout;
};

export const getAutoLockTimeout = async () => {
  try {
    const savedTimeout = await AsyncStorage.getItem(AUTO_LOCK_TIMEOUT_KEY);
    return parseStoredTimeout(savedTimeout);
  } catch (error: unknown) {
    safeLogError('AUTO_LOCK_TIMEOUT_READ', error);
    return DEFAULT_TIMEOUT;
  }
};

export const setAutoLockTimeout = async (timeout: number) => {
  const value =
    timeout === AUTO_LOCK_ON_APP_CLOSE
      ? String(AUTO_LOCK_ON_APP_CLOSE)
      : String(timeout);

  try {
    await AsyncStorage.setItem(AUTO_LOCK_TIMEOUT_KEY, value);
  } catch (error: unknown) {
    safeLogError('AUTO_LOCK_TIMEOUT_SAVE', error);
    throw new AppOperationError('Auto-lock settings could not be saved.', {
      code: 'STORAGE_UNAVAILABLE',
    });
  }
};

export const getAutoLockSettings = async (): Promise<AutoLockSettings> => {
  const timeout = await getAutoLockTimeout();

  if (timeout === AUTO_LOCK_ON_APP_CLOSE) {
    return {
      mode: AUTO_LOCK_MODE_ON_APP_CLOSE,
      timeout: AUTO_LOCK_ON_APP_CLOSE,
    };
  }

  return {
    mode: AUTO_LOCK_MODE_TIMEOUT,
    timeout,
  };
};

export const setAutoLockSettings = async (settings: AutoLockSettings) => {
  if (settings.mode === AUTO_LOCK_MODE_ON_APP_CLOSE) {
    await setAutoLockTimeout(AUTO_LOCK_ON_APP_CLOSE);
    return;
  }

  const safeTimeout =
    Number.isFinite(settings.timeout) && settings.timeout > 0
      ? settings.timeout
      : DEFAULT_TIMEOUT;

  await setAutoLockTimeout(safeTimeout);
};

export const formatAutoLockTimeout = (timeout: number) => {
  if (timeout === AUTO_LOCK_ON_APP_CLOSE) return 'When app closes';
  if (timeout < 60000) return `${Math.round(timeout / 1000)} seconds`;
  if (timeout < 3600000) {
    return `${Math.round(timeout / 60000)} minute${timeout === 60000 ? '' : 's'}`;
  }

  return `${Math.round(timeout / 3600000)} hour${timeout === 3600000 ? '' : 's'}`;
};

export const formatAutoLockSetting = (
  modeOrTimeout: AutoLockMode | number,
  timeout?: number
) => {
  if (typeof modeOrTimeout === 'number') {
    return formatAutoLockTimeout(modeOrTimeout);
  }

  if (modeOrTimeout === AUTO_LOCK_MODE_ON_APP_CLOSE) {
    return 'when the app closes';
  }

  return `after ${formatAutoLockTimeout(timeout || DEFAULT_TIMEOUT)}`;
};


const getStoredBackgroundTime = async () => {
  try {
    const savedTime = await AsyncStorage.getItem(LAST_BACKGROUND_AT_KEY);

    if (!savedTime) return null;

    const parsedTime = Number(savedTime);

    if (!Number.isFinite(parsedTime) || parsedTime <= 0) {
      await AsyncStorage.removeItem(LAST_BACKGROUND_AT_KEY).catch(() => undefined);
      return null;
    }

    return parsedTime;
  } catch (error: unknown) {
    safeLogError('AUTO_LOCK_BACKGROUND_TIME_READ', error);
    return null;
  }
};

export const isAutoLockDue = async () => {
  const lastBackgroundAt = await getStoredBackgroundTime();

  if (!lastBackgroundAt) return false;

  const timeout = await getAutoLockTimeout();
  const timeAway = Date.now() - lastBackgroundAt;

  return timeout === AUTO_LOCK_ON_APP_CLOSE || timeAway >= timeout;
};

export const useAutoLock = () => {
  const pathname = usePathname();

  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lockingRef = useRef(false);
  const mountedRef = useRef(false);

  const lockVault = useCallback(
    async (options?: { force?: boolean }) => {
      if (lockingRef.current) return;
      if (!options?.force && !shouldUseAutoLock(pathname)) return;

      try {
        lockingRef.current = true;

        const storageResults = await Promise.allSettled([
          AsyncStorage.setItem('vaultLocked', 'true'),
          AsyncStorage.removeItem(LAST_BACKGROUND_AT_KEY),
        ]);

        storageResults.forEach((result) => {
          if (result.status === 'rejected') {
            safeLogError('AUTO_LOCK_STORAGE', result.reason);
          }
        });

        /*
         * Auto-lock is a local privacy boundary, not a remote sign-out.
         * Keep the authenticated device session, biometric credential, push
         * registration, and trusted-device state intact. Only discard
         * in-memory sensitive data before showing the unlock screen.
         */
        clearOfflineVaultMemoryCache();
        api.clearCache?.();

        router.replace('/signin');
      } catch (error: unknown) {
        safeLogError('AUTO_LOCK_EXECUTION', error);
        router.replace('/signin');
      } finally {
        lockingRef.current = false;
      }
    },
    [pathname]
  );

  const markAppLeftAt = useCallback(async () => {
    if (!shouldUseAutoLock(pathname)) return;

    try {
      const existing = await AsyncStorage.getItem(LAST_BACKGROUND_AT_KEY);

      if (!existing) {
        await AsyncStorage.setItem(LAST_BACKGROUND_AT_KEY, String(Date.now()));
      }
    } catch (error: unknown) {
      safeLogError('AUTO_LOCK_BACKGROUND_MARK', error);
    }
  }, [pathname]);

  const checkIfShouldLock = useCallback(async () => {
    if (!mountedRef.current) return;
    if (!shouldUseAutoLock(pathname)) return;

    try {
      const lastBackgroundAt = await getStoredBackgroundTime();

      if (!lastBackgroundAt) return;

      const timeout = await getAutoLockTimeout();
      const timeAway = Date.now() - lastBackgroundAt;
      const shouldLock = timeout === AUTO_LOCK_ON_APP_CLOSE || timeAway >= timeout;

      /*
       * Always clear the old timestamp after checking it. If the app comes back
       * before the timeout, the next background event will store a fresh time.
       */
      await AsyncStorage.removeItem(LAST_BACKGROUND_AT_KEY).catch((error: unknown) => {
        safeLogError('AUTO_LOCK_BACKGROUND_CLEAR', error);
      });

      if (shouldLock) {
        await lockVault();
      }
    } catch (error: unknown) {
      safeLogError('AUTO_LOCK_RESUME_CHECK', error);
    }
  }, [lockVault, pathname]);

  const checkColdStartShouldLock = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const lastBackgroundAt = await getStoredBackgroundTime();
      if (!lastBackgroundAt) return;

      const timeout = await getAutoLockTimeout();
      const timeAway = Math.max(0, Date.now() - lastBackgroundAt);
      const shouldLock =
        timeout === AUTO_LOCK_ON_APP_CLOSE || timeAway >= timeout;

      await AsyncStorage.removeItem(LAST_BACKGROUND_AT_KEY).catch((error: unknown) => {
        safeLogError('AUTO_LOCK_COLD_MARKER_CLEAR', error);
      });

      if (shouldLock) {
        await lockVault({ force: true });
      }
    } catch (error: unknown) {
      safeLogError('AUTO_LOCK_COLD_START_CHECK', error);
    }
  }, [lockVault]);

  useEffect(() => {
    mountedRef.current = true;

    /*
     * Resolve a marker left behind by a killed/swiped-away process. Both the
     * explicit app-close option and elapsed numeric timeouts are enforced.
     */
    void checkColdStartShouldLock().catch((error: unknown) => {
      safeLogError('AUTO_LOCK_INITIAL_CHECK', error);
    });

    const subscription = AppState.addEventListener('change', (nextState) => {
      void (async () => {
        try {
          const previousState = appState.current;

          /*
           * Treat only a real background transition as leaving Guardian.
           * Android permission sheets, biometric prompts, and other system
           * dialogs can briefly report `inactive`; those must not trigger the
           * user's auto-lock policy or imitate a remote lock.
           */
          const appEnteredBackground =
            previousState !== 'background' && nextState === 'background';
          const appReturnedFromBackground =
            previousState === 'background' && nextState === 'active';

          if (appEnteredBackground) {
            await markAppLeftAt();
          }

          if (appReturnedFromBackground) {
            await checkIfShouldLock();
          }
        } catch (error: unknown) {
          safeLogError('AUTO_LOCK_APP_STATE', error);
        } finally {
          appState.current = nextState;
        }
      })();
    });

    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, [checkColdStartShouldLock, checkIfShouldLock, markAppLeftAt]);

  return {
    lockVault,
  };
};
