import React, { useEffect } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * Privacy-safe, storage-conscious analytics for The Guardian.
 *
 * Design goals:
 * - Keep stable identified users in PostHog without sending names or emails.
 * - Measure important product actions, reliability, engagement, and funnels.
 * - Avoid flooding analytics with repeated screen views and repeated failures.
 * - Never send vault contents, credentials, document contents, recovery codes,
 *   JWTs, email addresses, file URIs, or other sensitive values.
 *
 * Session replay and autocapture remain disabled intentionally.
 */

declare const process: {
  env: {
    EXPO_PUBLIC_POSTHOG_API_KEY?: string;
    EXPO_PUBLIC_POSTHOG_HOST?: string;
  };
};

type AnalyticsValue = string | number | boolean | null;
type AnalyticsProperties = Record<string, AnalyticsValue | undefined>;

type CaptureOptions = {
  ignorePreference?: boolean;
  cooldownKey?: string;
  cooldownMs?: number;
};

type SessionMetrics = {
  startedAt: number;
  screenViewCount: number;
  screenVisits: Map<string, number>;
  featureActionCount: number;
  featureActions: Map<string, number>;
  apiRequestCount: number;
  apiFailureCount: number;
  apiSlowCount: number;
  apiDurationTotalMs: number;
  apiMaxDurationMs: number;
  apiFeatures: Map<string, number>;
};

const ANALYTICS_ENABLED_KEY = 'theguardian.analytics.enabled';
const ANALYTICS_DISTINCT_ID_KEY = 'theguardian.analytics.distinct_id';
const ANALYTICS_USER_ID_KEY = 'theguardian.analytics.user_id';
const ANALYTICS_LAST_ACTIVE_DAY_KEY = 'theguardian.analytics.last_active_day';
const ANALYTICS_PENDING_SESSION_KEY = 'theguardian.analytics.pending_session_summary';

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
const POSTHOG_TIMEOUT_MS = 8000;
const API_SLOW_REQUEST_MS = 3000;
const API_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const SLOW_API_COOLDOWN_MS = 10 * 60 * 1000;
const PLAN_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;
const MAX_UNIQUE_SCREEN_EVENTS_PER_SESSION = 15;

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
  'recoverykey',
  'recovery_key',
  'recoverycode',
  'recovery_code',
  'content',
  'documentbody',
  'document_body',
  'fileuri',
  'file_uri',
  'email',
  'fullname',
  'full_name',
  'username',
  'name',
  'message',
  'description',
  'steps',
  'relationship',
  'filename',
  'file_name',
  'documentname',
  'document_name',
  'cardname',
  'card_name',
  'contactname',
  'contact_name',
];

let distinctIdCache: string | null = null;
let lastScreenPath: string | null = null;
let currentSessionId: string | null = null;
let currentSessionMetrics: SessionMetrics | null = null;
let lastAppState: AppStateStatus = AppState.currentState;
let screenEventsSent = new Set<string>();

const eventCooldowns = new Map<
  string,
  { lastSentAt: number; suppressedCount: number }
>();

function getPostHogApiKey() {
  return process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() || '';
}

function getPostHogHost() {
  const configuredHost = process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim();
  return (configuredHost || DEFAULT_POSTHOG_HOST).replace(/\/$/, '');
}

function generateDistinctId() {
  const randomPart = Math.random().toString(36).slice(2, 12);
  return `guardian_anon_${Date.now()}_${randomPart}`;
}

function generateSessionId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `guardian_session_${Date.now()}_${randomPart}`;
}

function createSessionMetrics(): SessionMetrics {
  return {
    startedAt: Date.now(),
    screenViewCount: 0,
    screenVisits: new Map<string, number>(),
    featureActionCount: 0,
    featureActions: new Map<string, number>(),
    apiRequestCount: 0,
    apiFailureCount: 0,
    apiSlowCount: 0,
    apiDurationTotalMs: 0,
    apiMaxDurationMs: 0,
    apiFeatures: new Map<string, number>(),
  };
}

function ensureAnalyticsSession() {
  if (currentSessionId && currentSessionMetrics) return currentSessionId;

  currentSessionId = generateSessionId();
  currentSessionMetrics = createSessionMetrics();
  lastScreenPath = null;
  screenEventsSent = new Set<string>();

  return currentSessionId;
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
  try {
    await AsyncStorage.removeItem(ANALYTICS_ENABLED_KEY);
  } catch {
    // Analytics cleanup must never affect the app.
  }

  return true;
}

