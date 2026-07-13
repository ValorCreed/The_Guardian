import React, { useState } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';

export default function ResetPasswordScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const params = useLocalSearchParams<{ email?: string }>();
  const initialEmail = String(params.email || '').trim().toLowerCase();

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const validateForm = () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    if (!cleanEmail) {
      Alert.alert('Email required', 'Please enter your email address.');
      return false;
    }

    if (cleanCode.length !== 6) {
      Alert.alert('Invalid code', 'Please enter the 6-digit reset code.');
      return false;
    }

    if (newPassword.length < 8) {
      Alert.alert(
        'Password too short',
        'Your new password must be at least 8 characters.'
      );
      return false;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please confirm your new password.');
      return false;
    }

    return true;
  };

  const handleResetPassword = async () => {
    if (!validateForm()) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    try {
      setLoading(true);

      await api.resetPassword({
        email: cleanEmail,
        code: cleanCode,
        newPassword,
      });

      Alert.alert(
        'Password reset successful',
        'You can now sign in using your new password.',
        [
          {
            text: 'Go to sign in',
            onPress: () => router.replace('/signin'),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert(
        'Reset failed',
        error.message || 'Could not reset your password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert('Email required', 'Please enter your email address first.');
      return;
    }

    try {
      setResending(true);

      await api.forgotPassword({ email: cleanEmail });

      Alert.alert(
        'Reset code sent',
        'If this email belongs to a verified account, a new reset code has been sent.'
      );
    } catch (error: any) {
      Alert.alert(
        'Could not resend code',
        error.message || 'Please check your email and try again.'
      );
    } finally {
      setResending(false);
    }
  };

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
          <View style={styles.heroIcon}>
            <Ionicons name="key-outline" size={38} color="#FFFFFF" />
          </View>

          <Text style={styles.title}>Reset password</Text>

          <Text style={styles.subtitle}>
            Enter the reset code from your email, then choose a new password.
          </Text>

          <View style={styles.infoCard}>
            <View style={styles.infoIcon}>
              <Ionicons name="mail-outline" size={20} color={C.primary} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Check your inbox</Text>
              <Text style={styles.infoText}>
                The reset code expires after 15 minutes. Request a new code if
                it has expired.
              </Text>
            </View>
          </View>

          <Text style={styles.label}>Email address</Text>

          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={C.tabInactive}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            editable={!loading}
          />

          <Text style={styles.label}>Reset code</Text>

          <TextInput
            style={styles.codeInput}
            placeholder="000000"
            placeholderTextColor={C.tabInactive}
            value={code}
            onChangeText={(value) =>
              setCode(value.replace(/[^0-9]/g, '').slice(0, 6))
            }
            keyboardType="number-pad"
            maxLength={6}
            textAlign="center"
            editable={!loading}
          />

          <Text style={styles.label}>New password</Text>

          <View style={styles.passwordInputWrap}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter new password"
              placeholderTextColor={C.tabInactive}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showNewPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setShowNewPassword((current) => !current)}
              style={styles.eyeButton}
            >
              <Ionicons
                name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color={C.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirm password</Text>

          <View style={styles.passwordInputWrap}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Confirm new password"
              placeholderTextColor={C.tabInactive}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setShowConfirmPassword((current) => !current)}
              style={styles.eyeButton}
            >
              <Ionicons
                name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color={C.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.disabledButton]}
            activeOpacity={0.85}
            onPress={handleResetPassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Reset password</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, resending && styles.disabledButton]}
            activeOpacity={0.75}
            onPress={handleResendCode}
            disabled={resending || loading}
          >
            {resending ? (
              <View style={styles.resendRow}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={styles.secondaryButtonText}>Sending code...</Text>
              </View>
            ) : (
              <Text style={styles.secondaryButtonText}>Resend reset code</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.75}
            onPress={() => router.replace('/signin')}
            disabled={loading || resending}
          >
            <Text style={styles.backButtonText}>Back to sign in</Text>
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

    heroIcon: {
      width: 82,
      height: 82,
      borderRadius: 28,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
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
      marginBottom: 10,
      letterSpacing: -0.5,
    },

    subtitle: {
      fontSize: 15,
      color: C.textSecondary,
      lineHeight: 23,
      marginBottom: 22,
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
    },

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

    input: {
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      paddingHorizontal: 18,
      paddingVertical: 16,
      fontSize: 15,
      color: C.text,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 18,
    },

    codeInput: {
      height: 68,
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      paddingHorizontal: 18,
      fontSize: 28,
      fontWeight: '900',
      color: C.text,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 18,
      letterSpacing: 8,
    },

    passwordInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 18,
    },

    passwordInput: {
      flex: 1,
      paddingHorizontal: 18,
      paddingVertical: 16,
      fontSize: 15,
      color: C.text,
    },

    eyeButton: {
      width: 52,
      height: 54,
      alignItems: 'center',
      justifyContent: 'center',
    },

    submitButton: {
      backgroundColor: C.backgroundbutton,
      borderRadius: 999,
      minHeight: 58,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },

    disabledButton: {
      opacity: 0.65,
    },

    submitButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '900',
    },

    secondaryButton: {
      alignItems: 'center',
      paddingVertical: 18,
    },

    secondaryButtonText: {
      color: C.primary,
      fontSize: 15,
      fontWeight: '800',
    },

    resendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },

    backButton: {
      alignItems: 'center',
      paddingVertical: 8,
    },

    backButtonText: {
      color: C.textSecondary,
      fontSize: 14,
      fontWeight: '800',
    },
  });