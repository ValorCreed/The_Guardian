import React, { useEffect, useRef } from 'react';
import { BackHandler, View } from 'react-native';
import { Stack, router, usePathname } from 'expo-router';
import { BlurTargetView } from 'expo-blur';

import { AppThemeProvider, useAppTheme } from '../context/ThemeContext';
import { BlurTargetProvider } from '../context/BlurTargetContext';
import { AppAlertProvider } from '../context/AppAlertContext';
import { useAutoLock } from '../hooks/useAutoLock';
import FloatingTabBar from '../components/FloatingTabBar';
import AnimatedBlurBackButton from '../components/AnimatedBlurBackButton';

const TAB_SCREENS = ['/home', '/vault', '/security', '/family', '/settings'];

const BACK_BUTTON_SCREENS = [
  '/about',
  '/backup',
  '/notifications',
  '/devices',
  '/addcard',
  '/adddocument',
  '/addpassword',
  '/addnote',
  '/notedetails',
  '/autofill',
  '/forgotpassword',
  '/newmember',
  '/sharedvaultdetails',
  '/signin',
  '/signup',
  '/subscription',
  '/twofactor',
  '/twofasetup',
  '/userinfo',
  '/vaultdetails',
  '/verification',
  '/verifyemail',
  '/autolock',
  '/resetpassword',
  '/passwordgenerator',
  '/securityhealth',
  '/emergencyaccess',
  '/addemergencycontact',
  '/emergencydetails',
  '/emergencyrequest',
];

function shouldShowTabBar(pathname: string) {
  return TAB_SCREENS.some((route) => pathname === route);
}

function shouldShowBackButton(pathname: string) {
  if (pathname === '/' || pathname === '/index' || pathname === '/login') {
    return false;
  }

  return BACK_BUTTON_SCREENS.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function AppStack() {
  useAutoLock();

  const pathname = usePathname();
  const blurTargetRef = useRef<View | null>(null);
  const { colors } = useAppTheme();

  const showTabBar = shouldShowTabBar(pathname);
  const showBackButton = shouldShowBackButton(pathname);

  const handleGlobalBackPress = () => {
    if (pathname === '/signin') {
      return router.replace('/login');
    }

    if (pathname === '/subscription') {
      return router.replace('/home');
    }

    if (pathname === '/autofill') {
      return router.replace('/settings');
    }

    return router.back();
  };

  /*
   * Android back gesture / hardware back protection:
   * - Tab screens are authenticated root screens, so Android back should not
   *   pop the user back to login/sign-in.
   * - Autofill is reached from Settings, so Android back should return to
   *   Settings instead of popping through old auth routes.
   */
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showTabBar) {
        return true;
      }

      if (pathname === '/autofill') {
        router.replace('/settings');
        return true;
      }

      if (pathname === '/subscription') {
        router.replace('/home');
        return true;
      }

      if (pathname === '/signin') {
        router.replace('/login');
        return true;
      }

      return false;
    });

    return () => subscription.remove();
  }, [pathname, showTabBar]);

  return (
    <BlurTargetProvider targetRef={blurTargetRef}>
      <AppAlertProvider>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <BlurTargetView
            ref={blurTargetRef}
            collapsable={false}
            style={{ flex: 1, backgroundColor: colors.background }}
          >
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: {
                  backgroundColor: colors.background,
                },

                /**
                 * This makes tab switching feel instant.
                 * The navbar still animates, but the screen transition itself
                 * does not wait on fade/slide animations.
                 */
                animation: 'fade',

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
              <Stack.Screen name="twofasetup" options={{ headerShown: false }} />
              <Stack.Screen name="verification" options={{ headerShown: false }} />

              <Stack.Screen name="home" options={{ headerShown: false }} />
              <Stack.Screen name="vault" options={{ headerShown: false }} />
              <Stack.Screen name="vaultdetails" options={{ headerShown: false }} />
              <Stack.Screen name="security" options={{ headerShown: false }} />
              <Stack.Screen name="family" options={{ headerShown: false }} />
              <Stack.Screen name="sharedvaultdetails" options={{ headerShown: false }} />
              <Stack.Screen name="settings" options={{ headerShown: false }} />
              <Stack.Screen name="about" options={{ headerShown: false }} />
              <Stack.Screen name="userinfo" options={{ headerShown: false }} />
              <Stack.Screen name="subscription" options={{ headerShown: false }} />
              <Stack.Screen name="resetpassword" options={{ headerShown: false }} />
              <Stack.Screen name="autofill" options={{ headerShown: false }} />
              <Stack.Screen name="autolock" options={{ headerShown: false }} />
              <Stack.Screen name="backup" options={{ headerShown: false }} />
              <Stack.Screen name="notifications" options={{ headerShown: false }} />
              <Stack.Screen name="devices" options={{ headerShown: false }} />
              <Stack.Screen name="passwordgenerator" options={{ headerShown: false }} />
              <Stack.Screen name="securityhealth" options={{ headerShown: false }} />
              <Stack.Screen name="emergencyaccess" options={{ headerShown: false }} />
              <Stack.Screen name="addemergencycontact" options={{ headerShown: false }} />
              <Stack.Screen name="emergencydetails" options={{ headerShown: false }} />
              <Stack.Screen name="emergencyrequest" options={{ headerShown: false }} />

              <Stack.Screen name="addpassword" options={{ headerShown: false }} />
              <Stack.Screen name="addnote" options={{ headerShown: false }} />
              <Stack.Screen name="notedetails" options={{ headerShown: false }} />
              <Stack.Screen name="adddocument" options={{ headerShown: false }} />
              <Stack.Screen name="addcard" options={{ headerShown: false }} />
              <Stack.Screen name="newmember" options={{ headerShown: false }} />
            </Stack>
          </BlurTargetView>

          {showBackButton && (
            <AnimatedBlurBackButton onPress={handleGlobalBackPress} />
          )}

          {showTabBar && <FloatingTabBar />}
        </View>
      </AppAlertProvider>
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