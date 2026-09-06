import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import { useBlurTarget } from '../context/BlurTargetContext';
import {
  api,
  GuardianSafetyCheckResponse,
  IncidentOverview,
  IncidentRecoveryTask,
  IncidentTaskStatus,
  SecurityIncident,
  SecurityIncidentType,
} from '../services/api';
import {
  isScreenRequestCancelled,
  useCancelableApi,
} from '../hooks/useCancelableApi';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';
import PulsingSkeleton from '../components/PulsingSkeleton';
import KeyboardAwareBlurModal from '../components/KeyboardAwareBlurModal';
import {
  hapticDelete,
  hapticLight,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from '../utils/haptics';
import { useScreenAlert } from '../hooks/useScreenAlert';

const INCIDENT_TYPES: {
  value: SecurityIncidentType;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    value: 'LOST_OR_STOLEN_DEVICE',
    title: 'Lost or stolen device',
    description: 'Revoke the missing device and secure signed-in accounts.',
    icon: 'phone-portrait-outline',
  },
  {
    value: 'MASTER_PASSWORD_EXPOSED',
    title: 'Master password exposed',
    description: 'Rotate Guardian and review connected accounts.',
    icon: 'key-outline',
  },
  {
    value: 'EMAIL_COMPROMISED',
    title: 'Email compromised',
    description: 'Secure email first, then dependent accounts.',
    icon: 'mail-unread-outline',
  },
  {
    value: 'PHISHING_ATTACK',
    title: 'Phishing attack',
    description: 'Contain credentials entered on a suspicious page.',
    icon: 'fish-outline',
  },
  {
    value: 'UNKNOWN_LOGIN',
    title: 'Unknown Guardian login',
    description: 'Revoke other sessions and review critical accounts.',
    icon: 'person-remove-outline',
  },
  {
    value: 'SIM_SWAP',
    title: 'SIM swap or number takeover',
    description: 'Secure the carrier, email and SMS recovery paths.',
    icon: 'cellular-outline',
  },
  {
    value: 'FAMILY_MISUSE',
    title: 'Suspected family misuse',
    description: 'Contain shared access without affecting unrelated family data.',
    icon: 'people-outline',
  },
  {
    value: 'DURESS_EVENT_ENDED',
    title: 'Duress event ended',
    description: 'Secure the real account after a duress event.',
    icon: 'shield-half-outline',
  },
  {
    value: 'OTHER',
    title: 'Other security concern',
    description: 'Start a general recovery checklist.',
    icon: 'alert-circle-outline',
  },
];

const formatDate = (value?: string | null) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const readable = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const SYSTEM_MANAGED_TASK_CODES = new Set([
  'VERIFY_SAFE_DEVICE',
  'REVOKE_OTHER_SESSIONS',
  'REVOKE_BIOMETRICS',
]);

const isSystemManagedTask = (task: IncidentRecoveryTask) =>
  SYSTEM_MANAGED_TASK_CODES.has(task.code);

const isPasswordTask = (task: IncidentRecoveryTask) =>
  task.code === 'ROTATE_MASTER_PASSWORD';

const hasProviderUrl = (task: IncidentRecoveryTask) =>
  typeof task.actionRoute === 'string' && /^https:\/\//i.test(task.actionRoute.trim());

const getTaskActionLabel = (task: IncidentRecoveryTask) => {
  if (task.status === 'COMPLETED') return 'View completed action';
  if (isSystemManagedTask(task)) return 'Verified automatically';
  if (isPasswordTask(task)) return 'Change Guardian password';
  if (hasProviderUrl(task)) {
    return task.status === 'NOT_STARTED' ? 'Review provider' : 'Continue provider review';
  }
  return task.status === 'NOT_STARTED' ? 'Review recovery steps' : 'Continue review';
};

const getTaskGuidance = (task: IncidentRecoveryTask): string[] => {
  if (isSystemManagedTask(task)) {
    return [
      'Guardian verifies this action directly from its own session and device records.',
      'You do not need to confirm it manually.',
    ];
  }

  if (isPasswordTask(task)) {
    return [
      'Use a new password that is not used for any other account.',
      'Do not reuse the duress password or a recently exposed password.',
      'After rotation, Guardian keeps only this designated recovery session active.',
    ];
  }

  if (task.code === 'SECURE_PRIMARY_EMAIL') {
    return [
      'Change the email password before repairing accounts that depend on it.',
      'Sign out unknown sessions and review recent login activity.',
      'Check forwarding rules, recovery email addresses and recovery phone numbers.',
      'Confirm two-factor authentication and remove unfamiliar connected applications.',
    ];
  }

  if (task.code === 'VERIFY_RECOVERY_PATHS') {
    return [
      'Confirm that your Recovery Kit is stored somewhere you can still reach.',
      'Confirm that Recovery Circle members are still trusted and eligible.',
      'Review Safety Check and emergency-contact details after Lockdown is completed.',
    ];
  }

  if (task.code === 'REVIEW_PHONE_ACCOUNT') {
    return [
      'Change the carrier account password or security PIN.',
      'Confirm that no unknown SIM replacement or number-port request was made.',
      'Add or verify a port-out PIN and review account recovery details.',
    ];
  }

  if (task.code === 'REVIEW_FINANCIAL_ACCOUNTS') {
    return [
      'Review recent transactions and report anything unfamiliar immediately.',
      'Change the password and revoke unknown sessions or trusted devices.',
      'Confirm two-factor authentication and recovery contact details.',
    ];
  }

  if (task.code.startsWith('VAULT_ACCOUNT_')) {
    return [
      'Open the provider using a trusted browser or its official application.',
      'Change the password, revoke unknown sessions and verify two-factor authentication.',
      'Review recovery email addresses, phone numbers and connected applications.',
      'Return to Guardian and confirm completion only after you finish those checks.',
    ];
  }

  return [
    'Review the account or recovery control using a trusted device and official provider.',
    'Revoke unfamiliar sessions, update exposed secrets and verify recovery details.',
    'Return to Guardian and confirm the action only after the review is complete.',
  ];
};

