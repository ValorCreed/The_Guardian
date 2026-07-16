import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * Privacy-safe analytics for The Guardian.
 *
 * This file intentionally sends only product usage events to PostHog.
 * It must never receive or send vault secrets such as passwords, card numbers,
 * CVVs, secure note contents, document contents, recovery codes, JWTs, or emails.
 *
 * The implementation uses PostHog's capture endpoint directly instead of enabling
 * session replay/autocapture. That is safer for a vault app and works in Expo Go,
 * preview builds, and production builds without adding native analytics modules.
 */

declare const process: { env?: Record<string, string | undefined> } | undefined;

type AnalyticsValue = string | number | boolean | null;
type AnalyticsProperties = Record<string, AnalyticsValue | undefined>;

const ANALYTICS_ENABLED_KEY = 'theguardian.analytics.enabled';
const ANALYTICS_DISTINCT_ID_KEY = 'theguardian.analytics.distinct_id';
const ANALYTICS_USER_ID_KEY = 'theguardian.analytics.user_id';

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

const BLOCKED_PROPERTY_PARTS = [
  'password',
  'passcode',
  'cardnumber',
  'card_number',
  'cvv',
  'cvc',
  'token',
  'jwt',
  'secret',
  'recovery',
  'content',
  'note',
  'documentbody',
  'fileuri',
  'uri',
  'email',
  'fullname',
  'full_name',
  'name',
  'username',
];

let distinctIdCache: string | null = null;
let lastScreenPath: string | null = null;

function getPostHogApiKey() {
  return process?.env?.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() || '';
}

function getPostHogHost() {
  const configuredHost = process?.env?.EXPO_PUBLIC_POSTHOG_HOST?.trim();
  return (configuredHost || DEFAULT_POSTHOG_HOST).replace(/\/$/, '');
}

function generateDistinctId() {
  const randomPart = Math.random().toString(36).slice(2, 12);
  return `guardian_anon_${Date.now()}_${randomPart}`;
}

async function safeSecureStoreGet(key: string) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return AsyncStorage.getItem(key);
  }
}

async function safeSecureStoreSet(key: string, value: string) {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    await AsyncStorage.setItem(key, value);
  }
}

export async function getAnalyticsDistinctId() {
  if (distinctIdCache) return distinctIdCache;

  // After login, use the backend user ID as the stable analytics identity.
  // This lets PostHog group usage by account without sending names, emails,
  // passwords, cards, notes, documents, or other vault contents.
  const storedUserId = await safeSecureStoreGet(ANALYTICS_USER_ID_KEY);
  if (storedUserId) {
    const userDistinctId = `guardian_user_${storedUserId}`;
    distinctIdCache = userDistinctId;
    return userDistinctId;
  }

  const existing = await safeSecureStoreGet(ANALYTICS_DISTINCT_ID_KEY);
  if (existing) {
    distinctIdCache = existing;
    return existing;
  }

  const created = generateDistinctId();
  await safeSecureStoreSet(ANALYTICS_DISTINCT_ID_KEY, created);
  distinctIdCache = created;
  return created;
}

export async function getAnalyticsEnabledPreference() {
  // Analytics is intentionally always on for privacy-preserving product events.
  // We still keep this function so older imports do not break.
  // Remove any old saved opt-out value from the previous Settings toggle.
  try {
    await AsyncStorage.removeItem(ANALYTICS_ENABLED_KEY);
  } catch {
    // Ignore storage cleanup errors.
  }

  return true;
}

export async function setAnalyticsEnabledPreference(_enabled: boolean) {
  // Analytics is no longer user-toggleable from Settings.
  // This function remains as a no-op for backwards compatibility.
  try {
    await AsyncStorage.removeItem(ANALYTICS_ENABLED_KEY);
  } catch {
    // Ignore storage cleanup errors.
  }
}

export function getAnalyticsFileKind(mimeType?: string | null) {
  const value = String(mimeType || '').toLowerCase();

  if (value.includes('pdf')) return 'PDF';
  if (value.includes('word') || value.includes('document')) return 'DOCX';
  if (value.includes('sheet') || value.includes('excel')) return 'XLSX';
  if (value.includes('presentation') || value.includes('powerpoint')) return 'PPTX';
  if (value.startsWith('image/')) return 'IMAGE';
  if (value.startsWith('video/')) return 'VIDEO';
  if (value.startsWith('audio/')) return 'AUDIO';
  if (value.includes('zip') || value.includes('compressed')) return 'ARCHIVE';
  if (value.includes('text') || value.includes('csv')) return 'TEXT';

  return 'OTHER';
}

