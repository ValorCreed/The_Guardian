import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

import { api, type CreditCardResponse, type VaultItem } from './api';
import { decryptJson, decryptPassword, encryptPassword } from '../utils/vaultcrypto';
import { detectCardBrand } from '../utils/cardBrand';
import { getFriendlyVaultTitle } from '../utils/vaultPresentation';
import {
  AppOperationError,
  isTransientError,
  retryAsync,
  safeLogError,
  toAppOperationError,
} from '../utils/asyncResilience';

export const GUARDIAN_AUTOFILL_ENABLED_KEY = 'autofillEnabled';
export const GUARDIAN_AUTOFILL_LAST_SYNCED_AT_KEY = 'autofillLastSyncedAt';
export const GUARDIAN_AUTOFILL_USER_EMAIL_KEY = 'guardianAutofillUserEmail';
export const GUARDIAN_DURESS_AUTOFILL_MARKER_KEY = 'guardianDuressAutofillStartedAt';

export type GuardianAutofillCounts = {
  credentials: number;
  cards: number;
  pending: number;
};

type PendingSavedCredential = {
  id: string;
  title: string;
  username: string;
  password: string;
  website: string;
  packageName?: string;
  webDomain?: string;
  capturedAt?: number;
};

type NativeGuardianAutofillModule = {
  syncVaultData: (credentialsJson: string, cardsJson: string) => Promise<GuardianAutofillCounts>;
  syncCredentials: (credentialsJson: string) => Promise<number>;
  syncCards: (cardsJson: string) => Promise<number>;
  clearCredentials: () => Promise<boolean>;
  getCounts: () => Promise<GuardianAutofillCounts>;
  getCredentialCount: () => Promise<number>;
  getCardCount: () => Promise<number>;
  getPendingSavedCredentials: () => Promise<string>;
  removePendingSavedCredential: (id: string) => Promise<boolean>;
};

export const GuardianAutofill = NativeModules.GuardianAutofill as
  | NativeGuardianAutofillModule
  | undefined;

let pendingSyncPromise: Promise<{
  processed: number;
  saved: number;
  updated: number;
  remaining: number;
}> | null = null;

const clean = (value?: unknown) => String(value ?? '').trim();

const EMPTY_COUNTS: GuardianAutofillCounts = {
  credentials: 0,
  cards: 0,
  pending: 0,
};

const isDuressAutofillSession = async () => {
  try {
    return (await AsyncStorage.getItem('guardianSessionMode')) === 'DURESS';
  } catch (error) {
    // Fail closed: never expose normal-vault autofill data when session state
    // cannot be verified.
    safeLogError('AUTOFILL_SESSION_READ', error);
    return true;
  }
};

const runNativeAutofillOperation = async <T>(
  context: string,
  operation: () => Promise<T>,
  options: { retry?: boolean } = {}
): Promise<T> => {
  try {
    if (!options.retry) return await operation();

    return await retryAsync(() => operation(), {
      maxAttempts: 2,
      baseDelayMs: 350,
      maxDelayMs: 900,
      shouldRetry: (error) => isTransientError(error),
      onRetry: (error) => safeLogError(`${context}_RETRY`, error),
    });
  } catch (error) {
    safeLogError(context, error);
    throw toAppOperationError(error, 'Autofill is temporarily unavailable.');
  }
};

const decodeStoredText = (value?: string | null) => {
  if (!value) return '';

  const decoded = decryptJson<any>(value, null);
  if (decoded !== null && decoded !== undefined) return String(decoded).trim();

  return decryptPassword(value).trim();
};

const normalizeTarget = (value?: string | null) => {
  const cleanValue = clean(value)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0];

  return cleanValue.replace(/:\d+$/, '').trim();
};

const targetsOverlap = (first?: string | null, second?: string | null) => {
  const a = normalizeTarget(first);
  const b = normalizeTarget(second);

  if (!a || !b) return false;
  if (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)) return true;

  const ignoredPackageTokens = new Set([
    'com', 'org', 'net', 'android', 'app', 'mobile', 'www', 'google', 'chrome',
  ]);
  const packageTokens = a
    .split('.')
    .filter((token) => token.length >= 3 && !ignoredPackageTokens.has(token));
  return packageTokens.some((token) => b.includes(token));
};

const buildCredential = (item: VaultItem) => {
  const password = decodeStoredText(item.encryptedPassword);
  if (!password) return null;

  return {
    id: String(item.id),
    title: getFriendlyVaultTitle(item.title, item.website, 'Saved login'),
    username: clean(item.usernameValue),
    password,
    /* Preserve the raw target for Android app/domain matching. */
    website: clean(item.website || item.title),
  };
};

