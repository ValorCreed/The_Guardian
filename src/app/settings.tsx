import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Bell,
  ChevronRight,
  CloudUpload,
  Crown,
  Download,
  Fingerprint,
  Lock,
  LockKeyhole,
  Palette,
  Trash2,
  Wand2,
} from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import FloatingTabBar from '../components/FloatingTabBar';
import { useAppTheme } from '../context/ThemeContext';
import { api, logout } from '../services/api';
import {
  clearBiometricCredentials,
  hasBiometricCredentials,
  setBiometricEnabled,
} from '../utils/secureAuth';

const TIMEOUT_OPTIONS = [
  { label: '30 seconds', value: 30000 },
  { label: '1 minute', value: 60000 },
  { label: '5 minutes', value: 300000 },
  { label: '15 minutes', value: 900000 },
  { label: '1 hour', value: 3600000 },
];

const getInitials = (name: string, email: string) => {
  const source = name || email || 'User';
  const parts = source.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

export default function SettingsScreen() {
  const { isDark, toggleTheme, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [fullName, setFullName] = useState('User');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<'FREE' | 'PREMIUM' | 'FAMILY'>('FREE');
  const [biometricUnlock, setBiometricUnlock] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [selectedTimeout, setSelectedTimeout] = useState(TIMEOUT_OPTIONS[1]);
  const [showTimeoutPicker, setShowTimeoutPicker] = useState(false);

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appState = useRef(AppState.currentState);

  const loadSettings = useCallback(async () => {
    const savedName = await AsyncStorage.getItem('userName');
    const savedEmail = await AsyncStorage.getItem('userEmail');
    const savedBiometric = await AsyncStorage.getItem('biometricUnlock');
    const savedTimeout = await AsyncStorage.getItem('autoLockTimeout');

    setFullName(savedName || 'User');
    setEmail(savedEmail || '');
    setBiometricUnlock(savedBiometric === 'true');

    if (savedTimeout) {
      const found = TIMEOUT_OPTIONS.find((option) => option.value === Number(savedTimeout));
      if (found) setSelectedTimeout(found);
    }

    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricAvailable(compatible && enrolled);

    try {
      const subscription = await api.getSubscription();
      setPlan(subscription.plan || 'FREE');
    } catch {
      setPlan('FREE');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings])
  );

  const lockVault = useCallback(async () => {
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
      inactivityTimer.current = null;
    }

    await AsyncStorage.setItem('vaultLocked', 'true');
    await logout();
    router.replace('/signin');
  }, []);

  const resetTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);

    inactivityTimer.current = setTimeout(() => {
      lockVault();
    }, selectedTimeout.value);
  }, [lockVault, selectedTimeout.value]);

  useEffect(() => {
    resetTimer();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current === 'active' && (nextState === 'background' || nextState === 'inactive')) {
        lockVault();
      }

      if ((appState.current === 'background' || appState.current === 'inactive') && nextState === 'active') {
        resetTimer();
      }

      appState.current = nextState;
    });

    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      subscription.remove();
    };
  }, [lockVault, resetTimer]);

  const handleBiometricToggle = async (value: boolean) => {
    if (!value) {
      setBiometricUnlock(false);
      await setBiometricEnabled(false);
      await clearBiometricCredentials();
      return;
    }

    if (!biometricAvailable) {
      Alert.alert('Not available', 'Your device does not support biometric authentication or no fingerprint/face is enrolled.');
      return;
    }

    const hasCredentials = await hasBiometricCredentials();

    if (!hasCredentials) {
      Alert.alert(
        'Sign in required',
        'To make biometric unlock perform a real login, sign in once with your email and password after adding the login-screen code I gave you. Then come back and enable this toggle.'
      );
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm your identity',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      Alert.alert('Failed', 'Could not verify your identity.');
      return;
    }

    setBiometricUnlock(true);
    await setBiometricEnabled(true);
  };

  const handleLockNow = () => {
    Alert.alert('Lock Vault', 'This will log you out and require sign in again. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Lock', style: 'destructive', onPress: lockVault },
    ]);
  };

  const planLabel = plan.charAt(0) + plan.slice(1).toLowerCase();
  const iconColor = C.text;
  const destructiveIconColor = C.danger;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <TouchableOpacity activeOpacity={1} onPress={resetTimer} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={resetTimer}
        >
          <Text style={styles.title}>Settings</Text>

          <View style={styles.accountCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(fullName, email)}</Text>
            </View>
            <View style={styles.accountInfo}>
              <Text style={styles.accountName}>{fullName}</Text>
              <Text style={styles.accountEmail}>{email || 'No email found'}</Text>
            </View>
            <View style={[styles.planBadge, plan === 'FREE' && styles.freeBadge]}>
              <Text style={[styles.planBadgeText, plan === 'FREE' && styles.freeBadgeText]}>{planLabel}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>SECURITY</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.row, styles.rowDivider]}
              activeOpacity={0.6}
              onPress={() => setShowTimeoutPicker((current) => !current)}
            >
              <View style={styles.iconCircle}><Lock size={20} color={iconColor} /></View>
              <Text style={styles.rowLabel}>Auto-lock timeout</Text>
              <Text style={styles.rowValue}>{selectedTimeout.label}</Text>
              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            {showTimeoutPicker && (
              <View style={styles.timeoutPicker}>
                {TIMEOUT_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.timeoutOption}
                    onPress={async () => {
                      setSelectedTimeout(option);
                      setShowTimeoutPicker(false);
                      await AsyncStorage.setItem('autoLockTimeout', String(option.value));
                      resetTimer();
                    }}
                  >
                    <Text style={[styles.timeoutOptionText, selectedTimeout.value === option.value && styles.timeoutOptionActive]}>
                      {option.label}
                    </Text>
                    {selectedTimeout.value === option.value && <Ionicons name="checkmark" size={18} color={C.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={[styles.row, styles.rowDivider]}>
              <View style={styles.iconCircle}><Fingerprint size={20} color={iconColor} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Biometric unlock</Text>
                <Text style={styles.rowSub}>Uses saved login credentials after biometric approval</Text>
              </View>
              <Switch
                value={biometricUnlock}
                onValueChange={handleBiometricToggle}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#fff"
                ios_backgroundColor={C.border}
              />
            </View>

            <TouchableOpacity style={[styles.row, styles.rowDivider]} activeOpacity={0.6} onPress={() => router.push('/autofill')}>
              <View style={styles.iconCircle}><Wand2 size={20} color={iconColor} /></View>
              <Text style={styles.rowLabel}>Auto-fill</Text>
              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={handleLockNow}>
              <View style={styles.iconCircle}><LockKeyhole size={20} color={iconColor} /></View>
              <Text style={styles.rowLabel}>Lock vault now</Text>
              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>PREFERENCES</Text>
          <View style={styles.card}>
            <View style={[styles.row, styles.rowDivider]}>
              <View style={styles.iconCircle}><Palette size={20} color={iconColor} /></View>
              <Text style={styles.rowLabel}>Dark mode</Text>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#fff"
                ios_backgroundColor={C.border}
              />
            </View>
            <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={() => {}}>
              <View style={styles.iconCircle}><Bell size={20} color={iconColor} /></View>
              <Text style={styles.rowLabel}>Notifications</Text>
              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>DATA</Text>
          <View style={styles.card}>
            <TouchableOpacity style={[styles.row, styles.rowDivider]} activeOpacity={0.6} onPress={() => {}}>
              <View style={styles.iconCircle}><Download size={20} color={iconColor} /></View>
              <Text style={styles.rowLabel}>Export data</Text>
              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.row, styles.rowDivider]} activeOpacity={0.6} onPress={() => {}}>
              <View style={styles.iconCircle}><CloudUpload size={20} color={iconColor} /></View>
              <Text style={styles.rowLabel}>Backup</Text>
              <Text style={styles.rowValue}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={() => router.push('/subscription')}>
              <View style={styles.iconCircle}><Crown size={20} color={iconColor} /></View>
              <Text style={styles.rowLabel}>Subscription</Text>
              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => {
                Alert.alert('Delete Account', 'This will permanently delete your account and all data. This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => {} },
                ]);
              }}
            >
              <View style={[styles.iconCircle, { backgroundColor: C.alertDangerBg }]}>
                <Trash2 size={20} color={destructiveIconColor} />
              </View>
              <Text style={[styles.rowLabel, { color: C.danger }]}>Delete account</Text>
              <ChevronRight size={20} color={C.danger} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableOpacity>

      <FloatingTabBar />
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    scrollContent: { marginTop: 35, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 110 },
    title: { fontSize: 32, fontWeight: '700', color: C.text, marginBottom: 16 },
    accountCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      padding: 14,
      marginBottom: 24,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    avatarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    accountInfo: { flex: 1 },
    accountName: { fontSize: 16, fontWeight: '700', color: C.text },
    accountEmail: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
    planBadge: { backgroundColor: C.securityScoreBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
    planBadgeText: { fontSize: 13, fontWeight: '700', color: C.warning },
    freeBadge: { backgroundColor: C.backgroundSelected },
    freeBadgeText: { color: C.textSecondary },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textSecondary,
      letterSpacing: 0.5,
      marginBottom: 8,
      marginLeft: 4,
    },
    card: { backgroundColor: C.backgroundElement, borderRadius: 20, marginBottom: 24, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14 },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    rowLabel: { flex: 1, fontSize: 16, color: C.text, fontWeight: '500' },
    rowSub: { fontSize: 12, color: C.textSecondary, marginTop: 2, lineHeight: 16 },
    rowValue: { fontSize: 15, color: C.textSecondary, marginRight: 2 },
    timeoutPicker: { backgroundColor: C.background, borderBottomWidth: 1, borderBottomColor: C.border },
    timeoutOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    timeoutOptionText: { fontSize: 15, color: C.textSecondary },
    timeoutOptionActive: { color: C.primary, fontWeight: '700' },
  });
