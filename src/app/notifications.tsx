import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, AppNotification } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { setGuardianAppBadgeCount } from '../services/pushNotifications';
import { useScreenAlert } from '../hooks/useScreenAlert';
import { humanizeVaultPresentationText } from '../utils/vaultPresentation';
import FloatingActionBar from '../components/FloatingActionBar';
import FloatingHeaderActions from '../components/FloatingHeaderActions';
import { hapticSelection } from '../utils/haptics';

const HOME_NEEDS_SYNC_KEY = 'homeNeedsInitialSync';

const updateAppBadge = async (count: number) => {
  await setGuardianAppBadgeCount(Math.max(0, count));
};

const formatNotificationDate = (value?: string | null) => {
  if (!value) return 'Just now';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
};

const getNotificationVisual = (type?: string, C?: any) => {
  const value = String(type || '').toUpperCase();

  if (
    value.includes('BREACHED')
    || value.includes('SECURITY')
    || value.includes('RESET')
    || value.includes('TWO_FACTOR_DISABLED')
  ) {
    return { icon: 'warning-outline', iconColor: C.danger, iconBg: C.alertDangerBg };
  }

  if (value.includes('TWO_FACTOR_ENABLED')) {
    return { icon: 'keypad-outline', iconColor: C.success, iconBg: C.actionCard };
  }

  if (value.includes('DURESS_ALERT')) {
    return { icon: 'shield-half-outline', iconColor: C.danger, iconBg: C.alertDangerBg };
  }

  if (value.includes('INCIDENT_LOCKDOWN') || value.includes('INCIDENT_PASSWORD')) {
    return { icon: 'lock-closed-outline', iconColor: C.danger, iconBg: C.alertDangerBg };
  }

  if (value.includes('CONTINUITY_DRILL')) {
    return { icon: 'analytics-outline', iconColor: C.primary, iconBg: C.actionCard };
  }

  if (value.includes('ESTATE_PLAYBOOK')) {
    return { icon: 'book-outline', iconColor: C.primary, iconBg: C.actionCard };
  }

  if (value.includes('SAFETY_CHECK')) {
    return { icon: 'pulse-outline', iconColor: C.primary, iconBg: C.actionCard };
  }

  if (value.includes('EMERGENCY')) {
    return { icon: 'medkit-outline', iconColor: C.warning, iconBg: C.alertWarningBg };
  }

  if (value.includes('RECOVERY_CIRCLE')) {
    return { icon: 'people-circle-outline', iconColor: C.primary, iconBg: C.actionCard };
  }

  if (value.includes('BACKUP') || value.includes('RECOVERY')) {
    return { icon: 'cloud-done-outline', iconColor: C.info || C.primary, iconBg: C.backgroundSelected };
  }

  if (value.includes('SUBSCRIPTION')) {
    return { icon: 'diamond-outline', iconColor: C.primary, iconBg: C.actionCard };
  }

  if (value.includes('DEVICE') || value.includes('SESSION')) {
    return { icon: 'phone-portrait-outline', iconColor: C.primary, iconBg: C.actionCard };
  }

  if (value.includes('PASSWORD') || value.includes('CARD') || value.includes('DOCUMENT') || value.includes('NOTE')) {
    return { icon: 'lock-closed-outline', iconColor: C.primary, iconBg: C.actionCard };
  }

  return { icon: 'notifications-outline', iconColor: C.primary, iconBg: C.actionCard };
};

const ALLOWED_NOTIFICATION_ROUTES = new Set([
  '/vault',
  '/subscription',
  '/family',
  '/emergencyaccess',
  '/safetycheck',
  '/securityhealth',
  '/backup',
  '/recoverykit',
  '/recoverycircle',
  '/estateplaybooks',
  '/continuitydrill',
  '/incidentlockdown',
  '/security',
  '/devices',
  '/twofasetup',
  '/notifications',
]);

const ALLOWED_VAULT_TABS = new Set(['Passwords', 'Documents', 'Cards', 'Notes']);

