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
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, saveLoginSession } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { useAppAlert } from '../context/AppAlertContext';

const AUTO_VERIFY_DELAY_MS = 260;

const getFriendlyVerificationError = (error: any, registrationMode: boolean) => {
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
    return 'That verification code is incorrect or has expired. Check the six digits or request a new code.';
  }

  if (
    lower.includes('network') ||
    lower.includes('connect') ||
    lower.includes('timeout') ||
    lower.includes('taking too long')
  ) {
    return message || 'We could not reach The Guardian. Check your connection and try again.';
  }

  return registrationMode
    ? 'We could not confirm this code, so your account has not been created yet. Please try again.'
    : 'We could not verify that code right now. Please try again.';
};

export default function VerifyEmailScreen() {
  const requestApi = useCancelableApi(api);
  const { showAlert } = useAppAlert();
  const { isDark, colors: C, resetThemeForNewAccount } = useAppTheme();
  const styles = makeStyles(C);

  const params = useLocalSearchParams<{
    email?: string;
    next?: string;
    autoSend?: string;
    mode?: string;
  }>();

  const email = String(params.email || '').trim().toLowerCase();
  const next = String(params.next || 'verification');
  const autoSend = String(params.autoSend || 'false') === 'true';
  const registrationMode = String(params.mode || '') === 'registration';

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [autoSent, setAutoSent] = useState(false);
  const [initialAutoSending, setInitialAutoSending] = useState(false);

  const codeInputRef = useRef<TextInput>(null);
  const lastAttemptedCodeRef = useRef('');
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (email && autoSend && !autoSent) {
      setAutoSent(true);
      handleResendCode(true);
    }
  }, [email, autoSend, autoSent]);

  const goNext = useCallback(() => {
    if (next === 'userinfo') {
      router.replace('/userinfo');
      return;
    }

    if (next === 'signin') {
      router.replace('/signin');
      return;
    }

    if (next === 'home') {
      router.replace('/home');
      return;
    }

    router.replace('/verification');
  }, [next]);

  const verifyCode = useCallback(
    async (rawCode: string, showIncompleteError = false) => {
      const cleanCode = rawCode.replace(/\D/g, '').slice(0, 6);

      if (!email) {
        showAlert({
          title: 'Email missing',
          message: 'We could not identify the email for this verification request. Please go back and try again.',
          type: 'error',
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
                onPress: () => codeInputRef.current?.focus(),
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

        if (registrationMode) {
          const account = await requestApi.verifyRegistration({
            email,
            code: cleanCode,
          });

          await saveLoginSession(account);
          await AsyncStorage.setItem('emailVerified', 'true');
          await resetThemeForNewAccount(email);
          goNext();
          return;
        }

        await requestApi.verifyEmail({
          email,
          code: cleanCode,
        });
        await AsyncStorage.setItem('emailVerified', 'true');
        goNext();
      } catch (error: any) {
        if (isScreenRequestCancelled(error)) return;

        setCode('');

        showAlert({
          title: 'Code not accepted',
          message: getFriendlyVerificationError(error, registrationMode),
          type: 'error',
          buttons: [
            {
              text: 'Try again',
              onPress: () => codeInputRef.current?.focus(),
            },
          ],
        });
      } finally {
        verifyingRef.current = false;
        setLoading(false);
      }
    },
    [
      email,
      goNext,
      loading,
      registrationMode,
      requestApi,
      resetThemeForNewAccount,
      showAlert,
    ]
  );

  useEffect(() => {
    const cleanCode = code.replace(/\D/g, '').slice(0, 6);

    if (
      cleanCode.length !== 6 ||
      loading ||
      sending ||
      lastAttemptedCodeRef.current === cleanCode
    ) {
      return;
    }

    const timer = setTimeout(() => {
      void verifyCode(cleanCode);
    }, AUTO_VERIFY_DELAY_MS);

    return () => clearTimeout(timer);
  }, [code, loading, sending, verifyCode]);

  const handleCodeChange = (value: string) => {
    const nextCode = value.replace(/[^0-9]/g, '').slice(0, 6);

    if (nextCode.length < 6) {
      lastAttemptedCodeRef.current = '';
    }

    setCode(nextCode);
  };

  const handleResendCode = async (silent = false) => {
    if (!email) {
      if (!silent) {
        showAlert({ title: 'Email missing', message: 'Go back and try again.', type: 'error' });
      }
      return;
    }

    try {
      setSending(true);
      if (silent) {
        setInitialAutoSending(true);
      }

      if (registrationMode) {
        await requestApi.resendRegistrationCode({ email });
      } else {
        await requestApi.resendVerification({ email });
      }

      if (!silent) {
        setCode('');
        lastAttemptedCodeRef.current = '';
        showAlert({
          title: 'Code sent',
          message: 'A new verification code has been sent to your email.',
          type: 'success',
          buttons: [
            {
              text: 'Enter code',
              onPress: () => codeInputRef.current?.focus(),
            },
          ],
        });
      }
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) return;
      if (!silent) {
        showAlert({
          title: 'Could not send code',
          message:
            error.message ||
            (registrationMode
              ? 'We could not send a new code. Your account has not been created.'
              : 'We could not send a verification code right now.'),
          type: 'error',
        });
      }
    } finally {
      setSending(false);
      if (silent) {
        setInitialAutoSending(false);
      }
    }
  };

  const renderVerifySkeleton = () => (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={C.background}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <PulsingSkeleton styles={styles} style={styles.skeletonIconBox} />
        <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
        <PulsingSkeleton styles={styles} style={styles.skeletonSubtitle} />

        <View style={styles.infoCard}>
          <PulsingSkeleton styles={styles} style={styles.skeletonInfoIcon} />
          <View style={{ flex: 1 }}>
            <PulsingSkeleton styles={styles} style={styles.skeletonInfoTitle} />
            <PulsingSkeleton styles={styles} style={styles.skeletonInfoText} />
          </View>
        </View>

        <PulsingSkeleton styles={styles} style={styles.skeletonLabel} />
        <PulsingSkeleton styles={styles} style={styles.skeletonCodeInput} />
        <PulsingSkeleton styles={styles} style={styles.skeletonPrimaryButton} />
        <PulsingSkeleton styles={styles} style={styles.skeletonLink} />
      </ScrollView>
    </SafeAreaView>
  );

  if (initialAutoSending) {
    return renderVerifySkeleton();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={C.background}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconBox}>
            <Ionicons name="mail-outline" size={44} color="#FFFFFF" />
          </View>

          <Text style={styles.title}>{registrationMode ? 'Confirm your email' : 'Verify your email'}</Text>

          <Text style={styles.subtitle}>
            Enter the 6-digit code sent to{' '}
            <Text style={styles.emailText}>{email || 'your email'}</Text>.
          </Text>

          <View style={styles.infoCard}>
            <View style={styles.infoIcon}>
              <Ionicons name="shield-checkmark-outline" size={20} color={C.primary} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Why verification matters</Text>
              <Text style={styles.infoText}>
                {registrationMode
                  ? 'Your account, subscription, device session, and vault access are created only after this code is confirmed.'
                  : 'Email verification protects sign-in, password reset, 2FA, and account recovery features.'}
              </Text>
            </View>
          </View>

          <Text style={styles.label}>Verification code</Text>

          <TextInput
            ref={codeInputRef}
            style={styles.codeInput}
            value={code}
            onChangeText={handleCodeChange}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            placeholder="000000"
            placeholderTextColor={C.tabInactive}
            maxLength={6}
            textAlign="center"
            editable={!loading && !sending}
            autoFocus
          />

          <Text style={styles.autoVerifyText}>
            {loading
              ? 'Checking your code…'
              : ''}
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabledButton]}
            activeOpacity={0.85}
            onPress={() => void verifyCode(code, true)}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Verify Email</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.linkButton, sending && styles.disabledButton]}
            activeOpacity={0.75}
            onPress={() => handleResendCode(false)}
            disabled={sending}
          >
            {sending ? (
              <View style={styles.resendRow}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={styles.linkText}>Sending code...</Text>
              </View>
            ) : (
              <Text style={styles.linkText}>Resend code</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.75}
            onPress={() => {
              if (registrationMode) {
                router.replace('/signup');
                return;
              }

              if (next === 'userinfo') {
                router.replace('/userinfo');
                return;
              }

              router.replace('/signin');
            }}
            disabled={loading || sending}
          >
            <Text style={styles.secondaryButtonText}>
              {registrationMode
                ? 'Use another email'
                : next === 'userinfo'
                  ? 'Back to account'
                  : 'Back to sign in'}
            </Text>
          </TouchableOpacity>
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

    flex: {
      flex: 1,
    },

    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 118,
      paddingBottom: 44,
    },

    iconBox: {
      width: 96,
      height: 96,
      borderRadius: 30,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 28,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.10,
      shadowRadius: 20,
      elevation: 3,
    },

    title: {
      fontSize: 34,
      fontWeight: '900',
      color: C.text,
      textAlign: 'center',
      marginBottom: 12,
      letterSpacing: -0.5,
    },

    subtitle: {
      fontSize: 15,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: 23,
      marginBottom: 22,
    },

    emailText: {
      color: C.text,
      fontWeight: '900',
    },

    infoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      marginBottom: 24,
    
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    infoIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },

    infoTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: C.text,
      marginBottom: 3,
    },

    infoText: {
      fontSize: 13,
      color: C.textSecondary,
      lineHeight: 19,
    },

    label: {
      fontSize: 14,
      color: C.text,
      fontWeight: '800',
      marginBottom: 8,
      marginLeft: 4,
    },

    codeInput: {
      height: 72,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.backgroundElement,
      color: C.text,
      fontSize: 30,
      fontWeight: '900',
      letterSpacing: 10,
      marginBottom: 0,
    },

    autoVerifyText: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
      marginTop: 10,
      marginBottom: 14,
    },

    primaryButton: {
      minHeight: 60,
      borderRadius: 999,
      backgroundColor: C.backgroundbutton,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
      marginBottom: 14,
    
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    disabledButton: {
      opacity: 0.65,
    },

    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
    
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    skeletonIconBox: {
      width: 96,
      height: 96,
      borderRadius: 30,
      alignSelf: 'center',
      marginBottom: 28,
    },

    skeletonTitle: {
      width: '72%',
      height: 34,
      alignSelf: 'center',
      marginBottom: 12,
    },

    skeletonSubtitle: {
      width: '92%',
      height: 15,
      alignSelf: 'center',
      marginBottom: 22,
    },

    skeletonInfoIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      marginRight: 14,
    },

    skeletonInfoTitle: {
      width: '58%',
      height: 14,
      marginBottom: 9,
    },

    skeletonInfoText: {
      width: '92%',
      height: 12,
    },

    skeletonLabel: {
      width: 130,
      height: 13,
      marginLeft: 4,
      marginBottom: 8,
    },

    skeletonCodeInput: {
      height: 72,
      borderRadius: 24,
      marginBottom: 18,
    },

    skeletonPrimaryButton: {
      minHeight: 60,
      borderRadius: 999,
      marginTop: 4,
      marginBottom: 14,
    },

    skeletonLink: {
      width: 116,
      height: 15,
      alignSelf: 'center',
      marginTop: 12,
    },

    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '900',
    },

    linkButton: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
    },

    resendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },

    linkText: {
      color: C.primary,
      fontSize: 15,
      fontWeight: '900',
    },

    secondaryButton: {
      alignItems: 'center',
      paddingVertical: 12,
    },

    secondaryButtonText: {
      color: C.textSecondary,
      fontSize: 14,
      fontWeight: '800',
    },
  });