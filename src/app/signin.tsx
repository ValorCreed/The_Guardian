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
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, saveLoginSession } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import { saveBiometricCredentials, biometricLogin } from '../utils/secureAuth';
import GuardianLogoTile from '../components/GuardianLogoTitle';

export default function UnlockScreen() {
  const { isDark, colors: C, reloadTheme } = useAppTheme();
  const styles = makeStyles(C);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [vaultLocked, setVaultLocked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reloadTheme?.();
    }, [reloadTheme])
  );

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

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (vaultLocked) {
          router.replace('/login');
          return true;
        }

        return false;
      };

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress
      );

      return () => subscription.remove();
    }, [vaultLocked])
  );

  const unlockSuccess = async () => {
    await AsyncStorage.setItem('vaultLocked', 'false');
    router.replace('/home');
  };

  const handleBiometricLogin = async () => {
    if (loading) return;

    try {
      setLoading(true);

      const data = await biometricLogin();

      if (data.requiresTwoFactor) {
        router.push({
          pathname: '/twofactor',
          params: { email: data.email || '' },
        });
        return;
      }

      await saveLoginSession(data);
      await AsyncStorage.setItem('vaultLocked', 'false');
      await reloadTheme?.();

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

  const handleLogin = async () => {
    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;

    if (!cleanEmail || !cleanPassword) {
      Alert.alert(
        'Missing details',
        'Please enter both your email and master password.'
      );
      return;
    }

    try {
      setLoading(true);

      const data = await api.login({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (data.requiresTwoFactor) {
        router.push({
          pathname: '/twofactor',
          params: { email: cleanEmail },
        });
        return;
      }

      await saveLoginSession(data);
      await saveBiometricCredentials(cleanEmail, cleanPassword);
      await reloadTheme?.();
      await unlockSuccess();
    } catch (error: any) {
      const message =
        error.message ||
        'We could not sign you in. Please check your details and try again.';

      const isDeviceLimitError = message
        .toLowerCase()
        .includes('free plan allows only one active device');

      Alert.alert(
        isDeviceLimitError ? 'Device limit reached' : 'Login failed',
        isDeviceLimitError
          ? `${message}

To use this device, open The Guardian on your active device and remove the old session from Settings > Trusted Devices.`
          : message
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={C.background}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <View style={styles.logoContainer}>
            <GuardianLogoTile
              size={60}
              logoSize={48}
              radius={16}
              style={styles.logoBox}
            />
          </View>

          <Text style={styles.title}>Welcome back</Text>

          <Text style={styles.subtitle}>
            Unlock your vault with your master password.
          </Text>

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
              autoComplete="email"
              textContentType="username"
              importantForAutofill="yes"
              returnKeyType="next"
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
              autoComplete="current-password"
              textContentType="password"
              importantForAutofill="yes"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword((current) => !current)}
              activeOpacity={0.6}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={C.tabInactive}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => router.push('/forgotpassword')}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          {biometricEnabled && (
            <TouchableOpacity
              style={styles.biometricBtn}
              onPress={handleBiometricLogin}
              activeOpacity={0.7}
              disabled={loading}
            >
              <Ionicons
                name="finger-print-outline"
                size={26}
                color={C.primary}
              />

              <Text style={styles.biometricText}>
                Use Face ID / Fingerprint
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.buttonArea}>
            <TouchableOpacity
              style={[styles.unlockButton, loading && styles.unlockButtonDisabled]}
              activeOpacity={0.85}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.unlockButtonText}>Unlock Vault</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
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

    keyboardView: {
      flex: 1,
    },

    scrollView: {
      flex: 1,
    },

    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 80,
      paddingBottom: 180,
    },

    logoContainer: {
      marginBottom: 24,
    },

    logoBox: {},

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
      fontWeight: '700',
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
      paddingVertical: 0,
    },

    eyeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
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

    buttonArea: {
      marginTop: 28,
    },

    unlockButton: {
      backgroundColor: C.backgroundbutton,
      borderRadius: 30,
      paddingVertical: 18,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 56,
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