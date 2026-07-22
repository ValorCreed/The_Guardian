import React, { useMemo, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import GuardianLogoTile from '../components/GuardianLogoTitle';

type RecoveryMode = 'kit' | 'erase';

export default function AccountRecoveryScreen() {
  const params = useLocalSearchParams<{ mode?: string; email?: string }>();
  const initialMode: RecoveryMode = params.mode === 'erase' ? 'erase' : 'kit';

  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [mode, setMode] = useState<RecoveryMode>(initialMode);
  const [email, setEmail] = useState(String(params.email || ''));
  const [recoveryId, setRecoveryId] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

  const cleanEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  const validatePassword = () => {
    if (newPassword.length < 8) {
      Alert.alert('Password too short', 'Your new password must be at least 8 characters.');
      return false;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please confirm your new password.');
      return false;
    }

    return true;
  };

  const sendResetCode = async () => {
    if (!cleanEmail) {
      Alert.alert('Email required', 'Enter your email address first.');
      return;
    }

    try {
      setSendingCode(true);
      await api.forgotPassword({ email: cleanEmail });
      Alert.alert(
        'Account reset code sent',
        'If this email belongs to a verified account, an account reset code has been sent. This code is only for Reset & Erase.'
      );
    } catch (error: any) {
      Alert.alert('Could not send reset code', error.message || 'Please try again.');
    } finally {
      setSendingCode(false);
    }
  };

  const resetWithRecoveryKit = async () => {
    const cleanRecoveryId = recoveryId.trim().toUpperCase();
    const cleanRecoveryKey = recoveryKey.trim();

    if (!cleanRecoveryId || !cleanRecoveryKey) {
      Alert.alert('Missing recovery kit', 'Enter your recovery ID and recovery key.');
      return;
    }

    if (!validatePassword()) return;

    try {
      setLoading(true);

      await api.recoverWithRecoveryKit({
        recoveryId: cleanRecoveryId,
        recoveryKey: cleanRecoveryKey,
        newPassword,
      });

      Alert.alert(
        'Password reset successful',
        'Your recovery kit has been used and is now disabled. Sign in and generate a new recovery kit.',
        [{ text: 'Go to sign in', onPress: () => router.replace('/signin') }]
      );
    } catch (error: any) {
      Alert.alert('Recovery failed', error.message || 'The recovery kit details are invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  const confirmEraseReset = () => {
    if (!cleanEmail || !resetCode.trim()) {
      Alert.alert('Missing details', 'Enter your email and account reset code.');
      return;
    }

    if (!validatePassword()) return;

    Alert.alert(
      'Erase vault and reset account?',
      'Without your password or recovery kit, The Guardian cannot decrypt your existing vault. This will permanently delete your saved passwords, cards, documents, and secure notes, then reset your account password.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase vault',
          style: 'destructive',
          onPress: resetAccountAndEraseVault,
        },
      ]
    );
  };

  const resetAccountAndEraseVault = async () => {
    try {
      setLoading(true);

      await api.resetAccountAndEraseVault({
        email: cleanEmail,
        resetCode: resetCode.trim(),
        newPassword,
      });

      Alert.alert(
        'Account reset successful',
        'Your password has been reset and your old vault data has been erased. Sign in to start with a fresh vault and generate a recovery kit.',
        [{ text: 'Go to sign in', onPress: () => router.replace('/signin') }]
      );
    } catch (error: any) {
      Alert.alert('Account reset failed', error.message || 'The reset code is invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  const renderPasswordFields = () => (
    <>
      <Text style={styles.label}>New master password</Text>
      <View style={styles.passwordWrap}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Enter new password"
          placeholderTextColor={C.tabInactive}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="next"
        />
        <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword((current) => !current)}>
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={C.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Confirm master password</Text>
      <TextInput
        style={styles.input}
        placeholder="Confirm new password"
        placeholderTextColor={C.tabInactive}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!loading}
        textContentType="newPassword"
        autoComplete="new-password"
        returnKeyType="done"
      />
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

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
          <GuardianLogoTile size={62} logoSize={50} radius={18} style={styles.logoBox} />

          <Text style={styles.title}>Account recovery</Text>
          <Text style={styles.subtitle}>
            {mode === 'kit'
              ? 'Use your Recovery ID and Recovery Key to reset your password without erasing your vault.'
              : 'No recovery kit? Reset the account by email code, but the old vault must be erased.'}
          </Text>

          <View style={styles.modeSwitch}>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'kit' && styles.modeButtonActive]}
              onPress={() => setMode('kit')}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Ionicons name="key-outline" size={16} color={mode === 'kit' ? '#FFFFFF' : C.primary} />
              <Text style={[styles.modeButtonText, mode === 'kit' && styles.modeButtonTextActive]}>Recovery Kit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeButton, mode === 'erase' && styles.modeButtonDangerActive]}
              onPress={() => setMode('erase')}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={16} color={mode === 'erase' ? '#FFFFFF' : C.danger} />
              <Text style={[styles.modeButtonText, mode === 'erase' && styles.modeButtonTextActive]}>Reset & Erase</Text>
            </TouchableOpacity>
          </View>

          {mode === 'kit' ? (
            <View style={styles.infoCard}>
              <Ionicons name="shield-checkmark-outline" size={22} color={C.primary} />
              <Text style={styles.infoText}>
                Recovery Kit reset does not need your email. The Recovery ID identifies the account, and the Recovery Key proves ownership.
              </Text>
            </View>
          ) : (
            <View style={styles.dangerCard}>
              <Ionicons name="alert-circle-outline" size={22} color={C.danger} />
              <Text style={styles.dangerText}>
                Email recovery is only for Reset & Erase. It cannot keep your old passwords, cards, documents, or notes.
              </Text>
            </View>
          )}

          <View style={styles.formCard}>
            {mode === 'kit' ? (
              <>
                <Text style={styles.label}>Recovery ID</Text>
                <TextInput
                  style={styles.input}
                  placeholder="RK-XXXXXXXXXXXXXXXX"
                  placeholderTextColor={C.tabInactive}
                  value={recoveryId}
                  onChangeText={(value) => setRecoveryId(value.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!loading}
                  returnKeyType="next"
                />

                <Text style={styles.label}>Recovery key</Text>
                <TextInput
                  style={styles.input}
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                  placeholderTextColor={C.tabInactive}
                  value={recoveryKey}
                  onChangeText={(value) => setRecoveryKey(value.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!loading}
                  returnKeyType="next"
                />

                {renderPasswordFields()}

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.disabled]}
                  onPress={resetWithRecoveryKit}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Reset with Recovery Kit</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
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
                  textContentType="username"
                  autoComplete="email"
                  returnKeyType="next"
                />

                <TouchableOpacity
                  style={[styles.secondaryAction, sendingCode && styles.disabled]}
                  onPress={sendResetCode}
                  disabled={sendingCode || loading}
                  activeOpacity={0.8}
                >
                  {sendingCode ? (
                    <ActivityIndicator color={C.primary} />
                  ) : (
                    <>
                      <Ionicons name="mail-outline" size={18} color={C.primary} />
                      <Text style={styles.secondaryActionText}>Send account reset code</Text>
                    </>
                  )}
                </TouchableOpacity>

                <Text style={styles.label}>Account reset code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="6-digit code"
                  placeholderTextColor={C.tabInactive}
                  value={resetCode}
                  onChangeText={setResetCode}
                  keyboardType="number-pad"
                  editable={!loading}
                  returnKeyType="next"
                />

                {renderPasswordFields()}

                <TouchableOpacity
                  style={[styles.dangerButton, loading && styles.disabled]}
                  onPress={confirmEraseReset}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Reset account and erase vault</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>

          <TouchableOpacity style={styles.backLink} onPress={() => router.replace('/signin')} disabled={loading}>
            <Text style={styles.backLinkText}>Back to sign in</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    flex: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 108,
      paddingBottom: 180,
    },
    logoBox: { marginBottom: 20 },
    title: { fontSize: 32, fontWeight: '900', color: C.text, marginBottom: 8, letterSpacing: -0.4 },
    subtitle: { fontSize: 14, color: C.textSecondary, lineHeight: 21, marginBottom: 20 },
    modeSwitch: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    modeButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    modeButtonActive: { backgroundColor: C.primary, borderColor: C.primary ,
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    modeButtonDangerActive: { backgroundColor: C.danger, borderColor: C.danger ,
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    modeButtonText: { color: C.text, fontSize: 13, fontWeight: '900' },
    modeButtonTextActive: { color: '#FFFFFF' },
    infoCard: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      padding: 15,
      marginBottom: 16,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    infoText: { flex: 1, color: C.textSecondary, fontSize: 13, lineHeight: 20, fontWeight: '700' },
    dangerCard: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: C.securityScoreBg || C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.danger,
      padding: 15,
      marginBottom: 16,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    dangerText: { flex: 1, color: C.danger, fontSize: 13, lineHeight: 20, fontWeight: '800' },
    formCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    label: { fontSize: 13, color: C.text, fontWeight: '800', marginBottom: 8, marginLeft: 4 },
    input: {
      backgroundColor: C.background,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 15,
      fontSize: 15,
      color: C.text,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: C.border,
    },
    passwordWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.background,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 16,
    },
    passwordInput: { flex: 1, color: C.text, paddingHorizontal: 16, paddingVertical: 15, fontSize: 15 },
    eyeButton: { width: 52, height: 54, alignItems: 'center', justifyContent: 'center' },
    primaryButton: {
      minHeight: 56,
      borderRadius: 999,
      backgroundColor: C.backgroundbutton || C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    dangerButton: {
      minHeight: 56,
      borderRadius: 999,
      backgroundColor: C.danger,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
    secondaryAction: {
      minHeight: 50,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.background,
      marginBottom: 16,
    },
    secondaryActionText: { color: C.primary, fontSize: 14, fontWeight: '900' },
    disabled: { opacity: 0.65 },
    backLink: { alignItems: 'center', paddingVertical: 18 },
    backLinkText: { color: C.textSecondary, fontSize: 14, fontWeight: '800' },
  });
