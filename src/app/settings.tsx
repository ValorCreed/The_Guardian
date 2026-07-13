import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Easing,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import {
  Bell,
  ChevronRight,
  CloudUpload,
  Crown,
  Fingerprint,
  Info,
  Lock,
  LockKeyhole,
  KeyRound,
  Palette,
  ShieldAlert,
  Smartphone,
  Trash2,
  Wand2,
} from 'lucide-react-native';

import { useAppTheme } from '../context/ThemeContext';
import { useBlurTarget } from '../context/BlurTargetContext';
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

type SubscriptionPlan = 'FREE' | 'PREMIUM' | 'FAMILY';

const getInitials = (name: string, email: string) => {
  const source = name || email || 'User';
  const parts = source.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
};

function PlanBadge({
  plan,
  loading,
  C,
  isDark,
}: {
  plan: SubscriptionPlan;
  loading: boolean;
  C: any;
  isDark: boolean;
}) {
  const blurTarget = useBlurTarget();

  const pulseOpacity = useRef(new Animated.Value(0.45)).current;
  const pulseScale = useRef(new Animated.Value(0.96)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (loading) {
      badgeOpacity.setValue(0);
      badgeScale.setValue(0.92);

      const pulse = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseOpacity, {
              toValue: 1,
              duration: 650,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(pulseScale, {
              toValue: 1.04,
              duration: 650,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(pulseOpacity, {
              toValue: 0.45,
              duration: 650,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(pulseScale, {
              toValue: 0.96,
              duration: 650,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ])
      );

      pulse.start();

      return () => {
        pulse.stop();
      };
    }

    Animated.parallel([
      Animated.timing(badgeOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(badgeScale, {
        toValue: 1,
        friction: 7,
        tension: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [loading, badgeOpacity, badgeScale, pulseOpacity, pulseScale]);

  const planLabel = plan.charAt(0) + plan.slice(1).toLowerCase();

  const isFree = plan === 'FREE';
  const isFamily = plan === 'FAMILY';

  const badgeBackground = isFree
    ? C.backgroundSelected
    : isFamily
      ? C.primary
      : C.securityScoreBg;

  const badgeTextColor = isFree
    ? C.textSecondary
    : isFamily
      ? '#FFFFFF'
      : C.warning;

  const loadingBorderColor = isDark
    ? 'rgba(255,255,255,0.14)'
    : 'rgba(255,255,255,0.75)';

  const loadingBackground = isDark
    ? 'rgba(255,255,255,0.08)'
    : 'rgba(255,255,255,0.46)';

  if (loading) {
    return (
      <Animated.View
        style={[
          localStyles.loadingBadgeWrap,
          {
            opacity: pulseOpacity,
            transform: [{ scale: pulseScale }],
          },
        ]}
      >
        {Platform.OS === 'ios' ? (
          <BlurView
            blurTarget={blurTarget?.targetRef}
            intensity={18}
            tint={isDark ? 'dark' : 'light'}
            style={[
              localStyles.loadingBadge,
              {
                borderColor: loadingBorderColor,
                backgroundColor: loadingBackground,
              },
            ]}
          >
            <View style={[localStyles.loadingDot, { backgroundColor: C.primary }]} />
            <Text style={[localStyles.loadingText, { color: C.textSecondary }]}>
              Loading
            </Text>
          </BlurView>
        ) : (
          <View
            style={[
              localStyles.loadingBadge,
              {
                borderColor: loadingBorderColor,
                backgroundColor: loadingBackground,
              },
            ]}
          >
            <View style={[localStyles.loadingDot, { backgroundColor: C.primary }]} />
            <Text style={[localStyles.loadingText, { color: C.textSecondary }]}>
              Loading
            </Text>
          </View>
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        localStyles.loadedBadge,
        {
          opacity: badgeOpacity,
          transform: [{ scale: badgeScale }],
          backgroundColor: badgeBackground,
        },
      ]}
    >
      <Text style={[localStyles.loadedBadgeText, { color: badgeTextColor }]}>
        {planLabel}
      </Text>
    </Animated.View>
  );
}

export default function SettingsScreen() {
  const { isDark, toggleTheme, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [fullName, setFullName] = useState('User');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<SubscriptionPlan>('FREE');
  const [planLoading, setPlanLoading] = useState(true);
  const [biometricUnlock, setBiometricUnlock] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [selectedTimeout, setSelectedTimeout] = useState(TIMEOUT_OPTIONS[1]);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const loadSettings = useCallback(async () => {
    const savedName = await AsyncStorage.getItem('userName');
    const savedEmail = await AsyncStorage.getItem('userEmail');
    const savedBiometric = await AsyncStorage.getItem('biometricUnlock');
    const savedTimeout = await AsyncStorage.getItem('autoLockTimeout');

    setFullName(savedName || 'User');
    setEmail(savedEmail || '');
    setBiometricUnlock(savedBiometric === 'true');

    if (savedTimeout) {
      const found = TIMEOUT_OPTIONS.find(
        (option) => option.value === Number(savedTimeout)
      );

      if (found) {
        setSelectedTimeout(found);
      }
    }

    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricAvailable(compatible && enrolled);

    try {
      setPlanLoading(true);

      const subscription = await api.getSubscription();
      const loadedPlan = subscription.plan || 'FREE';

      if (
        loadedPlan === 'FREE' ||
        loadedPlan === 'PREMIUM' ||
        loadedPlan === 'FAMILY'
      ) {
        setPlan(loadedPlan);
      } else {
        setPlan('FREE');
      }
    } catch {
      setPlan('FREE');
    } finally {
      setPlanLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings])
  );

  const lockVault = useCallback(async () => {
    await AsyncStorage.setItem('vaultLocked', 'true');
    await logout();
    router.replace('/signin');
  }, []);

  const handleBiometricToggle = async (value: boolean) => {
    if (!value) {
      setBiometricUnlock(false);
      await setBiometricEnabled(false);
      await clearBiometricCredentials();
      return;
    }

    if (!biometricAvailable) {
      Alert.alert(
        'Not available',
        'Your device does not support biometric authentication or no fingerprint/face is enrolled.'
      );
      return;
    }

    const hasCredentials = await hasBiometricCredentials();

    if (!hasCredentials) {
      Alert.alert(
        'Sign in required',
        'Perform a manual login with your email and password. Then come back and enable this toggle.'
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
    Alert.alert(
      'Lock Vault',
      'This will log you out and require sign in again. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Lock', style: 'destructive', onPress: lockVault },
      ]
    );
  };

  const closeDeleteModal = () => {
    if (deleteAccountLoading) return;

    setDeleteModalVisible(false);
    setDeletePassword('');
    setDeleteConfirmText('');
  };

  const performDeleteAccount = async () => {
    if (deleteAccountLoading) return;

    const cleanPassword = deletePassword;
    const cleanConfirm = deleteConfirmText.trim().toUpperCase();

    if (!cleanPassword) {
      Alert.alert('Password required', 'Enter your account password to continue.');
      return;
    }

    if (cleanConfirm !== 'DELETE') {
      Alert.alert('Confirmation required', 'Type DELETE to confirm account deletion.');
      return;
    }

    Alert.alert(
      'Delete account permanently?',
      'This will permanently remove your account and vault data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleteAccountLoading(true);

              await api.deleteAccount({ password: cleanPassword });

              await clearBiometricCredentials();
              await setBiometricEnabled(false);
              await AsyncStorage.multiRemove([
                'token',
                'userName',
                'userEmail',
                'subscriptionPlan',
                'emailVerified',
                'twoFactorEnabled',
                'vaultLocked',
                'biometricUnlock',
                'autoLockTimeout',
              ]);

              await logout();

              setDeleteModalVisible(false);
              setDeletePassword('');
              setDeleteConfirmText('');

              Alert.alert(
                'Account deleted',
                'Your account and vault data have been deleted.',
                [
                  {
                    text: 'OK',
                    onPress: () => router.replace('/login'),
                  },
                ]
              );
            } catch (error: any) {
              Alert.alert(
                'Could not delete account',
                error.message || 'Something went wrong. Please try again.'
              );
            } finally {
              setDeleteAccountLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    if (deleteAccountLoading) return;

    Alert.alert(
      'Delete Account',
      'For your safety, you will need to enter your account password and type DELETE before this account can be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => setDeleteModalVisible(true),
        },
      ]
    );
  };

  const iconColor = C.text;
  const destructiveIconColor = C.danger;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Settings</Text>

          <TouchableOpacity
            style={styles.accountCard}
            activeOpacity={0.75}
            onPress={() => router.push('/userinfo')}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(fullName, email)}</Text>
            </View>

            <View style={styles.accountInfo}>
              <Text style={styles.accountName}>{fullName}</Text>
              <Text style={styles.accountEmail}>{email || 'No email found'}</Text>
            </View>

            <PlanBadge plan={plan} loading={planLoading} C={C} isDark={isDark} />

            <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 8 }} />
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>SECURITY</Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.row, styles.rowDivider]}
              activeOpacity={0.6}
              onPress={() => router.push('/autolock')}
            >
              <View style={styles.iconCircle}>
                <Lock size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Auto-lock timeout</Text>
                <Text style={styles.rowSub}>
                  Locks after leaving app for {selectedTimeout.label}
                </Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <View style={[styles.row, styles.rowDivider]}>
              <View style={styles.iconCircle}>
                <Fingerprint size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Biometric unlock</Text>
                <Text style={styles.rowSub}>
                  Uses saved login credentials after biometric approval
                </Text>
              </View>

              <Switch
                value={biometricUnlock}
                onValueChange={handleBiometricToggle}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#fff"
                ios_backgroundColor={C.border}
              />
            </View>

            <TouchableOpacity
              style={[styles.row, styles.rowDivider]}
              activeOpacity={0.6}
              onPress={() => router.push('/twofasetup')}
            >
              <View style={styles.iconCircle}>
                <KeyRound size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Two-factor authentication</Text>
                <Text style={styles.rowSub}>
                  Adds extra verification during sign in
                </Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, styles.rowDivider]}
              activeOpacity={0.6}
              onPress={() => router.push('/autofill')}
            >
              <View style={styles.iconCircle}>
                <Wand2 size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Auto-fill</Text>
                <Text style={styles.rowSub}>
                  Sync saved logins and enable Android Autofill
                </Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, styles.rowDivider]}
              activeOpacity={0.6}
              onPress={() => router.push('/devices')}
            >
              <View style={styles.iconCircle}>
                <Smartphone size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Trusted devices</Text>
                <Text style={styles.rowSub}>
                  Review active sessions and log out devices you do not recognize
                </Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => router.push('/emergencyaccess')}
            >
              <View style={styles.iconCircle}>
                <ShieldAlert size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Emergency access</Text>
                <Text style={styles.rowSub}>
                  Add trusted contacts and manage emergency vault requests
                </Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>PREFERENCES</Text>

          <View style={styles.card}>
            <View style={[styles.row, styles.rowDivider]}>
              <View style={styles.iconCircle}>
                <Palette size={20} color={iconColor} />
              </View>

              <Text style={styles.rowLabel}>Dark mode</Text>

              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#fff"
                ios_backgroundColor={C.border}
              />
            </View>

            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => router.push('/notifications')}
            >
              <View style={styles.iconCircle}>
                <Bell size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Notifications</Text>
                <Text style={styles.rowSub}>
                  Subscription, backup, vault, and family alerts
                </Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>DATA</Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.row, styles.rowDivider]}
              activeOpacity={0.6}
              onPress={() => router.push('/backup')}
            >
              <View style={styles.iconCircle}>
                <CloudUpload size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Backup</Text>
                <Text style={styles.rowSub}>
                  Encrypted vault export for Premium and Family accounts
                </Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => router.push('/subscription')}
            >
              <View style={styles.iconCircle}>
                <Crown size={20} color={iconColor} />
              </View>

              <Text style={styles.rowLabel}>Subscription</Text>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>ABOUT</Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => router.push('/about')}
            >
              <View style={styles.iconCircle}>
                <Info size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>About The Guardian</Text>
                <Text style={styles.rowSub}>
                  App version, developers, and company information
                </Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>DANGER ZONE</Text>

          <View style={styles.dangerCard}>
            <TouchableOpacity
              style={[styles.row, styles.dangerRowDivider]}
              activeOpacity={0.6}
              onPress={handleLockNow}
            >
              <View style={styles.dangerIconCircle}>
                <LockKeyhole size={20} color={C.danger} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.dangerRowLabel}>Lock vault now</Text>
                <Text style={styles.dangerRowSub}>
                  Logs you out and requires sign in again
                </Text>
              </View>

              <ChevronRight size={20} color={C.danger} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={handleDeleteAccount}
              disabled={deleteAccountLoading}
            >
              <View style={styles.dangerIconCircle}>
                {deleteAccountLoading ? (
                  <ActivityIndicator size="small" color={C.danger} />
                ) : (
                  <Trash2 size={20} color={destructiveIconColor} />
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.dangerRowLabel}>
                  {deleteAccountLoading ? 'Deleting account...' : 'Delete account'}
                </Text>
                <Text style={styles.dangerRowSub}>
                  Permanently removes your account and vault data
                </Text>
              </View>

              <ChevronRight size={20} color={C.danger} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.deleteModalCard}>
            <View style={styles.deleteModalIcon}>
              <Trash2 size={26} color={C.danger} />
            </View>

            <Text style={styles.deleteModalTitle}>Verify account deletion</Text>
            <Text style={styles.deleteModalText}>
              Enter your account password and type DELETE to permanently remove this account.
            </Text>

            <Text style={styles.deleteInputLabel}>Account password</Text>
            <TextInput
              style={styles.deleteInput}
              value={deletePassword}
              onChangeText={setDeletePassword}
              placeholder="Enter your password"
              placeholderTextColor={C.tabInactive}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.deleteInputLabel}>Type DELETE</Text>
            <TextInput
              style={styles.deleteInput}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="DELETE"
              placeholderTextColor={C.tabInactive}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[
                styles.deleteConfirmButton,
                deleteAccountLoading && styles.deleteDisabledButton,
              ]}
              onPress={performDeleteAccount}
              disabled={deleteAccountLoading}
              activeOpacity={0.82}
            >
              {deleteAccountLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Trash2 size={18} color="#FFFFFF" />
              )}
              <Text style={styles.deleteConfirmButtonText}>
                {deleteAccountLoading ? 'Deleting...' : 'Delete account permanently'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteCancelButton}
              onPress={closeDeleteModal}
              disabled={deleteAccountLoading}
              activeOpacity={0.75}
            >
              <Text style={styles.deleteCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  loadingBadgeWrap: {
    minWidth: 88,
    height: 31,
    borderRadius: 16,
    overflow: 'hidden',
  },

  loadingBadge: {
    minWidth: 88,
    height: 31,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 7,
  },

  loadingText: {
    fontSize: 12,
    fontWeight: '800',
  },

  loadedBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },

  loadedBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
});

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },

    scrollContent: {
      marginTop: 35,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 140,
    },

    title: {
      fontSize: 32,
      fontWeight: '700',
      color: C.text,
      marginBottom: 16,
    },

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

    avatarText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 15,
    },

    accountInfo: {
      flex: 1,
    },

    accountName: {
      fontSize: 16,
      fontWeight: '700',
      color: C.text,
    },

    accountEmail: {
      fontSize: 13,
      color: C.textSecondary,
      marginTop: 2,
    },

    sectionLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: C.textSecondary,
      letterSpacing: 0.5,
      marginBottom: 8,
      marginLeft: 4,
    },

    card: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      marginBottom: 24,
      overflow: 'hidden',
    },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 14,
    },

    rowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },

    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },

    rowLabel: {
      flex: 1,
      fontSize: 16,
      color: C.text,
      fontWeight: '500',
    },

    rowSub: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
      lineHeight: 16,
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.62)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 22,
    },

    deleteModalCard: {
      width: '100%',
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      padding: 20,
      borderWidth: 1,
      borderColor: C.danger,
    },

    deleteModalIcon: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: C.alertDangerBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },

    deleteModalTitle: {
      color: C.text,
      fontSize: 21,
      fontWeight: '900',
      marginBottom: 8,
    },

    deleteModalText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 18,
    },

    deleteInputLabel: {
      color: C.text,
      fontSize: 13,
      fontWeight: '800',
      marginBottom: 8,
    },

    deleteInput: {
      backgroundColor: C.background,
      color: C.text,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 14,
      fontSize: 15,
    },

    deleteConfirmButton: {
      backgroundColor: C.danger,
      borderRadius: 999,
      paddingVertical: 15,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      marginTop: 4,
    },

    deleteDisabledButton: {
      opacity: 0.65,
    },

    deleteConfirmButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '900',
    },

    deleteCancelButton: {
      alignItems: 'center',
      paddingVertical: 13,
      marginTop: 8,
    },

    deleteCancelButtonText: {
      color: C.textSecondary,
      fontSize: 14,
      fontWeight: '800',
    },

    dangerCard: {
      backgroundColor: C.alertDangerBg,
      borderRadius: 20,
      marginBottom: 24,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.danger,
    },

    dangerRowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: C.danger,
    },

    dangerIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },

    dangerRowLabel: {
      fontSize: 16,
      color: C.danger,
      fontWeight: '700',
    },

    dangerRowSub: {
      fontSize: 12,
      color: C.danger,
      marginTop: 2,
      lineHeight: 16,
      opacity: 0.85,
    },
  });