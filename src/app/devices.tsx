import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { api, DeviceSession, logout } from '../services/api';

const formatDate = (value?: string | null) => {
  if (!value) return 'Unknown';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Unknown';

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getDeviceIcon = (type?: string) => {
  const value = String(type || '').toLowerCase();

  if (value.includes('android')) return 'logo-android';
  if (value.includes('ios') || value.includes('iphone') || value.includes('ipad')) return 'phone-portrait-outline';
  if (value.includes('windows')) return 'desktop-outline';
  if (value.includes('mac')) return 'laptop-outline';

  return 'phone-portrait-outline';
};


const resetToSignedOut = () => {
  /*
   * Remove stale protected screens from the native stack after session revokes.
   * This prevents Android back/gesture from returning to Home with placeholder
   * "User" data after the token has already been removed.
   */
  try {
    (router as any).dismissAll?.();
  } catch {
    // Older Expo Router builds may not support dismissAll.
  }

  router.replace('/login');
};

export default function DevicesScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [loggingOutOthers, setLoggingOutOthers] = useState(false);

  const activeSessions = useMemo(
    () => sessions.filter((session) => session.active),
    [sessions]
  );

  const currentSession = useMemo(
    () => activeSessions.find((session) => session.current),
    [activeSessions]
  );

  const otherActiveCount = useMemo(
    () => activeSessions.filter((session) => !session.current).length,
    [activeSessions]
  );

  const loadSessions = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);

      const data = await api.getDeviceSessions();

      /*
       * The backend now returns active sessions only, but this extra frontend
       * filter protects the UI if an older backend still returns revoked rows.
       */
      setSessions((data || []).filter((session) => session.active));
    } catch (error: any) {
      Alert.alert('Could not load devices', error.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSessions(true);
    }, [loadSessions])
  );

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await loadSessions(false);
    } finally {
      setRefreshing(false);
    }
  };

  const revokeSession = (session: DeviceSession) => {
    const isCurrent = session.current;

    Alert.alert(
      isCurrent ? 'Log out this device?' : 'Remove this device?',
      isCurrent
        ? 'This will end the current session and return you to sign in.'
        : `${session.deviceName || 'This device'} will no longer be able to use your account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isCurrent ? 'Log out' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setWorkingId(session.id);
              await api.revokeDeviceSession(session.id);
              api.clearCache?.();

              if (isCurrent) {
                await logout();
                resetToSignedOut();
                return;
              }

              // Remove it immediately so the deleted session does not stay visible.
              setSessions((current) => current.filter((item) => item.id !== session.id));

              // Then silently confirm with the server.
              await loadSessions(false);
            } catch (error: any) {
              Alert.alert('Could not remove device', error.message || 'Please try again.');
            } finally {
              setWorkingId(null);
            }
          },
        },
      ]
    );
  };

  const logoutOtherDevices = () => {
    if (otherActiveCount === 0) {
      Alert.alert('No other devices', 'Only this device is currently active.');
      return;
    }

    Alert.alert(
      'Log out other devices?',
      `This will end ${otherActiveCount} other active session(s), but keep this device signed in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out others',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoggingOutOthers(true);
              await api.logoutOtherDevices();
              api.clearCache?.();
              await loadSessions(false);
            } catch (error: any) {
              Alert.alert('Could not log out devices', error.message || 'Please try again.');
            } finally {
              setLoggingOutOthers(false);
            }
          },
        },
      ]
    );
  };

  const logoutAllDevices = () => {
    Alert.alert(
      'Log out everywhere?',
      'This will end all active sessions, including this device. You will need to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out everywhere',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoggingOutAll(true);
              await api.logoutAllDevices();
              await logout();
              resetToSignedOut();
            } catch (error: any) {
              Alert.alert('Could not log out everywhere', error.message || 'Please try again.');
            } finally {
              setLoggingOutAll(false);
            }
          },
        },
      ]
    );
  };

  const renderSession = (session: DeviceSession) => {
    const iconName = getDeviceIcon(session.deviceType);
    const isWorking = workingId === session.id;

    return (
      <View key={session.id} style={styles.deviceCard}>
        <View style={styles.deviceTopRow}>
          <View style={styles.deviceIcon}>
            <Ionicons name={iconName as any} size={22} color={C.primary} />
          </View>

          <View style={styles.deviceInfo}>
            <View style={styles.deviceNameRow}>
              <Text style={styles.deviceName} numberOfLines={1}>
                {session.deviceName || 'Trusted device'}
              </Text>

              {session.current && (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>Current</Text>
                </View>
              )}
            </View>

            <Text style={styles.deviceSub}>
              {session.deviceType || 'Unknown'} · {session.ipAddress || 'Unknown IP'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.removeButton}
            activeOpacity={0.75}
            onPress={() => revokeSession(session)}
            disabled={isWorking}
          >
            {isWorking ? (
              <ActivityIndicator size="small" color={C.danger} />
            ) : (
              <Ionicons
                name={session.current ? 'log-out-outline' : 'trash-outline'}
                size={19}
                color={C.danger}
              />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Ionicons name="time-outline" size={13} color={C.textSecondary} />
            <Text style={styles.metaText}>Last seen {formatDate(session.lastSeenAt)}</Text>
          </View>

          <View style={styles.metaPill}>
            <Ionicons name="calendar-outline" size={13} color={C.textSecondary} />
            <Text style={styles.metaText}>Added {formatDate(session.createdAt)}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderDevicesSkeleton = () => (
    <>
      <PulsingSkeleton styles={styles} style={styles.skeletonSectionTitle} />
      {[1, 2, 3].map((item) => (
        <View key={`device-skeleton-${item}`} style={styles.deviceCard}>
          <View style={styles.deviceTopRow}>
            <PulsingSkeleton styles={styles} style={styles.skeletonDeviceIcon} />
            <View style={styles.deviceInfo}>
              <PulsingSkeleton styles={styles} style={styles.skeletonDeviceTitle} />
              <PulsingSkeleton styles={styles} style={styles.skeletonDeviceSub} />
            </View>
            <PulsingSkeleton styles={styles} style={styles.skeletonRemoveButton} />
          </View>
          <View style={styles.metaRow}>
            <PulsingSkeleton styles={styles} style={styles.skeletonMetaPill} />
            <PulsingSkeleton styles={styles} style={styles.skeletonMetaPillSmall} />
          </View>
        </View>
      ))}
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        }
      >
        <Text style={styles.eyebrow}>Account security</Text>
        <Text style={styles.title}>Trusted Devices</Text>

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="shield-checkmark-outline" size={28} color="#FFFFFF" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>
              {activeSessions.length} active session{activeSessions.length === 1 ? '' : 's'}
            </Text>
            <Text style={styles.heroText}>
              Review devices signed in to your account. Remove anything you do not recognize.
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.82}
            onPress={logoutOtherDevices}
            disabled={loggingOutOthers}
          >
            {loggingOutOthers ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              <Ionicons name="phone-portrait-outline" size={22} color={C.primary} />
            )}
            <Text style={styles.actionTitle}>Log out others</Text>
            <Text style={styles.actionSub}>Keep this device signed in</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, styles.dangerActionCard]}
            activeOpacity={0.82}
            onPress={logoutAllDevices}
            disabled={loggingOutAll}
          >
            {loggingOutAll ? (
              <ActivityIndicator size="small" color={C.danger} />
            ) : (
              <Ionicons name="log-out-outline" size={22} color={C.danger} />
            )}
            <Text style={[styles.actionTitle, { color: C.danger }]}>Log out all</Text>
            <Text style={styles.actionSub}>Require sign in again</Text>
          </TouchableOpacity>
        </View>

        {currentSession && (
          <>
            <Text style={styles.sectionTitle}>This device</Text>
            {renderSession(currentSession)}
          </>
        )}

        <Text style={styles.sectionTitle}>All sessions</Text>

        {loading ? (
          renderDevicesSkeleton()
        ) : sessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="phone-portrait-outline" size={42} color={C.tabInactive} />
            <Text style={styles.emptyTitle}>No devices found</Text>
            <Text style={styles.emptyText}>Sign in again to register this device.</Text>
          </View>
        ) : (
          activeSessions
            .filter((session) => !session.current)
            .map(renderSession)
        )}

        <View style={{ height: 110 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({

    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

    skeletonSectionTitle: {
      width: 120,
      height: 18,
      marginBottom: 12,
      marginLeft: 2,
    },

    skeletonDeviceIcon: {
      width: 45,
      height: 45,
      borderRadius: 16,
    },

    skeletonDeviceTitle: {
      width: '68%',
      height: 15,
      marginBottom: 8,
    },

    skeletonDeviceSub: {
      width: '86%',
      height: 12,
    },

    skeletonRemoveButton: {
      width: 38,
      height: 38,
      borderRadius: 14,
    },

    skeletonMetaPill: {
      width: 118,
      height: 26,
    },

    skeletonMetaPillSmall: {
      width: 96,
      height: 26,
    },

    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },

    scrollContent: {
      marginTop: 70,
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 120,
    },

    eyebrow: {
      color: C.textSecondary,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 3,
    },

    title: {
      color: C.text,
      fontSize: 30,
      fontWeight: '900',
      marginBottom: 16,
    },

    heroCard: {
      backgroundColor: C.primary,
      borderRadius: 26,
      padding: 18,
      flexDirection: 'row',
      gap: 14,
      alignItems: 'center',
      marginBottom: 14,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

    heroIcon: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    heroTitle: {
      color: '#FFFFFF',
      fontSize: 19,
      fontWeight: '900',
      marginBottom: 4,
    },

    heroText: {
      color: 'rgba(255,255,255,0.86)',
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
    },

    actionRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 22,
    },

    actionCard: {
      flex: 1,
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      padding: 15,
      borderWidth: 1,
      borderColor: C.border,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

    dangerActionCard: {
      borderColor: C.alertDangerBg,
      backgroundColor: C.alertDangerBg,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

    actionTitle: {
      color: C.text,
      fontSize: 14,
      fontWeight: '900',
      marginTop: 10,
    },

    actionSub: {
      color: C.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 3,
      lineHeight: 15,
    },

    sectionTitle: {
      color: C.text,
      fontSize: 17,
      fontWeight: '900',
      marginBottom: 10,
      marginLeft: 2,
    },

    deviceCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 15,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: C.border,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

    deviceTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },

    deviceIcon: {
      width: 45,
      height: 45,
      borderRadius: 23,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
    },

    deviceInfo: {
      flex: 1,
    },

    deviceNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },

    deviceName: {
      color: C.text,
      fontSize: 15,
      fontWeight: '900',
      flexShrink: 1,
    },

    currentBadge: {
      backgroundColor: C.actionCard,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },

    currentBadgeText: {
      color: C.primary,
      fontSize: 10,
      fontWeight: '900',
    },

    deviceSub: {
      color: C.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 4,
    },

    removeButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: C.alertDangerBg,
      alignItems: 'center',
      justifyContent: 'center',
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 13,
    },

    metaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

    metaText: {
      color: C.textSecondary,
      fontSize: 11,
      fontWeight: '700',
    },

    emptyCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 24,
      alignItems: 'center',
      marginBottom: 12,
      borderWidth: 1,
      borderColor: C.border,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

    emptyTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: '900',
      marginTop: 10,
    },

    emptyText: {
      color: C.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
      lineHeight: 18,
      marginTop: 8,
    },
  });