export async function setAnalyticsEnabledPreference(_enabled: boolean) {
  try {
    await AsyncStorage.removeItem(ANALYTICS_ENABLED_KEY);
  } catch {
    // Kept as a no-op for backward compatibility.
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

function normalizeAnalyticsLabel(value?: string | null) {
  return String(value || 'UNKNOWN')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
    .toUpperCase() || 'UNKNOWN';
}

function inferFeatureFromPath(path?: string | null) {
  const route = normalizePath(path).toLowerCase();

  if (route.includes('/auth/')) return 'AUTH';
  if (route.includes('/emergency/')) return 'EMERGENCY_ACCESS';
  if (route.includes('/recovery-kit')) return 'RECOVERY_KIT';
  if (route.includes('/security-alerts')) return 'SECURITY';
  if (route.includes('/vault/documents')) return 'DOCUMENT';
  if (route.includes('/vault/cards')) return 'CARD';
  if (route.includes('/vault/notes')) return 'NOTE';
  if (route.includes('/api/vault')) return 'PASSWORD';
  if (route.includes('/family')) return 'FAMILY';
  if (route.includes('/backup')) return 'BACKUP';
  if (route.includes('/payments') || route.includes('/subscriptions')) return 'SUBSCRIPTION';
  if (route.includes('/notifications')) return 'NOTIFICATION';
  if (route.includes('/support/bug-reports')) return 'BUG_REPORT';
  if (route.includes('/sessions')) return 'DEVICE_SESSION';
  if (route.includes('/users/')) return 'ACCOUNT';

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
    '/securityhealth': 'Security Health',
    '/family': 'Family',
    '/newmember': 'New Family Member',
    '/settings': 'Settings',
    '/subscription': 'Subscription',
    '/backup': 'Backup',
    '/recoverykit': 'Recovery Kit',
    '/emergencyaccess': 'Emergency Access',
    '/addemergencycontact': 'Add Emergency Contact',
    '/emergencyrequest': 'Emergency Request',
    '/emergencyvault': 'Emergency Vault',
    '/notifications': 'Notifications',
    '/privacy': 'Privacy Policy',
    '/terms': 'Terms of Service',
    '/bugreport': 'Bug Report',
    '/autolock': 'Auto Lock',
    '/autofill': 'Autofill',
  };

  return names[path] || path.replace(/^\//, '').replace(/-/g, ' ') || 'Unknown';
}

function isBlockedPropertyKey(key: string) {
  const compact = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
  return BLOCKED_PROPERTY_PARTS.some((part) => compact.includes(part));
}

function looksSensitiveString(value: string) {
  const trimmed = value.trim();

  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(trimmed)) return true;
  if (/^Bearer\s+/i.test(trimmed)) return true;
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)) return true;
  if (/^(file|content):\/\//i.test(trimmed)) return true;
  if (/^v\d+:/i.test(trimmed)) return true;
  if (trimmed.length > 100 && /^[A-Za-z0-9+/=_-]+$/.test(trimmed)) return true;

  return false;
}

function sanitizeProperties(properties: AnalyticsProperties = {}) {
  const safe: Record<string, AnalyticsValue> = {};

  Object.entries(properties).forEach(([key, value]) => {
    if (value === undefined || isBlockedPropertyKey(key)) return;

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      if (typeof value === 'string' && looksSensitiveString(value)) return;

      safe[key] =
        typeof value === 'string' && value.length > 120
          ? `${value.slice(0, 120)}…`
          : value;
    }
  });

  return safe;
}

function incrementMap(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) || 0) + 1);
}

function getTopMapEntry(map: Map<string, number>) {
  let topKey = 'NONE';
  let topCount = 0;

  map.forEach((count, key) => {
    if (count > topCount) {
      topKey = key;
      topCount = count;
    }
  });

  return { key: topKey, count: topCount };
}

function getDurationBucket(durationMs?: number | null) {
  const duration = Math.max(0, Number(durationMs || 0));

  if (duration < 250) return '<250MS';
  if (duration < 1000) return '250MS-1S';
  if (duration < 3000) return '1-3S';
  if (duration < 10000) return '3-10S';
  if (duration < 30000) return '10-30S';

  return '30S+';
}

function getSessionDurationBucket(durationMs?: number | null) {
  const duration = Math.max(0, Number(durationMs || 0));

  if (duration < 30_000) return '<30S';
  if (duration < 2 * 60_000) return '30S-2M';
  if (duration < 5 * 60_000) return '2-5M';
  if (duration < 15 * 60_000) return '5-15M';
  if (duration < 30 * 60_000) return '15-30M';

  return '30M+';
}

