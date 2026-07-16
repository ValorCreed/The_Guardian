import React, { useCallback, useEffect, useRef } from 'react';
import { BackHandler, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router, usePathname, type Href } from 'expo-router';
import { BlurTargetView } from 'expo-blur';

import { AppThemeProvider, useAppTheme } from '../context/ThemeContext';
import { BlurTargetProvider } from '../context/BlurTargetContext';
import { AppAlertProvider } from '../context/AppAlertContext';
import { useAutoLock } from '../hooks/useAutoLock';
import FloatingTabBar from '../components/FloatingTabBar';
import AnimatedBlurBackButton from '../components/AnimatedBlurBackButton';

const TAB_SCREENS = ['/home', '/vault', '/security', '/family', '/settings'];

const PUBLIC_AUTH_SCREENS = [
  '/',
  '/index',
  '/login',
  '/signin',
  '/signup',
  '/forgotpassword',
  '/resetpassword',
  '/verifyemail',
  '/twofactor',
  '/accountrecovery',
];

const AUTH_TOKEN_KEYS = [
  'token',
  'accessToken',
  'authToken',
  'jwt',
  'jwtToken',
];

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
  '/recoverykit',
  '/accountrecovery',
  '/emergencyaccess',
  '/addemergencycontact',
  '/emergencydetails',
  '/emergencyrequest',
  '/emergencyvault',
  '/emergencyvaultdetails',
  '/bugreport',
  '/privacy',
  '/terms',
];

const AUTH_SCREEN_OPTIONS = {
  headerShown: false,
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
};

function normalizePath(pathname: string) {
  if (!pathname || pathname === '/') return '/';
  return pathname.split('?')[0];
}

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

