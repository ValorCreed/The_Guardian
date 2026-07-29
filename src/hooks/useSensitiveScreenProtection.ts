import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

let activeProtectionCount = 0;
let protectionGeneration = 0;
let protectionQueue: Promise<void> = Promise.resolve();

function scheduleProtectionStateUpdate() {
  if (Platform.OS === 'web') return;

  const generation = ++protectionGeneration;

  protectionQueue = protectionQueue
    .catch(() => undefined)
    .then(async () => {
      /*
       * Skip stale queued requests. Because all native calls run through this
       * one queue, an older prevent call can never finish after a newer allow
       * call (or the reverse) and leave the application in the wrong state.
       */
      if (generation !== protectionGeneration) return;

      if (activeProtectionCount > 0) {
        await ScreenCapture.preventScreenCaptureAsync();
      } else {
        await ScreenCapture.allowScreenCaptureAsync();
      }
    })
    .catch((error) => {
      if (__DEV__) {
        console.log('SCREEN CAPTURE PROTECTION ERROR:', error);
      }
    });
}

/**
 * Prevents screenshots and recording while at least one sensitive consumer is
 * mounted. The module-level reference count avoids one screen cleanup enabling
 * capture while another sensitive route or modal is still visible.
 */
export function useSensitiveScreenProtection(enabled = true) {
  const acquiredRef = useRef(false);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return undefined;

    if (!acquiredRef.current) {
      acquiredRef.current = true;
      activeProtectionCount += 1;
      scheduleProtectionStateUpdate();
    }

    return () => {
      if (!acquiredRef.current) return;

      acquiredRef.current = false;
      activeProtectionCount = Math.max(0, activeProtectionCount - 1);
      scheduleProtectionStateUpdate();
    };
  }, [enabled]);
}
