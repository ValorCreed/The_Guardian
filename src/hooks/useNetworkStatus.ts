import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { checkApiReachability } from '../services/api';
import {
  AppOperationError,
  retryAsync,
  safeLogError,
} from '../utils/asyncResilience';

export type NetworkStatus = {
  online: boolean;
  checking: boolean;
  checkNow: () => Promise<boolean>;
};

export function useNetworkStatus(): NetworkStatus {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const mountedRef = useRef(true);

  const checkNow = useCallback(async () => {
    if (inFlightRef.current) return inFlightRef.current;

    if (mountedRef.current) setChecking(true);

    const check = (async () => {
      try {
        const reachable = await retryAsync(
          async () => {
            const value = await checkApiReachability();
            if (!value) {
              throw new AppOperationError('The server is not responding yet.', {
                code: 'NETWORK_UNREACHABLE',
                transient: true,
              });
            }
            return true;
          },
          {
            maxAttempts: 2,
            baseDelayMs: 650,
            maxDelayMs: 1200,
          }
        );

        if (mountedRef.current) setOnline(reachable);
        return reachable;
      } catch (error: unknown) {
        safeLogError('NETWORK_STATUS_CHECK', error);
        if (mountedRef.current) setOnline(false);
        return false;
      } finally {
        inFlightRef.current = null;
        if (mountedRef.current) setChecking(false);
      }
    })();

    inFlightRef.current = check;
    return check;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void checkNow();

    /*
     * Do not run a permanent raw-fetch interval. A launch/foreground check and
     * the public checkNow() method avoid overlapping probes while still giving
     * a temporarily sleeping service one grace retry.
     */
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkNow();
    });

    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, [checkNow]);

  return { online, checking, checkNow };
}
