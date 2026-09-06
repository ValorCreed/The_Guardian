import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import { UploadType } from 'expo-file-system';
import { clearOfflineVaultMemoryCache, markOfflineVaultStale } from './offlineVault';
import { markSecurityScoreDirty } from './securityScoreSync';
import {
  captureAnalyticsEvent,
  clearAnalyticsUser,
  getAnalyticsFileKind,
  getAnalyticsSizeBucket,
  identifyAnalyticsUser,
  recordApiRequest,
  trackFeatureAction,
  trackLoginSuccess,
  trackLogout,
  trackPlanLimitReached,
  setDuressAnalyticsSuppressed,
} from './analytics';
import {
  secureJsonRequestBody,
  validateDocumentUploadInput,
  validateDocumentUploadMetadata,
} from '../utils/inputSecurity';
import {
  AppOperationError,
  getExponentialBackoffDelay,
  isTransientError,
  retryAsync,
  sanitizeErrorPayload,
  safeLogError,
  toUserMessage,
  waitForRetry,
} from '../utils/asyncResilience';

// The gateway URL is configurable via EXPO_PUBLIC_API_BASE_URL so the backend
// can point at an emulator, a preview deploy, or the pinned real deployment.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '') ||
  'https://guardian-vault-gateway.onrender.com';
/**
 * REQUEST TIMEOUT SETTINGS
 *
 * AUTH_REQUEST_TIMEOUT_MS:
 * Login, register, forgot password, reset password, verify email.
 *
 * DEFAULT_REQUEST_TIMEOUT_MS:
 * Normal GET/POST/PUT/DELETE requests.
 *
 * LONG_REQUEST_TIMEOUT_MS:
 * Backup, restore, document upload, payment initialization.
 */
const AUTH_REQUEST_TIMEOUT_MS = 60000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const LONG_REQUEST_TIMEOUT_MS = 180000;
const VAULT_LIST_TIMEOUT_MS = 60000; // Allows one controlled cold-start retry without leaving the UI blocked for minutes.
const DOCUMENT_UPLOAD_TIMEOUT_MS = 180000; // Multipart uploads get a longer deadline than ordinary requests.

/**
 * Authentication uses a dedicated XMLHttpRequest transport.
 *
 * The previous implementation used fetch + AbortController for login while
 * other parts of the app also created short-lived fetch probes. On Android,
 * those independent fetch/abort cycles can fail before an HTTP request reaches
 * the gateway after a cold start, resume, or biometric prompt. The result is a
 * status-0 NETWORK_UNREACHABLE event even while the server is healthy.
 *
 * Keep retries restricted to login because login is safe to repeat. Account
 * creation, password reset, verification-email delivery, and similar POSTs are
 * sent only once so the app never duplicates a state-changing request.
 */
const LOGIN_TRANSPORT_RETRY_DELAYS_MS = [800, 1600, 3200] as const;
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const AUTH_APP_ACTIVE_WAIT_MS = 4000;
const AUTH_NETWORK_SETTLE_MS = 350;
const REACHABILITY_TIMEOUT_MS = 6000;

/**
 * A fetch failure that happens quickly is usually a transient Android/native
 * networking interruption rather than proof that the backend is offline.
 *
 * GET and HEAD requests may retry only while the failed attempt completed
 * inside this window. State-changing requests are never retried here.
 */
const TRANSIENT_NETWORK_FAILURE_WINDOW_MS = 15000;

const AUTH_TOKEN_SECURE_STORE_KEY = 'guardian.auth-token';
const LEGACY_AUTH_TOKEN_ASYNC_STORAGE_KEY = 'token';
const LEGACY_BIOMETRIC_PASSWORD_SECURE_STORE_KEY = 'biometricPassword';

const SESSION_END_MESSAGE_KEY = 'guardianSessionEndMessage';

export type SessionSecurityEvent = {
  type: 'SESSION_REVOKED';
  message: string;
};

type SessionSecurityListener = (event: SessionSecurityEvent) => void;

const sessionSecurityListeners = new Set<SessionSecurityListener>();
let sessionInvalidationPromise: Promise<void> | null = null;

export function subscribeToSessionSecurityEvents(
  listener: SessionSecurityListener
) {
  sessionSecurityListeners.add(listener);
  return () => sessionSecurityListeners.delete(listener);
}

export async function consumeSessionEndMessage() {
  const message = await AsyncStorage.getItem(SESSION_END_MESSAGE_KEY);
  if (message) {
    await AsyncStorage.removeItem(SESSION_END_MESSAGE_KEY);
  }
  return message;
}

async function invalidateRevokedSession(message?: string) {
  if (sessionInvalidationPromise) return sessionInvalidationPromise;

  sessionInvalidationPromise = (async () => {
    const hadToken = await hasStoredAuthToken().catch(() => false);
    if (!hadToken) return;

    const friendlyMessage = message?.trim() ||
      'This device was signed out because its Guardian session is no longer active. This can happen after a remote sign-out or Incident Lockdown. Sign in again only if you still trust this device.';

    tokenCache = null;
    clearOfflineVaultMemoryCache();
    setDuressAnalyticsSuppressed(false);

    await Promise.allSettled([
      SecureStore.deleteItemAsync(AUTH_TOKEN_SECURE_STORE_KEY),
      SecureStore.deleteItemAsync('biometricEmail'),
      SecureStore.deleteItemAsync('guardian.biometric-credential'),
      SecureStore.deleteItemAsync(LEGACY_BIOMETRIC_PASSWORD_SECURE_STORE_KEY),
      markOfflineVaultStale(),
    ]);

    try {
      const { suspendGuardianAutofillForDuressSession } = await import('./autofillSync');
      await suspendGuardianAutofillForDuressSession();
    } catch {
      // Revocation must still complete when native autofill is unavailable.
    }

    await AsyncStorage.multiSet([
      ['vaultLocked', 'true'],
      [SESSION_END_MESSAGE_KEY, friendlyMessage],
    ]);

    await AsyncStorage.multiRemove([
      LEGACY_AUTH_TOKEN_ASYNC_STORAGE_KEY,
      'userName',
      'userEmail',
      'userId',
      'subscriptionPlan',
      'emailVerified',
      'twoFactorEnabled',
      'guardianSessionMode',
      'guardianIncidentLockdown',
      'biometricUnlock',
      'guardian.biometric-credential-present',
    ]);

    await clearAnalyticsUser().catch(() => undefined);
    clearCache();

    const event: SessionSecurityEvent = {
      type: 'SESSION_REVOKED',
      message: friendlyMessage,
    };
    sessionSecurityListeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // One screen listener must not prevent the remaining listeners from running.
      }
    });
  })().finally(() => {
    sessionInvalidationPromise = null;
  });

  return sessionInvalidationPromise;
}

type ScopedApiRequestOptions = {
  signal?: AbortSignal;
  __guardianScreenRequest?: true;
};

let activeScopedSignal: AbortSignal | null = null;

let incidentRedirectScheduled = false;

const activateIncidentLockdownRedirect = async () => {
  /*
   * A 423 may also be returned to an unauthenticated login attempt from a
   * non-recovery device. Do not persist a protected-route redirect unless this
   * installation already holds a Guardian session token.
   */
  const hasToken = await hasStoredAuthToken().catch(() => false);
  if (!hasToken) return;

  await AsyncStorage.setItem('guardianIncidentLockdown', 'true');

  if (incidentRedirectScheduled) return;
  incidentRedirectScheduled = true;

  setTimeout(() => {
    try {
      router.replace('/incidentlockdown');
    } catch {
      // The root navigator may still be mounting. The layout guard will retry
      // from the persisted marker on the next route or app-state transition.
    } finally {
      incidentRedirectScheduled = false;
    }
  }, 0);
};

const createAbortError = () => {
  const error = new Error('The request was cancelled because the screen is no longer active.');
  error.name = 'AbortError';
  return error;
};

const getScopedSignal = () => activeScopedSignal;

const wait = (delayMs: number, signal?: AbortSignal | null) =>
  waitForRetry(delayMs, signal).catch((error: unknown) => {
    if (signal?.aborted) throw createAbortError();
    throw error;
  });

const isTransientHttpStatus = (status?: number) =>
  Boolean(status && TRANSIENT_HTTP_STATUSES.has(status));

const getRetryAfterDelayMs = (response?: Response | null) => {
  const raw = response?.headers?.get?.('Retry-After');
  if (!raw) return 0;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(15_000, Math.round(seconds * 1000));
  }

  const retryAt = new Date(raw).getTime();
  if (Number.isNaN(retryAt)) return 0;
  return Math.max(0, Math.min(15_000, retryAt - Date.now()));
};

type AuthTransportResponse = {
  ok: boolean;
  status: number;
  bodyText: string;
};

type AuthTransportFailureCode =
  | 'NETWORK_UNREACHABLE'
  | 'REQUEST_TIMEOUT'
  | 'REQUEST_ABORTED';

type AuthTransportFailure = Error & {
  code?: AuthTransportFailureCode;
};

let reachabilityPromise: Promise<boolean> | null = null;

function createAuthTransportFailure(
  code: AuthTransportFailureCode,
  message: string
): AuthTransportFailure {
  const error = new Error(message) as AuthTransportFailure;
  error.name = code;
  error.code = code;
  return error;
}

async function waitForAuthAppState() {
  if (AppState.currentState === 'active') {
    return;
  }

  await new Promise<void>((resolve) => {
    let completed = false;

    const finish = () => {
      if (completed) return;
      completed = true;
      clearTimeout(timeoutId);
      subscription.remove();
      resolve();
    };

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') finish();
    });

    const timeoutId = setTimeout(finish, AUTH_APP_ACTIVE_WAIT_MS);
  });

  // Android can report active slightly before its native networking layer has
  // completely resumed after a biometric/system prompt.
  await wait(AUTH_NETWORK_SETTLE_MS);
}

function xhrJsonRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: any,
  timeoutMs: number,
  externalSignal?: AbortSignal | null
): Promise<AuthTransportResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const abortFromScreen = () => {
      try {
        xhr.abort();
      } catch {
        // The request may not have opened yet. The aborted check below still rejects it.
      }
    };

    if (externalSignal?.aborted) {
      reject(createAbortError());
      return;
    }

    externalSignal?.addEventListener('abort', abortFromScreen, { once: true });

    const cleanupExternalSignal = () => {
      externalSignal?.removeEventListener('abort', abortFromScreen);
    };

    const resolveOnce = (value: AuthTransportResponse) => {
      if (settled) return;
      settled = true;
      cleanupExternalSignal();
      resolve(value);
    };

    const rejectOnce = (error: AuthTransportFailure | Error) => {
      if (settled) return;
      settled = true;
      cleanupExternalSignal();
      reject(error);
    };

    try {
      xhr.open(method, url, true);
      xhr.timeout = timeoutMs;

      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.onload = () => {
        const status = Number(xhr.status || 0);
        resolveOnce({
          status,
          ok: status >= 200 && status < 300,
          bodyText: xhr.responseText || '',
        });
      };

      xhr.onerror = () => {
        rejectOnce(
          createAuthTransportFailure(
            'NETWORK_UNREACHABLE',
            'Network request failed'
          )
        );
      };

      xhr.ontimeout = () => {
        rejectOnce(
          createAuthTransportFailure(
            'REQUEST_TIMEOUT',
            `Request timed out after ${Math.round(timeoutMs / 1000)} seconds`
          )
        );
      };

      xhr.onabort = () => {
        if (externalSignal?.aborted) {
          rejectOnce(createAbortError());
          return;
        }

        rejectOnce(
          createAuthTransportFailure('REQUEST_ABORTED', 'Request was aborted')
        );
      };

      xhr.send((body ?? null) as any);
    } catch (error: any) {
      rejectOnce(
        createAuthTransportFailure(
          'NETWORK_UNREACHABLE',
          String(error?.message || 'Network request failed')
        )
      );
    }
  });
}

export async function checkApiReachability(
  timeoutMs = REACHABILITY_TIMEOUT_MS
): Promise<boolean> {
  if (reachabilityPromise) return reachabilityPromise;

  reachabilityPromise = (async () => {
    await waitForAuthAppState();

    try {
      const response = await xhrJsonRequest(
        `${API_BASE_URL}/actuator/health?guardianProbe=${Date.now()}`,
        'GET',
        {
          Accept: 'application/json, text/plain, */*',
          'Cache-Control': 'no-cache',
        },
        null,
        timeoutMs
      );

      // Any HTTP status proves that the request reached the gateway.
      return response.status > 0;
    } catch {
      return false;
    }
  })().finally(() => {
    reachabilityPromise = null;
  });

  return reachabilityPromise;
}


export type BugReportRequestBody = {
  title: string;
  category: string;
  severity: string;
  description: string;
  stepsToReproduce?: string;
  includeDiagnostics?: boolean;
  deviceInfo?: string;
  appVersion?: string;
};

export type BugReportResponse = {
  id: number;
  title: string;
  category: string;
  severity: string;
  description: string;
  stepsToReproduce?: string | null;
  includeDiagnostics: boolean;
  deviceInfo?: string | null;
  appVersion?: string | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

export type LoginResponse = {
  token?: string | null;
  jwt?: string | null;
  accessToken?: string | null;
  id?: number;
  userId?: number;
  email?: string;
  fullname?: string;
  fullName?: string;
  plan?: 'FREE' | 'PREMIUM' | 'FAMILY' | string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  requiresTwoFactor?: boolean;
  sessionMode?: 'NORMAL' | 'DURESS' | string;
  user?: {
    id?: number;
    userId?: number;
    email?: string;
    fullname?: string;
    name?: string;
    fullName?: string;
  };
};

export type BiometricEnrollmentResponse = {
  credentialToken: string;
  expiresAt: string;
};

export type DuressContactOption = {
  contactId: number;
  userId: number;
  name: string;
  email: string;
  relationship: string;
};

export type DuressSettingsResponse = {
  plan: 'FREE' | 'PREMIUM' | 'FAMILY' | 'UNKNOWN' | string;
  eligible: boolean;
  canConfigure: boolean;
  enabled: boolean;
  alertEnabled: boolean;
  alertContactUserId?: number | null;
  alertContactEmail?: string | null;
  alertContactName?: string | null;
  alertDelayMinutes: number;
  pendingAlertCount: number;
  updatedAt?: string | null;
  message: string;
  contacts: DuressContactOption[];
};

export type LegalConsentResponse = {
  version: string;
  privacyAccepted: boolean;
  termsAccepted: boolean;
  acceptedAt?: string | null;
  clientSource?: string | null;
};

export type RegisterResponse = {
  email: string;
  message: string;
  codeExpiresAt?: string;
  verificationEmailSent: boolean;
};

export class GuardianApiError extends Error {
  status?: number;
  path?: string;
  rawMessage?: string;
  code?: string;
  data?: any;

  constructor(
    message: string,
    options: {
      status?: number;
      path?: string;
      rawMessage?: string;
      code?: string;
      data?: any;
    } = {}
  ) {
    super(toUserMessage(message));
    this.name = 'GuardianApiError';
    this.status = options.status;
    this.path = options.path;
    this.rawMessage = options.rawMessage
      ? toUserMessage(options.rawMessage, 'Request failed.')
      : undefined;
    this.code = options.code;
    this.data = sanitizeErrorPayload(options.data);
  }
}

export function isDeviceLimitError(error: any) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.rawMessage || '').toLowerCase();

  return (
    code === 'DEVICE_LIMIT_REACHED' ||
    error?.status === 409 ||
    message.includes('device_limit_reached') ||
    message.includes('one trusted device') ||
    message.includes('only one active device')
  );
}

export function getEmailDeliveryWarning(value: any): string | null {
  if (!value) return null;

  const possibleMessage = String(
    value.emailWarning ||
    value.warning ||
    value.message ||
    value.error ||
    ''
  ).trim();

  const messageLower = possibleMessage.toLowerCase();

  const flaggedByBoolean =
    value.emailSent === false ||
    value.verificationEmailSent === false ||
    value.emailDeliveryFailed === true;

  const flaggedByMessage =
    messageLower.includes('email failed') ||
    messageLower.includes('mail failed') ||
    messageLower.includes('could not send') ||
    messageLower.includes('couldn\'t send') ||
    messageLower.includes('unable to send') ||
    messageLower.includes('failed to send') ||
    (messageLower.includes('email') && messageLower.includes('try again'));

  if (!flaggedByBoolean && !flaggedByMessage) return null;

  return (
    possibleMessage ||
    'We could not send the verification email. No account has been created yet.'
  );
}

export type VaultItemType = 'PASSWORD' | 'CARD' | 'DOCUMENT' | 'NOTE';

