import React, { useMemo, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';
import { api, RecoveryCirclePublicStatus } from '../services/api';
import {
  isScreenRequestCancelled,
  useCancelableApi,
} from '../hooks/useCancelableApi';
import { hapticLight, hapticSuccess, hapticWarning } from '../utils/haptics';
import {
  getSecureClipboardMessage,
  setSecureClipboard,
} from '../utils/secureClipboard';
import { useScreenAlert } from '../hooks/useScreenAlert';

const formatDate = (value?: string | null) => {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function CircleRecoveryScreen() {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const params = useLocalSearchParams<{ email?: string }>();
  const { isDark, colors: C } = useAppTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  useSensitiveScreenProtection(true);

  const [email, setEmail] = useState(String(params.email || ''));
  const [requestId, setRequestId] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [status, setStatus] = useState<RecoveryCirclePublicStatus | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRecoveryCode, setShowRecoveryCode] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [starting, setStarting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [completing, setCompleting] = useState(false);

  const cleanRequestId = requestId.trim().toUpperCase();
  const cleanCode = recoveryCode.trim();

  const startRecovery = async () => {
    if (!email.trim()) {
      screenAlert('Email required', 'Enter the email address for the account you are recovering.');
      return;
    }
    if (!cleanCode) {
      screenAlert(
        'Recovery code required',
        'Enter the secret code that Guardian showed when Recovery Circle was configured.'
      );
      return;
    }

    try {
      setStarting(true);
      const response = await requestApi.startRecoveryCircle({
        email,
        recoveryCode: cleanCode,
      });
      setRequestId(response.requestId);
      setStatus({
        status: 'PENDING',
        approvalCount: 0,
        threshold: response.threshold,
        expiresAt: response.expiresAt,
        canComplete: false,
        message: response.message,
      });
      hapticSuccess();
      screenAlert(
        'Recovery request started',
        'Save the request ID and keep the recovery code private.'
      );
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) return;
      hapticWarning();
      screenAlert('Could not start recovery', error?.message || 'Please try again.');
    } finally {
      setStarting(false);
    }
  };

  const checkStatus = async () => {
    if (!cleanRequestId || !cleanCode) {
      screenAlert('Recovery details required', 'Enter your request ID and recovery code.');
      return;
    }

    try {
      setChecking(true);
      const response = await requestApi.getRecoveryCircleStatus({
        requestId: cleanRequestId,
        recoveryCode: cleanCode,
      });
      setStatus(response);
      if (response.canComplete) hapticSuccess();
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) return;
      hapticWarning();
      screenAlert('Could not check status', error?.message || 'Verify your recovery details.');
    } finally {
      setChecking(false);
    }
  };

  const completeRecovery = async () => {
    if (newPassword.length < 8) {
      screenAlert('Password too short', 'Your new password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      screenAlert('Passwords do not match', 'Confirm your new password and try again.');
      return;
    }

    try {
      setCompleting(true);
      const response = await requestApi.completeRecoveryCircle({
        requestId: cleanRequestId,
        recoveryCode: cleanCode,
        newPassword,
      });
      hapticSuccess();
      screenAlert('Account recovered', response.message, [
        { text: 'Go to sign in', onPress: () => router.replace('/signin') },
      ]);
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) return;
      hapticWarning();
      screenAlert('Could not complete recovery', error?.message || 'Please try again.');
    } finally {
      setCompleting(false);
    }
  };

  const copyDetails = async () => {
    if (!cleanRequestId || !cleanCode) return;
    await setSecureClipboard(
      `Guardian Recovery Circle\nRequest ID: ${cleanRequestId}\nRecovery code: ${cleanCode}`
    );
    hapticLight();
    screenAlert(
      'Copied',
      `${getSecureClipboardMessage('Recovery details')} Store them privately.`
    );
  };

  const statusColor = status?.status === 'APPROVED'
    ? C.success
    : status?.status === 'PENDING'
      ? C.warning
      : C.danger;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={C.background}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroIcon}>
            <Ionicons name="people-circle-outline" size={38} color="#fff" />
          </View>
          <Text style={styles.title}>Recovery Circle</Text>
          <Text style={styles.subtitle}>
            Recover your account after trusted contacts confirm your identity.
          </Text>

          <View style={styles.securityCard}>
            <Ionicons name="shield-checkmark-outline" size={22} color={C.primary} />
            <Text style={styles.securityText}>
              Your saved recovery code is required to start a request.
            </Text>
          </View>

          <View style={styles.cardShell}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>1. Start or resume recovery</Text>
              <Text style={styles.label}>Account email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={C.tabInactive}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!starting}
              />
              <SecretField
                label="Recovery code"
                value={recoveryCode}
                onChangeText={setRecoveryCode}
                visible={showRecoveryCode}
                onToggle={() => setShowRecoveryCode((value) => !value)}
                placeholder="XXXX-XXXX-..."
                C={C}
                styles={styles}
                editable={!starting}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={[styles.primaryButton, starting && styles.disabled]}
                disabled={starting}
                onPress={startRecovery}
              >
                {starting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="play-outline" size={20} color="#fff" />
                )}
                <Text style={styles.primaryButtonText}>
                  {starting ? 'Starting...' : 'Start new request'}
                </Text>
              </TouchableOpacity>

              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR RESUME</Text>
                <View style={styles.orLine} />
              </View>

              <Text style={styles.label}>Request ID</Text>
              <TextInput
                style={styles.input}
                placeholder="RC-..."
                placeholderTextColor={C.tabInactive}
                value={requestId}
                onChangeText={setRequestId}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.secondaryButton} onPress={copyDetails}>
                  <Ionicons name="copy-outline" size={18} color={C.primary} />
                  <Text style={styles.secondaryText}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  disabled={checking}
                  onPress={checkStatus}
                >
                  {checking ? (
                    <ActivityIndicator color={C.primary} />
                  ) : (
                    <Ionicons name="refresh-outline" size={18} color={C.primary} />
                  )}
                  <Text style={styles.secondaryText}>Check status</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {status && (
            <View style={styles.cardShell}>
              <View style={styles.statusCard}>
                <View style={styles.statusHeader}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={styles.statusTitle}>{status.status}</Text>
                </View>
                <Text style={styles.statusMessage}>{status.message}</Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(100, (status.approvalCount / Math.max(1, status.threshold)) * 100)}%`,
                        backgroundColor: statusColor,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressLabel}>
                  {status.approvalCount} of {status.threshold} approvals · expires {formatDate(status.expiresAt)}
                </Text>
              </View>
            </View>
          )}

          {status?.canComplete && (
            <View style={styles.cardShell}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>2. Set a new password</Text>
                <Text style={styles.approvedText}>
                  Your trusted contacts reached the required threshold.
                </Text>
                <SecretField
                  label="New master password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  visible={showNewPassword}
                  onToggle={() => setShowNewPassword((value) => !value)}
                  placeholder="At least 8 characters"
                  C={C}
                  styles={styles}
                />
                <SecretField
                  label="Confirm password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((value) => !value)}
                  placeholder="Repeat new password"
                  C={C}
                  styles={styles}
                />
                <TouchableOpacity
                  style={[styles.primaryButton, completing && styles.disabled]}
                  disabled={completing}
                  onPress={completeRecovery}
                >
                  {completing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Ionicons name="key-outline" size={20} color="#fff" />
                  )}
                  <Text style={styles.primaryButtonText}>
                    {completing ? 'Resetting...' : 'Reset password securely'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={styles.footer}>
            Keep the recovery code private. Circle members only need the request shown in Guardian.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SecretField({
  label,
  value,
  onChangeText,
  visible,
  onToggle,
  placeholder,
  C,
  styles,
  editable = true,
  autoCapitalize = 'none',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  placeholder: string;
  C: any;
  styles: any;
  editable?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordWrap}>
        <TextInput
          style={styles.passwordInput}
          placeholder={placeholder}
          placeholderTextColor={C.tabInactive}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          editable={editable}
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
        >
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={22}
            color={C.textSecondary}
          />
        </TouchableOpacity>
      </View>
    </>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    content: { paddingHorizontal: 20, paddingTop: 96, paddingBottom: 140 },
    heroIcon: { width: 82, height: 82, borderRadius: 28, backgroundColor: C.backgroundbutton, alignItems: 'center', justifyContent: 'center', marginBottom: 22, shadowColor: C.primary, shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 9 }, elevation: 6 },
    title: { color: C.text, fontSize: 34, fontWeight: '900', letterSpacing: -0.7 },
    subtitle: { color: C.textSecondary, fontSize: 14, lineHeight: 22, marginTop: 8, marginBottom: 18 },
    securityCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderRadius: 20, padding: 15, marginBottom: 18, backgroundColor: C.actionCard, borderWidth: 1, borderColor: `${C.primary}35`, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
    securityText: { flex: 1, color: C.text, fontSize: 12, lineHeight: 19, fontWeight: '700' },
    cardShell: { borderRadius: 24, marginBottom: 17, shadowColor: '#000', shadowOpacity: 0.09, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 5 },
    card: { borderRadius: 24, padding: 17, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border },
    sectionTitle: { color: C.text, fontSize: 18, fontWeight: '900', marginBottom: 16 },
    label: { color: C.text, fontSize: 13, fontWeight: '900', marginBottom: 8, marginLeft: 3 },
    input: { color: C.text, backgroundColor: C.background, borderRadius: 17, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 14, fontSize: 14 },
    primaryButton: { minHeight: 54, borderRadius: 999, backgroundColor: C.backgroundbutton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, shadowColor: C.primary, shadowOpacity: 0.18, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
    primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
    disabled: { opacity: 0.55 },
    orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 },
    orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.border },
    orText: { color: C.textSecondary, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
    actionRow: { flexDirection: 'row', gap: 10 },
    secondaryButton: { flex: 1, minHeight: 48, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: C.actionCard, borderWidth: 1, borderColor: C.border },
    secondaryText: { color: C.primary, fontSize: 12, fontWeight: '900' },
    statusCard: { borderRadius: 24, padding: 17, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border },
    statusHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    statusTitle: { color: C.text, fontSize: 16, fontWeight: '900' },
    statusMessage: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 10 },
    progressTrack: { height: 8, borderRadius: 4, backgroundColor: C.backgroundSelected, overflow: 'hidden', marginTop: 15 },
    progressFill: { height: '100%', borderRadius: 4 },
    progressLabel: { color: C.textSecondary, fontSize: 11, fontWeight: '700', marginTop: 9 },
    approvedText: { color: C.success, fontSize: 12, lineHeight: 18, fontWeight: '800', marginBottom: 14 },
    passwordWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.background, borderRadius: 17, borderWidth: 1, borderColor: C.border, marginBottom: 14 },
    passwordInput: { flex: 1, color: C.text, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15 },
    eyeButton: { width: 50, height: 52, alignItems: 'center', justifyContent: 'center' },
    footer: { color: C.textSecondary, fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 13, marginTop: 4 },
  });