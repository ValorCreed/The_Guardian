import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router, useGlobalSearchParams, usePathname, type Href } from 'expo-router';
import { BlurTargetView, BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import { AppThemeProvider, useAppTheme } from '../context/ThemeContext';
import { BlurTargetProvider } from '../context/BlurTargetContext';
import { AppAlertProvider } from '../context/AppAlertContext';
import { useAutoLock } from '../hooks/useAutoLock';
import FloatingTabBar from '../components/FloatingTabBar';
import AnimatedBlurBackButton from '../components/AnimatedBlurBackButton';
import AppErrorBoundary from '../components/AppErrorBoundary';
import { AnalyticsProvider, AnalyticsRouteTracker } from '../services/analytics';
import {
  api,
  consumeSessionEndMessage,
  hasStoredAuthToken,
  subscribeToSessionSecurityEvents,
} from '../services/api';
import { hasAcceptedLegalConsent } from '../services/legalConsent';
import { startPushNotificationRuntime } from '../services/pushNotifications';
import { safeLogError } from '../utils/asyncResilience';

const TAB_SCREENS = ['/home', '/vault', '/security', '/family', '/settings'];
const LEGAL_REVIEW_SCREENS = ['/verification', '/privacy', '/terms'];

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
  '/circlerecovery',
];

