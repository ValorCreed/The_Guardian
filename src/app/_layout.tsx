import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import {Colors} from '../constants/theme';
import { useState } from 'react';
import { AppThemeProvider } from '../context/ThemeContext';
import { useAutoLock } from '../hooks/useAutoLock';

const CustomLightTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.primary,
    background: Colors.light.background,
    card: Colors.light.backgroundElement,
    text: Colors.light.text,
    border: Colors.light.border,
    notification: Colors.light.danger,
  },
};

const CustomDarkTheme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.dark.primary,
    background: Colors.dark.background,
    card: Colors.dark.backgroundElement,
    text: Colors.dark.text,
    border: Colors.dark.border,
    notification: Colors.dark.danger,
  },
};


export default function TabLayout() {
  useAutoLock();
  const [darkMode, setDarkMode] = useState(false);
  return (
    <AppThemeProvider>
         <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="vaultdetails" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />     
        <Stack.Screen name="verification" options={{ headerShown: false }} />
        <Stack.Screen name="vault" options={{ headerShown: false }} />
        <Stack.Screen name="home" options={{ headerShown: false }} />
        <Stack.Screen name="addpassword" options={{ headerShown: false }} />
        <Stack.Screen name="adddocument" options={{ headerShown: false }} />
        <Stack.Screen name="addcard" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="subscription" options={{ headerShown: false }} />
        <Stack.Screen name="family" options={{ headerShown: false }} />
        <Stack.Screen name="security" options={{ headerShown: false }} />
        <Stack.Screen name="newmember" options={{ headerShown: false }} />
        <Stack.Screen name="signin" options={{ headerShown: false }} />
        <Stack.Screen name = "forgotpassword" options = {{headerShown: false}}/>
        <Stack.Screen name = "autofill" options = {{headerShown: false}}/>
      </Stack>
    </AppThemeProvider>
);
}
