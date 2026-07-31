import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';

import { Colors } from '../constants/theme';

export type ThemeMode = 'light' | 'dark' | 'oled';

type ThemeContextType = {
  mode: ThemeMode;
  isDark: boolean;
  isOled: boolean;
  colors: any;
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

const FORCE_LIGHT_ROUTES = ['/signup'];

function shouldForceLight(pathname: string) {
  return FORCE_LIGHT_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'oled';
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [mode, setMode] = useState<ThemeMode>('light');

  const forceLight = shouldForceLight(pathname || '');

  const reloadTheme = useCallback(async () => {
    if (forceLight) {
      setMode('light');
      return;
    }

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

    setMode('light');
  }, [forceLight]);

  useEffect(() => {
    reloadTheme();
  }, [pathname, reloadTheme]);

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

    setMode('light');

    await AsyncStorage.setItem(GLOBAL_THEME_KEY, 'light');

    if (cleanEmail) {
      await AsyncStorage.setItem(LAST_THEME_USER_EMAIL_KEY, cleanEmail);
      await AsyncStorage.setItem(getUserThemeKey(cleanEmail), 'light');
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const nextMode: ThemeMode = mode === 'light' ? 'dark' : 'light';
    setThemeMode(nextMode);
  }, [mode, setThemeMode]);

  const effectiveMode: ThemeMode = forceLight ? 'light' : mode;
  const isDark = effectiveMode === 'dark' || effectiveMode === 'oled';
  const isOled = effectiveMode === 'oled';

  const colors = useMemo(() => {
    return Colors[effectiveMode];
  }, [effectiveMode]);

  return (
    <ThemeContext.Provider
      value={{
        mode: effectiveMode,
        isDark,
        isOled,
        colors,
        toggleTheme,
        setThemeMode,
        resetThemeForNewAccount,
        reloadTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useAppTheme must be used inside AppThemeProvider');
  }

  return context;
}
