import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../context/ThemeContext';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';
import AddScreenEntrance from '../components/AddScreenEntrance';
import { api, isDuressSession } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import { encryptPassword } from '../utils/vaultcrypto';
import { hapticSelection, hapticToggleOff, hapticToggleOn } from '../utils/haptics';
import { syncGuardianAutofillCache } from '../services/autofillSync';
import { useScreenAlert } from '../hooks/useScreenAlert';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMBERS = '0123456789';
const SYMBOLS = '!@#$%^&*()_+-=[]{}';
const FREE_PASSWORD_LIMIT = 10;
type Plan = 'FREE' | 'PREMIUM' | 'FAMILY' | string;

const generatePassword = (length: number, useNumbers: boolean, useSymbols: boolean) => {
  let chars = LOWER + UPPER;
  const required = [LOWER[Math.floor(Math.random() * LOWER.length)], UPPER[Math.floor(Math.random() * UPPER.length)]];

  if (useNumbers) {
    chars += NUMBERS;
    required.push(NUMBERS[Math.floor(Math.random() * NUMBERS.length)]);
  }

  if (useSymbols) {
    chars += SYMBOLS;
    required.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
  }

  while (required.length < length) {
    required.push(chars.charAt(Math.floor(Math.random() * chars.length)));
  }

  return required.sort(() => Math.random() - 0.5).join('');
};

const getStrengthScore = (value: string) => {
  let score = 0;
  if (value.length >= 8) score += 15;
  if (value.length >= 12) score += 20;
  if (value.length >= 16) score += 15;
  if (/[a-z]/.test(value)) score += 10;
  if (/[A-Z]/.test(value)) score += 15;
  if (/[0-9]/.test(value)) score += 10;
  if (/[^A-Za-z0-9]/.test(value)) score += 15;
  return Math.max(0, Math.min(100, score));
};

