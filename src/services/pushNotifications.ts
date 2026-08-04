import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';

import {
  api,
  getGuardianInstallationId,
  hasStoredAuthToken,
  isDuressSession,
} from './api';
import {
  AppOperationError,
  isTransientError,
  retryAsync,
  safeLogError,
  toAppOperationError,
} from '../utils/asyncResilience';

type NotificationsApi = typeof import('expo-notifications');
type NotificationResponse = import('expo-notifications').NotificationResponse;
type NotificationPermissionsStatus =
  import('expo-notifications').NotificationPermissionsStatus;
type NotificationSubscription =
  import('expo-notifications').EventSubscription;

const PUSH_ENABLED_KEY = 'guardian.push.enabled';
const PUSH_REGISTERED_TOKEN_KEY = 'guardian.push.expo-token';
const PUSH_REGISTERED_USER_KEY = 'guardian.push.registered-user';
const PUSH_LAST_SYNCED_AT_KEY = 'guardian.push.last-synced-at';
const PENDING_PUSH_ROUTE_KEY = 'guardian.push.pending-route';

const PUSH_SYNC_FRESH_MS = 12 * 60 * 60 * 1000;
const PUSH_FORCE_SYNC_DEBOUNCE_MS = 30 * 1000;
const PUSH_RUNTIME_SYNC_DELAY_MS = 10_000;

let lastHandledNotificationIdentifier: string | null = null;
let lastHandledNotificationAt = 0;
let notificationHandlerConfigured = false;
let notificationsModulePromise: Promise<NotificationsApi> | null = null;
let pushSyncPromise: Promise<boolean> | null = null;
let lastForcedSyncAt = 0;

const ALLOWED_ROUTES = new Set([
  '/vault',
  '/subscription',
  '/family',
  '/emergencyaccess',
  '/safetycheck',
  '/securityhealth',
  '/backup',
  '/recoverykit',
  '/recoverycircle',
  '/estateplaybooks',
  '/continuitydrill',
  '/incidentlockdown',
  '/security',
  '/devices',
  '/twofasetup',
  '/notifications',
]);

const ALLOWED_VAULT_TABS = new Set([
  'Passwords',
  'Documents',
  'Cards',
  'Notes',
]);

function runningInExpoGo() {
  /*
   * A preview/development client can still expose expoGoConfig-like manifest
   * data, so that value alone is not a reliable build detector.
   *
   * The native application ID is authoritative:
   * - Expo Go Android/iOS: host.exp.exponent
   * - Guardian preview/production: com.vault.theguardian
   *
   * Only use expoGoConfig as a fallback when the native application ID is
   * unavailable (for example, an unusual test runtime).
   */
  const nativeApplicationId = String(
    Application.applicationId || ''
  ).trim().toLowerCase();

  if (nativeApplicationId) {
    return nativeApplicationId === 'host.exp.exponent';
  }

  return Boolean(Constants.expoGoConfig);
}

function remotePushSupported() {
  return Platform.OS !== 'web' && !runningInExpoGo();
}

function unsupportedBuildError() {
  return new Error(
    'Remote push notifications require a Guardian development, preview, or production build. They are not available in Expo Go.'
  );
}

/**
 * expo-notifications must not be imported at module startup.
 *
 * On Android SDK 53+, Expo Go throws as soon as the native remote-push
 * implementation is loaded. Loading it lazily allows the rest of Guardian to
 * continue running in Expo Go while clearly reporting that remote push is not
 * supported there.
 */
async function getNotificationsModule(): Promise<NotificationsApi> {
  if (!remotePushSupported()) {
    throw unsupportedBuildError();
  }

  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications')
      .then((Notifications) => {
        if (!notificationHandlerConfigured) {
          Notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldPlaySound: true,
              shouldSetBadge: true,
              shouldShowBanner: true,
              shouldShowList: true,
            }),
          });
          notificationHandlerConfigured = true;
        }

        return Notifications;
      })
      .catch((error) => {
        notificationsModulePromise = null;
        throw error;
      });
  }

  return notificationsModulePromise;
}