const normalizeActionRoute = (route?: string | null) => {
  const rawValue = String(route || '').trim();
  if (!rawValue) return '';

  const legacyNormalized = rawValue === '/twofactor' ? '/twofasetup' : rawValue;
  const [path, query = ''] = legacyNormalized.split('?');

  if (!ALLOWED_NOTIFICATION_ROUTES.has(path)) {
    return '';
  }

  if (!query) return path;

  const params = new URLSearchParams(query);
  const tab = params.get('tab');
  const hasUnexpectedParams = Array.from(params.keys()).some((key) => key !== 'tab');

  if (path === '/estateplaybooks') {
    return tab === 'received' && !hasUnexpectedParams
      ? '/estateplaybooks?tab=received'
      : '/estateplaybooks';
  }

  if (path === '/continuitydrill') {
    return tab === 'requests' && !hasUnexpectedParams
      ? '/continuitydrill?tab=requests'
      : '/continuitydrill';
  }

  if (path !== '/vault') return path;

  if (!tab || !ALLOWED_VAULT_TABS.has(tab) || hasUnexpectedParams) {
    return '/vault';
  }

  return `/vault?tab=${encodeURIComponent(tab)}`;
};

export default function NotificationsScreen() {
  const screenAlert = useScreenAlert();

  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState<number | string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedNotificationId, setSelectedNotificationId] = useState<number | string | null>(null);

  const selectedNotification = useMemo(
    () => notifications.find((item) => item.id === selectedNotificationId) || null,
    [notifications, selectedNotificationId]
  );

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );

  const syncHomeNotificationSnapshot = useCallback(
    async (
      updateUnreadCount: number | ((currentUnreadCount: number) => number),
    ) => {
      /*
       * Update Home's local unread badge immediately so returning to Home does
       * not briefly show the old count. The stale marker still forces a silent
       * server refresh, which remains the source of truth.
       */
      try {
        const email = await AsyncStorage.getItem('userEmail');
        const cacheKey = `theguardian.home.snapshot.v4:${(
          email || 'anonymous'
        )
          .trim()
          .toLowerCase()}`;
        const rawSnapshot = await AsyncStorage.getItem(cacheKey);

        if (rawSnapshot) {
          const snapshot = JSON.parse(rawSnapshot);
          const currentUnreadCount = Math.max(
            0,
            Number(snapshot?.unreadNotifications || 0),
          );
          const nextUnreadCount =
            typeof updateUnreadCount === 'function'
              ? updateUnreadCount(currentUnreadCount)
              : updateUnreadCount;

          await AsyncStorage.setItem(
            cacheKey,
            JSON.stringify({
              ...snapshot,
              unreadNotifications: Math.max(0, Number(nextUnreadCount || 0)),
            }),
          );
        }
      } catch {
        /*
         * A malformed or missing local Home snapshot must never block the
         * notification action. The forced server refresh below still repairs it.
         */
      } finally {
        await AsyncStorage.setItem(HOME_NEEDS_SYNC_KEY, 'true');
      }
    },
    [],
  );

  const loadNotifications = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      setLoadError(null);

      const data = await api.getNotifications();
      const items = Array.isArray(data) ? data : [];

      setNotifications(items);
      await updateAppBadge(items.filter((item) => !item.read).length);
    } catch (error: any) {
      setLoadError(
        error?.message ||
          'Guardian could not load your notifications. Check your connection and try again.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotifications(true);
    }, [loadNotifications])
  );

  const refresh = async () => {
    setRefreshing(true);
    await loadNotifications(false);
  };

  const markAsRead = async (notification: AppNotification) => {
    if (notification.read) return notification;

    try {
      setWorkingId(notification.id);
      const updated = await api.markNotificationRead(notification.id);
      setNotifications((items) =>
        items.map((item) =>
          item.id === notification.id
            ? { ...item, ...updated, read: true }
            : item
        )
      );
      const nextUnreadCount = Math.max(0, unreadCount - 1);
      await Promise.all([
        syncHomeNotificationSnapshot((currentUnreadCount) =>
          Math.max(0, currentUnreadCount - 1),
        ),
        updateAppBadge(nextUnreadCount),
      ]);
      return { ...notification, ...updated, read: true };
    } catch (error) {
      return notification;
    } finally {
      setWorkingId(null);
    }
  };

  const openNotification = async (notification: AppNotification) => {
    const updated = await markAsRead(notification);
    const actionRoute = normalizeActionRoute(updated.actionRoute);

    if (actionRoute) {
      router.push(actionRoute as any);
    }
  };

  const markAllAsRead = async () => {
    if (markingAll || unreadCount === 0) return;

    try {
      setMarkingAll(true);
      await api.markAllNotificationsRead();
      setNotifications((items) =>
        items.map((item) => ({ ...item, read: true }))
      );
      await Promise.all([
        syncHomeNotificationSnapshot(0),
        updateAppBadge(0),
      ]);
    } catch (error: any) {
      screenAlert('Could not update notifications', error.message || 'Please try again.');
    } finally {
      setMarkingAll(false);
    }
  };

  const deleteAllNotifications = () => {
    if (deletingAll || notifications.length === 0) return;

    screenAlert(
      'Delete all notifications?',
      'This removes every notification currently in your notification center. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: async () => {
            const snapshot = [...notifications];

            try {
              setDeletingAll(true);
              setSelectedNotificationId(null);

              const results = await Promise.allSettled(
                snapshot.map((notification) =>
                  api.deleteNotification(notification.id)
                )
              );

              const successfulIds = new Set<number | string>();
              results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                  successfulIds.add(snapshot[index].id);
                }
              });

              const remaining = snapshot.filter(
                (notification) => !successfulIds.has(notification.id)
              );
              const remainingUnread = remaining.filter(
                (notification) => !notification.read
              ).length;

              setNotifications(remaining);

              await Promise.all([
                syncHomeNotificationSnapshot(remainingUnread),
                updateAppBadge(remainingUnread),
              ]);

              const failedCount = results.length - successfulIds.size;
              if (failedCount > 0) {
                screenAlert(
                  'Some notifications remain',
                  `${failedCount} notification${failedCount === 1 ? '' : 's'} could not be deleted. Pull down to refresh and try again.`
                );
              }
            } catch (error: any) {
              screenAlert(
                'Delete all failed',
                error?.message || 'Please try again.'
              );
            } finally {
              setDeletingAll(false);
            }
          },
        },
      ]
    );
  };

  const deleteNotification = (notification: AppNotification) => {
    screenAlert(
      'Delete notification?',
      'This removes the notification from your notification center.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setWorkingId(notification.id);
              await api.deleteNotification(notification.id);
              setNotifications((items) =>
                items.filter((item) => item.id !== notification.id)
              );
              await Promise.all([
                syncHomeNotificationSnapshot((currentUnreadCount) =>
                  notification.read
                    ? currentUnreadCount
                    : Math.max(0, currentUnreadCount - 1),
                ),
                updateAppBadge(
                  notification.read ? unreadCount : Math.max(0, unreadCount - 1),
                ),
              ]);
            } catch (error: any) {
              screenAlert('Delete failed', error.message || 'Please try again.');
            } finally {
              setWorkingId(null);
            }
          },
        },
      ]
    );
  };

  const renderSkeleton = () => (
    <View style={styles.content}>
      {[1, 2, 3, 4, 5].map((item) => (
        <View key={item} style={styles.skeletonCard}>
          <PulsingSkeleton styles={styles} style={styles.skeletonIcon} />
          <View style={{ flex: 1 }}>
            <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
            <PulsingSkeleton styles={styles} style={styles.skeletonMessage} />
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
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
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.subtitle}>
              {loadError
                ? 'Notifications are temporarily unavailable'
                : unreadCount > 0
                  ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
                  : 'You are all caught up'}
            </Text>
          </View>

        </View>

        {loading ? (
          renderSkeleton()
        ) : loadError ? (
          <View style={styles.errorCard} accessibilityRole="alert">
            <View style={styles.errorIcon}>
              <Ionicons name="cloud-offline-outline" size={31} color={C.warning} />
            </View>
            <Text style={styles.errorTitle}>Notifications could not load</Text>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              activeOpacity={0.84}
              onPress={() => void loadNotifications(true)}
              accessibilityRole="button"
              accessibilityLabel="Try loading notifications again"
            >
              <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
              <Text style={styles.retryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="notifications-off-outline" size={32} color={C.primary} />
            </View>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyText}>
              Security alerts, emergency access updates, backups, and vault activity will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.content}>
            {notifications.map((item) => {
              const visual = getNotificationVisual(item.type, C);
              const isWorking = workingId === item.id;
              const presentationTitle =
                humanizeVaultPresentationText(item.title) || 'Guardian notification';
              const presentationMessage = humanizeVaultPresentationText(item.message);


              const selected = selectedNotificationId === item.id;

              return (
                <Pressable
                  key={String(item.id)}
                  delayLongPress={500}
                  onLongPress={() => {
                    if (isWorking) return;
                    hapticSelection();
                    setSelectedNotificationId(item.id);
                  }}
                  onPress={() => {
                    if (isWorking) return;

                    if (selectedNotificationId !== null) {
                      setSelectedNotificationId(selected ? null : item.id);
                      return;
                    }

                    void openNotification(item);
                  }}
                  disabled={isWorking}
                  style={[
                    styles.notificationCard,
                    !item.read && styles.unreadCard,
                    selected && { borderColor: C.primary, borderWidth: 2 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.read ? '' : 'Unread notification. '}${presentationTitle}. ${presentationMessage}`}
                  accessibilityHint="Tap to open. Press and hold to select notification actions."
                  accessibilityState={{ disabled: isWorking, selected }}
                >
                  <View style={styles.notificationOpenArea}>
                    <View style={[styles.notificationIcon, { backgroundColor: visual.iconBg }]}>
                      <Ionicons name={visual.icon as any} size={21} color={visual.iconColor} />
                    </View>

                    <View style={styles.notificationContent}>
                      <View style={styles.notificationTitleRow}>
                        <Text style={styles.notificationTitle}>{presentationTitle}</Text>
                        {!item.read && <View style={styles.unreadDot} />}
                      </View>
                      <Text style={styles.notificationMessage}>{presentationMessage}</Text>
                      <Text style={styles.notificationDate}>{formatNotificationDate(item.createdAt)}</Text>
                    </View>

                    {selected ? (
                      <View style={styles.deleteButton}>
                        <Ionicons name="checkmark" size={18} color={C.primary} />
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <FloatingHeaderActions
        visible={!loading && !loadError}
        actions={[
          {
            key: 'mark-all-notifications',
            icon: 'checkmark-done-outline',
            tone: 'primary',
            accessibilityLabel:
              unreadCount === 0
                ? 'All notifications are already read'
                : 'Mark all notifications as read',
            loading: markingAll,
            disabled: unreadCount === 0 || deletingAll,
            onPress: () => {
              void markAllAsRead();
            },
          },
          {
            key: 'delete-all-notifications',
            icon: 'trash-outline',
            tone: 'danger',
            accessibilityLabel:
              notifications.length === 0
                ? 'No notifications to delete'
                : 'Delete all notifications',
            loading: deletingAll,
            disabled: notifications.length === 0 || markingAll,
            onPress: deleteAllNotifications,
          },
        ]}
      />

      <FloatingActionBar
        visible={Boolean(selectedNotification)}
        onDismiss={() => setSelectedNotificationId(null)}
        actions={
          selectedNotification
            ? [
                ...(normalizeActionRoute(selectedNotification.actionRoute)
                  ? [
                      {
                        key: 'open-notification',
                        label: 'Open',
                        icon: 'open-outline' as const,
                        tone: 'primary' as const,
                        loading: workingId === selectedNotification.id,
                        onPress: () => {
                          const selected = selectedNotification;
                          setSelectedNotificationId(null);
                          void openNotification(selected);
                        },
                      },
                    ]
                  : !selectedNotification.read
                    ? [
                        {
                          key: 'read-notification',
                          label: 'Mark read',
                          icon: 'checkmark-done-outline' as const,
                          tone: 'primary' as const,
                          loading: workingId === selectedNotification.id,
                          onPress: () => {
                            const selected = selectedNotification;
                            setSelectedNotificationId(null);
                            void markAsRead(selected);
                          },
                        },
                      ]
                    : []),
                {
                  key: 'delete-notification',
                  label: 'Delete',
                  icon: 'trash-outline',
                  tone: 'danger',
                  loading: workingId === selectedNotification.id,
                  onPress: () => {
                    const selected = selectedNotification;
                    setSelectedNotificationId(null);
                    deleteNotification(selected);
                  },
                },
              ]
            : []
        }
      />
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    scrollContent: { paddingTop: 88, paddingBottom: 24 },
    header: { paddingHorizontal: 20, marginBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
    eyebrow: { color: C.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
    title: { color: C.text, fontSize: 31, fontWeight: '900', marginTop: 4 },
    subtitle: { color: C.textSecondary, fontSize: 14, marginTop: 4, lineHeight: 20 },
    disabledButton: { opacity: 0.55 },
    content: { paddingHorizontal: 20, gap: 12 },
    notificationCard: { backgroundColor: C.backgroundElement, borderRadius: 22, padding: 10, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 8
      ,shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},
    notificationOpenArea: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 4 },
    unreadCard: { borderColor: C.primary, backgroundColor: C.actionCard
      ,shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},
    notificationIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },
 width: 42, height: 42, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    notificationContent: { flex: 1, minWidth: 0 },
    notificationTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    notificationTitle: { color: C.text, fontSize: 15, fontWeight: '900', flex: 1, flexShrink: 1, lineHeight: 21 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },
    notificationMessage: { color: C.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4, flexShrink: 1 },
    notificationDate: { color: C.tabInactive, fontSize: 11, fontWeight: '800', marginTop: 8 },
    deleteButton: { width: 36, height: 36, borderRadius: 20, backgroundColor: C.backgroundSelected, alignItems: 'center', justifyContent: 'center'
      ,shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 11 },
      elevation: 10,},
    errorCard: {
      marginHorizontal: 20,
      backgroundColor: C.backgroundElement,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: C.border,
      padding: 24,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    errorIcon: {
      width: 68,
      height: 68,
      borderRadius: 26,
      backgroundColor: C.alertWarningBg || C.backgroundSelected,
      borderWidth: 1,
      borderColor: `${C.warning}35`,
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
      fontSize: 19,
      fontWeight: '900',
      textAlign: 'center',
    },
    errorText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: 8,
    },
    retryButton: {
      minHeight: 48,
      marginTop: 18,
      paddingHorizontal: 18,
      borderRadius: 999,
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
    retryButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '900',
    },
    emptyCard: { marginHorizontal: 20, backgroundColor: C.backgroundElement, borderRadius: 26, borderWidth: 1, borderColor: C.border, padding: 24, alignItems: 'center'
      ,shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},
    emptyIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },
 width: 68, height: 68, borderRadius: 26, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    emptyTitle: { color: C.text, fontSize: 19, fontWeight: '900' },
    emptyText: { color: C.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    skeletonBlock: { backgroundColor: C.backgroundSelected, borderRadius: 999
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    skeletonCard: { backgroundColor: C.backgroundElement, borderRadius: 22, padding: 14, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 12
      ,shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},
    skeletonIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },
 width: 42, height: 42, borderRadius: 18 },
    skeletonTitle: { width: '50%', height: 14, marginBottom: 10 },
    skeletonMessage: { width: '88%', height: 12 },
  });