const buildCard = (card: CreditCardResponse) => {
  const cardNumber = decodeStoredText(card.encryptedCardNumber).replace(/\D/g, '');
  if (cardNumber.length < 12) return null;

  const title = clean(card.cardName) || `Card ending ${cardNumber.slice(-4)}`;
  const brand = detectCardBrand(title, cardNumber);

  return {
    id: String(card.id),
    title,
    cardholderName: decodeStoredText(
      card.encryptedCardholderName || card.encryptedCardHolderName
    ),
    cardNumber,
    expiry: decodeStoredText(card.encryptedExpiryDate),
    cvv: decodeStoredText(card.encryptedCvv),
    brand: brand === 'unknown' ? '' : String(brand).toUpperCase(),
    last4: cardNumber.slice(-4),
  };
};

export const isGuardianAutofillAvailable = () =>
  Platform.OS === 'android' && Boolean(GuardianAutofill);


export const prepareGuardianAutofillForSignedInUser = async (
  email?: string | null
) => {
  if (!isGuardianAutofillAvailable() || !GuardianAutofill) return;

  try {
    const currentEmail = clean(
      email || (await AsyncStorage.getItem('userEmail'))
    ).toLowerCase();
    const previousEmail = clean(
      await AsyncStorage.getItem(GUARDIAN_AUTOFILL_USER_EMAIL_KEY)
    ).toLowerCase();

    if (previousEmail && currentEmail && previousEmail !== currentEmail) {
      await runNativeAutofillOperation(
        'AUTOFILL_CLEAR_PREVIOUS_USER',
        () => GuardianAutofill.clearCredentials(),
        { retry: true }
      );
      await AsyncStorage.removeItem(GUARDIAN_AUTOFILL_LAST_SYNCED_AT_KEY);
    }

    if (currentEmail) {
      await AsyncStorage.setItem(GUARDIAN_AUTOFILL_USER_EMAIL_KEY, currentEmail);
    }
  } catch (error) {
    safeLogError('AUTOFILL_PREPARE_USER', error);
    throw new AppOperationError('Autofill could not be prepared.', {
      code: 'STORAGE_UNAVAILABLE',
      transient: true,
    });
  }
};

export const getGuardianAutofillCounts = async (): Promise<GuardianAutofillCounts> => {
  if (!isGuardianAutofillAvailable() || !GuardianAutofill) {
    return EMPTY_COUNTS;
  }

  try {
    if (await isDuressAutofillSession()) {
      await runNativeAutofillOperation(
        'AUTOFILL_CLEAR_DURESS_COUNTS',
        () => GuardianAutofill.clearCredentials(),
        { retry: true }
      ).catch(() => undefined);
      return EMPTY_COUNTS;
    }

    const counts = await runNativeAutofillOperation(
      'AUTOFILL_READ_COUNTS',
      () => GuardianAutofill.getCounts(),
      { retry: true }
    );

    return {
      credentials: Number(counts?.credentials || 0),
      cards: Number(counts?.cards || 0),
      pending: Number(counts?.pending || 0),
    };
  } catch (error) {
    safeLogError('AUTOFILL_COUNTS_FALLBACK', error);
    return EMPTY_COUNTS;
  }
};

export const syncGuardianAutofillCache = async (options?: {
  passwords?: VaultItem[];
  cards?: CreditCardResponse[];
  force?: boolean;
  enable?: boolean;
}): Promise<GuardianAutofillCounts> => {
  if (!isGuardianAutofillAvailable() || !GuardianAutofill) {
    return EMPTY_COUNTS;
  }

  try {
    if (await isDuressAutofillSession()) {
      await suspendGuardianAutofillForDuressSession();
      return EMPTY_COUNTS;
    }

    await prepareGuardianAutofillForSignedInUser();

    const enabled =
      (await AsyncStorage.getItem(GUARDIAN_AUTOFILL_ENABLED_KEY)) === 'true';
    if (!enabled && !options?.force) {
      return getGuardianAutofillCounts();
    }

    let passwordItems = options?.passwords;
    let cardItems = options?.cards;

    if (!passwordItems || !cardItems) {
      api.clearCache?.('GET:/api/vault');
      api.clearCache?.('GET:/vault/cards');

      const [loadedPasswords, loadedCards] = await Promise.all([
        passwordItems ? Promise.resolve(passwordItems) : api.getVaultItems(),
        cardItems ? Promise.resolve(cardItems) : api.getCards(),
      ]);

      passwordItems = loadedPasswords || [];
      cardItems = loadedCards || [];
    }

    const credentials = (passwordItems || [])
      .filter((item) => (item.itemType || 'PASSWORD') === 'PASSWORD')
      .map(buildCredential)
      .filter(Boolean);

    const cards = (cardItems || []).map(buildCard).filter(Boolean);
    const counts = await runNativeAutofillOperation(
      'AUTOFILL_SYNC_NATIVE_CACHE',
      () =>
        GuardianAutofill.syncVaultData(
          JSON.stringify(credentials),
          JSON.stringify(cards)
        ),
      { retry: true }
    );

    const now = new Date().toISOString();
    const storageWrites: Array<[string, string]> = [
      [GUARDIAN_AUTOFILL_LAST_SYNCED_AT_KEY, now],
    ];
    if (options?.enable || enabled) {
      storageWrites.push([GUARDIAN_AUTOFILL_ENABLED_KEY, 'true']);
    }
    await AsyncStorage.multiSet(storageWrites);

    return {
      credentials: Number(counts?.credentials || credentials.length),
      cards: Number(counts?.cards || cards.length),
      pending: Number(counts?.pending || 0),
    };
  } catch (error) {
    safeLogError('AUTOFILL_SYNC_CACHE', error);
    throw toAppOperationError(error, 'Autofill could not sync. Please try again.');
  }
};

