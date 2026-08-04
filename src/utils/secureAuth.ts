import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { api } from '../services/api';
import { AppOperationError, safeLogError, toAppOperationError } from './asyncResilience';

const BIOMETRIC_ENABLED_KEY = 'biometricUnlock';
const BIOMETRIC_EMAIL_KEY = 'biometricEmail';
const BIOMETRIC_TOKEN_KEY = 'guardian.biometric-credential';
const BIOMETRIC_TOKEN_PRESENT_KEY = 'guardian.biometric-credential-present';
const LEGACY_BIOMETRIC_PASSWORD_KEY = 'biometricPassword';

const BIOMETRIC_SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: true,
  authenticationPrompt: 'Unlock The Guardian',
};

export const setBiometricEnabled = async (enabled: boolean) => {
  try {
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, String(enabled));
  } catch (error: unknown) {
    safeLogError('BIOMETRIC_SETTING_SAVE', error);
    throw new AppOperationError('Biometric settings could not be saved.', {
      code: 'STORAGE_UNAVAILABLE',
    });
  }
};

export const isBiometricEnabled = async () => {
  try {
    return (await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY)) === 'true';
  } catch (error: unknown) {
    safeLogError('BIOMETRIC_SETTING_READ', error);
    return false;
  }
};

/**
 * Enrolls a revocable, device-bound server credential after a successful
 * password login. The password parameter is retained only for compatibility
 * with existing call sites and is intentionally never stored or used.
 */
export const saveBiometricCredentials = async (
  email: string,
  _password?: string
) => {
  const cleanEmail = email.trim().toLowerCase();
  let enrollment: Awaited<ReturnType<typeof api.enrollBiometricCredential>>;

  try {
    enrollment = await api.enrollBiometricCredential();
  } catch (error: unknown) {
    safeLogError('BIOMETRIC_ENROLLMENT_REQUEST', error);
    throw toAppOperationError(
      error,
      'Biometric setup could not start. Please try again.'
    );
  }

  if (!enrollment?.credentialToken) {
    throw new AppOperationError('Biometric sign-in could not be prepared on this device.');
  }

  try {
    await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, cleanEmail, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await SecureStore.setItemAsync(
      BIOMETRIC_TOKEN_KEY,
      enrollment.credentialToken,
      BIOMETRIC_SECURE_OPTIONS
    );
    await AsyncStorage.setItem(BIOMETRIC_TOKEN_PRESENT_KEY, 'true');

    // Remove credentials created by older app versions that stored the password.
    await SecureStore.deleteItemAsync(LEGACY_BIOMETRIC_PASSWORD_KEY).catch(
      () => undefined
    );
  } catch (error: unknown) {
    /*
     * The server credential is created before SecureStore requests the
     * biometric-protected write. Roll it back if the protected write fails.
     */
    await api.revokeBiometricCredential?.().catch((rollbackError: unknown) => {
      safeLogError('BIOMETRIC_ENROLLMENT_ROLLBACK', rollbackError);
    });
    await Promise.allSettled([
      SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY),
      SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY),
      AsyncStorage.removeItem(BIOMETRIC_TOKEN_PRESENT_KEY),
    ]);
    safeLogError('BIOMETRIC_ENROLLMENT_SAVE', error);
    throw toAppOperationError(
      error,
      'Biometric setup could not be completed. Please try again.'
    );
  }
};

const clearLocalBiometricCredential = async () => {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY),
    SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY),
    SecureStore.deleteItemAsync(LEGACY_BIOMETRIC_PASSWORD_KEY),
    AsyncStorage.removeItem(BIOMETRIC_TOKEN_PRESENT_KEY),
  ]);
};

export const clearBiometricCredentials = async () => {
  try {
    await api.revokeBiometricCredential?.();
  } catch (error: unknown) {
    safeLogError('BIOMETRIC_SERVER_REVOKE', error);
  }

  try {
    await clearLocalBiometricCredential();
  } catch (error: unknown) {
    safeLogError('BIOMETRIC_LOCAL_CLEAR', error);
  }
};

export const hasBiometricCredentials = async () => {
  try {
    const [email, present] = await Promise.all([
      SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY),
      AsyncStorage.getItem(BIOMETRIC_TOKEN_PRESENT_KEY),
    ]);

    return Boolean(email && present === 'true');
  } catch (error: unknown) {
    safeLogError('BIOMETRIC_CREDENTIAL_CHECK', error);
    return false;
  }
};

export const biometricLogin = async () => {
  const enabled = await isBiometricEnabled();
  if (!enabled) {
    throw new AppOperationError('Biometric unlock is not enabled.');
  }

  let compatible = false;
  let enrolled = false;

  try {
    [compatible, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
  } catch (error: unknown) {
    safeLogError('BIOMETRIC_CAPABILITY_CHECK', error);
    throw new AppOperationError('Biometric authentication is unavailable right now.');
  }

  if (!compatible || !enrolled) {
    throw new AppOperationError('Biometric authentication is not available on this device.');
  }

  let email: string | null = null;

  try {
    email = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
  } catch (error: unknown) {
    safeLogError('BIOMETRIC_EMAIL_READ', error);
    throw new AppOperationError('Biometric sign-in needs to be set up again.');
  }

  if (!email) {
    throw new AppOperationError('Biometric sign-in needs to be set up again. Sign in with your password once.');
  }

  let credentialToken: string | null = null;

  try {
    // Authentication is enforced by the operating system before the token is released.
    credentialToken = await SecureStore.getItemAsync(
      BIOMETRIC_TOKEN_KEY,
      BIOMETRIC_SECURE_OPTIONS
    );
  } catch (error: unknown) {
    safeLogError('BIOMETRIC_TOKEN_READ', error);
    throw new AppOperationError('Biometric authentication was cancelled or failed.');
  }

  if (!credentialToken) {
    await AsyncStorage.removeItem(BIOMETRIC_TOKEN_PRESENT_KEY).catch(
      (error: unknown) => safeLogError('BIOMETRIC_PRESENT_MARKER_CLEAR', error)
    );
    throw new AppOperationError('Biometric sign-in needs to be set up again. Sign in with your password once.');
  }

  try {
    return await api.biometricLogin({ email, credentialToken });
  } catch (error: any) {
    if (Number(error?.status) === 401) {
      await clearLocalBiometricCredential().catch((cleanupError: unknown) => {
        safeLogError('BIOMETRIC_INVALID_CREDENTIAL_CLEAR', cleanupError);
      });
      await setBiometricEnabled(false).catch((settingError: unknown) => {
        safeLogError('BIOMETRIC_DISABLE_AFTER_401', settingError);
      });
    }
    throw toAppOperationError(error, 'Biometric sign-in failed. Please try again.');
  }
};
