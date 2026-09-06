import React, { useCallback, useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../context/ThemeContext';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';
import { hapticLight, hapticMedium, hapticWarning, hapticDelete } from '../utils/haptics';
import { api, RecoveryKitResponse, RecoveryKitStatusResponse } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import { useScreenAlert } from '../hooks/useScreenAlert';

const formatDate = (value?: string | null) => {
  if (!value) return 'Not created yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString();
};

export default function RecoveryKitScreen() {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  useSensitiveScreenProtection(true);

  const [status, setStatus] = useState<RecoveryKitStatusResponse | null>(null);
  const [generatedKit, setGeneratedKit] = useState<RecoveryKitResponse | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await requestApi.getRecoveryKitStatus();
      setStatus(data);
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      screenAlert('Could not load recovery kit', error.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [requestApi, screenAlert]);

  useFocusEffect(
    useCallback(() => {
      loadStatus();
    }, [loadStatus])
  );

  const buildRecoveryText = async (kit: RecoveryKitResponse) => {
    const email = await AsyncStorage.getItem('userEmail');
    const name = await AsyncStorage.getItem('userName');

    return [
      'THE GUARDIAN RECOVERY KIT',
      '==========================',
      '',
      `Name: ${name || 'User'}`,
      `Email: ${email || 'Not available'}`,
      `Recovery ID: ${kit.recoveryId}`,
      `Recovery Key: ${kit.recoveryKey}`,
      `Generated: ${formatDate(kit.createdAt)}`,
      '',
      'IMPORTANT:',
      '- Keep this recovery kit offline and private.',
      '- Do not store it inside The Guardian vault only.',
      '- Anyone with this recovery ID and key could reset your account password.',
      '- This key is shown once. If you lose it, generate a new recovery kit from Settings.',
      '',
      'Your Life. Protected.',
    ].join('\n');
  };

  const copyRecoveryKit = async () => {
    if (!generatedKit) return;
    const text = await buildRecoveryText(generatedKit);
    await Clipboard.setStringAsync(text);
    screenAlert('Copied', 'Recovery kit copied to clipboard. Store it somewhere safe and remove it from clipboard when done.');
  };

  const saveRecoveryKit = async () => {
    if (!generatedKit) return;

    try {
      const text = await buildRecoveryText(generatedKit);
      const fileName = `TheGuardian-RecoveryKit-${generatedKit.recoveryId}.txt`;
      const uri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(uri, text);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'text/plain',
          dialogTitle: 'Save The Guardian Recovery Kit',
        });
      } else {
        screenAlert('Recovery kit saved', `Saved inside app documents as ${fileName}`);
      }
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      screenAlert('Could not save', error.message || 'Please copy the recovery kit instead.');
    }
  };

  const generateKit = async () => {
    if (!password) {
      screenAlert('Password required', 'Enter your account password to generate a recovery kit.');
      return;
    }

    screenAlert(
      status?.created ? 'Replace recovery kit?' : 'Generate recovery kit?',
      status?.created
        ? 'Your old recovery kit will stop working. The new recovery key will be shown once.'
        : 'Your recovery key will be shown once. Save it somewhere safe.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status?.created ? 'Replace' : 'Generate',
          onPress: async () => {
            try {
              setGenerating(true);
              const kit = await requestApi.generateRecoveryKit({ password });
              setGeneratedKit(kit);
              setPassword('');
              await loadStatus();
            } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
              screenAlert('Could not generate recovery kit', error.message || 'Please check your password and try again.');
            } finally {
              setGenerating(false);
            }
          },
        },
      ]
    );
  };

  const revokeKit = () => {
    if (!status?.created || revoking) return;

    screenAlert(
      'Revoke recovery kit?',
      'Your current recovery kit will stop working. You can generate a new one later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              setRevoking(true);
              await requestApi.revokeRecoveryKit();
              setGeneratedKit(null);
              await loadStatus();
              screenAlert('Recovery kit revoked', 'Your recovery kit is no longer active.');
            } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
              screenAlert('Could not revoke', error.message || 'Please try again.');
            } finally {
              setRevoking(false);
            }
          },
        },
      ]
    );
  };

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
          <View style={styles.heroIcon}>
            <Ionicons name="key-outline" size={36} color="#FFFFFF" />
          </View>

          <Text style={styles.title}>Recovery kit</Text>
          <Text style={styles.subtitle}>
            Create an offline key for account recovery.
          </Text>

          {loading ? (
            <View style={styles.card}>
              <ActivityIndicator color={C.primary} />
              <Text style={styles.loadingText}>Loading recovery status...</Text>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: status?.created ? C.success : C.warning }]} />
                <Text style={styles.statusTitle}>{status?.created ? 'Recovery kit active' : 'No recovery kit yet'}</Text>
              </View>

              <Text style={styles.statusText}>
                {status?.created
                  ? `Recovery ID: ${status.recoveryId}\nCreated: ${formatDate(status.createdAt)}`
                  : 'Create a recovery kit and store it somewhere outside this app.'}
              </Text>
            </View>
          )}

          {generatedKit && (
            <View style={styles.generatedCard}>
              <View style={styles.warningHeader}>
                <Ionicons name="warning-outline" size={20} color={C.warning} />
                <Text style={styles.warningTitle}>Save this now</Text>
              </View>

              <Text style={styles.warningText}>This recovery key will not be shown again.</Text>

              <Text style={styles.fieldLabel}>Recovery ID</Text>
              <Text selectable style={styles.secretBox}>{generatedKit.recoveryId}</Text>

              <Text style={styles.fieldLabel}>Recovery key</Text>
              <Text selectable style={styles.secretBox}>{generatedKit.recoveryKey}</Text>

              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.secondaryAction} onPress={() => { hapticLight(); copyRecoveryKit(); }} activeOpacity={0.8}>
                  <Ionicons name="copy-outline" size={18} color={C.primary} />
                  <Text style={styles.secondaryActionText}>Copy</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryAction} onPress={() => { hapticMedium(); saveRecoveryKit(); }} activeOpacity={0.8}>
                  <Ionicons name="download-outline" size={18} color={C.primary} />
                  <Text style={styles.secondaryActionText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Account password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                placeholderTextColor={C.tabInactive}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!generating}
              />

              <TouchableOpacity style={styles.eyeButton} onPress={() => { hapticLight(); setShowPassword((current) => !current); }}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={C.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.primaryButton, generating && styles.disabled]} onPress={() => { hapticWarning(); generateKit(); }} disabled={generating} activeOpacity={0.85}>
              {generating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{status?.created ? 'Replace recovery kit' : 'Generate recovery kit'}</Text>}
            </TouchableOpacity>

            {status?.created && (
              <TouchableOpacity style={[styles.dangerButton, revoking && styles.disabled]} onPress={() => { hapticDelete(); revokeKit(); }} disabled={revoking} activeOpacity={0.8}>
                {revoking ? <ActivityIndicator color={C.danger} /> : <Text style={styles.dangerButtonText}>Revoke current recovery kit</Text>}
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.circleCard}
            activeOpacity={0.84}
            onPress={() => router.push('/recoverycircle')}
          >
            <View style={styles.circleIcon}>
              <Ionicons name="people-circle-outline" size={24} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.circleTitle}>Recovery Circle</Text>
              <Text style={styles.circleText}>
                Add multi-person approval as a second recovery path without sharing your recovery key.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={C.tabInactive} />
          </TouchableOpacity>

          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark-outline" size={22} color={C.primary} />
            <Text style={styles.infoText}>
              The Guardian stores only a protected copy of your recovery key. The raw key is shown once and cannot be recovered later.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    flex: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 112, paddingBottom: 140 },
    heroIcon: { width: 82, height: 82, borderRadius: 28, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    title: { fontSize: 34, fontWeight: '900', color: C.text, marginBottom: 10 },
    subtitle: { fontSize: 15, color: C.textSecondary, lineHeight: 23, marginBottom: 22 },
    card: { backgroundColor: C.backgroundElement, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: C.border, marginBottom: 16
     , shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    generatedCard: { backgroundColor: C.securityScoreBg || C.backgroundElement, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: C.warning, marginBottom: 16
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    statusTitle: { color: C.text, fontSize: 16, fontWeight: '900' },
    statusText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, fontWeight: '700' },
    loadingText: { color: C.textSecondary, textAlign: 'center', marginTop: 10, fontWeight: '700' },
    warningHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    warningTitle: { color: C.text, fontSize: 16, fontWeight: '900' },
    warningText: { color: C.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 14 },
    fieldLabel: { color: C.text, fontSize: 14, fontWeight: '900', marginBottom: 8, marginLeft: 4 },
    secretBox: { backgroundColor: C.background, color: C.text, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, fontSize: 14, fontWeight: '900', marginBottom: 14, lineHeight: 21
      , shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    passwordWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.background, borderRadius: 20, borderWidth: 1, borderColor: C.border, marginBottom: 14 },
    passwordInput: { flex: 1, color: C.text, paddingHorizontal: 16, paddingVertical: 15, fontSize: 15 },
    eyeButton: { width: 52, height: 54, alignItems: 'center', justifyContent: 'center' },
    primaryButton: { minHeight: 56, borderRadius: 999, backgroundColor: C.backgroundbutton || C.primary, alignItems: 'center', justifyContent: 'center'
     , shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
    dangerButton: { marginTop: 12, minHeight: 52, borderRadius: 999, borderWidth: 1, borderColor: C.danger, alignItems: 'center', justifyContent: 'center'
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    dangerButtonText: { color: C.danger, fontSize: 15, fontWeight: '900' },
    disabled: { opacity: 0.65 },
    buttonRow: { flexDirection: 'row', gap: 12 },
    secondaryAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border, minHeight: 50 },
    secondaryActionText: { color: C.primary, fontSize: 14, fontWeight: '900' },
    circleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: `${C.primary}42`,
      padding: 16,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 15,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    circleIcon: { width: 48, height: 48, borderRadius: 18, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center' },
    circleTitle: { color: C.text, fontSize: 16, fontWeight: '900' },
    circleText: { color: C.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
    infoBox: { flexDirection: 'row', gap: 12, backgroundColor: C.backgroundElement, borderRadius: 22, borderWidth: 1, borderColor: C.border, padding: 16
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    infoText: { flex: 1, color: C.textSecondary, fontSize: 13, lineHeight: 20, fontWeight: '700' },
  });
