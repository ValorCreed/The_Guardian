import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  NativeModules,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';

import { useAppTheme } from '../context/ThemeContext';
import { api, VaultItem } from '../services/api';
import { decryptPassword } from '../utils/vaultcrypto';

const AUTOFILL_KEY = 'autofillEnabled';

const GuardianAutofill = NativeModules.GuardianAutofill as
  | {
      syncCredentials: (credentialsJson: string) => Promise<number>;
      clearCredentials: () => Promise<boolean>;
      getCredentialCount: () => Promise<number>;
    }
  | undefined;

type CachedCredential = {
  id: string;
  title: string;
  username: string;
  password: string;
  website: string;
};

const clean = (value?: string | null) => String(value || '').trim();

const buildCredential = (item: VaultItem): CachedCredential | null => {
  const password = item.encryptedPassword ? decryptPassword(item.encryptedPassword) : '';
  const username = clean(item.usernameValue);

  if (!username || !password) return null;

  return {
    id: String(item.id),
    title: clean(item.title || item.website) || 'Saved login',
    username,
    password,
    website: clean(item.website || item.title),
  };
};

export default function AutofillScreen() {
  const { colors: C, isDark } = useAppTheme();
  const styles = makeStyles(C);

  const [enabled, setEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const nativeAutofillAvailable = Platform.OS === 'android' && Boolean(GuardianAutofill);

  const statusText = useMemo(() => {
    if (Platform.OS !== 'android') return 'iOS requires a separate Credential Provider extension later.';
    if (!GuardianAutofill) return 'Native Autofill module is not available in this build yet.';
    if (!enabled) return 'Enable and sync your saved logins before using Android Autofill.';
    if (syncedCount === 0) return 'No passwords have been synced for autofill yet.';
    return `${syncedCount} saved login${syncedCount === 1 ? '' : 's'} ready for Android Autofill.`;
  }, [enabled, syncedCount]);

  const loadState = useCallback(async () => {
    setEnabled((await AsyncStorage.getItem(AUTOFILL_KEY)) === 'true');
    setLastSyncedAt(await AsyncStorage.getItem('autofillLastSyncedAt'));

    if (GuardianAutofill) {
      try {
        const count = await GuardianAutofill.getCredentialCount();
        setSyncedCount(Number(count || 0));
      } catch {
        setSyncedCount(0);
      }
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

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
        {
          data: `package:${applicationId}`,
        }
      );
    } catch (error: any) {
      try {
        /*
         * Some Android manufacturers do not implement the direct autofill
         * selection intent correctly. This fallback opens the system's
         * password/autofill settings instead of The Guardian's app-info page.
         */
        await IntentLauncher.startActivityAsync(
          'android.settings.AUTOFILL_SETTINGS'
        );
      } catch {
        Alert.alert(
          'Open Autofill settings manually',
          'Open Settings and search for “Autofill”, “Passwords”, “Password manager”, or “Preferred service”, then choose The Guardian.'
        );
      }
    }
  }, []);

  const syncAutofillCredentials = useCallback(async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Android only for now', 'System-wide autofill is currently being added for Android first.');
      return;
    }

    if (!GuardianAutofill) {
      Alert.alert(
        'Rebuild required',
        'The native Autofill module is not available in this build. Replace the Android files from the zip and rebuild the development APK.'
      );
      return;
    }

    try {
      setSyncing(true);

      api.clearCache?.();
      const items = await api.getVaultItems();
      const credentials = (items || [])
        .filter((item) => (item.itemType || 'PASSWORD') === 'PASSWORD')
        .map(buildCredential)
        .filter(Boolean) as CachedCredential[];

      const count = await GuardianAutofill.syncCredentials(JSON.stringify(credentials));
      const now = new Date().toISOString();

      await AsyncStorage.setItem(AUTOFILL_KEY, 'true');
      await AsyncStorage.setItem('autofillLastSyncedAt', now);

      setEnabled(true);
      setSyncedCount(Number(count || credentials.length));
      setLastSyncedAt(now);

      Alert.alert(
        'Autofill synced',
        `${Number(count || credentials.length)} saved login${Number(count || credentials.length) === 1 ? '' : 's'} are ready for Android Autofill.`
      );
    } catch (error: any) {
      Alert.alert('Sync failed', error.message || 'Could not sync passwords for autofill.');
    } finally {
      setSyncing(false);
      setRefreshing(false);
    }
  }, []);

  const clearAutofillCredentials = useCallback(async () => {
    if (!GuardianAutofill) return;

    Alert.alert(
      'Clear autofill cache?',
      'This removes the encrypted autofill cache from this device. Your vault items stay saved in your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              setSyncing(true);
              await GuardianAutofill.clearCredentials();
              await AsyncStorage.setItem(AUTOFILL_KEY, 'false');
              await AsyncStorage.removeItem('autofillLastSyncedAt');
              setEnabled(false);
              setSyncedCount(0);
              setLastSyncedAt(null);
              Alert.alert('Cleared', 'Autofill cache was removed from this device.');
            } catch (error: any) {
              Alert.alert('Could not clear cache', error.message || 'Please try again.');
            } finally {
              setSyncing(false);
            }
          },
        },
      ]
    );
  }, []);

  const toggleAutofill = async (value: boolean) => {
    if (value) {
      await syncAutofillCredentials();
      return;
    }

    await clearAutofillCredentials();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await syncAutofillCredentials();
  };

  const lastSyncedLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not synced yet';

  const platformSteps =
    Platform.OS === 'android'
      ? [
          ['Sync your vault', 'Tap Sync passwords for autofill so Android can show your saved logins.'],
          ['Choose The Guardian', 'Open Android Autofill settings and select The Guardian as the autofill service.'],
          ['Fill in other apps', 'Tap a username or password field, unlock, choose a login, and Android fills it.'],
        ]
      : [
          ['iOS coming later', 'iPhone needs a separate Credential Provider extension.'],
          ['Keep vault ready', 'Your saved logins will be useful when the iOS extension is added.'],
          ['Use copy for now', 'Open a password item and copy the username/password manually on iOS.'],
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
            <Ionicons name="key-outline" size={28} color={C.primary} />
          </View>

          <Text style={styles.heroTitle}>Fill passwords faster</Text>
          <Text style={styles.heroText}>{statusText}</Text>

          <View style={styles.statusPill}>
            <Ionicons
              name={enabled && syncedCount > 0 ? 'checkmark-circle' : 'alert-circle-outline'}
              size={16}
              color={enabled && syncedCount > 0 ? C.success : C.warning}
            />
            <Text style={styles.statusPillText}>{enabled && syncedCount > 0 ? 'Ready' : 'Setup needed'}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Android Autofill cache</Text>
              <Text style={styles.rowSub}>Encrypted on this device · Last sync: {lastSyncedLabel}</Text>
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
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, syncing && styles.disabledButton]}
          activeOpacity={0.85}
          onPress={syncAutofillCredentials}
          disabled={syncing || Platform.OS !== 'android'}
        >
          {syncing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Ionicons name="sync-outline" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.primaryButtonText}>{syncing ? 'Syncing...' : 'Sync passwords for autofill'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.85}
          onPress={openDeviceSettings}
        >
          <Ionicons name="settings-outline" size={20} color={C.primary} />
          <Text style={styles.secondaryButtonText}>
            {Platform.OS === 'android' ? 'Choose The Guardian as autofill service' : 'Open device settings'}
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

        <View style={styles.warningCard}>
          <Ionicons name="shield-checkmark-outline" size={22} color={C.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.warningTitle}>Security note</Text>
            <Text style={styles.warningText}>
              The native autofill cache is encrypted and stored only on this device. Sync again whenever you add, edit, or delete a password.
            </Text>
          </View>
        </View>

        {nativeAutofillAvailable && syncedCount > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            activeOpacity={0.8}
            onPress={clearAutofillCredentials}
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
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

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
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

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
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

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
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

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
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

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
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

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
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

    clearButtonText: {
      color: C.danger,
      fontSize: 14,
      fontWeight: '900',
    },
  });