export default function IncidentLockdownScreen() {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const { isDark, colors: C } = useAppTheme();
  const blurTarget = useBlurTarget();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [overview, setOverview] = useState<IncidentOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedType, setSelectedType] =
    useState<SecurityIncidentType>('LOST_OR_STOLEN_DEVICE');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showStartPassword, setShowStartPassword] = useState(false);
  const [note, setNote] = useState('');
  const [starting, setStarting] = useState(false);
  const [workingTaskId, setWorkingTaskId] = useState<number | null>(null);
  const [completing, setCompleting] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [selectedTask, setSelectedTask] =
    useState<IncidentRecoveryTask | null>(null);
  const [rotatingPassword, setRotatingPassword] = useState(false);
  const [safetyCheck, setSafetyCheck] =
    useState<GuardianSafetyCheckResponse | null>(null);
  const [checkingSafetyIn, setCheckingSafetyIn] = useState(false);

  useSensitiveScreenProtection(true);

  const applyOverview = useCallback((response: IncidentOverview) => {
    setOverview(response);
  }, []);

  const load = useCallback(
    async (showLoader = false) => {
      let cancelled = false;
      try {
        if (showLoader) setLoading(true);
        setLoadError(null);
        const response = await requestApi.getIncidentOverview();
        applyOverview(response);

        if (response.activeIncident) {
          try {
            const safetyResponse = await requestApi.getGuardianSafetyCheck();
            setSafetyCheck(safetyResponse);
          } catch (safetyError: any) {
            if (isScreenRequestCancelled(safetyError)) throw safetyError;
            /*
             * Safety Check is an important companion control, but a temporary
             * Access Sharing outage must not hide the Incident Lockdown
             * recovery workflow itself.
             */
            setSafetyCheck(null);
          }
        } else {
          setSafetyCheck(null);
        }
      } catch (error: any) {
        if (isScreenRequestCancelled(error)) {
          cancelled = true;
          return;
        }
        setLoadError(error?.message || 'Could not load Incident Lockdown.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [applyOverview, requestApi]
  );

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load])
  );

  const active = overview?.activeIncident || null;
  const planUnavailable = overview?.plan === 'UNKNOWN';

  const startLockdown = async () => {
    if (!currentPassword.trim()) {
      hapticWarning();
      screenAlert('Master password required', 'Confirm your current master password.');
      return;
    }

    hapticWarning();
    screenAlert(
      'Start Incident Lockdown?',
      'Guardian will revoke every other active session, revoke biometric sign-in, suspend local autofill data and restrict the account to this recovery device.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Start Lockdown',
          style: 'destructive',
          onPress: async () => {
            let cancelled = false;
            try {
              setStarting(true);
              await requestApi.startIncidentLockdown({
                type: selectedType,
                currentPassword,
                note,
              });
              setCurrentPassword('');
              setNote('');
              hapticSuccess();
              await load(false);
              screenAlert(
                'Lockdown active',
                'Other sessions and biometrics were revoked. Complete the required recovery steps on this device.'
              );
            } catch (error: any) {
              if (isScreenRequestCancelled(error)) {
                cancelled = true;
                return;
              }
              hapticWarning();
              screenAlert('Could not start Lockdown', error?.message || 'Please try again.');
            } finally {
              if (!cancelled) setStarting(false);
            }
          },
        },
      ]
    );
  };

  const updateTask = async (
    task: IncidentRecoveryTask,
    status: IncidentTaskStatus
  ) => {
    if (!active) return null;
    let cancelled = false;
    try {
      setWorkingTaskId(task.id);
      const result = await requestApi.updateIncidentTask(active.id, task.id, status);
      setOverview((current) =>
        current ? { ...current, activeIncident: result } : current
      );
      setSelectedTask((current) =>
        current?.id === task.id
          ? result.tasks.find((candidate) => candidate.id === task.id) || current
          : current
      );
      hapticSuccess();
      return result;
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return null;
      }
      hapticWarning();
      screenAlert('Could not update task', error?.message || 'Please try again.');
      return null;
    } finally {
      if (!cancelled) setWorkingTaskId(null);
    }
  };

  const rotatePassword = async (
    currentPasswordValue: string,
    newPasswordValue: string,
    confirmNewPasswordValue: string
  ) => {
    if (!active) return;
    if (!currentPasswordValue || !newPasswordValue || !confirmNewPasswordValue) {
      screenAlert('Complete all fields', 'Enter the current and new master passwords.');
      return;
    }
    if (newPasswordValue.length < 10) {
      screenAlert('Password too short', 'Use at least 10 characters for the new master password.');
      return;
    }
    if (newPasswordValue !== confirmNewPasswordValue) {
      screenAlert('Passwords do not match', 'Re-enter the new master password.');
      return;
    }

    let cancelled = false;
    try {
      setRotatingPassword(true);
      const result = await requestApi.rotateIncidentMasterPassword(
        active.id,
        currentPasswordValue,
        newPasswordValue
      );
      setOverview((current) =>
        current ? { ...current, activeIncident: result } : current
      );
      setSelectedTask(null);
      hapticSuccess();
      screenAlert('Master password rotated', 'The recovery checklist was updated.');
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return;
      }
      hapticWarning();
      screenAlert('Could not rotate password', error?.message || 'Please try again.');
    } finally {
      if (!cancelled) setRotatingPassword(false);
    }
  };

  const openProvider = async (task: IncidentRecoveryTask) => {
    const url = String(task.actionRoute || '').trim();
    if (!/^https:\/\//i.test(url)) {
      hapticWarning();
      screenAlert(
        'Provider link unavailable',
        'Open the provider through its official application or type its address into a trusted browser.'
      );
      return;
    }

    try {
      if (task.status === 'NOT_STARTED') {
        const updated = await updateTask(task, 'IN_PROGRESS');
        if (!updated) return;
      }
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        screenAlert('Could not open provider', 'This saved website address is not supported.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      hapticWarning();
      screenAlert('Could not open provider', 'Open the provider directly in a trusted browser.');
    }
  };

  const checkInSafetyCheck = async () => {
    let cancelled = false;
    try {
      setCheckingSafetyIn(true);
      const result = await requestApi.completeGuardianSafetyCheck();
      setSafetyCheck(result);
      hapticSuccess();
      screenAlert(
        'Safety Check completed',
        'Your automatic release countdown has been reset without changing its contact or release rules.'
      );
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return;
      }
      hapticWarning();
      screenAlert(
        'Could not complete Safety Check',
        error?.message || 'Please try again while this recovery device is online.'
      );
    } finally {
      if (!cancelled) setCheckingSafetyIn(false);
    }
  };

  const completeLockdown = async () => {
    if (!active) return;
    hapticWarning();
    screenAlert(
      'Complete incident recovery?',
      'Guardian will restore normal account access only after every required task is complete.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Complete recovery',
          onPress: async () => {
            let cancelled = false;
            try {
              setCompleting(true);
              await requestApi.completeIncidentLockdown(active.id);
              hapticSuccess();
              await load(false);
              screenAlert(
                'Recovery completed',
                'Normal access has been restored. Re-enrol biometrics and resync autofill only on devices you trust.',
                [{ text: 'Done', onPress: () => router.replace('/security') }]
              );
            } catch (error: any) {
              if (isScreenRequestCancelled(error)) {
                cancelled = true;
                return;
              }
              hapticWarning();
              screenAlert('Recovery is not complete', error?.message || 'Review required tasks.');
            } finally {
              if (!cancelled) setCompleting(false);
            }
          },
        },
      ]
    );
  };

  const cancelLockdown = async (passwordValue: string) => {
    if (!active || !passwordValue) {
      screenAlert('Master password required', 'Confirm your current master password.');
      return;
    }
    let cancelled = false;
    try {
      setCompleting(true);
      await requestApi.cancelIncidentLockdown(active.id, passwordValue);
      setShowCancel(false);
      hapticSuccess();
      await load(false);
      screenAlert(
        'Lockdown cancelled',
        'Revoked sessions and biometric credentials remain revoked.',
        [{ text: 'Done', onPress: () => router.replace('/security') }]
      );
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return;
      }
      hapticWarning();
      screenAlert('Could not cancel Lockdown', error?.message || 'Please try again.');
    } finally {
      if (!cancelled) setCompleting(false);
    }
  };

  if (loading) {
    return <IncidentSkeleton C={C} isDark={isDark} styles={styles} />;
  }

  if (!overview && loadError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Incident Lockdown</Text>
          <Text style={styles.subtitle}>
            Contain a compromise and recover in a verified order.
          </Text>
          <View style={styles.errorShell}>
            <View style={styles.errorCard}>
              <Ionicons name="cloud-offline-outline" size={34} color={C.warning} />
              <Text style={styles.errorTitle}>Lockdown unavailable</Text>
              <Text style={styles.errorText}>{loadError}</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => void load(true)}>
                <Ionicons name="refresh-outline" size={19} color="#fff" />
                <Text style={styles.primaryButtonText}>Try again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={styles.content}
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
          <Text style={styles.title}>Incident Lockdown</Text>
          <Text style={styles.subtitle}>
            Contain suspicious access and follow a focused recovery plan.
          </Text>

          {active ? (
            <ActiveIncident
              incident={active}
              C={C}
              styles={styles}
              workingTaskId={workingTaskId}
              completing={completing}
              safetyCheck={safetyCheck}
              checkingSafetyIn={checkingSafetyIn}
              onSafetyCheckIn={() => void checkInSafetyCheck()}
              onOpenTask={(task) => {
                hapticLight();
                setSelectedTask(task);
              }}
              onComplete={completeLockdown}
              onShowCancel={() => {
                hapticDelete();
                setShowCancel(true);
              }}
            />
          ) : (
            <>
              <View style={styles.heroShell}>
                <View style={styles.heroCard}>
                  <View style={styles.heroIcon}>
                    <Ionicons name="shield-outline" size={30} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroEyebrow}>RECOVERY AUTOPILOT</Text>
                    <Text style={styles.heroTitle}>
                      Contain the account, then recover
                    </Text>
                    <Text style={styles.heroText}>{overview?.message}</Text>
                  </View>
                </View>
              </View>

              {!overview?.eligible && (
                <TouchableOpacity
                  style={styles.planNotice}
                  activeOpacity={0.84}
                  onPress={() =>
                    planUnavailable
                      ? void load(true)
                      : router.push('/subscription?from=incidentlockdown')
                  }
                >
                  <Ionicons
                    name={planUnavailable ? 'cloud-offline-outline' : 'diamond-outline'}
                    size={22}
                    color={C.warning}
                  />
                  <Text style={styles.planNoticeText}>
                    {planUnavailable
                      ? 'Guardian could not verify your plan. Try again before starting Lockdown.'
                      : 'Incident Lockdown and Recovery Autopilot are available on Premium and Family plans.'}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
                </TouchableOpacity>
              )}

              <Text style={styles.sectionTitle}>What happened?</Text>
              <Text style={styles.sectionSub}>
                Choose the closest match so Guardian can order the recovery steps.
              </Text>

              <View style={styles.choiceShell}>
                <View style={styles.choiceList}>
                  {INCIDENT_TYPES.map((item, index) => {
                    const selected = selectedType === item.value;
                    return (
                      <TouchableOpacity
                        key={item.value}
                        style={[
                          styles.choiceRow,
                          selected && styles.choiceRowSelected,
                          index !== INCIDENT_TYPES.length - 1 && styles.divider,
                        ]}
                        activeOpacity={0.82}
                        onPress={() => {
                          hapticSelection();
                          setSelectedType(item.value);
                        }}
                      >
                        <View style={[styles.choiceIcon, selected && styles.choiceIconSelected]}>
                          <Ionicons
                            name={item.icon}
                            size={21}
                            color={selected ? '#fff' : C.primary}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.choiceTitle}>{item.title}</Text>
                          <Text style={styles.choiceSub}>{item.description}</Text>
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

              <PasswordEntry
                label="CURRENT MASTER PASSWORD"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                visible={showStartPassword}
                onToggle={() => setShowStartPassword((value) => !value)}
                placeholder="Confirm your master password"
                C={C}
                styles={styles}
              />

              <Text style={styles.label}>OPTIONAL INCIDENT NOTE</Text>
              <TextInput
                style={[styles.input, styles.noteInput]}
                value={note}
                onChangeText={setNote}
                placeholder="Example: Phone lost near campus at 10:30 PM"
                placeholderTextColor={C.tabInactive}
                multiline
                maxLength={1000}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[
                  styles.dangerButton,
                  (!overview?.canStart || starting) && styles.buttonDisabled,
                ]}
                disabled={!overview?.canStart || starting}
                activeOpacity={0.86}
                onPress={startLockdown}
              >
                {starting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="lock-closed-outline" size={20} color="#fff" />
                )}
                <Text style={styles.primaryButtonText}>
                  {starting ? 'Starting Lockdown...' : 'Start Incident Lockdown'}
                </Text>
              </TouchableOpacity>

              <View style={styles.truthCard}>
                <Ionicons name="information-circle-outline" size={21} color={C.primary} />
                <Text style={styles.truthText}>
                  Guardian secures its own account. External provider changes remain under your control.
                </Text>
              </View>

              {!!overview?.history.length && (
                <>
                  <Text style={styles.sectionTitle}>Previous incident reports</Text>
                  {overview.history.map((incident) => (
                    <HistoryCard key={incident.id} incident={incident} C={C} styles={styles} />
                  ))}
                </>
              )}
            </>
          )}

          <View style={{ height: 90 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <IncidentTaskModal
        visible={Boolean(active && selectedTask)}
        task={selectedTask}
        working={selectedTask ? workingTaskId === selectedTask.id : false}
        blurTarget={blurTarget}
        isDark={isDark}
        C={C}
        styles={styles}
        rotatingPassword={rotatingPassword}
        onClose={() => {
          setSelectedTask(null);
        }}
        onBegin={() => {
          if (selectedTask) void updateTask(selectedTask, 'IN_PROGRESS');
        }}
        onComplete={() => {
          if (selectedTask) void updateTask(selectedTask, 'COMPLETED');
        }}
        onOpenProvider={() => {
          if (selectedTask) void openProvider(selectedTask);
        }}
        onRotatePassword={(currentValue, nextValue, confirmValue) =>
          void rotatePassword(currentValue, nextValue, confirmValue)
        }
      />

      <CancelLockdownModal
        visible={Boolean(active && showCancel)}
        canCancel={Boolean(active?.canCancel)}
        working={completing}
        blurTarget={blurTarget}
        isDark={isDark}
        C={C}
        styles={styles}
        onClose={() => {
          setShowCancel(false);
        }}
        onConfirm={(passwordValue) => void cancelLockdown(passwordValue)}
      />
    </SafeAreaView>
  );
}