const removeAllPendingNativeCredentials = async () => {
  if (!GuardianAutofill) return;

  try {
    const raw = await runNativeAutofillOperation(
      'AUTOFILL_READ_PENDING_FOR_CLEAR',
      () => GuardianAutofill.getPendingSavedCredentials(),
      { retry: true }
    );
    const parsed = JSON.parse(raw || '[]');
    const pendingItems = Array.isArray(parsed) ? parsed : [];

    await Promise.allSettled(
      pendingItems
        .map((item) => clean(item?.id))
        .filter(Boolean)
        .map((id) => GuardianAutofill.removePendingSavedCredential(id))
    );
  } catch (error) {
    // Native autofill is optional; cleanup is retried after a normal login.
    safeLogError('AUTOFILL_CLEAR_PENDING', error);
  }
};

export const clearDuressAutofillResidueAfterNormalLogin = async () => {
  try {
    const marker = await AsyncStorage.getItem(GUARDIAN_DURESS_AUTOFILL_MARKER_KEY);
    if (!marker) return;

    await removeAllPendingNativeCredentials();
    await AsyncStorage.removeItem(GUARDIAN_DURESS_AUTOFILL_MARKER_KEY);
  } catch (error) {
    safeLogError('AUTOFILL_CLEAR_DURESS_RESIDUE', error);
  }
};

export const suspendGuardianAutofillForDuressSession = async () => {
  try {
    if (GuardianAutofill) {
      await runNativeAutofillOperation(
        'AUTOFILL_SUSPEND_DURESS',
        () => GuardianAutofill.clearCredentials(),
        { retry: true }
      ).catch(() => undefined);
      await removeAllPendingNativeCredentials();
    }

    await AsyncStorage.multiRemove([
      GUARDIAN_AUTOFILL_LAST_SYNCED_AT_KEY,
      GUARDIAN_AUTOFILL_USER_EMAIL_KEY,
    ]);
  } catch (error) {
    safeLogError('AUTOFILL_SUSPEND_DURESS_STORAGE', error);
    // Continue fail-closed. Native clearing was attempted before local cleanup.
  }
};

export const clearGuardianAutofillCache = async () => {
  try {
    if (GuardianAutofill) {
      await runNativeAutofillOperation(
        'AUTOFILL_CLEAR_NATIVE_CACHE',
        () => GuardianAutofill.clearCredentials(),
        { retry: true }
      );
    }

    await AsyncStorage.multiRemove([
      GUARDIAN_AUTOFILL_ENABLED_KEY,
      GUARDIAN_AUTOFILL_LAST_SYNCED_AT_KEY,
      GUARDIAN_AUTOFILL_USER_EMAIL_KEY,
    ]);
  } catch (error) {
    safeLogError('AUTOFILL_CLEAR_CACHE', error);
    throw toAppOperationError(error, 'Autofill cache could not be cleared.');
  }
};

const findExistingCredential = (
  items: VaultItem[],
  pending: PendingSavedCredential
) => {
  const pendingUsername = clean(pending.username).toLowerCase();
  const pendingTarget = pending.webDomain || pending.website || pending.packageName || pending.title;
  const targetMatches = items.filter(
    (item) =>
      (item.itemType || 'PASSWORD') === 'PASSWORD' &&
      targetsOverlap(item.website || item.title, pendingTarget)
  );

  if (pendingUsername) {
    return targetMatches.find(
      (item) => clean(item.usernameValue).toLowerCase() === pendingUsername
    );
  }

  // A password-only form does not identify which of several accounts should be
  // updated. Only update automatically when the target has one unambiguous login.
  return targetMatches.length === 1 ? targetMatches[0] : undefined;
};

