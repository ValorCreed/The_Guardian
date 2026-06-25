import React, { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Alert,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { api, saveLoginSession } from '../services/api';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppTheme } from '../context/ThemeContext';
import { saveBiometricCredentials, biometricLogin } from '../utils/secureAuth';

export default function UnlockScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [vaultLocked, setVaultLocked] = useState(false);

  useEffect(() => {
    const checkBiometricAndLockState = async () => {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        const savedBiometric = await AsyncStorage.getItem('biometricUnlock');
        const locked = await AsyncStorage.getItem('vaultLocked');

        setBiometricEnabled(compatible && enrolled && savedBiometric === 'true');
        setVaultLocked(locked === 'true');
      } catch {
        setBiometricEnabled(false);
      }
    };

    checkBiometricAndLockState();
  }, []);

  // When the vault is locked, do not allow native back to reveal protected screens.
  // Back only returns to the public welcome screen.
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (vaultLocked) {
          (router as any).dismissAll?.();
          router.replace('/login');
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [vaultLocked])
  );

  const goBackSafely = async () => {
    const locked = await AsyncStorage.getItem('vaultLocked');

    if (locked === 'true') {
      (router as any).dismissAll?.();
      router.replace('/login');
      return;
    }

    router.back();
  };

  const unlockSuccess = async () => {
    await AsyncStorage.setItem('vaultLocked', 'false');
    (router as any).dismissAll?.();
    router.replace('/home');
  };

 
//////HANDLES BIOMETRIC LOGIN//////
const handleBiometricLogin = async () => {
  try {
    setLoading(true);

    await biometricLogin();

    await AsyncStorage.setItem('vaultLocked', 'false');

    (router as any).dismissAll?.();
    router.replace('/home');
  } catch (error: any) {
    Alert.alert(
      'Biometric login failed',
      error.message || 'Please sign in with your email and password first.'
    );
  } finally {
    setLoading(false);
  }
};
/////END//////
  const handleLogin = async () => {
    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      Alert.alert('Missing details', 'Please enter both your email and master password.');
      return;
    }

    try {
      setLoading(true);

      const data = await api.login({
        email: cleanEmail,
        password: cleanPassword,
      });

      await saveLoginSession(data);

      // Save real login credentials securely for biometric login
      await saveBiometricCredentials(cleanEmail, cleanPassword);
      await unlockSuccess();
    } catch (error: any) {
      const backendMessage = String(error?.message || '').toLowerCase();
      let friendlyMessage = 'Something went wrong. Please try again.';

      if (
        backendMessage.includes('401') ||
        backendMessage.includes('unauthorized') ||
        backendMessage.includes('bad credentials') ||
        backendMessage.includes('invalid')
      ) {
        friendlyMessage = 'Invalid email or master password. Please check your details and try again.';
      } else if (
        backendMessage.includes('cannot connect') ||
        backendMessage.includes('network') ||
        backendMessage.includes('failed to fetch')
      ) {
        friendlyMessage = 'Cannot connect to The Guardian server. Please check your internet connection and try again.';
      }

      Alert.alert('Login failed', friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={goBackSafely}
            activeOpacity={0.6}
          >
            <Ionicons name="arrow-back" size={16} color={C.textSecondary} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.logoContainer}>
            <View style={styles.logoBox}>
              <Ionicons name="shield-checkmark" size={28} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Unlock your vault with your master password.</Text>

          <Text style={styles.label}>Email</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={C.tabInactive}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>

          <Text style={styles.label}>Master Password</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              placeholder="Enter master password"
              placeholderTextColor={C.tabInactive}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} activeOpacity={0.6}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={C.tabInactive}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity activeOpacity={0.6} onPress={() => router.push('/forgotpassword')}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          {biometricEnabled && (
            <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricLogin} activeOpacity={0.7}>
              <Ionicons name="finger-print-outline" size={26} color={C.primary} />
              <Text style={styles.biometricText}>Use Face ID / Fingerprint</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.unlockButton, loading && styles.unlockButtonDisabled]}
            activeOpacity={0.85}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.unlockButtonText}>{loading ? 'Signing in...' : 'Unlock Vault'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },
    flex: {
      flex: 1,
    },
    container: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 16,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 28,
    },
    backText: {
      fontSize: 15,
      color: C.textSecondary,
    },
    logoContainer: {
      marginBottom: 24,
    },
    logoBox: {
      width: 60,
      height: 60,
      borderRadius: 16,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: C.text,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 15,
      color: C.textSecondary,
      lineHeight: 22,
      marginBottom: 32,
    },
    label: {
      fontSize: 13,
      color: C.textSecondary,
      marginBottom: 8,
      marginLeft: 2,
    },
    inputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: C.border,
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: C.text,
    },
    forgotText: {
      fontSize: 15,
      fontWeight: '600',
      color: C.primary,
      marginTop: 4,
    },
    biometricBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginTop: 24,
      padding: 14,
      backgroundColor: C.actionCard,
      borderRadius: 16,
    },
    biometricText: {
      fontSize: 15,
      fontWeight: '600',
      color: C.primary,
    },
    footer: {
      paddingHorizontal: 24,
      paddingBottom: 32,
      paddingTop: 12,
      backgroundColor: C.background,
    },
    unlockButton: {
      backgroundColor: C.backgroundbutton,
      borderRadius: 30,
      paddingVertical: 18,
      alignItems: 'center',
    },
    unlockButtonDisabled: {
      opacity: 0.7,
    },
    unlockButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
