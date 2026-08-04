import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { api, DuressSettingsResponse, saveLoginSession } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';
import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import {
  hapticDelete,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from '../utils/haptics';
import { useScreenAlert } from '../hooks/useScreenAlert';

const DELAYS = [5, 15, 30, 60] as const;

const CARD_3D = {
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 9 },
  elevation: 7,
};

const CONTROL_3D = {
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 5 },
  elevation: 4,
};

type PasswordFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  placeholder: string;
  editable?: boolean;
  C: any;
  styles: ReturnType<typeof makeStyles>;
};

function PasswordField({
  label,
  value,
  onChangeText,
  visible,
  onToggle,
  placeholder,
  editable = true,
  C,
  styles,
}: PasswordFieldProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordWrap}>
        <TextInput
          style={styles.passwordInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.tabInactive}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          editable={editable}
          textContentType="password"
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={21}
            color={C.textSecondary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function DuressModeScreen() {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const { isDark, colors: C } = useAppTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [data, setData] = useState<DuressSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [duressPassword, setDuressPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showDuress, setShowDuress] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [alertEnabled, setAlertEnabled] = useState(false);
  const [contactUserId, setContactUserId] = useState<number | null>(null);
  const [delayMinutes, setDelayMinutes] = useState(15);

  const [saving, setSaving] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [openingPreview, setOpeningPreview] = useState(false);

  useSensitiveScreenProtection(true);

  const apply = useCallback((response: DuressSettingsResponse) => {
    setData(response);
    setAlertEnabled(response.alertEnabled);
    setContactUserId(response.alertContactUserId ?? null);
    setDelayMinutes(response.alertDelayMinutes || 15);
  }, []);

  const load = useCallback(async (showLoader = false) => {
    let cancelled = false;
    try {
      if (showLoader) setLoading(true);
      setLoadError(null);
      apply(await requestApi.getDuressSettings());
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return;
      }
      setLoadError(error?.message || 'Could not load Duress Mode.');
    } finally {
      if (!cancelled) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [apply, requestApi]);

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load])
  );

  const resetPasswords = () => {
    setCurrentPassword('');
    setDuressPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowDuress(false);
    setShowConfirm(false);
  };

  const configure = async () => {
    if (!currentPassword || !duressPassword || !confirmPassword) {
      screenAlert('Complete all password fields', 'Enter your normal password and the new duress password twice.');
      return;
    }
    if (duressPassword.length < 10) {
      screenAlert('Duress password is too short', 'Use at least 10 characters.');
      return;
    }
    if (duressPassword !== confirmPassword) {
      screenAlert('Passwords do not match', 'Enter the same duress password in both fields.');
      return;
    }
    if (duressPassword === currentPassword) {
      screenAlert('Choose a different password', 'Your duress password must differ from your normal master password.');
      return;
    }
    if (alertEnabled && !contactUserId) {
      screenAlert('Choose an alert contact', 'Select a trusted contact or turn the delayed alert off.');
      return;
    }

    let cancelled = false;
    try {
      setSaving(true);
      const response = await requestApi.configureDuressMode({
        currentPassword,
        duressPassword,
        alertEnabled,
        alertContactUserId: alertEnabled ? contactUserId : null,
        alertDelayMinutes: delayMinutes,
      });
      apply(response);
      resetPasswords();
      hapticSuccess();
      screenAlert(
        'Duress Mode ready',
        'The new password opens only your decoy vault. Use Safe decoy setup to prepare believable items.'
      );
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return;
      }
      hapticWarning();
      screenAlert('Could not save Duress Mode', error?.message || 'Please try again.');
    } finally {
      if (!cancelled) setSaving(false);
    }
  };

  const openDecoySetup = () => {
    if (!currentPassword) {
      screenAlert('Normal password required', 'Enter your normal master password first.');
      return;
    }

    screenAlert(
      'Open safe decoy setup?',
      'Guardian will switch this app session to the restricted decoy vault without sending a trusted-contact alert.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open setup',
          onPress: async () => {
            let cancelled = false;
            try {
              setOpeningPreview(true);
              const response = await requestApi.openDuressPreview(currentPassword);
              await saveLoginSession(response);
              resetPasswords();
              router.replace('/home');
            } catch (error: any) {
              if (isScreenRequestCancelled(error)) {
                cancelled = true;
                return;
              }
              hapticWarning();
              screenAlert('Could not open setup', error?.message || 'Please try again.');
            } finally {
              if (!cancelled) setOpeningPreview(false);
            }
          },
        },
      ]
    );
  };

  const disable = () => {
    if (!currentPassword) {
      screenAlert('Normal password required', 'Enter your normal master password first.');
      return;
    }

    hapticDelete();
    screenAlert(
      'Disable Duress Mode?',
      'Active decoy sessions and pending alerts will be revoked. Existing decoy items remain isolated.',
      [
        { text: 'Keep enabled', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: async () => {
            let cancelled = false;
            try {
              setDisabling(true);
              const result = await requestApi.disableDuressMode(currentPassword);
              resetPasswords();
              hapticSuccess();
              screenAlert('Duress Mode disabled', result.message);
              await load(false);
            } catch (error: any) {
              if (isScreenRequestCancelled(error)) {
                cancelled = true;
                return;
              }
              hapticWarning();
              screenAlert('Could not disable Duress Mode', error?.message || 'Please try again.');
            } finally {
              if (!cancelled) setDisabling(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <DuressSkeleton C={C} isDark={isDark} styles={styles} />;
  }

  if (!data && loadError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Duress Mode</Text>
          <Text style={styles.subtitle}>A separate password for a believable decoy vault.</Text>
          <View style={styles.centerCard}>
            <Ionicons name="cloud-offline-outline" size={36} color={C.warning} />
            <Text style={styles.centerTitle}>Duress Mode unavailable</Text>
            <Text style={styles.centerText}>{loadError}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => void load(true)}>
              <Text style={styles.primaryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (data && !data.eligible && !data.enabled) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Duress Mode</Text>
          <Text style={styles.subtitle}>Coercion-safe access for your Guardian vault.</Text>
          <View style={styles.centerCard}>
            <View style={styles.largeIcon}>
              <Ionicons name="shield-half-outline" size={34} color={C.primary} />
            </View>
            <Text style={styles.centerTitle}>Premium or Family required</Text>
            <Text style={styles.centerText}>{data.message}</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/subscription?from=duressmode')}
            >
              <Ionicons name="diamond-outline" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>View plans</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const contacts = data?.contacts || [];
  const canConfigure = Boolean(data?.canConfigure);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={C.primary}
              colors={[C.primary]}
              onRefresh={() => {
                setRefreshing(true);
                void load(false);
              }}
            />
          }
        >
          <Text style={styles.title}>Duress Mode</Text>
          <Text style={styles.subtitle}>Use a second password to open only prepared decoy items.</Text>

          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Ionicons name="shield-half" size={27} color="#fff" />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>DECOY VAULT</Text>
              <Text style={styles.heroTitle}>
                {data?.enabled ? 'Protection is ready' : 'Not configured'}
              </Text>
              <Text style={styles.heroText}>
                {data?.enabled
                  ? 'Your real and decoy vaults use separate sessions and encryption domains.'
                  : 'Create a distinct password, then prepare believable decoy items.'}
              </Text>
            </View>
            <View style={[styles.statusPill, data?.enabled && styles.statusPillActive]}>
              <Text style={[styles.statusText, data?.enabled && styles.statusTextActive]}>
                {data?.enabled ? 'Active' : 'Off'}
              </Text>
            </View>
          </View>

          <View style={styles.warningStrip}>
            <Ionicons name="alert-circle-outline" size={20} color={C.warning} />
            <Text style={styles.warningText}>
              Never reuse your normal master password. Test this feature only when you are safe.
            </Text>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIcon}>
                <Ionicons name="key-outline" size={20} color={C.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.sectionTitle}>
                  {data?.enabled ? 'Manage duress password' : 'Create duress password'}
                </Text>
                <Text style={styles.sectionSubtitle}>
                  Guardian never displays the existing duress password.
                </Text>
              </View>
            </View>

            <PasswordField
              label="NORMAL MASTER PASSWORD"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              visible={showCurrent}
              onToggle={() => setShowCurrent((value) => !value)}
              placeholder="Confirm your normal password"
              C={C}
              styles={styles}
            />

            {data?.enabled && canConfigure && (
              <TouchableOpacity
                style={[styles.setupButton, openingPreview && styles.disabled]}
                disabled={openingPreview}
                onPress={openDecoySetup}
              >
                <View style={styles.setupButtonIcon}>
                  <Ionicons name="construct-outline" size={20} color={C.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.setupButtonTitle}>Safe decoy setup</Text>
                  <Text style={styles.setupButtonText}>Open the decoy vault without triggering an alert.</Text>
                </View>
                {openingPreview ? (
                  <ActivityIndicator color={C.primary} />
                ) : (
                  <Ionicons name="chevron-forward" size={19} color={C.tabInactive} />
                )}
              </TouchableOpacity>
            )}

            {!canConfigure && (
              <TouchableOpacity
                style={styles.planNotice}
                onPress={() => router.push('/subscription?from=duressmode')}
              >
                <Ionicons name="diamond-outline" size={20} color={C.warning} />
                <Text style={styles.planNoticeText}>Restore Premium or Family to change this setup.</Text>
                <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
              </TouchableOpacity>
            )}

            {canConfigure && (
              <>
                <PasswordField
                  label="NEW DURESS PASSWORD"
                  value={duressPassword}
                  onChangeText={setDuressPassword}
                  visible={showDuress}
                  onToggle={() => setShowDuress((value) => !value)}
                  placeholder="At least 10 characters"
                  C={C}
                  styles={styles}
                />
                <PasswordField
                  label="CONFIRM DURESS PASSWORD"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  visible={showConfirm}
                  onToggle={() => setShowConfirm((value) => !value)}
                  placeholder="Repeat the duress password"
                  C={C}
                  styles={styles}
                />
              </>
            )}
          </View>

          {canConfigure && (
            <View style={styles.sectionCard}>
              <View style={styles.toggleRow}>
                <View style={styles.sectionIcon}>
                  <Ionicons name="notifications-outline" size={20} color={C.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.sectionTitle}>Delayed trusted-contact alert</Text>
                  <Text style={styles.sectionSubtitle}>Send a discreet alert after the selected delay.</Text>
                </View>
                <Switch
                  value={alertEnabled}
                  onValueChange={setAlertEnabled}
                  trackColor={{ false: C.border, true: C.primary }}
                  thumbColor="#fff"
                  ios_backgroundColor={C.border}
                />
              </View>

              {alertEnabled && (
                <>
                  <Text style={styles.label}>ALERT CONTACT</Text>
                  {contacts.length ? (
                    <View style={styles.contactListShell}>
                      <View style={styles.contactList}>
                        {contacts.map((contact, index) => {
                          const selected = contact.userId === contactUserId;
                          return (
                            <TouchableOpacity
                              key={contact.contactId}
                              style={[
                                styles.contactRow,
                                index !== contacts.length - 1 && styles.divider,
                              ]}
                              onPress={() => {
                                hapticSelection();
                                setContactUserId(contact.userId);
                              }}
                            >
                              <View style={[styles.avatar, selected && styles.avatarSelected]}>
                                <Text style={[styles.avatarText, selected && styles.avatarTextSelected]}>
                                  {(contact.name || contact.email).slice(0, 1).toUpperCase()}
                                </Text>
                              </View>
                              <View style={styles.flex}>
                                <Text style={styles.contactName}>{contact.name}</Text>
                                <Text style={styles.contactEmail}>{contact.email}</Text>
                              </View>
                              <Ionicons
                                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                                size={22}
                                color={selected ? C.primary : C.tabInactive}
                              />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.emptyContact}
                      onPress={() => router.push('/emergencyaccess')}
                    >
                      <Ionicons name="person-add-outline" size={20} color={C.primary} />
                      <Text style={styles.emptyContactText}>Add a registered emergency contact.</Text>
                      <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
                    </TouchableOpacity>
                  )}

                  <Text style={styles.label}>ALERT DELAY</Text>
                  <View style={styles.chipRow}>
                    {DELAYS.map((delay) => (
                      <TouchableOpacity
                        key={delay}
                        style={[styles.chip, delayMinutes === delay && styles.chipSelected]}
                        onPress={() => {
                          hapticSelection();
                          setDelayMinutes(delay);
                        }}
                      >
                        <Text style={[styles.chipText, delayMinutes === delay && styles.chipTextSelected]}>
                          {delay} min
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.helperText}>
                    A normal-password login cancels a pending alert.
                  </Text>
                </>
              )}
            </View>
          )}

          {canConfigure && (
            <TouchableOpacity
              style={[styles.primaryButton, saving && styles.disabled]}
              disabled={saving}
              onPress={() => void configure()}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="shield-checkmark-outline" size={20} color="#fff" />
              )}
              <Text style={styles.primaryButtonText}>
                {saving ? 'Saving...' : data?.enabled ? 'Rotate and save' : 'Enable Duress Mode'}
              </Text>
            </TouchableOpacity>
          )}

          {data?.enabled && (
            <TouchableOpacity
              style={[styles.dangerButton, disabling && styles.disabled]}
              disabled={disabling}
              onPress={disable}
            >
              {disabling ? (
                <ActivityIndicator color={C.danger} />
              ) : (
                <Ionicons name="power-outline" size={19} color={C.danger} />
              )}
              <Text style={styles.dangerButtonText}>
                {disabling ? 'Disabling...' : 'Disable Duress Mode'}
              </Text>
            </TouchableOpacity>
          )}

          <Text style={styles.footerText}>
            A duress login never displays a visible warning or exposes your real-vault item count.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DuressSkeleton({ C, isDark, styles }: any) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={false}>
        <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
        <PulsingSkeleton styles={styles} style={styles.skeletonSubtitle} />
        <View style={styles.skeletonCard}>
          <PulsingSkeleton styles={styles} style={styles.skeletonIcon} />
          <View style={styles.flex}>
            <PulsingSkeleton styles={styles} style={styles.skeletonLineShort} />
            <PulsingSkeleton styles={styles} style={styles.skeletonLine} />
            <PulsingSkeleton styles={styles} style={styles.skeletonLine} />
          </View>
        </View>
        <View style={styles.skeletonForm}>
          <PulsingSkeleton styles={styles} style={styles.skeletonLineShort} />
          {[0, 1, 2].map((item) => (
            <PulsingSkeleton key={item} styles={styles} style={styles.skeletonInput} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    flex: { flex: 1 },
    safeArea: { flex: 1, backgroundColor: C.background },
    content: {
      paddingHorizontal: 20,
      paddingTop: 94,
      paddingBottom: 150,
      flexGrow: 1,
    },
    title: { fontSize: 30, fontWeight: '900', color: C.text, letterSpacing: -0.8 },
    subtitle: {
      marginTop: 7,
      marginBottom: 22,
      fontSize: 16,
      lineHeight: 23,
      color: C.textSecondary,
      maxWidth: 560,
    },
    heroCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderRadius: 26,
      padding: 18,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      ...CARD_3D,
    },
    heroIcon: {
      width: 50,
      height: 50,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundbutton,
      marginRight: 13,
      ...CONTROL_3D,
    },
    heroCopy: { flex: 1, paddingRight: 8 },
    eyebrow: { fontSize: 11, fontWeight: '900', color: C.primary, letterSpacing: 1.1 },
    heroTitle: { marginTop: 4, fontSize: 21, fontWeight: '900', color: C.text },
    heroText: { marginTop: 5, fontSize: 14, lineHeight: 20, color: C.textSecondary },
    statusPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: C.backgroundSelected,
      ...CONTROL_3D,
    },
    statusPillActive: { backgroundColor: `${C.success}20` },
    statusText: { fontSize: 12, fontWeight: '900', color: C.textSecondary },
    statusTextActive: { color: C.success },
    warningStrip: {
      marginTop: 14,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      borderRadius: 18,
      padding: 14,
      backgroundColor: C.alertWarningBg,
      borderWidth: 1,
      borderColor: `${C.warning}35`,
      ...CARD_3D,
    },
    warningText: { flex: 1, fontSize: 14, lineHeight: 20, color: C.text },
    sectionCard: {
      marginTop: 16,
      borderRadius: 24,
      padding: 17,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      ...CARD_3D,
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    sectionIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.actionCard,
      ...CONTROL_3D,
    },
    sectionTitle: { fontSize: 17, fontWeight: '900', color: C.text },
    sectionSubtitle: { marginTop: 3, fontSize: 13, lineHeight: 18, color: C.textSecondary },
    fieldBlock: { marginTop: 15 },
    label: {
      marginBottom: 7,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 0.9,
      color: C.textSecondary,
    },
    passwordWrap: {
      minHeight: 54,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.inputBackground || C.background,
      flexDirection: 'row',
      alignItems: 'center',
      ...CONTROL_3D,
    },
    passwordInput: { flex: 1, paddingHorizontal: 15, color: C.text, fontSize: 16 },
    eyeButton: {
      width: 50,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    setupButton: {
      marginTop: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      borderRadius: 17,
      padding: 13,
      backgroundColor: C.actionCard,
      borderWidth: 1,
      borderColor: C.border,
      ...CONTROL_3D,
    },
    setupButtonIcon: {
      width: 38,
      height: 38,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundElement,
      ...CONTROL_3D,
    },
    setupButtonTitle: { fontSize: 15, fontWeight: '900', color: C.text },
    setupButtonText: { marginTop: 2, fontSize: 13, lineHeight: 18, color: C.textSecondary },
    planNotice: {
      marginTop: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 13,
      borderRadius: 16,
      backgroundColor: C.alertWarningBg,
      ...CONTROL_3D,
    },
    planNoticeText: { flex: 1, fontSize: 14, lineHeight: 20, color: C.text },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    contactListShell: {
      borderRadius: 17,
      marginBottom: 15,
      ...CARD_3D,
    },
    contactList: {
      borderRadius: 17,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      backgroundColor: C.background,
    },
    contactRow: { minHeight: 66, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
    divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.actionCard,
      ...CONTROL_3D,
    },
    avatarSelected: { backgroundColor: C.primary },
    avatarText: { fontSize: 15, fontWeight: '900', color: C.primary },
    avatarTextSelected: { color: '#fff' },
    contactName: { fontSize: 15, fontWeight: '800', color: C.text },
    contactEmail: { marginTop: 2, fontSize: 13, color: C.textSecondary },
    emptyContact: {
      minHeight: 58,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 15,
      backgroundColor: C.backgroundElement,
      ...CONTROL_3D,
    },
    emptyContactText: { flex: 1, fontSize: 14, color: C.text },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
    chip: {
      minWidth: 66,
      minHeight: 42,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      backgroundColor: C.backgroundElement,
      ...CONTROL_3D,
    },
    chipSelected: { backgroundColor: C.primary, borderColor: C.primary },
    chipText: { fontSize: 14, fontWeight: '800', color: C.textSecondary },
    chipTextSelected: { color: '#fff' },
    helperText: { marginTop: 9, fontSize: 13, lineHeight: 18, color: C.textSecondary },
    primaryButton: {
      minHeight: 55,
      marginTop: 17,
      borderRadius: 18,
      backgroundColor: C.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      paddingHorizontal: 18,
      ...CARD_3D,
    },
    primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '900' },
    dangerButton: {
      minHeight: 52,
      marginTop: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: `${C.danger}55`,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      backgroundColor: C.backgroundElement,
      ...CARD_3D,
    },
    dangerButtonText: { fontSize: 15, fontWeight: '900', color: C.danger },
    disabled: { opacity: 0.55 },
    footerText: {
      marginTop: 18,
      textAlign: 'center',
      fontSize: 13,
      lineHeight: 19,
      color: C.textSecondary,
    },
    centerCard: {
      borderRadius: 25,
      padding: 24,
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      ...CARD_3D,
    },
    largeIcon: {
      width: 68,
      height: 68,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.actionCard,
      marginBottom: 13,
      ...CONTROL_3D,
    },
    centerTitle: { marginTop: 12, fontSize: 21, fontWeight: '900', color: C.text, textAlign: 'center' },
    centerText: { marginTop: 8, fontSize: 15, lineHeight: 22, color: C.textSecondary, textAlign: 'center' },
    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      ...CONTROL_3D,
    },
    skeletonTitle: { width: 190, height: 34, borderRadius: 10 },
    skeletonSubtitle: { width: '84%', height: 18, borderRadius: 8, marginTop: 12, marginBottom: 24 },
    skeletonCard: {
      minHeight: 130,
      borderRadius: 26,
      padding: 18,
      flexDirection: 'row',
      gap: 13,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      ...CARD_3D,
    },
    skeletonIcon: { width: 50, height: 50, borderRadius: 17 },
    skeletonLine: { width: '94%', height: 14, borderRadius: 7, marginTop: 12 },
    skeletonLineShort: { width: '52%', height: 14, borderRadius: 7, marginTop: 4 },
    skeletonForm: {
      marginTop: 16,
      borderRadius: 24,
      padding: 17,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      ...CARD_3D,
    },
    skeletonInput: { width: '100%', height: 54, borderRadius: 16, marginTop: 14 },
  });