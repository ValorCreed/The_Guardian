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
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, AppNotification } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';

const HOME_NEEDS_SYNC_KEY = 'homeNeedsInitialSync';

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

  if (value.includes('BREACHED') || value.includes('SECURITY') || value.includes('RESET')) {
    return { icon: 'warning-outline', iconColor: C.danger, iconBg: C.alertDangerBg };
  }

  if (value.includes('EMERGENCY')) {
    return { icon: 'medkit-outline', iconColor: C.warning, iconBg: C.alertWarningBg };
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
  '/securityhealth',
  '/backup',
  '/recoverykit',
  '/security',
  '/devices',
  '/twofasetup',
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

  if (path !== '/vault' || !query) {
    return path;
  }

  const params = new URLSearchParams(query);
  const tab = params.get('tab');

  if (!tab || !ALLOWED_VAULT_TABS.has(tab) || Array.from(params.keys()).some((key) => key !== 'tab')) {
    return '/vault';
  }

  return `/vault?tab=${encodeURIComponent(tab)}`;
};

export default function NotificationsScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState<number | string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

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
      const data = await api.getNotifications();
      setNotifications(Array.isArray(data) ? data : []);
    } catch (error: any) {
      Alert.alert('Could not load notifications', error.message || 'Please try again.');
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
      await syncHomeNotificationSnapshot((currentUnreadCount) =>
        Math.max(0, currentUnreadCount - 1),
      );
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
      await syncHomeNotificationSnapshot(0);
    } catch (error: any) {
      Alert.alert('Could not update notifications', error.message || 'Please try again.');
    } finally {
      setMarkingAll(false);
    }
  };

  const deleteNotification = (notification: AppNotification) => {
    Alert.alert(
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
              await syncHomeNotificationSnapshot((currentUnreadCount) =>
                notification.read
                  ? currentUnreadCount
                  : Math.max(0, currentUnreadCount - 1),
              );
            } catch (error: any) {
              Alert.alert('Delete failed', error.message || 'Please try again.');
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
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
                : 'You are all caught up'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.markAllButton, (unreadCount === 0 || markingAll) && styles.disabledButton]}
            activeOpacity={0.82}
            onPress={markAllAsRead}
            disabled={unreadCount === 0 || markingAll}
          >
            {markingAll ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              <Ionicons name="checkmark-done-outline" size={17} color={C.primary} />
            )}
            <Text style={styles.markAllText}>Mark all</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          renderSkeleton()
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

              const actionRoute = normalizeActionRoute(item.actionRoute);

              return (
                <View
                  key={String(item.id)}
                  style={[styles.notificationCard, !item.read && styles.unreadCard]}
                  accessibilityRole="summary"
                  accessibilityLabel={`${item.read ? '' : 'Unread notification. '}${item.title}. ${item.message}`}
                >
                  <TouchableOpacity
                    style={styles.notificationOpenArea}
                    activeOpacity={0.82}
                    onPress={() => openNotification(item)}
                    disabled={isWorking}
                    accessibilityRole="button"
                    accessibilityHint={
                      actionRoute
                        ? 'Marks this notification as read and opens the related screen.'
                        : 'Marks this notification as read.'
                    }
                  >
                    <View style={[styles.notificationIcon, { backgroundColor: visual.iconBg }]}>
                      <Ionicons name={visual.icon as any} size={21} color={visual.iconColor} />
                    </View>

                    <View style={styles.notificationContent}>
                      <View style={styles.notificationTitleRow}>
                        <Text style={styles.notificationTitle}>{item.title}</Text>
                        {!item.read && <View style={styles.unreadDot} />}
                      </View>
                      <Text style={styles.notificationMessage}>{item.message}</Text>
                      <Text style={styles.notificationDate}>{formatNotificationDate(item.createdAt)}</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.deleteButton}
                    activeOpacity={0.75}
                    onPress={() => deleteNotification(item)}
                    disabled={isWorking}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete notification: ${item.title}`}
                    accessibilityState={{ disabled: isWorking }}
                  >
                    {isWorking ? (
                      <ActivityIndicator size="small" color={C.textSecondary} />
                    ) : (
                      <Ionicons name="trash-outline" size={18} color={C.textSecondary} />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
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
    markAllButton: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, backgroundColor: C.actionCard, borderWidth: 1, borderColor: C.border
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    markAllText: { color: C.primary, fontSize: 12, fontWeight: '900' },
    disabledButton: { opacity: 0.55 },
    content: { paddingHorizontal: 20, gap: 12 },
    notificationCard: { backgroundColor: C.backgroundElement, borderRadius: 20, padding: 10, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 8
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    notificationOpenArea: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 4 },
    unreadCard: { borderColor: C.primary, backgroundColor: C.actionCard
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    notificationIcon: { width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    notificationContent: { flex: 1, minWidth: 0 },
    notificationTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    notificationTitle: { color: C.text, fontSize: 15, fontWeight: '900', flex: 1, flexShrink: 1, lineHeight: 21 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },
    notificationMessage: { color: C.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4, flexShrink: 1 },
    notificationDate: { color: C.tabInactive, fontSize: 11, fontWeight: '800', marginTop: 8 },
    deleteButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.backgroundSelected, alignItems: 'center', justifyContent: 'center'
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    emptyCard: { marginHorizontal: 20, backgroundColor: C.backgroundElement, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 24, alignItems: 'center'
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    emptyIcon: { width: 68, height: 68, borderRadius: 24, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    emptyTitle: { color: C.text, fontSize: 19, fontWeight: '900' },
    emptyText: { color: C.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    skeletonBlock: { backgroundColor: C.backgroundSelected, borderRadius: 999
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    skeletonCard: { backgroundColor: C.backgroundElement, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 12
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    skeletonIcon: { width: 42, height: 42, borderRadius: 16 },
    skeletonTitle: { width: '50%', height: 14, marginBottom: 10 },
    skeletonMessage: { width: '88%', height: 12 },
  });