function ActiveIncident({
  incident,
  C,
  styles,
  workingTaskId,
  completing,
  safetyCheck,
  checkingSafetyIn,
  onSafetyCheckIn,
  onOpenTask,
  onComplete,
  onShowCancel,
}: {
  incident: SecurityIncident;
  C: any;
  styles: any;
  workingTaskId: number | null;
  completing: boolean;
  safetyCheck: GuardianSafetyCheckResponse | null;
  checkingSafetyIn: boolean;
  onSafetyCheckIn: () => void;
  onOpenTask: (task: IncidentRecoveryTask) => void;
  onComplete: () => void;
  onShowCancel: () => void;
}) {
  return (
    <>
      <View style={styles.activeHeroShell}>
        <View style={styles.activeHero}>
          <View style={styles.activeTop}>
            <View style={styles.lockIcon}>
              <Ionicons name="lock-closed" size={26} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroEyebrow}>LOCKDOWN ACTIVE</Text>
              <Text style={styles.activeTitle}>{readable(incident.type)}</Text>
              <Text style={styles.activeSub}>
                Recovery device: {incident.safeDeviceName}
              </Text>
            </View>
            <Text style={styles.progressValue}>{incident.progress}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${incident.progress}%` }]} />
          </View>
          <View style={styles.statRow}>
            <Stat value={incident.sessionsRevoked} label="Sessions revoked" styles={styles} />
            <Stat value={incident.biometricsRevoked} label="Biometrics revoked" styles={styles} />
            <Stat
              value={incident.tasks.filter((task) => task.status === 'COMPLETED').length}
              label="Tasks complete"
              styles={styles}
            />
          </View>
        </View>
      </View>

      <View style={styles.lockNotice}>
        <Ionicons name="shield-checkmark-outline" size={21} color={C.primary} />
        <Text style={styles.lockNoticeText}>
          Only this recovery workflow is available until Lockdown ends.
        </Text>
      </View>

      <View
        style={[
          styles.exitOptionsCard,
          !incident.canCancel && styles.exitOptionsCardLocked,
        ]}
      >
        <View
          style={[
            styles.exitOptionsIcon,
            {
              backgroundColor: incident.canCancel
                ? `${C.danger}14`
                : C.backgroundSelected,
            },
          ]}
        >
          <Ionicons
            name={incident.canCancel ? 'exit-outline' : 'lock-closed-outline'}
            size={22}
            color={incident.canCancel ? C.danger : C.textSecondary}
          />
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.exitOptionsTitleRow}>
            <Text style={styles.exitOptionsTitle}>Exit Lockdown</Text>
            <View
              style={[
                styles.exitOptionsBadge,
                incident.canCancel
                  ? {
                      backgroundColor: `${C.danger}12`,
                      borderColor: `${C.danger}38`,
                    }
                  : {
                      backgroundColor: C.backgroundSelected,
                      borderColor: C.border,
                    },
              ]}
            >
              <Text
                style={[
                  styles.exitOptionsBadgeText,
                  {
                    color: incident.canCancel
                      ? C.danger
                      : C.textSecondary,
                  },
                ]}
              >
                {incident.canCancel ? 'CANCEL AVAILABLE' : 'RECOVERY REQUIRED'}
              </Text>
            </View>
          </View>

          <Text style={styles.exitOptionsText}>
            {incident.canCancel
              ? 'Activated by mistake? Cancel during the brief safety window using your current master password.'
              : 'The accidental-cancel window has ended. Complete the required recovery tasks to restore normal access safely.'}
          </Text>

          <TouchableOpacity
            style={[
              styles.exitOptionsButton,
              incident.canCancel
                ? {
                    borderColor: `${C.danger}55`,
                    backgroundColor: `${C.danger}0D`,
                  }
                : {
                    borderColor: C.border,
                    backgroundColor: C.backgroundSelected,
                  },
            ]}
            activeOpacity={0.82}
            onPress={onShowCancel}
            accessibilityRole="button"
            accessibilityLabel={
              incident.canCancel
                ? 'Cancel accidental Incident Lockdown'
                : 'View Incident Lockdown exit options'
            }
          >
            <Ionicons
              name={incident.canCancel ? 'close-circle-outline' : 'information-circle-outline'}
              size={18}
              color={incident.canCancel ? C.danger : C.primary}
            />
            <Text
              style={[
                styles.exitOptionsButtonText,
                { color: incident.canCancel ? C.danger : C.primary },
              ]}
            >
              {incident.canCancel
                ? 'Cancel accidental Lockdown'
                : 'View exit requirements'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.safetyGuardCard}>
        <View style={styles.safetyGuardIcon}>
          <Ionicons
            name={safetyCheck?.status === 'GRACE' ? 'warning-outline' : 'pulse-outline'}
            size={22}
            color={safetyCheck?.status === 'GRACE' ? C.warning : C.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.safetyGuardTitle}>Safety Check remains protected</Text>
          <Text style={styles.safetyGuardText}>
            {safetyCheck
              ? safetyCheck.status === 'GRACE'
                ? 'A grace period is active. Check in now so Incident Lockdown does not accidentally lead to an automatic release.'
                : safetyCheck.status === 'ACTIVE'
                  ? `Your next Safety Check remains scheduled${safetyCheck.nextCheckInAt ? ` for ${formatDate(safetyCheck.nextCheckInAt)}` : ''}.`
                  : safetyCheck.enabled
                    ? `Safety Check status: ${readable(safetyCheck.status)}. Lockdown did not change its release rules.`
                    : 'Safety Check is disabled. Lockdown did not enable or change it.'
              : 'Guardian could not read Safety Check status. The recovery workflow remains active, but verify this control when Access Sharing is available.'}
          </Text>
          {safetyCheck &&
            safetyCheck.enabled &&
            (safetyCheck.status === 'ACTIVE' || safetyCheck.status === 'GRACE') && (
              <TouchableOpacity
                style={[
                  styles.safetyCheckButton,
                  checkingSafetyIn && styles.buttonDisabled,
                ]}
                disabled={checkingSafetyIn}
                onPress={onSafetyCheckIn}
              >
                {checkingSafetyIn ? (
                  <ActivityIndicator size="small" color={C.primary} />
                ) : (
                  <Ionicons name="checkmark-circle-outline" size={18} color={C.primary} />
                )}
                <Text style={styles.safetyCheckButtonText}>
                  {checkingSafetyIn ? 'Checking in...' : 'I am safe — check in'}
                </Text>
              </TouchableOpacity>
            )}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Recovery queue</Text>
      <Text style={styles.sectionSub}>
        Complete required steps to restore normal access.
      </Text>

      {incident.tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          C={C}
          styles={styles}
          working={workingTaskId === task.id}
          onPress={() => onOpenTask(task)}
        />
      ))}

      <TouchableOpacity
        style={[
          styles.primaryButton,
          (!incident.canComplete || completing) && styles.buttonDisabled,
        ]}
        disabled={!incident.canComplete || completing}
        onPress={onComplete}
      >
        {completing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="shield-checkmark-outline" size={20} color="#fff" />
        )}
        <Text style={styles.primaryButtonText}>
          {incident.canComplete
            ? 'Complete recovery and restore access'
            : 'Complete required tasks first'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Incident timeline</Text>
      {incident.timeline.map((event, index) => (
        <View key={`${event.eventType}-${event.createdAt}-${index}`} style={styles.timelineRow}>
          <View style={styles.timelineDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.timelineTitle}>{event.title}</Text>
            {!!event.detail && <Text style={styles.timelineText}>{event.detail}</Text>}
            <Text style={styles.timelineDate}>{formatDate(event.createdAt)}</Text>
          </View>
        </View>
      ))}
    </>
  );
}

function TaskCard({
  task,
  C,
  styles,
  working,
  onPress,
}: {
  task: IncidentRecoveryTask;
  C: any;
  styles: any;
  working: boolean;
  onPress: () => void;
}) {
  const complete = task.status === 'COMPLETED';
  const systemManaged = isSystemManagedTask(task);
  const actionLabel = getTaskActionLabel(task);

  return (
    <View style={styles.taskShell}>
      <TouchableOpacity
        style={styles.taskCard}
        activeOpacity={0.84}
        onPress={onPress}
        disabled={working}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}. ${actionLabel}`}
      >
        <View style={styles.taskTop}>
          <View style={[styles.taskIcon, complete && styles.taskIconComplete]}>
            <Ionicons
              name={complete ? 'checkmark' : task.required ? 'alert' : 'ellipse-outline'}
              size={19}
              color={complete ? '#fff' : task.required ? C.warning : C.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.taskTitleRow}>
              <Text style={styles.taskTitle}>{task.title}</Text>
              {task.required && <Text style={styles.requiredBadge}>REQUIRED</Text>}
            </View>
            <Text style={styles.taskText}>{task.detail}</Text>
          </View>
        </View>

        <View style={styles.taskFooter}>
          <Text style={styles.taskStatus}>{readable(task.status)}</Text>
          {working ? (
            <ActivityIndicator size="small" color={C.primary} />
          ) : (
            <View style={styles.taskActionHint}>
              <Ionicons
                name={
                  complete
                    ? 'checkmark-circle-outline'
                    : systemManaged
                      ? 'shield-checkmark-outline'
                      : 'chevron-forward'
                }
                size={17}
                color={complete ? C.success : C.primary}
              />
              <Text
                style={[
                  styles.taskActionHintText,
                  complete && { color: C.success },
                ]}
              >
                {actionLabel}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

function PasswordEntry({
  label,
  value,
  onChangeText,
  visible,
  onToggle,
  placeholder,
  onFocus,
  C,
  styles,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  placeholder: string;
  onFocus?: () => void;
  C: any;
  styles: any;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordField}>
        <TextInput
          style={styles.passwordFieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.tabInactive}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={onFocus}
        />
        <TouchableOpacity
          style={styles.passwordEyeButton}
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
    </>
  );
}

function IncidentTaskModal({
  visible,
  task,
  working,
  blurTarget,
  isDark,
  C,
  styles,
  rotatingPassword,
  onClose,
  onBegin,
  onComplete,
  onOpenProvider,
  onRotatePassword,
}: {
  visible: boolean;
  task: IncidentRecoveryTask | null;
  working: boolean;
  blurTarget: any;
  isDark: boolean;
  C: any;
  styles: any;
  rotatingPassword: boolean;
  onClose: () => void;
  onBegin: () => void;
  onComplete: () => void;
  onOpenProvider: () => void;
  onRotatePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [rotationCurrentPassword, setRotationCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showRotationCurrent, setShowRotationCurrent] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  useEffect(() => {
    if (!visible) {
      setRotationCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowRotationCurrent(false);
      setShowNewPassword(false);
      setShowConfirmNewPassword(false);
    }
  }, [visible, task?.id]);

  const revealFocusedField = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, Platform.OS === 'ios' ? 180 : 110);
  }, []);

  if (!task) return null;

  const complete = task.status === 'COMPLETED';
  const systemManaged = isSystemManagedTask(task);
  const passwordTask = isPasswordTask(task);
  const providerAvailable = hasProviderUrl(task);
  const guidance = getTaskGuidance(task);

  const header = (
    <View style={styles.modalHeader}>
      <View style={[styles.taskIcon, complete && styles.taskIconComplete]}>
        <Ionicons
          name={complete ? 'checkmark' : passwordTask ? 'key-outline' : 'shield-outline'}
          size={20}
          color={complete ? '#fff' : C.primary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.modalEyebrow}>{readable(task.status)}</Text>
        <Text style={styles.modalTitle}>{task.title}</Text>
      </View>
      <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
        <Ionicons name="close" size={22} color={C.text} />
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAwareBlurModal
      visible={visible}
      onRequestClose={onClose}
      blurTarget={blurTarget}
      isDark={isDark}
      header={header}
      scrollRef={scrollRef}
      cardStyle={[
        styles.keyboardSafeModalCard,
        { backgroundColor: C.backgroundElement, borderColor: C.border },
      ]}
      contentContainerStyle={styles.modalContent}
      extraBottomSpace={passwordTask && !complete ? 330 : 190}
      testID="incident-task-modal"
    >
      <Text style={styles.modalText}>{task.detail}</Text>

      <View style={styles.guidanceCard}>
        <Text style={styles.guidanceTitle}>What to do</Text>
        {guidance.map((item, index) => (
          <View key={`${task.code}-${index}`} style={styles.guidanceRow}>
            <View style={styles.guidanceDot} />
            <Text style={styles.guidanceText}>{item}</Text>
          </View>
        ))}
      </View>

      {(complete || systemManaged) && (
        <View style={styles.modalStatusCard}>
          <Ionicons
            name={complete ? 'checkmark-circle' : 'shield-checkmark-outline'}
            size={21}
            color={complete ? C.success : C.primary}
          />
          <Text style={styles.modalStatusText}>
            {complete
              ? 'This recovery action is complete.'
              : 'Guardian verifies this action automatically. No manual confirmation is required.'}
          </Text>
        </View>
      )}

      {passwordTask && !complete && (
        <>
          <PasswordEntry
            label="CURRENT MASTER PASSWORD"
            value={rotationCurrentPassword}
            onChangeText={setRotationCurrentPassword}
            visible={showRotationCurrent}
            onToggle={() => setShowRotationCurrent((value) => !value)}
            placeholder="Current master password"
            onFocus={revealFocusedField}
            C={C}
            styles={styles}
          />
          <PasswordEntry
            label="NEW MASTER PASSWORD"
            value={newPassword}
            onChangeText={setNewPassword}
            visible={showNewPassword}
            onToggle={() => setShowNewPassword((value) => !value)}
            placeholder="New master password"
            onFocus={revealFocusedField}
            C={C}
            styles={styles}
          />
          <PasswordEntry
            label="CONFIRM NEW PASSWORD"
            value={confirmNewPassword}
            onChangeText={setConfirmNewPassword}
            visible={showConfirmNewPassword}
            onToggle={() => setShowConfirmNewPassword((value) => !value)}
            placeholder="Confirm new master password"
            onFocus={revealFocusedField}
            C={C}
            styles={styles}
          />
          <TouchableOpacity
            style={[
              styles.primaryButton,
              rotatingPassword && styles.buttonDisabled,
            ]}
            disabled={rotatingPassword}
            onPress={() =>
              onRotatePassword(
                rotationCurrentPassword,
                newPassword,
                confirmNewPassword
              )
            }
          >
            {rotatingPassword ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="key-outline" size={19} color="#fff" />
            )}
            <Text style={styles.primaryButtonText}>
              {rotatingPassword ? 'Changing password...' : 'Change Guardian password'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {!complete && !systemManaged && !passwordTask && (
        <>
          {providerAvailable && (
            <TouchableOpacity
              style={[styles.secondaryButton, working && styles.buttonDisabled]}
              disabled={working}
              onPress={onOpenProvider}
            >
              {working ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <Ionicons name="open-outline" size={19} color={C.primary} />
              )}
              <Text style={styles.secondaryButtonText}>Open official provider</Text>
            </TouchableOpacity>
          )}

          {!providerAvailable && task.status === 'NOT_STARTED' ? (
            <TouchableOpacity
              style={[styles.primaryButton, working && styles.buttonDisabled]}
              disabled={working}
              onPress={onBegin}
            >
              {working ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="play-outline" size={19} color="#fff" />
              )}
              <Text style={styles.primaryButtonText}>Begin this review</Text>
            </TouchableOpacity>
          ) : task.status === 'IN_PROGRESS' ? (
            <TouchableOpacity
              style={[styles.primaryButton, working && styles.buttonDisabled]}
              disabled={working}
              onPress={onComplete}
            >
              {working ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark-done-outline" size={19} color="#fff" />
              )}
              <Text style={styles.primaryButtonText}>Mark action complete</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}

      <Text style={styles.modalDisclaimer}>
        Guardian records your confirmation for external-provider actions.
      </Text>
    </KeyboardAwareBlurModal>
  );
}

function CancelLockdownModal({
  visible,
  canCancel,
  working,
  blurTarget,
  isDark,
  C,
  styles,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  canCancel: boolean;
  working: boolean;
  blurTarget: any;
  isDark: boolean;
  C: any;
  styles: any;
  onClose: () => void;
  onConfirm: (password: string) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPassword('');
      setShowPassword(false);
    }
  }, [visible]);

  const revealFocusedField = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, Platform.OS === 'ios' ? 180 : 110);
  }, []);

  const close = () => {
    if (working) return;
    setPassword('');
    setShowPassword(false);
    onClose();
  };

  const header = (
    <View style={styles.modalHeader}>
      <View
        style={[
          styles.taskIcon,
          {
            backgroundColor: canCancel
              ? `${C.danger}18`
              : C.backgroundSelected,
          },
        ]}
      >
        <Ionicons
          name={canCancel ? 'alert-circle-outline' : 'lock-closed-outline'}
          size={21}
          color={canCancel ? C.danger : C.textSecondary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.modalEyebrow}>EXIT OPTIONS</Text>
        <Text style={styles.modalTitle}>Exit Incident Lockdown</Text>
      </View>
      <TouchableOpacity style={styles.modalCloseButton} onPress={close}>
        <Ionicons name="close" size={22} color={C.text} />
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAwareBlurModal
      visible={visible}
      onRequestClose={close}
      blurTarget={blurTarget}
      isDark={isDark}
      header={header}
      scrollRef={scrollRef}
      cardStyle={[
        styles.keyboardSafeModalCard,
        { backgroundColor: C.backgroundElement, borderColor: C.border },
      ]}
      contentContainerStyle={styles.modalContent}
      extraBottomSpace={260}
      testID="cancel-lockdown-modal"
    >
      {canCancel ? (
        <>
          <Text style={styles.modalText}>
            If Lockdown was activated by mistake, confirm your current master
            password to cancel it now. Sessions and biometric credentials that
            were already revoked will remain revoked.
          </Text>

          <View style={styles.exitModalNotice}>
            <Ionicons name="time-outline" size={19} color={C.warning} />
            <Text style={styles.exitModalNoticeText}>
              Accidental cancellation is available only for a short safety window.
            </Text>
          </View>

          <PasswordEntry
            label="CURRENT MASTER PASSWORD"
            value={password}
            onChangeText={setPassword}
            visible={showPassword}
            onToggle={() => setShowPassword((value) => !value)}
            placeholder="Confirm your master password"
            onFocus={revealFocusedField}
            C={C}
            styles={styles}
          />

          <TouchableOpacity
            style={[styles.smallDangerButton, working && styles.buttonDisabled]}
            disabled={working}
            onPress={() => onConfirm(password)}
          >
            {working ? (
              <ActivityIndicator size="small" color={C.danger} />
            ) : (
              <Ionicons name="close-circle-outline" size={18} color={C.danger} />
            )}
            <Text style={styles.smallDangerText}>
              {working ? 'Cancelling...' : 'Cancel accidental Lockdown'}
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.modalText}>
            The accidental-cancellation window is no longer available. Guardian
            keeps the account restricted so an attacker cannot disable Lockdown
            after containment has started.
          </Text>

          <View style={styles.exitRequirementCard}>
            <Ionicons name="shield-checkmark-outline" size={22} color={C.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.exitRequirementTitle}>How to exit safely</Text>
              <Text style={styles.exitRequirementText}>
                Complete every required recovery task, then use “Complete recovery
                and restore access” on this screen.
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.secondaryButton} onPress={close}>
            <Ionicons name="arrow-back-outline" size={19} color={C.primary} />
            <Text style={styles.secondaryButtonText}>Return to recovery tasks</Text>
          </TouchableOpacity>
        </>
      )}
    </KeyboardAwareBlurModal>
  );
}

