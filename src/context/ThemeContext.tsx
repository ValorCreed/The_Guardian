import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

import { Colors, type ThemePalette } from '../constants/theme';
import { setAnalyticsEnabledPreference } from '../services/analytics';
import {
  AppOperationError,
  safeLogError,
} from '../utils/asyncResilience';

export type ThemeMode = 'system' | 'light' | 'dark' | 'oled';
type ResolvedThemeMode = 'light' | 'dark' | 'oled';

type ThemeContextType = {
  /** The user's saved preference. */
  mode: ThemeMode;
  /** The concrete palette currently rendered after resolving System mode. */
  resolvedMode: ResolvedThemeMode;
  isDark: boolean;
  isOled: boolean;
  colors: ThemePalette;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  resetThemeForNewAccount: (email?: string) => Promise<void>;
  reloadTheme: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const GLOBAL_THEME_KEY = 'themeMode';
const LAST_THEME_USER_EMAIL_KEY = 'lastThemeUserEmail';

const getUserThemeKey = (email: string) =>
  `themeMode:user:${email.trim().toLowerCase()}`;

function isThemeMode(value: string | null): value is ThemeMode {
  return (
    value === 'system' ||
    value === 'light' ||
    value === 'dark' ||
    value === 'oled'
  );
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => {
    // Analytics remains optional to rendering and must never block startup.
    void setAnalyticsEnabledPreference(true).catch((error: unknown) => {
      safeLogError('THEME_ANALYTICS_PREFERENCE', error);
    });
  }, []);

  const reloadTheme = useCallback(async () => {
    try {
      const [activeUserEmail, lastThemeUserEmail] = await Promise.all([
        AsyncStorage.getItem('userEmail'),
        AsyncStorage.getItem(LAST_THEME_USER_EMAIL_KEY),
      ]);
      const emailToUse = activeUserEmail || lastThemeUserEmail || '';

      if (emailToUse) {
        const userTheme = await AsyncStorage.getItem(
          getUserThemeKey(emailToUse)
        );

        if (isThemeMode(userTheme)) {
          setMode(userTheme);
          await AsyncStorage.setItem(GLOBAL_THEME_KEY, userTheme).catch(
            (error: unknown) => safeLogError('THEME_GLOBAL_REPAIR', error)
          );
          return;
        }
      }

      const globalTheme = await AsyncStorage.getItem(GLOBAL_THEME_KEY);
      setMode(isThemeMode(globalTheme) ? globalTheme : 'system');
    } catch (error: unknown) {
      safeLogError('THEME_LOAD', error);
      // A storage outage should still leave the app usable with system colors.
      setMode('system');
    }
  }, []);

  useEffect(() => {
    void reloadTheme().catch((error: unknown) => {
      safeLogError('THEME_INITIAL_LOAD', error);
      setMode('system');
    });
  }, [reloadTheme]);

  const setThemeMode = useCallback(async (newMode: ThemeMode) => {
    const previousMode = mode;
    setMode(newMode);

    try {
      const activeUserEmail = await AsyncStorage.getItem('userEmail');
      const writes: Array<[string, string]> = [
        [GLOBAL_THEME_KEY, newMode],
      ];

      if (activeUserEmail) {
        const cleanEmail = activeUserEmail.trim().toLowerCase();
        writes.push(
          [LAST_THEME_USER_EMAIL_KEY, cleanEmail],
          [getUserThemeKey(cleanEmail), newMode]
        );
      }

      await AsyncStorage.multiSet(writes);
    } catch (error: unknown) {
      // Roll the visible preference back when persistence fails.
      setMode(previousMode);
      safeLogError('THEME_SAVE', error);
      throw new AppOperationError('Theme settings could not be saved.', {
        code: 'STORAGE_UNAVAILABLE',
      });
    }
  }, [mode]);

  const resetThemeForNewAccount = useCallback(async (email?: string) => {
    const cleanEmail = String(email || '').trim().toLowerCase();
    setMode('system');

    try {
      const writes: Array<[string, string]> = [
        [GLOBAL_THEME_KEY, 'system'],
      ];

      if (cleanEmail) {
        writes.push(
          [LAST_THEME_USER_EMAIL_KEY, cleanEmail],
          [getUserThemeKey(cleanEmail), 'system']
        );
      }

      await AsyncStorage.multiSet(writes);
    } catch (error: unknown) {
      safeLogError('THEME_RESET', error);
      throw new AppOperationError('Theme settings could not be reset.', {
        code: 'STORAGE_UNAVAILABLE',
      });
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const currentlyDark =
      mode === 'dark' ||
      mode === 'oled' ||
      (mode === 'system' && systemColorScheme === 'dark');

    void setThemeMode(currentlyDark ? 'light' : 'dark').catch(
      (error: unknown) => safeLogError('THEME_TOGGLE', error)
    );
  }, [mode, setThemeMode, systemColorScheme]);

  const resolvedMode: ResolvedThemeMode =
    mode === 'system'
      ? systemColorScheme === 'dark'
        ? 'dark'
        : 'light'
      : mode;

  const isDark = resolvedMode === 'dark' || resolvedMode === 'oled';
  const isOled = resolvedMode === 'oled';

  const colors = useMemo(() => Colors[resolvedMode], [resolvedMode]);

  const value = useMemo<ThemeContextType>(
    () => ({
      mode,
      resolvedMode,
      isDark,
      isOled,
      colors,
      toggleTheme,
      setThemeMode,
      resetThemeForNewAccount,
      reloadTheme,
    }),
    [
      colors,
      isDark,
      isOled,
      mode,
      reloadTheme,
      resetThemeForNewAccount,
      resolvedMode,
      setThemeMode,
      toggleTheme,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useAppTheme must be used inside AppThemeProvider');
  }

  return context;
}
