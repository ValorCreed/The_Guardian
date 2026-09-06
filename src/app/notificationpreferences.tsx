import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  api,
  NotificationPreferences,
  UpdateNotificationPreferences,
} from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushNotificationState,
  openPushNotificationSettings,
  PushNotificationState,
} from '../services/pushNotifications';
import {
  hapticLight,
  hapticToggleOff,
  hapticToggleOn,
  hapticWarning,
} from '../utils/haptics';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { useScreenAlert } from '../hooks/useScreenAlert';

type CategoryPreferenceKey =
  | 'securityAlerts'
  | 'emergencyRecovery'
  | 'continuityReminders'
  | 'billing'
  | 'productUpdates';

const DEFAULT_PUSH_STATE: PushNotificationState = {
  supported: true,
  permission: 'undetermined',
  enabled: false,
  registered: false,
};

const CATEGORY_ROWS: {
  key: CategoryPreferenceKey;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: 'securityAlerts',
    title: 'Security alerts',
    description: 'Sign-ins, breaches and account protection.',
    icon: 'shield-checkmark-outline',
  },
  {
    key: 'emergencyRecovery',
    title: 'Emergency & recovery',
    description: 'Safety checks, recovery and emergency access.',
    icon: 'medkit-outline',
  },
  {
    key: 'continuityReminders',
    title: 'Continuity reminders',
    description: 'Drills, deadlines and completion reminders.',
    icon: 'analytics-outline',
  },
  {
    key: 'billing',
    title: 'Billing alerts',
    description: 'Payments and subscription changes.',
    icon: 'card-outline',
  },
  {
    key: 'productUpdates',
    title: 'Product updates',
    description: 'New Guardian features and improvements.',
    icon: 'sparkles-outline',
  },
];