export type VaultItem = {
  id: number;
  itemType: VaultItemType;
  title: string;
  usernameValue?: string;
  encryptedPassword?: string;
  encryptedData?: string;
  website?: string;
  notes?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type CreditCardResponse = {
  id: number;
  cardName: string;
  encryptedCardNumber: string;
  encryptedExpiryDate: string;
  encryptedCvv: string;
  encryptedCardholderName?: string;
  encryptedCardHolderName?: string;
  encryptedNotes?: string;
  createdAt?: string;
  updatedAt?: string;
};


export type SecureNoteResponse = {
  id: number;
  title: string;
  category?: string | null;
  encryptedContent: string;
  pinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type SecureNoteBody = {
  title: string;
  category?: string;
  encryptedContent: string;
  pinned?: boolean;
};

export type DownloadedDocumentFile = {
  uri: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
};

export type EmergencyContactResponse = {
  id: number;
  contactEmail: string;
  contactName?: string | null;
  relationship?: string | null;
  waitingPeriodHours: number;
  allowPasswords: boolean;
  allowCards: boolean;
  allowDocuments: boolean;
  allowNotes: boolean;
  encryptedEmergencyNote?: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type EmergencyContactBody = {
  contactEmail: string;
  contactName?: string;
  relationship?: string;
  waitingPeriodHours?: number;
  allowPasswords?: boolean;
  allowCards?: boolean;
  allowDocuments?: boolean;
  allowNotes?: boolean;
  encryptedEmergencyNote?: string;
  active?: boolean;
};

export type EmergencyAccessRequestResponse = {
  id: number;
  contactId: number;
  ownerEmail: string;
  ownerName?: string | null;
  requesterEmail: string;
  requesterName?: string | null;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'AVAILABLE' | 'CANCELLED' | string;
  message?: string | null;
  requestedAt?: string;
  availableAt?: string;
  approvedAt?: string | null;
  deniedAt?: string | null;
  passwordsAllowed: boolean;
  cardsAllowed: boolean;
  documentsAllowed: boolean;
  notesAllowed: boolean;
  encryptedEmergencyNote?: string | null;
};

export type EmergencyAuditLogResponse = {
  id: number;
  action: string;
  title: string;
  message?: string | null;
  actorEmail?: string | null;
  createdAt?: string;
};

export type EmergencyOverviewResponse = {
  plan: 'FREE' | 'PREMIUM' | 'FAMILY' | string;
  premiumOrFamily: boolean;
  contactLimit: number;
  contactCount: number;
  contacts: EmergencyContactResponse[];
  receivedRequests: EmergencyAccessRequestResponse[];
  sentRequests: EmergencyAccessRequestResponse[];
  auditLogs: EmergencyAuditLogResponse[];
};


export type GuardianSafetyCheckStatus =
  | 'DISABLED'
  | 'ACTIVE'
  | 'GRACE'
  | 'TRIGGERED'
  | string;

export type GuardianSafetyCheckContact = {
  id: number;
  name: string;
  email: string;
  relationship: string;
  registered: boolean;
  active: boolean;
  hasSharedItems: boolean;
};

export type GuardianSafetyCheckResponse = {
  plan: 'FREE' | 'PREMIUM' | 'FAMILY' | string;
  eligible: boolean;
  canConfigure: boolean;
  configured: boolean;
  enabled: boolean;
  status: GuardianSafetyCheckStatus;
  contactId?: number | null;
  contactName?: string | null;
  contactEmail?: string | null;
  intervalDays?: number | null;
  gracePeriodHours?: number | null;
  lastCheckInAt?: string | null;
  nextCheckInAt?: string | null;
  graceStartedAt?: string | null;
  triggeredAt?: string | null;
  triggeredRequestId?: number | null;
  contacts: GuardianSafetyCheckContact[];
  message: string;
};

export type UpdateGuardianSafetyCheckBody = {
  enabled: boolean;
  contactId?: number | null;
  intervalDays?: number | null;
  gracePeriodHours?: number | null;
};

export type EmergencyVaultItemResponse = {
  id: number;
  itemType: VaultItemType | string;
  title: string;
  usernameValue?: string | null;
  encryptedPassword?: string | null;
  website?: string | null;
  notes?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  encryptedData?: string | null;
  encryptedCardNumber?: string | null;
  encryptedExpiryDate?: string | null;
  encryptedCvv?: string | null;
  encryptedCardholderName?: string | null;
  encryptedCardHolderName?: string | null;
  documentName?: string | null;
  documentType?: string | null;
  encryptedFileUrl?: string | null;
  encryptedNotes?: string | null;
  category?: string | null;
  encryptedContent?: string | null;
  pinned?: boolean | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type EmergencyVaultItemsResponse = {
  requestId: number;
  ownerName: string;
  ownerEmail: string;
  passwordsAllowed: boolean;
  cardsAllowed: boolean;
  documentsAllowed: boolean;
  notesAllowed: boolean;
  passwords: EmergencyVaultItemResponse[];
  cards: EmergencyVaultItemResponse[];
  documents: EmergencyVaultItemResponse[];
  notes: EmergencyVaultItemResponse[];
};


export type FamilyMember = {
  membershipId: number;
  userId: number;
  fullName: string;
  email: string;
  joinedAt?: string;
  sharePasswords: boolean;
  shareCards: boolean;
  shareDocuments: boolean;
  shareNotes: boolean;
};

export type SharedVaultOwner = {
  ownerId: number;
  fullName: string;
  email: string;
};

export type FamilyOverview = {
  familyPlan: boolean;
  admin: boolean;
  groupId?: number | null;
  memberLimit: number;
  memberCount: number;
  members: FamilyMember[];
  sharedVaultOwners: SharedVaultOwner[];
};

export type FamilyMemberAccess = {
  membershipId: number;
  userId: number;
  fullName: string;
  email: string;
  passwordItemIds: number[];
  cardItemIds: number[];
  documentItemIds: number[];
  noteItemIds: number[];
};

export type UpdateFamilyMemberAccessBody = {
  sharePasswords: boolean;
  shareCards: boolean;
  shareDocuments: boolean;
  shareNotes: boolean;
  passwordItemIds: number[];
  cardItemIds: number[];
  documentItemIds: number[];
  noteItemIds: number[];
};

export type SharedPasswordItem = VaultItem & {
  itemType: 'PASSWORD';
  ownerId: number;
  ownerName: string;
  ownerEmail: string;
};

export type SharedCardItem = CreditCardResponse & {
  itemType: 'CARD';
  ownerId: number;
  ownerName: string;
  ownerEmail: string;
};

export type SharedDocumentItem = {
  id: number;
  itemType: 'DOCUMENT';
  documentName: string;
  documentType?: string;
  encryptedFileUrl?: string;
  encryptedNotes?: string;
  ownerId: number;
  ownerName: string;
  ownerEmail: string;
};

export type SharedNoteItem = {
  id: number;
  itemType: 'NOTE';
  title: string;
  category?: string | null;
  encryptedContent: string;
  pinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
  ownerId: number;
  ownerName: string;
  ownerEmail: string;
};

export type SharedFamilyItems = {
  passwords: SharedPasswordItem[];
  cards: SharedCardItem[];
  documents: SharedDocumentItem[];
  notes: SharedNoteItem[];
};

export type FamilyMemberPasswordRisk = {
  id: number;
  itemType: 'FAMILY_MEMBER_PASSWORD_RISK';
  title: string;
  usernameValue?: string | null;
  website?: string | null;
  memberId: number;
  memberName: string;
  memberEmail: string;
  strengthScore: number;
  strengthLabel: 'WEAK' | 'MEDIUM' | 'STRONG' | string;
  oldPassword: boolean;
  reusedPassword: boolean;
  reusedCount: number;
  riskTypes: string[];
};

export type SharedVaultItem = SharedPasswordItem;

export type UserProfileResponse = {
  userId: number;
  fullName: string;
  email: string;
};

export type SubscriptionResponse = {
  id?: number;
  plan: 'FREE' | 'PREMIUM' | 'FAMILY';
  active?: boolean;
  startedAt?: string | null;
  expiresAt?: string | null;
};

export type BackupStatusResponse = {
  allowed: boolean;
  plan: 'FREE' | 'PREMIUM' | 'FAMILY' | string;
  message: string;
  subscriptionExpiresAt?: string | null;
  passwordCount: number;
  cardCount: number;
  documentCount: number;
  familyMemberCount: number;
  totalItemCount: number;
};

export type BackupResponse = {
  fileName: string;
  createdAt: string;
  encryptedBackup: string;
  backupSizeBytes: number;
  checksum?: string;
  message?: string;
  passwordCount: number;
  cardCount: number;
  documentCount: number;
  familyMemberCount: number;
  totalItemCount: number;
};

export type BackupRestoreResponse = {
  message: string;
  restoredAt: string;
  replaceExisting: boolean;
  restoredPasswordCount: number;
  restoredCardCount: number;
  restoredDocumentCount: number;
  totalRestoredCount: number;
};

export type BackupRestoreRequest = {
  encryptedBackup: string;
  replaceExisting?: boolean;
};


export type DeviceSession = {
  id: number;
  deviceName: string;
  deviceType: string;
  ipAddress?: string | null;
  active: boolean;
  current: boolean;
  createdAt?: string | null;
  lastSeenAt?: string | null;
  revokedAt?: string | null;
};

export type AppNotificationType =
  | 'WELCOME'
  | 'TWO_FACTOR_ENABLED'
  | 'TWO_FACTOR_DISABLED'
  | 'SUBSCRIPTION_ACTIVATED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'BACKUP_CREATED'
  | 'BACKUP_RESTORED'
  | 'PASSWORD_ADDED'
  | 'CARD_ADDED'
  | 'DOCUMENT_ADDED'
  | 'NOTE_ADDED'
  | 'NOTE_UPDATED'
  | 'NOTE_DELETED'
  | 'FAMILY_MEMBER_ADDED'
  | 'FAMILY_MEMBER_REMOVED'
  | 'EMERGENCY_CONTACT_ADDED'
  | 'EMERGENCY_CONTACT_REMOVED'
  | 'EMERGENCY_ACCESS_REQUESTED'
  | 'EMERGENCY_ACCESS_APPROVED'
  | 'EMERGENCY_ACCESS_DENIED'
  | 'EMERGENCY_ACCESS_AVAILABLE'
  | 'EMERGENCY_VAULT_VIEWED'
  | 'SAFETY_CHECK_CONFIGURED'
  | 'SAFETY_CHECK_COMPLETED'
  | 'SAFETY_CHECK_GRACE_STARTED'
  | 'SAFETY_CHECK_TRIGGERED'
  | 'SAFETY_CHECK_DISABLED'
  | 'RECOVERY_KIT_CREATED'
  | 'RECOVERY_KIT_USED'
  | 'RECOVERY_KIT_REVOKED'
  | 'ACCOUNT_RESET_VAULT_ERASED'
  | 'RECOVERY_CIRCLE_CONFIGURED'
  | 'RECOVERY_CIRCLE_DISABLED'
  | 'RECOVERY_CIRCLE_MEMBER_ADDED'
  | 'RECOVERY_CIRCLE_APPROVAL_REQUESTED'
  | 'RECOVERY_CIRCLE_REQUEST_STARTED'
  | 'RECOVERY_CIRCLE_VOTE_RECORDED'
  | 'RECOVERY_CIRCLE_APPROVED'
  | 'RECOVERY_CIRCLE_DENIED'
  | 'RECOVERY_CIRCLE_CANCELLED'
  | 'RECOVERY_CIRCLE_COMPLETED'
  | 'ESTATE_PLAYBOOK_CREATED'
  | 'ESTATE_PLAYBOOK_UPDATED'
  | 'ESTATE_PLAYBOOK_ARCHIVED'
  | 'ESTATE_PLAYBOOK_RELEASED'
  | 'ESTATE_PLAYBOOK_VIEWED'
  | 'ESTATE_PLAYBOOK_COMPLETED'
  | 'ESTATE_PLAYBOOK_CANCELLED'
  | 'CONTINUITY_DRILL_STARTED'
  | 'CONTINUITY_DRILL_ACK_REQUESTED'
  | 'CONTINUITY_DRILL_ACKNOWLEDGED'
  | 'CONTINUITY_DRILL_COMPLETED'
  | 'CONTINUITY_DRILL_EXPIRED'
  | 'CONTINUITY_DRILL_CANCELLED'
  | 'DURESS_ALERT'
  | 'INCIDENT_LOCKDOWN_STARTED'
  | 'INCIDENT_PASSWORD_ROTATED'
  | 'INCIDENT_LOCKDOWN_COMPLETED'
  | 'INCIDENT_LOCKDOWN_RECOVERED'
  | 'INCIDENT_LOCKDOWN_CANCELLED'
  | 'SECURITY_ALERT'
  | 'PASSWORD_BREACHED'
  | 'SECURITY_SCAN_ALERT'
  | 'NEW_DEVICE_LOGIN'
  | 'SESSION_REVOKED'
  | 'SYSTEM';

export type AppNotification = {
  id: number;
  type: AppNotificationType | string;
  title: string;
  message: string;
  actionRoute?: string | null;
  read: boolean;
  createdAt: string;
};

export type NotificationUnreadCountResponse = {
  unreadCount: number;
};

export type RegisterPushTokenRequest = {
  installationId: string;
  expoPushToken: string;
  platform: 'android' | 'ios';
  deviceName: string;
  appVersion?: string | null;
};

export type PushTokenResponse = {
  registered: boolean;
  installationId: string;
  platform: string;
  deviceName: string;
  lastSeenAt: string;
};

export type NotificationPreferences = {
  pushEnabled: boolean;
  securityAlerts: boolean;
  emergencyRecovery: boolean;
  continuityReminders: boolean;
  billing: boolean;
  productUpdates: boolean;
};

export type UpdateNotificationPreferences = Partial<NotificationPreferences>;

export type SecurityScanAlertRequest = {
  score: number;
  totalIssues: number;
  breachedCount: number;
  weakCount: number;
  reusedCount: number;
  oldCount: number;
};

export type SecurityScanAlertResponse = {
  message: string;
};


export type RecoveryKitStatusResponse = {
  created: boolean;
  recoveryId?: string | null;
  createdAt?: string | null;
  lastUsedAt?: string | null;
};

export type RecoveryKitResponse = {
  recoveryId: string;
  recoveryKey: string;
  createdAt: string;
  message: string;
};

export type RecoveryPasswordResetBody = {
  recoveryId: string;
  recoveryKey: string;
  newPassword: string;
};

export type AccountResetEraseBody = {
  email: string;
  resetCode: string;
  newPassword: string;
};


export type RecoveryCircleCandidate = {
  contactId: number;
  userId: number;
  name: string;
  email: string;
  relationship: string;
};

export type RecoveryCircleMember = {
  id: number;
  userId: number;
  name: string;
  email: string;
};

export type RecoveryCircleRequest = {
  requestId: string;
  ownerName: string;
  ownerEmail: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | string;
  approvalCount: number;
  denialCount: number;
  threshold: number;
  memberCount: number;
  createdAt: string;
  expiresAt: string;
  approvedAt?: string | null;
  completedAt?: string | null;
  canVote: boolean;
  currentUserDecision?: 'APPROVED' | 'DENIED' | string | null;
};

export type RecoveryCircleOverview = {
  plan: 'FREE' | 'PREMIUM' | 'FAMILY' | 'UNKNOWN' | string;
  eligible: boolean;
  canConfigure: boolean;
  configured: boolean;
  enabled: boolean;
  threshold: number;
  members: RecoveryCircleMember[];
  candidates: RecoveryCircleCandidate[];
  ownedRequests: RecoveryCircleRequest[];
  approvalRequests: RecoveryCircleRequest[];
  recoveryCode?: string | null;
  message: string;
};

export type UpdateRecoveryCircleBody = {
  enabled: boolean;
  threshold?: number;
  memberUserIds?: number[];
  password: string;
};

export type StartRecoveryCircleResponse = {
  requestId: string;
  threshold: number;
  expiresAt: string;
  message: string;
};

export type RecoveryCirclePublicStatus = {
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | string;
  approvalCount: number;
  threshold: number;
  expiresAt: string;
  canComplete: boolean;
  message: string;
};

export type RecoveryCircleCredentials = {
  requestId: string;
  recoveryCode: string;
};

export type EstateActionType =
  | 'RELEASE'
  | 'TRANSFER'
  | 'CANCEL'
  | 'DELETE'
  | 'ARCHIVE'
  | 'NEVER_RELEASE';

export type EstateTriggerType =
  | 'OWNER_RELEASE'
  | 'EMERGENCY_APPROVAL'
  | 'SAFETY_CHECK';

export type EstateContactOption = {
  contactId: number;
  userId?: number | null;
  name: string;
  email: string;
  relationship: string;
  registered: boolean;
  active: boolean;
  allowPasswords: boolean;
  allowCards: boolean;
  allowDocuments: boolean;
  allowNotes: boolean;
};

export type EstateVaultItemOption = {
  id: number;
  itemType: VaultItemType;
  title: string;
  updatedAt?: string | null;
};

export type EstatePlaybook = {
  id: number;
  itemType: VaultItemType;
  itemId: number;
  itemTitle: string;
  actionType: EstateActionType;
  triggerType: EstateTriggerType;
  recipientContactId?: number | null;
  recipientUserId?: number | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  instructions: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | string;
  itemAvailable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EstateExecution = {
  id: number;
  playbookId: number;
  ownerName: string;
  ownerEmail: string;
  recipientName: string;
  recipientEmail: string;
  itemType: VaultItemType;
  itemId: number;
  itemTitle: string;
  actionType: Exclude<EstateActionType, 'NEVER_RELEASE'>;
  sourceType: 'OWNER_RELEASE' | 'EMERGENCY_REQUEST' | 'SAFETY_CHECK' | string;
  status: 'RELEASED' | 'VIEWED' | 'COMPLETED' | 'CANCELLED' | string;
  instructions: string;
  itemAvailable: boolean;
  canOpen: boolean;
  canCancel: boolean;
  canComplete: boolean;
  releasedAt: string;
  viewedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
};

export type EstateOverview = {
  plan: 'FREE' | 'PREMIUM' | 'FAMILY' | 'UNKNOWN' | string;
  eligible: boolean;
  canConfigure: boolean;
  vaultAvailable: boolean;
  contacts: EstateContactOption[];
  vaultItems: EstateVaultItemOption[];
  playbooks: EstatePlaybook[];
  releasedByMe: EstateExecution[];
  received: EstateExecution[];
  message: string;
};

export type EstatePlaybookBody = {
  itemType: VaultItemType;
  itemId: number;
  actionType: EstateActionType;
  triggerType: EstateTriggerType;
  recipientContactId?: number | null;
  instructions?: string;
};

export type EstateReleasedItem = {
  executionId: number;
  ownerName: string;
  ownerEmail: string;
  actionType: Exclude<EstateActionType, 'NEVER_RELEASE'>;
  instructions: string;
  itemType: VaultItemType;
  itemId: number;
  title: string;
  usernameValue?: string | null;
  password?: string | null;
  website?: string | null;
  notes?: string | null;
  cardName?: string | null;
  cardNumber?: string | null;
  expiryDate?: string | null;
  cvv?: string | null;
  cardholderName?: string | null;
  documentName?: string | null;
  documentType?: string | null;
  sizeBytes?: number | null;
  documentNotes?: string | null;
  category?: string | null;
  content?: string | null;
  pinned?: boolean | null;
  releasedAt: string;
  viewedAt?: string | null;
  itemCreatedAt?: string | null;
  itemUpdatedAt?: string | null;
};

export type ContinuityCheckStatus = 'PASS' | 'WARN' | 'FAIL';
export type ContinuityDrillStatus = 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type ContinuityParticipantStatus = 'PENDING' | 'ACKNOWLEDGED';

export type ContinuityCheck = {
  code: string;
  title: string;
  status: ContinuityCheckStatus;
  detail: string;
  actionRoute?: string | null;
  weight: number;
  earnedPoints: number;
};

export type ContinuityParticipant = {
  userId?: number | null;
  name: string;
  email: string;
  roles: string;
  status: ContinuityParticipantStatus;
  eligible: boolean;
  notifiedAt?: string | null;
  acknowledgedAt?: string | null;
};

export type ContinuityDrill = {
  id: number;
  publicId: string;
  status: ContinuityDrillStatus;
  score: number;
  staticScore: number;
  acknowledgedCount: number;
  participantCount: number;
  startedAt: string;
  expiresAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
  canComplete: boolean;
  canCancel: boolean;
  checks: ContinuityCheck[];
  participants: ContinuityParticipant[];
};

export type ContinuityIncomingRequest = {
  publicId: string;
  ownerName: string;
  ownerEmail: string;
  roles: string;
  status: ContinuityParticipantStatus;
  startedAt: string;
  expiresAt: string;
  acknowledgedAt?: string | null;
  canAcknowledge: boolean;
};

export type ContinuityAcknowledgement = {
  publicId: string;
  status: ContinuityParticipantStatus;
  acknowledgedAt?: string | null;
  message: string;
};

export type ContinuityOverview = {
  plan: 'FREE' | 'PREMIUM' | 'FAMILY' | 'UNKNOWN' | string;
  eligible: boolean;
  canRun: boolean;
  subscriptionExpiresAt?: string | null;
  message: string;
  activeDrill?: ContinuityDrill | null;
  history: ContinuityDrill[];
  receivedRequests: ContinuityIncomingRequest[];
};


export type SecurityIncidentType =
  | 'LOST_OR_STOLEN_DEVICE'
  | 'MASTER_PASSWORD_EXPOSED'
  | 'EMAIL_COMPROMISED'
  | 'PHISHING_ATTACK'
  | 'UNKNOWN_LOGIN'
  | 'SIM_SWAP'
  | 'FAMILY_MISUSE'
  | 'DURESS_EVENT_ENDED'
  | 'OTHER';

export type IncidentTaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type SecurityIncidentStatus = 'ACTIVE' | 'COMPLETED' | 'RECOVERED' | 'CANCELLED';

export type IncidentRecoveryTask = {
  id: number;
  code: string;
  title: string;
  detail: string;
  actionRoute?: string | null;
  required: boolean;
  priority: number;
  status: IncidentTaskStatus;
  completedAt?: string | null;
};

export type IncidentTimelineEvent = {
  eventType: string;
  title: string;
  detail?: string | null;
  createdAt: string;
};

export type SecurityIncident = {
  id: number;
  publicId: string;
  type: SecurityIncidentType;
  status: SecurityIncidentStatus;
  planSnapshot: string;
  safeDeviceName: string;
  note?: string | null;
  progress: number;
  sessionsRevoked: number;
  biometricsRevoked: number;
  startedAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
  canComplete: boolean;
  canCancel: boolean;
  tasks: IncidentRecoveryTask[];
  timeline: IncidentTimelineEvent[];
};

export type IncidentOverview = {
  plan: 'FREE' | 'PREMIUM' | 'FAMILY' | 'UNKNOWN' | string;
  eligible: boolean;
  canStart: boolean;
  message: string;
  activeIncident?: SecurityIncident | null;
  history: SecurityIncident[];
};

type CreateVaultItemBody = {
  itemType: VaultItemType;
  title: string;
  usernameValue?: string;
  encryptedPassword?: string;
  encryptedData?: string;
  website?: string;
  notes?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
};

type UpdateVaultItemBody = Partial<CreateVaultItemBody>;

type CacheEntry<T> = {
  time: number;
  data?: T;
  promise?: Promise<T>;
};

const CACHE_TIME_MS = 45000;
const STALE_CACHE_GRACE_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 80;
const cache = new Map<string, CacheEntry<any>>();
let tokenCache: string | null | undefined = undefined;
let volatileDeviceId: string | null = null;

const GUARDIAN_DEVICE_ID_KEY = 'guardian.device-id';
const GUARDIAN_DEVICE_ID_FALLBACK_KEY = 'guardianDeviceIdFallback';

function createLocalDeviceId() {
  // This ID is not a hardware ID. It is only a random app-installation ID.
  // It stays on the device until the app is uninstalled or storage is cleared.
  const randomPart = Math.random().toString(36).slice(2);
  const timePart = Date.now().toString(36);
  const extraPart = Math.random().toString(36).slice(2);
  return `guardian-${timePart}-${randomPart}-${extraPart}`;
}

async function getGuardianDeviceId() {
  let fallbackExisting: string | null = null;

  try {
    fallbackExisting = await AsyncStorage.getItem(
      GUARDIAN_DEVICE_ID_FALLBACK_KEY
    );
  } catch (error: unknown) {
    safeLogError('DEVICE_ID_FALLBACK_READ', error);
  }

  try {
    const secureExisting = await SecureStore.getItemAsync(
      GUARDIAN_DEVICE_ID_KEY
    );

    if (secureExisting) {
      volatileDeviceId = secureExisting;
      return secureExisting;
    }

    if (fallbackExisting) {
      await SecureStore.setItemAsync(
        GUARDIAN_DEVICE_ID_KEY,
        fallbackExisting
      ).catch((error: unknown) => {
        safeLogError('DEVICE_ID_SECURE_MIGRATION', error);
      });
      volatileDeviceId = fallbackExisting;
      return fallbackExisting;
    }
  } catch (error: unknown) {
    safeLogError('DEVICE_ID_SECURE_READ', error);
  }

  if (fallbackExisting) {
    volatileDeviceId = fallbackExisting;
    return fallbackExisting;
  }

  if (!volatileDeviceId) {
    volatileDeviceId = createLocalDeviceId();
  }

  const created = volatileDeviceId;

  await Promise.allSettled([
    SecureStore.setItemAsync(GUARDIAN_DEVICE_ID_KEY, created),
    AsyncStorage.setItem(GUARDIAN_DEVICE_ID_FALLBACK_KEY, created),
  ]).then((results) => {
    results.forEach((result) => {
      if (result.status === 'rejected') {
        safeLogError('DEVICE_ID_PERSIST', result.reason);
      }
    });
  });

  return created;
}


export async function getGuardianInstallationId() {
  return getGuardianDeviceId();
}

function getReadableDeviceName() {
  const parts = [
    Device.manufacturer,
    Device.modelName,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (parts) return parts;

  if (Platform.OS === 'android') return 'Android device';
  if (Platform.OS === 'ios') return 'iOS device';

  return 'Trusted device';
}

function getDeviceType() {
  if (Platform.OS === 'android') return 'Android';
  if (Platform.OS === 'ios') return 'iOS';
  if (Platform.OS === 'web') return 'Web';
  return Platform.OS || 'Unknown';
}

function sanitizeHeaderValue(value: string) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

async function getGuardianDeviceHeaders() {
  const deviceId = await getGuardianDeviceId();

  return {
    'X-Guardian-Device-Id': sanitizeHeaderValue(deviceId),
    'X-Guardian-Device-Name': sanitizeHeaderValue(getReadableDeviceName()),
    'X-Guardian-Device-Type': sanitizeHeaderValue(getDeviceType()),
  };
}

async function getToken() {
  if (tokenCache !== undefined) return tokenCache;

  await SecureStore.deleteItemAsync(
    LEGACY_BIOMETRIC_PASSWORD_SECURE_STORE_KEY
  ).catch((error: unknown) => {
    safeLogError('LEGACY_BIOMETRIC_SECRET_CLEAR', error);
  });

  let secureStoreFailed = false;

  try {
    const secureToken = await SecureStore.getItemAsync(
      AUTH_TOKEN_SECURE_STORE_KEY
    );
    if (secureToken) {
      tokenCache = secureToken;
      return secureToken;
    }
  } catch (error: unknown) {
    secureStoreFailed = true;
    safeLogError('AUTH_TOKEN_SECURE_READ', error);
  }

  let legacyToken: string | null = null;
  let legacyStorageFailed = false;

  try {
    legacyToken = await AsyncStorage.getItem(
      LEGACY_AUTH_TOKEN_ASYNC_STORAGE_KEY
    );
  } catch (error: unknown) {
    legacyStorageFailed = true;
    safeLogError('AUTH_TOKEN_LEGACY_READ', error);
  }

  if (legacyToken) {
    try {
      await SecureStore.setItemAsync(AUTH_TOKEN_SECURE_STORE_KEY, legacyToken, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      await AsyncStorage.removeItem(
        LEGACY_AUTH_TOKEN_ASYNC_STORAGE_KEY
      ).catch((error: unknown) => {
        safeLogError('AUTH_TOKEN_LEGACY_CLEAR', error);
      });
    } catch (error: unknown) {
      safeLogError('AUTH_TOKEN_MIGRATION', error);
      // Keep the legacy token in memory for this session.
    }
  }

  if (!legacyToken && secureStoreFailed && legacyStorageFailed) {
    throw new GuardianApiError(
      'Your secure session could not be read. Please reopen the app.',
      { code: 'STORAGE_UNAVAILABLE' }
    );
  }

  tokenCache = legacyToken;
  return tokenCache;
}


export async function hasStoredAuthToken() {
  return Boolean(await getToken());
}

function clearCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }

  Array.from(cache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) cache.delete(key);
  });
}

function clearVaultCaches(securityReason?: string) {
  markOfflineVaultStale().catch(() => undefined);
  AsyncStorage.setItem('homeNeedsInitialSync', 'true').catch(() => undefined);

  if (securityReason) {
    markSecurityScoreDirty(securityReason);
  }
  clearCache('GET:/api/vault');
  clearCache('GET:/vault/documents');
  clearCache('GET:/vault/cards');
  clearCache('GET:/vault/notes');
  clearCache('GET:/vault/emergency/overview');
  clearCache('GET:/vault/emergency/contacts');
  clearCache('GET:/vault/emergency/requests');
  clearCache('GET:/vault/emergency/audit');
  clearCache('GET:/vault/emergency/requests/');
  clearCache('GET:/vault/safety-check');
  clearCache('GET:/vault/estate-playbooks');
  clearCache('GET:/vault/api/subscriptions/me');
  clearCache('GET:/vault/notifications');
  clearCache('GET:/vault/sessions');
  clearCache('GET:/vault/notifications/unread-count');
}

function getServerMessage(data: any, fallbackText?: string) {
  if (!data && !fallbackText) return '';

  if (typeof data === 'string') return data;

  const firstFieldError = Array.isArray(data?.fieldErrors)
    ? data.fieldErrors.find((item: any) => item?.message)?.message
    : undefined;
  const firstValidationError = data?.errors && typeof data.errors === 'object'
    ? Object.values(data.errors).find((value) => typeof value === 'string')
    : undefined;
  const firstLegacyError = Array.isArray(data?.errors)
    ? data.errors.find((item: any) => item?.defaultMessage)?.defaultMessage
    : undefined;

  return String(
    data?.message ||
      firstFieldError ||
      firstValidationError ||
      firstLegacyError ||
      data?.error ||
      data?.detail ||
      data?.title ||
      fallbackText ||
      ''
  );
}

function isOptionalFamily401(path: string, status: number) {
  if (status !== 401) return false;

  return (
    path.includes('/vault/family/shared-passwords') ||
    path.includes('/vault/family/member-password-risks')
  );
}

async function hasAuthToken() {
  const token = await getToken();
  return !!token;
}


function isRevokedSessionResponse(
  status: number,
  code?: string,
  message?: string
) {
  if (status !== 401) return false;
  const normalizedCode = String(code || '').trim().toUpperCase();
  const normalizedMessage = String(message || '').trim().toLowerCase();
  return normalizedCode === 'SESSION_REVOKED' ||
    normalizedMessage.includes('invalid or revoked session') ||
    normalizedMessage.includes('session has been revoked');
}

async function isFamilyPlanCached() {
  const plan = String(await AsyncStorage.getItem('subscriptionPlan') || '').toUpperCase();
  return plan === 'FAMILY';
}


export function getFriendlyErrorMessage(status?: number, path?: string, rawMessage?: string) {
  let message = String(rawMessage || '').trim();

  const quotedStatusMatch = message.match(/^\d{3}\s+[A-Z_]+\s+"(.+)"$/);
  if (quotedStatusMatch?.[1]) message = quotedStatusMatch[1];

  const lower = message.toLowerCase();
  const upper = message.toUpperCase();
  const route = path || '';
  const isPasswordLoginRoute = route.includes('/vault/auth/login');
  const isSpecialLoginState =
    lower.includes('verify your email') ||
    lower.includes('finish email verification') ||
    lower.includes('two-factor') ||
    lower.includes('2fa') ||
    lower.includes('device_limit_reached') ||
    lower.includes('trusted device') ||
    lower.includes('incident lockdown') ||
    lower.includes('account lockdown') ||
    lower.includes('too many attempts') ||
    lower.includes('rate limit');
  const isCredentialRejection =
    !isSpecialLoginState &&
    (status === 401 ||
    upper.includes('BAD_CREDENTIALS') ||
    lower.includes('bad credentials') ||
    lower.includes('invalid credentials') ||
    lower.includes('incorrect password') ||
    lower.includes('invalid email or password') ||
    lower.includes('invalid username or password') ||
    (status === 403 &&
      (lower === 'forbidden' ||
        lower.includes('access denied') ||
        lower.includes('not allowed to do this') ||
        lower.includes('not permitted to do this'))));

  if (isPasswordLoginRoute && isCredentialRejection) {
    return 'The email or password is incorrect. Please check your details and try again.';
  }

  const serviceUnavailable =
    status === 502 ||
    status === 503 ||
    status === 504 ||
    lower.includes('connection refused') ||
    lower.includes('getsockopt') ||
    lower.includes('i/o error') ||
    lower.includes('service unavailable') ||
    lower.includes('bad gateway') ||
    lower.includes('connect timed out') ||
    lower.includes('connection timed out');

  if (serviceUnavailable) {
    if (route.includes('/vault/family')) {
      return 'Family sharing is temporarily unavailable. Please try again shortly.';
    }

    return 'This service is temporarily unavailable. Please try again shortly.';
  }

  if (
    lower.includes('device_limit_reached') ||
    lower.includes('free plan allows one trusted device') ||
    lower.includes('free plan allows only one active device') ||
    lower.includes('only one active device')
  ) {
    return 'Your free plan allows one trusted device at a time. You can remove your previous device and continue signing in on this device.';
  }

  if (
    upper.includes('PLAN_LIMIT_REACHED') ||
    lower.includes('free plan limit reached') ||
    lower.includes('password limit reached') ||
    lower.includes('vault limit') ||
    lower.includes('10 passwords')
  ) {
    return message && !lower.includes('plan_limit_reached')
      ? message
      : 'Your Free plan can save up to 10 passwords. Upgrade to Premium or Family for unlimited password storage.';
  }

  if (
    lower.includes('free note limit') ||
    lower.includes('note limit reached')
  ) {
    return 'Free accounts can save up to 5 SecureNotes. Upgrade to Premium or Family for unlimited secure notes.';
  }

  if (
    lower.includes('document vault is only available') ||
    lower.includes('document upload is only available') ||
    (route.includes('/vault/documents') && lower.includes('premium'))
  ) {
    return 'Encrypted document storage is available on Premium and Family plans.';
  }

  if (
    lower.includes('backup') &&
    (lower.includes('premium') || lower.includes('family') || lower.includes('paid plan'))
  ) {
    return 'Encrypted cloud backup is available on Premium and Family plans.';
  }

  if (
    lower.includes('not on the guardian') ||
    lower.includes('no guardian account') ||
    lower.includes('no account found with that email') ||
    lower.includes('no account found')
  ) {
    return 'That email is not registered on The Guardian. Ask the person to create an account first, then add them again.';
  }

  if (
    lower.includes('family sharing') ||
    lower.includes('family plan') ||
    lower.includes('shared vault')
  ) {
    return 'Family sharing is available on the Family plan.';
  }

  if (
    lower.includes('emergency contact') &&
    (lower.includes('limit') || lower.includes('upgrade') || lower.includes('premium') || lower.includes('family'))
  ) {
    return 'Your current plan has reached its emergency contact limit. Upgrade to add more trusted contacts.';
  }

  if (
    lower.includes('advanced password generator') ||
    lower.includes('password generator') && lower.includes('premium')
  ) {
    return 'Advanced password generator options are available on Premium and Family plans.';
  }

  if (!message || lower.includes('request failed with status')) {
    if (route.includes('/vault/family/members') && status === 404) {
      return 'That email is not registered on The Guardian. Ask the person to create an account first, then add them again.';
    }

    if (route.includes('/vault/family/members') && status === 403) {
      return 'Only Family plan users can add members. Upgrade to Family or refresh your subscription status if you already upgraded.';
    }

    if (status === 400) return 'Some details are missing or invalid. Please check the form and try again.';
    if (status === 401) {
      if (route.includes('/vault/auth/biometric/login')) {
        return 'Biometric sign-in needs to be set up again. Sign in with your password once.';
      }
      if (route.includes('/vault/auth/login')) return 'The email or password is incorrect.';
      if (route.includes('/verify-2fa')) return 'The verification code is incorrect or has expired.';
      return 'Your session has expired. Please sign in again.';
    }
    if (status === 423) return 'Incident Lockdown is active. Continue recovery on the designated device.';
    if (status === 403) return 'You do not have permission to do this.';
    if (status === 404) return 'We could not find what you are looking for.';
    if (status === 409) return 'This request conflicts with your current account state. Please try again.';
    if (status === 413) return 'This file is too large. Please choose a smaller file.';
    if (status && status >= 500) return 'Something went wrong on our server. Please try again shortly.';
    return 'Something went wrong. Please try again.';
  }

  if (
    lower.includes('request timed out') ||
    lower.includes('aborted') ||
    lower.includes('aborterror') ||
    lower.includes('timeout')
  ) {
    if (route.includes('/vault/auth/login')) {
      return 'Login is taking too long. Please check your internet connection and try again.';
    }

    if (
      route.includes('/vault/auth/register') ||
      route.includes('/vault/auth/forgot-password') ||
      route.includes('/vault/auth/reset-password') ||
      route.includes('/vault/auth/verify-email') ||
      route.includes('/vault/auth/verify-2fa')
    ) {
      return 'The request is taking too long. Please check your internet connection and try again.';
    }

    return 'The server is taking too long to respond. Please check your internet connection and try again.';
  }

  if (lower.includes('failed to fetch') || lower.includes('network request failed')) {
    if (route.includes('/vault/auth/login')) {
      return 'The app could not establish a connection to The Guardian. Keep the app open for a moment and try again.';
    }

    return 'The app could not establish a connection to The Guardian. Your internet may still be working. Please try again shortly.';
  }

  if (lower.includes('bad credentials') || lower.includes('invalid credentials')) {
    return 'The email or password is incorrect.';
  }

  if (lower.includes('jwt') || lower.includes('token expired') || lower.includes('unauthorized')) {
    return 'Your session has expired. Please sign in again.';
  }

  if (lower.includes('access denied') || lower.includes('forbidden')) {
    if (lower.includes('family plan')) return 'Family sharing is only available on the Family plan.';
    if (lower.includes('premium') || lower.includes('document')) return 'This feature is only available on the Premium and Family plans.';
    return 'You do not have permission to do this.';
  }

  if (lower.includes('document vault is only available') || lower.includes('document upload is only available')) {
    return 'Document upload is only available on the Premium and Family plans.';
  }

  if (lower.includes('secure note') || lower.includes('note limit')) {
    return 'Free accounts can save up to 5 secure notes. Upgrade to Premium or Family for unlimited secure notes.';
  }

  if (lower.includes('account reset') || lower.includes('erase vault') || lower.includes('vault data erased')) {
    return message;
  }

  if (lower.includes('breach monitoring') || lower.includes('security scan')) {
    return 'Breach monitoring is available on Premium and Family plans.';
  }

  if (lower.includes('subscription not found')) {
    return 'We could not load your subscription. Please sign in again.';
  }

  if (lower.includes('not found')) {
    return 'We could not find what you are looking for.';
  }

  if (lower.includes('already belongs to another family group')) {
    return 'This user already belongs to another family group.';
  }

  if (
    lower.includes('not on the guardian') ||
    lower.includes('no guardian account') ||
    lower.includes('no account found')
  ) {
    return 'That email is not registered on The Guardian. Ask the person to create an account first, then add them again.';
  }

  if (lower.includes('invalid') && lower.includes('code')) {
    return 'The code is incorrect or has expired. Please request a new one.';
  }

  if (
    route.includes('/vault/auth/register') &&
    (lower.includes('email') || lower.includes('mail')) &&
    (lower.includes('send') || lower.includes('smtp') || lower.includes('connection timed out'))
  ) {
    return 'We could not send the verification email. No account has been created. Please try again.';
  }

  if (
    (route.includes('/vault/auth/resend-verification') || route.includes('/vault/auth/resend-registration-code')) &&
    (lower.includes('email') || lower.includes('mail') || lower.includes('smtp') || lower.includes('connection timed out'))
  ) {
    return 'We could not send a verification code right now. You can still use the app by logging in, but your account is safer after email verification.';
  }

  if (lower.includes('trace') || lower.includes('exception') || lower.includes('org.springframework')) {
    if (status && status >= 500) return 'Something went wrong on our server. Please try again shortly.';
    return 'Something went wrong. Please try again.';
  }

  return message;
}

async function authRequest<T>(
  path: string,
  options: RequestInit,
  retryLoginTransport = false,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS
): Promise<T> {
  const requestMethod = String(options.method || 'POST').toUpperCase();
  const securedBody = secureJsonRequestBody(path, requestMethod, options.body);
  const scopedSignal = getScopedSignal();
  if (scopedSignal?.aborted) throw createAbortError();

  await waitForAuthAppState();
  if (scopedSignal?.aborted) throw createAbortError();

  const deviceHeaders = await getGuardianDeviceHeaders();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    'Cache-Control': 'no-cache',
    ...deviceHeaders,
    ...(options.headers as Record<string, string>),
  };

  const retryDelays = retryLoginTransport
    ? LOGIN_TRANSPORT_RETRY_DELAYS_MS
    : [];
  const requestStartedAt = Date.now();
  let attempt = 0;

  while (attempt <= retryDelays.length) {
    try {
      const response = await xhrJsonRequest(
        `${API_BASE_URL}${path}`,
        requestMethod,
        headers,
        securedBody,
        timeoutMs,
        scopedSignal
      );

      if (
        !response.ok &&
        retryLoginTransport &&
        isTransientHttpStatus(response.status) &&
        attempt < retryDelays.length
      ) {
        const delayMs = retryDelays[attempt];
        attempt += 1;
        await wait(delayMs, scopedSignal);
        await waitForAuthAppState();
        continue;
      }

      const text = response.bodyText;
      let data: any = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!response.ok) {
        const serverMessage = getServerMessage(data, text);
        const rawCode = String(data?.code || data?.errorCode || '').trim();
        const derivedCode = rawCode || (
          String(serverMessage || '').toUpperCase().includes('DEVICE_LIMIT_REACHED')
            ? 'DEVICE_LIMIT_REACHED'
            : undefined
        );

        recordApiRequest({
          path,
          method: requestMethod,
          status: response.status,
          durationMs: Date.now() - requestStartedAt,
          success: false,
          code: derivedCode || 'HTTP_ERROR',
          transport: 'XHR_AUTH',
          retryCount: attempt,
          networkStage: 'HTTP_RESPONSE',
        });

        if (response.status === 423 || derivedCode === 'ACCOUNT_LOCKDOWN_ACTIVE') {
          await activateIncidentLockdownRedirect();
        }

        if (isRevokedSessionResponse(response.status, derivedCode, serverMessage)) {
          await invalidateRevokedSession();
          throw createAbortError();
        }

        throw new GuardianApiError(
          getFriendlyErrorMessage(response.status, path, serverMessage),
          {
            status: response.status,
            path,
            rawMessage: serverMessage,
            code: derivedCode,
            data,
          }
        );
      }

      recordApiRequest({
        path,
        method: requestMethod,
        status: response.status,
        durationMs: Date.now() - requestStartedAt,
        success: true,
        transport: 'XHR_AUTH',
        retryCount: attempt,
        networkStage: 'HTTP_RESPONSE',
      });

      return data as T;
    } catch (error: any) {
      if (error instanceof GuardianApiError) throw error;
      if (scopedSignal?.aborted || error?.name === 'AbortError') {
        throw createAbortError();
      }

      const code = String(
        error?.code || error?.name || 'NETWORK_UNREACHABLE'
      ).toUpperCase();
      const timeout = code === 'REQUEST_TIMEOUT';
      const canRetry = attempt < retryDelays.length;

      if (canRetry) {
        const delayMs = retryDelays[attempt];
        attempt += 1;
        await wait(delayMs, scopedSignal);
        await waitForAuthAppState();
        continue;
      }

      const gatewayReachable = timeout
        ? false
        : await checkApiReachability(REACHABILITY_TIMEOUT_MS);

      const finalCode = timeout
        ? 'REQUEST_TIMEOUT'
        : gatewayReachable
          ? 'TRANSIENT_NETWORK_FAILURE'
          : 'NETWORK_UNREACHABLE';

      const rawMessage = timeout
        ? `Request timed out after ${Math.round(timeoutMs / 1000)} seconds`
        : 'Network request failed';

      recordApiRequest({
        path,
        method: requestMethod,
        durationMs: Date.now() - requestStartedAt,
        success: false,
        code: finalCode,
        transport: 'XHR_AUTH',
        retryCount: attempt,
        networkStage: timeout
          ? 'XHR_TIMEOUT'
          : gatewayReachable
            ? 'GATEWAY_REACHABLE_REQUEST_FAILED'
            : 'GATEWAY_UNREACHABLE',
      });

      throw new GuardianApiError(
        getFriendlyErrorMessage(undefined, path, rawMessage),
        {
          path,
          rawMessage,
          code: finalCode,
        }
      );
    }
  }

  throw new GuardianApiError(
    getFriendlyErrorMessage(undefined, path, 'Network request failed'),
    {
      path,
      rawMessage: 'Network request failed',
      code: 'NETWORK_UNREACHABLE',
    }
  );
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  useAuth = true,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<T> {
  const requestMethod = String(options.method || 'GET').toUpperCase();
  const securedBody = secureJsonRequestBody(path, requestMethod, options.body);
  const scopedSignal = getScopedSignal();
  if (scopedSignal?.aborted) throw createAbortError();

  /*
   * Android can report the application as active slightly before its native
   * networking stack has fully resumed. Waiting here prevents ordinary Vault,
   * Security, and Family requests from producing false status-0 failures after
   * app resume, biometric prompts, or system dialogs.
   */
  await waitForAuthAppState();
  if (scopedSignal?.aborted) throw createAbortError();

  const duressSession = useAuth && (await isDuressSession());
  if (useAuth) setDuressAnalyticsSuppressed(Boolean(duressSession));

  if (duressSession) {
    const allowed =
      path === '/api/vault' ||
      path.startsWith('/api/vault/') ||
      path === '/vault/cards' ||
      path.startsWith('/vault/cards/') ||
      path === '/vault/documents' ||
      path.startsWith('/vault/documents/') ||
      path === '/vault/notes' ||
      path.startsWith('/vault/notes/');
    if (!allowed) {
      throw new GuardianApiError('This action is not available in this vault session.', {
        status: 403,
        path,
        code: 'DURESS_SESSION_RESTRICTED',
        rawMessage: 'Duress session route restriction',
      });
    }
  }

  const token = useAuth ? await getToken() : null;
  const deviceHeaders = await getGuardianDeviceHeaders();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...deviceHeaders,
    ...(options.headers as Record<string, string>),
  };

  if (useAuth && token) headers.Authorization = `Bearer ${token}`;

  const requestStartedAt = Date.now();
  const retryCount = requestMethod === 'GET' || requestMethod === 'HEAD' ? 2 : 0;

  let response: Response | null = null;
  let attempt = 0;

  while (attempt <= retryCount) {
    const controller = new AbortController();
    const attemptStartedAt = Date.now();
    let timedOut = false;

    const abortFromScreen = () => controller.abort();
    scopedSignal?.addEventListener('abort', abortFromScreen, { once: true });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        body: securedBody,
        headers,
        signal: controller.signal,
      });

      if (
        isTransientHttpStatus(response.status) &&
        attempt < retryCount
      ) {
        const retryAfterMs = getRetryAfterDelayMs(response);
        const delayMs = Math.max(
          retryAfterMs,
          getExponentialBackoffDelay(attempt + 1, {
            baseDelayMs: 900,
            maxDelayMs: 5000,
          })
        );

        attempt += 1;
        await wait(delayMs, scopedSignal);
        await waitForAuthAppState();
        continue;
      }

      break;
    } catch (error: any) {
      const errorName = String(error?.name || '').toLowerCase();
      const errorMessage = String(error?.message || '').toLowerCase();
      const attemptDurationMs = Date.now() - attemptStartedAt;
      const totalDurationMs = Date.now() - requestStartedAt;
      const wasAborted =
        errorName === 'aborterror' ||
        errorMessage.includes('aborted') ||
        errorMessage.includes('abort') ||
        errorMessage.includes('canceled') ||
        errorMessage.includes('cancelled');

      if (wasAborted) {
        if (scopedSignal?.aborted && !timedOut) {
          throw createAbortError();
        }

        if (timedOut && attempt < retryCount) {
          const delayMs = getExponentialBackoffDelay(attempt + 1, {
            baseDelayMs: 900,
            maxDelayMs: 5000,
          });
          attempt += 1;
          await wait(delayMs, scopedSignal);
          await waitForAuthAppState();
          continue;
        }

        recordApiRequest({
          path,
          method: requestMethod,
          durationMs: totalDurationMs,
          success: false,
          code: 'REQUEST_TIMEOUT',
          transport: 'FETCH',
          retryCount: attempt,
          networkStage: 'FETCH_ABORT_TIMEOUT',
        });

        throw new GuardianApiError(
          getFriendlyErrorMessage(
            undefined,
            path,
            `Request timed out after ${Math.round(timeoutMs / 1000)} seconds`
          ),
          {
            path,
            rawMessage: `Request timed out after ${Math.round(timeoutMs / 1000)} seconds`,
            code: 'REQUEST_TIMEOUT',
          }
        );
      }

      const canRetry =
        attempt < retryCount &&
        attemptDurationMs <= TRANSIENT_NETWORK_FAILURE_WINDOW_MS;

      if (canRetry) {
        const delayMs = getExponentialBackoffDelay(attempt + 1, {
          baseDelayMs: 900,
          maxDelayMs: 5000,
        });

        attempt += 1;
        await wait(delayMs, scopedSignal);
        await waitForAuthAppState();
        continue;
      }

      safeLogError(`API_FETCH_${requestMethod}_${path}`, error);

      /*
       * A fetch status-0 error does not prove the server is down. Probe the
       * gateway before recording NETWORK_UNREACHABLE. Any HTTP status from the
       * health route proves the request reached the gateway.
       */
      const gatewayReachable = await checkApiReachability(
        REACHABILITY_TIMEOUT_MS
      );

      const finalCode = gatewayReachable
        ? 'TRANSIENT_NETWORK_FAILURE'
        : 'NETWORK_UNREACHABLE';

      recordApiRequest({
        path,
        method: requestMethod,
        durationMs: totalDurationMs,
        success: false,
        code: finalCode,
        transport: 'FETCH',
        retryCount: attempt,
        networkStage: gatewayReachable
          ? 'GATEWAY_REACHABLE_REQUEST_FAILED'
          : 'GATEWAY_UNREACHABLE',
      });

      throw new GuardianApiError(
        getFriendlyErrorMessage(undefined, path, 'Network request failed'),
        {
          path,
          rawMessage: 'Network request failed',
          code: finalCode,
        }
      );
    } finally {
      clearTimeout(timeoutId);
      scopedSignal?.removeEventListener('abort', abortFromScreen);
    }
  }

  if (!response) {
    const gatewayReachable = await checkApiReachability(
      REACHABILITY_TIMEOUT_MS
    );

    const finalCode = gatewayReachable
      ? 'TRANSIENT_NETWORK_FAILURE'
      : 'NETWORK_UNREACHABLE';

    recordApiRequest({
      path,
      method: requestMethod,
      durationMs: Date.now() - requestStartedAt,
      success: false,
      code: finalCode,
      transport: 'FETCH',
      retryCount: attempt,
      networkStage: gatewayReachable
        ? 'GATEWAY_REACHABLE_NO_RESPONSE'
        : 'GATEWAY_UNREACHABLE',
    });

    throw new GuardianApiError(
      getFriendlyErrorMessage(undefined, path, 'Network request failed'),
      {
        path,
        rawMessage: 'Network request failed',
        code: finalCode,
      }
    );
  }

  let text = '';

  try {
    text = await response.text();
  } catch (error: unknown) {
    safeLogError(`API_RESPONSE_READ_${requestMethod}_${path}`, error);
    throw new GuardianApiError(
      'The server returned an incomplete response. Please try again.',
      {
        status: response.status,
        path,
        code: 'INVALID_RESPONSE',
      }
    );
  }

  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const serverMessage = getServerMessage(data, text);
    const rawCode = String(data?.code || data?.errorCode || '').trim();
    const quietOptional401 = isOptionalFamily401(path, response.status);

    if (__DEV__ && !quietOptional401) {
      console.warn('[API_RESPONSE_ERROR]', {
        path,
        status: response.status,
        code: rawCode || 'HTTP_ERROR',
      });
    }

    const derivedCode = rawCode || (
      String(serverMessage || '').toUpperCase().includes('DEVICE_LIMIT_REACHED')
        ? 'DEVICE_LIMIT_REACHED'
        : String(serverMessage || '').toUpperCase().includes('PLAN_LIMIT_REACHED') ||
          String(serverMessage || '').toLowerCase().includes('free plan limit reached') ||
          String(serverMessage || '').toLowerCase().includes('password limit reached')
            ? 'PLAN_LIMIT_REACHED'
            : undefined
    );

    if (!quietOptional401) {
      recordApiRequest({
        path,
        method: requestMethod,
        status: response.status,
        durationMs: Date.now() - requestStartedAt,
        success: false,
        code: derivedCode || 'HTTP_ERROR',
        transport: 'FETCH',
        retryCount: attempt,
        networkStage: 'HTTP_RESPONSE',
      });
    }

    if (derivedCode === 'PLAN_LIMIT_REACHED') {
      trackPlanLimitReached(path, response.status);
    }

    if (response.status === 423 || derivedCode === 'ACCOUNT_LOCKDOWN_ACTIVE') {
      await activateIncidentLockdownRedirect();
    }

    if (isRevokedSessionResponse(response.status, derivedCode, serverMessage)) {
      await invalidateRevokedSession();
      throw createAbortError();
    }

    throw new GuardianApiError(
      getFriendlyErrorMessage(response.status, path, serverMessage),
      {
        status: response.status,
        path,
        rawMessage: serverMessage,
        code: derivedCode,
        data,
      }
    );
  }

  recordApiRequest({
    path,
    method: requestMethod,
    status: response.status,
    durationMs: Date.now() - requestStartedAt,
    success: true,
    transport: 'FETCH',
    retryCount: attempt,
    networkStage: 'HTTP_RESPONSE',
  });

  return data as T;
}

