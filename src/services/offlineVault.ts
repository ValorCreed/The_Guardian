import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import type {
  CreditCardResponse,
  SecureNoteResponse,
  VaultItem,
  VaultItemType,
} from './api';

const OFFLINE_VAULT_ENABLED_KEY = 'theguardian.offlineVault.enabled.v1';
const OFFLINE_VAULT_NEEDS_REFRESH_KEY = 'theguardian.offlineVault.needsRefresh.v1';
const OFFLINE_VAULT_LAST_SAVED_HASH_KEY = 'theguardian.offlineVault.lastSavedHash.v3';
const LEGACY_OFFLINE_VAULT_LAST_SAVED_HASH_KEY_V2 = 'theguardian.offlineVault.lastSavedHash.v2';
const LEGACY_OFFLINE_VAULT_LAST_SAVED_HASH_KEY_V1 = 'theguardian.offlineVault.lastSavedHash.v1';
const SECURE_CHUNK_SIZE = 1800;
const MAX_SECURE_CHUNKS = 1000;

export type OfflinePasswordItem = VaultItem & {
  offlineMetadataOnly: boolean;
};

export type OfflineCardItem = CreditCardResponse & {
  itemType: 'CARD';
  last4: string;
  offlineMetadataOnly: boolean;
};

export type OfflineDocumentItem = {
  id: number | string;
  itemType: 'DOCUMENT';
  documentName?: string;
  fileName?: string;
  documentType?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
  offlineMetadataOnly: true;
};

export type OfflineNoteItem = SecureNoteResponse & {
  itemType: 'NOTE';
  offlineMetadataOnly: boolean;
};

export type OfflineVaultSnapshot = {
  version: 3;
  email: string;
  savedAt: string;
  metadataOnly: boolean;
  secureSecretsAvailable: boolean;
  passwords: OfflinePasswordItem[];
  cards: OfflineCardItem[];
  documents: OfflineDocumentItem[];
  notes: OfflineNoteItem[];
};

export type OfflineVaultStatus = {
  enabled: boolean;
  hasSnapshot: boolean;
  needsRefresh: boolean;
  metadataOnly: boolean;
  secureSecretsAvailable: boolean;
  savedAt?: string | null;
  passwordCount: number;
  cardCount: number;
  documentCount: number;
  noteCount: number;
  totalCount: number;
};

type StoredOfflineMetadataSnapshot = {
  version: 3;
  email: string;
  savedAt: string;
  metadataOnly: true;
  secureSecretsAvailable: boolean;
  passwords: OfflinePasswordItem[];
  cards: OfflineCardItem[];
  documents: OfflineDocumentItem[];
  notes: OfflineNoteItem[];
};

type SecureOfflinePayload = {
  version: 1;
  email: string;
  passwords: VaultItem[];
  cards: CreditCardResponse[];
  notes: SecureNoteResponse[];
};

type OfflineMemoryCache = {
  email: string;
  snapshot: OfflineVaultSnapshot;
  loadedAt: number;
  contentHash: string;
};

let offlineMemoryCache: OfflineMemoryCache | null = null;
let legacySnapshotCleanupPromise: Promise<void> | null = null;

const normalizeEmail = (email?: string | null) =>
  String(email || 'anonymous').trim().toLowerCase();

const getSnapshotKey = (email: string) =>
  `theguardian.offlineVault.snapshot.v3:${normalizeEmail(email)}`;

const getLegacySnapshotKeyV2 = (email: string) =>
  `theguardian.offlineVault.snapshot.v2:${normalizeEmail(email)}`;

const getLegacySnapshotKeyV1 = (email: string) =>
  `theguardian.offlineVault.snapshot.v1:${normalizeEmail(email)}`;

const getLastSavedHashKey = (email: string) =>
  `${OFFLINE_VAULT_LAST_SAVED_HASH_KEY}:${normalizeEmail(email)}`;

const getLegacyLastSavedHashKeyV2 = (email: string) =>
  `${LEGACY_OFFLINE_VAULT_LAST_SAVED_HASH_KEY_V2}:${normalizeEmail(email)}`;

const getLegacyLastSavedHashKeyV1 = (email: string) =>
  `${LEGACY_OFFLINE_VAULT_LAST_SAVED_HASH_KEY_V1}:${normalizeEmail(email)}`;

