import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';

import { useAppTheme } from '../context/ThemeContext';
import { isScreenRequestCancelled } from '../hooks/useCancelableApi';
import {
  clearGuardianAutofillCache,
  getGuardianAutofillCounts,
  GUARDIAN_AUTOFILL_ENABLED_KEY,
  GUARDIAN_AUTOFILL_LAST_SYNCED_AT_KEY,
  isGuardianAutofillAvailable,
  syncGuardianAutofillCache,
  syncPendingGuardianAutofillSaves,
  type GuardianAutofillCounts,
} from '../services/autofillSync';

const EMPTY_COUNTS: GuardianAutofillCounts = {
  credentials: 0,
  cards: 0,
  pending: 0,
};

export default function AutofillScreen() {
  const { colors: C, isDark } = useAppTheme();
  const styles = makeStyles(C);

  const [enabled, setEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [counts, setCounts] = useState<GuardianAutofillCounts>(EMPTY_COUNTS);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const nativeAutofillAvailable = isGuardianAutofillAvailable();
  const totalReady = counts.credentials + counts.cards;

  const statusText = useMemo(() => {
    if (Platform.OS !== 'android') {
      return 'System-wide Guardian autofill is currently available on Android.';
    }
    if (!nativeAutofillAvailable) {
      return 'The native Autofill module is not available in this build. Rebuild the Android app.';
    }
    if (!enabled) {
      return 'Enable Autofill to use saved passwords and cards in supported Android apps and websites.';
    }
    if (totalReady === 0) {
      return 'No passwords or cards have been synced for autofill yet.';
    }
    return `${counts.credentials} login${counts.credentials === 1 ? '' : 's'} and ${counts.cards} card${counts.cards === 1 ? '' : 's'} are ready.`;
  }, [counts.cards, counts.credentials, enabled, nativeAutofillAvailable, totalReady]);

  const loadState = useCallback(async () => {
    const storedEnabled =
      (await AsyncStorage.getItem(GUARDIAN_AUTOFILL_ENABLED_KEY)) === 'true';
    setEnabled(storedEnabled);
    setLastSyncedAt(
      await AsyncStorage.getItem(GUARDIAN_AUTOFILL_LAST_SYNCED_AT_KEY)
    );

    if (!nativeAutofillAvailable) {
      setCounts(EMPTY_COUNTS);
      return;
    }

    try {
      if (storedEnabled) {
        await syncPendingGuardianAutofillSaves();
      }
      setCounts(await getGuardianAutofillCounts());
    } catch (error) {
      if (isScreenRequestCancelled(error)) return;
      setCounts(EMPTY_COUNTS);
    }
  }, [nativeAutofillAvailable]);

  useFocusEffect(
    useCallback(() => {
      void loadState();
    }, [loadState])
  );

  const openDeviceSettings = useCallback(async () => {
    if (Platform.OS !== 'android') {
      Alert.alert(
        'Android only for now',
        'System-wide autofill setup is currently available on Android only.'
      );
      return;
    }

    try {
      const applicationId = Application.applicationId;
      if (!applicationId) {
        throw new Error('The Android application ID is unavailable in this build.');
      }

      await IntentLauncher.startActivityAsync(
        'android.settings.REQUEST_SET_AUTOFILL_SERVICE',
        { data: `package:${applicationId}` }
      );
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) return;
      try {
        await IntentLauncher.startActivityAsync('android.settings.AUTOFILL_SETTINGS');
      } catch (settingsError) {
        if (isScreenRequestCancelled(settingsError)) return;
        Alert.alert(
          'Open Autofill settings manually',
          'Open Settings and search for “Autofill”, “Passwords”, “Password manager”, or “Preferred service”, then choose The Guardian.'
        );
      }
    }
  }, []);

  const syncAutofillVault = useCallback(async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Android only for now', 'System-wide autofill is currently available on Android only.');
      return;
    }

    if (!nativeAutofillAvailable) {
      Alert.alert(
        'Rebuild required',
        'The native Autofill module is not available in this build. Add the updated Android files and rebuild the APK.'
      );
      return;
    }

    try {
      setSyncing(true);

      // Enable and seed the native cache first. Pending credentials captured by
      // Android before this screen was opened can then be committed to the
      // signed-in online vault during the same setup action.
      await syncGuardianAutofillCache({
        force: true,
        enable: true,
      });
      await syncPendingGuardianAutofillSaves();
      const nextCounts = await getGuardianAutofillCounts();
      const now = new Date().toISOString();

      setEnabled(true);
      setCounts(nextCounts);
      setLastSyncedAt(now);

      Alert.alert(
        'Autofill synced',
        `${nextCounts.credentials} login${nextCounts.credentials === 1 ? '' : 's'} and ${nextCounts.cards} card${nextCounts.cards === 1 ? '' : 's'} are ready for Android Autofill.`
      );
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) return;
      Alert.alert(
        'Sync failed',
        error?.message || 'Could not sync passwords and cards for autofill.'
      );
    } finally {
      setSyncing(false);
      setRefreshing(false);
    }
  }, [nativeAutofillAvailable]);

  const clearAutofill = useCallback(async () => {
    if (!nativeAutofillAvailable) return;

    Alert.alert(
      'Clear autofill cache?',
      'This removes the encrypted password and card autofill cache from this device, including any newly saved logins still waiting to sync. Your online vault is not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              setSyncing(true);
              await clearGuardianAutofillCache();
              setEnabled(false);
              setCounts(EMPTY_COUNTS);
              setLastSyncedAt(null);
              Alert.alert('Cleared', 'The encrypted autofill cache was removed from this device.');
            } catch (error: any) {
              if (isScreenRequestCancelled(error)) return;
              Alert.alert('Could not clear cache', error?.message || 'Please try again.');
            } finally {
              setSyncing(false);
            }
          },
        },
      ]
    );
  }, [nativeAutofillAvailable]);

  const toggleAutofill = async (value: boolean) => {
    if (value) {
      await syncAutofillVault();
      return;
    }
    await clearAutofill();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await syncAutofillVault();
  };

  const lastSyncedLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not synced yet';

  const platformSteps = Platform.OS === 'android'
    ? [
        ['Sync your vault', 'Sync saved passwords and cards into Android’s encrypted Guardian cache.'],
        ['Choose The Guardian', 'Select The Guardian as your preferred Autofill service in Android Settings.'],
        ['Fill passwords and cards', 'Tap a supported login or payment field, unlock, then choose an item.'],
        ['Save new logins', 'After signing in or creating a password, Android can offer to save it to The Guardian.'],
      ]
    : [
        ['Android implementation', 'Password and card provider support is currently implemented for Android.'],
        ['Use the vault on iPhone', 'Open a vault item and securely copy the required value.'],
      ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
            colors={[C.primary]}
            progressBackgroundColor={C.backgroundElement}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Auto-fill</Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark-outline" size={28} color={C.primary} />
          </View>

          <Text style={styles.heroTitle}>Autofill status</Text>
          <Text style={styles.heroText}>{statusText}</Text>

          <View style={styles.statusPill}>
            <Ionicons
              name={enabled && totalReady > 0 ? 'checkmark-circle' : 'alert-circle-outline'}
              size={16}
              color={enabled && totalReady > 0 ? C.success : C.warning}
            />
            <Text style={styles.statusPillText}>
              {enabled && totalReady > 0 ? 'Ready' : 'Setup needed'}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Autofill cache</Text>
              <Text style={styles.rowSub}>Last sync: {lastSyncedLabel}</Text>
            </View>

            <Switch
              value={enabled}
              onValueChange={toggleAutofill}
              trackColor={{ false: C.border, true: C.primary }}
              thumbColor="#fff"
              ios_backgroundColor={C.border}
              disabled={syncing || Platform.OS !== 'android'}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.numberCircle}>
              <Ionicons name="key-outline" size={16} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Passwords</Text>
              <Text style={styles.infoSub}>{counts.credentials} ready for autofill</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.numberCircle}>
              <Ionicons name="card-outline" size={16} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Cards</Text>
              <Text style={styles.infoSub}>{counts.cards} ready for payment forms</Text>
            </View>
          </View>

          {counts.pending > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <View style={styles.numberCircle}>
                  <Ionicons name="cloud-upload-outline" size={16} color={C.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoTitle}>Awaiting online sync</Text>
                  <Text style={styles.infoSub}>
                    {counts.pending} login{counts.pending === 1 ? '' : 's'} saved securely on this device
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, syncing && styles.disabledButton]}
          activeOpacity={0.85}
          onPress={syncAutofillVault}
          disabled={syncing || Platform.OS !== 'android'}
        >
          {syncing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Ionicons name="sync-outline" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.primaryButtonText}>
            {syncing ? 'Syncing...' : 'Sync passwords and cards'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.85}
          onPress={openDeviceSettings}
        >
          <Ionicons name="settings-outline" size={20} color={C.primary} />
          <Text style={styles.secondaryButtonText}>
            {Platform.OS === 'android'
              ? 'Choose The Guardian as autofill service'
              : 'Open device settings'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>How it works</Text>

        <View style={styles.card}>
          {platformSteps.map(([title, subtitle], index) => (
            <View
              key={title}
              style={[styles.infoRow, index !== platformSteps.length - 1 && styles.divider]}
            >
              <View style={styles.numberCircle}>
                <Text style={styles.numberText}>{index + 1}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.infoTitle}>{title}</Text>
                <Text style={styles.infoSub}>{subtitle}</Text>
              </View>
            </View>
          ))}
        </View>

        <View>
          {/* <Ionicons name="shield-checkmark-outline" size={22} color={C.primary} /> */}
          <View style={{ flex: 1 }}>
            {/* <Text style={styles.warningTitle}>Security note</Text>
            <Text style={styles.warningText}>
              Autofill data is encrypted with Android Keystore and released only after device authentication. Newly saved logins sync to your online vault the next time The Guardian is opened while signed in.
            </Text> */}
          </View>
        </View>

        {nativeAutofillAvailable && totalReady > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            activeOpacity={0.8}
            onPress={clearAutofill}
            disabled={syncing}
          >
            <Ionicons name="trash-outline" size={18} color={C.danger} />
            <Text style={styles.clearButtonText}>Clear autofill cache</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
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
      paddingTop: 96,
      paddingBottom: 130,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 24,
    },

    title: {
      fontSize: 28,
      fontWeight: '900',
      color: C.text,
    },

    heroCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      padding: 20,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: C.border,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    iconCircle: {
      width: 58,
      height: 58,
      borderRadius: 24,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },

    heroTitle: {
      fontSize: 22,
      fontWeight: '900',
      color: C.text,
      marginBottom: 8,
    },

    heroText: {
      fontSize: 14,
      color: C.textSecondary,
      lineHeight: 21,
    },

    statusPill: {
      alignSelf: 'flex-start',
      marginTop: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    statusPillText: {
      color: C.text,
      fontSize: 12,
      fontWeight: '900',
    },

    card: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 16,
      overflow: 'hidden',

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 14,
    },

    rowTitle: {
      fontSize: 15,
      fontWeight: '900',
      color: C.text,
    },

    rowSub: {
      fontSize: 12,
      color: C.textSecondary,
      lineHeight: 18,
      marginTop: 4,
    },

    primaryButton: {
      backgroundColor: C.backgroundbutton,
      borderRadius: 999,
      minHeight: 56,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 9,
      marginBottom: 12,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
    },

    secondaryButton: {
      backgroundColor: C.backgroundElement,
      borderRadius: 999,
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 9,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 22,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    secondaryButtonText: {
      color: C.primary,
      fontSize: 14,
      fontWeight: '900',
    },

    disabledButton: {
      opacity: 0.65,
    },

    sectionTitle: {
      fontSize: 17,
      fontWeight: '900',
      color: C.text,
      marginBottom: 10,
      marginLeft: 2,
    },

    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 16,
    },

    divider: {
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },

    numberCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
    },

    numberText: {
      color: C.primary,
      fontSize: 13,
      fontWeight: '900',
    },

    infoTitle: {
      color: C.text,
      fontSize: 14,
      fontWeight: '900',
    },

    infoSub: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 3,
    },

    warningCard: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 16,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    warningTitle: {
      fontSize: 14,
      fontWeight: '900',
      color: C.text,
      marginBottom: 4,
    },

    warningText: {
      fontSize: 12,
      color: C.textSecondary,
      lineHeight: 18,
    },

    clearButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: C.alertDangerBg,
      borderWidth: 1,
      borderColor: C.danger,
      borderRadius: 999,
      paddingVertical: 14,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    clearButtonText: {
      color: C.danger,
      fontSize: 14,
      fontWeight: '900',
    },
  });
