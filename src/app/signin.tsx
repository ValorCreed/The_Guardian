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
import Svg, { Line, Circle } from 'react-native-svg';

import { api, saveLoginSession } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import { saveBiometricCredentials, biometricLogin } from '../utils/secureAuth';

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
          ? `${message}\n\nTo use this device, open The Guardian on your active device and remove the old session from Settings > Trusted Devices.`
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
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Unlock your vault with your master password.
          </Text>

          {/* Main Form Card */}
          <View style={styles.formCard}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputBox}>
              <Ionicons name="mail-outline" size={20} color={C.primary || '#115E41'} style={styles.inputIcon} />
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
              <Ionicons name="lock-closed-outline" size={20} color={C.primary || '#115E41'} style={styles.inputIcon} />
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
              style={styles.forgotPasswordContainer}
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          {/* Unlock Button */}
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

          {/* Biometric Button (if enabled) */}
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
                color={C.primary || '#115E41'}
              />
              <Text style={styles.biometricText}>
                Use Face ID / Fingerprint
              </Text>
            </TouchableOpacity>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background || '#F8F9FA',
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
      paddingTop: 20,
      paddingBottom: 40,
    },
    backButton: {
      marginBottom: 30,
      marginLeft: -8, // Offset slightly to align chevron visually with text
    },
    title: {
      fontSize: 42,
      fontWeight: '800',
      paddingTop: 100,
      color: C.text || '#0F172A',
      marginBottom: 8,
      fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', // Serif font to match the design
    },
    subtitle: {
      fontSize: 16,
      color: C.textSecondary || '#64748B',
      marginBottom: 32,
    },
    formCard: {
      backgroundColor: '#FFFFFF', // Forced white for the card background
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.primary || '#115E41', // Dark green border
      padding: 20,
      // Shadow styling for the floating card effect
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 4,
    },
    label: {
      fontSize: 14,
      color: C.text || '#333333',
      marginBottom: 8,
      fontWeight: '500',
    },
    inputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      borderRadius: 8,
      paddingHorizontal: 12,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: C.border || '#D1D5DB', // Light gray inner border
      height: 52,
    },
    inputIcon: {
      marginRight: 10,
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: C.text || '#0F172A',
      paddingVertical: 0,
    },
    eyeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    forgotPasswordContainer: {
      alignSelf: 'flex-end',
      marginTop: -4,
    },
    forgotText: {
      fontSize: 14,
      fontWeight: '700',
      color: C.primary || '#115E41',
    },
    buttonArea: {
      marginTop: 32,
    },
    unlockButton: {
      backgroundColor: C.primary || '#115E41',
      borderRadius: 30,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 56,
      // Green glow shadow
      shadowColor: C.primary || '#115E41',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4,
      shadowRadius: 10,
      elevation: 8,
    },
    unlockButtonDisabled: {
      opacity: 0.7,
    },
    unlockButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    biometricBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginTop: 24,
      padding: 14,
      backgroundColor: 'transparent',
    },
    biometricText: {
      fontSize: 15,
      fontWeight: '600',
      color: C.primary || '#115E41',
    },
  });