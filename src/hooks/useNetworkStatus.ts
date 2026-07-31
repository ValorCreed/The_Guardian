import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { API_BASE_URL } from '../services/api';

export type NetworkStatus = {
  online: boolean;
  checking: boolean;
  checkNow: () => Promise<boolean>;
};

export function useNetworkStatus(): NetworkStatus {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);

  const checkNow = useCallback(async () => {
    setChecking(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2200);

    try {
      await fetch(API_BASE_URL, {
        method: 'GET',
        signal: controller.signal,
      });

      setOnline(true);
      return true;
    } catch {
      setOnline(false);
      return false;
    } finally {
      clearTimeout(timeout);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkNow();

    const interval = setInterval(checkNow, 20000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkNow();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [checkNow]);

  return { online, checking, checkNow };
}
