import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { UploadType } from 'expo-file-system';

// export const API_BASE_URL = 'http://192.168.8.115:8080';
//export const API_BASE_URL = 'http://10.99.115.37:8080';
export const API_BASE_URL = 'https://the-guardian-op6t.onrender.com';

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
const AUTH_REQUEST_TIMEOUT_MS = 100000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
const LONG_REQUEST_TIMEOUT_MS = 45000;

export type LoginResponse = {
  token?: string | null;
  jwt?: string | null;
  accessToken?: string | null;
  userId?: number;
  email?: string;
  fullname?: string;
  fullName?: string;
  plan?: 'FREE' | 'PREMIUM' | 'FAMILY' | string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  requiresTwoFactor?: boolean;
  user?: {
    email?: string;
    fullname?: string;
    name?: string;
    fullName?: string;
  };
};

export type RegisterResponse = LoginResponse & {
  message?: string;
  emailSent?: boolean;
  verificationEmailSent?: boolean;
  emailDeliveryFailed?: boolean;
  emailWarning?: string;
  warning?: string;
};

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
    'Your account was created, but we could not send the verification email right now.'
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

export type SharedVaultItem = SharedPasswordItem;

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
  | 'SECURITY_ALERT'
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
const MAX_CACHE_ENTRIES = 80;
const cache = new Map<string, CacheEntry<any>>();
let tokenCache: string | null | undefined = undefined;

