import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { checkApiReachability } from '../services/api';

export type NetworkStatus = {
  online: boolean;
  checking: boolean;
  checkNow: () => Promise<boolean>;
};

export function useNetworkStatus(): NetworkStatus {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);
  const inFlightRef = useRef<Promise<boolean> | null>(null);

  const checkNow = useCallback(async () => {
    if (inFlightRef.current) return inFlightRef.current;

    setChecking(true);

    const check = checkApiReachability()
      .then((reachable) => {
        setOnline(reachable);
        return reachable;
      })
      .finally(() => {
        inFlightRef.current = null;
        setChecking(false);
      });

    inFlightRef.current = check;
    return check;
  }, []);

  useEffect(() => {
    void checkNow();

    /*
     * Do not run a permanent 20-second raw-fetch interval. It creates
     * unnecessary overlapping network probes and can race with authentication
     * immediately after Android resumes the app. A launch/foreground check and
     * the public checkNow() method are enough for the current offline UI.
     */
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkNow();
    });

    return () => {
      subscription.remove();
    };
  }, [checkNow]);

  return { online, checking, checkNow };
}