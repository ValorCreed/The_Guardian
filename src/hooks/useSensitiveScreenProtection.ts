import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

/**
 * Prevent screenshots / screen recording on sensitive vault screens.
 * Android support is strong. iOS support depends on platform limitations,
 * but this still gives the app the safest behavior Expo can provide.
 */
export function useSensitiveScreenProtection(enabled = true) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return undefined;

    let mounted = true;

    const protect = async () => {
      try {
        await ScreenCapture.preventScreenCaptureAsync();
      } catch (error) {
        console.log('SCREEN CAPTURE PROTECTION ERROR:', error);
      }
    };

    protect();

    return () => {
      mounted = false;
      ScreenCapture.allowScreenCaptureAsync().catch(() => undefined);
    };
  }, [enabled]);
}
