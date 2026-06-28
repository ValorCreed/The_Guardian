import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { UploadType } from 'expo-file-system';

export const API_BASE_URL = 'http://10.232.236.246:8080';

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

export type VaultItemType = 'PASSWORD' | 'CARD' | 'DOCUMENT';

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



export type FamilyMember = {
  membershipId: number;
  userId: number;
  fullName: string;
  email: string;
  joinedAt?: string;
  sharePasswords: boolean;
  shareCards: boolean;
  shareDocuments: boolean;
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

export type SharedFamilyItems = {
  passwords: SharedPasswordItem[];
  cards: SharedCardItem[];
  documents: SharedDocumentItem[];
};

export type SharedVaultItem = SharedPasswordItem;

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
  clearCache('GET:/vault/api/subscriptions/me');
}

async function request<T>(path: string, options: RequestInit = {}, useAuth = true): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (useAuth && token) headers.Authorization = `Bearer ${token}`;

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (error) {
    throw new Error('Cannot connect to backend. Check API_BASE_URL and make sure your backend is running.');
  }

  const text = await response.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || text || `Request failed with status ${response.status}`);
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
    throw new Error(
      typeof data === 'string'
        ? data
        : data?.message || data?.error || `Request failed with status ${result.status}`
    );
  }

  clearVaultCaches();
  return data;
}

export const api = {
  clearCache: () => clearCache(),

  register: (body: { fullname: string; email: string; password: string }) =>
    request('/vault/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullname: body.fullname.trim(),
        email: body.email.trim().toLowerCase(),
        password: body.password.trim(),
      }),
    }, false),

  login: (body: { email: string; password: string }) =>
    request<LoginResponse>('/vault/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        password: body.password.trim(),
      }),
    }, false),

  verifyTwoFactor: (body: { email: string; code: string }) =>
    request<LoginResponse>('/vault/auth/verify-2fa', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        code: body.code.trim(),
      }),
    }, false),

  verifyEmail: (body: { email: string; code: string }) =>
    request<{ message: string }>('/vault/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        code: body.code.trim(),
      }),
    }, false),

  resendVerification: (body: { email: string }) =>
    request<{ message: string }>('/vault/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: body.email.trim().toLowerCase() }),
    }, false),

  forgotPassword: (body: { email: string }) =>
    request<{ message: string }>('/vault/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: body.email.trim().toLowerCase() }),
    }, false),

  resetPassword: (body: { email: string; code: string; newPassword: string }) =>
    request<{ message: string }>('/vault/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim().toLowerCase(),
        code: body.code.trim(),
        newPassword: body.newPassword,
      }),
    }, false),

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
    cachedGet<{ plan: 'FREE' | 'PREMIUM' | 'FAMILY' }>('/vault/api/subscriptions/me'),

  initializePayment: (plan: 'PREMIUM' | 'FAMILY') =>
    request<{ authorizationUrl: string; accessCode: string; reference: string }>('/vault/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),

  verifyPayment: async (reference: string) => {
    const result = await request('/vault/payments/verify', {
      method: 'POST',
      body: JSON.stringify({ reference }),
    });
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


  getFamilyOverview: () =>
    cachedGet<FamilyOverview>('/vault/family'),

  addFamilyMember: async (
    email: string,
    permissions?: { sharePasswords?: boolean; shareCards?: boolean; shareDocuments?: boolean }
  ) => {
    const result = await request<FamilyMember>('/vault/family/members', {
      method: 'POST',
      body: JSON.stringify({
        email,
        sharePasswords: permissions?.sharePasswords ?? true,
        shareCards: permissions?.shareCards ?? false,
        shareDocuments: permissions?.shareDocuments ?? false,
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

  // Backward-compatible names from the first family version.
  getSharedVaultItems: () =>
    cachedGet<SharedPasswordItem[]>('/vault/family/shared-passwords', normalizePasswords as any),

  getSharedVaultItem: (id: number | string) =>
    cachedGet<SharedPasswordItem>(`/vault/family/shared-passwords/${id}`, (item) => ({
      ...item,
      itemType: 'PASSWORD',
    }) as SharedPasswordItem),

  deleteAccount: async () => {
    const result = await request<void>('/vault/users/me', {
      method: 'DELETE',
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
  if (!token) throw new Error('Login worked, but no token was returned by the backend.');

  const email = data.email || data.user?.email || '';
  const name =
    data.fullname ||
    data.fullName ||
    data.user?.fullname ||
    data.user?.fullName ||
    data.user?.name ||
    email ||
    '';

  tokenCache = token;
  await AsyncStorage.setItem('token', token);
  await AsyncStorage.setItem('userEmail', email);
  await AsyncStorage.setItem('userName', name);
  if (data.plan) await AsyncStorage.setItem('subscriptionPlan', String(data.plan));
  if (typeof data.emailVerified === 'boolean') await AsyncStorage.setItem('emailVerified', String(data.emailVerified));
  if (typeof data.twoFactorEnabled === 'boolean') await AsyncStorage.setItem('twoFactorEnabled', String(data.twoFactorEnabled));
  await AsyncStorage.removeItem('vaultLocked');
  clearCache();
}

export async function logout() {
  tokenCache = null;
  await AsyncStorage.multiRemove(['token', 'userName', 'userEmail', 'subscriptionPlan', 'emailVerified', 'twoFactorEnabled']);
  clearCache();
}