function HistoryCard({
  incident,
  C,
  styles,
}: {
  incident: SecurityIncident;
  C: any;
  styles: any;
}) {
  const completed = incident.status === 'COMPLETED' || incident.status === 'RECOVERED';
  return (
    <View style={styles.historyCard}>
      <View style={styles.historyIcon}>
        <Ionicons
          name={completed ? 'shield-checkmark-outline' : 'close-circle-outline'}
          size={22}
          color={completed ? C.success : C.warning}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.historyTitle}>{readable(incident.type)}</Text>
        <Text style={styles.historyText}>
          {readable(incident.status)} · {incident.progress}% · {formatDate(incident.startedAt)}
        </Text>
      </View>
    </View>
  );
}

function Stat({ value, label, styles }: { value: number; label: string; styles: any }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function IncidentSkeleton({ C, isDark, styles }: any) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.content}>
        <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
        <PulsingSkeleton styles={styles} style={styles.skeletonSub} />
        <View style={styles.skeletonShell}>
          <View style={styles.skeletonHero}>
            <PulsingSkeleton styles={styles} style={styles.skeletonIcon} />
            <View style={{ flex: 1 }}>
              <PulsingSkeleton styles={styles} style={styles.skeletonLineLarge} />
              <PulsingSkeleton styles={styles} style={styles.skeletonLine} />
              <PulsingSkeleton styles={styles} style={styles.skeletonLineShort} />
            </View>
          </View>
        </View>
        {[0, 1, 2, 3].map((value) => (
          <View key={value} style={styles.skeletonShell}>
            <View style={styles.skeletonTask}>
              <PulsingSkeleton styles={styles} style={styles.skeletonTaskIcon} />
              <View style={{ flex: 1 }}>
                <PulsingSkeleton styles={styles} style={styles.skeletonLineLarge} />
                <PulsingSkeleton styles={styles} style={styles.skeletonLine} />
                <PulsingSkeleton styles={styles} style={styles.skeletonChip} />
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    content: { paddingHorizontal: 18, paddingTop: 92, paddingBottom: 40 },
    skeletonBlock: { backgroundColor: C.backgroundSelected, borderRadius: 999 },
    skeletonTitle: { width: '76%', height: 35, marginBottom: 12 },
    skeletonSub: { width: '96%', height: 50, borderRadius: 16, marginBottom: 20 },
    skeletonShell: {
      borderRadius: 26,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOpacity: 0.11,
      shadowRadius: 19,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    skeletonHero: {
      minHeight: 168,
      borderRadius: 26,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      padding: 18,
      flexDirection: 'row',
      gap: 14,
    },
    skeletonTask: {
      minHeight: 145,
      borderRadius: 24,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      flexDirection: 'row',
      gap: 13,
    },
    skeletonIcon: { width: 60, height: 60, borderRadius: 21 },
    skeletonTaskIcon: { width: 46, height: 46, borderRadius: 16 },
    skeletonLineLarge: { width: '78%', height: 18, marginBottom: 12 },
    skeletonLine: { width: '94%', height: 13, marginBottom: 10 },
    skeletonLineShort: { width: '58%', height: 13 },
    skeletonChip: { width: 110, height: 34, marginTop: 9 },
    title: { color: C.text, fontSize: 32, fontWeight: '900', letterSpacing: -0.7 },
    subtitle: {
      color: C.textSecondary,
      fontSize: 16,
      lineHeight: 24,
      marginTop: 8,
      marginBottom: 20,
    },
    heroShell: {
      borderRadius: 28,
      marginBottom: 20,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 13 },
      elevation: 8,
    },
    heroCard: {
      borderRadius: 28,
      padding: 19,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    heroIcon: {
      width: 60,
      height: 60,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundbutton,
      shadowColor: C.primary,
      shadowOpacity: 0.2,
      shadowRadius: 13,
      shadowOffset: { width: 0, height: 7 },
      elevation: 5,
    },
    heroEyebrow: {
      color: C.textSecondary,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.1,
    },
    heroTitle: { color: C.text, fontSize: 19, fontWeight: '900', marginTop: 4 },
    heroText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 6 },
    planNotice: {
      borderRadius: 18,
      padding: 14,
      marginBottom: 20,
      backgroundColor: `${C.warning}12`,
      borderWidth: 1,
      borderColor: `${C.warning}38`,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    planNoticeText: { flex: 1, color: C.text, fontSize: 13, lineHeight: 20, fontWeight: '700' },
    sectionTitle: { color: C.text, fontSize: 18, fontWeight: '900', marginTop: 10 },
    sectionSub: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 4, marginBottom: 11 },
    choiceShell: {
      borderRadius: 24,
      marginBottom: 18,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    choiceList: {
      borderRadius: 24,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    choiceRow: { minHeight: 82, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
    choiceRowSelected: { backgroundColor: C.actionCard },
    choiceIcon: {
      width: 46,
      height: 46,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.actionCard,
    },
    choiceIconSelected: { backgroundColor: C.primary },
    choiceTitle: { color: C.text, fontSize: 15, fontWeight: '900' },
    choiceSub: { color: C.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
    divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    label: {
      color: C.textSecondary,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.05,
      marginTop: 10,
      marginBottom: 9,
    },
    input: {
      minHeight: 52,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.backgroundElement,
      color: C.text,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      marginBottom: 12,
    },
    passwordField: {
      minHeight: 52,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.backgroundElement,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      overflow: 'hidden',
    },
    passwordFieldInput: {
      flex: 1,
      minHeight: 52,
      color: C.text,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
    },
    passwordEyeButton: {
      width: 50,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noteInput: { minHeight: 100 },
    primaryButton: {
      minHeight: 55,
      borderRadius: 999,
      paddingHorizontal: 18,
      backgroundColor: C.backgroundbutton,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      marginTop: 10,
      marginBottom: 18,
      shadowColor: C.primary,
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
    dangerButton: {
      minHeight: 56,
      borderRadius: 999,
      paddingHorizontal: 18,
      backgroundColor: C.danger,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      marginTop: 10,
      marginBottom: 18,
      shadowColor: C.danger,
      shadowOpacity: 0.2,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
    primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
    buttonDisabled: { opacity: 0.5 },
    truthCard: {
      borderRadius: 18,
      padding: 14,
      backgroundColor: C.actionCard,
      borderWidth: 1,
      borderColor: `${C.primary}28`,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 20,
    },
    truthText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, flex: 1 },
    activeHeroShell: {
      borderRadius: 28,
      marginBottom: 18,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 15 },
      elevation: 10,
    },
    activeHero: {
      borderRadius: 28,
      padding: 19,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: `${C.danger}55`,
    },
    activeTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    lockIcon: {
      width: 54,
      height: 54,
      borderRadius: 19,
      backgroundColor: C.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    activeTitle: { color: C.text, fontSize: 19, fontWeight: '900', marginTop: 4 },
    activeSub: { color: C.textSecondary, fontSize: 13, marginTop: 4 },
    progressValue: { color: C.danger, fontSize: 22, fontWeight: '900' },
    progressTrack: {
      height: 10,
      borderRadius: 5,
      backgroundColor: C.backgroundSelected,
      overflow: 'hidden',
      marginTop: 18,
    },
    progressFill: { height: 10, borderRadius: 5, backgroundColor: C.primary },
    statRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    stat: {
      flex: 1,
      borderRadius: 16,
      backgroundColor: C.backgroundSelected,
      padding: 10,
      alignItems: 'center',
    },
    statValue: { color: C.text, fontSize: 17, fontWeight: '900' },
    statLabel: { color: C.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 3 },
    lockNotice: {
      borderRadius: 18,
      padding: 14,
      backgroundColor: C.actionCard,
      borderWidth: 1,
      borderColor: `${C.primary}35`,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 18,
    },
    lockNoticeText: { color: C.text, fontSize: 13, lineHeight: 20, flex: 1, fontWeight: '700' },
    exitOptionsCard: {
      borderRadius: 22,
      padding: 15,
      marginBottom: 18,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: `${C.danger}45`,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 15,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    exitOptionsCardLocked: {
      borderColor: C.border,
    },
    exitOptionsIcon: {
      width: 44,
      height: 44,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    exitOptionsTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    exitOptionsTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: '900',
    },
    exitOptionsBadge: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    exitOptionsBadgeText: {
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.6,
    },
    exitOptionsText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 6,
    },
    exitOptionsButton: {
      minHeight: 43,
      alignSelf: 'flex-start',
      marginTop: 12,
      borderRadius: 15,
      borderWidth: 1,
      paddingHorizontal: 13,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    exitOptionsButtonText: {
      fontSize: 13,
      fontWeight: '900',
    },
    safetyGuardCard: {
      borderRadius: 22,
      padding: 15,
      marginBottom: 20,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 15,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    safetyGuardIcon: {
      width: 44,
      height: 44,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.actionCard,
    },
    safetyGuardTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: '900',
    },
    safetyGuardText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 4,
    },
    safetyCheckButton: {
      minHeight: 42,
      marginTop: 12,
      paddingHorizontal: 13,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: `${C.primary}40`,
      backgroundColor: C.actionCard,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      alignSelf: 'flex-start',
    },
    safetyCheckButtonText: {
      color: C.primary,
      fontSize: 13,
      fontWeight: '900',
    },
    taskShell: {
      borderRadius: 24,
      marginBottom: 13,
      shadowColor: '#000',
      shadowOpacity: 0.09,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    taskCard: {
      borderRadius: 24,
      padding: 15,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
    },
    taskTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
    taskIcon: {
      width: 43,
      height: 43,
      borderRadius: 15,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    taskIconComplete: { backgroundColor: C.success },
    taskTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
    taskTitle: { color: C.text, fontSize: 16, fontWeight: '900', flexShrink: 1 },
    requiredBadge: {
      color: C.warning,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.7,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: `${C.warning}13`,
      borderWidth: 1,
      borderColor: `${C.warning}35`,
    },
    taskText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 5 },
    taskFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 13,
    },
    taskStatus: { color: C.textSecondary, fontSize: 12, fontWeight: '900', marginRight: 'auto' },
    taskActionHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '70%',
    },
    taskActionHintText: {
      color: C.primary,
      fontSize: 12,
      fontWeight: '900',
      textAlign: 'right',
      flexShrink: 1,
    },
    smallAction: {
      minHeight: 37,
      borderRadius: 14,
      paddingHorizontal: 11,
      backgroundColor: C.actionCard,
      borderWidth: 1,
      borderColor: `${C.primary}30`,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    smallActionText: { color: C.primary, fontSize: 11, fontWeight: '900' },
    timelineRow: {
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    timelineDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.primary, marginTop: 4 },
    timelineTitle: { color: C.text, fontSize: 14, fontWeight: '900' },
    timelineText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 4 },
    timelineDate: { color: C.tabInactive, fontSize: 11, marginTop: 5 },
    formShell: {
      borderRadius: 26,
      marginTop: 8,
      marginBottom: 18,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    formCard: {
      borderRadius: 26,
      padding: 17,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
    },
    formTitle: { color: C.text, fontSize: 18, fontWeight: '900' },
    formText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 5, marginBottom: 13 },
    cancelCard: {
      borderRadius: 22,
      padding: 16,
      backgroundColor: `${C.danger}0D`,
      borderWidth: 1,
      borderColor: `${C.danger}35`,
      marginBottom: 18,
    },
    smallDangerButton: {
      minHeight: 46,
      borderRadius: 16,
      paddingHorizontal: 13,
      backgroundColor: `${C.danger}10`,
      borderWidth: 1,
      borderColor: `${C.danger}35`,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    smallDangerText: { color: C.danger, fontSize: 12, fontWeight: '900' },
    exitModalNotice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 9,
      borderRadius: 17,
      padding: 13,
      marginTop: 14,
      marginBottom: 4,
      backgroundColor: `${C.warning}10`,
      borderWidth: 1,
      borderColor: `${C.warning}35`,
    },
    exitModalNoticeText: {
      flex: 1,
      color: C.text,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
    },
    exitRequirementCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 11,
      borderRadius: 19,
      padding: 14,
      marginTop: 16,
      backgroundColor: C.actionCard,
      borderWidth: 1,
      borderColor: `${C.primary}35`,
    },
    exitRequirementTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: '900',
    },
    exitRequirementText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 4,
    },
    historyCard: {
      borderRadius: 20,
      padding: 14,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 10,
    },
    historyIcon: {
      width: 44,
      height: 44,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.actionCard,
    },
    historyTitle: { color: C.text, fontSize: 15, fontWeight: '900' },
    historyText: { color: C.textSecondary, fontSize: 13, marginTop: 4 },
    keyboardSafeModalCard: {
      borderWidth: 1,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 18 },
      elevation: 18,
    },
    modalRoot: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 34,
    },
    modalFallback: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.72)',
    },
    modalOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.42)',
    },
    modalKeyboard: {
      flex: 1,
      justifyContent: 'center',
      paddingVertical: Platform.OS === 'ios' ? 10 : 18,
    },
    modalCard: {
      width: '100%',
      maxHeight: Platform.OS === 'ios' ? '88%' : '82%',
      borderRadius: 28,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 18 },
      elevation: 18,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    modalEyebrow: {
      color: C.textSecondary,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.9,
    },
    modalTitle: { color: C.text, fontSize: 20, fontWeight: '900', marginTop: 3 },
    modalCloseButton: {
      width: 42,
      height: 42,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundSelected,
    },
    modalContent: { padding: 16, paddingBottom: 26 },
    modalText: { color: C.textSecondary, fontSize: 14, lineHeight: 22 },
    guidanceCard: {
      borderRadius: 20,
      padding: 14,
      marginTop: 16,
      marginBottom: 8,
      backgroundColor: C.actionCard,
      borderWidth: 1,
      borderColor: `${C.primary}28`,
    },
    guidanceTitle: { color: C.text, fontSize: 15, fontWeight: '900', marginBottom: 9 },
    guidanceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 7 },
    guidanceDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: C.primary,
      marginTop: 7,
    },
    guidanceText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, flex: 1 },
    modalStatusCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      borderRadius: 17,
      padding: 13,
      marginTop: 14,
      backgroundColor: C.backgroundSelected,
      borderWidth: 1,
      borderColor: C.border,
    },
    modalStatusText: { color: C.text, fontSize: 13, lineHeight: 19, flex: 1, fontWeight: '700' },
    secondaryButton: {
      minHeight: 52,
      borderRadius: 999,
      paddingHorizontal: 16,
      marginTop: 15,
      borderWidth: 1,
      borderColor: `${C.primary}55`,
      backgroundColor: C.actionCard,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    secondaryButtonText: { color: C.primary, fontSize: 14, fontWeight: '900' },
    modalDisclaimer: {
      color: C.textSecondary,
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
      paddingHorizontal: 8,
      marginTop: 8,
    },
    errorShell: {
      borderRadius: 28,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    errorCard: {
      borderRadius: 28,
      padding: 22,
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
    },
    errorTitle: { color: C.text, fontSize: 21, fontWeight: '900', marginTop: 13 },
    errorText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: 7,
      marginBottom: 18,
    },
  });