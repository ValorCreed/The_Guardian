import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { UploadType } from 'expo-file-system';

export const API_BASE_URL = 'http://10.232.236.246:8080';

export type LoginResponse = {
  token?: string;
  jwt?: string;
  accessToken?: string;
  email?: string;
  fullname?: string;
  fullName?: string;
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

async function getToken() {
  return AsyncStorage.getItem('token');
}

async function request<T>(path: string, options: RequestInit = {}, useAuth = true): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (useAuth && token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

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

export const api = {
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

  forgotPassword: (body: { email: string }) =>
    request('/vault/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: body.email.trim().toLowerCase() }),
    }, false),

  getSubscription: () =>
    request<{ plan: 'FREE' | 'PREMIUM' | 'FAMILY' }>('/vault/api/subscriptions/me'),

  initializePayment: (plan: 'PREMIUM' | 'FAMILY') =>
    request<{ authorizationUrl: string; accessCode: string; reference: string }>('/vault/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),

  verifyPayment: (reference: string) =>
    request('/vault/payments/verify', {
      method: 'POST',
      body: JSON.stringify({ reference }),
    }),

  createVaultItem: (body: CreateVaultItemBody) =>
    request<VaultItem>('/api/vault', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getVaultItems: async () => {
    const items = await request<any[]>('/api/vault');

    return items.map((item) => ({
      ...item,
      itemType: item.itemType || 'PASSWORD',
    })) as VaultItem[];
  },

  getVaultItem: async (id: number | string) => {
    const item = await request<any>(`/api/vault/${id}`);

    return {
      ...item,
      itemType: item.itemType || 'PASSWORD',
    } as VaultItem;
  },

  updateVaultItem: (id: number | string, body: UpdateVaultItemBody) =>
    request<VaultItem>(`/api/vault/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteVaultItem: (id: number | string) =>
    request<void>(`/api/vault/${id}`, {
      method: 'DELETE',
    }),

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

  return data;
},

//Creates Document From picked file
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

  return data;
},////////END

  createDocument: (body: {
    documentName: string;
    documentType?: string;
    encryptedFileUrl: string;
    encryptedNotes?: string;
  }) =>
    request('/vault/documents', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getDocuments: () =>
    request<any[]>('/vault/documents'),

  getDocument: (id: number | string) =>
    request<any>(`/vault/documents/${id}`),

  updateDocument: (id: number | string, body: any) =>
    request(`/vault/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteDocument: (id: number | string) =>
    request<void>(`/vault/documents/${id}`, {
      method: 'DELETE',
    }),

  createCard: (body: {
    cardName: string;
    encryptedCardNumber: string;
    encryptedExpiryDate: string;
    encryptedCvv: string;
    encryptedCardholderName?: string;
  }) =>
    request<CreditCardResponse>('/vault/cards', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getCards: () =>
    request<CreditCardResponse[]>('/vault/cards'),

  getCard: (id: number | string) =>
    request<CreditCardResponse>(`/vault/cards/${id}`),

  updateCard: (id: number | string, body: any) =>
    request<CreditCardResponse>(`/vault/cards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteCard: (id: number | string) =>
    request<void>(`/vault/cards/${id}`, {
      method: 'DELETE',
    }),

    //////DELETE ACCOUNT/////
  deleteAccount: () =>
  request<void>('/vault/users/me', {
    method: 'DELETE',
  }),//////END//////
};

export async function saveLoginSession(data: LoginResponse) {
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

  await AsyncStorage.setItem('token', token);
  await AsyncStorage.setItem('userEmail', email);
  await AsyncStorage.setItem('userName', name);
  await AsyncStorage.removeItem('vaultLocked');
}

export async function logout() {
  await AsyncStorage.multiRemove(['token', 'userName', 'userEmail']);
}