export const syncPendingGuardianAutofillSaves = async () => {
  if (pendingSyncPromise) return pendingSyncPromise;

  const syncTask = (async () => {
    try {
      if (!isGuardianAutofillAvailable() || !GuardianAutofill) {
        return { processed: 0, saved: 0, updated: 0, remaining: 0 };
      }

      if (await isDuressAutofillSession()) {
        await suspendGuardianAutofillForDuressSession();
        return { processed: 0, saved: 0, updated: 0, remaining: 0 };
      }

      const enabled =
        (await AsyncStorage.getItem(GUARDIAN_AUTOFILL_ENABLED_KEY)) === 'true';
      if (!enabled) {
        const counts = await getGuardianAutofillCounts();
        return { processed: 0, saved: 0, updated: 0, remaining: counts.pending };
      }

      const raw = await runNativeAutofillOperation(
        'AUTOFILL_READ_PENDING',
        () => GuardianAutofill.getPendingSavedCredentials(),
        { retry: true }
      );
      let pendingItems: PendingSavedCredential[] = [];

      try {
        const parsed = JSON.parse(raw || '[]');
        pendingItems = Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        safeLogError('AUTOFILL_PARSE_PENDING', error);
      }

      if (pendingItems.length === 0) {
        return { processed: 0, saved: 0, updated: 0, remaining: 0 };
      }

      api.clearCache?.('GET:/api/vault');
      const existingItems = await api.getVaultItems();
      let saved = 0;
      let updated = 0;
      let processed = 0;

      for (const pending of pendingItems) {
        const password = clean(pending.password);
        if (!password) {
          await GuardianAutofill.removePendingSavedCredential(
            String(pending.id)
          ).catch((error) => safeLogError('AUTOFILL_DROP_EMPTY_PENDING', error));
          processed += 1;
          continue;
        }

        try {
          const website = clean(
            pending.webDomain ||
              pending.website ||
              pending.packageName ||
              pending.title
          );
          const title = getFriendlyVaultTitle(
            pending.title,
            pending.webDomain || pending.website || pending.packageName,
            'Saved login'
          );
          const existing = findExistingCredential(existingItems || [], pending);
          const encryptedPassword = encryptPassword(password);

          if (existing) {
            const existingPassword = decodeStoredText(existing.encryptedPassword);
            const detailsChanged =
              existingPassword !== password ||
              clean(existing.usernameValue) !== clean(pending.username) ||
              !targetsOverlap(existing.website || existing.title, website);

            if (detailsChanged) {
              const result = await api.updateVaultItem(existing.id, {
                itemType: 'PASSWORD',
                title,
                website,
                usernameValue: clean(pending.username),
                encryptedPassword,
                notes: existing.notes || '',
              });
              Object.assign(existing, result || {}, {
                title,
                website,
                usernameValue: clean(pending.username),
                encryptedPassword,
              });
              updated += 1;
            }
          } else {
            const created = await api.createVaultItem({
              itemType: 'PASSWORD',
              title,
              website,
              usernameValue: clean(pending.username),
              encryptedPassword,
              notes: 'Saved from Android Autofill',
            });
            existingItems.push(created);
            saved += 1;
          }

          await GuardianAutofill.removePendingSavedCredential(String(pending.id));
          processed += 1;
        } catch (error: any) {
          const code = String(error?.code || '').toUpperCase();
          if (code === 'PLAN_LIMIT_REACHED') break;
          safeLogError('AUTOFILL_COMMIT_PENDING_ITEM', error);
          // Keep this encrypted pending item for the next authenticated launch.
        }
      }

      if (saved > 0 || updated > 0) {
        try {
          await AsyncStorage.multiSet([
            ['homeNeedsInitialSync', 'true'],
            ['securityScoreNeedsInitialSync', 'true'],
          ]);
        } catch (error) {
          safeLogError('AUTOFILL_DIRTY_MARKERS', error);
        }

        await syncGuardianAutofillCache().catch((error) =>
          safeLogError('AUTOFILL_REFRESH_AFTER_PENDING', error)
        );
      }

      const counts = await getGuardianAutofillCounts();
      return { processed, saved, updated, remaining: counts.pending };
    } catch (error) {
      safeLogError('AUTOFILL_PENDING_SYNC', error);
      const counts = await getGuardianAutofillCounts().catch(() => EMPTY_COUNTS);
      return { processed: 0, saved: 0, updated: 0, remaining: counts.pending };
    }
  })();

  pendingSyncPromise = syncTask;

  try {
    return await syncTask;
  } finally {
    if (pendingSyncPromise === syncTask) {
      pendingSyncPromise = null;
    }
  }
};

