import React, { useCallback, useMemo, useState } from 'react';
import {
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
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { api, EmergencyVaultItemResponse } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';

const getTitle = (item: EmergencyVaultItemResponse) =>
  item.title || item.documentName || item.fileName || 'Emergency vault item';

const getFileExtension = (fileName?: string | null) => {
  const cleanName = String(fileName || '').split('?')[0].split('#')[0];
  const parts = cleanName.split('.');
  return parts.length > 1 ? String(parts.pop() || '').toLowerCase() : '';
};

const getFriendlyDocumentType = (mimeType?: string | null, fileName?: string | null) => {
  const mime = String(mimeType || '').trim().toLowerCase();
  const extension = getFileExtension(fileName);
  if (mime.startsWith('image/')) return 'Image';
  if (mime.startsWith('video/')) return 'Video';
  if (mime.startsWith('audio/')) return 'Audio';
  if (mime === 'application/pdf' || extension === 'pdf') return 'PDF';
  if (mime.includes('wordprocessingml') || mime === 'application/msword' || ['doc', 'docx'].includes(extension)) return extension === 'doc' ? 'DOC' : 'DOCX';
  if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel' || ['xls', 'xlsx'].includes(extension)) return extension === 'xls' ? 'XLS' : 'XLSX';
  if (mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint' || ['ppt', 'pptx'].includes(extension)) return extension === 'ppt' ? 'PPT' : 'PPTX';
  if (mime.includes('zip') || extension === 'zip') return 'ZIP';
  if (mime.includes('csv') || extension === 'csv') return 'CSV';
  if (mime.startsWith('text/') || extension === 'txt') return 'TXT';
  return extension ? extension.toUpperCase() : 'Document';
};

const getSubtitle = (item: EmergencyVaultItemResponse) => {
  if (item.itemType === 'PASSWORD') return item.usernameValue || item.website || 'Password login';
  if (item.itemType === 'CARD') return item.usernameValue || 'Saved payment card';
  if (item.itemType === 'DOCUMENT') return getFriendlyDocumentType(item.documentType || item.mimeType, item.documentName || item.fileName || item.title);
  if (item.itemType === 'NOTE') return item.category || 'SecureNote';
  return 'Emergency vault item';
};

const getIcon = (itemType: string) => {
  if (itemType === 'PASSWORD') return 'key-outline';
  if (itemType === 'CARD') return 'card-outline';
  if (itemType === 'DOCUMENT') return 'document-text-outline';
  if (itemType === 'NOTE') return 'reader-outline';
  return 'lock-closed-outline';
};

export default function EmergencyVaultScreen() {
  const requestApi = useCancelableApi(api);
  const { requestId, ownerName, ownerEmail } = useLocalSearchParams<{
    requestId: string;
    ownerName?: string;
    ownerEmail?: string;
  }>();

  const { colors: C, isDark } = useAppTheme();
  const styles = makeStyles(C);

  const [passwords, setPasswords] = useState<EmergencyVaultItemResponse[]>([]);
  const [cards, setCards] = useState<EmergencyVaultItemResponse[]>([]);
  const [documents, setDocuments] = useState<EmergencyVaultItemResponse[]>([]);
  const [notes, setNotes] = useState<EmergencyVaultItemResponse[]>([]);
  const [vaultOwnerName, setVaultOwnerName] = useState(ownerName || 'Vault owner');
  const [vaultOwnerEmail, setVaultOwnerEmail] = useState(ownerEmail || '');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadVault = useCallback(async (showLoader = false) => {
    if (!requestId) return;

    try {
      if (showLoader) setLoading(true);
      const data = await requestApi.getEmergencyVaultItems(requestId);
      setPasswords(data.passwords || []);
      setCards(data.cards || []);
      setDocuments(data.documents || []);
      setNotes(data.notes || []);
      setVaultOwnerName(data.ownerName || ownerName || 'Vault owner');
      setVaultOwnerEmail(data.ownerEmail || ownerEmail || '');
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      Alert.alert('Could not open emergency vault', error.message || 'Please try again.');
      router.back();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestId, ownerName, ownerEmail]);

  useFocusEffect(
    useCallback(() => {
      loadVault(true);
    }, [loadVault])
  );

  const totalItems = useMemo(
    () => passwords.length + cards.length + documents.length + notes.length,
    [passwords.length, cards.length, documents.length, notes.length]
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadVault(false);
  };

  const openItem = (item: EmergencyVaultItemResponse) => {
    router.push({
      pathname: '/emergencyvaultdetails',
      params: {
        requestId: String(requestId),
        itemId: String(item.id),
        itemType: String(item.itemType),
        ownerName: vaultOwnerName,
        ownerEmail: vaultOwnerEmail,
      },
    });
  };

  const renderSkeleton = () => (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <PulsingSkeleton styles={styles} style={styles.skeletonEyebrow} />
      <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
      <PulsingSkeleton styles={styles} style={styles.skeletonSubtitle} />
      <View style={styles.heroCard}>
        <PulsingSkeleton styles={styles} style={styles.skeletonHeroIcon} />
        <View style={{ flex: 1 }}>
          <PulsingSkeleton styles={styles} style={styles.skeletonHeroTitle} />
          <PulsingSkeleton styles={styles} style={styles.skeletonHeroSub} />
        </View>
      </View>
      {[1, 2, 3].map((section) => (
        <View key={`emergency-vault-skeleton-${section}`}>
          <PulsingSkeleton styles={styles} style={styles.skeletonSectionHeader} />
          <View style={styles.listCard}>
            {[1, 2].map((row, index) => (
              <View key={`emergency-vault-row-${section}-${row}`} style={[styles.itemRow, index !== 1 && styles.divider]}>
                <PulsingSkeleton styles={styles} style={styles.skeletonIcon} />
                <View style={{ flex: 1 }}>
                  <PulsingSkeleton styles={styles} style={styles.skeletonRowTitle} />
                  <PulsingSkeleton styles={styles} style={styles.skeletonRowSub} />
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />
        {renderSkeleton()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
      >
        <Text style={styles.eyebrow}></Text>
        <Text style={styles.title}>Emergency vault</Text>
        <Text style={styles.subtitle}>
          You can view only the item types the vault owner released to you. Every view is recorded in the audit log.
        </Text>

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="shield-checkmark-outline" size={28} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>{vaultOwnerName}</Text>
            <Text style={styles.heroSub}>{vaultOwnerEmail || 'Emergency vault owner'}</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{totalItems}</Text>
          </View>
        </View>

        <Section title="Passwords" count={passwords.length} items={passwords} C={C} styles={styles} onOpen={openItem} />
        <Section title="Cards" count={cards.length} items={cards} C={C} styles={styles} onOpen={openItem} />
        <Section title="Documents" count={documents.length} items={documents} C={C} styles={styles} onOpen={openItem} />
        <Section title="SecureNotes" count={notes.length} items={notes} C={C} styles={styles} onOpen={openItem} />

        {totalItems === 0 && (
          <View style={styles.emptyBox}>
            <Ionicons name="lock-closed-outline" size={28} color={C.primary} />
            <Text style={styles.emptyTitle}>No released items</Text>
            <Text style={styles.emptySub}>The owner has not allowed any vault items for this emergency request.</Text>
          </View>
        )}

        <View style={{ height: 90 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, count, items, C, styles, onOpen }: any) {
  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{count}</Text>
      </View>
      <View style={styles.listCard}>
        {items.length === 0 ? (
          <View style={styles.emptyRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="remove-circle-outline" size={17} color={C.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>No {title.toLowerCase()}</Text>
              <Text style={styles.itemSub}>This category was not released or has no items.</Text>
            </View>
          </View>
        ) : items.map((item: EmergencyVaultItemResponse, index: number) => (
          <TouchableOpacity
            key={`${item.itemType}-${item.id}`}
            style={[styles.itemRow, index !== items.length - 1 && styles.divider]}
            activeOpacity={0.78}
            onPress={() => onOpen(item)}
          >
            <View style={styles.iconCircle}>
              <Ionicons name={getIcon(String(item.itemType)) as any} size={18} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle} numberOfLines={1}>{getTitle(item)}</Text>
              <Text style={styles.itemSub} numberOfLines={1}>{getSubtitle(item)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  skeletonBlock: { backgroundColor: C.backgroundSelected, borderRadius: 999 },
  skeletonEyebrow: { width: 118, height: 12, marginBottom: 8 },
  skeletonTitle: { width: 230, height: 30, marginBottom: 10 },
  skeletonSubtitle: { width: '90%', height: 13, marginBottom: 18 },
  skeletonHeroIcon: { width: 56, height: 56, borderRadius: 18 },
  skeletonHeroTitle: { width: '70%', height: 17, marginBottom: 9 },
  skeletonHeroSub: { width: '50%', height: 12 },
  skeletonSectionHeader: { width: 160, height: 18, marginTop: 12, marginBottom: 10 },
  skeletonIcon: { width: 42, height: 42, borderRadius: 16 },
  skeletonRowTitle: { width: '64%', height: 14, marginBottom: 8 },
  skeletonRowSub: { width: '80%', height: 11 },
  safeArea: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 18, paddingTop: 96, paddingBottom: 130 },
  eyebrow: { color: C.textSecondary, fontSize: 13, fontWeight: '800' },
  title: { color: C.text, fontSize: 30, fontWeight: '900', marginTop: 2 },
  subtitle: { color: C.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  heroCard: { backgroundColor: C.backgroundElement, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  heroIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: C.text, fontSize: 17, fontWeight: '900' },
  heroSub: { color: C.textSecondary, fontSize: 13, marginTop: 4 },
  countPill: { minWidth: 36, height: 36, borderRadius: 18, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  countPillText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 10 },
  sectionTitle: { color: C.text, fontSize: 18, fontWeight: '900' },
  sectionCount: { color: C.textSecondary, fontSize: 13, fontWeight: '800' },
  listCard: { backgroundColor: C.backgroundElement, borderRadius: 20, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 16 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.border },
  iconCircle: { width: 42, height: 42, borderRadius: 16, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { color: C.text, fontSize: 15, fontWeight: '900' },
  itemSub: { color: C.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  emptyBox: { backgroundColor: C.backgroundElement, borderRadius: 22, borderWidth: 1, borderColor: C.border, padding: 22, alignItems: 'center', gap: 8 },
  emptyTitle: { color: C.text, fontSize: 16, fontWeight: '900' },
  emptySub: { color: C.textSecondary, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
