import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Alert,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArchiveRestore,
  CheckCircle2,
  CloudUpload,
  Crown,
  DatabaseBackup,
  FileKey2,
  HardDriveDownload,
  History,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';

import {
  api,
  BackupResponse,
  BackupRestoreResponse,
  BackupStatusResponse,
} from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import { useAppTheme } from '../context/ThemeContext';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';

type Plan = 'FREE' | 'PREMIUM' | 'FAMILY';

type BackupHistoryItem = {
  id: string;
  fileName: string;
  path: string;
  createdAt: string;
  backupSizeBytes: number;
  checksum?: string;
  passwordCount: number;
  cardCount: number;
  documentCount: number;
  familyMemberCount: number;
  totalItemCount: number;
};

const BACKUP_HISTORY_KEY = 'theguardian.backup.history.v1';
const MAX_HISTORY_ITEMS = 10;
const MAX_BACKUP_IMPORT_BYTES = 25 * 1024 * 1024;
const BACKUP_FILE_EXTENSION = '.tgvault';

const formatBytes = (bytes?: number) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (date?: string | null) => {
  if (!date) return 'Not set';

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return 'Not set';
  }

  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};


const isLikelyGuardianBackupPayload = (value?: string | null) => {
  const clean = String(value || '').trim();
  if (clean.length < 32 || clean.length > MAX_BACKUP_IMPORT_BYTES * 2) {
    return false;
  }

  return /^[A-Za-z0-9+/=\r\n]+$/.test(clean);
};

const validateBackupFileMetadata = async (input: {
  uri: string;
  name?: string | null;
  size?: number | null;
}) => {
  const fileName = String(input.name || '').trim();

  if (!fileName.toLowerCase().endsWith(BACKUP_FILE_EXTENSION)) {
    throw new Error('Choose a The Guardian .tgvault backup file.');
  }

  let size = Number(input.size || 0);

  if (!size) {
    const info = await FileSystem.getInfoAsync(input.uri).catch(() => null as any);
    size = Number(info?.exists ? info.size || 0 : 0);
  }

  if (size <= 0) {
    throw new Error('The selected backup file is empty or unavailable.');
  }

  if (size > MAX_BACKUP_IMPORT_BYTES) {
    throw new Error(`Backup files must be smaller than ${formatBytes(MAX_BACKUP_IMPORT_BYTES)}.`);
  }

  return size;
};

const toHistoryItem = (backup: BackupResponse, path: string): BackupHistoryItem => ({
  id: `${Date.now()}-${backup.fileName}`,
  fileName: backup.fileName,
  path,
  createdAt: backup.createdAt,
  backupSizeBytes: backup.backupSizeBytes,
  checksum: backup.checksum,
  passwordCount: backup.passwordCount || 0,
  cardCount: backup.cardCount || 0,
  documentCount: backup.documentCount || 0,
  familyMemberCount: backup.familyMemberCount || 0,
  totalItemCount: backup.totalItemCount || 0,
});


function AnimatedSkeleton({
  styles,
  style,
}: {
  styles: any;
  style?: any;
}) {
  const opacity = useRef(new Animated.Value(0.42)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 720,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.42,
          duration: 720,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.skeletonBlock, style, { opacity }]} />;
}