export function getAnalyticsSizeBucket(sizeBytes?: number | null) {
  const size = Number(sizeBytes || 0);

  if (!size || Number.isNaN(size)) return 'unknown';
  if (size < 1024 * 1024) return '<1MB';
  if (size < 5 * 1024 * 1024) return '1-5MB';
  if (size < 20 * 1024 * 1024) return '5-20MB';
  return '20MB+';
}

function normalizePath(path?: string | null) {
  if (!path) return 'unknown';

  const base = String(path).split('?')[0];
  return base
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/[a-f0-9]{16,}/gi, ':id');
}

function inferFeatureFromPath(path?: string | null) {
  const route = normalizePath(path).toLowerCase();

  if (route.includes('/vault/documents')) return 'DOCUMENT';
  if (route.includes('/vault/cards')) return 'CARD';
  if (route.includes('/vault/notes')) return 'NOTE';
  if (route.includes('/api/vault')) return 'PASSWORD';
  if (route.includes('/family')) return 'FAMILY';
  if (route.includes('/backup')) return 'BACKUP';
  if (route.includes('/payments') || route.includes('/subscriptions')) return 'SUBSCRIPTION';
  if (route.includes('/support/bug-reports')) return 'BUG_REPORT';
  if (route.includes('/sessions')) return 'DEVICE_SESSION';

  return 'UNKNOWN';
}

function normalizeScreenName(pathname: string) {
  const path = normalizePath(pathname);

  const names: Record<string, string> = {
    '/': 'Welcome',
    '/index': 'Welcome',
    '/login': 'Welcome',
    '/signin': 'Sign In',
    '/signup': 'Sign Up',
    '/verification': 'Verification',
    '/home': 'Home',
    '/vault': 'Vault',
    '/vaultdetails': 'Vault Details',
    '/addpassword': 'Add Password',
    '/addcard': 'Add Card',
    '/adddocument': 'Add Document',
    '/addnote': 'Add Secure Note',
    '/notedetails': 'Secure Note Details',
    '/security': 'Security',
    '/family': 'Family',
    '/newmember': 'New Family Member',
    '/settings': 'Settings',
    '/subscription': 'Subscription',
    '/backup': 'Backup',
    '/recoverykit': 'Recovery Kit',
    '/emergencyaccess': 'Emergency Access',
    '/privacy': 'Privacy Policy',
    '/terms': 'Terms of Service',
    '/bugreport': 'Bug Report',
    '/autolock': 'Auto Lock',
  };

  return names[path] || path.replace(/^\//, '').replace(/-/g, ' ') || 'Unknown';
}

function isBlockedPropertyKey(key: string) {
  const compact = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
  return BLOCKED_PROPERTY_PARTS.some((part) => compact.includes(part));
}

function sanitizeProperties(properties: AnalyticsProperties = {}) {
  const safe: Record<string, AnalyticsValue> = {};

  Object.entries(properties).forEach(([key, value]) => {
    if (value === undefined) return;
    if (isBlockedPropertyKey(key)) return;

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      safe[key] = typeof value === 'string' && value.length > 120
        ? `${value.slice(0, 120)}…`
        : value;
    }
  });

  return safe;
}

async function getCommonProperties() {
  const plan = await AsyncStorage.getItem('subscriptionPlan');

  return {
    app_name: 'The Guardian',
    app_version: Constants.expoConfig?.version || 'unknown',
    platform: Platform.OS,
    environment: __DEV__ ? 'development' : 'production',
    subscription_plan: plan || 'UNKNOWN',
    expo_channel: Updates.channel || 'unknown',
    expo_runtime_version: Updates.runtimeVersion || 'unknown',
    expo_update_id: Updates.updateId || 'embedded',
  };
}