const BACK_BUTTON_SCREENS = [
  '/about',
  '/backup',
  '/notifications',
  '/notificationpreferences',
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
  '/editfamilyaccess',
  '/safetycheck',
  '/recoverycircle',
  '/circlerecovery',
  '/estateplaybooks',
  '/continuitydrill',
  '/duressmode',
  '/incidentlockdown',
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
  const [hasToken, vaultLockedValue] = await Promise.all([
    hasStoredAuthToken(),
    AsyncStorage.getItem('vaultLocked'),
  ]);

  return {
    hasToken,
    vaultLocked: vaultLockedValue === 'true',
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

  useEffect(() => {
    const stopPushRuntime = startPushNotificationRuntime();
    return () => {
      stopPushRuntime();
    };
  }, []);

  const pathname = normalizePath(usePathname());
  const routeParams = useGlobalSearchParams<{ from?: string; preview?: string }>();
  const blurTargetRef = useRef<View | null>(null);
  const authRedirectingRef = useRef(false);
  const heartbeatRunningRef = useRef(false);
  const [lockdownExitVisible, setLockdownExitVisible] = useState(false);
  const { colors, isDark } = useAppTheme();

  const showTabBar = shouldShowTabBar(pathname);
  const isVerificationPreview =
    pathname === '/verification' &&
    (routeParams.from === 'settings' || routeParams.preview === '1');
  const showBackButton =
    shouldShowBackButton(pathname) &&
    (pathname !== '/verification' || isVerificationPreview);

  const goBackWithFallback = useCallback((fallbackRoute: Href) => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(fallbackRoute);
  }, []);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- setLockdownExitVisible is a stable setState; empty deps is correct.
  const showLockdownExitNotice = useCallback(() => {
    setLockdownExitVisible(true);
  }, []);

  const handleGlobalBackPress = async () => {
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

    if (pathname === '/verification') {
      if (isVerificationPreview) {
        return goBackWithFallback('/settings');
      }

      return;
    }

    if (pathname === '/subscription') {
      return goBackWithFallback('/home');
    }

    if (pathname === '/notificationpreferences') {
      return goBackWithFallback('/settings');
    }

    if (pathname === '/autofill') {
      return router.replace('/settings');
    }

    if (pathname === '/recoverykit') {
      return goBackWithFallback('/security');
    }

    if (pathname === '/safetycheck') {
      return goBackWithFallback('/emergencyaccess');
    }

    if (pathname === '/recoverycircle') {
      return goBackWithFallback('/recoverykit');
    }

    if (pathname === '/circlerecovery') {
      return goBackWithFallback('/accountrecovery');
    }

    if (pathname === '/estateplaybooks') {
      return goBackWithFallback('/security');
    }

    if (pathname === '/continuitydrill') {
      return goBackWithFallback('/security');
    }

    if (pathname === '/duressmode') {
      return goBackWithFallback('/security');
    }

    if (pathname === '/incidentlockdown') {
      try {
        const lockdownActive =
          (await AsyncStorage.getItem('guardianIncidentLockdown')) === 'true';

        if (lockdownActive) {
          showLockdownExitNotice();
          return;
        }
      } catch (error: unknown) {
        safeLogError('LOCKDOWN_BACK_STATE', error);
        showLockdownExitNotice();
        return;
      }

      return goBackWithFallback('/security');
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

        const duressMode =
          hasToken && (await AsyncStorage.getItem('guardianSessionMode')) === 'DURESS';
        const incidentLockdown =
          hasToken &&
          !duressMode &&
          (await AsyncStorage.getItem('guardianIncidentLockdown')) === 'true';

        if (
          incidentLockdown &&
          !isPublic &&
          pathname !== '/incidentlockdown'
        ) {
          authRedirectingRef.current = true;
          router.replace('/incidentlockdown');
          setTimeout(() => {
            authRedirectingRef.current = false;
          }, 250);
          return;
        }

        const duressAllowed = [
          '/home', '/vault', '/vaultdetails', '/notedetails',
          '/addpassword', '/addcard', '/adddocument', '/addnote',
        ].some((route) => pathname === route || pathname.startsWith(`${route}/`));

        if (duressMode && !isPublic && !duressAllowed) {
          authRedirectingRef.current = true;
          router.replace('/home');
          setTimeout(() => {
            authRedirectingRef.current = false;
          }, 250);
          return;
        }

        let legalConsentAccepted = true;
        const canCheckLegalConsent =
          hasToken &&
          !vaultLocked &&
          !duressMode &&
          !LEGAL_REVIEW_SCREENS.includes(pathname);

        if (canCheckLegalConsent) {
          const email = await AsyncStorage.getItem('userEmail');
          legalConsentAccepted = await hasAcceptedLegalConsent(email);

          if (cancelled) return;

          if (!legalConsentAccepted && !isPublic) {
            authRedirectingRef.current = true;
            router.replace('/verification');
            setTimeout(() => {
              authRedirectingRef.current = false;
            }, 250);
            return;
          }
        }

        if (
          (pathname === '/login' || pathname === '/signin' || pathname === '/signup') &&
          hasToken &&
          !vaultLocked
        ) {
          authRedirectingRef.current = true;
          router.replace(legalConsentAccepted ? '/home' : '/verification');
          setTimeout(() => {
            authRedirectingRef.current = false;
          }, 250);
        }
      } catch (error: unknown) {
        safeLogError('AUTH_ROUTE_GUARD', error);
        /*
         * If storage temporarily fails, keep the current safe screen visible.
         * The next route or app-state change will try the guard again.
         */
      }
    };

    guardRoute();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const unsubscribe = subscribeToSessionSecurityEvents((event) => {
      void consumeSessionEndMessage()
        .catch((error: unknown) => {
          safeLogError('SESSION_END_MESSAGE', error);
          return null;
        })
        .finally(() => {
          resetToAuth('/signin');
          setTimeout(() => {
            Alert.alert(
              'This device was signed out',
              event.message,
              [{ text: 'Sign in again' }],
              { cancelable: false }
            );
          }, 120);
        });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const validateSession = async () => {
      if (cancelled || heartbeatRunningRef.current) return;
      if (isPublicAuthScreen(pathname)) return;

      try {
        const [hasToken, locked, sessionMode] = await Promise.all([
          hasStoredAuthToken().catch(() => false),
          AsyncStorage.getItem('vaultLocked'),
          AsyncStorage.getItem('guardianSessionMode'),
        ]);

        if (
          cancelled ||
          !hasToken ||
          locked === 'true' ||
          sessionMode === 'DURESS'
        ) return;

        heartbeatRunningRef.current = true;
        await api.validateCurrentSession();
      } catch (error: unknown) {
        // Revoked-session and Lockdown responses are handled by the API layer.
        safeLogError('SESSION_HEARTBEAT', error);
      } finally {
        heartbeatRunningRef.current = false;
      }
    };

    void validateSession();
    const intervalId = setInterval(() => void validateSession(), 20000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void validateSession();
    });

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      appStateSubscription.remove();
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

      if (pathname === '/verification') {
        if (isVerificationPreview) {
          goBackWithFallback('/settings');
        }
        return true;
      }

      if (pathname === '/autofill') {
        router.replace('/settings');
        return true;
      }

      if (pathname === '/recoverykit') {
        goBackWithFallback('/security');
        return true;
      }

      if (pathname === '/safetycheck') {
        goBackWithFallback('/emergencyaccess');
        return true;
      }

      if (pathname === '/recoverycircle') {
        goBackWithFallback('/recoverykit');
        return true;
      }

      if (pathname === '/circlerecovery') {
        goBackWithFallback('/accountrecovery');
        return true;
      }

      if (pathname === '/estateplaybooks') {
        goBackWithFallback('/security');
        return true;
      }

      if (pathname === '/continuitydrill') {
        goBackWithFallback('/security');
        return true;
      }

      if (pathname === '/duressmode') {
        goBackWithFallback('/security');
        return true;
      }

      if (pathname === '/incidentlockdown') {
        void AsyncStorage.getItem('guardianIncidentLockdown')
          .then((value) => {
            if (value === 'true') {
              showLockdownExitNotice();
              return;
            }
            goBackWithFallback('/security');
          })
          .catch((error: unknown) => {
            safeLogError('LOCKDOWN_HARDWARE_BACK_STATE', error);
            showLockdownExitNotice();
          });
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

      if (pathname === '/notificationpreferences') {
        goBackWithFallback('/settings');
        return true;
      }

      return false;
    });

    return () => subscription.remove();
  }, [pathname, showTabBar, goBackWithFallback, isVerificationPreview, showLockdownExitNotice]);

  return (
    <BlurTargetProvider targetRef={blurTargetRef}>
      <AppAlertProvider>
        <AnalyticsRouteTracker pathname={pathname} />
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
              <Stack.Screen
                name="verification"
                options={{
                  headerShown: false,
                  gestureEnabled: false,
                  fullScreenGestureEnabled: false,
                }}
              />

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
              <Stack.Screen name="notificationpreferences" options={{ headerShown: false }} />
              <Stack.Screen name="devices" options={{ headerShown: false }} />
              <Stack.Screen name="passwordgenerator" options={{ headerShown: false }} />
              <Stack.Screen name="securityhealth" options={{ headerShown: false }} />
              <Stack.Screen name="recoverykit" options={{ headerShown: false }} />
              <Stack.Screen name="recoverycircle" options={{ headerShown: false }} />
              <Stack.Screen name="accountrecovery" options={AUTH_SCREEN_OPTIONS} />
              <Stack.Screen name="circlerecovery" options={AUTH_SCREEN_OPTIONS} />
              <Stack.Screen name="emergencyaccess" options={{ headerShown: false }} />
              <Stack.Screen name="addemergencycontact" options={{ headerShown: false }} />
              <Stack.Screen name="emergencydetails" options={{ headerShown: false }} />
              <Stack.Screen name="emergencyrequest" options={{ headerShown: false }} />
              <Stack.Screen name="emergencyvault" options={{ headerShown: false }} />
              <Stack.Screen name="emergencyvaultdetails" options={{ headerShown: false }} />
              <Stack.Screen name="safetycheck" options={{ headerShown: false }} />
              <Stack.Screen name="estateplaybooks" options={{ headerShown: false }} />
              <Stack.Screen name="continuitydrill" options={{ headerShown: false }} />
              <Stack.Screen name="duressmode" options={{ headerShown: false }} />
              <Stack.Screen
                name="incidentlockdown"
                options={{
                  headerShown: false,
                  gestureEnabled: false,
                  fullScreenGestureEnabled: false,
                }}
              />

              <Stack.Screen name="addpassword" options={{ headerShown: false, animation: 'none' }} />
              <Stack.Screen name="addnote" options={{ headerShown: false, animation: 'none' }} />
              <Stack.Screen name="notedetails" options={{ headerShown: false }} />
              <Stack.Screen name="adddocument" options={{ headerShown: false, animation: 'none' }} />
              <Stack.Screen name="addcard" options={{ headerShown: false, animation: 'none' }} />
              <Stack.Screen name="newmember" options={{ headerShown: false }} />
              <Stack.Screen name="terms" options={{ headerShown: false }} />
              <Stack.Screen name="privacy" options={{ headerShown: false }} />
              <Stack.Screen name="bugreport" options={{ headerShown: false }} />
              <Stack.Screen name="editfamilyaccess" options={{ headerShown: false }} />
            </Stack>
          </BlurTargetView>

          {showBackButton && (
            <AnimatedBlurBackButton onPress={() => void handleGlobalBackPress()} />
          )}

          {showTabBar && <FloatingTabBar />}

          <Modal
            visible={lockdownExitVisible}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => setLockdownExitVisible(false)}
          >
            <View style={layoutStyles.lockdownModalRoot}>
              <BlurView
                blurTarget={blurTargetRef as any}
                blurMethod={
                  Platform.OS === 'android'
                    ? ('dimezisBlurViewSdk31Plus' as any)
                    : undefined
                }
                blurReductionFactor={Platform.OS === 'android' ? 2 : undefined}
                intensity={Platform.OS === 'android' ? 22 : 34}
                tint={isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
              />
              <View style={layoutStyles.lockdownModalOverlay} />
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setLockdownExitVisible(false)}
              />
              <View
                style={[
                  layoutStyles.lockdownModalCard,
                  {
                    backgroundColor: colors.backgroundElement,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    layoutStyles.lockdownModalIcon,
                    { backgroundColor: `${colors.danger}18` },
                  ]}
                >
                  <Ionicons name="lock-closed" size={26} color={colors.danger} />
                </View>
                <Text style={[layoutStyles.lockdownModalTitle, { color: colors.text }]}>
                  Lockdown screen only
                </Text>
                <Text
                  style={[
                    layoutStyles.lockdownModalText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Other Guardian features are unavailable while Incident Lockdown is active.
                  Complete or safely cancel recovery before leaving this screen.
                </Text>
                <Pressable
                  style={[
                    layoutStyles.lockdownModalButton,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={() => setLockdownExitVisible(false)}
                >
                  <Text style={layoutStyles.lockdownModalButtonText}>
                    Continue recovery
                  </Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        </View>
      </AppAlertProvider>
    </BlurTargetProvider>
  );
}

const layoutStyles = StyleSheet.create({
  lockdownModalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  lockdownModalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  lockdownModalCard: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 18,
  },
  lockdownModalIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  lockdownModalTitle: {
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
  },
  lockdownModalText: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  lockdownModalButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingHorizontal: 18,
  },
  lockdownModalButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <AppThemeProvider>
        <AnalyticsProvider>
          <AppStack />
        </AnalyticsProvider>
      </AppThemeProvider>
    </AppErrorBoundary>
  );
}