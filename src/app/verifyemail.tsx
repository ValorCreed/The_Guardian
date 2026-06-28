import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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

export default function VerifyEmailScreen() {
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);
  const params = useLocalSearchParams<{ email?: string; next?: string; autoSend?: string }>();

  const email = String(params.email || '').trim().toLowerCase();
  const next = String(params.next || 'signin');
  const autoSend = String(params.autoSend || 'false') === 'true';

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [autoSent, setAutoSent] = useState(false);

  useEffect(() => {
    if (email && autoSend && !autoSent) {
      setAutoSent(true);
      handleResendCode(true);
    }
  }, [email, autoSend, autoSent]);

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
      await api.verifyEmail({ email, code: cleanCode });

      Alert.alert('Email verified', 'Your email has been verified successfully.', [
        {
          text: 'Continue',
          onPress: () => {
            if (next === 'userinfo') router.replace('/userinfo');
            else router.replace('/verification');
          },
        },
      ]);
    } catch (error: any) {
      Alert.alert('Verification failed', error.message || 'Could not verify your email.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async (silent = false) => {
    if (!email) {
      if (!silent) Alert.alert('Missing email', 'Go back and try again.');
      return;
    }

    try {
      setSending(true);
      await api.resendVerification({ email });
      if (!silent) Alert.alert('Code sent', 'A new verification code has been sent to your email.');
    } catch (error: any) {
      Alert.alert('Could not send code', error.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.iconBox}>
            <Ionicons name="mail-outline" size={48} color="#FFFFFF" />
          </View>

          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code sent to {email || 'your email'}. Email verification is required before password reset and 2FA can be used.
          </Text>

          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(value) => setCode(value.replace(/[^0-9]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            placeholder="000000"
            placeholderTextColor={C.tabInactive}
            maxLength={6}
            textAlign="center"
          />

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabledButton]}
            onPress={handleVerify}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Verify Email</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => handleResendCode(false)}
            disabled={sending}
          >
            <Text style={styles.linkText}>{sending ? 'Sending...' : 'Resend code'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    flex: { flex: 1 },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 24,
      paddingTop: 10,
    },
    backText: { color: C.text, fontSize: 18 },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingBottom: 80,
    },
    iconBox: {
      width: 104,
      height: 104,
      borderRadius: 28,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 32,
    },
    title: {
      fontSize: 36,
      fontWeight: '800',
      color: C.text,
      textAlign: 'center',
      marginBottom: 14,
    },
    subtitle: {
      fontSize: 16,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 32,
    },
    codeInput: {
      height: 72,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.backgroundElement,
      color: C.text,
      fontSize: 32,
      fontWeight: '700',
      letterSpacing: 12,
      marginBottom: 24,
    },
    primaryButton: {
      height: 64,
      borderRadius: 32,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    disabledButton: { opacity: 0.6 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
    linkButton: { alignItems: 'center', paddingVertical: 12 },
    linkText: { color: C.primary, fontSize: 17, fontWeight: '700' },
  });