export default function NotificationPreferencesScreen() {
  const screenAlert = useScreenAlert();

  const { isDark, colors: C } = useAppTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [pushState, setPushState] =
    useState<PushNotificationState>(DEFAULT_PUSH_STATE);
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null);
  const [pushStateLoading, setPushStateLoading] = useState(true);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pushWorking, setPushWorking] = useState(false);
  const [workingCategory, setWorkingCategory] =
    useState<CategoryPreferenceKey | null>(null);
  const [pushStateError, setPushStateError] = useState<string | null>(null);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);

  const loadPushState = useCallback(async (showLoader = false) => {
    if (showLoader) setPushStateLoading(true);
    setPushStateError(null);

    try {
      const nextPushState = await getPushNotificationState();
      setPushState(nextPushState);
    } catch (error: any) {
      /*
       * A native-module or device-status read failure is not proof that the
       * current build is Expo Go. Keep the control visible and let the user
       * retry instead of incorrectly disabling it as "unsupported".
       */
      setPushStateError(
        error?.message ||
          'Guardian could not read this device notification status.'
      );
    } finally {
      setPushStateLoading(false);
    }
  }, []);

  const loadPreferences = useCallback(async (showLoader = false) => {
    if (showLoader) setPreferencesLoading(true);
    setPreferencesError(null);

    try {
      setPreferences(await api.getNotificationPreferences());
    } catch (error: any) {
      setPreferencesError(
        error?.message ||
          'Guardian could not load notification preferences.'
      );
    } finally {
      setPreferencesLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      /*
       * Device push state is independent from the backend category endpoint.
       * Load both concurrently, but never make the device toggle wait for a
       * slow or unavailable server preference request.
       */
      void loadPushState(true);
      void loadPreferences(true);

      const appStateSubscription = AppState.addEventListener(
        'change',
        (nextState) => {
          if (active && nextState === 'active') {
            void loadPushState(false);
          }
        }
      );

      return () => {
        active = false;
        appStateSubscription.remove();
      };
    }, [loadPreferences, loadPushState])
  );

  const refresh = useCallback(() => {
    setRefreshing(true);

    void Promise.allSettled([
      loadPushState(false),
      loadPreferences(false),
    ]).finally(() => setRefreshing(false));
  }, [loadPreferences, loadPushState]);

  const handleDevicePushToggle = async (value: boolean) => {
    if (pushWorking) return;

    if (!pushState.supported) {
      hapticWarning();
      screenAlert(
        'Development build required',
        'Remote push alerts are unavailable in Expo Go. Install a Guardian development, preview or production build to enable them.'
      );
      return;
    }

    try {
      setPushWorking(true);

      if (value) {
        const enabledState = await enablePushNotifications();

        if (
          !enabledState.supported ||
          enabledState.permission !== 'granted' ||
          !enabledState.enabled ||
          !enabledState.registered
        ) {
          throw new Error(
            'Guardian could not confirm push registration on this device.'
          );
        }

        setPushState(enabledState);
        setPushStateError(null);
        hapticToggleOn();
        screenAlert(
          'Push alerts enabled',
          'This device can now receive your selected Guardian alerts.'
        );
        return;
      }

      hapticToggleOff();
      await disablePushNotifications();
      setPushState((current) => ({
        ...current,
        enabled: false,
        registered: false,
      }));
    } catch (error: any) {
      const message = String(error?.message || '');
      const normalizedMessage = message.toLowerCase();
      const permissionDenied = normalizedMessage.includes('permission');
      const unsupportedBuild =
        normalizedMessage.includes('expo go') ||
        normalizedMessage.includes('development, preview, or production build');

      setPushState((current) => ({
        ...current,
        supported: unsupportedBuild ? false : current.supported,
        permission: permissionDenied ? 'denied' : current.permission,
        enabled: false,
        registered: false,
      }));

      setPushStateError(
        permissionDenied || unsupportedBuild
          ? null
          : message || 'Guardian could not update this device notification status.'
      );

      screenAlert(
        unsupportedBuild
          ? 'Development build required'
          : permissionDenied
            ? 'Notification permission is off'
            : 'Could not update push alerts',
        unsupportedBuild
          ? 'Remote push alerts are unavailable in Expo Go. Install a Guardian development, preview or production build to enable them.'
          : permissionDenied
            ? 'Allow notifications for The Guardian in your device settings, then return here and try again.'
            : message || 'Please try again while this device is online.',
        permissionDenied
          ? [
              { text: 'Not now', style: 'cancel' },
              {
                text: 'Open settings',
                onPress: () => void openPushNotificationSettings(),
              },
            ]
          : [{ text: 'OK' }]
      );
    } finally {
      setPushWorking(false);
    }
  };

  const saveCategory = async (
    key: CategoryPreferenceKey,
    value: boolean
  ) => {
    if (!preferences || workingCategory) return;

    const previous = preferences;
    setPreferences({ ...previous, [key]: value });
    setWorkingCategory(key);

    try {
      const body: UpdateNotificationPreferences = { [key]: value };
      const saved = await api.updateNotificationPreferences(body);
      setPreferences(saved);
      if (value) {
        hapticToggleOn();
      } else {
        hapticToggleOff();
      }
    } catch (error: any) {
      setPreferences(previous);
      hapticWarning();
      screenAlert(
        'Could not save preference',
        error?.message || 'Please try again while Guardian is online.'
      );
    } finally {
      setWorkingCategory(null);
    }
  };

  const updateCategory = (
    key: CategoryPreferenceKey,
    value: boolean
  ) => {
    if (!preferences || workingCategory) return;

    if (key === 'securityAlerts' && !value) {
      hapticWarning();
      screenAlert(
        'Turn off security alerts?',
        'You may miss important account warnings. Critical events will still appear inside Guardian.',
        [
          { text: 'Keep enabled', style: 'cancel' },
          {
            text: 'Turn off',
            style: 'destructive',
            onPress: () => void saveCategory(key, value),
          },
        ]
      );
      return;
    }

    void saveCategory(key, value);
  };

  const pushEnabled =
    pushState.enabled &&
    pushState.registered &&
    pushState.permission === 'granted';

  const deviceStatusText = pushWorking
    ? 'Updating...'
    : pushStateLoading
      ? 'Checking this device...'
      : !pushState.supported
        ? 'Unavailable in Expo Go'
        : pushStateError
          ? 'Status unavailable — tap to retry'
          : pushState.permission === 'denied'
            ? 'Permission disabled'
            : pushEnabled
              ? 'Enabled and registered'
              : 'Off on this device';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={C.background}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        }
      >
        <Text style={styles.title}>Notification Preferences</Text>
        <Text style={styles.subtitle}>Choose the alerts you want to receive.</Text>

        <Text style={styles.sectionLabel}>THIS DEVICE</Text>

        <View style={styles.preferenceCard}>
          <View style={styles.deviceRow}>
            <View style={styles.iconCircle}>
              <Ionicons
                name="notifications-outline"
                size={21}
                color={C.primary}
              />
            </View>

            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Push alerts</Text>
              <Text style={styles.rowDescription}>{deviceStatusText}</Text>
            </View>

            {pushWorking || pushStateLoading ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              <Switch
                value={pushEnabled}
                disabled={
                  pushStateLoading ||
                  (!pushState.supported && !pushStateError)
                }
                onValueChange={(value) => void handleDevicePushToggle(value)}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#fff"
                ios_backgroundColor={C.border}
              />
            )}
          </View>

          {pushStateError && pushState.supported && (
            <TouchableOpacity
              style={styles.settingsButton}
              activeOpacity={0.82}
              onPress={() => {
                hapticLight();
                void loadPushState(false);
              }}
            >
              <Ionicons name="refresh-outline" size={18} color={C.primary} />
              <Text style={styles.settingsButtonText}>Retry device status</Text>
            </TouchableOpacity>
          )}

          {pushState.supported && pushState.permission === 'denied' && (
            <TouchableOpacity
              style={styles.settingsButton}
              activeOpacity={0.82}
              onPress={() => {
                hapticLight();
                void openPushNotificationSettings();
              }}
            >
              <Ionicons name="settings-outline" size={18} color={C.primary} />
              <Text style={styles.settingsButtonText}>Open device settings</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.sectionLabel}>ALERT CATEGORIES</Text>

        {preferencesLoading && !preferences ? (
          <View style={styles.skeletonList}>
            {[1, 2, 3, 4, 5].map((row) => (
              <SkeletonPreferenceCard key={row} styles={styles} />
            ))}
          </View>
        ) : preferencesError && !preferences ? (
          <View style={styles.errorCard}>
            <View style={styles.largeIcon}>
              <Ionicons name="cloud-offline-outline" size={30} color={C.warning} />
            </View>
            <Text style={styles.errorTitle}>Category preferences unavailable</Text>
            <Text style={styles.errorText}>{preferencesError}</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.84}
              onPress={() => {
                hapticLight();
                void loadPreferences(false);
              }}
            >
              <Ionicons name="refresh-outline" size={19} color="#fff" />
              <Text style={styles.primaryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.categoryList}>
            {CATEGORY_ROWS.map((row) => {
              const value = Boolean(preferences?.[row.key]);
              const busy = workingCategory === row.key;
              const disabled = Boolean(workingCategory);

              return (
                <View key={row.key} style={styles.categoryCard}>
                  <View style={styles.iconCircle}>
                    <Ionicons name={row.icon} size={21} color={C.primary} />
                  </View>

                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{row.title}</Text>
                    <Text style={styles.rowDescription}>{row.description}</Text>
                  </View>

                  {busy ? (
                    <ActivityIndicator size="small" color={C.primary} />
                  ) : (
                    <Switch
                      value={value}
                      disabled={disabled || !preferences}
                      onValueChange={(nextValue) =>
                        updateCategory(row.key, nextValue)
                      }
                      trackColor={{ false: C.border, true: C.primary }}
                      thumbColor="#fff"
                      ios_backgroundColor={C.border}
                    />
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 110 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SkeletonPreferenceCard({
  styles,
  device = false,
}: {
  styles: any;
  device?: boolean;
}) {
  return (
    <View style={[styles.skeletonCard, device && styles.skeletonDeviceCard]}>
      <PulsingSkeleton styles={styles} style={styles.skeletonIcon} />
      <View style={styles.skeletonTextContainer}>
        <PulsingSkeleton styles={styles} style={styles.skeletonLine} />
        <PulsingSkeleton styles={styles} style={styles.skeletonText} />
      </View>
      <PulsingSkeleton styles={styles} style={styles.skeletonSwitch} />
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 92,
      paddingBottom: 36,
    },
    title: {
      color: C.text,
      fontSize: 31,
      fontWeight: '900',
      letterSpacing: -0.6,
    },
    subtitle: {
      color: C.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 6,
      marginBottom: 24,
    },
    sectionLabel: {
      color: C.textSecondary,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1,
      marginLeft: 4,
      marginBottom: 10,
      marginTop: 2,
    },
    preferenceCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 22,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    categoryList: {
      gap: 12,
    },
    categoryCard: {
      minHeight: 82,
      paddingHorizontal: 14,
      paddingVertical: 13,
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    deviceRow: {
      minHeight: 78,
      paddingHorizontal: 14,
      paddingVertical: 13,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    iconCircle: {
      width: 42,
      height: 42,
      borderRadius: 16,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    rowText: {
      flex: 1,
      minWidth: 0,
    },
    rowTitle: {
      color: C.text,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '900',
    },
    rowDescription: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 3,
      paddingRight: 4,
    },
    settingsButton: {
      marginHorizontal: 14,
      marginBottom: 14,
      minHeight: 44,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: `${C.primary}40`,
      backgroundColor: C.actionCard,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 11 },
      elevation: 10,
    },
    settingsButtonText: {
      color: C.primary,
      fontSize: 13,
      fontWeight: '900',
    },
    errorCard: {
      borderRadius: 24,
      padding: 22,
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    largeIcon: {
      width: 64,
      height: 64,
      borderRadius: 23,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
      shadowColor: '#000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    errorTitle: {
      color: C.text,
      fontSize: 20,
      fontWeight: '900',
      textAlign: 'center',
    },
    errorText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: 7,
      marginBottom: 17,
    },
    primaryButton: {
      minHeight: 50,
      borderRadius: 999,
      paddingHorizontal: 18,
      backgroundColor: C.backgroundbutton,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 11 },
      elevation: 10,
    },
    primaryButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '900',
    },
    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,
    },
    skeletonTitle: {
      width: '72%',
      height: 32,
      marginBottom: 12,
    },
    skeletonSubtitle: {
      width: '64%',
      height: 16,
      marginBottom: 26,
    },
    skeletonLabel: {
      width: 105,
      height: 12,
      marginLeft: 4,
      marginBottom: 10,
    },
    skeletonList: {
      gap: 12,
    },
    skeletonCard: {
      minHeight: 82,
      paddingHorizontal: 14,
      paddingVertical: 13,
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    skeletonDeviceCard: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },

      marginBottom: 22,
    },
    skeletonTextContainer: {
      flex: 1,
    },
    skeletonIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 42,
      height: 42,
      borderRadius: 16,
    },
    skeletonLine: {
      width: '56%',
      height: 14,
      marginBottom: 9,
    },
    skeletonText: {
      width: '84%',
      height: 11,
    },
    skeletonSwitch: {
      width: 46,
      height: 28,
    },
  });