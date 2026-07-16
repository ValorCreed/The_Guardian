import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  CreditCardResponse,
  SecureNoteResponse,
  VaultItem,
  VaultItemType,
} from './api';
import { decryptJson, encryptJson } from '../utils/vaultcrypto';

const OFFLINE_VAULT_ENABLED_KEY = 'theguardian.offlineVault.enabled.v1';
const OFFLINE_VAULT_NEEDS_REFRESH_KEY = 'theguardian.offlineVault.needsRefresh.v1';
const OFFLINE_VAULT_LAST_SAVED_HASH_KEY = 'theguardian.offlineVault.lastSavedHash.v1';

export type OfflineVaultSnapshot = {
  version: 1;
  email: string;
  savedAt: string;
  passwords: VaultItem[];
  cards: CreditCardResponse[];
  documents: any[];
  notes: SecureNoteResponse[];
};

export type OfflineVaultStatus = {
  enabled: boolean;
  hasSnapshot: boolean;
  needsRefresh: boolean;
  savedAt?: string | null;
  passwordCount: number;
  cardCount: number;
  documentCount: number;
  noteCount: number;
  totalCount: number;
};

type OfflineMemoryCache = {
  email: string;
  snapshot: OfflineVaultSnapshot;
  loadedAt: number;
  contentHash: string;
};

let offlineMemoryCache: OfflineMemoryCache | null = null;

const normalizeEmail = (email?: string | null) =>
  String(email || 'anonymous').trim().toLowerCase();

const getSnapshotKey = (email: string) =>
  `theguardian.offlineVault.snapshot.v1:${normalizeEmail(email)}`;

const getLastSavedHashKey = (email: string) =>
  `${OFFLINE_VAULT_LAST_SAVED_HASH_KEY}:${normalizeEmail(email)}`;

const stableStringify = (value: any) => {
  try {
    return JSON.stringify(value || null);
  } catch {
    return String(value || '');
  }
};

const createSnapshotHash = (snapshot: OfflineVaultSnapshot) => {
  /*
   * Do not include savedAt in the hash. savedAt changes every sync and would
   * make the app rewrite AsyncStorage even when the vault content is identical.
   */
  return stableStringify({
    version: snapshot.version,
    email: snapshot.email,
    passwords: snapshot.passwords,
    cards: snapshot.cards,
    documents: snapshot.documents,
    notes: snapshot.notes,
  });
};

const setMemorySnapshot = (snapshot: OfflineVaultSnapshot) => {
  offlineMemoryCache = {
    email: normalizeEmail(snapshot.email),
    snapshot,
    loadedAt: Date.now(),
    contentHash: createSnapshotHash(snapshot),
  };
};

export const clearOfflineVaultMemoryCache = () => {
  offlineMemoryCache = null;
};

export const getCurrentUserEmail = async () => {
  const email = await AsyncStorage.getItem('userEmail');
  return normalizeEmail(email);
};

export const isOfflineVaultEnabled = async () => {
  const raw = await AsyncStorage.getItem(OFFLINE_VAULT_ENABLED_KEY);
  return raw !== 'false';
};

export const setOfflineVaultEnabled = async (enabled: boolean) => {
  await AsyncStorage.setItem(OFFLINE_VAULT_ENABLED_KEY, String(enabled));

  if (!enabled) {
    clearOfflineVaultMemoryCache();
  }
};

export const markOfflineVaultStale = async () => {
  await AsyncStorage.setItem(OFFLINE_VAULT_NEEDS_REFRESH_KEY, 'true');
};

export const markOfflineVaultFresh = async () => {
  await AsyncStorage.removeItem(OFFLINE_VAULT_NEEDS_REFRESH_KEY);
};

export const isOfflineVaultStale = async () => {
  return (await AsyncStorage.getItem(OFFLINE_VAULT_NEEDS_REFRESH_KEY)) === 'true';
};

export const createOfflineVaultSnapshot = async (input: {
  passwords?: VaultItem[];
  cards?: CreditCardResponse[];
  documents?: any[];
  notes?: SecureNoteResponse[];
}): Promise<OfflineVaultSnapshot> => {
  const email = await getCurrentUserEmail();

  return {
    version: 1,
    email,
    savedAt: new Date().toISOString(),
    passwords: (input.passwords || []).map((item: any) => ({
      ...item,
      itemType: item.itemType || 'PASSWORD',
    })),
    cards: input.cards || [],
    documents: input.documents || [],
    notes: input.notes || [],
  };
};

export const saveOfflineVaultSnapshot = async (
  input: OfflineVaultSnapshot | {
    passwords?: VaultItem[];
    cards?: CreditCardResponse[];
    documents?: any[];
    notes?: SecureNoteResponse[];
  }
) => {
  const enabled = await isOfflineVaultEnabled();
  if (!enabled) return null;

  const snapshot = 'version' in input
    ? input as OfflineVaultSnapshot
    : await createOfflineVaultSnapshot(input);

  const contentHash = createSnapshotHash(snapshot);
  const lastSavedHashKey = getLastSavedHashKey(snapshot.email);
  const lastSavedHash = await AsyncStorage.getItem(lastSavedHashKey);

  setMemorySnapshot(snapshot);

  /*
   * This is the speed fix: when server returns the same vault content, do not
   * encrypt/stringify/write the whole offline snapshot again. AsyncStorage
   * writes are one of the reasons the Vault page felt slower than server loads.
   */
  if (lastSavedHash !== contentHash) {
    const encoded = encryptJson(snapshot);
    await AsyncStorage.multiSet([
      [getSnapshotKey(snapshot.email), encoded],
      [lastSavedHashKey, contentHash],
    ]);
  }

  await markOfflineVaultFresh();

  return snapshot;
};

export const getOfflineVaultMemorySnapshot = async (email?: string | null) => {
  const currentEmail = normalizeEmail(email || await getCurrentUserEmail());

  if (offlineMemoryCache?.email === currentEmail) {
    return offlineMemoryCache.snapshot;
  }

  return null;
};

export const loadOfflineVaultSnapshot = async (email?: string | null) => {
  const currentEmail = normalizeEmail(email || await getCurrentUserEmail());

  if (offlineMemoryCache?.email === currentEmail) {
    return offlineMemoryCache.snapshot;
  }

  const raw = await AsyncStorage.getItem(getSnapshotKey(currentEmail));

  if (!raw) return null;

  const snapshot = decryptJson<OfflineVaultSnapshot | null>(raw, null);
  if (!snapshot || snapshot.version !== 1) return null;

  setMemorySnapshot(snapshot);

  return snapshot;
};

export const clearOfflineVaultSnapshot = async (email?: string | null) => {
  const currentEmail = normalizeEmail(email || await getCurrentUserEmail());
  await AsyncStorage.multiRemove([
    getSnapshotKey(currentEmail),
    getLastSavedHashKey(currentEmail),
    OFFLINE_VAULT_NEEDS_REFRESH_KEY,
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
  return snapshot?.documents?.find((item: any) => String(item.id) === String(id)) || null;
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
