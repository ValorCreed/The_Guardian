import React, { useCallback, useState } from 'react';
import {
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

  const loadFamily = useCallback(async () => {
    try {
      const family = await api.getFamilyOverview();
      setOverview(family);

      const items = await api.getSharedFamilyItems();
      setSharedItems({
        passwords: items.passwords || [],
        cards: items.cards || [],
        documents: items.documents || [],
        notes: items.notes || [],
      });
    } catch (error: any) {
      Alert.alert('Family error', error.message || 'Could not load family data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFamily();
    }, [loadFamily])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    api.clearCache();
    loadFamily();
  };

  const handleRemoveMember = (membershipId: number, name: string) => {
    Alert.alert('Remove member', `Remove ${name} from your family group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.removeFamilyMember(membershipId);
            api.clearCache();
            loadFamily();
          } catch (error: any) {
            Alert.alert('Could not remove member', error.message || 'Please try again.');
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
            onPress={() => router.push('/subscription')}
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
            onPress={() => router.push('/newmember')}
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
                  onPress={() => handleRemoveMember(member.membershipId, member.fullName || member.email)}
                >
                  <Trash2 size={18} color={C.danger} />
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
            extra={item.documentType || 'Document'}
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
    scrollContent: { paddingHorizontal: 16, paddingTop: 48, paddingBottom: 140 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 10, color: C.textSecondary },

    skeletonBlock: { backgroundColor: C.backgroundSelected, borderRadius: 999 },
    listCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: 22,
    },
    notificationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      gap: 12,
    },
    iconCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.background,
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
    skeletonPageTitle: { width: 122, height: 34, marginBottom: 12 },
    skeletonSubtitle: { width: '82%', height: 14, marginBottom: 18 },
    skeletonHeroTitle: { width: '54%', height: 17, marginBottom: 10 },
    skeletonHeroText: { width: '88%', height: 12, marginBottom: 8 },
    skeletonHeroTextShort: { width: '54%', height: 12 },
    skeletonHeroIcon: { width: 56, height: 56, borderRadius: 18, marginRight: 14 },
    skeletonSectionLabel: { width: 155, height: 12, marginLeft: 4, marginBottom: 8 },
    skeletonButton: { width: '100%', height: 52, borderRadius: 18, marginBottom: 22 },
    skeletonAvatar: { width: 42, height: 42, borderRadius: 14, marginRight: 12 },
    skeletonSharedIcon: { width: 42, height: 42, borderRadius: 14, marginRight: 12 },
    skeletonPermission: { width: '68%', height: 10, marginTop: 8 },
    skeletonSmallButton: { width: 38, height: 38, borderRadius: 19 },
    skeletonChevron: { width: 20, height: 20, borderRadius: 10 },
    skeletonMemberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    skeletonMemberTitle: { width: '58%', height: 15, marginBottom: 8 },
    skeletonMemberSub: { width: '80%', height: 11 },
    skeletonSharedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
    skeletonSharedTitle: { width: '62%', height: 15, marginBottom: 8 },
    skeletonSharedSub: { width: '44%', height: 11 },

    title: { fontSize: 34, fontWeight: '800', color: C.text, marginBottom: 6 },
    subtitle: { fontSize: 15, color: C.textSecondary, marginBottom: 18 },
    heroCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: C.border,
    },
    heroIcon: {
      width: 56,
      height: 56,
      borderRadius: 20,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    heroTitle: { fontSize: 17, fontWeight: '800', color: C.text },
    heroText: { fontSize: 13, color: C.textSecondary, marginTop: 4, lineHeight: 18 },
    upgradeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: C.primary,
      borderRadius: 18,
      paddingVertical: 15,
      marginBottom: 22,
    },
    upgradeText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: C.primary,
      borderRadius: 18,
      paddingVertical: 15,
      marginBottom: 22,
    },
    addButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: C.textSecondary,
      letterSpacing: 0.5,
      marginLeft: 4,
      marginBottom: 8,
    },
    innerSectionTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: '900',
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 6,
    },
    card: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      overflow: 'hidden',
      marginBottom: 22,
      borderWidth: 1,
      borderColor: C.border,
    },
    memberRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
    vaultRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    avatarText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    sharedIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    memberName: { fontSize: 15, color: C.text, fontWeight: '800' },
    memberEmail: { fontSize: 13, color: C.textSecondary, marginTop: 3 },
    permissionText: { fontSize: 12, color: C.primary, marginTop: 4, fontWeight: '700' },
    websiteText: { fontSize: 12, color: C.primary, marginTop: 4 },
    deleteButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: C.alertDangerBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyBox: { padding: 18, alignItems: 'center' },
    emptyTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
    emptyText: { color: C.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },
    chevronColor: { color: C.tabInactive },
  });