export default function BackupScreen() {
  const requestApi = useCancelableApi(api);
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  useSensitiveScreenProtection(true);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [importing, setImporting] = useState(false);

  const [plan, setPlan] = useState<Plan>('FREE');
  const [allowed, setAllowed] = useState(false);
  const [status, setStatus] = useState<BackupStatusResponse | null>(null);
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [lastRestore, setLastRestore] = useState<BackupRestoreResponse | null>(null);

  const currentPlanLabel = useMemo(() => {
    return plan.charAt(0) + plan.slice(1).toLowerCase();
  }, [plan]);

  const loadHistory = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(BACKUP_HISTORY_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      setHistory(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
    if (isScreenRequestCancelled(error)) return;
      setHistory([]);
    }
  }, []);

  const saveHistory = useCallback(async (items: BackupHistoryItem[]) => {
    const limited = items.slice(0, MAX_HISTORY_ITEMS);
    setHistory(limited);
    await AsyncStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(limited));
  }, []);

  const addBackupToHistory = useCallback(
    async (backup: BackupResponse, path: string) => {
      const item = toHistoryItem(backup, path);
      const next = [item, ...history].slice(0, MAX_HISTORY_ITEMS);
      await saveHistory(next);
    },
    [history, saveHistory]
  );

  const loadStatus = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) {
        setLoading(true);
      }

      const backupStatus = await requestApi.getBackupStatus();

      setStatus(backupStatus);
      setAllowed(Boolean(backupStatus.allowed));
      setPlan((backupStatus.plan || 'FREE') as Plan);
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      console.log('BACKUP STATUS ERROR:', error);

      try {
        const subscription = await requestApi.getSubscription();
        const currentPlan = (subscription.plan || 'FREE') as Plan;

        setPlan(currentPlan);
        setAllowed(currentPlan === 'PREMIUM' || currentPlan === 'FAMILY');
        setStatus(null);
      } catch (error) {
    if (isScreenRequestCancelled(error)) return;
        setPlan('FREE');
        setAllowed(false);
        setStatus(null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
      loadStatus(true);
    }, [loadHistory, loadStatus])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadHistory(), loadStatus(false)]);
  };

  const createBackup = async () => {
    if (!allowed) {
      Alert.alert(
        'Premium feature',
        'Backup is only available on the Premium and Family plans.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/subscription?from=backup') },
        ]
      );
      return;
    }

    if (creating || restoring || importing) return;

    try {
      setCreating(true);

      const backup = await requestApi.createBackup();
      const directory = FileSystem.documentDirectory || '';
      const filePath = `${directory}${backup.fileName}`;

      await FileSystem.writeAsStringAsync(filePath, backup.encryptedBackup, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      await addBackupToHistory(backup, filePath);
      await loadStatus(false);

      Alert.alert(
        'Backup created',
        'Your encrypted backup has been created and saved on this device. It will stay in your backup history.'
      );
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      Alert.alert('Backup failed', error.message || 'Could not create backup.');
    } finally {
      setCreating(false);
    }
  };

  const shareBackupInfo = async (item: BackupHistoryItem) => {
    try {
      setSharingId(item.id);

      await Share.share({
        title: 'The Guardian backup created',
        message:
          `The Guardian backup created successfully.\n\n` +
          `File: ${item.fileName}\n` +
          `Saved path: ${item.path}\n` +
          `Created: ${formatDate(item.createdAt)}\n` +
          `Size: ${formatBytes(item.backupSizeBytes)}\n` +
          `Items: ${item.totalItemCount ?? 0}\n` +
          `Checksum: ${item.checksum || 'Not available'}\n\n` +
          `Keep this backup file somewhere safe.`,
      });
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      Alert.alert('Share failed', error.message || 'Could not share backup details.');
    } finally {
      setSharingId(null);
    }
  };

  const deleteHistoryItem = (item: BackupHistoryItem) => {
    Alert.alert(
      'Delete local backup?',
      'This removes the backup file and removes it from the history on this device. It does not delete your vault data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingId(item.id);

              await FileSystem.deleteAsync(item.path, { idempotent: true });

              const next = history.filter((backup) => backup.id !== item.id);
              await saveHistory(next);

              Alert.alert('Deleted', 'The local backup file has been deleted.');
            } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
              Alert.alert('Delete failed', error.message || 'Could not delete the backup file.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const readBackupFromHistory = async (item: BackupHistoryItem) => {
    const info = await FileSystem.getInfoAsync(item.path);

    if (!info.exists) {
      Alert.alert(
        'Backup file missing',
        'This backup is listed in history, but the file is no longer on this device. You can delete it from history.'
      );
      return null;
    }

    await validateBackupFileMetadata({
      uri: item.path,
      name: item.fileName,
      size: Number((info as any).size || item.backupSizeBytes || 0),
    });

    const payload = await FileSystem.readAsStringAsync(item.path, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (!isLikelyGuardianBackupPayload(payload)) {
      throw new Error('This file is not a valid encrypted The Guardian backup.');
    }

    return payload.trim();
  };

  const restoreFromHistory = async (item: BackupHistoryItem) => {
    try {
      const encryptedBackup = await readBackupFromHistory(item);
      if (!encryptedBackup) return;

      chooseRestoreMode(encryptedBackup, item.fileName);
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      Alert.alert('Restore failed', error.message || 'Could not read this backup file.');
    }
  };

  const importBackupFile = async () => {
    if (!allowed) {
      Alert.alert('Premium feature', 'Restore is only available on Premium and Family plans.');
      return;
    }

    if (importing || creating || restoring) return;

    try {
      setImporting(true);

      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/octet-stream', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];

      if (!asset?.uri) {
        Alert.alert('No file selected', 'Please select a valid The Guardian backup file.');
        return;
      }

      await validateBackupFileMetadata({
        uri: asset.uri,
        name: asset.name,
        size: asset.size,
      });

      const encryptedBackup = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (!isLikelyGuardianBackupPayload(encryptedBackup)) {
        Alert.alert(
          'Invalid backup file',
          'This file does not contain a valid encrypted The Guardian backup.'
        );
        return;
      }

      chooseRestoreMode(encryptedBackup.trim(), asset.name || 'Imported backup');
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      Alert.alert('Import failed', error.message || 'Could not import backup file.');
    } finally {
      setImporting(false);
    }
  };

  const chooseRestoreMode = (encryptedBackup: string, fileName: string) => {
    Alert.alert(
      'Restore backup?',
      `Choose how to restore ${fileName}. Merge is safer because it keeps your current vault data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge restore',
          onPress: () => restoreBackup(encryptedBackup, false),
        },
        {
          text: 'Replace vault',
          style: 'destructive',
          onPress: () => confirmReplaceRestore(encryptedBackup),
        },
      ]
    );
  };

  const confirmReplaceRestore = (encryptedBackup: string) => {
    Alert.alert(
      'Replace current vault?',
      'This will delete your current passwords, cards, and documents before restoring this backup. Family members are not deleted. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace and restore',
          style: 'destructive',
          onPress: () => restoreBackup(encryptedBackup, true),
        },
      ]
    );
  };

  const restoreBackup = async (encryptedBackup: string, replaceExisting: boolean) => {
    try {
      setRestoring(true);

      const response = await requestApi.restoreBackup({
        encryptedBackup,
        replaceExisting,
      });

      setLastRestore(response);
      await loadStatus(false);

      Alert.alert(
        'Restore complete',
        `${response.message}\n\nRestored ${response.totalRestoredCount} item(s).`
      );
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      Alert.alert('Restore failed', error.message || 'Could not restore backup.');
    } finally {
      setRestoring(false);
    }
  };

  const renderAccessLocked = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
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
      <View style={styles.lockedHeroIcon}>
        <Crown size={38} color={C.warning} />
      </View>

      <Text style={styles.title}>Encrypted Backup</Text>
      <Text style={styles.subtitle}>
        Backup and restore are Premium and Family features. Your current plan is {currentPlanLabel}.
      </Text>

      <View style={styles.infoCard}>
        <InfoRow
          icon={<CloudUpload size={21} color={C.primary} />}
          title="Create encrypted backups"
          text="Save encrypted copies of your passwords, cards, documents, and backup metadata."
          styles={styles}
        />
        <View style={styles.divider} />
        <InfoRow
          icon={<ArchiveRestore size={21} color={C.primary} />}
          title="Restore when needed"
          text="Import a The Guardian backup file and restore it into your vault."
          styles={styles}
        />
        <View style={styles.divider} />
        <InfoRow
          icon={<ShieldCheck size={21} color={C.primary} />}
          title="Protected by encryption"
          text="Backup files are encrypted before they are saved on your device."
          styles={styles}
        />
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        activeOpacity={0.86}
        onPress={() => router.push('/subscription?from=backup')}
      >
        <Text style={styles.primaryButtonText}>Upgrade plan</Text>
      </TouchableOpacity>
    </ScrollView>
  );


  const renderBackupSkeleton = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <AnimatedSkeleton styles={styles} style={styles.skeletonHeroIcon} />
      <AnimatedSkeleton styles={styles} style={styles.skeletonPageTitle} />
      <AnimatedSkeleton styles={styles} style={styles.skeletonSubtitle} />

      <View style={styles.statusCard}>
        <AnimatedSkeleton styles={styles} style={styles.skeletonStatusTitle} />
        <AnimatedSkeleton styles={styles} style={styles.skeletonStatusText} />
        <View style={styles.statsGrid}>
          {[1, 2, 3, 4].map((item) => (
            <View key={`backup-stat-skeleton-${item}`} style={styles.statBox}>
              <AnimatedSkeleton styles={styles} style={styles.skeletonStatValue} />
              <AnimatedSkeleton styles={styles} style={styles.skeletonStatLabel} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.actionRow}>
        <AnimatedSkeleton styles={styles} style={styles.skeletonButton} />
        <AnimatedSkeleton styles={styles} style={styles.skeletonButton} />
      </View>

      <View style={styles.historyCard}>
        {[1, 2, 3].map((item) => (
          <View key={`backup-history-skeleton-${item}`} style={styles.skeletonHistoryRow}>
            <AnimatedSkeleton styles={styles} style={styles.skeletonHistoryIcon} />
            <View style={{ flex: 1 }}>
              <AnimatedSkeleton styles={styles} style={styles.skeletonHistoryTitle} />
              <AnimatedSkeleton styles={styles} style={styles.skeletonHistorySub} />
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        {renderBackupSkeleton()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {!allowed ? (
        renderAccessLocked()
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
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
          <View style={styles.heroIcon}>
            <DatabaseBackup size={38} color="#fff" />
          </View>

          <Text style={styles.title}>Encrypted Backup</Text>
          <Text style={styles.subtitle}>
            Create, import and restore encrypted backups.
          </Text>

          <View style={styles.statusCard}>
            <View style={styles.statusHeaderRow}>
              <View style={styles.statusIconCircle}>
                <ShieldCheck size={22} color={C.primary} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>Backup access active</Text>
                <Text style={styles.statusSub}>{status?.message || 'Backup is available.'}</Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <StatBox label="Passwords" value={status?.passwordCount ?? 0} styles={styles} />
              <StatBox label="Cards" value={status?.cardCount ?? 0} styles={styles} />
              <StatBox label="Documents" value={status?.documentCount ?? 0} styles={styles} />
              <StatBox label="Family" value={status?.familyMemberCount ?? 0} styles={styles} />
            </View>

            <Text style={styles.expiryText}>
              Plan: {currentPlanLabel} · Expires {formatDate(status?.subscriptionExpiresAt)}
            </Text>
          </View>

          <View style={styles.actionCard}>
            <Text style={styles.sectionTitle}>Actions</Text>

            <TouchableOpacity
              style={[styles.primaryButton, (creating || restoring || importing) && styles.disabledButton]}
              activeOpacity={0.86}
              onPress={createBackup}
              disabled={creating || restoring || importing}
            >
              {creating ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.primaryButtonText}>Creating backup...</Text>
                </View>
              ) : (
                <View style={styles.buttonContent}>
                  <HardDriveDownload size={20} color="#fff" />
                  <Text style={styles.primaryButtonText}>Create backup</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, (importing || creating || restoring) && styles.disabledButton]}
              activeOpacity={0.82}
              onPress={importBackupFile}
              disabled={importing || creating || restoring}
            >
              {importing ? (
                <ActivityIndicator color={C.primary} />
              ) : (
                <UploadCloud size={20} color={C.primary} />
              )}
              <Text style={styles.secondaryButtonText}>
                {importing ? 'Opening files...' : 'Import backup file'}
              </Text>
            </TouchableOpacity>
          </View>

          {lastRestore && (
            <View style={styles.restoreResultCard}>
              <View style={styles.statusHeaderRow}>
                <View style={styles.successIconCircle}>
                  <CheckCircle2 size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusTitle}>Last restore complete</Text>
                  <Text style={styles.statusSub}>{formatDate(lastRestore.restoredAt)}</Text>
                </View>
              </View>

              <View style={styles.restoreStatsRow}>
                <MiniCount label="Passwords" value={lastRestore.restoredPasswordCount} styles={styles} />
                <MiniCount label="Cards" value={lastRestore.restoredCardCount} styles={styles} />
                <MiniCount label="Documents" value={lastRestore.restoredDocumentCount} styles={styles} />
              </View>

              <Text style={styles.restoreMessage}>{lastRestore.message}</Text>
            </View>
          )}

          <View style={styles.historyHeaderRow}>
            <View style={styles.historyTitleIcon}>
              <History size={19} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Backup history</Text>
              <Text style={styles.sectionSub}>Stored on this device</Text>
            </View>
          </View>

          {history.length === 0 ? (
            <View style={styles.emptyCard}>
              <FileKey2 size={34} color={C.textSecondary} />
              <Text style={styles.emptyTitle}>No backup history yet</Text>
              <Text style={styles.emptyText}>
                Create a backup and it will stay here even after you leave this page.
              </Text>
            </View>
          ) : (
            history.map((item) => (
              <View key={item.id} style={styles.historyCard}>
                <View style={styles.historyTopRow}>
                  <View style={styles.fileIconCircle}>
                    <FileKey2 size={20} color={C.primary} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.fileName} numberOfLines={1}>{item.fileName}</Text>
                    <Text style={styles.fileMeta}>{formatDate(item.createdAt)}</Text>
                  </View>
                </View>

                <View style={styles.metaGrid}>
                  <MetaLine label="Size" value={formatBytes(item.backupSizeBytes)} styles={styles} />
                  <MetaLine label="Items" value={String(item.totalItemCount)} styles={styles} />
                  <MetaLine label="Passwords" value={String(item.passwordCount)} styles={styles} />
                  <MetaLine label="Cards" value={String(item.cardCount)} styles={styles} />
                  <MetaLine label="Documents" value={String(item.documentCount)} styles={styles} />
                  <MetaLine label="Family" value={String(item.familyMemberCount)} styles={styles} />
                </View>

                <Text style={styles.pathText} numberOfLines={2}>{item.path}</Text>

                <View style={styles.historyActionsRow}>
                  <TouchableOpacity
                    style={[styles.smallActionButton, restoring && styles.disabledButton]}
                    activeOpacity={0.8}
                    onPress={() => restoreFromHistory(item)}
                    disabled={restoring || creating || importing}
                  >
                    {restoring ? (
                      <ActivityIndicator size="small" color={C.primary} />
                    ) : (
                      <ArchiveRestore size={16} color={C.primary} />
                    )}
                    <Text style={styles.smallActionText}>Restore</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.smallActionButton}
                    activeOpacity={0.8}
                    onPress={() => shareBackupInfo(item)}
                    disabled={sharingId === item.id}
                  >
                    {sharingId === item.id ? (
                      <ActivityIndicator size="small" color={C.primary} />
                    ) : (
                      <RefreshCw size={16} color={C.primary} />
                    )}
                    <Text style={styles.smallActionText}>Share info</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.smallDangerButton, deletingId === item.id && styles.disabledButton]}
                    activeOpacity={0.8}
                    onPress={() => deleteHistoryItem(item)}
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? (
                      <ActivityIndicator size="small" color={C.danger} />
                    ) : (
                      <Trash2 size={16} color={C.danger} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          <Text style={styles.footnote}>
            Restore currently restores passwords, cards, and documents. Family memberships are included in backup metadata but are not recreated during restore.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function InfoRow({
  icon,
  title,
  text,
  styles,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  styles: any;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoText}>{text}</Text>
      </View>
    </View>
  );
}

function StatBox({ label, value, styles }: { label: string; value: number; styles: any }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MiniCount({ label, value, styles }: { label: string; value: number; styles: any }) {
  return (
    <View style={styles.miniCountBox}>
      <Text style={styles.miniCountValue}>{value}</Text>
      <Text style={styles.miniCountLabel}>{label}</Text>
    </View>
  );
}

function MetaLine({ label, value, styles }: { label: string; value: string; styles: any }) {
  return (
    <View style={styles.metaLine}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },

    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },

    loadingText: {
      marginTop: 12,
      color: C.textSecondary,
      fontSize: 15,
    },


    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    skeletonHeroIcon: {
      width: 82,
      height: 82,
      borderRadius: 28,
      marginBottom: 20,
    },

    skeletonPageTitle: {
      width: '56%',
      height: 30,
      marginBottom: 12,
    },

    skeletonSubtitle: {
      width: '92%',
      height: 14,
      marginBottom: 22,
    },

    skeletonStatusTitle: {
      width: '45%',
      height: 18,
      marginBottom: 10,
    },

    skeletonStatusText: {
      width: '78%',
      height: 12,
      marginBottom: 16,
    },

    skeletonStatValue: {
      width: 34,
      height: 20,
      marginBottom: 8,
    },

    skeletonStatLabel: {
      width: 58,
      height: 11,
    },

    actionRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 18,
    },

    skeletonButton: {
      flex: 1,
      height: 52,
      borderRadius: 999,
    },

    skeletonHistoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 13,
    },

    skeletonHistoryIcon: {
      width: 42,
      height: 42,
      borderRadius: 18,
    },

    skeletonHistoryTitle: {
      width: '64%',
      height: 14,
      marginBottom: 8,
    },

    skeletonHistorySub: {
      width: '42%',
      height: 11,
    },

    scrollContent: {
      paddingHorizontal: 18,
      paddingTop: 118,
      paddingBottom: 140,
    },

    heroIcon: {
      width: 82,
      height: 82,
      borderRadius: 28,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },

    lockedHeroIcon: {
      width: 82,
      height: 82,
      borderRadius: 28,
      backgroundColor: C.securityScoreBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
      borderWidth: 1,
      borderColor: C.warning,
    },

    title: {
      fontSize: 34,
      fontWeight: '900',
      color: C.text,
      marginBottom: 8,
    },

    subtitle: {
      color: C.textSecondary,
      fontSize: 15,
      lineHeight: 23,
      marginBottom: 22,
    },

    infoCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: 24,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    infoRow: {
      flexDirection: 'row',
      padding: 16,
      alignItems: 'center',
    },

    infoIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },

    infoTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: '800',
      marginBottom: 3,
    },

    infoText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },

    divider: {
      height: 1,
      backgroundColor: C.border,
      marginLeft: 74,
    },

    statusCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      marginBottom: 18,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    statusHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
    },

    statusIconCircle: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },

    successIconCircle: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },

    statusTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: '900',
    },

    statusSub: {
      color: C.textSecondary,
      fontSize: 13,
      marginTop: 2,
      lineHeight: 18,
    },

    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 10,
    },

    statBox: {
      width: '47.8%',
      backgroundColor: C.backgroundSelected,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 12,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    statValue: {
      color: C.text,
      fontSize: 20,
      fontWeight: '900',
    },

    statLabel: {
      color: C.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },

    expiryText: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 18,
    },

    actionCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      marginBottom: 18,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    sectionTitle: {
      color: C.text,
      fontSize: 18,
      fontWeight: '900',
      marginBottom: 4,
    },

    sectionSub: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },

    primaryButton: {
      backgroundColor: C.backgroundbutton,
      borderRadius: 999,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 54,
      marginTop: 12,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    primaryButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '900',
    },

    secondaryButton: {
      marginTop: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.backgroundSelected,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    secondaryButtonText: {
      color: C.primary,
      fontSize: 15,
      fontWeight: '900',
    },

    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },

    disabledButton: {
      opacity: 0.62,
    },

    restoreResultCard: {
      backgroundColor: C.actionCard,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.primary,
      padding: 16,
      marginBottom: 18,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    restoreStatsRow: {
      flexDirection: 'row',
      gap: 9,
      marginBottom: 10,
    },

    miniCountBox: {
      flex: 1,
      backgroundColor: C.background,
      borderRadius: 14,
      paddingVertical: 10,
      alignItems: 'center',
    },

    miniCountValue: {
      color: C.text,
      fontSize: 17,
      fontWeight: '900',
    },

    miniCountLabel: {
      color: C.textSecondary,
      fontSize: 11,
      marginTop: 2,
    },

    restoreMessage: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },

    historyHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },

    historyTitleIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },

    emptyCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      padding: 22,
      alignItems: 'center',
      marginBottom: 18,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    emptyTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: '900',
      marginTop: 12,
    },

    emptyText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 5,
      textAlign: 'center',
    },

    historyCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      padding: 15,
      marginBottom: 14,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    historyTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },

    fileIconCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },

    fileName: {
      color: C.text,
      fontSize: 15,
      fontWeight: '900',
    },

    fileMeta: {
      color: C.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },

    metaGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 10,
    },

    metaLine: {
      width: '31.8%',
      backgroundColor: C.backgroundSelected,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 9,
    },

    metaLabel: {
      color: C.textSecondary,
      fontSize: 10,
      marginBottom: 2,
    },

    metaValue: {
      color: C.text,
      fontSize: 12,
      fontWeight: '800',
    },

    pathText: {
      color: C.textSecondary,
      fontSize: 11,
      lineHeight: 16,
      marginBottom: 12,
    },

    historyActionsRow: {
      flexDirection: 'row',
      gap: 8,
    },

    smallActionButton: {
      flex: 1,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.backgroundSelected,
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    smallActionText: {
      color: C.primary,
      fontSize: 12,
      fontWeight: '900',
    },

    smallDangerButton: {
      width: 46,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.danger,
      backgroundColor: C.alertDangerBg,
      alignItems: 'center',
      justifyContent: 'center',

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    footnote: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
      marginTop: 4,
    },
  });
