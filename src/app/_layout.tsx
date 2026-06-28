import React, { useRef } from 'react';
import { View } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { BlurTargetView } from 'expo-blur';

import { AppThemeProvider, useAppTheme } from '../context/ThemeContext';
import { BlurTargetProvider } from '../context/BlurTargetContext';
import { useAutoLock } from '../hooks/useAutoLock';
import FloatingTabBar from '../components/FloatingTabBar';

const TAB_SCREENS = ['/home', '/vault', '/security', '/family', '/settings','/newmember'];

function shouldShowTabBar(pathname: string) {
  return TAB_SCREENS.some((route) => pathname === route);
}

function AppStack() {
  useAutoLock();

  const pathname = usePathname();
  const blurTargetRef = useRef<View | null>(null);
  const { colors } = useAppTheme();

  const showTabBar = shouldShowTabBar(pathname);

  return (
    <BlurTargetProvider targetRef={blurTargetRef}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <BlurTargetView
          ref={blurTargetRef}
          style={{ flex: 1, backgroundColor: colors.background }}
        >
          <Stack
            screenOptions={{
              headerShown: false,

              // This prevents the white flash during page transitions.
              contentStyle: {
                backgroundColor: colors.background,
              },

              // Smooth enough, but not too aggressive.
              animation: 'fade',
              animationDuration: 180,
              gestureEnabled: true,
              fullScreenGestureEnabled: true,
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="signin" options={{ headerShown: false }} />
            <Stack.Screen name="signup" options={{ headerShown: false }} />
            <Stack.Screen name="forgotpassword" options={{ headerShown: false }} />
            <Stack.Screen name="verifyemail" options={{ headerShown: false }} />
            <Stack.Screen name="twofactor" options={{ headerShown: false }} />
            <Stack.Screen name="verification" options={{ headerShown: false }} />

            <Stack.Screen name="home" options={{ headerShown: false }} />
            <Stack.Screen name="vault" options={{ headerShown: false }} />
            <Stack.Screen name="vaultdetails" options={{ headerShown: false }} />
            <Stack.Screen name="security" options={{ headerShown: false }} />
            <Stack.Screen name="family" options={{ headerShown: false }} />
            <Stack.Screen name="sharedvaultdetails" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="userinfo" options={{ headerShown: false }} />
            <Stack.Screen name="subscription" options={{ headerShown: false }} />
            <Stack.Screen name="autofill" options={{ headerShown: false }} />

            <Stack.Screen name="addpassword" options={{ headerShown: false }} />
            <Stack.Screen name="adddocument" options={{ headerShown: false }} />
            <Stack.Screen name="addcard" options={{ headerShown: false }} />
            <Stack.Screen name="newmember" options={{ headerShown: false }} />
          </Stack>
        </BlurTargetView>

        {showTabBar && <FloatingTabBar />}
      </View>
    </BlurTargetProvider>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AppStack />
    </AppThemeProvider>
  );
}