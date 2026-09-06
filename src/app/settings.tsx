import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  Bug,
  ChevronRight,
  FileText,
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
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme, type ThemeMode } from '../context/ThemeContext';
import type { ThemePalette } from '../constants/theme';
import { useBlurTarget } from '../context/BlurTargetContext';
import { api, logout } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi, useCancelableRequest } from '../hooks/useCancelableApi';
import {
  clearOfflineVaultSnapshot,
  getOfflineVaultStatus,
} from '../services/offlineVault';
import type { OfflineVaultStatus } from '../services/offlineVault';
import {
  clearBiometricCredentials,
  saveBiometricCredentials,
  setBiometricEnabled,
} from '../utils/secureAuth';
import {
  getHapticsEnabledPreference,
  hapticLight,
  hapticMedium,
  hapticToggleOff,
  hapticToggleOn,
  hapticWarning,
  setHapticsEnabledPreference,
} from '../utils/haptics';
import { useScreenAlert } from '../hooks/useScreenAlert';

const AUTO_LOCK_ON_APP_CLOSE = -1;

const TIMEOUT_OPTIONS = [
  { label: 'When app closes', value: AUTO_LOCK_ON_APP_CLOSE },
  { label: '30 seconds', value: 30000 },
  { label: '1 minute', value: 60000 },
  { label: '3 minutes', value: 180000 },
  { label: '5 minutes', value: 300000 },
];


