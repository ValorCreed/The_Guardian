import React, { useCallback, useState } from 'react';
import {
  Alert,
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
import { ChevronLeft, Fingerprint, KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react-native';
import { useAppTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import {
  clearBiometricCredentials,
  hasBiometricCredentials,
  setBiometricEnabled,
} from '../utils/secureAuth';

const getInitials = (name: string, email: string) => {
  const source = name || email || 'User';
  const parts = source.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

export default function UserInfoScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [fullName, setFullName] = useState('User');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<'FREE' | 'PREMIUM' | 'FAMILY'>('FREE');
  const [biometricUnlock, setBiometricUnlock] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [saving2FA, setSaving2FA] = useState(false);
  


  const loadUserInfo = useCallback(async () => {
    const savedName = await AsyncStorage.getItem('userName');
    const savedEmail = await AsyncStorage.getItem('userEmail');
    const savedBiometric = await AsyncStorage.getItem('biometricUnlock');
    const saved2FA = await AsyncStorage.getItem('twoFactorEnabled');
    const savedEmailVerified = await AsyncStorage.getItem('emailVerified');

    setFullName(savedName || 'User');
    setEmail(savedEmail || '');
    setBiometricUnlock(savedBiometric === 'true');
    setTwoFactorEnabled(saved2FA === 'true');
    setEmailVerified(savedEmailVerified === 'true');

    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricAvailable(compatible && enrolled);

    try {
      const subscription = await api.getSubscription();
      setPlan(subscription.plan || 'FREE');
    } catch {
      setPlan('FREE');
    }

    try {
      const securitySettings = await api.getSecuritySettings();
      setEmailVerified(Boolean(securitySettings.emailVerified));
      setTwoFactorEnabled(Boolean(securitySettings.twoFactorEnabled));
      await AsyncStorage.setItem('emailVerified', String(Boolean(securitySettings.emailVerified)));
      await AsyncStorage.setItem('twoFactorEnabled', String(Boolean(securitySettings.twoFactorEnabled)));
    } catch {
      // Keep the local value if the backend 2FA endpoint has not been added yet.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUserInfo();
    }, [loadUserInfo])
  );

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
      Alert.alert('Sign in required', 'Sign in once with your email and password first. Then come back and enable biometric unlock.');
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

  const handleTwoFactorToggle = async (value: boolean) => {
    try {
      setSaving2FA(true);

      if (value) {
        if (!emailVerified) {
          Alert.alert(
            'Verify your email first',
            'You must verify your email before turning on two-factor authentication.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Verify now',
                onPress: () =>
                  router.push({
                    pathname: '/verifyemail',
                    params: { email, next: 'userinfo' },
                  }),
              },
            ]
          );
          return;
        }

        Alert.alert(
          'Enable two-factor authentication?',
          'After this is enabled, login will require a one-time code in addition to your password.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Enable',
              onPress: async () => {
                try {
                  setSaving2FA(true);
                  await api.setTwoFactorEnabled(true);
                  await AsyncStorage.setItem('twoFactorEnabled', 'true');
                  setTwoFactorEnabled(true);
                  Alert.alert('2FA enabled', 'Your account now requires a verification code during login.');
                } catch (error: any) {
                  Alert.alert('Could not enable 2FA', error.message || 'Please try again.');
                } finally {
                  setSaving2FA(false);
                }
              },
            },
          ]
        );
        return;
      }

      Alert.alert(
        'Disable two-factor authentication?',
        'Your account will only require email and password to sign in.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: async () => {
              try {
                setSaving2FA(true);
                await api.setTwoFactorEnabled(false);
                await AsyncStorage.setItem('twoFactorEnabled', 'false');
                setTwoFactorEnabled(false);
                Alert.alert('2FA disabled', 'Two-factor authentication has been turned off.');
              } catch (error: any) {
                Alert.alert('Could not disable 2FA', error.message || 'Please try again.');
              } finally {
                setSaving2FA(false);
              }
            },
          },
        ]
      );
    } finally {
      setSaving2FA(false);
    }
  };

  const planLabel = plan.charAt(0) + plan.slice(1).toLowerCase();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.7} onPress={() => router.back()}>
            <ChevronLeft size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.title}>User Information</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(fullName, email)}</Text>
          </View>
          <Text style={styles.profileName}>{fullName}</Text>
          <Text style={styles.profileEmail}>{email || 'No email found'}</Text>
          <View style={[styles.planBadge, plan === 'FREE' && styles.freeBadge]}>
            <Text style={[styles.planBadgeText, plan === 'FREE' && styles.freeBadgeText]}>{planLabel} plan</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>ACCOUNT DETAILS</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowDivider]}>
            <View style={styles.iconCircle}><UserRound size={20} color={C.text} /></View>
            <View style={styles.rowTextBox}>
              <Text style={styles.rowLabel}>Username</Text>
              <Text style={styles.rowValue}>{fullName}</Text>
            </View>
          </View>

          <View style={[styles.row, styles.rowDivider]}>
            <View style={styles.iconCircle}><Mail size={20} color={C.text} /></View>
            <View style={styles.rowTextBox}>
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowValue}>{email || 'No email found'}</Text>
              <Text style={styles.rowSub}>{emailVerified ? 'Verified' : 'Not verified'}</Text>
            </View>
            {!emailVerified && (
              <TouchableOpacity
                onPress={() =>
                    router.push({
                    pathname: '/verifyemail',
                    params: {
                        email,
                        next: 'userinfo',
                        autoSend: 'true',
                    },
                    })
                }
                disabled={!email || emailVerified}
                >
                <Text style={{ color: emailVerified ? C.textSecondary : C.primary, fontWeight: '800' }}>
                    {emailVerified ? 'Verified' : 'Verify'}
                </Text>
            </TouchableOpacity>
            )}
          </View>

          <View style={styles.row}>
            <View style={styles.iconCircle}><ShieldCheck size={20} color={C.text} /></View>
            <View style={styles.rowTextBox}>
              <Text style={styles.rowLabel}>Subscription status</Text>
              <Text style={styles.rowValue}>{planLabel}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>SECURITY</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowDivider]}>
            <View style={styles.iconCircle}><Fingerprint size={20} color={C.text} /></View>
            <View style={styles.rowTextBox}>
              <Text style={styles.rowLabel}>Biometric status</Text>
              <Text style={styles.rowSub}>{biometricUnlock ? 'On' : 'Off'}</Text>
            </View>
            <Switch
              value={biometricUnlock}
              onValueChange={handleBiometricToggle}
              trackColor={{ false: C.border, true: C.primary }}
              thumbColor="#fff"
              ios_backgroundColor={C.border}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.iconCircle}><KeyRound size={20} color={C.text} /></View>
            <View style={styles.rowTextBox}>
              <Text style={styles.rowLabel}>Two-factor authentication</Text>
              <Text style={styles.rowSub}>{twoFactorEnabled ? 'On. Login requires a code.' : 'Off. Login uses password only.'}</Text>
            </View>
            <Switch
              value={twoFactorEnabled}
              onValueChange={handleTwoFactorToggle}
              disabled={saving2FA}
              trackColor={{ false: C.border, true: C.primary }}
              thumbColor="#fff"
              ios_backgroundColor={C.border}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    scrollContent: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40 },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundElement,
      marginRight: 12,
    },
    title: { fontSize: 26, fontWeight: '800', color: C.text },
    profileCard: {
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      padding: 22,
      marginBottom: 24,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    avatarText: { color: '#fff', fontWeight: '800', fontSize: 24 },
    profileName: { fontSize: 20, fontWeight: '800', color: C.text },
    profileEmail: { fontSize: 14, color: C.textSecondary, marginTop: 4 },
    planBadge: { backgroundColor: C.securityScoreBg, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, marginTop: 14 },
    planBadgeText: { fontSize: 13, fontWeight: '800', color: C.warning },
    freeBadge: { backgroundColor: C.backgroundSelected },
    freeBadgeText: { color: C.textSecondary },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: C.textSecondary,
      letterSpacing: 0.6,
      marginBottom: 8,
      marginLeft: 4,
    },
    card: { backgroundColor: C.backgroundElement, borderRadius: 20, marginBottom: 24, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 14 },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    iconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    rowTextBox: { flex: 1 },
    rowLabel: { fontSize: 15, color: C.text, fontWeight: '700' },
    rowValue: { fontSize: 14, color: C.textSecondary, marginTop: 3 },
    rowSub: { fontSize: 12, color: C.textSecondary, marginTop: 3, lineHeight: 16 },
    smallButton: { backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
    smallButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  });