async function capturePostHogRaw(body: Record<string, any>) {
  const apiKey = getPostHogApiKey();

  if (!apiKey) {
    if (__DEV__) {
      console.log(
        '[Analytics] Missing EXPO_PUBLIC_POSTHOG_API_KEY. Check that .env.local is beside package.json, then restart Expo with: npx expo start -c'
      );
    }
    return;
  }

  await fetch(`${getPostHogHost()}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      ...body,
    }),
  });
}

export async function identifyAnalyticsUser(options: {
  userId?: string | number | null;
  plan?: string | null;
}) {
  try {
    const rawUserId = options.userId;
    if (rawUserId === undefined || rawUserId === null || String(rawUserId).trim() === '') {
      return;
    }

    const userId = String(rawUserId).trim();
    const previousDistinctId = await getAnalyticsDistinctId();
    const userDistinctId = `guardian_user_${userId}`;

    await safeSecureStoreSet(ANALYTICS_USER_ID_KEY, userId);
    distinctIdCache = userDistinctId;

    await capturePostHogRaw({
      event: '$identify',
      distinct_id: userDistinctId,
      properties: {
        $anon_distinct_id: previousDistinctId,
        $set: {
          // PostHog will display this person as User <id>.
          // Keep the real name/email out of analytics for a vault app.
          $name: `User ${userId}`,
          guardian_user_id: userId,
          subscription_plan: options.plan || 'UNKNOWN',
          app_name: 'The Guardian',
          platform: Platform.OS,
        },
      },
    });
  } catch (error) {
    if (__DEV__) console.log('Analytics identify skipped', error);
  }
}

export async function clearAnalyticsUser() {
  try {
    await SecureStore.deleteItemAsync(ANALYTICS_USER_ID_KEY);
  } catch {
    try {
      await AsyncStorage.removeItem(ANALYTICS_USER_ID_KEY);
    } catch {
      // Ignore cleanup errors.
    }
  }

  distinctIdCache = null;
}

export async function captureAnalyticsEvent(
  eventName: string,
  properties: AnalyticsProperties = {},
  options: { ignorePreference?: boolean } = {}
) {
  try {
    const apiKey = getPostHogApiKey();
    if (!apiKey) {
      if (__DEV__) {
        console.log(
          '[Analytics] Missing EXPO_PUBLIC_POSTHOG_API_KEY. Check that .env.local is beside package.json, then restart Expo with: npx expo start -c'
        );
      }
      return;
    }

    const enabled = options.ignorePreference ? true : await getAnalyticsEnabledPreference();
    if (!enabled) return;

    const distinctId = await getAnalyticsDistinctId();
    const commonProperties = await getCommonProperties();
    const safeProperties = sanitizeProperties(properties);

    await capturePostHogRaw({
      event: eventName,
      distinct_id: distinctId,
      properties: {
        ...commonProperties,
        ...safeProperties,
      },
    });
  } catch (error) {
    if (__DEV__) {
      console.log('Analytics event skipped', eventName, error);
    }
  }
}

export function trackScreenView(pathname: string) {
  const path = normalizePath(pathname);

  if (!path || path === lastScreenPath) return;

  lastScreenPath = path;

  void captureAnalyticsEvent('screen_viewed', {
    screen: normalizeScreenName(path),
    route: path,
  });
}

export function trackApiFailure(path: string, status?: number, code?: string) {
  void captureAnalyticsEvent('api_request_failed', {
    route: normalizePath(path),
    feature: inferFeatureFromPath(path),
    status: status || 0,
    code: code || 'UNKNOWN',
  });
}

export function trackPlanLimitReached(pathOrFeature: string, status?: number) {
  const feature = pathOrFeature.startsWith('/')
    ? inferFeatureFromPath(pathOrFeature)
    : pathOrFeature;

  void captureAnalyticsEvent('plan_limit_reached', {
    feature,
    status: status || 0,
  });
}

export function trackLoginSuccess() {
  void captureAnalyticsEvent('login_success');
}

export function trackLogout() {
  void captureAnalyticsEvent('logout');
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    getAnalyticsDistinctId().catch(() => undefined);
  }, []);

  return React.createElement(React.Fragment, null, children);
}

export function AnalyticsRouteTracker({ pathname }: { pathname: string }) {
  useEffect(() => {
    trackScreenView(pathname);
  }, [pathname]);

  return null;
}