function normalizeRoute(routeValue?: unknown) {
  const raw = String(routeValue || '').trim();
  if (!raw) return '/notifications';

  const legacy = raw === '/twofactor' ? '/twofasetup' : raw;
  const [path, query = ''] = legacy.split('?');

  if (!ALLOWED_ROUTES.has(path)) return '/notifications';
  if (!query) return path;

  const params = new URLSearchParams(query);
  const unexpected = Array.from(params.keys()).some(
    (key) => key !== 'tab'
  );
  const tab = params.get('tab');

  if (path === '/estateplaybooks') {
    return !unexpected && tab === 'received'
      ? '/estateplaybooks?tab=received'
      : '/estateplaybooks';
  }

  if (path === '/continuitydrill') {
    return !unexpected && tab === 'requests'
      ? '/continuitydrill?tab=requests'
      : '/continuitydrill';
  }

  if (path === '/vault') {
    return !unexpected && tab && ALLOWED_VAULT_TABS.has(tab)
      ? `/vault?tab=${encodeURIComponent(tab)}`
      : '/vault';
  }

  return path;
}

async function configureAndroidChannels(
  Notifications: NotificationsApi
) {
  if (Platform.OS !== 'android') return;

  await Promise.all([
    Notifications.setNotificationChannelAsync('guardian-security', {
      name: 'Guardian security alerts',
      description: 'Urgent account, recovery and Safety Check alerts.',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#0B8FAC',
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PRIVATE,
      bypassDnd: false,
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync('guardian-actions', {
      name: 'Guardian actions',
      description:
        'Emergency, Recovery Circle and protected-item requests.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: '#0B8FAC',
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PRIVATE,
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync('guardian-reminders', {
      name: 'Guardian reminders',
      description: 'Continuity and subscription reminders.',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#0B8FAC',
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PRIVATE,
      sound: 'default',
    }),
  ]);
}

function permissionGranted(
  Notifications: NotificationsApi,
  status: NotificationPermissionsStatus
) {
  if (Platform.OS !== 'ios') {
    return status.status === 'granted';
  }

  const iosStatus = status.ios?.status;

  return (
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

function getProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    null
  );
}

function getDeviceName() {
  return (
    [Device.manufacturer, Device.modelName]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    (Platform.OS === 'ios' ? 'iOS device' : 'Android device')
  );
}

function getAppVersion() {
  return (
    Application.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    'unknown'
  );
}


async function getCurrentStoredUserKey() {
  try {
    const entries = await AsyncStorage.multiGet(['userId', 'userEmail']);
    const values = Object.fromEntries(entries);
    const userId = String(values.userId || '').trim();
    if (userId) return `id:${userId}`;

    const email = String(values.userEmail || '').trim().toLowerCase();
    return email ? `email:${email}` : '';
  } catch (error: unknown) {
    safeLogError('PUSH_USER_ID_READ', error);
    return '';
  }
}

function parseStoredTimestamp(value: string | null) {
  const timestamp = Number(value || 0);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function clearLastNotificationResponse(
  Notifications: NotificationsApi
) {
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    // Clearing a stale response is best-effort.
  }
}

export type PushPermissionState =
  | 'granted'
  | 'denied'
  | 'undetermined';

export type PushNotificationState = {
  supported: boolean;
  permission: PushPermissionState;
  enabled: boolean;
  registered: boolean;
};

/**
 * Updates the app icon badge without loading expo-notifications in Expo Go.
 *
 * Expo Go on Android does not include remote-push native functionality on
 * SDK 53+, so route screens must use this safe wrapper instead of importing
 * expo-notifications directly.
 */
export async function setGuardianAppBadgeCount(count: number) {
  if (!remotePushSupported()) {
    return false;
  }

  try {
    const Notifications = await getNotificationsModule();
    return await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    return false;
  }
}

export async function getPushNotificationState(): Promise<PushNotificationState> {
  if (!remotePushSupported()) {
    return {
      supported: false,
      permission: 'undetermined',
      enabled: false,
      registered: false,
    };
  }

  try {
    const Notifications = await getNotificationsModule();
    const [permission, enabled, token] = await Promise.all([
      Notifications.getPermissionsAsync(),
      AsyncStorage.getItem(PUSH_ENABLED_KEY),
      AsyncStorage.getItem(PUSH_REGISTERED_TOKEN_KEY),
    ]);

    return {
      supported: true,
      permission: permissionGranted(Notifications, permission)
        ? 'granted'
        : permission.status === 'denied'
          ? 'denied'
          : 'undetermined',
      enabled: enabled === 'true',
      registered: Boolean(
        token && permissionGranted(Notifications, permission)
      ),
    };
  } catch (error: unknown) {
    safeLogError('PUSH_STATE_READ', error);
    throw new AppOperationError(
      'Guardian could not read this device notification status.',
      {
        code: 'UNKNOWN_ERROR',
        transient: isTransientError(error),
      }
    );
  }
}


async function registerTokenInternal(requestPermission: boolean) {
  if (!remotePushSupported()) {
    throw unsupportedBuildError();
  }

  if (!Device.isDevice) {
    throw new Error(
      'Remote push notifications must be tested on a physical device.'
    );
  }

  if (!(await hasStoredAuthToken())) {
    throw new Error('Sign in before enabling push notifications.');
  }

  if (await isDuressSession()) {
    throw new Error(
      'Push registration is unavailable in a decoy vault session.'
    );
  }

  const Notifications = await getNotificationsModule();
  await configureAndroidChannels(Notifications);

  let permissions = await Notifications.getPermissionsAsync();

  if (
    !permissionGranted(Notifications, permissions) &&
    requestPermission
  ) {
    permissions = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
  }

  if (!permissionGranted(Notifications, permissions)) {
    throw new Error('Notification permission was not granted.');
  }

  const projectId = getProjectId();

  if (!projectId) {
    throw new Error('The EAS project ID is missing from app.json.');
  }

  /*
   * Verify the native FCM/APNs token first. This catches a preview build that
   * contains expo-notifications but is missing valid native push credentials.
   * The Expo token is requested only after the operating system has supplied
   * a real device token.
   */
  const nativePushTokenResponse =
    await Notifications.getDevicePushTokenAsync();
  const nativePushToken = String(
    nativePushTokenResponse?.data || ''
  ).trim();

  if (!nativePushToken) {
    throw new Error(
      'Guardian could not obtain the native push token for this device.'
    );
  }

  const expoPushToken = String(
    (
      await Notifications.getExpoPushTokenAsync({ projectId })
    ).data || ''
  ).trim();

  if (!expoPushToken) {
    throw new Error(
      'Guardian could not obtain an Expo push token for this device.'
    );
  }

  const [installationId, currentUserId] = await Promise.all([
    getGuardianInstallationId(),
    getCurrentStoredUserKey(),
  ]);

  const registrationBody = {
    installationId,
    expoPushToken,
    platform: Platform.OS === 'ios' ? 'ios' as const : 'android' as const,
    deviceName: getDeviceName(),
    appVersion: getAppVersion(),
  };

  const registration = await retryAsync(
    () => api.registerPushToken(registrationBody),
    {
      maxAttempts: requestPermission ? 3 : 1,
      baseDelayMs: 800,
      maxDelayMs: 3500,
      shouldRetry: (error) => isTransientError(error),
    }
  );

  if (registration?.registered === false) {
    throw new Error(
      'Guardian could not confirm push registration with the server.'
    );
  }

  try {
    await AsyncStorage.multiSet([
      [PUSH_ENABLED_KEY, 'true'],
      [PUSH_REGISTERED_TOKEN_KEY, expoPushToken],
      [PUSH_REGISTERED_USER_KEY, currentUserId],
      [PUSH_LAST_SYNCED_AT_KEY, String(Date.now())],
    ]);
  } catch (error: unknown) {
    safeLogError('PUSH_REGISTRATION_SAVE', error);
    await api.unregisterPushToken(installationId).catch((rollbackError: unknown) => {
      safeLogError('PUSH_REGISTRATION_ROLLBACK', rollbackError);
    });
    throw new AppOperationError('Push alerts could not be saved on this device.', {
      code: 'STORAGE_UNAVAILABLE',
    });
  }

  return {
    supported: true,
    permission: 'granted' as const,
    enabled: true,
    registered: true,
  };
}

async function registerToken(requestPermission: boolean) {
  try {
    return await registerTokenInternal(requestPermission);
  } catch (error: unknown) {
    safeLogError('PUSH_REGISTRATION', error);

    const message = String((error as any)?.message || '').trim();
    const knownUserMessage =
      message.includes('physical device') ||
      message.includes('Sign in before') ||
      message.includes('decoy vault') ||
      message.includes('permission was not granted') ||
      message.includes('EAS project ID') ||
      message.includes('push token') ||
      message.includes('confirm push registration');

    if (error instanceof AppOperationError) throw error;
    if (knownUserMessage) {
      throw new AppOperationError(message);
    }

    if ((error as any)?.status || (error as any)?.code) {
      throw toAppOperationError(
        error,
        'Push alerts could not be enabled. Please try again.'
      );
    }

    throw new AppOperationError(
      'Push alerts could not be enabled. Please try again.',
      {
        code: 'UNKNOWN_ERROR',
        transient: isTransientError(error),
      }
    );
  }
}

export async function enablePushNotifications() {
  return registerToken(true);
}

export type PushSyncOptions = {
  force?: boolean;
  reason?: 'login' | 'runtime' | 'token-change' | 'manual';
};

async function syncPushNotificationsInternal(
  options: PushSyncOptions
): Promise<boolean> {
  const [
    enabledValue,
    registeredToken,
    registeredUserId,
    lastSyncedAtValue,
    currentUserId,
  ] = await Promise.all([
    AsyncStorage.getItem(PUSH_ENABLED_KEY),
    AsyncStorage.getItem(PUSH_REGISTERED_TOKEN_KEY),
    AsyncStorage.getItem(PUSH_REGISTERED_USER_KEY),
    AsyncStorage.getItem(PUSH_LAST_SYNCED_AT_KEY),
    getCurrentStoredUserKey(),
  ]);

  if (enabledValue !== 'true' || !remotePushSupported()) {
    return false;
  }

  /* Do not initialize native push or attempt registration on signed-out screens. */
  if (!(await hasStoredAuthToken())) {
    return false;
  }

  const now = Date.now();
  const lastSyncedAt = parseStoredTimestamp(lastSyncedAtValue);
  const sameUser =
    Boolean(currentUserId) &&
    currentUserId === String(registeredUserId || '');
  const registrationFresh =
    Boolean(registeredToken) &&
    sameUser &&
    now - lastSyncedAt < PUSH_SYNC_FRESH_MS;

  /*
   * A healthy registration does not need to touch the notification native
   * module or the network on every app start/login. This was the main source
   * of contention with Home, Vault, and Security requests after push was
   * enabled.
   */
  if (!options.force && registrationFresh) {
    return true;
  }

  if (
    options.force &&
    registrationFresh &&
    now - lastForcedSyncAt < PUSH_FORCE_SYNC_DEBOUNCE_MS
  ) {
    return true;
  }

  if (options.force) lastForcedSyncAt = now;

  const Notifications = await getNotificationsModule();
  const permissions = await Notifications.getPermissionsAsync().catch(
    (error: unknown) => {
      safeLogError('PUSH_PERMISSION_READ', error);
      return null;
    }
  );

  if (!permissions || !permissionGranted(Notifications, permissions)) {
    const installationId = await getGuardianInstallationId();

    if (await hasStoredAuthToken()) {
      await api.unregisterPushToken(installationId).catch(
        (error: unknown) => safeLogError('PUSH_PERMISSION_UNREGISTER', error)
      );
    }

    await AsyncStorage.multiRemove([
      PUSH_REGISTERED_TOKEN_KEY,
      PUSH_REGISTERED_USER_KEY,
      PUSH_LAST_SYNCED_AT_KEY,
    ]).catch((error: unknown) => {
      safeLogError('PUSH_PERMISSION_LOCAL_CLEAR', error);
    });
    return false;
  }

  await registerToken(false);
  return true;
}

export function syncPushNotificationsAfterLogin(
  options: PushSyncOptions = {}
): Promise<boolean> {
  if (pushSyncPromise) return pushSyncPromise;

  pushSyncPromise = syncPushNotificationsInternal(options)
    .catch((error: unknown) => {
      safeLogError('PUSH_BACKGROUND_SYNC', error);
      /* Keep the user's opt-in so a later foreground/login can retry. */
      return false;
    })
    .finally(() => {
      pushSyncPromise = null;
    });

  return pushSyncPromise;
}

export async function disablePushNotifications() {
  let installationId = '';

  try {
    installationId = await getGuardianInstallationId();
    if (await hasStoredAuthToken()) {
      await api.unregisterPushToken(installationId);
    }
  } catch (error: unknown) {
    safeLogError('PUSH_SERVER_DISABLE', error);
  }

  try {
    await AsyncStorage.multiRemove([
      PUSH_ENABLED_KEY,
      PUSH_REGISTERED_TOKEN_KEY,
      PUSH_REGISTERED_USER_KEY,
      PUSH_LAST_SYNCED_AT_KEY,
    ]);
  } catch (error: unknown) {
    safeLogError('PUSH_LOCAL_DISABLE', error);
    throw new AppOperationError('Push alerts could not be disabled on this device.', {
      code: 'STORAGE_UNAVAILABLE',
    });
  } finally {
    if (remotePushSupported()) {
      const Notifications = await getNotificationsModule().catch(() => null);
      await Notifications?.setBadgeCountAsync(0).catch(() => undefined);
    }
  }
}


export async function detachPushTokenForLogout() {
  try {
    const installationId = await getGuardianInstallationId();

    if (await hasStoredAuthToken()) {
      await api.unregisterPushToken(installationId).catch((error: unknown) => {
        safeLogError('PUSH_LOGOUT_UNREGISTER', error);
      });
    }
  } catch (error: unknown) {
    safeLogError('PUSH_LOGOUT_DEVICE_ID', error);
  }

  await AsyncStorage.multiRemove([
    PUSH_REGISTERED_TOKEN_KEY,
    PUSH_REGISTERED_USER_KEY,
    PUSH_LAST_SYNCED_AT_KEY,
  ]).catch(
    (error: unknown) => safeLogError('PUSH_LOGOUT_LOCAL_CLEAR', error)
  );
}


export async function openPushNotificationSettings() {
  try {
    await Linking.openSettings();
  } catch (error: unknown) {
    safeLogError('PUSH_SETTINGS_OPEN', error);
    throw toAppOperationError(error, 'Device settings could not be opened.');
  }
}

async function routeFromNotification(
  Notifications: NotificationsApi,
  response: NotificationResponse
) {
  const identifier = response.notification.request.identifier;
  const now = Date.now();

  if (
    identifier &&
    identifier === lastHandledNotificationIdentifier &&
    now - lastHandledNotificationAt < 1500
  ) {
    return;
  }

  if (identifier) {
    lastHandledNotificationIdentifier = identifier;
    lastHandledNotificationAt = now;
  }

  const data = response.notification.request.content.data || {};
  const notificationId = String(data.notificationId || '').trim();
  const type = String(data.type || '').trim();
  let route = normalizeRoute(data.route);

  if (type === 'DURESS_ALERT') {
    route = '/notifications';
  }

  const [hasToken, locked, sessionMode, lockdown] =
    await Promise.all([
      hasStoredAuthToken(),
      AsyncStorage.getItem('vaultLocked'),
      AsyncStorage.getItem('guardianSessionMode'),
      AsyncStorage.getItem('guardianIncidentLockdown'),
    ]);

  if (sessionMode === 'DURESS') {
    clearLastNotificationResponse(Notifications);
    return;
  }

  if (!hasToken || locked === 'true') {
    await AsyncStorage.setItem(
      PENDING_PUSH_ROUTE_KEY,
      JSON.stringify({
        route,
        notificationId: notificationId || null,
      })
    );

    clearLastNotificationResponse(Notifications);
    router.replace('/signin');
    return;
  }

  if (
    lockdown === 'true' &&
    route !== '/incidentlockdown'
  ) {
    route = '/incidentlockdown';
  }

  if (notificationId) {
    await api
      .markNotificationRead(notificationId)
      .catch(() => undefined);
  }

  clearLastNotificationResponse(Notifications);
  router.push(route as never);
}

export async function consumePendingPushRoute() {
  try {
    const stored = await AsyncStorage.getItem(PENDING_PUSH_ROUTE_KEY);
    if (!stored) return false;

    await AsyncStorage.removeItem(PENDING_PUSH_ROUTE_KEY);

    let route = stored;
    let notificationId = '';

    try {
      const parsed = JSON.parse(stored);
      route = String(parsed?.route || '/notifications');
      notificationId = String(parsed?.notificationId || '');
    } catch {
      // Backward compatibility with the previous plain-route format.
    }

    if (notificationId) {
      await api.markNotificationRead(notificationId).catch((error: unknown) => {
        safeLogError('PUSH_PENDING_MARK_READ', error);
      });
    }

    const lockdown =
      (await AsyncStorage.getItem('guardianIncidentLockdown')) === 'true';

    router.push(
      (lockdown ? '/incidentlockdown' : normalizeRoute(route)) as never
    );

    return true;
  } catch (error: unknown) {
    safeLogError('PUSH_PENDING_ROUTE', error);
    return false;
  }
}


const runPushTask = (
  label: string,
  task: () => Promise<unknown>
) => {
  void task().catch((error: unknown) => {
    safeLogError(label, error);
  });
};

/**
 * Starts the runtime only in a custom Guardian build.
 *
 * It deliberately returns a synchronous cleanup function because React
 * effects cannot return a Promise.
 */
export function startPushNotificationRuntime() {
  if (!remotePushSupported()) {
    return () => undefined;
  }

  let disposed = false;
  let runtimeSyncTimer: ReturnType<typeof setTimeout> | null = null;
  const subscriptions: NotificationSubscription[] = [];

  const rememberSubscription = (
    subscription: NotificationSubscription
  ) => {
    if (disposed) {
      subscription.remove();
      return;
    }

    subscriptions.push(subscription);
  };

  void (async () => {
    const Notifications = await getNotificationsModule();
    await configureAndroidChannels(Notifications);

    if (disposed) return;

    rememberSubscription(
      Notifications.addNotificationReceivedListener(() => {
        api.clearCache('GET:/vault/notifications');
        api.clearCache('GET:/vault/notifications/unread-count');

        void Notifications.getBadgeCountAsync()
          .then((count) =>
            Notifications.setBadgeCountAsync(
              Math.max(0, count) + 1
            )
          )
          .catch(() => undefined);
      })
    );

    rememberSubscription(
      Notifications.addNotificationResponseReceivedListener(
        (response) => {
          runPushTask('PUSH_NOTIFICATION_ROUTE', () =>
            routeFromNotification(Notifications, response)
          );
        }
      )
    );

    rememberSubscription(
      Notifications.addPushTokenListener(() => {
        runPushTask('PUSH_TOKEN_SYNC', () =>
          syncPushNotificationsAfterLogin({
            force: true,
            reason: 'token-change',
          })
        );
      })
    );

    /*
     * SDK 56 deprecates getLastNotificationResponseAsync(). The synchronous
     * method is the supported replacement and is safe to call during runtime
     * setup.
     */
    const lastResponse =
      Notifications.getLastNotificationResponse();

    if (lastResponse) {
      runPushTask('PUSH_LAST_RESPONSE_ROUTE', () =>
        routeFromNotification(Notifications, lastResponse)
      );
    }

    runtimeSyncTimer = setTimeout(() => {
      if (disposed) return;
      runPushTask('PUSH_TOKEN_SYNC', () =>
        syncPushNotificationsAfterLogin({ reason: 'runtime' })
      );
    }, PUSH_RUNTIME_SYNC_DELAY_MS);
  })().catch((error: unknown) => {
    safeLogError('PUSH_RUNTIME_START', error);
  });

  return () => {
    disposed = true;

    if (runtimeSyncTimer) {
      clearTimeout(runtimeSyncTimer);
      runtimeSyncTimer = null;
    }

    subscriptions.splice(0).forEach((subscription) => {
      try {
        subscription.remove();
      } catch {
        // Cleanup must not crash the root layout.
      }
    });
  };
}
