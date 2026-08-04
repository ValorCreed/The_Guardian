import { useCallback, useRef } from 'react';
import { Alert, AlertButton, AlertOptions } from 'react-native';
import { useFocusEffect } from 'expo-router';

type ScreenAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions
) => void;

/**
 * Returns an Alert.alert-compatible function owned by the current route.
 *
 * Async work can finish after a user has already navigated away. Calling the
 * returned function after blur/unmount becomes a no-op, preventing an old
 * screen from opening a popup over the next screen.
 */
export function useScreenAlert(): ScreenAlert {
  const activeRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      activeRef.current = true;

      return () => {
        activeRef.current = false;
      };
    }, [])
  );

  return useCallback<ScreenAlert>((title, message, buttons, options) => {
    if (!activeRef.current) return;

    const guardedButtons = buttons?.map((button) => ({
      ...button,
      onPress: button.onPress
        ? () => {
            if (activeRef.current) {
              button.onPress?.();
            }
          }
        : undefined,
    }));

    Alert.alert(title, message, guardedButtons, options);
  }, []);
}
