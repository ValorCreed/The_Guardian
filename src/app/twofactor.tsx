import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, saveLoginSession } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import { useAppAlert } from '../context/AppAlertContext';
import { useAppTheme } from '../context/ThemeContext';

const AUTO_VERIFY_DELAY_MS = 260;

const getFriendlyCodeError = (error: any) => {
  const message = String(error?.message || error?.rawMessage || '').trim();
  const lower = message.toLowerCase();
  const status = Number(error?.status || 0);

  if (
    status === 400 ||
    status === 401 ||
    lower.includes('invalid') ||
    lower.includes('incorrect') ||
    lower.includes('expired') ||
    lower.includes('code')
  ) {
    return 'That verification code is incorrect or has expired. Check the six digits and try again.';
  }

  if (
    lower.includes('network') ||
    lower.includes('connect') ||
    lower.includes('timeout') ||
    lower.includes('taking too long')
  ) {
    return message || 'We could not reach The Guardian. Check your connection and try again.';
  }

  return 'We could not verify that code. Please try again.';
};

export default function TwoFactorScreen() {
  const requestApi = useCancelableApi(api);
  const { showAlert } = useAppAlert();
  const { isDark, isOled, colors: C } = useAppTheme();
  const styles = makeStyles(C, isDark, isOled);
  const params = useLocalSearchParams<{ email?: string }>();
  const email = String(params.email || '').trim().toLowerCase();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const lastAttemptedCodeRef = useRef('');
  const verifyingRef = useRef(false);

  const verifyCode = useCallback(
    async (rawCode: string, showIncompleteError = false) => {
      const cleanCode = rawCode.replace(/\D/g, '').slice(0, 6);

      if (!email) {
        showAlert({
          title: 'Sign in again',
          message: 'Your email is missing from this verification request. Please return to sign in and try again.',
          type: 'error',
          buttons: [
            {
              text: 'Back to sign in',
              onPress: () => router.replace('/login'),
            },
          ],
        });
        return;
      }

      if (cleanCode.length !== 6) {
        if (showIncompleteError) {
          showAlert({
            title: 'Enter all six digits',
            message: 'The verification code must contain exactly six numbers.',
            type: 'info',
            buttons: [
              {
                text: 'Continue typing',
                onPress: () => inputRef.current?.focus(),
              },
            ],
          });
        }
        return;
      }

      if (loading || verifyingRef.current) return;

      verifyingRef.current = true;
      lastAttemptedCodeRef.current = cleanCode;

      try {
        setLoading(true);

        const data = await requestApi.verifyTwoFactor({
          email,
          code: cleanCode,
        });

        await saveLoginSession(data);
        router.replace('/home');
      } catch (error: any) {
        if (isScreenRequestCancelled(error)) return;

        setCode('');

        showAlert({
          title: 'Code not accepted',
          message: getFriendlyCodeError(error),
          type: 'error',
          buttons: [
            {
              text: 'Try again',
              onPress: () => inputRef.current?.focus(),
            },
          ],
        });
      } finally {
        verifyingRef.current = false;
        setLoading(false);
      }
    },
    [email, loading, requestApi, showAlert]
  );

  useEffect(() => {
    const cleanCode = code.replace(/\D/g, '').slice(0, 6);

    if (
      cleanCode.length !== 6 ||
      loading ||
      lastAttemptedCodeRef.current === cleanCode
    ) {
      return;
    }

    const timer = setTimeout(() => {
      void verifyCode(cleanCode);
    }, AUTO_VERIFY_DELAY_MS);

    return () => clearTimeout(timer);
  }, [code, loading, verifyCode]);

  const handleCodeChange = (value: string) => {
    const nextCode = value.replace(/[^0-9]/g, '').slice(0, 6);

    if (nextCode.length < 6) {
      lastAttemptedCodeRef.current = '';
    }

    setCode(nextCode);
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
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <View style={styles.verificationCard}>
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark-outline" size={42} color={C.primaryLight || C.primary} />
            </View>

            <Text style={styles.title}>Verification code</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit login code to {email || 'your email'}. Enter it below to continue.
            </Text>

            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={handleCodeChange}
              placeholder="000000"
              placeholderTextColor={C.tabInactive}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              style={styles.input}
              textAlign="center"
              editable={!loading}
              autoFocus
            />

            <Text style={styles.autoVerifyText}>
              {loading
                ? 'Checking your code…'
                : ''}
            </Text>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={() => void verifyCode(code, true)}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify and Continue</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace('/login')}
              disabled={loading}
              style={styles.backButton}
              activeOpacity={0.75}
            >
              <Text style={styles.backText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any, isDark: boolean, isOled: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },
    keyboardView: {
      flex: 1,
    },
    container: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 74,
      paddingBottom: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    verificationCard: {
      width: '100%',
      maxWidth: 460,
      backgroundColor: C.backgroundElement,
      borderRadius: 30,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 22,
      paddingTop: 30,
      paddingBottom: 24,
      alignItems: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: isOled ? 0.46 : isDark ? 0.28 : 0.13,
      shadowRadius: 26,
      elevation: 10,
    },
    iconCircle: {
      width: 86,
      height: 86,
      borderRadius: 43,
      backgroundColor: C.primaryMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
      shadowColor: C.primary,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.24 : 0.16,
      shadowRadius: 18,
      elevation: 5,
    },
    title: {
      fontSize: 26,
      fontWeight: '800',
      color: C.text,
      marginBottom: 10,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 15,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 24,
    },
    input: {
      width: '100%',
      height: 70,
      borderWidth: 1,
      borderColor: C.inputBorder || C.border,
      backgroundColor: C.inputBackground || C.backgroundElement,
      borderRadius: 20,
      paddingHorizontal: 16,
      fontSize: 28,
      fontWeight: '800',
      letterSpacing: 10,
      color: C.text,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 7 },
      shadowOpacity: isOled ? 0.34 : isDark ? 0.20 : 0.06,
      shadowRadius: 12,
      elevation: 3,
    },
    autoVerifyText: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
      marginTop: 10,
      marginBottom: 16,
    },
    button: {
      width: '100%',
      minHeight: 56,
      backgroundColor: C.backgroundbutton || C.primary,
      paddingVertical: 16,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: C.primary,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.24 : 0.18,
      shadowRadius: 16,
      elevation: 5,
    },
    buttonDisabled: {
      opacity: 0.65,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '800',
    },
    backButton: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginTop: 4,
    },
    backText: {
      color: C.primaryLight || C.primary,
      fontSize: 15,
      fontWeight: '700',
    },
  });