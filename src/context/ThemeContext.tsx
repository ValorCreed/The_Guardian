import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/theme';

type ThemeMode = 'light' | 'dark';
type AppColors = typeof Colors.light;

type ThemeContextType = {
  mode: ThemeMode;
  isDark: boolean;
  colors: any;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    const loadTheme = async () => {
      const savedTheme = await AsyncStorage.getItem('themeMode');

      if (savedTheme === 'light' || savedTheme === 'dark') {
        setMode(savedTheme);
      }
    };

    loadTheme();
  }, []);

  const setThemeMode = async (newMode: ThemeMode) => {
    setMode(newMode);
    await AsyncStorage.setItem('themeMode', newMode);
  };

  const toggleTheme = () => {
    const nextMode: ThemeMode = mode === 'light' ? 'dark' : 'light';
    setThemeMode(nextMode);
  };

  const isDark = mode === 'dark';

const colors = isDark ? Colors.dark : Colors.light;

  return (
    <ThemeContext.Provider
      value={{
        mode,
        isDark,
        colors,
        toggleTheme,
        setThemeMode,
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