const stableStringify = (value: any) => {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value ?? '');
  }
};

const shortHash = (value: string) => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

const accountKey = (email: string) => shortHash(normalizeEmail(email));
const secureManifestKey = (email: string) =>
  `guardian.offlineVault.v3.${accountKey(email)}.manifest`;
const secureChunkKey = (email: string, index: number) =>
  `guardian.offlineVault.v3.${accountKey(email)}.chunk.${index}`;

const createSnapshotHash = (input: {
  metadata: StoredOfflineMetadataSnapshot;
  secrets: SecureOfflinePayload;
}) => shortHash(stableStringify(input));

const setMemorySnapshot = (snapshot: OfflineVaultSnapshot) => {
  offlineMemoryCache = {
    email: normalizeEmail(snapshot.email),
    snapshot,
    loadedAt: Date.now(),
    contentHash: shortHash(stableStringify(snapshot)),
  };
};

const digitsOnly = (value?: string | null) =>
  String(value || '').replace(/\D/g, '');

const sanitizePasswordMetadata = (item: any): OfflinePasswordItem => ({
  id: item.id,
  itemType: 'PASSWORD',
  title: String(item.title || item.website || 'Saved password'),
  usernameValue: String(item.usernameValue || ''),
  website: String(item.website || ''),
  fileName: item.fileName,
  mimeType: item.mimeType,
  sizeBytes: item.sizeBytes,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  encryptedPassword: '',
  encryptedData: '',
  notes: '',
  offlineMetadataOnly: true,
});

