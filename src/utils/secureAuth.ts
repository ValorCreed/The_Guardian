import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { api } from '../services/api';

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
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, String(enabled));
};

export const isBiometricEnabled = async () => {
  return (await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY)) === 'true';
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
  const enrollment = await api.enrollBiometricCredential();

  if (!enrollment?.credentialToken) {
    throw new Error('Biometric sign-in could not be prepared on this device.');
  }

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
  // Revoke the device-bound credential while the authenticated session exists.
  await api.revokeBiometricCredential?.().catch(() => undefined);
  await clearLocalBiometricCredential();
};

export const hasBiometricCredentials = async () => {
  const [email, present] = await Promise.all([
    SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY),
    AsyncStorage.getItem(BIOMETRIC_TOKEN_PRESENT_KEY),
  ]);

  return Boolean(email && present === 'true');
};

export const biometricLogin = async () => {
  const enabled = await isBiometricEnabled();
  if (!enabled) {
    throw new Error('Biometric unlock is not enabled.');
  }

  const compatible = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();

  if (!compatible || !enrolled) {
    throw new Error('Biometric authentication is not available on this device.');
  }

  const email = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
  if (!email) {
    throw new Error('Biometric sign-in needs to be set up again. Sign in with your password once.');
  }

  let credentialToken: string | null = null;

  try {
    // Authentication is enforced by the operating system before the token is released.
    credentialToken = await SecureStore.getItemAsync(
      BIOMETRIC_TOKEN_KEY,
      BIOMETRIC_SECURE_OPTIONS
    );
  } catch {
    throw new Error('Biometric authentication was cancelled or failed.');
  }

  if (!credentialToken) {
    await AsyncStorage.removeItem(BIOMETRIC_TOKEN_PRESENT_KEY);
    throw new Error('Biometric sign-in needs to be set up again. Sign in with your password once.');
  }

  try {
    return await api.biometricLogin({ email, credentialToken });
  } catch (error: any) {
    if (Number(error?.status) === 401) {
      await clearLocalBiometricCredential();
      await setBiometricEnabled(false);
    }
    throw error;
  }
};
