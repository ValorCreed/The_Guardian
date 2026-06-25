import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { api, saveLoginSession } from '../services/api';

const BIOMETRIC_ENABLED_KEY = 'biometricUnlock';
const BIOMETRIC_EMAIL_KEY = 'biometricEmail';
const BIOMETRIC_PASSWORD_KEY = 'biometricPassword';

export const setBiometricEnabled = async (enabled: boolean) => {
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, String(enabled));
};

export const isBiometricEnabled = async () => {
  return (await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY)) === 'true';
};

export const saveBiometricCredentials = async (email: string, password: string) => {
  await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, email.trim().toLowerCase());
  await SecureStore.setItemAsync(BIOMETRIC_PASSWORD_KEY, password);
};

export const clearBiometricCredentials = async () => {
  await SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_PASSWORD_KEY);
};

export const hasBiometricCredentials = async () => {
  const email = await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
  const password = await SecureStore.getItemAsync(BIOMETRIC_PASSWORD_KEY);
  return Boolean(email && password);
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
  const password = await SecureStore.getItemAsync(BIOMETRIC_PASSWORD_KEY);

  if (!email || !password) {
    throw new Error('No saved login credentials found. Please sign in with your email and password once.');
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock The Guardian',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });

  if (!result.success) {
    throw new Error('Biometric authentication was cancelled or failed.');
  }

  const loginResponse = await api.login({ email, password });
  await saveLoginSession(loginResponse);

  return loginResponse;
};