async function cachedGet<T>(
  path: string,
  normalize?: (data: any) => T,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<T> {
  const key = `GET:${path}`;
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  const scopedSignal = getScopedSignal();

  if (existing?.data !== undefined && now - existing.time < CACHE_TIME_MS) {
    return existing.data;
  }

  if (scopedSignal) {
    try {
      const raw = await request<any>(path, {}, true, timeoutMs);
      const data = normalize ? normalize(raw) : (raw as T);
      cache.set(key, { time: Date.now(), data });
      return data;
    } catch (error: unknown) {
      const withinGracePeriod =
        existing?.data !== undefined &&
        now - existing.time <= STALE_CACHE_GRACE_MS;

      if (withinGracePeriod && isTransientError(error)) {
        return existing.data as T;
      }

      throw error;
    }
  }

  if (existing?.promise) {
    return existing.promise;
  }

  const promise = request<any>(path, {}, true, timeoutMs).then((raw) => {
    const data = normalize ? normalize(raw) : (raw as T);
    cache.set(key, { time: Date.now(), data });
    if (cache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    return data;
  }).catch((error: unknown) => {
    cache.delete(key);

    const withinGracePeriod =
      existing?.data !== undefined &&
      now - existing.time <= STALE_CACHE_GRACE_MS;

    if (withinGracePeriod && isTransientError(error)) {
      return existing.data as T;
    }

    throw error;
  });

  cache.set(key, { time: now, promise });
  return promise;
}

const normalizePasswords = (items: any[]): VaultItem[] =>
  items.map((item) => ({
    ...item,
    itemType: item.itemType || 'PASSWORD',
  })) as VaultItem[];

const normalizeSharedFamilyItems = (raw: any): SharedFamilyItems => ({
  passwords: (raw?.passwords || []).map((item: any) => ({
    ...item,
    itemType: 'PASSWORD',
    encryptedPassword: '',
    encryptedData: '',
    notes: '',
  })) as SharedPasswordItem[],
  cards: (raw?.cards || []).map((item: any) => ({
    ...item,
    itemType: 'CARD',
    encryptedCardNumber: '',
    encryptedExpiryDate: '',
    encryptedCvv: '',
    encryptedCardholderName: '',
    encryptedCardHolderName: '',
  })) as SharedCardItem[],
  documents: (raw?.documents || []).map((item: any) => ({
    ...item,
    itemType: 'DOCUMENT',
    encryptedFileUrl: '',
    encryptedNotes: '',
  })) as SharedDocumentItem[],
  notes: (raw?.notes || []).map((item: any) => ({
    ...item,
    itemType: 'NOTE',
    encryptedContent: '',
  })) as SharedNoteItem[],
});

const normalizeSharedPasswordSummaries = (items: any[]): SharedPasswordItem[] =>
  (items || []).map((item: any) => ({
    ...item,
    itemType: 'PASSWORD',
    encryptedPassword: '',
    encryptedData: '',
    notes: '',
  })) as SharedPasswordItem[];

const normalizeSharedCardSummaries = (items: any[]): SharedCardItem[] =>
  (items || []).map((item: any) => ({
    ...item,
    itemType: 'CARD',
    encryptedCardNumber: '',
    encryptedExpiryDate: '',
    encryptedCvv: '',
    encryptedCardholderName: '',
    encryptedCardHolderName: '',
  })) as SharedCardItem[];

const normalizeSharedDocumentSummaries = (items: any[]): SharedDocumentItem[] =>
  (items || []).map((item: any) => ({
    ...item,
    itemType: 'DOCUMENT',
    encryptedFileUrl: '',
    encryptedNotes: '',
  })) as SharedDocumentItem[];

const normalizeSharedNoteSummaries = (items: any[]): SharedNoteItem[] =>
  (items || []).map((item: any) => ({
    ...item,
    itemType: 'NOTE',
    encryptedContent: '',
  })) as SharedNoteItem[];


function sanitizeDownloadFileName(value?: string | null) {
  const clean = String(value || 'document').trim() || 'document';
  return clean.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getHeaderValue(headers: any, name: string) {
  if (!headers) return '';

  const direct = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  if (direct) return String(direct);

  if (typeof headers.get === 'function') {
    return String(headers.get(name) || headers.get(name.toLowerCase()) || '');
  }

  return '';
}

function getFileNameFromContentDisposition(value?: string | null) {
  const header = String(value || '');
  const match = header.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const raw = match?.[1] || match?.[2] || '';

  if (!raw) return '';

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function downloadAuthenticatedFile(
  path: string,
  fallbackFileName: string,
  fallbackMimeType = 'application/octet-stream'
): Promise<DownloadedDocumentFile> {
  const token = await getToken();

  if (!token) {
    throw new GuardianApiError('Please sign in again.', {
      status: 401,
      path,
      code: 'UNAUTHENTICATED',
    });
  }

  const deviceHeaders = await getGuardianDeviceHeaders();
  const safeFallbackName = sanitizeDownloadFileName(fallbackFileName);
  const destination = `${FileSystem.cacheDirectory}${Date.now()}-${safeFallbackName}`;
  const downloadStartedAt = Date.now();
  let completedAttempt = 0;

  try {
    const result = await retryAsync(
      async (attempt) => {
        completedAttempt = attempt;
        let downloaded: any;

        try {
          downloaded = await FileSystem.downloadAsync(
            `${API_BASE_URL}${path}`,
            destination,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                ...deviceHeaders,
              },
            }
          );
        } catch (error: unknown) {
          safeLogError('DOCUMENT_DOWNLOAD_ATTEMPT', error);
          throw new AppOperationError('The document could not be downloaded.', {
            code: 'NETWORK_UNREACHABLE',
            transient: true,
          });
        }

        if (downloaded.status < 200 || downloaded.status >= 300) {
          await FileSystem.deleteAsync(downloaded.uri, { idempotent: true }).catch(
            (error: unknown) => safeLogError('DOCUMENT_DOWNLOAD_CLEANUP', error)
          );

          throw new GuardianApiError(
            getFriendlyErrorMessage(
              downloaded.status,
              path,
              'Document download failed'
            ),
            {
              status: downloaded.status,
              path,
              rawMessage: 'Document download failed',
              code: isTransientHttpStatus(downloaded.status)
                ? 'SERVICE_UNAVAILABLE'
                : 'DOWNLOAD_HTTP_ERROR',
            }
          );
        }

        return downloaded;
      },
      {
        maxAttempts: 3,
        baseDelayMs: 900,
        maxDelayMs: 4500,
        shouldRetry: (error) => isTransientError(error),
        onRetry: (error) => safeLogError('DOCUMENT_DOWNLOAD_RETRY', error),
      }
    );

    const contentDisposition = getHeaderValue(
      result.headers,
      'content-disposition'
    );
    const contentType =
      getHeaderValue(result.headers, 'content-type') || fallbackMimeType;
    const fileNameFromHeader = getFileNameFromContentDisposition(
      contentDisposition
    );
    const info = await FileSystem.getInfoAsync(result.uri).catch((error) => {
      safeLogError('DOCUMENT_DOWNLOAD_INFO', error);
      return null as any;
    });

    recordApiRequest({
      path,
      method: 'GET',
      status: result.status,
      durationMs: Date.now() - downloadStartedAt,
      success: true,
      retryCount: Math.max(0, completedAttempt - 1),
    });

    return {
      uri: result.uri,
      fileName: sanitizeDownloadFileName(
        fileNameFromHeader || fallbackFileName
      ),
      mimeType: contentType,
      sizeBytes: info?.exists ? info.size : undefined,
    };
  } catch (error: unknown) {
    recordApiRequest({
      path,
      method: 'GET',
      durationMs: Date.now() - downloadStartedAt,
      success: false,
      code: String((error as any)?.code || 'DOWNLOAD_FAILED'),
      retryCount: Math.max(0, completedAttempt - 1),
    });

    if (error instanceof GuardianApiError) throw error;

    throw new GuardianApiError('The document could not be downloaded.', {
      path,
      code: 'DOWNLOAD_FAILED',
    });
  }
}

async function parseUploadResult(result: FileSystem.FileSystemUploadResult) {
  let data: any = null;

  try {
    data = result.body ? JSON.parse(result.body) : null;
  } catch {
    data = result.body;
  }

  if (result.status < 200 || result.status >= 300) {
    const serverMessage = getServerMessage(data, result.body);
    throw new GuardianApiError(
      getFriendlyErrorMessage(
        result.status,
        '/vault/documents/upload',
        serverMessage
      ),
      {
        status: result.status,
        path: '/vault/documents/upload',
        rawMessage: serverMessage,
        code: String(data?.code || data?.errorCode || 'UPLOAD_HTTP_ERROR'),
        data,
      }
    );
  }

  clearVaultCaches('vault-item');
  return data;
}



const apiImplementation = {
  clearCache: (prefix?: string) => clearCache(prefix),
  checkServerReachability: (timeoutMs?: number) =>
    checkApiReachability(timeoutMs),

  register: async (body: { fullname: string; email: string; password: string }) => {
    const result = await authRequest<RegisterResponse>('/vault/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullname: body.fullname.trim(),
        email: body.email.trim().toLowerCase(),
        password: body.password,
      }),
    }, false, AUTH_REQUEST_TIMEOUT_MS);

    trackFeatureAction('AUTH', 'REGISTRATION_VERIFICATION_SENT', {
      verification_delivery_requested: true,
    });

    return result;
  },

  verifyRegistration: async (body: { email: string; code: string }) => {
    const result = await authRequest<LoginResponse>('/vault/auth/verify-registration', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        code: body.code.trim(),
      }),
    }, false, AUTH_REQUEST_TIMEOUT_MS);

    trackFeatureAction('AUTH', 'ACCOUNT_REGISTERED', {
      email_verified_before_creation: true,
    });
    trackFeatureAction('AUTH', 'EMAIL_VERIFIED');
    markSecurityScoreDirty('email-verification');

    return result;
  },

  resendRegistrationCode: (body: { email: string }) =>
    authRequest<{ message: string }>('/vault/auth/resend-registration-code', {
      method: 'POST',
      body: JSON.stringify({ email: body.email.trim().toLowerCase() }),
    }, false, AUTH_REQUEST_TIMEOUT_MS),

  login: (body: { email: string; password: string; forceReplaceDevice?: boolean }) =>
    authRequest<LoginResponse>('/vault/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        password: body.password,
        forceReplaceDevice: body.forceReplaceDevice === true,
      }),
    }, true, AUTH_REQUEST_TIMEOUT_MS),

  biometricLogin: (body: { email: string; credentialToken: string }) =>
    authRequest<LoginResponse>('/vault/auth/biometric/login', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        credentialToken: body.credentialToken.trim(),
      }),
    }, false, AUTH_REQUEST_TIMEOUT_MS),

  enrollBiometricCredential: () =>
    request<BiometricEnrollmentResponse>('/vault/auth/biometric/enroll', {
      method: 'POST',
    }),

  revokeBiometricCredential: () =>
    request<{ message: string }>('/vault/auth/biometric', {
      method: 'DELETE',
    }),

  getDuressSettings: () =>
    request<DuressSettingsResponse>('/vault/auth/duress'),

  configureDuressMode: (body: {
    currentPassword: string;
    duressPassword: string;
    alertEnabled: boolean;
    alertContactUserId?: number | null;
    alertDelayMinutes: number;
  }) =>
    request<DuressSettingsResponse>('/vault/auth/duress', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  disableDuressMode: (currentPassword: string) =>
    request<{ message: string }>('/vault/auth/duress', {
      method: 'DELETE',
      body: JSON.stringify({ currentPassword }),
    }),

  openDuressPreview: (currentPassword: string) =>
    request<LoginResponse>('/vault/auth/duress/preview', {
      method: 'POST',
      body: JSON.stringify({ currentPassword }),
    }),


  getIncidentOverview: async () => {
    const result = await request<IncidentOverview>('/vault/auth/incidents');
    try {
      if (result.activeIncident?.status === 'ACTIVE') {
        await AsyncStorage.setItem('guardianIncidentLockdown', 'true');
      } else {
        await AsyncStorage.removeItem('guardianIncidentLockdown');
      }
    } catch {
      // The server response is authoritative. A local storage failure must not
      // turn a successful incident-status read into a false API failure.
    }
    return result;
  },

  startIncidentLockdown: async (body: {
    type: SecurityIncidentType;
    currentPassword: string;
    note?: string;
  }) => {
    const result = await request<SecurityIncident>('/vault/auth/incidents/start', {
      method: 'POST',
      body: JSON.stringify({
        type: body.type,
        currentPassword: body.currentPassword,
        note: body.note?.trim() || null,
      }),
    });
    clearOfflineVaultMemoryCache();
    try {
      await markOfflineVaultStale();
      await AsyncStorage.setItem('guardianIncidentLockdown', 'true');
    } catch {
      /*
       * Lockdown is already active on the backend. Never report a false start
       * failure merely because local storage cleanup failed on this device.
       */
    }
    try {
      const { suspendGuardianAutofillForDuressSession } = await import('./autofillSync');
      await suspendGuardianAutofillForDuressSession();
    } catch {
      // Native autofill cleanup is best-effort; backend restrictions remain authoritative.
    }
    return result;
  },

  updateIncidentTask: async (
    incidentId: number | string,
    taskId: number | string,
    status: IncidentTaskStatus
  ) => {
    const result = await request<SecurityIncident>(
      `/vault/auth/incidents/${incidentId}/tasks/${taskId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    );
    return result;
  },

  rotateIncidentMasterPassword: async (
    incidentId: number | string,
    currentPassword: string,
    newPassword: string
  ) => {
    const result = await request<SecurityIncident>(
      `/vault/auth/incidents/${incidentId}/rotate-password`,
      {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }
    );
    return result;
  },

  completeIncidentLockdown: async (incidentId: number | string) => {
    const result = await request<SecurityIncident>(
      `/vault/auth/incidents/${incidentId}/complete`,
      { method: 'POST' }
    );
    try {
      await AsyncStorage.removeItem('guardianIncidentLockdown');
    } catch {
      // A later overview refresh will reconcile the local navigation marker.
    }
    return result;
  },

  cancelIncidentLockdown: async (
    incidentId: number | string,
    currentPassword: string
  ) => {
    const result = await request<SecurityIncident>(
      `/vault/auth/incidents/${incidentId}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ currentPassword }),
      }
    );
    try {
      await AsyncStorage.removeItem('guardianIncidentLockdown');
    } catch {
      // A later overview refresh will reconcile the local navigation marker.
    }
    return result;
  },

  getLegalConsent: (version: string) =>
    request<LegalConsentResponse>(
      `/vault/auth/legal-consent?version=${encodeURIComponent(version.trim())}`
    ),

  saveLegalConsent: (body: {
    version: string;
    privacyAccepted: boolean;
    termsAccepted: boolean;
    clientSource?: string;
  }) =>
    request<LegalConsentResponse>('/vault/auth/legal-consent', {
      method: 'POST',
      body: JSON.stringify({
        version: body.version.trim(),
        privacyAccepted: body.privacyAccepted,
        termsAccepted: body.termsAccepted,
        clientSource: body.clientSource || 'MOBILE_APP',
      }),
    }),

  verifyTwoFactor: (body: { email: string; code: string }) =>
    authRequest<LoginResponse>('/vault/auth/verify-2fa', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        code: body.code.trim(),
      }),
    }, false, AUTH_REQUEST_TIMEOUT_MS),

  verifyEmail: async (body: { email: string; code: string }) => {
    const result = await authRequest<{ message: string }>('/vault/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        code: body.code.trim(),
      }),
    }, false, AUTH_REQUEST_TIMEOUT_MS);

    trackFeatureAction('AUTH', 'EMAIL_VERIFIED');
    markSecurityScoreDirty('email-verification');
    return result;
  },

  resendVerification: (body: { email: string }) =>
    authRequest<{ message: string }>('/vault/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: body.email.trim().toLowerCase() }),
    }, false, AUTH_REQUEST_TIMEOUT_MS),

  forgotPassword: (body: { email: string }) =>
    authRequest<{ message: string }>('/vault/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: body.email.trim().toLowerCase() }),
    }, false, AUTH_REQUEST_TIMEOUT_MS),

  resetPassword: async (body: { email: string; code: string; newPassword: string }) => {
    const result = await authRequest<{ message: string }>('/vault/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        code: body.code.trim(),
        newPassword: body.newPassword,
      }),
    }, false, AUTH_REQUEST_TIMEOUT_MS);

    trackFeatureAction('AUTH', 'PASSWORD_RESET_COMPLETED');
    return result;
  },

  getRecoveryKitStatus: () =>
    cachedGet<RecoveryKitStatusResponse>('/vault/recovery-kit/status'),

  generateRecoveryKit: async (body: { password: string }) => {
    const result = await request<RecoveryKitResponse>('/vault/recovery-kit/generate', {
      method: 'POST',
      body: JSON.stringify({ password: body.password }),
    }, true, AUTH_REQUEST_TIMEOUT_MS);
    clearCache('GET:/vault/recovery-kit/status');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    markSecurityScoreDirty('recovery-kit');
    trackFeatureAction('RECOVERY_KIT', 'GENERATED');
    return result;
  },

  revokeRecoveryKit: async () => {
    const result = await request<{ message: string }>('/vault/recovery-kit', {
      method: 'DELETE',
    });
    clearCache('GET:/vault/recovery-kit/status');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    markSecurityScoreDirty('recovery-kit');
    trackFeatureAction('RECOVERY_KIT', 'REVOKED');
    return result;
  },

  recoverWithRecoveryKit: async (body: RecoveryPasswordResetBody) => {
    const result = await request<{ message: string }>('/vault/recovery-kit/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        recoveryId: body.recoveryId.trim().toUpperCase(),
        recoveryKey: body.recoveryKey.trim(),
        newPassword: body.newPassword,
      }),
    }, false, AUTH_REQUEST_TIMEOUT_MS);

    trackFeatureAction('RECOVERY_KIT', 'PASSWORD_RESET_COMPLETED');
    return result;
  },

  resetAccountAndEraseVault: async (body: AccountResetEraseBody) => {
    const result = await request<{ message: string }>('/vault/recovery-kit/reset-account', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        resetCode: body.resetCode.trim(),
        newPassword: body.newPassword,
      }),
    }, false, AUTH_REQUEST_TIMEOUT_MS);

    trackFeatureAction('ACCOUNT', 'RESET_AND_VAULT_ERASED');
    return result;
  },


  getRecoveryCircleOverview: () =>
    request<RecoveryCircleOverview>('/vault/recovery-circle'),

  updateRecoveryCircle: async (body: UpdateRecoveryCircleBody) => {
    const result = await request<RecoveryCircleOverview>('/vault/recovery-circle', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: Boolean(body.enabled),
        threshold: body.threshold ?? 2,
        memberUserIds: body.memberUserIds ?? [],
        password: body.password,
      }),
    }, true, AUTH_REQUEST_TIMEOUT_MS);
    clearCache('GET:/vault/recovery-circle');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('RECOVERY_CIRCLE', body.enabled ? 'CONFIGURED' : 'DISABLED', {
      threshold: body.threshold ?? 2,
      member_count: body.memberUserIds?.length ?? 0,
    });
    return result;
  },

  approveRecoveryCircleRequest: async (requestId: string) => {
    const result = await request<RecoveryCircleRequest>(
      `/vault/recovery-circle/requests/${encodeURIComponent(requestId)}/approve`,
      { method: 'POST' }
    );
    clearCache('GET:/vault/recovery-circle');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('RECOVERY_CIRCLE', 'REQUEST_APPROVED');
    return result;
  },

  denyRecoveryCircleRequest: async (requestId: string) => {
    const result = await request<RecoveryCircleRequest>(
      `/vault/recovery-circle/requests/${encodeURIComponent(requestId)}/deny`,
      { method: 'POST' }
    );
    clearCache('GET:/vault/recovery-circle');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('RECOVERY_CIRCLE', 'REQUEST_DENIED');
    return result;
  },

  cancelRecoveryCircleRequest: async (requestId: string) => {
    const result = await request<{ message: string }>(
      `/vault/recovery-circle/requests/${encodeURIComponent(requestId)}/cancel`,
      { method: 'POST' }
    );
    clearCache('GET:/vault/recovery-circle');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('RECOVERY_CIRCLE', 'REQUEST_CANCELLED');
    return result;
  },

  startRecoveryCircle: (body: { email: string; recoveryCode: string }) =>
    request<StartRecoveryCircleResponse>('/vault/recovery-circle/recovery/start', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        recoveryCode: body.recoveryCode.trim(),
      }),
    }, false, AUTH_REQUEST_TIMEOUT_MS),

  getRecoveryCircleStatus: (body: RecoveryCircleCredentials) =>
    request<RecoveryCirclePublicStatus>('/vault/recovery-circle/recovery/status', {
      method: 'POST',
      body: JSON.stringify({
        requestId: body.requestId.trim().toUpperCase(),
        recoveryCode: body.recoveryCode.trim(),
      }),
    }, false, AUTH_REQUEST_TIMEOUT_MS),

  completeRecoveryCircle: async (
    body: RecoveryCircleCredentials & { newPassword: string }
  ) => {
    const result = await request<{ message: string }>(
      '/vault/recovery-circle/recovery/complete',
      {
        method: 'POST',
        body: JSON.stringify({
          requestId: body.requestId.trim().toUpperCase(),
          recoveryCode: body.recoveryCode.trim(),
          newPassword: body.newPassword,
        }),
      },
      false,
      AUTH_REQUEST_TIMEOUT_MS
    );
    trackFeatureAction('RECOVERY_CIRCLE', 'PASSWORD_RESET_COMPLETED');
    return result;
  },

  getMyProfile: () =>
    cachedGet<UserProfileResponse>('/vault/users/me'),

  updateMyProfile: async (body: { fullName: string }) => {
    const result = await request<UserProfileResponse>('/vault/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify({ fullName: body.fullName.trim() }),
    });
    clearCache('GET:/vault/users/me');
    trackFeatureAction('ACCOUNT', 'PROFILE_UPDATED');
    return result;
  },

  getSecuritySettings: () =>
    cachedGet<{ emailVerified: boolean; twoFactorEnabled: boolean }>('/vault/auth/me/security'),

  setTwoFactorEnabled: async (enabled: boolean) => {
    const result = await request<{ emailVerified: boolean; twoFactorEnabled: boolean }>('/vault/auth/2fa', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
    clearCache('GET:/vault/auth/me/security');
    markSecurityScoreDirty('two-factor');
    trackFeatureAction('SECURITY', 'TWO_FACTOR_CHANGED', { enabled });
    return result;
  },

  getSubscription: () =>
    cachedGet<SubscriptionResponse>('/vault/api/subscriptions/me'),

  /*
   * Fresh subscription check used before plan-gated actions.
   * This bypasses cached plan data so the app does not think a user is Family
   * while the backend token/session says otherwise.
   */
  getSubscriptionFresh: async () => {
    const result = await request<SubscriptionResponse>('/vault/api/subscriptions/me');
    clearCache('GET:/vault/api/subscriptions/me');
    return result;
  },

  cancelSubscription: async () => {
    const result = await request<SubscriptionResponse>('/vault/api/subscriptions/cancel', {
      method: 'POST',
    });
    clearVaultCaches('subscription');
    void captureAnalyticsEvent('subscription_cancelled');
    return result;
  },

  upgradeSubscription: async (plan: 'PREMIUM' | 'FAMILY') => {
    const result = await request<SubscriptionResponse>(`/vault/api/subscriptions/upgrade?plan=${plan}`, {
      method: 'POST',
    });
    clearVaultCaches('subscription');
    void captureAnalyticsEvent('subscription_upgraded', { plan });
    return result;
  },

  getBackupStatus: () =>
    cachedGet<BackupStatusResponse>('/vault/backup/status'),

  createBackup: async () => {
    const result = await request<BackupResponse>('/vault/backup/create', {
      method: 'POST',
    }, true, LONG_REQUEST_TIMEOUT_MS);
    clearCache('GET:/vault/backup/status');
    markSecurityScoreDirty('backup');
    trackFeatureAction('BACKUP', 'CREATED', {
      item_count_bucket:
        result.totalItemCount < 10
          ? '<10'
          : result.totalItemCount < 50
            ? '10-49'
            : result.totalItemCount < 200
              ? '50-199'
              : '200+',
      size_bucket: getAnalyticsSizeBucket(result.backupSizeBytes),
    });
    return result;
  },

  restoreBackup: async (body: BackupRestoreRequest) => {
    const result = await request<BackupRestoreResponse>('/vault/backup/restore', {
      method: 'POST',
      body: JSON.stringify({
        encryptedBackup: body.encryptedBackup,
        replaceExisting: Boolean(body.replaceExisting),
      }),
    }, true, LONG_REQUEST_TIMEOUT_MS);
    clearVaultCaches('backup');
    clearCache('GET:/vault/backup/status');
    trackFeatureAction('BACKUP', 'RESTORED', {
      replace_existing: Boolean(body.replaceExisting),
      restored_count_bucket:
        result.totalRestoredCount < 10
          ? '<10'
          : result.totalRestoredCount < 50
            ? '10-49'
            : result.totalRestoredCount < 200
              ? '50-199'
              : '200+',
    });
    return result;
  },

  initializePayment: async (plan: 'PREMIUM' | 'FAMILY') => {
    void captureAnalyticsEvent('subscription_checkout_started', { plan });
    return request<{ authorizationUrl: string; accessCode: string; reference: string }>('/vault/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }, true, LONG_REQUEST_TIMEOUT_MS);
  },

  verifyPayment: async (reference: string) => {
    const result = await request('/vault/payments/verify', {
      method: 'POST',
      body: JSON.stringify({ reference }),
    }, true, LONG_REQUEST_TIMEOUT_MS);
    clearVaultCaches('subscription');
    void captureAnalyticsEvent('subscription_payment_verified');
    return result;
  },

  createVaultItem: async (body: CreateVaultItemBody) => {
    const result = await request<VaultItem>('/api/vault', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    clearVaultCaches('vault-password');
    void captureAnalyticsEvent('vault_item_created', { item_type: 'PASSWORD' });
    return result;
  },

  getVaultItems: () =>
    cachedGet<VaultItem[]>('/api/vault', normalizePasswords, VAULT_LIST_TIMEOUT_MS),

  getVaultItem: (id: number | string) =>
    cachedGet<VaultItem>(`/api/vault/${id}`, (item) => ({
      ...item,
      itemType: item.itemType || 'PASSWORD',
    }) as VaultItem, VAULT_LIST_TIMEOUT_MS),

  updateVaultItem: async (id: number | string, body: UpdateVaultItemBody) => {
    const result = await request<VaultItem>(`/api/vault/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    clearVaultCaches('vault-password');
    trackFeatureAction('VAULT', 'ITEM_UPDATED', { item_type: 'PASSWORD' });
    return result;
  },

  deleteVaultItem: async (id: number | string) => {
    const result = await request<void>(`/api/vault/${id}`, {
      method: 'DELETE',
    });
    clearVaultCaches('vault-password');
    trackFeatureAction('VAULT', 'ITEM_DELETED', { item_type: 'PASSWORD' });
    return result;
  },


  createDocumentUploadTask: async (file: {
    uri: string;
    name: string;
    type: string;
    size?: number;
    documentTitle: string;
  }) => {
    const safeFile = validateDocumentUploadInput(file);
    const token = await getToken();

    if (!token) {
      throw new GuardianApiError('You are not logged in. Please log in again.', {
        path: '/vault/documents/upload',
        code: 'UNAUTHENTICATED',
      });
    }

    let xhr: XMLHttpRequest | null = null;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const start = async () => new Promise<any>(async (resolve, reject) => {
      const uploadStartedAt = Date.now();

      try {
        const deviceHeaders = await getGuardianDeviceHeaders();
        const formData = new FormData();

        /*
         * Use XMLHttpRequest for document uploads instead of fetch.
         * Expo/RN fetch can throw "Unsupported FormDataPart implementation"
         * for Files-picked PDFs/DOCX and sometimes even images depending on
         * the native runtime. XMLHttpRequest handles RN FormData file parts
         * more consistently and still lets us abort the upload.
         */
        formData.append('file', {
          uri: safeFile.uri,
          name: safeFile.name || `document_${Date.now()}`,
          type: safeFile.type || 'application/octet-stream',
        } as any);

        formData.append('documentName', safeFile.documentTitle || safeFile.name || 'Document');
        formData.append('documentType', safeFile.type || 'application/octet-stream');
        formData.append('sizeBytes', String(safeFile.size || 0));

        xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE_URL}/vault/documents/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        Object.entries(deviceHeaders).forEach(([key, value]) => {
          xhr?.setRequestHeader(key, String(value));
        });

        timeoutId = setTimeout(() => {
          cancelled = true;
          recordApiRequest({
            path: '/vault/documents/upload',
            method: 'POST',
            durationMs: Date.now() - uploadStartedAt,
            success: false,
            code: 'UPLOAD_TIMEOUT',
          });
          xhr?.abort();
        }, DOCUMENT_UPLOAD_TIMEOUT_MS);

        xhr.onload = () => {
          if (timeoutId) clearTimeout(timeoutId);

          const responseText = xhr?.responseText || '';
          let data: any = null;

          try {
            data = responseText ? JSON.parse(responseText) : null;
          } catch {
            data = responseText;
          }

          const status = xhr?.status || 0;

          if (status >= 200 && status < 300) {
            recordApiRequest({
              path: '/vault/documents/upload',
              method: 'POST',
              status,
              durationMs: Date.now() - uploadStartedAt,
              success: true,
            });
            clearVaultCaches('vault-item');
            void captureAnalyticsEvent('vault_item_created', {
              item_type: 'DOCUMENT',
              file_kind: getAnalyticsFileKind(safeFile.type),
              size_bucket: getAnalyticsSizeBucket(safeFile.size),
            });
            resolve(data);
            return;
          }

          const serverMessage = getServerMessage(data, responseText);
          const uploadCode = String(data?.code || data?.errorCode || '').trim() || 'UPLOAD_HTTP_ERROR';
          recordApiRequest({
            path: '/vault/documents/upload',
            method: 'POST',
            status,
            durationMs: Date.now() - uploadStartedAt,
            success: false,
            code: uploadCode,
          });
          if (uploadCode === 'PLAN_LIMIT_REACHED') {
            trackPlanLimitReached('/vault/documents/upload', status);
          }

          reject(new GuardianApiError(
            getFriendlyErrorMessage(status, '/vault/documents/upload', serverMessage),
            {
              status,
              path: '/vault/documents/upload',
              rawMessage: serverMessage,
              code: uploadCode,
              data,
            }
          ));
        };

        xhr.onerror = () => {
          if (timeoutId) clearTimeout(timeoutId);

          if (cancelled) {
            reject(new GuardianApiError('The upload was cancelled.', {
              path: '/vault/documents/upload',
              code: 'UPLOAD_CANCELLED',
            }));
            return;
          }

          recordApiRequest({
            path: '/vault/documents/upload',
            method: 'POST',
            durationMs: Date.now() - uploadStartedAt,
            success: false,
            code: 'UPLOAD_FAILED',
          });

          reject(new GuardianApiError(
            'The upload was interrupted. Please check your connection and try again.',
            {
              path: '/vault/documents/upload',
              code: 'UPLOAD_FAILED',
            }
          ));
        };

        xhr.onabort = () => {
          if (timeoutId) clearTimeout(timeoutId);
          reject(new GuardianApiError('The upload was cancelled.', {
            path: '/vault/documents/upload',
            code: 'UPLOAD_CANCELLED',
          }));
        };

        xhr.ontimeout = () => {
          if (timeoutId) clearTimeout(timeoutId);
          recordApiRequest({
            path: '/vault/documents/upload',
            method: 'POST',
            durationMs: Date.now() - uploadStartedAt,
            success: false,
            code: 'UPLOAD_TIMEOUT',
          });

          reject(new GuardianApiError(
            'The upload took too long and timed out. Try again on a stronger connection or choose a smaller file.',
            {
              path: '/vault/documents/upload',
              code: 'UPLOAD_TIMEOUT',
            }
          ));
        };

        xhr.send(formData);
      } catch (error: unknown) {
        if (timeoutId) clearTimeout(timeoutId);
        safeLogError('DOCUMENT_UPLOAD_SETUP', error);
        reject(
          error instanceof GuardianApiError
            ? error
            : new GuardianApiError(
                'The upload could not start. Please try again.',
                {
                  path: '/vault/documents/upload',
                  code: 'UPLOAD_SETUP_FAILED',
                }
              )
        );
      }
    });

    const cancel = () => {
      cancelled = true;
      xhr?.abort();
    };

    return { start, cancel };
  },

  createDocumentMultipart: async (file: {
    uri: string;
    name: string;
    type: string;
    size?: number;
    documentTitle: string;
  }) => {
    const safeFile = validateDocumentUploadInput(file);
    const token = await getToken();

    if (!token) {
      throw new GuardianApiError('Please sign in again.', {
        status: 401,
        path: '/vault/documents/upload',
        code: 'UNAUTHENTICATED',
      });
    }

    try {
      const result = await FileSystem.uploadAsync(
        `${API_BASE_URL}/vault/documents/upload`,
        safeFile.uri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: 'file',
          mimeType: safeFile.type || 'application/octet-stream',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          parameters: {
            documentName: safeFile.documentTitle,
            documentType: safeFile.type || 'application/octet-stream',
            sizeBytes: String(safeFile.size || 0),
          },
        }
      );

      return parseUploadResult(result);
    } catch (error: unknown) {
      safeLogError('DOCUMENT_MULTIPART_UPLOAD', error);
      if (error instanceof GuardianApiError) throw error;
      throw new GuardianApiError('The document could not be uploaded.', {
        path: '/vault/documents/upload',
        code: 'UPLOAD_FAILED',
      });
    }
  },

  createDocumentFromPickedFile: async (
    pickedFile: any,
    file: {
      name: string;
      type: string;
      size?: number;
      documentTitle: string;
    }
  ) => {
    const safeFile = validateDocumentUploadMetadata(file);
    const token = await getToken();

    if (!token) {
      throw new GuardianApiError('Please sign in again.', {
        status: 401,
        path: '/vault/documents/upload',
        code: 'UNAUTHENTICATED',
      });
    }

    try {
      const result = await pickedFile.upload(
        `${API_BASE_URL}/vault/documents/upload`,
        {
          httpMethod: 'POST',
          uploadType: UploadType.MULTIPART,
          fieldName: 'file',
          mimeType: safeFile.type || 'application/octet-stream',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          parameters: {
            documentName: safeFile.documentTitle,
            documentType: safeFile.type || 'application/octet-stream',
            sizeBytes: String(safeFile.size || 0),
          },
        }
      );

      return parseUploadResult(result);
    } catch (error: unknown) {
      safeLogError('DOCUMENT_PICKED_FILE_UPLOAD', error);
      if (error instanceof GuardianApiError) throw error;
      throw new GuardianApiError('The document could not be uploaded.', {
        path: '/vault/documents/upload',
        code: 'UPLOAD_FAILED',
      });
    }
  },

  createDocument: async (body: {
    documentName: string;
    documentType?: string;
    encryptedFileUrl: string;
    encryptedNotes?: string;
  }) => {
    const result = await request('/vault/documents', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    clearVaultCaches('vault-item');
    void captureAnalyticsEvent('vault_item_created', { item_type: 'DOCUMENT' });
    return result;
  },

  getDocuments: () =>
    cachedGet<any[]>('/vault/documents', undefined, VAULT_LIST_TIMEOUT_MS),

  getDocument: (id: number | string) =>
    request<any>(
      `/vault/documents/${id}`,
      {},
      true,
      VAULT_LIST_TIMEOUT_MS
    ),

  downloadDocumentToCache: async (
    id: number | string,
    fileName = 'document',
    mimeType = 'application/octet-stream'
  ) => {
    const result = await downloadAuthenticatedFile(
      `/vault/documents/${id}/download`,
      fileName,
      mimeType
    );
    trackFeatureAction('DOCUMENT', 'DOWNLOADED', {
      file_kind: getAnalyticsFileKind(mimeType),
      size_bucket: getAnalyticsSizeBucket(result.sizeBytes),
      access_source: 'OWN_VAULT',
    });
    return result;
  },

  updateDocument: async (id: number | string, body: any) => {
    const result = await request(`/vault/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    clearVaultCaches('vault-item');
    trackFeatureAction('VAULT', 'ITEM_UPDATED', { item_type: 'DOCUMENT' });
    return result;
  },

  deleteDocument: async (id: number | string) => {
    const result = await request<void>(`/vault/documents/${id}`, {
      method: 'DELETE',
    });
    clearVaultCaches('vault-item');
    trackFeatureAction('VAULT', 'ITEM_DELETED', { item_type: 'DOCUMENT' });
    return result;
  },

  createCard: async (body: {
    cardName: string;
    encryptedCardNumber: string;
    encryptedExpiryDate: string;
    encryptedCvv: string;
    encryptedCardholderName?: string;
    encryptedNotes?: string;
  }) => {
    const result = await request<CreditCardResponse>('/vault/cards', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    clearVaultCaches('vault-item');
    void captureAnalyticsEvent('vault_item_created', { item_type: 'CARD' });
    return result;
  },

  getCards: () =>
    cachedGet<CreditCardResponse[]>('/vault/cards', undefined, VAULT_LIST_TIMEOUT_MS),

  getCard: (id: number | string) =>
    cachedGet<CreditCardResponse>(`/vault/cards/${id}`, undefined, VAULT_LIST_TIMEOUT_MS),

  updateCard: async (id: number | string, body: any) => {
    const result = await request<CreditCardResponse>(`/vault/cards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    clearVaultCaches('vault-item');
    trackFeatureAction('VAULT', 'ITEM_UPDATED', { item_type: 'CARD' });
    return result;
  },

  deleteCard: async (id: number | string) => {
    const result = await request<void>(`/vault/cards/${id}`, {
      method: 'DELETE',
    });
    clearVaultCaches('vault-item');
    trackFeatureAction('VAULT', 'ITEM_DELETED', { item_type: 'CARD' });
    return result;
  },


  createSecureNote: async (body: SecureNoteBody) => {
    const result = await request<SecureNoteResponse>('/vault/notes', {
      method: 'POST',
      body: JSON.stringify({
        title: body.title.trim(),
        category: body.category?.trim() || 'General',
        encryptedContent: body.encryptedContent,
        pinned: Boolean(body.pinned),
      }),
    });
    clearVaultCaches('vault-item');
    void captureAnalyticsEvent('vault_item_created', { item_type: 'NOTE' });
    return result;
  },

  getSecureNotes: () =>
    cachedGet<SecureNoteResponse[]>('/vault/notes', undefined, VAULT_LIST_TIMEOUT_MS),

  getSecureNote: (id: number | string) =>
    cachedGet<SecureNoteResponse>(`/vault/notes/${id}`, undefined, VAULT_LIST_TIMEOUT_MS),

  updateSecureNote: async (id: number | string, body: Partial<SecureNoteBody>) => {
    const result = await request<SecureNoteResponse>(`/vault/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: body.title?.trim(),
        category: body.category?.trim() || 'General',
        encryptedContent: body.encryptedContent,
        pinned: Boolean(body.pinned),
      }),
    });
    clearVaultCaches('vault-item');
    trackFeatureAction('VAULT', 'ITEM_UPDATED', {
      item_type: 'NOTE',
      pinned: Boolean(body.pinned),
    });
    return result;
  },

  deleteSecureNote: async (id: number | string) => {
    const result = await request<void>(`/vault/notes/${id}`, {
      method: 'DELETE',
    });
    clearVaultCaches('vault-item');
    trackFeatureAction('VAULT', 'ITEM_DELETED', { item_type: 'NOTE' });
    return result;
  },

  getEstateOverview: () =>
    request<EstateOverview>('/vault/estate-playbooks'),

  createEstatePlaybook: async (body: EstatePlaybookBody) => {
    const result = await request<EstatePlaybook>('/vault/estate-playbooks', {
      method: 'POST',
      body: JSON.stringify({
        itemType: body.itemType,
        itemId: body.itemId,
        actionType: body.actionType,
        triggerType: body.triggerType,
        recipientContactId: body.recipientContactId ?? null,
        instructions: body.instructions?.trim() || '',
      }),
    });
    clearCache('GET:/vault/estate-playbooks');
    clearCache('GET:/vault/emergency/overview');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('ESTATE_PLAYBOOKS', 'CREATED', {
      action_type: body.actionType,
      trigger_type: body.triggerType,
      item_type: body.itemType,
    });
    return result;
  },

  updateEstatePlaybook: async (id: number | string, body: EstatePlaybookBody) => {
    const result = await request<EstatePlaybook>(`/vault/estate-playbooks/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        itemType: body.itemType,
        itemId: body.itemId,
        actionType: body.actionType,
        triggerType: body.triggerType,
        recipientContactId: body.recipientContactId ?? null,
        instructions: body.instructions?.trim() || '',
      }),
    });
    clearCache('GET:/vault/estate-playbooks');
    clearCache('GET:/vault/emergency/overview');
    trackFeatureAction('ESTATE_PLAYBOOKS', 'UPDATED', {
      action_type: body.actionType,
      trigger_type: body.triggerType,
      item_type: body.itemType,
    });
    return result;
  },

  archiveEstatePlaybook: async (id: number | string) => {
    const result = await request<void>(`/vault/estate-playbooks/${id}`, {
      method: 'DELETE',
    });
    clearCache('GET:/vault/estate-playbooks');
    clearCache('GET:/vault/emergency/overview');
    trackFeatureAction('ESTATE_PLAYBOOKS', 'ARCHIVED');
    return result;
  },

  pauseEstatePlaybook: async (id: number | string) => {
    const result = await request<EstatePlaybook>(`/vault/estate-playbooks/${id}/pause`, {
      method: 'POST',
    });
    clearCache('GET:/vault/estate-playbooks');
    trackFeatureAction('ESTATE_PLAYBOOKS', 'PAUSED');
    return result;
  },

  resumeEstatePlaybook: async (id: number | string) => {
    const result = await request<EstatePlaybook>(`/vault/estate-playbooks/${id}/resume`, {
      method: 'POST',
    });
    clearCache('GET:/vault/estate-playbooks');
    trackFeatureAction('ESTATE_PLAYBOOKS', 'RESUMED');
    return result;
  },

  releaseEstatePlaybook: async (id: number | string) => {
    const result = await request<EstateExecution>(`/vault/estate-playbooks/${id}/release`, {
      method: 'POST',
    });
    clearCache('GET:/vault/estate-playbooks');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('ESTATE_PLAYBOOKS', 'RELEASED');
    return result;
  },

  cancelEstateExecution: async (id: number | string) => {
    const result = await request<EstateExecution>(
      `/vault/estate-playbooks/executions/${id}/cancel`,
      { method: 'POST' }
    );
    clearCache('GET:/vault/estate-playbooks');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('ESTATE_PLAYBOOKS', 'RELEASE_CANCELLED');
    return result;
  },

  completeEstateExecution: async (id: number | string) => {
    const result = await request<EstateExecution>(
      `/vault/estate-playbooks/executions/${id}/complete`,
      { method: 'POST' }
    );
    clearCache('GET:/vault/estate-playbooks');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('ESTATE_PLAYBOOKS', 'TASK_COMPLETED');
    return result;
  },

  getEstateReleasedItem: (id: number | string) =>
    request<EstateReleasedItem>(`/vault/estate-playbooks/executions/${id}/item`),

  downloadEstateDocumentToCache: async (
    executionId: number | string,
    fileName = 'estate-document',
    mimeType = 'application/octet-stream'
  ) => {
    const result = await downloadAuthenticatedFile(
      `/vault/estate-playbooks/executions/${executionId}/document`,
      fileName,
      mimeType
    );
    trackFeatureAction('ESTATE_PLAYBOOKS', 'DOCUMENT_DOWNLOADED', {
      file_kind: getAnalyticsFileKind(mimeType),
      size_bucket: getAnalyticsSizeBucket(result.sizeBytes),
    });
    return result;
  },

  getContinuityOverview: () =>
    request<ContinuityOverview>('/vault/continuity-drill'),

  startContinuityDrill: async () => {
    const result = await request<ContinuityDrill>('/vault/continuity-drill/start', {
      method: 'POST',
    });
    clearCache('GET:/vault/continuity-drill');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('CONTINUITY_DRILL', 'STARTED', {
      participant_count: result.participantCount,
      static_score: result.staticScore,
    });
    return result;
  },

  completeContinuityDrill: async (drillId: number | string) => {
    const result = await request<ContinuityDrill>(
      `/vault/continuity-drill/${drillId}/complete`,
      { method: 'POST' }
    );
    clearCache('GET:/vault/continuity-drill');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('CONTINUITY_DRILL', 'COMPLETED', { score: result.score });
    return result;
  },

  cancelContinuityDrill: async (drillId: number | string) => {
    const result = await request<ContinuityDrill>(
      `/vault/continuity-drill/${drillId}/cancel`,
      { method: 'POST' }
    );
    clearCache('GET:/vault/continuity-drill');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('CONTINUITY_DRILL', 'CANCELLED');
    return result;
  },

  acknowledgeContinuityDrill: async (publicId: string) => {
    const result = await request<ContinuityAcknowledgement>(
      `/vault/continuity-drill/requests/${encodeURIComponent(publicId)}/acknowledge`,
      { method: 'POST' }
    );
    clearCache('GET:/vault/continuity-drill');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('CONTINUITY_DRILL', 'ACKNOWLEDGED');
    return result;
  },

  getEmergencyOverview: () =>
    cachedGet<EmergencyOverviewResponse>('/vault/emergency/overview'),

  getGuardianSafetyCheck: () =>
    request<GuardianSafetyCheckResponse>('/vault/safety-check'),

  updateGuardianSafetyCheck: async (body: UpdateGuardianSafetyCheckBody) => {
    const result = await request<GuardianSafetyCheckResponse>('/vault/safety-check', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: Boolean(body.enabled),
        contactId: body.contactId ?? null,
        intervalDays: body.intervalDays ?? null,
        gracePeriodHours: body.gracePeriodHours ?? null,
      }),
    });
    clearCache('GET:/vault/safety-check');
    clearCache('GET:/vault/emergency/overview');
    clearCache('GET:/vault/emergency/audit');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('SAFETY_CHECK', body.enabled ? 'CONFIGURED' : 'DISABLED', {
      interval_days: body.intervalDays ?? 0,
      grace_period_hours: body.gracePeriodHours ?? 0,
    });
    return result;
  },

  completeGuardianSafetyCheck: async () => {
    const result = await request<GuardianSafetyCheckResponse>(
      '/vault/safety-check/check-in',
      { method: 'POST' }
    );
    clearCache('GET:/vault/safety-check');
    clearCache('GET:/vault/emergency/overview');
    clearCache('GET:/vault/emergency/audit');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('SAFETY_CHECK', 'CHECKED_IN');
    return result;
  },

  getEmergencyContacts: () =>
    cachedGet<EmergencyContactResponse[]>('/vault/emergency/contacts'),

  getEmergencyContact: (id: number | string) =>
    cachedGet<EmergencyContactResponse>(`/vault/emergency/contacts/${id}`),

  createEmergencyContact: async (body: EmergencyContactBody) => {
    const result = await request<EmergencyContactResponse>('/vault/emergency/contacts', {
      method: 'POST',
      body: JSON.stringify({
        contactEmail: body.contactEmail.trim().toLowerCase(),
        contactName: body.contactName?.trim() || '',
        relationship: body.relationship?.trim() || 'Trusted contact',
        waitingPeriodHours: body.waitingPeriodHours || 72,
        allowPasswords: Boolean(body.allowPasswords),
        allowCards: Boolean(body.allowCards),
        allowDocuments: Boolean(body.allowDocuments),
        allowNotes: body.allowNotes !== false,
        encryptedEmergencyNote: body.encryptedEmergencyNote || '',
        active: body.active !== false,
      }),
    });
    clearVaultCaches();
    trackFeatureAction('EMERGENCY_ACCESS', 'CONTACT_ADDED', {
      waiting_period_bucket:
        (body.waitingPeriodHours || 72) <= 24
          ? '24H'
          : (body.waitingPeriodHours || 72) <= 48
            ? '48H'
            : '72H+',
      permission_count:
        Number(Boolean(body.allowPasswords)) +
        Number(Boolean(body.allowCards)) +
        Number(Boolean(body.allowDocuments)) +
        Number(body.allowNotes !== false),
    });
    return result;
  },

  updateEmergencyContact: async (id: number | string, body: EmergencyContactBody) => {
    const result = await request<EmergencyContactResponse>(`/vault/emergency/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        contactEmail: body.contactEmail.trim().toLowerCase(),
        contactName: body.contactName?.trim() || '',
        relationship: body.relationship?.trim() || 'Trusted contact',
        waitingPeriodHours: body.waitingPeriodHours || 72,
        allowPasswords: Boolean(body.allowPasswords),
        allowCards: Boolean(body.allowCards),
        allowDocuments: Boolean(body.allowDocuments),
        allowNotes: body.allowNotes !== false,
        encryptedEmergencyNote: body.encryptedEmergencyNote || '',
        active: body.active !== false,
      }),
    });
    clearVaultCaches();
    trackFeatureAction('EMERGENCY_ACCESS', 'CONTACT_UPDATED', {
      active: body.active !== false,
      permission_count:
        Number(Boolean(body.allowPasswords)) +
        Number(Boolean(body.allowCards)) +
        Number(Boolean(body.allowDocuments)) +
        Number(body.allowNotes !== false),
    });
    return result;
  },

  deleteEmergencyContact: async (id: number | string) => {
    const result = await request<void>(`/vault/emergency/contacts/${id}`, {
      method: 'DELETE',
    });
    clearVaultCaches();
    trackFeatureAction('EMERGENCY_ACCESS', 'CONTACT_REMOVED');
    return result;
  },

  requestEmergencyAccess: async (body: { ownerEmail: string; message?: string }) => {
    const result = await request<EmergencyAccessRequestResponse>('/vault/emergency/requests', {
      method: 'POST',
      body: JSON.stringify({
        ownerEmail: body.ownerEmail.trim().toLowerCase(),
        message: body.message?.trim() || '',
      }),
    });
    clearVaultCaches();
    trackFeatureAction('EMERGENCY_ACCESS', 'REQUEST_SENT', {
      has_optional_text: Boolean(body.message?.trim()),
    });
    return result;
  },

  getEmergencyRequests: () =>
    cachedGet<EmergencyAccessRequestResponse[]>('/vault/emergency/requests'),

  approveEmergencyRequest: async (id: number | string) => {
    const result = await request<EmergencyAccessRequestResponse>(`/vault/emergency/requests/${id}/approve`, {
      method: 'POST',
    });
    clearVaultCaches();
    trackFeatureAction('EMERGENCY_ACCESS', 'REQUEST_APPROVED');
    return result;
  },

  denyEmergencyRequest: async (id: number | string) => {
    const result = await request<EmergencyAccessRequestResponse>(`/vault/emergency/requests/${id}/deny`, {
      method: 'POST',
    });
    clearVaultCaches();
    trackFeatureAction('EMERGENCY_ACCESS', 'REQUEST_DENIED');
    return result;
  },

  getEmergencyAuditLogs: () =>
    cachedGet<EmergencyAuditLogResponse[]>('/vault/emergency/audit'),


  getEmergencyVaultItems: (requestId: number | string) =>
    cachedGet<EmergencyVaultItemsResponse>(`/vault/emergency/requests/${requestId}/vault`),

  getEmergencyVaultItem: (requestId: number | string, itemType: string, itemId: number | string) =>
    cachedGet<EmergencyVaultItemResponse>(`/vault/emergency/requests/${requestId}/vault/${String(itemType).toUpperCase()}/${itemId}`),

  downloadEmergencyDocumentToCache: async (
    requestId: number | string,
    itemId: number | string,
    fileName = 'emergency-document',
    mimeType = 'application/octet-stream'
  ) => {
    const result = await downloadAuthenticatedFile(
      `/vault/emergency/requests/${requestId}/vault/DOCUMENT/${itemId}/download`,
      fileName,
      mimeType
    );
    trackFeatureAction('EMERGENCY_ACCESS', 'DOCUMENT_DOWNLOADED', {
      file_kind: getAnalyticsFileKind(mimeType),
      size_bucket: getAnalyticsSizeBucket(result.sizeBytes),
    });
    return result;
  },


  getFamilyOverview: () =>
    cachedGet<FamilyOverview>('/vault/family', undefined, VAULT_LIST_TIMEOUT_MS),



  lookupFamilyMemberAccount: (email: string) =>
    request<{ code: string; exists?: boolean; userId?: number; fullName?: string; email?: string }>(
      `/vault/family/members/lookup?email=${encodeURIComponent(email.trim().toLowerCase())}`
    ),

  addFamilyMember: async (
    email: string,
    permissions?: {
      sharePasswords?: boolean;
      shareCards?: boolean;
      shareDocuments?: boolean;
      shareNotes?: boolean;
      passwordItemIds?: number[];
      cardItemIds?: number[];
      documentItemIds?: number[];
      noteItemIds?: number[];
    }
  ) => {
    const passwordItemIds = permissions?.passwordItemIds || [];
    const cardItemIds = permissions?.cardItemIds || [];
    const documentItemIds = permissions?.documentItemIds || [];
    const noteItemIds = permissions?.noteItemIds || [];

    const result = await request<FamilyMember>('/vault/family/members', {
      method: 'POST',
      body: JSON.stringify({
        email,
        sharePasswords: permissions?.sharePasswords ?? passwordItemIds.length > 0,
        shareCards: permissions?.shareCards ?? cardItemIds.length > 0,
        shareDocuments: permissions?.shareDocuments ?? documentItemIds.length > 0,
        shareNotes: permissions?.shareNotes ?? noteItemIds.length > 0,
        passwordItemIds,
        cardItemIds,
        documentItemIds,
        noteItemIds,
      }),
    });
    clearCache('GET:/vault/family');
    clearCache('GET:/vault/family/shared-items');
    clearCache('GET:/vault/family/member-password-risks');
    markSecurityScoreDirty('family-sharing');
    trackFeatureAction('FAMILY', 'MEMBER_ADDED', {
      permission_count:
        Number(Boolean(permissions?.sharePasswords ?? passwordItemIds.length > 0)) +
        Number(Boolean(permissions?.shareCards ?? cardItemIds.length > 0)) +
        Number(Boolean(permissions?.shareDocuments ?? documentItemIds.length > 0)) +
        Number(Boolean(permissions?.shareNotes ?? noteItemIds.length > 0)),
      selected_item_count:
        passwordItemIds.length +
        cardItemIds.length +
        documentItemIds.length +
        noteItemIds.length,
    });
    return result;
  },

  getFamilyMemberAccess: (membershipId: number | string) =>
    cachedGet<FamilyMemberAccess>(`/vault/family/members/${membershipId}/access`, undefined, VAULT_LIST_TIMEOUT_MS),

  updateFamilyMemberAccess: async (
    membershipId: number | string,
    body: UpdateFamilyMemberAccessBody
  ) => {
    const result = await request<FamilyMemberAccess>(
      `/vault/family/members/${membershipId}/access`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      }
    );
    clearCache('GET:/vault/family');
    clearCache(`GET:/vault/family/members/${membershipId}/access`);
    clearCache('GET:/vault/family/shared-items');
    clearCache('GET:/vault/family/member-password-risks');
    markSecurityScoreDirty('family-sharing');
    trackFeatureAction('FAMILY', 'MEMBER_ACCESS_UPDATED', {
      selected_item_count:
        body.passwordItemIds.length +
        body.cardItemIds.length +
        body.documentItemIds.length +
        body.noteItemIds.length,
    });
    return result;
  },

  removeFamilyMember: async (membershipId: number | string) => {
    const result = await request<void>(`/vault/family/members/${membershipId}`, {
      method: 'DELETE',
    });
    clearCache('GET:/vault/family');
    clearCache('GET:/vault/family/shared-items');
    clearCache('GET:/vault/family/member-password-risks');
    markSecurityScoreDirty('family-sharing');
    trackFeatureAction('FAMILY', 'MEMBER_REMOVED');
    return result;
  },

  getSharedFamilyItems: () =>
    cachedGet<SharedFamilyItems>('/vault/family/shared-items', normalizeSharedFamilyItems, VAULT_LIST_TIMEOUT_MS),

  getFamilyMemberPasswordRisks: async () => {
    if (!(await hasAuthToken())) return [];
    if (!(await isFamilyPlanCached())) return [];

    return cachedGet<FamilyMemberPasswordRisk[]>('/vault/family/member-password-risks', undefined, VAULT_LIST_TIMEOUT_MS);
  },

  getSharedPasswordItems: async () => {
    if (!(await hasAuthToken())) return [];

    return cachedGet<SharedPasswordItem[]>('/vault/family/shared-passwords', normalizeSharedPasswordSummaries, VAULT_LIST_TIMEOUT_MS);
  },

  getSharedPasswordItem: (id: number | string) =>
    cachedGet<SharedPasswordItem>(`/vault/family/shared-passwords/${id}`, (item) => ({
      ...item,
      itemType: 'PASSWORD',
    }) as SharedPasswordItem),

  getSharedCardItems: () =>
    cachedGet<SharedCardItem[]>('/vault/family/shared-cards', normalizeSharedCardSummaries, VAULT_LIST_TIMEOUT_MS),

  getSharedCardItem: (id: number | string) =>
    cachedGet<SharedCardItem>(`/vault/family/shared-cards/${id}`, (item) => ({
      ...item,
      itemType: 'CARD',
    }) as SharedCardItem),

  getSharedDocumentItems: () =>
    cachedGet<SharedDocumentItem[]>('/vault/family/shared-documents', normalizeSharedDocumentSummaries, VAULT_LIST_TIMEOUT_MS),

  getSharedDocumentItem: (id: number | string) =>
    cachedGet<SharedDocumentItem>(`/vault/family/shared-documents/${id}`, (item) => ({
      ...item,
      itemType: 'DOCUMENT',
    }) as SharedDocumentItem),

  downloadSharedDocumentToCache: async (
    id: number | string,
    fileName = 'shared-document',
    mimeType = 'application/octet-stream'
  ) => {
    const result = await downloadAuthenticatedFile(
      `/vault/family/shared-documents/${id}/download`,
      fileName,
      mimeType
    );
    trackFeatureAction('FAMILY', 'SHARED_DOCUMENT_DOWNLOADED', {
      file_kind: getAnalyticsFileKind(mimeType),
      size_bucket: getAnalyticsSizeBucket(result.sizeBytes),
    });
    return result;
  },

  getSharedNoteItems: () =>
    cachedGet<SharedNoteItem[]>('/vault/family/shared-notes', normalizeSharedNoteSummaries, VAULT_LIST_TIMEOUT_MS),

  getSharedNoteItem: (id: number | string) =>
    cachedGet<SharedNoteItem>(`/vault/family/shared-notes/${id}`, (item) => ({
      ...item,
      itemType: 'NOTE',
    }) as SharedNoteItem),

  // Backward-compatible names from the first family version.
  getSharedVaultItems: async () => {
    if (!(await hasAuthToken())) return [];

    return cachedGet<SharedPasswordItem[]>('/vault/family/shared-passwords', normalizeSharedPasswordSummaries, VAULT_LIST_TIMEOUT_MS);
  },

  getSharedVaultItem: (id: number | string) =>
    cachedGet<SharedPasswordItem>(`/vault/family/shared-passwords/${id}`, (item) => ({
      ...item,
      itemType: 'PASSWORD',
    }) as SharedPasswordItem),


  reportSecurityScanAlert: async (body: SecurityScanAlertRequest) => {
    const result = await request<SecurityScanAlertResponse>('/vault/security-alerts/scan', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    return result;
  },

  getNotifications: () =>
    cachedGet<AppNotification[]>('/vault/notifications'),

  getUnreadNotificationCount: () =>
    cachedGet<NotificationUnreadCountResponse>('/vault/notifications/unread-count'),

  markNotificationRead: async (id: number | string) => {
    const result = await request<AppNotification>(`/vault/notifications/${id}/read`, {
      method: 'PUT',
    });
    clearCache('GET:/vault/notifications');
  clearCache('GET:/vault/sessions');
    clearCache('GET:/vault/notifications/unread-count');
    return result;
  },

  markAllNotificationsRead: async () => {
    const result = await request<void>('/vault/notifications/read-all', {
      method: 'PUT',
    });
    clearCache('GET:/vault/notifications');
  clearCache('GET:/vault/sessions');
    clearCache('GET:/vault/notifications/unread-count');
    return result;
  },

  deleteNotification: async (id: number | string) => {
    const result = await request<void>(`/vault/notifications/${id}`, {
      method: 'DELETE',
    });
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/sessions');
    clearCache('GET:/vault/notifications/unread-count');
    return result;
  },

  registerPushToken: (body: RegisterPushTokenRequest) =>
    request<PushTokenResponse>('/vault/notifications/push-token', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  unregisterPushToken: (installationId: string) =>
    request<void>(
      `/vault/notifications/push-token/${encodeURIComponent(installationId)}`,
      { method: 'DELETE' }
    ),

  getNotificationPreferences: () =>
    request<NotificationPreferences>('/vault/notifications/preferences'),

  updateNotificationPreferences: (body: UpdateNotificationPreferences) =>
    request<NotificationPreferences>('/vault/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),


  submitBugReport: async (body: BugReportRequestBody) => {
    const result = await request<BugReportResponse>('/vault/support/bug-reports', {
      method: 'POST',
      body: JSON.stringify({
        title: body.title.trim(),
        category: body.category.trim(),
        severity: body.severity.trim(),
        description: body.description.trim(),
        stepsToReproduce: body.stepsToReproduce?.trim() || '',
        includeDiagnostics: body.includeDiagnostics === true,
        deviceInfo: body.deviceInfo?.trim() || '',
        appVersion: body.appVersion?.trim() || '',
      }),
    });
    clearCache('GET:/vault/support/bug-reports/my');
    void captureAnalyticsEvent('bug_report_submitted', {
      category: body.category.trim(),
      severity: body.severity.trim(),
    });
    return result;
  },

  getMyBugReports: () =>
    cachedGet<BugReportResponse[]>('/vault/support/bug-reports/my'),


  validateCurrentSession: () =>
    request<{ active: boolean; message: string }>('/vault/sessions/heartbeat'),

  getDeviceSessions: () =>
    cachedGet<DeviceSession[]>('/vault/sessions'),

  revokeDeviceSession: async (id: number | string) => {
    const result = await request<{ message: string }>(`/vault/sessions/${id}`, {
      method: 'DELETE',
    });
    clearCache('GET:/vault/sessions');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('DEVICE_SESSION', 'SESSION_REVOKED');
    return result;
  },

  logoutOtherDevices: async () => {
    const result = await request<{ message: string }>('/vault/sessions/logout-others', {
      method: 'POST',
    });
    clearCache('GET:/vault/sessions');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    trackFeatureAction('DEVICE_SESSION', 'OTHER_DEVICES_LOGGED_OUT');
    return result;
  },

  logoutAllDevices: async () => {
    const result = await request<{ message: string }>('/vault/sessions/logout-all', {
      method: 'POST',
    });
    clearCache();
    trackFeatureAction('DEVICE_SESSION', 'ALL_DEVICES_LOGGED_OUT');
    return result;
  },

  deleteAccount: async (body: { password: string }) => {
    const result = await request<{ message: string }>('/vault/users/me', {
      method: 'DELETE',
      body: JSON.stringify({
        password: body.password,
      }),
    });
    clearCache();
    trackFeatureAction('ACCOUNT', 'ACCOUNT_DELETED');
    return result;
  },
};

export const api = new Proxy(apiImplementation, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (typeof value !== 'function') return value;

    return (...receivedArgs: unknown[]) => {
      const lastArg = receivedArgs[receivedArgs.length - 1] as
        | ScopedApiRequestOptions
        | undefined;
      const isScopedCall = Boolean(lastArg?.__guardianScreenRequest);
      const args = isScopedCall ? receivedArgs.slice(0, -1) : receivedArgs;
      const previousSignal = activeScopedSignal;

      if (isScopedCall) {
        activeScopedSignal = lastArg?.signal || null;
      }

      try {
        return value.apply(target, args);
      } finally {
        activeScopedSignal = previousSignal;
      }
    };
  },
}) as typeof apiImplementation;

