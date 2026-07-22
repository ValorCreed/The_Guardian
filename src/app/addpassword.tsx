import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { encryptPassword } from '../utils/vaultcrypto';
import { hapticSelection, hapticToggleOff, hapticToggleOn } from '../utils/haptics';

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
  const router = useRouter();
  const params = useLocalSearchParams<{ generatedPassword?: string }>();
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

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
        const [subscription, vaultItems] = await Promise.all([
          api.getSubscription().catch(() => ({ plan: 'FREE' })),
          api.getVaultItems().catch(() => []),
        ]);

        setPlan(subscription?.plan || 'FREE');
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
    Alert.alert(
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
      Alert.alert('Missing website', 'Please enter the website or app name.');
      return;
    }

    if (!username.trim()) {
      Alert.alert('Missing username', 'Please enter the username or email.');
      return;
    }

    if (!password) {
      Alert.alert('Missing password', 'Please enter or generate a password.');
      return;
    }

    try {
      setSaving(true);

      await api.createVaultItem({
        itemType: 'PASSWORD',
        title: website.trim(),
        website: website.trim(),
        usernameValue: username.trim(),
        encryptedPassword: encryptPassword(password),
        notes: notes.trim(),
      });

      Alert.alert('Saved', 'Password saved securely to your vault.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
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

      Alert.alert('Save failed', message || 'Could not save password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Add Password</Text>
              <Text style={styles.headerSubtitle}>
                {checkingLimits
                  ? 'Checking plan limit...'
                  : isPaidPlan
                    ? 'Unlimited passwords on your current plan'
                    : `${passwordCount}/${FREE_PASSWORD_LIMIT} passwords used on Free plan`}
              </Text>
            </View>
            <TouchableOpacity style={styles.headerTool} onPress={() => router.push('/passwordgenerator')}>
              <Ionicons name="sparkles-outline" size={17} color={C.primary} />
              <Text style={styles.headerToolText}>Advanced generator</Text>
            </TouchableOpacity>
          </View>

          {freePasswordLimitReached && (
            <View style={styles.limitBox}>
              <Ionicons name="alert-circle-outline" size={20} color={C.warning} />
              <Text style={styles.limitText}>You have reached the Free plan password limit. Upgrade to save more passwords.</Text>
            </View>
          )}

          <View style={styles.form}>
            <Text style={styles.label}>Website / App</Text>
            <TextInput
              style={styles.input}
              placeholder="example.com"
              placeholderTextColor={C.tabInactive}
              value={website}
              onChangeText={setWebsite}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Username or Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={C.tabInactive}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={styles.passwordField}
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => regenerate()} style={styles.iconButton}>
                <Ionicons name="refresh-outline" size={20} color={C.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.scoreRow}>
              <View style={styles.scoreTrack}>
                <View style={[styles.scoreFill, { width: `${score}%`, backgroundColor: scoreColor }]} />
              </View>
              <Text style={[styles.scoreLabel, { color: scoreColor }]}>{scoreLabel}</Text>
            </View>

            <View style={styles.generatorCard}>
              <View style={styles.generatorHeader}>
                <Ionicons name="flash-outline" size={18} color={C.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.generatorTitle}>Quick generator</Text>
                  <Text style={styles.generatorSub}>Use the advanced generator for passphrases and Premium options.</Text>
                </View>
              </View>

              <View style={styles.sliderRow}>
                <Text style={styles.sliderLabel}>Length</Text>
                <View style={styles.sliderControls}>
                  <TouchableOpacity
                    style={styles.sliderBtn}
                    onPress={() => {
                      const newLen = Math.max(8, passLength - 1);
                      hapticSelection();
                      setPassLength(newLen);
                      regenerate(newLen, includeNumbers, includeSymbols);
                    }}
                  >
                    <Ionicons name="remove" size={18} color={C.primary} />
                  </TouchableOpacity>
                  <Text style={styles.sliderValue}>{passLength}</Text>
                  <TouchableOpacity
                    style={styles.sliderBtn}
                    onPress={() => {
                      const newLen = Math.min(32, passLength + 1);
                      hapticSelection();
                      setPassLength(newLen);
                      regenerate(newLen, includeNumbers, includeSymbols);
                    }}
                  >
                    <Ionicons name="add" size={18} color={C.primary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Include numbers</Text>
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

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Include symbols</Text>
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

            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Add a note..."
              placeholderTextColor={C.tabInactive}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, (saving || freePasswordLimitReached) && styles.disabledBtn]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name={freePasswordLimitReached ? 'lock-closed-outline' : 'checkmark-circle-outline'} size={20} color="#fff" />
            )}
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : freePasswordLimitReached ? 'Upgrade to Save More' : 'Save Password'}</Text>
          </TouchableOpacity>

          <View style={{ height: 90 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default AddPasswordScreen;

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

const makeStyles = (C: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    scrollContent: { paddingBottom: 24 },
    header: {
      paddingHorizontal: 20,
      paddingTop: 92,
      paddingBottom: 12,
      gap: 10,
    },
    headerTitle: { fontSize: 24, fontWeight: '900', color: C.text },
    headerSubtitle: {
      marginTop: 6,
      color: C.textSecondary,
      fontSize: 13,
      fontWeight: '700',
    },
    limitBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: C.warning,
      backgroundColor: C.actionCard,
      borderRadius: 18,
      padding: 14,
      marginHorizontal: 20,
      marginBottom: 16,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    limitText: {
      flex: 1,
      color: C.text,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
    },
    headerTool: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      backgroundColor: C.actionCard,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    headerToolText: { color: C.primary, fontWeight: '900', fontSize: 12 },
    form: { paddingHorizontal: 20, paddingTop: 8 },
    label: { fontSize: 14, color: C.text, fontWeight: '700', marginBottom: 8 },
    input: {
      backgroundColor: C.backgroundElement,
      borderRadius: 50,
      paddingHorizontal: 20,
      paddingVertical: 16,
      fontSize: 15,
      color: C.text,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: C.border,
    },
    passwordRow: {
      backgroundColor: C.backgroundElement,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      borderWidth: 1,
      borderColor: C.border,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    passwordField: { flex: 1, fontSize: 15, color: C.text, minHeight: 34 },
    iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: C.actionCard 
      ,shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    scoreTrack: { flex: 1, height: 8, backgroundColor: C.border, borderRadius: 99, overflow: 'hidden' },
    scoreFill: { height: 8, borderRadius: 99 },
    scoreLabel: { minWidth: 70, textAlign: 'right', fontSize: 12, fontWeight: '900' },
    generatorCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 18,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: C.border,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    generatorHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    generatorTitle: { fontSize: 15, fontWeight: '900', color: C.primary },
    generatorSub: { fontSize: 12, color: C.textSecondary, marginTop: 2, lineHeight: 16 },
    sliderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sliderLabel: { fontSize: 14, color: C.text, fontWeight: '700' },
    sliderControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    sliderBtn: {
      width: 30,
      height: 30,
      backgroundColor: C.backgroundSelected,
      borderRadius: 15,
      justifyContent: 'center',
      alignItems: 'center',
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    sliderValue: {
      fontSize: 15,
      fontWeight: 'bold',
      color: C.text,
      minWidth: 24,
      textAlign: 'center',
    },
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    toggleLabel: { fontSize: 14, color: C.text },
    notesInput: {
      backgroundColor: C.backgroundElement,
      borderRadius: 16,
      paddingHorizontal: 20,
      paddingVertical: 16,
      fontSize: 15,
      color: C.text,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: C.border,
      height: 110,
      textAlignVertical: 'top',
    },
    saveBtn: {
      backgroundColor: C.backgroundbutton,
      paddingVertical: 18,
      borderRadius: 50,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 20,
      marginTop: 4,
      marginBottom: 20,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    disabledBtn: { opacity: 0.65 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  });