const AddPasswordScreen = () => {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const router = useRouter();
  const params = useLocalSearchParams<{ generatedPassword?: string }>();
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  useSensitiveScreenProtection(true);

  const [website, setWebsite] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [passLength, setPassLength] = useState(16);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<Plan>('FREE');
  const [passwordCount, setPasswordCount] = useState(0);
  const [checkingLimits, setCheckingLimits] = useState(true);

  useEffect(() => {
    if (params.generatedPassword) {
      setPassword(String(params.generatedPassword));
    } else if (!password) {
      setPassword(generatePassword(passLength, includeNumbers, includeSymbols));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.generatedPassword]);

  useEffect(() => {
    const loadPlanLimits = async () => {
      try {
        setCheckingLimits(true);
        const duress = await isDuressSession();
        const vaultItems = await requestApi.getVaultItems().catch(() => []);

        if (duress) {
          // A valid duress session is already revalidated as Premium/Family by
          // Auth Service. Never call Subscription Service from the decoy vault.
          setPlan('PREMIUM');
        } else {
          const subscription = await requestApi
            .getSubscription()
            .catch(() => ({ plan: 'FREE' }));
          setPlan(subscription?.plan || 'FREE');
        }
        setPasswordCount(Array.isArray(vaultItems) ? vaultItems.length : 0);
      } finally {
        setCheckingLimits(false);
      }
    };

    loadPlanLimits();
  }, []);

  const score = useMemo(() => getStrengthScore(password), [password]);
  const scoreColor = score >= 75 ? C.success : score >= 45 ? C.warning : C.danger;
  const scoreLabel = score >= 75 ? 'Strong' : score >= 45 ? 'Moderate' : 'Weak';
  const isPaidPlan = String(plan).toUpperCase() === 'PREMIUM' || String(plan).toUpperCase() === 'FAMILY';
  const freePasswordLimitReached = !isPaidPlan && passwordCount >= FREE_PASSWORD_LIMIT;

  const regenerate = (length = passLength, numbers = includeNumbers, symbols = includeSymbols) => {
    setPassword(generatePassword(length, numbers, symbols));
  };

  const showPasswordLimitAlert = (message?: string) => {
    screenAlert(
      'Password limit reached',
      message || `Your Free plan can save up to ${FREE_PASSWORD_LIMIT} passwords. Upgrade to Premium or Family for unlimited password storage.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/subscription?from=addpassword') },
      ]
    );
  };

  const handleSave = async () => {
    if (saving) return;

    if (freePasswordLimitReached) {
      showPasswordLimitAlert();
      return;
    }

    if (!website.trim()) {
      screenAlert('Missing website', 'Please enter the website or app name.');
      return;
    }

    if (!username.trim()) {
      screenAlert('Missing username', 'Please enter the username or email.');
      return;
    }

    if (!password) {
      screenAlert('Missing password', 'Please enter or generate a password.');
      return;
    }

    try {
      setSaving(true);

      await requestApi.createVaultItem({
        itemType: 'PASSWORD',
        title: website.trim(),
        website: website.trim(),
        usernameValue: username.trim(),
        encryptedPassword: encryptPassword(password),
        notes: notes.trim(),
      });

      void syncGuardianAutofillCache().catch(() => undefined);

      screenAlert('Saved', 'Password saved securely to your vault.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      const code = String(error?.code || '').toUpperCase();
      const message = String(error?.message || '');
      const lowerMessage = message.toLowerCase();

      if (
        code === 'PLAN_LIMIT_REACHED' ||
        lowerMessage.includes('free plan') ||
        lowerMessage.includes('password limit') ||
        lowerMessage.includes('vault limit')
      ) {
        showPasswordLimitAlert(message);
        return;
      }

      screenAlert('Save failed', message || 'Could not save password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AddScreenEntrance
      style={styles.container}
      backgroundColor={C.background}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Add password</Text>
            {/* <Text>
              
            </Text> */}
          </View>

          <TouchableOpacity
            style={styles.advancedGeneratorCard}
            activeOpacity={0.86}
            onPress={() => {
              hapticSelection();
              router.push('/passwordgenerator');
            }}
            accessibilityRole="button"
            accessibilityLabel="Open advanced password generator"
          >
            <View style={styles.advancedGeneratorIcon}>
              <Ionicons name="sparkles" size={25} color="#FFFFFF" />
            </View>

            <View style={styles.advancedGeneratorCopy}>
              <Text style={styles.advancedGeneratorEyebrow}>PASSWORD TOOL</Text>
              <Text style={styles.advancedGeneratorTitle}>Advanced generator</Text>
              <Text style={styles.advancedGeneratorText}>
                Build a custom password with more controls.
              </Text>
            </View>

            <View style={styles.advancedGeneratorArrow}>
              <Ionicons name="arrow-forward" size={19} color={C.primary} />
            </View>
          </TouchableOpacity>

          {freePasswordLimitReached && (
            <View style={styles.limitBox}>
              <View style={styles.limitIcon}>
                <Ionicons name="alert-circle-outline" size={21} color={C.warning} />
              </View>
              <Text style={styles.limitText}>
                Free plan limit reached. Upgrade to save more passwords.
              </Text>
            </View>
          )}

          <View style={styles.formCard}>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.sectionIcon}>
                <Ionicons name="key-outline" size={20} color={C.primary} />
              </View>
              <View style={styles.sectionHeadingCopy}>
                <Text style={styles.sectionTitle}>Login details</Text>
                <Text style={styles.sectionSubtitle}>
                  Enter the app or website and account information.
                </Text>
              </View>
            </View>

            <Text style={styles.label}>Website or app</Text>
            <TextInput
              style={styles.input}
              placeholder="example.com"
              placeholderTextColor={C.tabInactive}
              value={website}
              onChangeText={setWebsite}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Username or email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={C.tabInactive}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={styles.passwordField}
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
              />
              <TouchableOpacity
                onPress={() => regenerate()}
                style={styles.iconButton}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Generate another password"
              >
                <Ionicons name="refresh-outline" size={21} color={C.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.scorePanel}>
              <View style={styles.scoreHeading}>
                <Text style={styles.scoreTitle}>Password strength</Text>
                <Text style={[styles.scoreLabel, { color: scoreColor }]}>
                  {scoreLabel}
                </Text>
              </View>
              <View style={styles.scoreTrack}>
                <View
                  style={[
                    styles.scoreFill,
                    {
                      width: `${score}%`,
                      backgroundColor: scoreColor,
                    },
                  ]}
                />
              </View>
            </View>
          </View>

          <View style={styles.generatorCard}>
            <View style={styles.generatorHeader}>
              <View style={styles.generatorIcon}>
                <Ionicons name="flash" size={20} color={C.primary} />
              </View>
              <View style={styles.generatorHeadingCopy}>
                <Text style={styles.generatorTitle}>Quick generator</Text>
                <Text style={styles.generatorSub}>
                  Adjust the essentials without leaving this page.
                </Text>
              </View>
            </View>

            <View style={styles.generatorControlCard}>
              <View style={styles.sliderRow}>
                <Text style={styles.sliderLabel}>Length</Text>
                <View style={styles.sliderControls}>
                  <TouchableOpacity
                    style={styles.sliderBtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      const newLen = Math.max(8, passLength - 1);
                      hapticSelection();
                      setPassLength(newLen);
                      regenerate(newLen, includeNumbers, includeSymbols);
                    }}
                  >
                    <Ionicons name="remove" size={19} color={C.primary} />
                  </TouchableOpacity>

                  <View style={styles.sliderValuePill}>
                    <Text style={styles.sliderValue}>{passLength}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.sliderBtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      const newLen = Math.min(32, passLength + 1);
                      hapticSelection();
                      setPassLength(newLen);
                      regenerate(newLen, includeNumbers, includeSymbols);
                    }}
                  >
                    <Ionicons name="add" size={19} color={C.primary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.toggleDivider} />

              <View style={styles.toggleRow}>
                <View style={styles.toggleCopy}>
                  <Text style={styles.toggleLabel}>Include numbers</Text>
                  <Text style={styles.toggleDescription}>Adds digits from 0 to 9.</Text>
                </View>
                <Switch
                  value={includeNumbers}
                  onValueChange={(val) => {
                    val ? hapticToggleOn() : hapticToggleOff();
                    setIncludeNumbers(val);
                    regenerate(passLength, val, includeSymbols);
                  }}
                  trackColor={{ false: C.border, true: C.primary }}
                  thumbColor="#fff"
                  ios_backgroundColor={C.border}
                />
              </View>

              <View style={styles.toggleDivider} />

              <View style={styles.toggleRow}>
                <View style={styles.toggleCopy}>
                  <Text style={styles.toggleLabel}>Include symbols</Text>
                  <Text style={styles.toggleDescription}>Adds special characters.</Text>
                </View>
                <Switch
                  value={includeSymbols}
                  onValueChange={(val) => {
                    val ? hapticToggleOn() : hapticToggleOff();
                    setIncludeSymbols(val);
                    regenerate(passLength, includeNumbers, val);
                  }}
                  trackColor={{ false: C.border, true: C.primary }}
                  thumbColor="#fff"
                  ios_backgroundColor={C.border}
                />
              </View>
            </View>
          </View>

          <View style={styles.notesCard}>
            <View style={styles.notesHeader}>
              <View style={styles.notesIcon}>
                <Ionicons name="document-text-outline" size={19} color={C.primary} />
              </View>
              <Text style={styles.notesTitle}>Notes</Text>
            </View>

            <TextInput
              style={styles.notesInput}
              placeholder="Add an optional note..."
              placeholderTextColor={C.tabInactive}
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[
              styles.saveBtn,
              (saving || freePasswordLimitReached || checkingLimits) &&
                styles.disabledBtn,
            ]}
            onPress={handleSave}
            disabled={saving || checkingLimits}
            activeOpacity={0.87}
          >
            {saving || checkingLimits ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons
                name={
                  freePasswordLimitReached
                    ? 'lock-closed-outline'
                    : 'checkmark-circle'
                }
                size={21}
                color="#fff"
              />
            )}
            <Text style={styles.saveBtnText}>
              {checkingLimits
                ? 'Checking plan...'
                : saving
                  ? 'Saving...'
                  : freePasswordLimitReached
                    ? 'Upgrade to Save More'
                    : 'Save Password'}
            </Text>
          </TouchableOpacity>

          <View style={styles.bottomSpace} />
        </ScrollView>
      </KeyboardAvoidingView>
    </AddScreenEntrance>
  );
};

export default AddPasswordScreen;

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

const makeStyles = (C: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 92,
      paddingBottom: 28,
    },
    header: {
      marginBottom: 18,
    },
    headerTitle: {
      color: C.text,
      fontSize: 31,
      fontWeight: '900',
      letterSpacing: -0.7,
    },
    headerSubtitle: {
      color: C.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
      marginTop: 6,
    },
    advancedGeneratorCard: {
      minHeight: 112,
      borderRadius: 26,
      padding: 16,
      marginBottom: 18,
      backgroundColor: C.primary,
      borderWidth: 1,
      borderColor: `${C.primary}DD`,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      shadowColor: '#000000',
      shadowOpacity: 0.24,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 13 },
      elevation: 11,
    },
    advancedGeneratorIcon: {
      width: 54,
      height: 54,
      borderRadius: 19,
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.18,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 5,
    },
    advancedGeneratorCopy: {
      flex: 1,
      minWidth: 0,
    },
    advancedGeneratorEyebrow: {
      color: 'rgba(255,255,255,0.70)',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.9,
    },
    advancedGeneratorTitle: {
      color: '#FFFFFF',
      fontSize: 18,
      lineHeight: 23,
      fontWeight: '900',
      marginTop: 3,
    },
    advancedGeneratorText: {
      color: 'rgba(255,255,255,0.82)',
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      marginTop: 3,
    },
    advancedGeneratorArrow: {
      width: 38,
      height: 38,
      borderRadius: 14,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.18,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 5 },
      elevation: 5,
    },
    limitBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      borderWidth: 1,
      borderColor: `${C.warning}70`,
      backgroundColor: C.actionCard,
      borderRadius: 21,
      padding: 14,
      marginBottom: 18,
      shadowColor: '#000000',
      shadowOpacity: 0.10,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    limitIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: `${C.warning}18`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    limitText: {
      flex: 1,
      color: C.text,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
    },
    formCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: C.border,
      padding: 17,
      marginBottom: 18,
      shadowColor: '#000000',
      shadowOpacity: 0.15,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 13 },
      elevation: 10,
    },
    sectionHeadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    sectionIcon: {
      width: 44,
      height: 44,
      borderRadius: 16,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.09,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 4,
    },
    sectionHeadingCopy: {
      flex: 1,
      minWidth: 0,
    },
    sectionTitle: {
      color: C.text,
      fontSize: 17,
      fontWeight: '900',
    },
    sectionSubtitle: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      marginTop: 2,
    },
    label: {
      color: C.text,
      fontSize: 13,
      fontWeight: '900',
      marginBottom: 8,
    },
    input: {
      minHeight: 55,
      backgroundColor: C.background,
      borderRadius: 19,
      paddingHorizontal: 16,
      fontSize: 15,
      color: C.text,
      marginBottom: 17,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000000',
      shadowOpacity: 0.075,
      shadowRadius: 11,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    passwordRow: {
      minHeight: 60,
      backgroundColor: C.background,
      borderRadius: 20,
      paddingLeft: 16,
      paddingRight: 9,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000000',
      shadowOpacity: 0.09,
      shadowRadius: 13,
      shadowOffset: { width: 0, height: 7 },
      elevation: 5,
    },
    passwordField: {
      flex: 1,
      minHeight: 48,
      fontSize: 15,
      color: C.text,
      paddingRight: 10,
    },
    iconButton: {
      width: 42,
      height: 42,
      borderRadius: 15,
      backgroundColor: C.actionCard,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.12,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 5 },
      elevation: 5,
    },
    scorePanel: {
      marginTop: 13,
      padding: 13,
      borderRadius: 18,
      backgroundColor: C.backgroundSelected,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000000',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    scoreHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 9,
    },
    scoreTitle: {
      color: C.text,
      fontSize: 12,
      fontWeight: '800',
    },
    scoreLabel: {
      fontSize: 12,
      fontWeight: '900',
    },
    scoreTrack: {
      height: 9,
      backgroundColor: C.border,
      borderRadius: 999,
      overflow: 'hidden',
    },
    scoreFill: {
      height: 9,
      borderRadius: 999,
    },
    generatorCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 28,
      padding: 17,
      marginBottom: 18,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000000',
      shadowOpacity: 0.15,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 13 },
      elevation: 10,
    },
    generatorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 14,
    },
    generatorIcon: {
      width: 44,
      height: 44,
      borderRadius: 16,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.10,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 4,
    },
    generatorHeadingCopy: {
      flex: 1,
      minWidth: 0,
    },
    generatorTitle: {
      color: C.text,
      fontSize: 17,
      fontWeight: '900',
    },
    generatorSub: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      marginTop: 2,
    },
    generatorControlCard: {
      borderRadius: 21,
      paddingHorizontal: 14,
      backgroundColor: C.background,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000000',
      shadowOpacity: 0.08,
      shadowRadius: 13,
      shadowOffset: { width: 0, height: 7 },
      elevation: 5,
    },
    sliderRow: {
      minHeight: 68,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    sliderLabel: {
      color: C.text,
      fontSize: 14,
      fontWeight: '900',
    },
    sliderControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    sliderBtn: {
      width: 36,
      height: 36,
      backgroundColor: C.actionCard,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: C.border,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.10,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    sliderValuePill: {
      minWidth: 46,
      height: 36,
      borderRadius: 13,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: C.primary,
      shadowOpacity: 0.20,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 5 },
      elevation: 5,
    },
    sliderValue: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
      textAlign: 'center',
    },
    toggleDivider: {
      height: 1,
      backgroundColor: C.border,
    },
    toggleRow: {
      minHeight: 70,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    toggleCopy: {
      flex: 1,
      minWidth: 0,
    },
    toggleLabel: {
      color: C.text,
      fontSize: 14,
      fontWeight: '900',
    },
    toggleDescription: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      marginTop: 2,
    },
    notesCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      marginBottom: 19,
      shadowColor: '#000000',
      shadowOpacity: 0.13,
      shadowRadius: 19,
      shadowOffset: { width: 0, height: 11 },
      elevation: 8,
    },
    notesHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    notesIcon: {
      width: 38,
      height: 38,
      borderRadius: 14,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    notesTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: '900',
    },
    notesInput: {
      minHeight: 112,
      backgroundColor: C.background,
      borderRadius: 19,
      paddingHorizontal: 15,
      paddingVertical: 14,
      fontSize: 15,
      color: C.text,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000000',
      shadowOpacity: 0.07,
      shadowRadius: 11,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    saveBtn: {
      minHeight: 60,
      backgroundColor: C.backgroundbutton,
      borderRadius: 22,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: `${C.primary}90`,
      shadowColor: '#000000',
      shadowOpacity: 0.24,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 13 },
      elevation: 11,
    },
    disabledBtn: {
      opacity: 0.65,
      shadowOpacity: 0.08,
      elevation: 4,
    },
    saveBtnText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '900',
    },
    bottomSpace: {
      height: 92,
    },
  });