function getMethod(optionsMethod?: string | null) {
  return String(optionsMethod || 'GET').trim().toUpperCase();
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
    session_id: currentSessionId || 'none',
  };
}

async function capturePostHogRaw(body: Record<string, any>) {
  const apiKey = getPostHogApiKey();

  if (!apiKey) {
    if (__DEV__) {
      console.log(
        '[Analytics] Missing EXPO_PUBLIC_POSTHOG_API_KEY. Check .env.local and restart Expo with: npx expo start -c'
      );
    }
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), POSTHOG_TIMEOUT_MS);

  try {
    const response = await fetch(`${getPostHogHost()}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: apiKey,
        ...body,
      }),
    });

    return response.ok;
  } catch (error) {
    if (__DEV__) console.log('Analytics delivery skipped', error);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

function applyCooldown(
  properties: AnalyticsProperties,
  options: CaptureOptions
): AnalyticsProperties | null {
  if (!options.cooldownKey || !options.cooldownMs) return properties;

  const now = Date.now();
  const current = eventCooldowns.get(options.cooldownKey);

  if (current && now - current.lastSentAt < options.cooldownMs) {
    current.suppressedCount += 1;
    eventCooldowns.set(options.cooldownKey, current);
    return null;
  }

  const suppressedCount = current?.suppressedCount || 0;

  eventCooldowns.set(options.cooldownKey, {
    lastSentAt: now,
    suppressedCount: 0,
  });

  return suppressedCount > 0
    ? { ...properties, suppressed_count: suppressedCount }
    : properties;
}

export async function identifyAnalyticsUser(options: {
  userId?: string | number | null;
  plan?: string | null;
}) {
  try {
    const rawUserId = options.userId;

    if (
      rawUserId === undefined ||
      rawUserId === null ||
      String(rawUserId).trim() === ''
    ) {
      return;
    }

    const userId = String(rawUserId).trim();
    const previousDistinctId = await getAnalyticsDistinctId();
    const userDistinctId = `guardian_user_${userId}`;
    const anonDistinctId =
      previousDistinctId !== userDistinctId ? previousDistinctId : undefined;

    await safeSecureStoreSet(ANALYTICS_USER_ID_KEY, userId);
    distinctIdCache = userDistinctId;

    await capturePostHogRaw({
      event: '$identify',
      distinct_id: userDistinctId,
      properties: {
        ...(anonDistinctId ? { $anon_distinct_id: anonDistinctId } : {}),
        $set: {
          $name: `User ${userId}`,
          guardian_user_id: userId,
          subscription_plan: options.plan || 'UNKNOWN',
          app_name: 'The Guardian',
          platform: Platform.OS,
          last_identified_at: new Date().toISOString(),
        },
        $set_once: {
          first_identified_at: new Date().toISOString(),
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
    // Continue with AsyncStorage cleanup below.
  }

  try {
    await AsyncStorage.removeItem(ANALYTICS_USER_ID_KEY);
  } catch {
    // Analytics cleanup must never block logout.
  }

  distinctIdCache = null;
}

export async function captureAnalyticsEvent(
  eventName: string,
  properties: AnalyticsProperties = {},
  options: CaptureOptions = {}
) {
  try {
    const apiKey = getPostHogApiKey();

    if (!apiKey) {
      if (__DEV__) {
        console.log(
          '[Analytics] Missing EXPO_PUBLIC_POSTHOG_API_KEY. Check .env.local and restart Expo with: npx expo start -c'
        );
      }
      return false;
    }

    const enabled = options.ignorePreference
      ? true
      : await getAnalyticsEnabledPreference();

    if (!enabled) return false;

    const cooledProperties = applyCooldown(properties, options);
    if (!cooledProperties) return false;

    const distinctId = await getAnalyticsDistinctId();
    const commonProperties = await getCommonProperties();
    const safeProperties = sanitizeProperties(cooledProperties);

    return capturePostHogRaw({
      event: normalizeAnalyticsLabel(eventName).toLowerCase(),
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

    return false;
  }
}

async function captureDailyActive() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const lastDay = await AsyncStorage.getItem(ANALYTICS_LAST_ACTIVE_DAY_KEY);

    if (lastDay === today) return;

    const sent = await captureAnalyticsEvent(
      'app_active_daily',
      { active_day: today },
      { ignorePreference: true }
    );

    if (sent) {
      await AsyncStorage.setItem(ANALYTICS_LAST_ACTIVE_DAY_KEY, today);
    }
  } catch {
    // Daily active tracking must never affect the app.
  }
}

async function flushPendingSessionSummary() {
  try {
    const raw = await AsyncStorage.getItem(ANALYTICS_PENDING_SESSION_KEY);
    if (!raw) return;

    const pending = JSON.parse(raw) as {
      event: string;
      properties: AnalyticsProperties;
    };

    const sent = await captureAnalyticsEvent(
      pending.event,
      pending.properties,
      { ignorePreference: true }
    );

    if (sent) {
      await AsyncStorage.removeItem(ANALYTICS_PENDING_SESSION_KEY);
    }
  } catch {
    // Ignore malformed or unavailable pending analytics.
  }
}

async function beginAnalyticsSession(reason: 'launch' | 'foreground' | 'implicit') {
  if (currentSessionId && currentSessionMetrics) return;

  await flushPendingSessionSummary();

  const sessionId = ensureAnalyticsSession();

  void captureDailyActive();

  void captureAnalyticsEvent(
    'app_session_started',
    {
      session_id: sessionId,
      start_reason: reason,
    },
    { ignorePreference: true }
  );
}

async function endAnalyticsSession(reason: 'background' | 'unmount') {
  const sessionId = currentSessionId;
  const metrics = currentSessionMetrics;

  if (!sessionId || !metrics) return;

  const durationMs = Math.max(0, Date.now() - metrics.startedAt);
  const topScreen = getTopMapEntry(metrics.screenVisits);
  const topFeature = getTopMapEntry(metrics.featureActions);
  const topApiFeature = getTopMapEntry(metrics.apiFeatures);
  const averageApiDuration =
    metrics.apiRequestCount > 0
      ? Math.round(metrics.apiDurationTotalMs / metrics.apiRequestCount)
      : 0;

  const summary: AnalyticsProperties = {
    session_id: sessionId,
    end_reason: reason,
    duration_bucket: getSessionDurationBucket(durationMs),
    duration_seconds: Math.round(durationMs / 1000),
    screen_view_count: metrics.screenViewCount,
    unique_screen_count: metrics.screenVisits.size,
    top_screen: topScreen.key,
    top_screen_views: topScreen.count,
    feature_action_count: metrics.featureActionCount,
    top_feature: topFeature.key,
    top_feature_actions: topFeature.count,
    api_request_count: metrics.apiRequestCount,
    api_failure_count: metrics.apiFailureCount,
    api_slow_count: metrics.apiSlowCount,
    api_average_duration_bucket: getDurationBucket(averageApiDuration),
    api_max_duration_bucket: getDurationBucket(metrics.apiMaxDurationMs),
    top_api_feature: topApiFeature.key,
    top_api_feature_requests: topApiFeature.count,
  };

  currentSessionId = null;
  currentSessionMetrics = null;
  lastScreenPath = null;
  screenEventsSent = new Set<string>();

  try {
    await AsyncStorage.setItem(
      ANALYTICS_PENDING_SESSION_KEY,
      JSON.stringify({
        event: 'app_session_summary',
        properties: summary,
      })
    );
  } catch {
    // Continue with direct delivery even if local persistence fails.
  }

  const sent = await captureAnalyticsEvent(
    'app_session_summary',
    summary,
    { ignorePreference: true }
  );

  if (sent) {
    try {
      await AsyncStorage.removeItem(ANALYTICS_PENDING_SESSION_KEY);
    } catch {
      // Ignore cleanup failure.
    }
  }
}

export function trackScreenView(pathname: string) {
  ensureAnalyticsSession();

  const path = normalizePath(pathname);
  if (!path || path === lastScreenPath || !currentSessionMetrics) return;

  lastScreenPath = path;
  currentSessionMetrics.screenViewCount += 1;
  incrementMap(currentSessionMetrics.screenVisits, path);

  if (
    screenEventsSent.has(path) ||
    screenEventsSent.size >= MAX_UNIQUE_SCREEN_EVENTS_PER_SESSION
  ) {
    return;
  }

  screenEventsSent.add(path);

  void captureAnalyticsEvent('screen_viewed', {
    screen: normalizeScreenName(path),
    route: path,
    visit_policy: 'ONCE_PER_SESSION',
    unique_screen_order: screenEventsSent.size,
  });
}

export function trackFeatureAction(
  feature: string,
  action: string,
  properties: AnalyticsProperties = {}
) {
  ensureAnalyticsSession();

  const normalizedFeature = normalizeAnalyticsLabel(feature);
  const normalizedAction = normalizeAnalyticsLabel(action);

  if (currentSessionMetrics) {
    currentSessionMetrics.featureActionCount += 1;
    incrementMap(currentSessionMetrics.featureActions, normalizedFeature);
  }

  void captureAnalyticsEvent('feature_action', {
    feature: normalizedFeature,
    action: normalizedAction,
    result: 'SUCCESS',
    ...properties,
  });
}

export function recordApiRequest(options: {
  path: string;
  method?: string;
  status?: number;
  durationMs?: number;
  success: boolean;
  code?: string;
}) {
  ensureAnalyticsSession();

  const feature = inferFeatureFromPath(options.path);
  const route = normalizePath(options.path);
  const durationMs = Math.max(0, Number(options.durationMs || 0));

  if (currentSessionMetrics) {
    currentSessionMetrics.apiRequestCount += 1;
    currentSessionMetrics.apiDurationTotalMs += durationMs;
    currentSessionMetrics.apiMaxDurationMs = Math.max(
      currentSessionMetrics.apiMaxDurationMs,
      durationMs
    );
    incrementMap(currentSessionMetrics.apiFeatures, feature);

    if (!options.success) {
      currentSessionMetrics.apiFailureCount += 1;
    }

    if (durationMs >= API_SLOW_REQUEST_MS) {
      currentSessionMetrics.apiSlowCount += 1;
    }
  }

  if (!options.success) {
    trackApiFailure(
      options.path,
      options.status,
      options.code,
      durationMs
    );
    return;
  }

  if (durationMs >= API_SLOW_REQUEST_MS) {
    void captureAnalyticsEvent(
      'api_slow_request',
      {
        route,
        feature,
        method: getMethod(options.method),
        status: options.status || 200,
        duration_bucket: getDurationBucket(durationMs),
      },
      {
        cooldownKey: `slow:${route}:${getMethod(options.method)}`,
        cooldownMs: SLOW_API_COOLDOWN_MS,
      }
    );
  }
}

export function trackApiFailure(
  path: string,
  status?: number,
  code?: string,
  durationMs?: number
) {
  const route = normalizePath(path);
  const feature = inferFeatureFromPath(path);
  const normalizedCode = normalizeAnalyticsLabel(code || 'UNKNOWN');

  void captureAnalyticsEvent(
    'api_request_failed',
    {
      route,
      feature,
      status: status || 0,
      code: normalizedCode,
      duration_bucket: getDurationBucket(durationMs),
    },
    {
      cooldownKey: `failure:${route}:${status || 0}:${normalizedCode}`,
      cooldownMs: API_FAILURE_COOLDOWN_MS,
    }
  );
}

export function trackPlanLimitReached(pathOrFeature: string, status?: number) {
  const feature = pathOrFeature.startsWith('/')
    ? inferFeatureFromPath(pathOrFeature)
    : normalizeAnalyticsLabel(pathOrFeature);

  void captureAnalyticsEvent(
    'plan_limit_reached',
    {
      feature,
      status: status || 0,
    },
    {
      cooldownKey: `plan-limit:${feature}:${status || 0}`,
      cooldownMs: PLAN_LIMIT_COOLDOWN_MS,
    }
  );
}

export async function trackLoginSuccess() {
  ensureAnalyticsSession();

  if (currentSessionMetrics) {
    currentSessionMetrics.featureActionCount += 1;
    incrementMap(currentSessionMetrics.featureActions, 'AUTH');
  }

  return captureAnalyticsEvent('login_success');
}

export async function trackLogout() {
  ensureAnalyticsSession();

  if (currentSessionMetrics) {
    currentSessionMetrics.featureActionCount += 1;
    incrementMap(currentSessionMetrics.featureActions, 'AUTH');
  }

  return captureAnalyticsEvent('logout');
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void beginAnalyticsSession('launch');
    void getAnalyticsDistinctId().catch(() => undefined);

    lastAppState = AppState.currentState;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = lastAppState;
      lastAppState = nextState;

      if (nextState === 'active' && previousState === 'background') {
        void beginAnalyticsSession('foreground');
        return;
      }

      if (nextState === 'background' && previousState !== 'background') {
        void endAnalyticsSession('background');
      }
    });

    return () => {
      subscription.remove();
      void endAnalyticsSession('unmount');
    };
  }, []);

  return React.createElement(React.Fragment, null, children);
}

export function AnalyticsRouteTracker({ pathname }: { pathname: string }) {
  useEffect(() => {
    trackScreenView(pathname);
  }, [pathname]);

  return null;
}