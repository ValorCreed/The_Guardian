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
  return value === 'system' || value === 'light' || value === 'dark' || value === 'oled';
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => {
    // Analytics is a required, privacy-safe reliability feature for this build.
    // Reset legacy opt-out values once when the app provider starts.
    void setAnalyticsEnabledPreference(true);
  }, []);

  const reloadTheme = useCallback(async () => {
    const activeUserEmail = await AsyncStorage.getItem('userEmail');
    const lastThemeUserEmail = await AsyncStorage.getItem(
      LAST_THEME_USER_EMAIL_KEY
    );

    const emailToUse = activeUserEmail || lastThemeUserEmail || '';

    if (emailToUse) {
      const userTheme = await AsyncStorage.getItem(
        getUserThemeKey(emailToUse)
      );

      if (isThemeMode(userTheme)) {
        setMode(userTheme);
        await AsyncStorage.setItem(GLOBAL_THEME_KEY, userTheme);
        return;
      }
    }

    const globalTheme = await AsyncStorage.getItem(GLOBAL_THEME_KEY);

    if (isThemeMode(globalTheme)) {
      setMode(globalTheme);
      return;
    }

    setMode('system');
  }, []);

  useEffect(() => {
    void reloadTheme();
  }, [reloadTheme]);

  const setThemeMode = useCallback(async (newMode: ThemeMode) => {
    setMode(newMode);

    await AsyncStorage.setItem(GLOBAL_THEME_KEY, newMode);

    const activeUserEmail = await AsyncStorage.getItem('userEmail');

    if (activeUserEmail) {
      const cleanEmail = activeUserEmail.trim().toLowerCase();

      await AsyncStorage.setItem(LAST_THEME_USER_EMAIL_KEY, cleanEmail);
      await AsyncStorage.setItem(getUserThemeKey(cleanEmail), newMode);
    }
  }, []);

  const resetThemeForNewAccount = useCallback(async (email?: string) => {
    const cleanEmail = String(email || '').trim().toLowerCase();

    setMode('system');
    await AsyncStorage.setItem(GLOBAL_THEME_KEY, 'system');

    if (cleanEmail) {
      await AsyncStorage.setItem(LAST_THEME_USER_EMAIL_KEY, cleanEmail);
      await AsyncStorage.setItem(getUserThemeKey(cleanEmail), 'system');
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const currentlyDark =
      mode === 'dark' ||
      mode === 'oled' ||
      (mode === 'system' && systemColorScheme === 'dark');

    void setThemeMode(currentlyDark ? 'light' : 'dark');
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