async function getToken() {
  if (tokenCache !== undefined) return tokenCache;
  tokenCache = await AsyncStorage.getItem('token');
  return tokenCache;
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

function clearVaultCaches() {
  clearCache('GET:/api/vault');
  clearCache('GET:/vault/documents');
  clearCache('GET:/vault/cards');
  clearCache('GET:/vault/notes');
  clearCache('GET:/vault/emergency/overview');
  clearCache('GET:/vault/emergency/contacts');
  clearCache('GET:/vault/emergency/requests');
  clearCache('GET:/vault/emergency/audit');
  clearCache('GET:/vault/api/subscriptions/me');
  clearCache('GET:/vault/notifications');
  clearCache('GET:/vault/sessions');
  clearCache('GET:/vault/notifications/unread-count');
}

function getServerMessage(data: any, fallbackText?: string) {
  if (!data && !fallbackText) return '';

  if (typeof data === 'string') return data;

  return (
    data?.message ||
    data?.error ||
    data?.detail ||
    data?.title ||
    data?.errors?.[0]?.defaultMessage ||
    fallbackText ||
    ''
  );
}

export function getFriendlyErrorMessage(status?: number, path?: string, rawMessage?: string) {
  let message = String(rawMessage || '').trim();

  const quotedStatusMatch = message.match(/^\d{3}\s+[A-Z_]+\s+"(.+)"$/);
  if (quotedStatusMatch?.[1]) message = quotedStatusMatch[1];

  const lower = message.toLowerCase();
  const route = path || '';

  if (lower.includes('free plan allows only one active device') || lower.includes('only one active device')) {
    return 'Free plan allows only one active device. Open The Guardian on your active device, go to Settings > Trusted Devices, and remove the old session before signing in here. Premium and Family users can sign in on unlimited devices.';
  }

  if (!message || lower.includes('request failed with status')) {
    if (status === 400) return 'Some details are missing or invalid. Please check the form and try again.';
    if (status === 401) {
      if (route.includes('/vault/auth/login')) return 'The email or password is incorrect.';
      if (route.includes('/verify-2fa')) return 'The verification code is incorrect or has expired.';
      return 'Your session has expired. Please sign in again.';
    }
    if (status === 403) return 'You do not have permission to do this.';
    if (status === 404) return 'We could not find what you are looking for.';
    if (status === 409) return 'This already exists. Please use different details.';
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
      return 'Cannot connect to the server. Make sure your are connected to the internet.';
    }

    return 'Cannot connect to our servers. Check your internet connection and try again.';
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

  if (lower.includes('subscription not found')) {
    return 'We could not load your subscription. Please sign in again.';
  }

  if (lower.includes('not found')) {
    return 'We could not find what you are looking for.';
  }

  if (lower.includes('already belongs to another family group')) {
    return 'This user already belongs to another family group.';
  }

  if (lower.includes('no account found')) {
    return 'No account was found with that email address.';
  }

  if (lower.includes('invalid') && lower.includes('code')) {
    return 'The code is incorrect or has expired. Please request a new one.';
  }

  if (
    route.includes('/vault/auth/register') &&
    (lower.includes('email') || lower.includes('mail')) &&
    (lower.includes('send') || lower.includes('smtp') || lower.includes('connection timed out'))
  ) {
    return 'Your account may have been created, but we could not send the verification email. You can still sign in and verify later from User Information.';
  }

  if (
    route.includes('/vault/auth/resend-verification') &&
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

async function request<T>(
  path: string,
  options: RequestInit = {},
  useAuth = true,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (useAuth && token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (error: any) {
    console.log('FETCH ERROR', error);

    const errorName = String(error?.name || '').toLowerCase();
    const errorMessage = String(error?.message || '').toLowerCase();

    if (
      errorName === 'aborterror' ||
      errorMessage.includes('aborted') ||
      errorMessage.includes('abort')
    ) {
      throw new Error(
        getFriendlyErrorMessage(
          undefined,
          path,
          `Request timed out after ${Math.round(timeoutMs / 1000)} seconds`
        )
      );
    }

    throw new Error(
      getFriendlyErrorMessage(undefined, path, 'Network request failed')
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const serverMessage = getServerMessage(data, text);
    throw new Error(
      getFriendlyErrorMessage(response.status, path, serverMessage)
    );
  }

  return data as T;
}

async function cachedGet<T>(path: string, normalize?: (data: any) => T): Promise<T> {
  const key = `GET:${path}`;
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing?.data !== undefined && now - existing.time < CACHE_TIME_MS) {
    return existing.data;
  }

  if (existing?.promise) {
    return existing.promise;
  }

  const promise = request<any>(path).then((raw) => {
    const data = normalize ? normalize(raw) : (raw as T);
    cache.set(key, { time: Date.now(), data });
    if (cache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    return data;
  }).catch((error) => {
    cache.delete(key);
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

async function parseUploadResult(result: FileSystem.FileSystemUploadResult) {
  let data: any = null;

  try {
    data = result.body ? JSON.parse(result.body) : null;
  } catch {
    data = result.body;
  }

  if (result.status < 200 || result.status >= 300) {
    const serverMessage = getServerMessage(data, result.body);
    throw new Error(getFriendlyErrorMessage(result.status, '/vault/documents/upload', serverMessage));
  }

  clearVaultCaches();
  return data;
}

export const api = {
  clearCache: () => clearCache(),

  register: (body: { fullname: string; email: string; password: string }) =>
    request<RegisterResponse>('/vault/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullname: body.fullname.trim(),
        email: body.email.trim().toLowerCase(),
        password: body.password.trim(),
      }),
    }, false, AUTH_REQUEST_TIMEOUT_MS),

  login: (body: { email: string; password: string }) =>
    request<LoginResponse>('/vault/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        password: body.password.trim(),
      }),
    }, false, AUTH_REQUEST_TIMEOUT_MS),

  verifyTwoFactor: (body: { email: string; code: string }) =>
    request<LoginResponse>('/vault/auth/verify-2fa', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        code: body.code.trim(),
      }),
    }, false, AUTH_REQUEST_TIMEOUT_MS),

  verifyEmail: (body: { email: string; code: string }) =>
    request<{ message: string }>('/vault/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        code: body.code.trim(),
      }),
    }, false, AUTH_REQUEST_TIMEOUT_MS),

  resendVerification: (body: { email: string }) =>
    request<{ message: string }>('/vault/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: body.email.trim().toLowerCase() }),
    }, false, AUTH_REQUEST_TIMEOUT_MS),

  forgotPassword: (body: { email: string }) =>
    request<{ message: string }>('/vault/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: body.email.trim().toLowerCase() }),
    }, false, AUTH_REQUEST_TIMEOUT_MS),

  resetPassword: (body: { email: string; code: string; newPassword: string }) =>
    request<{ message: string }>('/vault/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        code: body.code.trim(),
        newPassword: body.newPassword,
      }),
    }, false, AUTH_REQUEST_TIMEOUT_MS),

  getSecuritySettings: () =>
    cachedGet<{ emailVerified: boolean; twoFactorEnabled: boolean }>('/vault/auth/me/security'),

  setTwoFactorEnabled: async (enabled: boolean) => {
    const result = await request<{ emailVerified: boolean; twoFactorEnabled: boolean }>('/vault/auth/2fa', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
    clearCache('GET:/vault/auth/me/security');
    return result;
  },

  getSubscription: () =>
    cachedGet<SubscriptionResponse>('/vault/api/subscriptions/me'),

  cancelSubscription: async () => {
    const result = await request<SubscriptionResponse>('/vault/api/subscriptions/cancel', {
      method: 'POST',
    });
    clearVaultCaches();
    return result;
  },

  upgradeSubscription: async (plan: 'PREMIUM' | 'FAMILY') => {
    const result = await request<SubscriptionResponse>(`/vault/api/subscriptions/upgrade?plan=${plan}`, {
      method: 'POST',
    });
    clearVaultCaches();
    return result;
  },

  getBackupStatus: () =>
    cachedGet<BackupStatusResponse>('/vault/backup/status'),

  createBackup: async () => {
    const result = await request<BackupResponse>('/vault/backup/create', {
      method: 'POST',
    }, true, LONG_REQUEST_TIMEOUT_MS);
    clearCache('GET:/vault/backup/status');
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
    clearVaultCaches();
    clearCache('GET:/vault/backup/status');
    return result;
  },

  initializePayment: (plan: 'PREMIUM' | 'FAMILY') =>
    request<{ authorizationUrl: string; accessCode: string; reference: string }>('/vault/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }, true, LONG_REQUEST_TIMEOUT_MS),

  verifyPayment: async (reference: string) => {
    const result = await request('/vault/payments/verify', {
      method: 'POST',
      body: JSON.stringify({ reference }),
    }, true, LONG_REQUEST_TIMEOUT_MS);
    clearVaultCaches();
    return result;
  },

  createVaultItem: async (body: CreateVaultItemBody) => {
    const result = await request<VaultItem>('/api/vault', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    clearVaultCaches();
    return result;
  },

  getVaultItems: () =>
    cachedGet<VaultItem[]>('/api/vault', normalizePasswords),

  getVaultItem: (id: number | string) =>
    cachedGet<VaultItem>(`/api/vault/${id}`, (item) => ({
      ...item,
      itemType: item.itemType || 'PASSWORD',
    }) as VaultItem),

  updateVaultItem: async (id: number | string, body: UpdateVaultItemBody) => {
    const result = await request<VaultItem>(`/api/vault/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    clearVaultCaches();
    return result;
  },

  deleteVaultItem: async (id: number | string) => {
    const result = await request<void>(`/api/vault/${id}`, {
      method: 'DELETE',
    });
    clearVaultCaches();
    return result;
  },

  createDocumentMultipart: async (file: {
    uri: string;
    name: string;
    type: string;
    size?: number;
    documentTitle: string;
  }) => {
    const token = await getToken();

    if (!token) {
      throw new Error('You are not logged in. Please log in again.');
    }

    const result = await FileSystem.uploadAsync(
      `${API_BASE_URL}/vault/documents/upload`,
      file.uri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: file.type || 'application/octet-stream',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        parameters: {
          documentName: file.documentTitle,
          documentType: file.type || 'application/octet-stream',
          sizeBytes: String(file.size || 0),
        },
      }
    );

    return parseUploadResult(result);
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
    const token = await getToken();

    if (!token) {
      throw new Error('You are not logged in. Please log in again.');
    }

    const result = await pickedFile.upload(`${API_BASE_URL}/vault/documents/upload`, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: file.type || 'application/octet-stream',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      parameters: {
        documentName: file.documentTitle,
        documentType: file.type || 'application/octet-stream',
        sizeBytes: String(file.size || 0),
      },
    });

    return parseUploadResult(result);
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
    clearVaultCaches();
    return result;
  },

  getDocuments: () =>
    cachedGet<any[]>('/vault/documents'),

  getDocument: (id: number | string) =>
    cachedGet<any>(`/vault/documents/${id}`),

  updateDocument: async (id: number | string, body: any) => {
    const result = await request(`/vault/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    clearVaultCaches();
    return result;
  },

  deleteDocument: async (id: number | string) => {
    const result = await request<void>(`/vault/documents/${id}`, {
      method: 'DELETE',
    });
    clearVaultCaches();
    return result;
  },

  createCard: async (body: {
    cardName: string;
    encryptedCardNumber: string;
    encryptedExpiryDate: string;
    encryptedCvv: string;
    encryptedCardholderName?: string;
  }) => {
    const result = await request<CreditCardResponse>('/vault/cards', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    clearVaultCaches();
    return result;
  },

  getCards: () =>
    cachedGet<CreditCardResponse[]>('/vault/cards'),

  getCard: (id: number | string) =>
    cachedGet<CreditCardResponse>(`/vault/cards/${id}`),

  updateCard: async (id: number | string, body: any) => {
    const result = await request<CreditCardResponse>(`/vault/cards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    clearVaultCaches();
    return result;
  },

  deleteCard: async (id: number | string) => {
    const result = await request<void>(`/vault/cards/${id}`, {
      method: 'DELETE',
    });
    clearVaultCaches();
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
    clearVaultCaches();
    return result;
  },

  getSecureNotes: () =>
    cachedGet<SecureNoteResponse[]>('/vault/notes'),

  getSecureNote: (id: number | string) =>
    cachedGet<SecureNoteResponse>(`/vault/notes/${id}`),

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
    clearVaultCaches();
    return result;
  },

  deleteSecureNote: async (id: number | string) => {
    const result = await request<void>(`/vault/notes/${id}`, {
      method: 'DELETE',
    });
    clearVaultCaches();
    return result;
  },

  getEmergencyOverview: () =>
    cachedGet<EmergencyOverviewResponse>('/vault/emergency/overview'),

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
    return result;
  },

  deleteEmergencyContact: async (id: number | string) => {
    const result = await request<void>(`/vault/emergency/contacts/${id}`, {
      method: 'DELETE',
    });
    clearVaultCaches();
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
    return result;
  },

  getEmergencyRequests: () =>
    cachedGet<EmergencyAccessRequestResponse[]>('/vault/emergency/requests'),

  approveEmergencyRequest: async (id: number | string) => {
    const result = await request<EmergencyAccessRequestResponse>(`/vault/emergency/requests/${id}/approve`, {
      method: 'POST',
    });
    clearVaultCaches();
    return result;
  },

  denyEmergencyRequest: async (id: number | string) => {
    const result = await request<EmergencyAccessRequestResponse>(`/vault/emergency/requests/${id}/deny`, {
      method: 'POST',
    });
    clearVaultCaches();
    return result;
  },

  getEmergencyAuditLogs: () =>
    cachedGet<EmergencyAuditLogResponse[]>('/vault/emergency/audit'),


  getFamilyOverview: () =>
    cachedGet<FamilyOverview>('/vault/family'),

  addFamilyMember: async (
    email: string,
    permissions?: { sharePasswords?: boolean; shareCards?: boolean; shareDocuments?: boolean; shareNotes?: boolean }
  ) => {
    const result = await request<FamilyMember>('/vault/family/members', {
      method: 'POST',
      body: JSON.stringify({
        email,
        sharePasswords: permissions?.sharePasswords ?? true,
        shareCards: permissions?.shareCards ?? false,
        shareDocuments: permissions?.shareDocuments ?? false,
        shareNotes: permissions?.shareNotes ?? false,
      }),
    });
    clearCache('GET:/vault/family');
    clearCache('GET:/vault/family/shared-items');
    return result;
  },

  removeFamilyMember: async (membershipId: number | string) => {
    const result = await request<void>(`/vault/family/members/${membershipId}`, {
      method: 'DELETE',
    });
    clearCache('GET:/vault/family');
    clearCache('GET:/vault/family/shared-items');
    return result;
  },

  getSharedFamilyItems: () =>
    cachedGet<SharedFamilyItems>('/vault/family/shared-items'),

  getSharedPasswordItems: () =>
    cachedGet<SharedPasswordItem[]>('/vault/family/shared-passwords', normalizePasswords as any),

  getSharedPasswordItem: (id: number | string) =>
    cachedGet<SharedPasswordItem>(`/vault/family/shared-passwords/${id}`, (item) => ({
      ...item,
      itemType: 'PASSWORD',
    }) as SharedPasswordItem),

  getSharedCardItems: () =>
    cachedGet<SharedCardItem[]>('/vault/family/shared-cards'),

  getSharedCardItem: (id: number | string) =>
    cachedGet<SharedCardItem>(`/vault/family/shared-cards/${id}`, (item) => ({
      ...item,
      itemType: 'CARD',
    }) as SharedCardItem),

  getSharedDocumentItems: () =>
    cachedGet<SharedDocumentItem[]>('/vault/family/shared-documents'),

  getSharedDocumentItem: (id: number | string) =>
    cachedGet<SharedDocumentItem>(`/vault/family/shared-documents/${id}`, (item) => ({
      ...item,
      itemType: 'DOCUMENT',
    }) as SharedDocumentItem),

  getSharedNoteItems: () =>
    cachedGet<SharedNoteItem[]>('/vault/family/shared-notes', (items) =>
      items.map((item: any) => ({
        ...item,
        itemType: 'NOTE',
      })) as SharedNoteItem[]
    ),

  getSharedNoteItem: (id: number | string) =>
    cachedGet<SharedNoteItem>(`/vault/family/shared-notes/${id}`, (item) => ({
      ...item,
      itemType: 'NOTE',
    }) as SharedNoteItem),

  // Backward-compatible names from the first family version.
  getSharedVaultItems: () =>
    cachedGet<SharedPasswordItem[]>('/vault/family/shared-passwords', normalizePasswords as any),

  getSharedVaultItem: (id: number | string) =>
    cachedGet<SharedPasswordItem>(`/vault/family/shared-passwords/${id}`, (item) => ({
      ...item,
      itemType: 'PASSWORD',
    }) as SharedPasswordItem),

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


  getDeviceSessions: () =>
    cachedGet<DeviceSession[]>('/vault/sessions'),

  revokeDeviceSession: async (id: number | string) => {
    const result = await request<{ message: string }>(`/vault/sessions/${id}`, {
      method: 'DELETE',
    });
    clearCache('GET:/vault/sessions');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    return result;
  },

  logoutOtherDevices: async () => {
    const result = await request<{ message: string }>('/vault/sessions/logout-others', {
      method: 'POST',
    });
    clearCache('GET:/vault/sessions');
    clearCache('GET:/vault/notifications');
    clearCache('GET:/vault/notifications/unread-count');
    return result;
  },

  logoutAllDevices: async () => {
    const result = await request<{ message: string }>('/vault/sessions/logout-all', {
      method: 'POST',
    });
    clearCache();
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
    return result;
  },
};

export async function saveLoginSession(data: LoginResponse) {
  if (data.requiresTwoFactor) {
    throw new Error('2FA verification is required before saving the login session.');
  }

  const token = data.token || data.jwt || data.accessToken;

  if (!token) {
    throw new Error('Login worked, but no token was returned by the servers.');
  }

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

  tokenCache = token;

  await AsyncStorage.setItem('token', token);
  await AsyncStorage.setItem('userEmail', cleanEmail);
  await AsyncStorage.setItem('userName', name);

  /**
   * This key is intentionally not removed during logout.
   * It lets the login page keep reflecting the last/current user's selected theme.
   */
  if (cleanEmail) {
    await AsyncStorage.setItem('lastThemeUserEmail', cleanEmail);
  }

  if (data.plan) {
    await AsyncStorage.setItem('subscriptionPlan', String(data.plan));
  }

  if (typeof data.emailVerified === 'boolean') {
    await AsyncStorage.setItem('emailVerified', String(data.emailVerified));
  }

  if (typeof data.twoFactorEnabled === 'boolean') {
    await AsyncStorage.setItem('twoFactorEnabled', String(data.twoFactorEnabled));
  }

  await AsyncStorage.removeItem('vaultLocked');

  /*
   * After a fresh login, the Home dashboard and Security Score should ask
   * the server once, then reuse their stored snapshots on normal page visits.
   */
  await AsyncStorage.setItem('homeNeedsInitialSync', 'true');
  await AsyncStorage.setItem('securityScoreNeedsInitialSync', 'true');

  clearCache();
}
export async function logout() {
  tokenCache = null;

  /**
   * Do not remove:
   * - themeMode
   * - lastThemeUserEmail
   * - themeMode:user:<email>
   *
   * That allows the login page to keep using the last/current user's chosen theme.
   */
  await AsyncStorage.multiRemove([
    'token',
    'userName',
    'userEmail',
    'subscriptionPlan',
    'emailVerified',
    'twoFactorEnabled',
  ]);

  clearCache();
}