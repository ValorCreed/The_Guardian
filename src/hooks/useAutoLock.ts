import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, usePathname } from 'expo-router';

import { logout } from '../services/api';

const DEFAULT_TIMEOUT = 60000;
const LAST_BACKGROUND_AT_KEY = 'lastBackgroundAt';

const AUTH_SCREENS = [
  '/',
  '/index',
  '/login',
  '/signin',
  '/signup',
  '/forgotpassword',
  '/verifyemail',
  '/twofactor',
  '/verification',
];

const shouldUseAutoLock = (pathname: string) => {
  return !AUTH_SCREENS.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
};

export const getAutoLockTimeout = async () => {
  const savedTimeout = await AsyncStorage.getItem('autoLockTimeout');
  const timeout = savedTimeout ? Number(savedTimeout) : DEFAULT_TIMEOUT;

  if (!Number.isFinite(timeout) || timeout <= 0) {
    return DEFAULT_TIMEOUT;
  }

  return timeout;
};

export const setAutoLockTimeout = async (timeout: number) => {
  await AsyncStorage.setItem('autoLockTimeout', String(timeout));
};

export const formatAutoLockTimeout = (timeout: number) => {
  if (timeout < 60000) return `${Math.round(timeout / 1000)} seconds`;
  if (timeout < 3600000) return `${Math.round(timeout / 60000)} minute${timeout === 60000 ? '' : 's'}`;
  return `${Math.round(timeout / 3600000)} hour${timeout === 3600000 ? '' : 's'}`;
};

export const useAutoLock = () => {
  const pathname = usePathname();

  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lockingRef = useRef(false);
  const mountedRef = useRef(false);

  const lockVault = useCallback(async () => {
    if (lockingRef.current) return;
    if (!shouldUseAutoLock(pathname)) return;

    try {
      lockingRef.current = true;

      await AsyncStorage.setItem('vaultLocked', 'true');
      await AsyncStorage.removeItem(LAST_BACKGROUND_AT_KEY);

      await logout();

      router.replace('/signin');
    } finally {
      lockingRef.current = false;
    }
  }, [pathname]);

  const markAppLeftAt = useCallback(async () => {
    if (!shouldUseAutoLock(pathname)) return;

    const existing = await AsyncStorage.getItem(LAST_BACKGROUND_AT_KEY);

    if (!existing) {
      await AsyncStorage.setItem(LAST_BACKGROUND_AT_KEY, String(Date.now()));
    }
  }, [pathname]);

  const checkIfShouldLock = useCallback(async () => {
    if (!mountedRef.current) return;
    if (!shouldUseAutoLock(pathname)) return;

    const lastBackgroundAt = await AsyncStorage.getItem(LAST_BACKGROUND_AT_KEY);

    if (!lastBackgroundAt) return;

    const timeout = await getAutoLockTimeout();
    const timeAway = Date.now() - Number(lastBackgroundAt);

    await AsyncStorage.removeItem(LAST_BACKGROUND_AT_KEY);

    if (timeAway >= timeout) {
      await lockVault();
    }
  }, [lockVault, pathname]);

  useEffect(() => {
    mountedRef.current = true;

    const subscription = AppState.addEventListener('change', async (nextState) => {
      const previousState = appState.current;

      const appWasActive = previousState === 'active';
      const appLeftScreen =
        nextState === 'inactive' || nextState === 'background';

      const appReturned =
        (previousState === 'inactive' || previousState === 'background') &&
        nextState === 'active';

      if (appWasActive && appLeftScreen) {
        await markAppLeftAt();
      }

      if (appReturned) {
        await checkIfShouldLock();
      }

      appState.current = nextState;
    });

    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, [checkIfShouldLock, markAppLeftAt]);

  return {
    lockVault,
  };
};