const sanitizePasswordSecret = (item: any): VaultItem => ({
  id: item.id,
  itemType: 'PASSWORD',
  title: String(item.title || item.website || 'Saved password'),
  usernameValue: String(item.usernameValue || ''),
  website: String(item.website || ''),
  encryptedPassword: String(item.encryptedPassword || ''),
  notes: String(item.notes || ''),
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const sanitizeCardMetadata = (card: any): OfflineCardItem => ({
  id: card.id,
  itemType: 'CARD',
  cardName: String(card.cardName || 'Saved Card'),
  encryptedCardNumber: '',
  encryptedExpiryDate: '',
  encryptedCvv: '',
  encryptedCardholderName: '',
  encryptedCardHolderName: '',
  encryptedNotes: '',
  last4: digitsOnly(card.encryptedCardNumber || card.cardNumber || card.last4).slice(-4),
  createdAt: card.createdAt,
  updatedAt: card.updatedAt,
  offlineMetadataOnly: true,
});

const sanitizeCardSecret = (card: any): CreditCardResponse => ({
  id: card.id,
  cardName: String(card.cardName || 'Saved Card'),
  encryptedCardNumber: String(card.encryptedCardNumber || card.cardNumber || ''),
  encryptedExpiryDate: String(card.encryptedExpiryDate || card.expiry || ''),
  encryptedCvv: String(card.encryptedCvv || card.cvv || ''),
  encryptedCardholderName: String(
    card.encryptedCardholderName || card.encryptedCardHolderName || card.cardholderName || ''
  ),
  encryptedCardHolderName: String(
    card.encryptedCardHolderName || card.encryptedCardholderName || card.cardholderName || ''
  ),
  encryptedNotes: String(card.encryptedNotes || card.notes || ''),
  createdAt: card.createdAt,
  updatedAt: card.updatedAt,
});

const sanitizeDocument = (document: any): OfflineDocumentItem => ({
  id: document.id,
  itemType: 'DOCUMENT',
  documentName: String(document.documentName || document.fileName || document.title || 'Document'),
  fileName: String(document.fileName || document.documentName || document.title || 'Document'),
  documentType: String(document.documentType || document.mimeType || 'application/octet-stream'),
  mimeType: String(document.mimeType || document.documentType || 'application/octet-stream'),
  sizeBytes: Number(document.sizeBytes || document.fileSize || document.size || 0),
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
  offlineMetadataOnly: true,
});

const sanitizeNoteMetadata = (note: any): OfflineNoteItem => ({
  id: note.id,
  itemType: 'NOTE',
  title: String(note.title || 'SecureNote'),
  category: note.category || 'General',
  encryptedContent: '',
  pinned: Boolean(note.pinned),
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
  offlineMetadataOnly: true,
});

const sanitizeNoteSecret = (note: any): SecureNoteResponse => ({
  id: note.id,
  title: String(note.title || 'SecureNote'),
  category: note.category || 'General',
  encryptedContent: String(note.encryptedContent || note.content || ''),
  pinned: Boolean(note.pinned),
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
});

const mergeSecurePayload = (
  metadata: StoredOfflineMetadataSnapshot,
  secrets: SecureOfflinePayload | null
): OfflineVaultSnapshot => {
  if (!secrets || normalizeEmail(secrets.email) !== normalizeEmail(metadata.email)) {
    return {
      ...metadata,
      metadataOnly: true,
      secureSecretsAvailable: false,
    };
  }

  const passwordMap = new Map(
    (secrets.passwords || []).map((item) => [String(item.id), item])
  );
  const cardMap = new Map(
    (secrets.cards || []).map((item) => [String(item.id), item])
  );
  const noteMap = new Map(
    (secrets.notes || []).map((item) => [String(item.id), item])
  );

  return {
    ...metadata,
    metadataOnly: false,
    secureSecretsAvailable: true,
    passwords: metadata.passwords.map((item) => ({
      ...item,
      ...(passwordMap.get(String(item.id)) || {}),
      itemType: 'PASSWORD',
      offlineMetadataOnly: false,
    })),
    cards: metadata.cards.map((item) => ({
      ...item,
      ...(cardMap.get(String(item.id)) || {}),
      itemType: 'CARD',
      last4: item.last4,
      offlineMetadataOnly: false,
    })),
    documents: metadata.documents,
    notes: metadata.notes.map((item) => ({
      ...item,
      ...(noteMap.get(String(item.id)) || {}),
      itemType: 'NOTE',
      offlineMetadataOnly: false,
    })),
  };
};

const loadSecurePayload = async (email: string): Promise<SecureOfflinePayload | null> => {
  try {
    const rawManifest = await SecureStore.getItemAsync(secureManifestKey(email));
    if (!rawManifest) return null;

    const manifest = JSON.parse(rawManifest) as { chunks?: number };
    const chunkCount = Number(manifest?.chunks || 0);
    if (!Number.isInteger(chunkCount) || chunkCount <= 0 || chunkCount > MAX_SECURE_CHUNKS) return null;

    const chunks = await Promise.all(
      Array.from({ length: chunkCount }, (_, index) =>
        SecureStore.getItemAsync(secureChunkKey(email, index))
      )
    );

    if (chunks.some((chunk) => chunk === null)) return null;

    const payload = JSON.parse(chunks.join('')) as SecureOfflinePayload;
    if (payload.version !== 1) return null;
    return payload;
  } catch {
    return null;
  }
};

const saveSecurePayload = async (email: string, payload: SecureOfflinePayload) => {
  const serialized = JSON.stringify(payload);
  const chunks: string[] = [];

  for (let index = 0; index < serialized.length; index += SECURE_CHUNK_SIZE) {
    chunks.push(serialized.slice(index, index + SECURE_CHUNK_SIZE));
  }

  if (chunks.length === 0 || chunks.length > MAX_SECURE_CHUNKS) {
    throw new Error('The offline vault is too large for protected device storage.');
  }

  const manifestKey = secureManifestKey(email);
  let previousCount = 0;

  try {
    const previousManifest = await SecureStore.getItemAsync(manifestKey);
    previousCount = previousManifest
      ? Number(JSON.parse(previousManifest)?.chunks || 0)
      : 0;
  } catch {
    previousCount = 0;
  }

  const options = {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  } as const;

  await Promise.all(
    chunks.map((chunk, index) =>
      SecureStore.setItemAsync(secureChunkKey(email, index), chunk, options)
    )
  );

  await SecureStore.setItemAsync(
    manifestKey,
    JSON.stringify({ version: 1, chunks: chunks.length }),
    options
  );

  if (previousCount > chunks.length) {
    await Promise.all(
      Array.from({ length: previousCount - chunks.length }, (_, offset) =>
        SecureStore.deleteItemAsync(secureChunkKey(email, chunks.length + offset))
      )
    );
  }
};

const clearSecurePayload = async (email: string) => {
  let chunkCount = 0;

  try {
    const manifest = await SecureStore.getItemAsync(secureManifestKey(email));
    chunkCount = manifest ? Number(JSON.parse(manifest)?.chunks || 0) : 0;
  } catch {
    chunkCount = 0;
  }

  await Promise.all([
    SecureStore.deleteItemAsync(secureManifestKey(email)),
    ...Array.from({ length: Math.min(Math.max(chunkCount, 0), MAX_SECURE_CHUNKS) }, (_, index) =>
      SecureStore.deleteItemAsync(secureChunkKey(email, index))
    ),
  ]).catch(() => undefined);
};

const purgeLegacyPlaintextSnapshots = async () => {
  if (legacySnapshotCleanupPromise) return legacySnapshotCleanupPromise;

  legacySnapshotCleanupPromise = (async () => {
    const keys = await AsyncStorage.getAllKeys();
    const legacyKeys = keys.filter(
      (key) =>
        key.startsWith('theguardian.offlineVault.snapshot.v1:') ||
        key.startsWith(`${LEGACY_OFFLINE_VAULT_LAST_SAVED_HASH_KEY_V1}:`)
    );

    if (legacyKeys.length > 0) {
      await AsyncStorage.multiRemove(legacyKeys);
    }
  })().catch(() => undefined);

  return legacySnapshotCleanupPromise;
};

export const clearOfflineVaultMemoryCache = () => {
  offlineMemoryCache = null;
};

export const getCurrentUserEmail = async () => {
  const email = await AsyncStorage.getItem('userEmail');
  return normalizeEmail(email);
};

export const isOfflineVaultEnabled = async () => {
  await purgeLegacyPlaintextSnapshots();
  const raw = await AsyncStorage.getItem(OFFLINE_VAULT_ENABLED_KEY);
  return raw !== 'false';
};

export const setOfflineVaultEnabled = async (enabled: boolean) => {
  await AsyncStorage.setItem(OFFLINE_VAULT_ENABLED_KEY, String(enabled));

  if (!enabled) {
    await clearOfflineVaultSnapshot();
  }
};

export const markOfflineVaultStale = async () => {
  await AsyncStorage.setItem(OFFLINE_VAULT_NEEDS_REFRESH_KEY, 'true');
};

export const markOfflineVaultFresh = async () => {
  await AsyncStorage.removeItem(OFFLINE_VAULT_NEEDS_REFRESH_KEY);
};

export const isOfflineVaultStale = async () =>
  (await AsyncStorage.getItem(OFFLINE_VAULT_NEEDS_REFRESH_KEY)) === 'true';

export const createOfflineVaultSnapshot = async (input: {
  passwords?: VaultItem[];
  cards?: CreditCardResponse[];
  documents?: any[];
  notes?: SecureNoteResponse[];
}): Promise<OfflineVaultSnapshot> => {
  const email = await getCurrentUserEmail();

  const metadata: StoredOfflineMetadataSnapshot = {
    version: 3,
    email,
    savedAt: new Date().toISOString(),
    metadataOnly: true,
    secureSecretsAvailable: true,
    passwords: (input.passwords || []).map(sanitizePasswordMetadata),
    cards: (input.cards || []).map(sanitizeCardMetadata),
    documents: (input.documents || []).map(sanitizeDocument),
    notes: (input.notes || []).map(sanitizeNoteMetadata),
  };

  const secrets: SecureOfflinePayload = {
    version: 1,
    email,
    passwords: (input.passwords || []).map(sanitizePasswordSecret),
    cards: (input.cards || []).map(sanitizeCardSecret),
    notes: (input.notes || []).map(sanitizeNoteSecret),
  };

  return mergeSecurePayload(metadata, secrets);
};

export const saveOfflineVaultSnapshot = async (
  input:
    | OfflineVaultSnapshot
    | {
        passwords?: VaultItem[];
        cards?: CreditCardResponse[];
        documents?: any[];
        notes?: SecureNoteResponse[];
      }
) => {
  const enabled = await isOfflineVaultEnabled();
  if (!enabled) return null;

  const snapshot =
    'version' in input && input.version === 3
      ? input
      : await createOfflineVaultSnapshot(input as any);

  const email = normalizeEmail(snapshot.email);
  const metadata: StoredOfflineMetadataSnapshot = {
    version: 3,
    email,
    savedAt: snapshot.savedAt || new Date().toISOString(),
    metadataOnly: true,
    secureSecretsAvailable: true,
    passwords: (snapshot.passwords || []).map(sanitizePasswordMetadata),
    cards: (snapshot.cards || []).map(sanitizeCardMetadata),
    documents: (snapshot.documents || []).map(sanitizeDocument),
    notes: (snapshot.notes || []).map(sanitizeNoteMetadata),
  };
  const secrets: SecureOfflinePayload = {
    version: 1,
    email,
    passwords: (snapshot.passwords || []).map(sanitizePasswordSecret),
    cards: (snapshot.cards || []).map(sanitizeCardSecret),
    notes: (snapshot.notes || []).map(sanitizeNoteSecret),
  };

  const contentHash = createSnapshotHash({ metadata, secrets });
  const lastSavedHashKey = getLastSavedHashKey(email);
  const lastSavedHash = await AsyncStorage.getItem(lastSavedHashKey);
  let secureSecretsAvailable = true;

  if (lastSavedHash !== contentHash) {
    try {
      await saveSecurePayload(email, secrets);
    } catch {
      secureSecretsAvailable = false;
      metadata.secureSecretsAvailable = false;
    }

    await AsyncStorage.setItem(
      getSnapshotKey(email),
      JSON.stringify(metadata)
    );

    if (secureSecretsAvailable) {
      await AsyncStorage.setItem(lastSavedHashKey, contentHash);
    } else {
      // Do not mark this snapshot as completely persisted. The next successful
      // online refresh must retry writing the protected secret payload even when
      // the vault content itself has not changed.
      await AsyncStorage.removeItem(lastSavedHashKey);
    }

    await AsyncStorage.multiRemove([
      getLegacySnapshotKeyV2(email),
      getLegacyLastSavedHashKeyV2(email),
    ]).catch(() => undefined);
  } else {
    secureSecretsAvailable = Boolean(await loadSecurePayload(email));
    metadata.secureSecretsAvailable = secureSecretsAvailable;
  }

  const savedSnapshot = mergeSecurePayload(
    metadata,
    secureSecretsAvailable ? secrets : null
  );
  setMemorySnapshot(savedSnapshot);
  await markOfflineVaultFresh();
  return savedSnapshot;
};

export const getOfflineVaultMemorySnapshot = async (email?: string | null) => {
  const currentEmail = normalizeEmail(email || (await getCurrentUserEmail()));

  if (offlineMemoryCache?.email === currentEmail) {
    return offlineMemoryCache.snapshot;
  }

  return null;
};

export const loadOfflineVaultSnapshot = async (email?: string | null) => {
  await purgeLegacyPlaintextSnapshots();
  const currentEmail = normalizeEmail(email || (await getCurrentUserEmail()));

  if (offlineMemoryCache?.email === currentEmail) {
    return offlineMemoryCache.snapshot;
  }

  const raw = await AsyncStorage.getItem(getSnapshotKey(currentEmail));

  if (!raw) {
    /*
     * Version 2 contained metadata only. Keep it readable during one upgrade
     * cycle, then the next successful online refresh writes the secure v3 copy.
     */
    const legacyRaw = await AsyncStorage.getItem(getLegacySnapshotKeyV2(currentEmail));
    if (!legacyRaw) return null;

    try {
      const legacy = JSON.parse(legacyRaw);
      const legacySnapshot: OfflineVaultSnapshot = {
        version: 3,
        email: currentEmail,
        savedAt: legacy.savedAt || new Date().toISOString(),
        metadataOnly: true,
        secureSecretsAvailable: false,
        passwords: (legacy.passwords || []).map(sanitizePasswordMetadata),
        cards: (legacy.cards || []).map(sanitizeCardMetadata),
        documents: (legacy.documents || []).map(sanitizeDocument),
        notes: (legacy.notes || []).map(sanitizeNoteMetadata),
      };
      setMemorySnapshot(legacySnapshot);
      return legacySnapshot;
    } catch {
      return null;
    }
  }

  try {
    const metadata = JSON.parse(raw) as StoredOfflineMetadataSnapshot;
    if (metadata.version !== 3 || metadata.metadataOnly !== true) return null;

    const securePayload = await loadSecurePayload(currentEmail);
    const snapshot = mergeSecurePayload(metadata, securePayload);
    setMemorySnapshot(snapshot);
    return snapshot;
  } catch {
    await AsyncStorage.removeItem(getSnapshotKey(currentEmail));
    await clearSecurePayload(currentEmail);
    return null;
  }
};

export const clearOfflineVaultSnapshot = async (email?: string | null) => {
  const currentEmail = normalizeEmail(email || (await getCurrentUserEmail()));

  await Promise.all([
    clearSecurePayload(currentEmail),
    AsyncStorage.multiRemove([
      getSnapshotKey(currentEmail),
      getLegacySnapshotKeyV2(currentEmail),
      getLegacySnapshotKeyV1(currentEmail),
      getLastSavedHashKey(currentEmail),
      getLegacyLastSavedHashKeyV2(currentEmail),
      getLegacyLastSavedHashKeyV1(currentEmail),
      OFFLINE_VAULT_NEEDS_REFRESH_KEY,
    ]),
  ]);

  clearOfflineVaultMemoryCache();
};

export const getOfflineVaultStatus = async (): Promise<OfflineVaultStatus> => {
  const enabled = await isOfflineVaultEnabled();
  const snapshot = await loadOfflineVaultSnapshot();
  const needsRefresh = await isOfflineVaultStale();

  const passwordCount = snapshot?.passwords?.length || 0;
  const cardCount = snapshot?.cards?.length || 0;
  const documentCount = snapshot?.documents?.length || 0;
  const noteCount = snapshot?.notes?.length || 0;

  return {
    enabled,
    hasSnapshot: Boolean(snapshot),
    needsRefresh,
    metadataOnly: snapshot?.metadataOnly ?? true,
    secureSecretsAvailable: snapshot?.secureSecretsAvailable ?? false,
    savedAt: snapshot?.savedAt || null,
    passwordCount,
    cardCount,
    documentCount,
    noteCount,
    totalCount: passwordCount + cardCount + documentCount + noteCount,
  };
};

export const findOfflinePassword = async (id: number | string) => {
  const snapshot = await loadOfflineVaultSnapshot();
  return snapshot?.passwords?.find((item) => String(item.id) === String(id)) || null;
};

export const findOfflineCard = async (id: number | string) => {
  const snapshot = await loadOfflineVaultSnapshot();
  return snapshot?.cards?.find((item) => String(item.id) === String(id)) || null;
};

export const findOfflineDocument = async (id: number | string) => {
  const snapshot = await loadOfflineVaultSnapshot();
  return snapshot?.documents?.find((item) => String(item.id) === String(id)) || null;
};

export const findOfflineNote = async (id: number | string) => {
  const snapshot = await loadOfflineVaultSnapshot();
  return snapshot?.notes?.find((item) => String(item.id) === String(id)) || null;
};

export const findOfflineVaultItem = async (
  id: number | string,
  type?: VaultItemType | string | null
) => {
  const safeType = String(type || 'PASSWORD').toUpperCase();

  if (safeType === 'CARD') return findOfflineCard(id);
  if (safeType === 'DOCUMENT') return findOfflineDocument(id);
  if (safeType === 'NOTE') return findOfflineNote(id);
  return findOfflinePassword(id);
};

export const formatOfflineSavedAt = (value?: string | null) => {
  if (!value) return 'Not synced yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not synced yet';

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const isOfflineReadableError = (error: any) => {
  const message = String(error?.message || error || '').toLowerCase();

  return (
    message.includes('network') ||
    message.includes('cannot connect') ||
    message.includes('failed to fetch') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('server is taking too long') ||
    message.includes('internet') ||
    message.includes('canceled') ||
    message.includes('cancelled') ||
    message.includes('abort') ||
    message.includes('request_timeout') ||
    String(error?.code || '').toUpperCase() === 'REQUEST_TIMEOUT' ||
    String(error?.code || '').toUpperCase() === 'NETWORK_UNREACHABLE'
  );
};
