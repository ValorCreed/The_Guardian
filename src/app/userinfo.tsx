import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
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
import { ChevronRight, Fingerprint, KeyRound, Mail, Pencil, Smartphone, UserRound } from 'lucide-react-native';
import { useAppTheme } from '../context/ThemeContext';
import { useBlurTarget } from '../context/BlurTargetContext';
import { api } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import PulsingSkeleton from '../components/PulsingSkeleton';
import {
  clearBiometricCredentials,
  saveBiometricCredentials,
  setBiometricEnabled,
} from '../utils/secureAuth';
import { useScreenAlert } from '../hooks/useScreenAlert';

const getInitials = (name: string, email: string) => {
  const source = name || email || 'User';
  const parts = source.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

export default function UserInfoScreen() {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const blurTarget = useBlurTarget();
  const { mode, isDark, colors: C } = useAppTheme();
  const isOled = mode === 'oled';
  const styles = makeStyles(C, isDark, isOled);

  const [fullName, setFullName] = useState('User');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<'FREE' | 'PREMIUM' | 'FAMILY'>('FREE');
  const [biometricUnlock, setBiometricUnlock] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const hasLoadedRef = useRef(false);

  const loadUserInfo = useCallback(async (options?: {
    showLoader?: boolean;
    forceRefresh?: boolean;
  }) => {
    const showLoader = Boolean(options?.showLoader);
    const forceRefresh = Boolean(options?.forceRefresh);

    try {
      if (showLoader) setLoading(true);

      if (forceRefresh) {
        requestApi.clearCache();
      }

      const [
        savedName,
        savedEmail,
        savedBiometric,
        saved2FA,
        savedEmailVerified,
        compatible,
        enrolled,
      ] = await Promise.all([
        AsyncStorage.getItem('userName'),
        AsyncStorage.getItem('userEmail'),
        AsyncStorage.getItem('biometricUnlock'),
        AsyncStorage.getItem('twoFactorEnabled'),
        AsyncStorage.getItem('emailVerified'),
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);

      setFullName(savedName || 'User');
      setEmail(savedEmail || '');
      setBiometricUnlock(savedBiometric === 'true');
      setTwoFactorEnabled(saved2FA === 'true');
      setEmailVerified(savedEmailVerified === 'true');
      setBiometricAvailable(compatible && enrolled);

      const [profileResult, subscriptionResult, securityResult] = await Promise.allSettled([
        requestApi.getMyProfile(),
        forceRefresh ? requestApi.getSubscriptionFresh() : requestApi.getSubscription(),
        requestApi.getSecuritySettings(),
      ]);

      if (
        (profileResult.status === 'rejected' && isScreenRequestCancelled(profileResult.reason)) ||
        (subscriptionResult.status === 'rejected' && isScreenRequestCancelled(subscriptionResult.reason)) ||
        (securityResult.status === 'rejected' && isScreenRequestCancelled(securityResult.reason))
      ) {
        return;
      }

      if (profileResult.status === 'fulfilled') {
        const serverName = String(profileResult.value.fullName || '').trim();
        const serverEmail = String(profileResult.value.email || '').trim().toLowerCase();

        if (serverName) {
          setFullName(serverName);
          await AsyncStorage.setItem('userName', serverName);
        }

        if (serverEmail) {
          setEmail(serverEmail);
          await AsyncStorage.setItem('userEmail', serverEmail);
        }
      }

      if (subscriptionResult.status === 'fulfilled') {
        setPlan(subscriptionResult.value.plan || 'FREE');
      } else if (!hasLoadedRef.current) {
        setPlan('FREE');
      }

      if (securityResult.status === 'fulfilled') {
        const verified = Boolean(securityResult.value.emailVerified);
        const twoFactor = Boolean(securityResult.value.twoFactorEnabled);

        setEmailVerified(verified);
        setTwoFactorEnabled(twoFactor);

        await AsyncStorage.multiSet([
          ['emailVerified', String(verified)],
          ['twoFactorEnabled', String(twoFactor)],
        ]);
      }

      hasLoadedRef.current = true;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestApi]);

  useFocusEffect(
    useCallback(() => {
      loadUserInfo({ showLoader: !hasLoadedRef.current });
    }, [loadUserInfo])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadUserInfo({ forceRefresh: true });
  }, [loadUserInfo]);

  const handleBiometricToggle = async (value: boolean) => {
    if (!value) {
      setBiometricUnlock(false);
      await setBiometricEnabled(false);
      await clearBiometricCredentials();
      return;
    }

    if (!biometricAvailable) {
      screenAlert('Not available', 'Your device does not support biometric authentication or no fingerprint/face is enrolled.');
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm your identity',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      screenAlert('Failed', 'Could not verify your identity.');
      return;
    }

    try {
      await saveBiometricCredentials(email);
      setBiometricUnlock(true);
      await setBiometricEnabled(true);
    } catch (error: any) {
      screenAlert(
        'Could not enable biometrics',
        error?.message || 'Please try again while this device is online.'
      );
    }
  };

  const handleEmailVerificationPress = async () => {
    if (!email) {
      screenAlert('Email not found', 'Please sign in again so we can load your email address.');
      return;
    }

    try {
      setSendingVerification(true);
      await requestApi.resendVerification({ email });

      screenAlert(
        'Verification code sent',
        'We sent a verification code to your email. Enter the code to mark your account as verified.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Enter code',
            onPress: () =>
              router.push({
                pathname: '/verifyemail',
                params: { email, next: 'userinfo', autoSend: 'true' },
              }),
          },
        ]
      );
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      screenAlert(
        'Could not send code',
        'We could not send a verification code right now. You can still use the app, but your account is safer after email verification. Please try again later from this page.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Enter code',
            onPress: () =>
              router.push({
                pathname: '/verifyemail',
                params: { email, next: 'userinfo', autoSend: 'true' },
              }),
          },
        ]
      );
    } finally {
      setSendingVerification(false);
    }
  };

  const openNameEditor = () => {
    setDraftName(fullName === 'User' ? '' : fullName);
    setEditNameVisible(true);
  };

  const closeNameEditor = () => {
    if (savingName) return;
    setEditNameVisible(false);
    setDraftName('');
  };

  const saveUsername = async () => {
    if (savingName) return;

    const cleanName = draftName.trim().replace(/\s+/g, ' ');

    if (cleanName.length < 2) {
      screenAlert('Username too short', 'Enter at least 2 characters.');
      return;
    }

    if (cleanName.length > 60) {
      screenAlert('Username too long', 'Use 60 characters or fewer.');
      return;
    }

    try {
      setSavingName(true);
      const updated = await requestApi.updateMyProfile({ fullName: cleanName });
      const nextName = String(updated?.fullName || cleanName).trim();

      await AsyncStorage.setItem('userName', nextName);
      setFullName(nextName);
      setDraftName(nextName);
      requestApi.clearCache();
      setEditNameVisible(false);

      screenAlert('Username updated', 'Your new username now appears across The Guardian.');
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) return;
      screenAlert('Could not update username', error?.message || 'Please try again.');
    } finally {
      setSavingName(false);
    }
  };

  const renderUserInfoSkeleton = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <PulsingSkeleton styles={styles} style={styles.skeletonHeaderTitle} />
      </View>

      <View style={styles.profileCard}>
        <PulsingSkeleton styles={styles} style={styles.skeletonAvatar} />
        <PulsingSkeleton styles={styles} style={styles.skeletonProfileName} />
        <PulsingSkeleton styles={styles} style={styles.skeletonProfileEmail} />
        <PulsingSkeleton styles={styles} style={styles.skeletonPlanBadge} />
      </View>

      {[1, 2].map((section) => (
        <View key={`userinfo-skeleton-section-${section}`}>
          <PulsingSkeleton styles={styles} style={styles.skeletonSectionLabel} />

          <View style={styles.skeletonCard}>
            {[1, 2, 3].map((row, index) => (
              <View
                key={`userinfo-skeleton-row-${section}-${row}`}
                style={[
                  styles.skeletonRow,
                  index !== 2 && styles.rowDivider,
                ]}
              >
                <PulsingSkeleton styles={styles} style={styles.skeletonIconCircle} />

                <View style={styles.rowTextBox}>
                  <PulsingSkeleton styles={styles} style={styles.skeletonRowTitle} />
                  <PulsingSkeleton styles={styles} style={styles.skeletonRowText} />
                  {index === 1 && (
                    <PulsingSkeleton styles={styles} style={styles.skeletonRowTextShort} />
                  )}
                </View>

                <PulsingSkeleton styles={styles} style={styles.skeletonTrailingControl} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );

  const planLabel = plan.charAt(0) + plan.slice(1).toLowerCase();

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        {renderUserInfoSkeleton()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={C.primary}
            colors={[C.primary]}
            progressBackgroundColor={C.backgroundElement}
          />
        }
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Account</Text>
        </View>

        <View style={styles.profileCard}>
          <TouchableOpacity
            // style={styles.profileEditButton}
            // activeOpacity={0.75}
            // onPress={openNameEditor}
          >
            {/* <Pencil size={16} color={C.primary} /> */}
            {/* <Text style={styles.profileEditText}>Edit username</Text> */}
          </TouchableOpacity>

          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(fullName, email)}</Text>
          </View>
          <Text style={styles.profileName}>{fullName}</Text>
          <Text style={styles.profileEmail}>{email || 'No email found'}</Text>
          <View style={[styles.planBadge, plan === 'FREE' && styles.freeBadge]}>
            <Text style={[styles.planBadgeText, plan === 'FREE' && styles.freeBadgeText]}>{planLabel} plan</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Account details</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.row, styles.rowDivider]}
            activeOpacity={0.72}
            onPress={openNameEditor}
          >
            <View style={styles.iconCircle}><UserRound size={20} color={C.text} /></View>
            <View style={styles.rowTextBox}>
              <Text style={styles.rowLabel}>Username</Text>
              <Text style={styles.rowValue}>{fullName}</Text>
            </View>
            <Pencil size={18} color={C.primary} />
          </TouchableOpacity>

          <View style={[styles.row, styles.rowDivider]}>
            <View style={styles.iconCircle}><Mail size={20} color={C.text} /></View>
            <View style={styles.rowTextBox}>
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowValue}>{email || 'No email found'}</Text>
              <Text style={styles.rowSub}>
                {emailVerified
                  ? 'Account Verified.'
                  : 'Not verified. You can still use the app, but verification makes password reset and 2FA safer.'}
              </Text>
            </View>
            {!emailVerified && (
              <TouchableOpacity
                style={[styles.smallButton, sendingVerification && styles.disabledSmallButton]}
                onPress={handleEmailVerificationPress}
                disabled={!email || sendingVerification}
                activeOpacity={0.75}
              >
                <Text style={styles.smallButtonText}>{sendingVerification ? 'Sending...' : 'Verify'}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View>
            {/* <View style={styles.iconCircle}><ShieldCheck size={20} color={C.text} /></View> */}
            {/* <View style={styles.rowTextBox}>
              <Text style={styles.rowLabel}>Subscription status</Text>
              <Text style={styles.rowValue}>{planLabel}</Text>
            </View> */}
          </View>
        </View>

        <Text style={styles.sectionLabel}>Security</Text>
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

          <TouchableOpacity
            style={[styles.row, styles.rowDivider]}
            activeOpacity={0.7}
            onPress={() => router.push('/twofasetup')}
          >
            <View style={styles.iconCircle}><KeyRound size={20} color={C.text} /></View>
            <View style={styles.rowTextBox}>
              <Text style={styles.rowLabel}>Two-factor authentication</Text>
              <Text style={styles.rowSub}>
                {twoFactorEnabled ? 'On · Code required at sign in' : 'Off'}
              </Text>
            </View>
            <ChevronRight size={20} color={C.tabInactive} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => router.push('/devices')}
          >
            <View style={styles.iconCircle}><Smartphone size={20} color={C.text} /></View>
            <View style={styles.rowTextBox}>
              <Text style={styles.rowLabel}>Trusted devices</Text>
              <Text style={styles.rowSub}>
                Review active sessions
              </Text>
            </View>
            <ChevronRight size={20} color={C.tabInactive} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={editNameVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeNameEditor}
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
              intensity={Platform.OS === 'android' ? 22 : 32}
              tint={isDark ? 'dark' : 'light'}
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View pointerEvents="none" style={styles.modalFallbackBlur} />
          )}

          <View pointerEvents="none" style={styles.modalBackdrop} />

          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          >
            <View style={styles.editModalCard}>
            <View style={styles.editModalIcon}>
              <UserRound size={24} color={C.primary} />
            </View>
            <Text style={styles.editModalTitle}>Edit username</Text>
            {/* <Text style={styles.editModalText}>
              This name appears on Home, Settingsz, User Information, and family sharing screens.
            </Text> */}

            <Text style={styles.editInputLabel}>Username</Text>
            <TextInput
              style={styles.editInput}
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Enter your username"
              placeholderTextColor={C.tabInactive}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={60}
              editable={!savingName}
              returnKeyType="done"
              onSubmitEditing={saveUsername}
              autoFocus
            />

            <Text style={styles.editCharacterCount}>{draftName.trim().length}/60</Text>

            <TouchableOpacity
              style={[styles.editSaveButton, savingName && styles.editDisabledButton]}
              onPress={saveUsername}
              disabled={savingName}
              activeOpacity={0.84}
            >
              {savingName ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Pencil size={18} color="#FFFFFF" />
              )}
              <Text style={styles.editSaveButtonText}>
                {savingName ? 'Saving...' : 'Save username'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.editCancelButton}
              onPress={closeNameEditor}
              disabled={savingName}
              activeOpacity={0.75}
            >
              <Text style={styles.editCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (C: any, isDark: boolean, isOled: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 100,
      paddingBottom: 120,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 18,
    },
    title: {
      fontSize: 26,
      fontWeight: '800',
      color: C.text,
    },
    profileCard: {
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      padding: 22,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },
    profileEditButton: {
      position: 'absolute',
      top: 14,
      right: 14,
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: C.actionCard || C.backgroundSelected,
      borderWidth: 1,
      borderColor: C.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      zIndex: 2,
    },
    profileEditText: {
      color: C.primary,
      fontSize: 12,
      fontWeight: '800',
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      shadowColor: C.primary,
      shadowOpacity: 0.10,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,
    },
    avatarText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 24,
    },
    profileName: {
      fontSize: 20,
      fontWeight: '800',
      color: C.text,
      textAlign: 'center',
    },
    profileEmail: {
      fontSize: 14,
      color: C.textSecondary,
      marginTop: 4,
      textAlign: 'center',
    },
    planBadge: {
      backgroundColor: C.securityScoreBg,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 16,
      marginTop: 14,
    },
    planBadgeText: {
      fontSize: 13,
      fontWeight: '800',
      color: C.warning,
    },
    freeBadge: {
      backgroundColor: C.backgroundSelected,
    },
    freeBadgeText: {
      color: C.textSecondary,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: C.textSecondary,
      letterSpacing: 0.6,
      marginBottom: 8,
      marginLeft: 4,
    },
    card: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      marginBottom: 24,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 15,
      paddingHorizontal: 14,
    },
    rowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    iconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    rowTextBox: {
      flex: 1,
      minWidth: 0,
    },
    rowLabel: {
      fontSize: 15,
      color: C.text,
      fontWeight: '700',
    },
    rowValue: {
      fontSize: 14,
      color: C.textSecondary,
      marginTop: 3,
      flexShrink: 1,
    },
    rowSub: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 3,
      lineHeight: 16,
      flexShrink: 1,
    },
    smallButton: {
      backgroundColor: C.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 14,
      marginLeft: 8,
      shadowColor: C.primary,
      shadowOpacity: 0.10,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    disabledSmallButton: {
      opacity: 0.6,
    },
    smallButtonText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '800',
    },
    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
      opacity: 0.85,
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },
    skeletonHeaderTitle: {
      width: 205,
      height: 26,
    },
    skeletonAvatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      marginBottom: 14,
    },
    skeletonProfileName: {
      width: '46%',
      height: 18,
      marginBottom: 10,
    },
    skeletonProfileEmail: {
      width: '68%',
      height: 12,
      marginBottom: 14,
    },
    skeletonPlanBadge: {
      width: 92,
      height: 30,
      borderRadius: 16,
    },
    skeletonSectionLabel: {
      width: 126,
      height: 11,
      marginBottom: 9,
      marginLeft: 4,
    },
    skeletonCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      marginBottom: 24,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },
    skeletonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 15,
      paddingHorizontal: 14,
    },
    skeletonIconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      marginRight: 14,
    },
    skeletonRowTitle: {
      width: '48%',
      height: 13,
      marginBottom: 8,
    },
    skeletonRowText: {
      width: '78%',
      height: 11,
    },
    skeletonRowTextShort: {
      width: '58%',
      height: 10,
      marginTop: 7,
    },
    skeletonTrailingControl: {
      width: 38,
      height: 30,
      borderRadius: 15,
      marginLeft: 10,
    },
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
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    editModalCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: C.border,
      padding: 20,
      shadowColor: '#000',
      shadowOpacity: 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
    editModalIcon: {
      width: 52,
      height: 52,
      borderRadius: 20,
      backgroundColor: C.actionCard || C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    editModalTitle: { color: C.text, fontSize: 22, fontWeight: '900', marginBottom: 7 },
    editModalText: { color: C.textSecondary, fontSize: 13, lineHeight: 19, fontWeight: '600', marginBottom: 18 },
    editInputLabel: { color: C.text, fontSize: 13, fontWeight: '800', marginBottom: 8 },
    editInput: {
      backgroundColor: C.background,
      color: C.text,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 15,
      paddingVertical: 14,
      fontSize: 16,
      fontWeight: '700',
    },
    editCharacterCount: { color: C.textSecondary, fontSize: 11, fontWeight: '700', textAlign: 'right', marginTop: 7, marginBottom: 14 },
    editSaveButton: {
      minHeight: 52,
      borderRadius: 999,
      backgroundColor: C.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      shadowColor: C.primary,
      shadowOpacity: 0.14,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    editDisabledButton: { opacity: 0.65 },
    editSaveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
    editCancelButton: { alignItems: 'center', paddingVertical: 13, marginTop: 6 },
    editCancelButtonText: { color: C.textSecondary, fontSize: 14, fontWeight: '800' },
  });