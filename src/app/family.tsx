import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import {
  ChevronRight,
  CreditCard,
  Crown,
  FileText,
  KeyRound,
  NotebookText,
  Plus,
  Trash2,
  Users,
} from 'lucide-react-native';

import {
  api,
  FamilyOverview,
  SharedCardItem,
  SharedDocumentItem,
  SharedFamilyItems,
  SharedNoteItem,
  SharedPasswordItem,
} from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { hapticDelete, hapticLight, hapticSuccess, hapticWarning } from '../utils/haptics';


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
  if (mime.includes('wordprocessingml') || mime === 'application/msword' || ['doc', 'docx'].includes(extension)) {
    return extension === 'doc' ? 'DOC' : 'DOCX';
  }
  if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel' || ['xls', 'xlsx'].includes(extension)) {
    return extension === 'xls' ? 'XLS' : 'XLSX';
  }
  if (mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint' || ['ppt', 'pptx'].includes(extension)) {
    return extension === 'ppt' ? 'PPT' : 'PPTX';
  }
  if (mime.includes('zip') || extension === 'zip') return 'ZIP';
  if (mime.includes('csv') || extension === 'csv') return 'CSV';
  if (mime.startsWith('text/') || extension === 'txt') return 'TXT';
  return extension ? extension.toUpperCase() : 'Document';
};

const EMPTY_FAMILY_OVERVIEW: FamilyOverview = {
  familyPlan: false,
  admin: false,
  groupId: null,
  memberLimit: 6,
  memberCount: 0,
  members: [],
  sharedVaultOwners: [],
};

