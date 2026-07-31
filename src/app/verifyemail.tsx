import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { api } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';

export default function VerifyEmailScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const params = useLocalSearchParams<{
    email?: string;
    next?: string;
    autoSend?: string;
  }>();

  const email = String(params.email || '').trim().toLowerCase();
  const next = String(params.next || 'verification');
  const autoSend = String(params.autoSend || 'false') === 'true';

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [autoSent, setAutoSent] = useState(false);
  const [initialAutoSending, setInitialAutoSending] = useState(false);

  useEffect(() => {
    if (email && autoSend && !autoSent) {
      setAutoSent(true);
      handleResendCode(true);
    }
  }, [email, autoSend, autoSent]);

  const goNext = () => {
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
  };

  const handleVerify = async () => {
    const cleanCode = code.trim();

    if (!email) {
      Alert.alert('Missing email', 'Go back and try again.');
      return;
    }

    if (cleanCode.length !== 6) {
      Alert.alert('Invalid code', 'Enter the 6-digit verification code.');
      return;
    }

    try {
      setLoading(true);

      await api.verifyEmail({
        email,
        code: cleanCode,
      });

      Alert.alert('Email verified', 'Your email has been verified successfully.', [
        {
          text: 'Continue',
          onPress: goNext,
        },
      ]);
    } catch (error: any) {
      Alert.alert(
        'Verification failed',
        error.message || 'Could not verify your email.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async (silent = false) => {
    if (!email) {
      if (!silent) {
        Alert.alert('Missing email', 'Go back and try again.');
      }
      return;
    }

    try {
      setSending(true);
      if (silent) {
        setInitialAutoSending(true);
      }

      await api.resendVerification({ email });

      if (!silent) {
        Alert.alert(
          'Code sent',
          'A new verification code has been sent to your email.'
        );
      }
    } catch (error: any) {
      if (!silent) {
        Alert.alert(
          'Could not send code',
          'We could not send a verification code right now. You can still use the app, but your account is safer after email verification. You can try again later from User Information.',
          [
            { text: 'Stay here', style: 'cancel' },
            {
              text: next === 'userinfo' ? 'Back to account' : 'Continue',
              onPress: goNext,
            },
          ]
        );
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconBox}>
            <Ionicons name="mail-outline" size={44} color="#FFFFFF" />
          </View>

          <Text style={styles.title}>Verify your email</Text>

          <Text style={styles.subtitle}>
            Enter the 6-digit code sent to{' '}
            <Text style={styles.emailText}>{email || 'your email'}</Text>. If sending fails, you can still continue and verify later from User Information.
          </Text>

          <View style={styles.infoCard}>
            <View style={styles.infoIcon}>
              <Ionicons name="shield-checkmark-outline" size={20} color={C.primary} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Why verification matters</Text>
              <Text style={styles.infoText}>
                Email verification protects password reset, 2FA, and account
                recovery features.
              </Text>
            </View>
          </View>

          <Text style={styles.label}>Verification code</Text>

          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(value) =>
              setCode(value.replace(/[^0-9]/g, '').slice(0, 6))
            }
            keyboardType="number-pad"
            placeholder="000000"
            placeholderTextColor={C.tabInactive}
            maxLength={6}
            textAlign="center"
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabledButton]}
            activeOpacity={0.85}
            onPress={handleVerify}
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
            onPress={goNext}
            disabled={loading || sending}
          >
            <Text style={styles.secondaryButtonText}>{next === 'userinfo' ? 'Back to account' : 'Continue without verifying now'}</Text>
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
      shadowOpacity: 0.18,
      shadowRadius: 20,
      elevation: 6,
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
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

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
      marginBottom: 18,
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
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

    disabledButton: {
      opacity: 0.65,
    },

    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

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