function isPublicAuthScreen(pathname: string) {
  return PUBLIC_AUTH_SCREENS.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

async function getStoredAuthState() {
  const pairs = await AsyncStorage.multiGet([...AUTH_TOKEN_KEYS, 'vaultLocked']);
  const values: Record<string, string | null> = {};

  pairs.forEach(([key, value]) => {
    values[key] = value;
  });

  const hasToken = AUTH_TOKEN_KEYS.some((key) => {
    const value = values[key];
    return typeof value === 'string' && value.trim().length > 0;
  });

  return {
    hasToken,
    vaultLocked: values.vaultLocked === 'true',
  };
}

function resetToAuth(route: Href = '/login') {
  /*
   * Expo Router keeps a native stack history. After logout, old protected
   * routes can still exist behind login/sign-in.
   *
   * Important: calling dismissAll() when there is no dismissable stack can
   * trigger React Navigation's development warning:
   * "The action 'POP_TO_TOP' was not handled by any navigator."
   *
   * So we only dismiss when Expo Router says there is actually something
   * dismissable, then we replace the current route either way.
   */
  const expoRouter = router as any;

  try {
    const canDismiss =
      typeof expoRouter.canDismiss === 'function'
        ? expoRouter.canDismiss()
        : false;

    if (canDismiss && typeof expoRouter.dismissAll === 'function') {
      expoRouter.dismissAll();
    }
  } catch {
    // Navigation cleanup is best-effort. replace still sends the user to auth.
  }

  router.replace(route);
}

function AppStack() {
  useAutoLock();

  const pathname = normalizePath(usePathname());
  const blurTargetRef = useRef<View | null>(null);
  const authRedirectingRef = useRef(false);
  const { colors } = useAppTheme();

  const showTabBar = shouldShowTabBar(pathname);
  const showBackButton = shouldShowBackButton(pathname);

  const goBackWithFallback = useCallback((fallbackRoute: Href) => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(fallbackRoute);
  }, []);

  const handleGlobalBackPress = () => {
    if (pathname === '/login') {
      return;
    }

    if (
      pathname === '/signin' ||
      pathname === '/signup' ||
      pathname === '/forgotpassword' ||
      pathname === '/resetpassword' ||
      pathname === '/verifyemail' ||
      pathname === '/twofactor'
    ) {
      return resetToAuth('/login');
    }

    if (pathname === '/subscription') {
      return goBackWithFallback('/home');
    }

    if (pathname === '/autofill' || pathname === '/recoverykit') {
      return router.replace('/settings');
    }

    if (pathname === '/accountrecovery') {
      return router.replace('/signin');
    }

    return router.back();
  };

  /*
   * Auth route guard:
   * - If tokens are removed by "Log out everywhere", Android back must never
   *   reveal Home/Vault/Settings from the old native stack.
   * - If the vault is locked, protected routes should send the user to Sign In
   *   instead of rendering screens with placeholder "User" data.
   */
  useEffect(() => {
    let cancelled = false;

    const guardRoute = async () => {
      if (authRedirectingRef.current) return;

      try {
        const isPublic = isPublicAuthScreen(pathname);
        const { hasToken, vaultLocked } = await getStoredAuthState();

        if (cancelled) return;

        if (!isPublic && !hasToken) {
          authRedirectingRef.current = true;
          resetToAuth('/login');
          setTimeout(() => {
            authRedirectingRef.current = false;
          }, 250);
          return;
        }

        if (!isPublic && hasToken && vaultLocked) {
          authRedirectingRef.current = true;
          resetToAuth('/signin');
          setTimeout(() => {
            authRedirectingRef.current = false;
          }, 250);
          return;
        }

        if (
          (pathname === '/login' || pathname === '/signin' || pathname === '/signup') &&
          hasToken &&
          !vaultLocked
        ) {
          authRedirectingRef.current = true;
          router.replace('/home');
          setTimeout(() => {
            authRedirectingRef.current = false;
          }, 250);
        }
      } catch {
        /*
         * If AsyncStorage temporarily fails, do not crash navigation. The API
         * layer still protects data and the next route change will retry.
         */
      }
    };

    guardRoute();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  /*
   * Android back gesture / hardware back protection:
   * - Auth screens must not pop to stale protected screens.
   * - Tab screens are authenticated roots, so Android back should not pop the
   *   user back to login/sign-in.
   * - Subscription uses normal history when available, with Home fallback.
   */
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showTabBar) {
        return true;
      }

      if (pathname === '/login') {
        return true;
      }

      if (
        pathname === '/signin' ||
        pathname === '/signup' ||
        pathname === '/forgotpassword' ||
        pathname === '/resetpassword' ||
        pathname === '/verifyemail' ||
        pathname === '/twofactor'
      ) {
        resetToAuth('/login');
        return true;
      }

      if (pathname === '/autofill' || pathname === '/recoverykit') {
        router.replace('/settings');
        return true;
      }

      if (pathname === '/accountrecovery') {
        router.replace('/signin');
        return true;
      }

      if (pathname === '/subscription') {
        goBackWithFallback('/home');
        return true;
      }

      return false;
    });

    return () => subscription.remove();
  }, [pathname, showTabBar, goBackWithFallback]);

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

                animation: 'fade',

                gestureEnabled: true,
                fullScreenGestureEnabled: true,
              }}
            >
              <Stack.Screen name="index" options={AUTH_SCREEN_OPTIONS} />
              <Stack.Screen name="login" options={AUTH_SCREEN_OPTIONS} />
              <Stack.Screen name="signin" options={AUTH_SCREEN_OPTIONS} />
              <Stack.Screen name="signup" options={AUTH_SCREEN_OPTIONS} />
              <Stack.Screen name="forgotpassword" options={AUTH_SCREEN_OPTIONS} />
              <Stack.Screen name="verifyemail" options={AUTH_SCREEN_OPTIONS} />
              <Stack.Screen name="twofactor" options={AUTH_SCREEN_OPTIONS} />
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
              <Stack.Screen name="resetpassword" options={AUTH_SCREEN_OPTIONS} />
              <Stack.Screen name="autofill" options={{ headerShown: false }} />
              <Stack.Screen name="autolock" options={{ headerShown: false }} />
              <Stack.Screen name="backup" options={{ headerShown: false }} />
              <Stack.Screen name="notifications" options={{ headerShown: false }} />
              <Stack.Screen name="devices" options={{ headerShown: false }} />
              <Stack.Screen name="passwordgenerator" options={{ headerShown: false }} />
              <Stack.Screen name="securityhealth" options={{ headerShown: false }} />
              <Stack.Screen name="recoverykit" options={{ headerShown: false }} />
              <Stack.Screen name="accountrecovery" options={AUTH_SCREEN_OPTIONS} />
              <Stack.Screen name="emergencyaccess" options={{ headerShown: false }} />
              <Stack.Screen name="addemergencycontact" options={{ headerShown: false }} />
              <Stack.Screen name="emergencydetails" options={{ headerShown: false }} />
              <Stack.Screen name="emergencyrequest" options={{ headerShown: false }} />
              <Stack.Screen name="emergencyvault" options={{ headerShown: false }} />
              <Stack.Screen name="emergencyvaultdetails" options={{ headerShown: false }} />

              <Stack.Screen name="addpassword" options={{ headerShown: false }} />
              <Stack.Screen name="addnote" options={{ headerShown: false }} />
              <Stack.Screen name="notedetails" options={{ headerShown: false }} />
              <Stack.Screen name="adddocument" options={{ headerShown: false }} />
              <Stack.Screen name="addcard" options={{ headerShown: false }} />
              <Stack.Screen name="newmember" options={{ headerShown: false }} />
              <Stack.Screen name="terms" options={{ headerShown: false }} />
              <Stack.Screen name="privacy" options={{ headerShown: false }} />
              <Stack.Screen name="bugreport" options={{ headerShown: false }} />
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
