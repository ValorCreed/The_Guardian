import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ScrollView, View, Text, Switch, TouchableOpacity,
  StyleSheet, StatusBar, AppState, Alert, useColorScheme,
} from 'react-native';
import {
  Lock, Fingerprint, Wand2, LockKeyhole,
  Palette, Bell, ChevronRight, Download, CloudUpload, Crown, Trash2,
} from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/theme';

const TIMEOUT_OPTIONS = [
  { label: '30 seconds', value: 30000 },
  { label: '1 minute', value: 60000 },
  { label: '5 minutes', value: 300000 },
  { label: '15 minutes', value: 900000 },
  { label: '1 hour', value: 3600000 },
];

export default function SettingsScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const C = Colors[scheme];
  const styles = makeStyles(C);

  const [biometricUnlock, setBiometricUnlock] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [selectedTimeout, setSelectedTimeout] = useState(TIMEOUT_OPTIONS[1]);
  const [showTimeoutPicker, setShowTimeoutPicker] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const loadSettings = async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(compatible && enrolled);
      const savedBiometric = await AsyncStorage.getItem('biometricUnlock');
      if (savedBiometric !== null) setBiometricUnlock(savedBiometric === 'true');
      const savedTimeout = await AsyncStorage.getItem('autoLockTimeout');
      if (savedTimeout) {
        const found = TIMEOUT_OPTIONS.find(o => o.value === Number(savedTimeout));
        if (found) setSelectedTimeout(found);
      }
    };
    loadSettings();
  }, []);

  const lockVault = useCallback(async () => {
    if (isLocked) return;
    setIsLocked(true);
    if (inactivityTimer.current) { clearTimeout(inactivityTimer.current); inactivityTimer.current = null; }
    await AsyncStorage.setItem('vaultLocked', 'true');
    router.replace('/signin');
  }, [isLocked]);

  const resetTimer = useCallback(() => {
    if (isLocked) return;
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => { lockVault(); }, selectedTimeout.value);
  }, [selectedTimeout, lockVault, isLocked]);

  useEffect(() => {
    resetTimer();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current === 'active' && (nextState === 'background' || nextState === 'inactive')) {
        lockVault();
      }
      appState.current = nextState;
    });
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      subscription.remove();
    };
  }, [selectedTimeout]);

  const handleBiometricToggle = async (val: boolean) => {
    if (val) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm your identity to enable biometric unlock',
        cancelLabel: 'Cancel',
      });
      if (result.success) {
        setBiometricUnlock(true);
        await AsyncStorage.setItem('biometricUnlock', 'true');
      } else {
        Alert.alert('Failed', 'Could not verify identity. Biometric unlock not enabled.');
      }
    } else {
      setBiometricUnlock(false);
      await AsyncStorage.setItem('biometricUnlock', 'false');
    }
  };

  const handleLockNow = () => {
    Alert.alert('Lock Vault', 'Are you sure you want to lock your vault?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Lock', style: 'destructive', onPress: lockVault },
    ]);
  };

  const iconColor = C.text;
  const destructiveIconColor = C.danger;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />

      <TouchableOpacity activeOpacity={1} onPress={resetTimer} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={resetTimer}
        >
          <Text style={styles.title}>Settings</Text>

          {/* Account card */}
          <View style={styles.accountCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>AM</Text>
            </View>
            <View style={styles.accountInfo}>
              <Text style={styles.accountName}>Alex Morgan</Text>
              <Text style={styles.accountEmail}>alex.morgan@gmail.com</Text>
            </View>
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumBadgeText}>Premium</Text>
            </View>
          </View>

          {/* SECURITY */}
          <Text style={styles.sectionLabel}>SECURITY</Text>
          <View style={styles.card}>
            {/* Auto lock */}
            <TouchableOpacity
              style={[styles.row, styles.rowDivider]}
              activeOpacity={0.6}
              onPress={() => setShowTimeoutPicker(!showTimeoutPicker)}
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
                    }}
                  >
                    <Text style={[
                      styles.timeoutOptionText,
                      selectedTimeout.value === option.value && styles.timeoutOptionActive,
                    ]}>
                      {option.label}
                    </Text>
                    {selectedTimeout.value === option.value && (
                      <Ionicons name="checkmark" size={18} color={C.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Biometric */}
            <View style={[styles.row, styles.rowDivider]}>
              <View style={styles.iconCircle}><Fingerprint size={20} color={iconColor} /></View>
              <Text style={styles.rowLabel}>Biometric unlock</Text>
              <Switch
                value={biometricUnlock}
                onValueChange={biometricAvailable ? handleBiometricToggle : () => {
                  Alert.alert('Not Available', 'Your device does not support biometric authentication.');
                }}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={C.border}
              />
            </View>

            <TouchableOpacity style={[styles.row, styles.rowDivider]} activeOpacity={0.6} onPress={() => {}}>
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

          {/* PREFERENCES */}
          <Text style={styles.sectionLabel}>PREFERENCES</Text>
          <View style={styles.card}>
            <View style={[styles.row, styles.rowDivider]}>
              <View style={styles.iconCircle}><Palette size={20} color={iconColor} /></View>
              <Text style={styles.rowLabel}>Dark mode</Text>
              <Switch
                value={darkMode}
                onValueChange={setDarkMode}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={C.border}
              />
            </View>
            <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={() => {}}>
              <View style={styles.iconCircle}><Bell size={20} color={iconColor} /></View>
              <Text style={styles.rowLabel}>Notifications</Text>
              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          {/* DATA */}
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

          {/* DELETE */}
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => {
                Alert.alert(
                  'Delete Account',
                  'This will permanently delete your account and all data. This cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => {} },
                  ]
                );
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

      {/* Bottom nav */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home')}>
          <Ionicons name="home-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/vault')}>
          <Ionicons name="key-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Vault</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/security')}>
          <Ionicons name="shield-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Security</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/family')}>
          <Ionicons name="people-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Family</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="settings" size={22} color={C.tabActive} />
          <Text style={styles.navLabelActive}>Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

type ThemeColors = typeof Colors.light | typeof Colors.dark;

const makeStyles = (C: ThemeColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    scrollContent: { marginTop: 35, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
    title: { fontSize: 32, fontWeight: '700', color: C.text, marginBottom: 16 },
    accountCard: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 20, padding: 14, marginBottom: 24,
    },
    avatar: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: C.primary,
      alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    avatarText: { color: '#fff', fontWeight: '600', fontSize: 15 },
    accountInfo: { flex: 1 },
    accountName: { fontSize: 16, fontWeight: '600', color: C.text },
    accountEmail: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
    premiumBadge: {
      backgroundColor: C.securityScoreBg,
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    },
    premiumBadgeText: { fontSize: 13, fontWeight: '600', color: C.warning },
    sectionLabel: {
      fontSize: 12, fontWeight: '600', color: C.textSecondary,
      letterSpacing: 0.5, marginBottom: 8, marginLeft: 4,
    },
    card: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20, marginBottom: 24, overflow: 'hidden',
    },
    row: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 14, paddingHorizontal: 14,
    },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    iconCircle: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center', justifyContent: 'center', marginRight: 14,
    },
    rowLabel: { flex: 1, fontSize: 16, color: C.text },
    rowValue: { fontSize: 15, color: C.textSecondary, marginRight: 2 },
    timeoutPicker: {
      backgroundColor: C.background,
      borderBottomWidth: 1, borderBottomColor: C.border,
    },
    timeoutOption: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 12, paddingHorizontal: 20,
      borderBottomWidth: 1, borderBottomColor: C.border,
    },
    timeoutOptionText: { fontSize: 15, color: C.textSecondary },
    timeoutOptionActive: { color: C.primary, fontWeight: '600' },
    bottomNav: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: C.backgroundElement,
      flexDirection: 'row',
      paddingTop: 10, paddingBottom: 28,
      borderTopWidth: 1, borderTopColor: C.border,
    },
    navItem: { flex: 1, alignItems: 'center', gap: 4 },
    navLabel: { fontSize: 11, color: C.tabInactive },
    navLabelActive: { fontSize: 11, color: C.tabActive, fontWeight: '600' },
  });