export async function isDuressSession() {
  try {
    return (await AsyncStorage.getItem('guardianSessionMode')) === 'DURESS';
  } catch (error: unknown) {
    safeLogError('SESSION_MODE_READ', error);
    throw new GuardianApiError(
      'Your secure session could not be verified. Please try again.',
      {
        code: 'STORAGE_UNAVAILABLE',
      }
    );
  }
}

export async function saveLoginSession(data: LoginResponse) {
  if (data.requiresTwoFactor) {
    throw new AppOperationError(
      'Complete two-factor verification before continuing.'
    );
  }

  const token = data.token || data.jwt || data.accessToken;

  if (!token) {
    throw new AppOperationError(
      'Login succeeded, but the secure session could not be created.'
    );
  }

  const rawUserId = data.userId ?? data.id ?? data.user?.userId ?? data.user?.id;
  const userId = rawUserId === undefined || rawUserId === null
    ? ''
    : String(rawUserId);
  const email = data.email || data.user?.email || '';
  const name =
    data.fullname ||
    data.fullName ||
    data.user?.fullname ||
    data.user?.fullName ||
    data.user?.name ||
    email ||
    '';
  const cleanEmail = email.trim().toLowerCase();
  const sessionMode =
    String(data.sessionMode || 'NORMAL').toUpperCase() === 'DURESS'
      ? 'DURESS'
      : 'NORMAL';

  const sessionEntries: [string, string][] = [
    ['userEmail', cleanEmail],
    ['userName', name],
    ['guardianSessionMode', sessionMode],
    ['homeNeedsInitialSync', 'true'],
    ['securityScoreNeedsInitialSync', 'true'],
  ];

  if (userId) sessionEntries.push(['userId', userId]);
  if (cleanEmail) sessionEntries.push(['lastThemeUserEmail', cleanEmail]);
  if (data.plan) sessionEntries.push(['subscriptionPlan', String(data.plan)]);
  if (typeof data.emailVerified === 'boolean') {
    sessionEntries.push(['emailVerified', String(data.emailVerified)]);
  }
  if (typeof data.twoFactorEnabled === 'boolean') {
    sessionEntries.push(['twoFactorEnabled', String(data.twoFactorEnabled)]);
  }
  if (sessionMode === 'DURESS') {
    sessionEntries.push([
      'guardianDuressAutofillStartedAt',
      String(Date.now()),
    ]);
  }

  const rollbackKeys = [
    LEGACY_AUTH_TOKEN_ASYNC_STORAGE_KEY,
    'userName',
    'userEmail',
    'userId',
    'subscriptionPlan',
    'emailVerified',
    'twoFactorEnabled',
    'guardianSessionMode',
    'guardianIncidentLockdown',
    'guardianDuressAutofillStartedAt',
    'homeNeedsInitialSync',
    'securityScoreNeedsInitialSync',
  ];

  try {
    await SecureStore.setItemAsync(AUTH_TOKEN_SECURE_STORE_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });

    await AsyncStorage.multiSet(sessionEntries);
    await AsyncStorage.multiRemove([
      LEGACY_AUTH_TOKEN_ASYNC_STORAGE_KEY,
      'vaultLocked',
      SESSION_END_MESSAGE_KEY,
    ]);
  } catch (error: unknown) {
    tokenCache = null;
    setDuressAnalyticsSuppressed(false);
    safeLogError('LOGIN_SESSION_SAVE', error);

    await Promise.allSettled([
      SecureStore.deleteItemAsync(AUTH_TOKEN_SECURE_STORE_KEY),
      AsyncStorage.multiRemove(rollbackKeys),
    ]);

    throw new AppOperationError(
      'Your secure session could not be saved. Please try again.',
      { code: 'STORAGE_UNAVAILABLE' }
    );
  }

  tokenCache = token;
  setDuressAnalyticsSuppressed(sessionMode === 'DURESS');
  clearCache();

  if (sessionMode === 'DURESS') {
    clearOfflineVaultMemoryCache();
    try {
      const { suspendGuardianAutofillForDuressSession } = await import('./autofillSync');
      await suspendGuardianAutofillForDuressSession();
    } catch (error: unknown) {
      safeLogError('DURESS_AUTOFILL_SUSPEND', error);
    }
    return;
  }

  try {
    await identifyAnalyticsUser({
      userId,
      plan: data.plan || 'UNKNOWN',
    });
    await trackLoginSuccess();
  } catch (error: unknown) {
    safeLogError('LOGIN_ANALYTICS', error);
  }

  try {
    const {
      clearDuressAutofillResidueAfterNormalLogin,
      prepareGuardianAutofillForSignedInUser,
    } = await import('./autofillSync');
    await clearDuressAutofillResidueAfterNormalLogin();
    await prepareGuardianAutofillForSignedInUser(cleanEmail);
  } catch (error: unknown) {
    safeLogError('LOGIN_AUTOFILL_PREPARE', error);
  }

  void import('./legalConsent')
    .then(({ syncLegalConsentToBackend }) =>
      syncLegalConsentToBackend(cleanEmail)
    )
    .catch((error: unknown) => {
      safeLogError('LOGIN_LEGAL_CONSENT_SYNC', error);
    });

  void import('../services/pushNotifications')
    .then(({
      syncPushNotificationsAfterLogin,
      consumePendingPushRoute,
    }) => {
      /*
       * Notification routing must never wait for token registration. Token
       * registration can wake a sleeping service or contact Expo, so defer it
       * until the first authenticated screen has had time to load. The backend
       * catches up recent eligible notifications after the token is attached.
       */
      void consumePendingPushRoute().catch((error: unknown) => {
        safeLogError('LOGIN_PUSH_ROUTE', error);
      });

      setTimeout(() => {
        void syncPushNotificationsAfterLogin({ reason: 'login' }).catch(
          (error: unknown) => {
            safeLogError('LOGIN_PUSH_SYNC', error);
          }
        );
      }, 7000);
    })
    .catch((error: unknown) => {
      safeLogError('LOGIN_PUSH_MODULE', error);
    });
}

export async function logout() {
  try {
    await trackLogout();
  } catch (error: unknown) {
    safeLogError('LOGOUT_ANALYTICS', error);
  }

  try {
    const { detachPushTokenForLogout } = await import('../services/pushNotifications');
    await detachPushTokenForLogout();
  } catch (error: unknown) {
    safeLogError('LOGOUT_PUSH_CLEANUP', error);
  }

  tokenCache = null;
  clearOfflineVaultMemoryCache();
  setDuressAnalyticsSuppressed(false);

  const cleanupResults = await Promise.allSettled([
    SecureStore.deleteItemAsync(AUTH_TOKEN_SECURE_STORE_KEY),
    AsyncStorage.multiRemove([
      'token',
      'userName',
      'userEmail',
      'userId',
      'subscriptionPlan',
      'emailVerified',
      'twoFactorEnabled',
      'guardianSessionMode',
      'guardianIncidentLockdown',
    ]),
    clearAnalyticsUser(),
  ]);

  cleanupResults.forEach((result) => {
    if (result.status === 'rejected') {
      safeLogError('LOGOUT_LOCAL_CLEANUP', result.reason);
    }
  });

  clearCache();
}
