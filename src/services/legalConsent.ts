import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, hasStoredAuthToken } from './api';

/**
 * Change this value whenever the Privacy Policy or Terms of Service changes in
 * a way that requires users to accept them again.
 */
export const LEGAL_CONSENT_VERSION = '2026-07';

const LEGAL_CONSENT_KEY_PREFIX = 'guardian.legal-consent';
const LEGAL_CONSENT_SYNC_KEY_PREFIX = 'guardian.legal-consent-needs-sync';

export type LegalConsentRecord = {
  version: string;
  email: string;
  privacyAccepted: boolean;
  termsAccepted: boolean;
  acceptedAt: string;
};

function normalizeEmail(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function getConsentStorageKey(email: string) {
  const safeEmail = normalizeEmail(email) || 'unknown-user';
  return `${LEGAL_CONSENT_KEY_PREFIX}:${LEGAL_CONSENT_VERSION}:${safeEmail}`;
}

function getConsentSyncKey(email: string) {
  const safeEmail = normalizeEmail(email) || 'unknown-user';
  return `${LEGAL_CONSENT_SYNC_KEY_PREFIX}:${LEGAL_CONSENT_VERSION}:${safeEmail}`;
}

async function resolveEmail(email?: string | null) {
  const suppliedEmail = normalizeEmail(email);
  if (suppliedEmail) return suppliedEmail;

  return normalizeEmail(await AsyncStorage.getItem('userEmail'));
}

export async function getLegalConsentRecord(
  email?: string | null
): Promise<LegalConsentRecord | null> {
  const resolvedEmail = await resolveEmail(email);
  if (!resolvedEmail) return null;

  const raw = await AsyncStorage.getItem(getConsentStorageKey(resolvedEmail));

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<LegalConsentRecord>;

      if (
        parsed.version === LEGAL_CONSENT_VERSION &&
        parsed.email === resolvedEmail &&
        parsed.privacyAccepted === true &&
        parsed.termsAccepted === true &&
        parsed.acceptedAt
      ) {
        return parsed as LegalConsentRecord;
      }
    } catch {
      // Try the authenticated server record below.
    }
  }

  if (!(await hasStoredAuthToken())) return null;

  try {
    const serverRecord = await api.getLegalConsent(LEGAL_CONSENT_VERSION);
    if (!serverRecord?.privacyAccepted || !serverRecord?.termsAccepted || !serverRecord.acceptedAt) {
      return null;
    }

    const record: LegalConsentRecord = {
      version: LEGAL_CONSENT_VERSION,
      email: resolvedEmail,
      privacyAccepted: true,
      termsAccepted: true,
      acceptedAt: serverRecord.acceptedAt,
    };

    await AsyncStorage.setItem(getConsentStorageKey(resolvedEmail), JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
}

export async function hasAcceptedLegalConsent(email?: string | null) {
  return Boolean(await getLegalConsentRecord(email));
}

export async function syncLegalConsentToBackend(email?: string | null) {
  const resolvedEmail = await resolveEmail(email);
  if (!resolvedEmail || !(await hasStoredAuthToken())) return false;

  const record = await getLegalConsentRecord(resolvedEmail);
  if (!record) return false;

  try {
    const response = await api.saveLegalConsent({
      version: record.version,
      privacyAccepted: record.privacyAccepted,
      termsAccepted: record.termsAccepted,
      clientSource: 'MOBILE_APP',
    });

    if (response?.privacyAccepted && response?.termsAccepted) {
      await AsyncStorage.removeItem(getConsentSyncKey(resolvedEmail));
      return true;
    }
  } catch {
    // Keep the local acceptance and retry after a future authenticated login.
  }

  await AsyncStorage.setItem(getConsentSyncKey(resolvedEmail), 'true');
  return false;
}

export async function saveLegalConsentAcceptance(email?: string | null) {
  const resolvedEmail = await resolveEmail(email);

  if (!resolvedEmail) {
    throw new Error('Your account email could not be found. Please sign in again.');
  }

  const record: LegalConsentRecord = {
    version: LEGAL_CONSENT_VERSION,
    email: resolvedEmail,
    privacyAccepted: true,
    termsAccepted: true,
    acceptedAt: new Date().toISOString(),
  };

  await AsyncStorage.multiSet([
    [getConsentStorageKey(resolvedEmail), JSON.stringify(record)],
    [getConsentSyncKey(resolvedEmail), 'true'],
  ]);

  // Do not block onboarding if the server is temporarily unavailable. The
  // dirty marker is retried automatically after the next authenticated login.
  await syncLegalConsentToBackend(resolvedEmail);

  return record;
}
