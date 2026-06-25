import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { logout } from '../services/api';

const DEFAULT_TIMEOUT = 60000;

export const useAutoLock = () => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appState = useRef(AppState.currentState);

  const lockVault = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    await AsyncStorage.setItem('vaultLocked', 'true');
    await logout();
    router.replace('/signin');
  }, []);

  const resetAutoLockTimer = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);

    const savedTimeout = await AsyncStorage.getItem('autoLockTimeout');
    const timeout = savedTimeout ? Number(savedTimeout) : DEFAULT_TIMEOUT;

    timer.current = setTimeout(lockVault, timeout);
  }, [lockVault]);

  useEffect(() => {
    resetAutoLockTimer();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current === 'active' && (nextState === 'background' || nextState === 'inactive')) {
        lockVault();
      }

      if ((appState.current === 'background' || appState.current === 'inactive') && nextState === 'active') {
        resetAutoLockTimer();
      }

      appState.current = nextState;
    });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      subscription.remove();
    };
  }, [lockVault, resetAutoLockTimer]);

  return { resetAutoLockTimer, lockVault };
};