export default function FamilyScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [overview, setOverview] = useState<FamilyOverview | null>(null);
  const [sharedItems, setSharedItems] = useState<SharedFamilyItems>({
    passwords: [],
    cards: [],
    documents: [],
    notes: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [familyNotice, setFamilyNotice] = useState('');
  const [sharedItemsNotice, setSharedItemsNotice] = useState('');
  const [deletingMemberId, setDeletingMemberId] = useState<number | null>(null);

  const loadFamily = useCallback(async (options?: { manual?: boolean }) => {
    const manual = Boolean(options?.manual);

    const [familyResult, sharedItemsResult] = await Promise.allSettled([
      api.getFamilyOverview(),
      api.getSharedFamilyItems(),
    ]);

    if (familyResult.status === 'fulfilled') {
      setOverview(familyResult.value || EMPTY_FAMILY_OVERVIEW);
      setFamilyNotice('');
    } else {
      console.log('Family overview load failed', familyResult.reason);
      setOverview((current) => current || EMPTY_FAMILY_OVERVIEW);
      setFamilyNotice(
        familyResult.reason?.message ||
          'We could not refresh your family plan details right now.'
      );
    }

    if (sharedItemsResult.status === 'fulfilled') {
      const items = sharedItemsResult.value || { passwords: [], cards: [], documents: [], notes: [] };
      setSharedItems({
        passwords: items.passwords || [],
        cards: items.cards || [],
        documents: items.documents || [],
        notes: items.notes || [],
      });
      setSharedItemsNotice('');
    } else {
      console.log('Shared family items load failed', sharedItemsResult.reason);
      setSharedItemsNotice(
        sharedItemsResult.reason?.message ||
          'We could not refresh shared vault items right now.'
      );
    }

    if (
      manual &&
      familyResult.status === 'rejected' &&
      sharedItemsResult.status === 'rejected'
    ) {
      Alert.alert(
        'Could not refresh family',
        'Your family screen is still available, but the latest family data could not be refreshed right now.'
      );
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFamily();
    }, [loadFamily])
  );

  const handleRefresh = () => {
    hapticLight();
    setRefreshing(true);
    api.clearCache();
    loadFamily({ manual: true });
  };

  const handleRemoveMember = (membershipId: number, name: string) => {
    if (deletingMemberId !== null) return;

    hapticDelete();
    Alert.alert('Remove member', `Remove ${name} from your family group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (deletingMemberId !== null) return;

          try {
            setDeletingMemberId(membershipId);
            await api.removeFamilyMember(membershipId);
            api.clearCache();
            hapticSuccess();
            await loadFamily({ manual: true });
          } catch (error: any) {
            hapticWarning();
            Alert.alert('Could not remove member', error.message || 'Please try again.');
          } finally {
            setDeletingMemberId(null);
          }
        },
      },
    ]);
  };

  const canAddMembers = overview?.familyPlan === true;
  const memberCount = overview?.memberCount || 0;
  const memberLimit = overview?.memberLimit || 6;
  const totalShared =
    sharedItems.passwords.length +
    sharedItems.cards.length +
    sharedItems.documents.length +
    sharedItems.notes.length;


  const renderFamilySkeleton = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.listCard}>
        {[1, 2, 3, 4, 5].map((item, index) => (
          <View
            key={`family-skeleton-${item}`}
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
              <PulsingSkeleton styles={styles} style={styles.skeletonDate} />
              <PulsingSkeleton styles={styles} style={styles.skeletonDate} />
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
        {renderFamilySkeleton()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={styles.title}>Family</Text>
        <Text style={styles.subtitle}>Share selected vault types with people you trust.</Text>

        {!!familyNotice && (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeTitle}>Family data not refreshed</Text>
            <Text style={styles.noticeText}>{familyNotice}</Text>
            <TouchableOpacity
              style={styles.retrySmallButton}
              activeOpacity={0.75}
              onPress={() => {
                setRefreshing(true);
                api.clearCache();
                loadFamily({ manual: true });
              }}
            >
              <Text style={styles.retrySmallButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Users size={28} color="#fff" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>
              {canAddMembers ? 'Family sharing is active' : 'Family plan required'}
            </Text>
            <Text style={styles.heroText}>
              {canAddMembers
                ? `${memberCount}/${memberLimit} family members added`
                : 'Upgrade to the Family plan before adding family members.'}
            </Text>
          </View>
        </View>

        {!canAddMembers && (
          <TouchableOpacity
            style={styles.upgradeButton}
            activeOpacity={0.75}
            onPress={() => { hapticWarning(); router.push('/subscription?from=family'); }}
          >
            <Crown size={20} color="#fff" />
            <Text style={styles.upgradeText}>Upgrade to Family Plan</Text>
            <ChevronRight size={20} color="#fff" />
          </TouchableOpacity>
        )}

        {canAddMembers && (
          <TouchableOpacity
            style={styles.addButton}
            activeOpacity={0.75}
            onPress={() => { hapticLight(); router.push('/newmember'); }}
          >
            <Plus size={20} color="#fff" />
            <Text style={styles.addButtonText}>Add family member</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.sectionLabel}>YOUR FAMILY MEMBERS</Text>

        <View style={styles.card}>
          {overview?.members?.length ? (
            overview.members.map((member, index) => (
              <View
                key={member.membershipId}
                style={[styles.memberRow, index !== overview.members.length - 1 && styles.rowDivider]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials(member.fullName, member.email)}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{member.fullName || 'Family member'}</Text>
                  <Text style={styles.memberEmail}>{member.email}</Text>
                  <Text style={styles.permissionText}>{permissionLabel(member)}</Text>
                </View>

                <TouchableOpacity
                  style={styles.deleteButton}
                  activeOpacity={0.7}
                  disabled={deletingMemberId !== null}
                  onPress={() => handleRemoveMember(member.membershipId, member.fullName || member.email)}
                >
                  {deletingMemberId === member.membershipId ? (
                    <ActivityIndicator size="small" color={C.danger} />
                  ) : (
                    <Trash2 size={18} color={C.danger} />
                  )}
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No members yet</Text>
              <Text style={styles.emptyText}>
                {canAddMembers
                  ? 'Tap Add family member to invite someone who already has an account.'
                  : 'Upgrade to the Family plan to add members.'}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>VAULTS SHARED WITH YOU</Text>

        <View style={styles.card}>
          {overview?.sharedVaultOwners?.length ? (
            overview.sharedVaultOwners.map((owner, index) => (
              <View
                key={owner.ownerId}
                style={[styles.memberRow, index !== overview.sharedVaultOwners.length - 1 && styles.rowDivider]}
              >
                <View style={styles.sharedIcon}>
                  <Users size={18} color={C.primary} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{owner.fullName || 'Vault owner'}</Text>
                  <Text style={styles.memberEmail}>{owner.email}</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No shared vaults</Text>
              <Text style={styles.emptyText}>When another Family admin adds you, their shared items appear below.</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>SHARED ITEMS WITH YOU</Text>

        {!!sharedItemsNotice && (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeTitle}>Shared items not refreshed</Text>
            <Text style={styles.noticeText}>{sharedItemsNotice}</Text>
            <TouchableOpacity
              style={styles.retrySmallButton}
              activeOpacity={0.75}
              onPress={() => {
                setRefreshing(true);
                api.clearCache();
                loadFamily({ manual: true });
              }}
            >
              <Text style={styles.retrySmallButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {totalShared === 0 ? (
          <View style={styles.card}>
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No shared items yet</Text>
              <Text style={styles.emptyText}>Shared passwords, cards, documents, and secure notes will appear here.</Text>
            </View>
          </View>
        ) : (
          <>
            <SharedPasswordSection items={sharedItems.passwords} styles={styles} C={C} />
            <SharedCardSection items={sharedItems.cards} styles={styles} C={C} />
            <SharedDocumentSection items={sharedItems.documents} styles={styles} C={C} />
            <SharedNoteSection items={sharedItems.notes} styles={styles} C={C} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SharedPasswordSection({ items, styles, C }: { items: SharedPasswordItem[]; styles: any; C: any }) {
  if (!items.length) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.innerSectionTitle}>Passwords</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => `password-${item.ownerId}-${item.id}`}
        scrollEnabled={false}
        renderItem={({ item, index }) => (
          <SharedRow
            icon={<KeyRound size={18} color={C.primary} />}
            title={item.title}
            subtitle={`Shared by ${item.ownerName || item.ownerEmail}`}
            extra={item.website}
            isLast={index === items.length - 1}
            styles={styles}
            onPress={() => router.push({ pathname: '/sharedvaultdetails', params: { id: String(item.id), type: 'PASSWORD' } })}
          />
        )}
      />
    </View>
  );
}

function SharedCardSection({ items, styles, C }: { items: SharedCardItem[]; styles: any; C: any }) {
  if (!items.length) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.innerSectionTitle}>Cards</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => `card-${item.ownerId}-${item.id}`}
        scrollEnabled={false}
        renderItem={({ item, index }) => (
          <SharedRow
            icon={<CreditCard size={18} color={C.primary} />}
            title={item.cardName || 'Shared card'}
            subtitle={`Shared by ${item.ownerName || item.ownerEmail}`}
            extra="Read-only card"
            isLast={index === items.length - 1}
            styles={styles}
            onPress={() => router.push({ pathname: '/sharedvaultdetails', params: { id: String(item.id), type: 'CARD' } })}
          />
        )}
      />
    </View>
  );
}

function SharedDocumentSection({ items, styles, C }: { items: SharedDocumentItem[]; styles: any; C: any }) {
  if (!items.length) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.innerSectionTitle}>Documents</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => `document-${item.ownerId}-${item.id}`}
        scrollEnabled={false}
        renderItem={({ item, index }) => (
          <SharedRow
            icon={<FileText size={18} color={C.primary} />}
            title={item.documentName || 'Shared document'}
            subtitle={`Shared by ${item.ownerName || item.ownerEmail}`}
            extra={getFriendlyDocumentType(item.documentType, item.documentName)}
            isLast={index === items.length - 1}
            styles={styles}
            onPress={() => router.push({ pathname: '/sharedvaultdetails', params: { id: String(item.id), type: 'DOCUMENT' } })}
          />
        )}
      />
    </View>
  );
}

function SharedNoteSection({ items, styles, C }: { items: SharedNoteItem[]; styles: any; C: any }) {
  if (!items.length) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.innerSectionTitle}>Secure Notes</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => `note-${item.ownerId}-${item.id}`}
        scrollEnabled={false}
        renderItem={({ item, index }) => (
          <SharedRow
            icon={<NotebookText size={18} color={C.primary} />}
            title={item.title || 'Shared secure note'}
            subtitle={`Shared by ${item.ownerName || item.ownerEmail}`}
            extra={item.category || 'Secure note'}
            isLast={index === items.length - 1}
            styles={styles}
            onPress={() => router.push({ pathname: '/sharedvaultdetails', params: { id: String(item.id), type: 'NOTE' } })}
          />
        )}
      />
    </View>
  );
}

function SharedRow({
  icon,
  title,
  subtitle,
  extra,
  isLast,
  styles,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  extra?: string;
  isLast: boolean;
  styles: any;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.vaultRow, !isLast && styles.rowDivider]}
      activeOpacity={0.75}
      onPress={onPress}
    >
      <View style={styles.sharedIcon}>{icon}</View>

      <View style={{ flex: 1 }}>
        <Text style={styles.memberName}>{title}</Text>
        <Text style={styles.memberEmail}>{subtitle}</Text>
        {!!extra && <Text style={styles.websiteText}>{extra}</Text>}
      </View>

      <ChevronRight size={20} color={styles.chevronColor?.color || '#888'} />
    </TouchableOpacity>
  );
}

function getInitials(name: string, email: string) {
  const source = name || email || 'U';
  const parts = source.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function permissionLabel(member: any) {
  const permissions = [];
  if (member.sharePasswords) permissions.push('Passwords');
  if (member.shareCards) permissions.push('Cards');
  if (member.shareDocuments) permissions.push('Documents');
  if (member.shareNotes) permissions.push('Secure notes');
  return permissions.length ? `Can view: ${permissions.join(', ')}` : 'No vault access selected';
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    scrollContent: { paddingHorizontal: 18, paddingTop: 48, paddingBottom: 170 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 10, color: C.textSecondary },

    skeletonBlock: { backgroundColor: C.backgroundSelected, borderRadius: 999 },
    listCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: 22,
    },
    notificationRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
    iconCircle: {
      width: 44,
      height: 44,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundSelected,
    },
    skeletonTitle: { width: '72%', height: 15, marginBottom: 9 },
    skeletonText: { width: '94%', height: 12, marginBottom: 9 },
    skeletonDate: { width: 84, height: 10 },

    title: {
      fontSize: 36,
      fontWeight: '900',
      color: C.text,
      marginBottom: 6,
      letterSpacing: -0.7,
    },
    subtitle: { fontSize: 15, color: C.textSecondary, marginBottom: 20, lineHeight: 22, fontWeight: '600' },
    noticeBox: {
      backgroundColor: C.alertWarningBg || C.backgroundSelected,
      borderRadius: 22,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: C.warning,
    },
    noticeTitle: { color: C.text, fontSize: 14, fontWeight: '900', marginBottom: 5 },
    noticeText: { color: C.textSecondary, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    retrySmallButton: {
      alignSelf: 'flex-start',
      backgroundColor: C.primary,
      borderRadius: 999,
      paddingHorizontal: 15,
      paddingVertical: 9,
      marginTop: 12,
    },
    retrySmallButtonText: { color: '#fff', fontWeight: '900', fontSize: 12 },
    heroCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 30,
      padding: 18,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    heroIcon: {
      width: 62,
      height: 62,
      borderRadius: 22,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 15,
    },
    heroTitle: { fontSize: 18, fontWeight: '900', color: C.text, letterSpacing: -0.2 },
    heroText: { fontSize: 13, color: C.textSecondary, marginTop: 5, lineHeight: 19, fontWeight: '700' },
    upgradeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      backgroundColor: C.primary,
      borderRadius: 22,
      paddingVertical: 16,
      marginBottom: 24,
      shadowColor: C.primary,
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    upgradeText: { color: '#fff', fontWeight: '900', fontSize: 15 },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      backgroundColor: C.primary,
      borderRadius: 22,
      paddingVertical: 16,
      marginBottom: 24,
      shadowColor: C.primary,
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    addButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '900',
      color: C.textSecondary,
      letterSpacing: 0.7,
      marginLeft: 4,
      marginBottom: 10,
      textTransform: 'uppercase',
    },
    innerSectionTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: '900',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
    },
    card: {
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      overflow: 'hidden',
      marginBottom: 24,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    memberRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    vaultRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 18,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 13,
    },
    avatarText: { color: '#fff', fontWeight: '900', fontSize: 14 },
    sharedIcon: {
      width: 44,
      height: 44,
      borderRadius: 17,
      backgroundColor: C.actionCard || C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 13,
    },
    memberName: { fontSize: 15, color: C.text, fontWeight: '900' },
    memberEmail: { fontSize: 13, color: C.textSecondary, marginTop: 4, fontWeight: '600' },
    permissionText: { fontSize: 12, color: C.primary, marginTop: 5, fontWeight: '800', lineHeight: 17 },
    websiteText: { fontSize: 12, color: C.primary, marginTop: 5, fontWeight: '800' },
    deleteButton: {
      width: 40,
      height: 40,
      borderRadius: 18,
      backgroundColor: C.alertDangerBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
    },
    emptyBox: { padding: 24, alignItems: 'center' },
    emptyTitle: { color: C.text, fontSize: 16, fontWeight: '900' },
    emptyText: { color: C.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 7, lineHeight: 20, fontWeight: '600' },
    chevronColor: { color: C.tabInactive },
  });