const THEME_OPTIONS: {
  label: string;
  value: ThemeMode;
}[] = [
  {
    label: 'System',
    value: 'system',
  },
  {
    label: 'Light',
    value: 'light',
  },
  {
    label: 'Dark',
    value: 'dark',
  },
  {
    label: 'OLED',
    value: 'oled',
  },
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
  C: ThemePalette;
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
            {/* <View style={[localStyles.loadingDot, { backgroundColor: C.primary }]} /> */}
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
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const runCancelable = useCancelableRequest();
  const blurTarget = useBlurTarget();
  const { mode, isDark, isOled, setThemeMode, colors: C } = useAppTheme();
  const styles = makeStyles(C, isDark, isOled);

  const [fullName, setFullName] = useState('User');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<SubscriptionPlan>('FREE');
  const [planLoading, setPlanLoading] = useState(true);
  const [biometricUnlock, setBiometricUnlock] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [, setSelectedTimeout] = useState(TIMEOUT_OPTIONS[1]);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [lockingVault, setLockingVault] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [offlineStatus, setOfflineStatus] = useState<OfflineVaultStatus | null>(null);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  const loadSettings = useCallback(async () => {
    const savedName = await AsyncStorage.getItem('userName');
    const savedEmail = await AsyncStorage.getItem('userEmail');
    const savedBiometric = await AsyncStorage.getItem('biometricUnlock');
    const savedTimeout = await AsyncStorage.getItem('autoLockTimeout');
    const savedHapticsEnabled = await getHapticsEnabledPreference();

    setFullName(savedName || 'User');
    setEmail(savedEmail || '');
    setBiometricUnlock(savedBiometric === 'true');
    setHapticsEnabled(savedHapticsEnabled);

    if (savedTimeout) {
      const parsedTimeout = savedTimeout === 'app_close'
        ? AUTO_LOCK_ON_APP_CLOSE
        : Number(savedTimeout);

      const found = TIMEOUT_OPTIONS.find(
        (option) => option.value === parsedTimeout
      );

      setSelectedTimeout(found || TIMEOUT_OPTIONS[1]);
    } else {
      setSelectedTimeout(TIMEOUT_OPTIONS[1]);
    }

    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricAvailable(compatible && enrolled);

    try {
      setOfflineStatus(await getOfflineVaultStatus());
    } catch (error) {
    if (isScreenRequestCancelled(error)) return;
      setOfflineStatus(null);
    }

    try {
      setPlanLoading(true);

      const subscription = await requestApi.getSubscription();
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
    } catch (error) {
    if (isScreenRequestCancelled(error)) return;
      setPlan('FREE');
    } finally {
      setPlanLoading(false);
    }
  }, [requestApi]);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings])
  );

  const lockVault = useCallback(async () => {
    if (lockingVault) return;

    try {
      setLockingVault(true);
      await AsyncStorage.setItem('vaultLocked', 'true');
      await runCancelable(() => logout());
      router.replace('/signin');
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) return;

      screenAlert(
        'Could not lock vault',
        error?.message || 'Please try again.'
      );
    } finally {
      setLockingVault(false);
    }
  }, [lockingVault, runCancelable, screenAlert]);

  const handleBiometricToggle = async (value: boolean) => {
    if (biometricLoading) return;

    if (value && !biometricAvailable) {
      screenAlert(
        'Not available',
        'Your device does not support biometric authentication or no fingerprint/face is enrolled.'
      );
      return;
    }

    setBiometricLoading(true);

    try {
      if (!value) {
        hapticToggleOff();
        await setBiometricEnabled(false);
        await clearBiometricCredentials();
        setBiometricUnlock(false);
        return;
      }

      /*
       * SecureStore owns the biometric prompt for the device-bound credential.
       * Calling a separate LocalAuthentication prompt here caused two
       * back-to-back biometric prompts on Android.
       */
      await saveBiometricCredentials(email);
      await setBiometricEnabled(true);
      setBiometricUnlock(true);
      hapticToggleOn();
    } catch (error: any) {
      if (value) {
        setBiometricUnlock(false);
        await setBiometricEnabled(false).catch(() => undefined);
      } else {
        setBiometricUnlock(true);
      }

      screenAlert(
        value ? 'Could not enable biometrics' : 'Could not disable biometrics',
        error?.message ||
          (value
            ? 'Biometric confirmation was cancelled or could not be completed.'
            : 'Biometric unlock could not be disabled. Please try again.')
      );
    } finally {
      setBiometricLoading(false);
    }
  };

  const handleLockNow = () => {
    if (lockingVault) return;

    screenAlert(
      'Lock Vault',
      'This will log you out and require sign in again. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Lock', style: 'destructive', onPress: lockVault },
      ]
    );
  };

  const handleHapticsToggle = async (value: boolean) => {
    if (value) {
      await setHapticsEnabledPreference(true);
      setHapticsEnabled(true);
      hapticToggleOn();
      return;
    }

    hapticToggleOff();
    setHapticsEnabled(false);
    await setHapticsEnabledPreference(false);
  };


  const handleThemeSelect = async (nextMode: ThemeMode) => {
    if (nextMode === mode) {
      hapticLight();
      return;
    }

    await setThemeMode(nextMode);
    hapticMedium();
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
      screenAlert('Password required', 'Enter your account password to continue.');
      return;
    }

    if (cleanConfirm !== 'DELETE') {
      screenAlert('Confirmation required', 'Type DELETE to confirm account deletion.');
      return;
    }

    screenAlert(
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

              await requestApi.deleteAccount({ password: cleanPassword });

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

              await runCancelable(() => logout());

              setDeleteModalVisible(false);
              setDeletePassword('');
              setDeleteConfirmText('');

              screenAlert(
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
    if (isScreenRequestCancelled(error)) return;
              screenAlert(
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

  const handleClearOfflineVault = () => {
    if (!offlineStatus?.hasSnapshot) {
      screenAlert('Offline vault', 'There is no offline vault snapshot saved on this device yet.');
      return;
    }

    screenAlert(
      'Clear offline vault?',
      'This removes the encrypted offline copy of passwords, card details, SecureNote contents, and document metadata from this device only. Your online vault will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearOfflineVaultSnapshot();
            setOfflineStatus(await getOfflineVaultStatus());
            screenAlert('Offline vault cleared', 'The encrypted offline vault copy was removed from this device.');
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    if (deleteAccountLoading) return;

    screenAlert(
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
            onPress={() => { hapticLight(); router.push('/userinfo'); }}
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
              onPress={() => { hapticLight(); router.push('/autolock'); }}
            >
              <View style={styles.iconCircle}>
                <Lock size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Auto-lock timeout</Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <View style={[styles.row, styles.rowDivider]}>
              <View style={styles.iconCircle}>
                <Fingerprint size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Biometric unlock</Text>
              </View>

              <View
                style={styles.biometricControl}
                accessibilityLiveRegion="polite"
                accessibilityState={{ busy: biometricLoading }}
              >
                {biometricLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={C.primary}
                    accessibilityLabel={
                      biometricUnlock
                        ? 'Disabling biometric unlock'
                        : 'Enabling biometric unlock'
                    }
                  />
                ) : (
                  <Switch
                    value={biometricUnlock}
                    onValueChange={handleBiometricToggle}
                    trackColor={{ false: C.border, true: C.primary }}
                    thumbColor="#fff"
                    ios_backgroundColor={C.border}
                    disabled={biometricLoading}
                  />
                )}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.row, styles.rowDivider]}
              activeOpacity={0.6}
              onPress={() => { hapticLight(); router.push('/twofasetup'); }}
            >
              <View style={styles.iconCircle}>
                <KeyRound size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Two-factor authentication</Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, styles.rowDivider]}
              activeOpacity={0.6}
              onPress={() => { hapticLight(); router.push('/recoverykit'); }}
            >
              <View style={styles.iconCircle}>
                <Ionicons name="medkit-outline" size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Recovery kit</Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, styles.rowDivider]}
              activeOpacity={0.6}
              onPress={() => { hapticLight(); router.push('/autofill'); }}
            >
              <View style={styles.iconCircle}>
                <Wand2 size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Auto-fill</Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, styles.rowDivider]}
              activeOpacity={0.6}
              onPress={() => { hapticLight(); router.push('/devices'); }}
            >
              <View style={styles.iconCircle}>
                <Smartphone size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Trusted devices</Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => { hapticLight(); router.push('/emergencyaccess'); }}
            >
              <View style={styles.iconCircle}>
                <ShieldAlert size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Emergency access</Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>PREFERENCES</Text>

          <View style={styles.card}>
            <View style={[styles.preferenceBlock, styles.rowDivider]}>
              <View style={styles.preferenceHeader}>
                <View style={styles.iconCircle}>
                  <Palette size={20} color={iconColor} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>Appearance</Text>
                </View>
              </View>

              <View style={styles.themePicker}>
                {THEME_OPTIONS.map((option) => {
                  const selected = mode === option.value;

                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.themeOption,
                        selected && styles.themeOptionSelected,
                      ]}
                      activeOpacity={0.82}
                      onPress={() => handleThemeSelect(option.value)}
                      accessibilityRole="radio"
                      accessibilityLabel={`${option.label} appearance`}
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          styles.themeOptionLabel,
                          selected && styles.themeOptionLabelSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={[styles.row, styles.rowDivider]}>
              <View style={styles.iconCircle}>
                <Ionicons name="pulse-outline" size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Haptic feedback</Text>
              </View>

              <Switch
                value={hapticsEnabled}
                onValueChange={handleHapticsToggle}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#fff"
                ios_backgroundColor={C.border}
              />
            </View>

            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => { hapticLight(); router.push('/notificationpreferences'); }}
            >
              <View style={styles.iconCircle}>
                <Bell size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Notifications</Text>
                {/* <Text style={styles.rowValue}>
                  Push delivery and alert categories
                </Text> */}
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>DATA</Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.row, styles.rowDivider]}
              activeOpacity={0.6}
              onPress={() => { hapticLight(); router.push('/backup'); }}
            >
              <View style={styles.iconCircle}>
                <CloudUpload size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Backup</Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, styles.rowDivider]}
              activeOpacity={0.6}
              onPress={() => { hapticWarning(); handleClearOfflineVault(); }}
            >
              <View style={styles.iconCircle}>
                <Ionicons name="archive-outline" size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Offline vault</Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => { hapticLight(); router.push('/subscription?from=settings'); }}
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
              onPress={() => { hapticLight(); router.push('/about'); }}
            >
              <View style={styles.iconCircle}>
                <Info size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>About The Guardian</Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>LEGAL</Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.row, styles.rowDivider]}
              activeOpacity={0.6}
              onPress={() => { hapticLight(); router.push('/privacy'); }}
            >
              <View style={styles.iconCircle}>
                <ShieldAlert size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Privacy Policy</Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => { hapticLight(); router.push('/terms'); }}
            >
              <View style={styles.iconCircle}>
                <FileText size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Terms of Service</Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          {/* TEMP ONBOARDING PREVIEW BUTTON
              Keep this block enabled while reviewing the onboarding experience.
              Comment out or delete this entire block before release. */}
          {/* <Text style={styles.sectionLabel}>ONBOARDING PREVIEW</Text> */}

          {/* <View style={styles.card}>
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => {
                hapticLight();
                router.push('/verification?from=settings&preview=1');
              }}
            > */}
              {/* <View style={styles.iconCircle}>
                <Ionicons name="shield-checkmark-outline" size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{`Preview onboarding \n(For Beta testers)`}</Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View> */}
          {/* END TEMP ONBOARDING PREVIEW BUTTON */}

          <Text style={styles.sectionLabel}>SUPPORT</Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => { hapticLight(); router.push('/bugreport'); }}
            >
              <View style={styles.iconCircle}>
                <Bug size={20} color={iconColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Report a bug</Text>
              </View>

              <ChevronRight size={20} color={C.tabInactive} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>DANGER ZONE</Text>

          <View style={styles.dangerCard}>
            <TouchableOpacity
              style={[styles.row, styles.dangerRowDivider]}
              activeOpacity={0.6}
              onPress={() => { hapticWarning(); handleLockNow(); }}
              disabled={lockingVault}
              accessibilityRole="button"
              accessibilityState={{ disabled: lockingVault, busy: lockingVault }}
              accessibilityLabel={lockingVault ? 'Locking vault' : 'Lock vault now'}
            >
              <View style={styles.dangerIconCircle}>
                {lockingVault ? (
                  <ActivityIndicator size="small" color={C.danger} />
                ) : (
                  <LockKeyhole size={20} color={C.danger} />
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.dangerRowLabel}>
                  {lockingVault ? 'Locking vault...' : 'Lock vault now'}
                </Text>
              </View>

              {!lockingVault && (
                <ChevronRight size={20} color={C.danger} style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => { hapticWarning(); handleDeleteAccount(); }}
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
        statusBarTranslucent
        onRequestClose={closeDeleteModal}
      >
        <View style={styles.modalOverlay}>
          {blurTarget?.targetRef ? (
            <BlurView
              blurTarget={blurTarget.targetRef}
              blurMethod={
                Platform.OS === 'android'
                  ? ('dimezisBlurViewSdk31Plus' as any)
                  : undefined
              }
              blurReductionFactor={Platform.OS === 'android' ? 2 : undefined}
              intensity={Platform.OS === 'android' ? 12 : 22}
              tint={isDark ? 'dark' : 'light'}
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View pointerEvents="none" style={styles.modalFallbackBlur} />
          )}

          <View pointerEvents="none" style={styles.modalBackdrop} />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
            style={styles.modalKeyboard}
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
              onPress={() => { hapticWarning(); performDeleteAccount(); }}
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
              onPress={() => { hapticLight(); closeDeleteModal(); }}
              disabled={deleteAccountLoading}
              activeOpacity={0.75}
            >
              <Text style={styles.deleteCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
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

const makeStyles = (C: ThemePalette, isDark: boolean, isOled: boolean) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    scrollContent: {
      marginTop: 35,
      paddingHorizontal: 18,
      paddingTop: 0,
      paddingBottom: 175,
    },
    title: {
      fontSize: 36,
      fontWeight: '900',
      color: C.text,
      marginBottom: 18,
      letterSpacing: -0.7,
    },
    accountCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 28,
      padding: 16,
      marginBottom: 18,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 20,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 13,
    },
    avatarText: { color: '#fff', fontWeight: '900', fontSize: 15 },
    accountInfo: { flex: 1 },
    accountName: { fontSize: 17, fontWeight: '900', color: C.text, letterSpacing: -0.2 },
    accountEmail: { fontSize: 13, color: C.textSecondary, marginTop: 3, fontWeight: '600' },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '900',
      color: C.textSecondary,
      letterSpacing: 0.7,
      marginBottom: 10,
      marginLeft: 4,
      textTransform: 'uppercase',
    },
    card: {
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      marginBottom: 26,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.025,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    row: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 11,
      paddingHorizontal: 16,
    },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    biometricControl: {
      width: 52,
      minHeight: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCircle: {
      width: 42,
      height: 42,
      borderRadius: 17,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    rowHelper: { color: C.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 },
    rowValue: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 3,
      flexShrink: 1,
    },
    rowLabel: {
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
      color: C.text,
      fontWeight: '900',
      textAlign: 'left',
      textAlignVertical: 'center',
      includeFontPadding: false,
    },
    preferenceBlock: { paddingVertical: 16, paddingHorizontal: 16 },
    preferenceHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    themePicker: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: C.background,
      padding: 5,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
    },
    themeOption: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    themeOptionSelected: {
      backgroundColor: C.primary,
      shadowColor: C.primary,
      shadowOpacity: 0.10,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    themeOptionLabel: {
      color: C.text,
      fontSize: 13,
      fontWeight: '900',
    },
    themeOptionLabelSelected: { color: '#FFFFFF' },
    modalOverlay: {
      flex: 1,
    },
    modalFallbackBlur: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isOled
        ? 'rgba(0,0,0,0.82)'
        : isDark
          ? 'rgba(2,6,23,0.72)'
          : 'rgba(15,23,42,0.24)',
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isOled
        ? 'rgba(0,0,0,0.48)'
        : isDark
          ? 'rgba(0,0,0,0.35)'
          : 'rgba(0,0,0,0.18)',
    },
    modalKeyboard: {
      flex: 1,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 22,
    },
    deleteModalCard: {
      width: '100%',
      backgroundColor: C.backgroundElement,
      borderRadius: 28,
      padding: 22,
      borderWidth: 1,
      borderColor: C.danger,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    deleteModalIcon: {
      width: 56,
      height: 56,
      borderRadius: 22,
      backgroundColor: C.alertDangerBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    deleteModalTitle: { color: C.text, fontSize: 22, fontWeight: '900', marginBottom: 8 },
    deleteModalText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 18, fontWeight: '600' },
    deleteInputLabel: { color: C.text, fontSize: 13, fontWeight: '900', marginBottom: 8 },
    deleteInput: {
      backgroundColor: C.background,
      color: C.text,
      borderRadius: 17,
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

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    deleteDisabledButton: { opacity: 0.65 },
    deleteConfirmButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
    deleteCancelButton: { alignItems: 'center', paddingVertical: 13, marginTop: 8 },
    deleteCancelButtonText: { color: C.textSecondary, fontSize: 14, fontWeight: '900' },
    dangerCard: {
      backgroundColor: C.alertDangerBg,
      borderRadius: 24,
      marginBottom: 26,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.danger,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    dangerRowDivider: { borderBottomWidth: 1, borderBottomColor: C.danger },
    dangerIconCircle: {
      width: 42,
      height: 42,
      borderRadius: 17,
      backgroundColor: C.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    dangerRowLabel: {
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
      color: C.danger,
      fontWeight: '900',
      textAlign: 'left',
      textAlignVertical: 'center',
      includeFontPadding: false,
    },
  });