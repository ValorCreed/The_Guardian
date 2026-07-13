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
import {
  Bell,
  CheckCheck,
  CloudUpload,
  CreditCard,
  Crown,
  FileText,
  KeyRound,
  ShieldAlert,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react-native';

import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { api, AppNotification } from '../services/api';

const formatDate = (value?: string) => {
  if (!value) return 'Just now';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const getNotificationIcon = (type: string, C: any) => {
  const size = 20;

  if (type.includes('WELCOME')) return <Bell size={size} color={C.primary} />;
  if (type.includes('SUBSCRIPTION')) return <Crown size={size} color={C.warning} />;
  if (type.includes('BACKUP')) return <CloudUpload size={size} color={C.primary} />;
  if (type.includes('PASSWORD')) return <KeyRound size={size} color={C.info || C.primary} />;
  if (type.includes('CARD')) return <CreditCard size={size} color={C.primary} />;
  if (type.includes('DOCUMENT')) return <FileText size={size} color={C.primary} />;
  if (type.includes('NOTE')) return <FileText size={size} color={C.info || C.primary} />;
  if (type.includes('EMERGENCY')) return <ShieldAlert size={size} color={C.danger} />;
  if (type.includes('FAMILY')) return <Users size={size} color={C.primary} />;
  if (type.includes('SECURITY')) return <ShieldAlert size={size} color={C.danger} />;

  return <Bell size={size} color={C.primary} />;
};

export default function NotificationsScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );

  const loadNotifications = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);

      const response = await api.getNotifications();
      setNotifications(response || []);
    } catch (error) {
      console.log('NOTIFICATIONS LOAD ERROR:', error);
      Alert.alert('Could not load notifications', 'Please try again.');
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

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNotifications(false);
  };

  const openNotification = async (notification: AppNotification) => {
    try {
      if (!notification.read) {
        await api.markNotificationRead(notification.id);
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id ? { ...item, read: true } : item
          )
        );
      }

      if (notification.actionRoute) {
        router.push(notification.actionRoute as never);
      }
    } catch (error) {
      console.log('OPEN NOTIFICATION ERROR:', error);
    }
  };

  const markAllAsRead = async () => {
    if (unreadCount === 0 || markingAll) return;

    try {
      setMarkingAll(true);
      await api.markAllNotificationsRead();
      setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    } catch (error) {
      Alert.alert('Could not update notifications', 'Please try again.');
    } finally {
      setMarkingAll(false);
    }
  };

  const deleteNotification = (notification: AppNotification) => {
    Alert.alert(
      'Delete notification?',
      'This removes it from your notification list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingId(notification.id);
              await api.deleteNotification(notification.id);
              setNotifications((current) =>
                current.filter((item) => item.id !== notification.id)
              );
            } catch (error) {
              Alert.alert('Could not delete notification', 'Please try again.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };


  const renderNotificationSkeleton = () => (
    <View style={styles.listCard}>
      {[1, 2, 3, 4, 5].map((item, index) => (
        <View
          key={`notification-skeleton-${item}`}
          style={[
            styles.notificationRow,
            index !== 4 && styles.rowDivider,
          ]}
        >
          <PulsingSkeleton styles={styles} style={styles.iconCircle} />
          <View style={{ flex: 1 }}>
            <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
            <PulsingSkeleton styles={styles} style={styles.skeletonText} />
            <PulsingSkeleton styles={styles} style={styles.skeletonDate} />
          </View>
        </View>
      ))}
    </View>
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
            onRefresh={handleRefresh}
            tintColor={C.primary}
            colors={[C.primary]}
            progressBackgroundColor={C.backgroundElement}
          />
        }
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Vault updates</Text>
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.subtitle}>
              Subscription, backup, notes, emergency access, security, vault, and family alerts appear here.
            </Text>
          </View>

          <View style={styles.heroIcon}>
            <Bell size={26} color="#fff" />
            {unreadCount > 0 && <View style={styles.heroDot} />}
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View>
            <Text style={styles.summaryNumber}>{unreadCount}</Text>
            <Text style={styles.summaryLabel}>Unread notification(s)</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.75}
            style={[styles.markAllButton, unreadCount === 0 && styles.disabledButton]}
            disabled={unreadCount === 0 || markingAll}
            onPress={markAllAsRead}
          >
            {markingAll ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              <CheckCheck size={18} color={C.primary} />
            )}
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          renderNotificationSkeleton()
        ) : notifications.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Bell size={30} color={C.primary} />
            </View>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyText}>
              Important vault activity will appear here when it happens.
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {notifications.map((notification, index) => {
              const unread = !notification.read;
              const deleting = deletingId === notification.id;

              return (
                <TouchableOpacity
                  key={notification.id}
                  activeOpacity={0.72}
                  style={[
                    styles.notificationRow,
                    index !== notifications.length - 1 && styles.rowDivider,
                    unread && styles.unreadRow,
                  ]}
                  onPress={() => openNotification(notification)}
                >
                  <View style={styles.iconCircle}>
                    {getNotificationIcon(notification.type || '', C)}
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={styles.notificationTitle} numberOfLines={1}>
                        {notification.title}
                      </Text>
                      {unread && <View style={styles.unreadDot} />}
                    </View>

                    <Text style={styles.notificationMessage} numberOfLines={2}>
                      {notification.message}
                    </Text>

                    <Text style={styles.notificationTime}>
                      {formatDate(notification.createdAt)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.deleteButton}
                    onPress={() => deleteNotification(notification)}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <ActivityIndicator size="small" color={C.danger} />
                    ) : (
                      <Trash2 size={18} color={C.danger} />
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={styles.footerText}>
          Pull down to refresh. Device push notifications can be added later after this in-app notification center is stable.
        </Text>
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

    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 112,
      paddingBottom: 140,
    },

    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
      gap: 14,
    },

    eyebrow: {
      color: C.textSecondary,
      fontSize: 13,
      marginBottom: 2,
    },

    title: {
      color: C.text,
      fontSize: 32,
      fontWeight: '900',
      marginBottom: 6,
    },

    subtitle: {
      color: C.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },

    heroIcon: {
      width: 62,
      height: 62,
      borderRadius: 24,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },

    heroDot: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: C.danger,
      borderWidth: 2,
      borderColor: '#fff',
    },

    summaryCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      marginBottom: 18,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },

    summaryNumber: {
      color: C.text,
      fontSize: 28,
      fontWeight: '900',
    },

    summaryLabel: {
      color: C.textSecondary,
      fontSize: 13,
      marginTop: 2,
    },

    markAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },

    markAllText: {
      color: C.primary,
      fontWeight: '800',
      fontSize: 13,
    },

    disabledButton: {
      opacity: 0.55,
    },


    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
    },

    skeletonTitle: {
      width: '72%',
      height: 15,
      marginBottom: 9,
    },

    skeletonText: {
      width: '94%',
      height: 12,
      marginBottom: 9,
    },

    skeletonDate: {
      width: 84,
      height: 10,
    },

    loadingCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      padding: 24,
      alignItems: 'center',
      gap: 10,
    },

    emptyCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      padding: 24,
      alignItems: 'center',
    },

    emptyIcon: {
      width: 66,
      height: 66,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundSelected,
      marginBottom: 14,
    },

    emptyTitle: {
      color: C.text,
      fontSize: 18,
      fontWeight: '900',
      marginBottom: 6,
    },

    emptyText: {
      color: C.textSecondary,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 19,
    },

    listCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },

    notificationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      gap: 12,
    },

    unreadRow: {
      backgroundColor: C.backgroundSelected,
    },

    rowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },

    iconCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.background,
    },

    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },

    notificationTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: '900',
      flex: 1,
    },

    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: C.primary,
    },

    notificationMessage: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 3,
    },

    notificationTime: {
      color: C.tabInactive || C.textSecondary,
      fontSize: 11,
      marginTop: 5,
      fontWeight: '700',
    },

    deleteButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.alertDangerBg,
      alignItems: 'center',
      justifyContent: 'center',
    },

    footerText: {
      color: C.textSecondary,
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 18,
      marginTop: 18,
      paddingHorizontal: 12,
    },
  });
