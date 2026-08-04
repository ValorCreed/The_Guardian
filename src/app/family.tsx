import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
  Pencil,
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
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { hapticDelete, hapticLight, hapticSuccess, hapticWarning } from '../utils/haptics';
import { useScreenAlert } from '../hooks/useScreenAlert';
import { getFriendlyVaultSubtitle, getFriendlyVaultTitle } from '../utils/vaultPresentation';


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

const FAMILY_FAST_REACHABILITY_TIMEOUT_MS = 1800;

const getFriendlyFamilyError = (
  error: any,
  fallback: string
) => {
  const message = String(
    error?.message ||
      error?.rawMessage ||
      error ||
      ''
  ).toLowerCase();

  if (
    message.includes('connection refused') ||
    message.includes('getsockopt') ||
    message.includes('i/o error') ||
    message.includes('service unavailable') ||
    message.includes('bad gateway') ||
    message.includes('connect timed out') ||
    message.includes('connection timed out') ||
    message.includes('localhost:8085')
  ) {
    return 'Family sharing is temporarily unavailable. Please try again shortly.';
  }

  return fallback;
};

export default function FamilyScreen() {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
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

  const loadFamily = useCallback(async (_options?: { manual?: boolean }) => {
    const serverReachable = await api
      .checkServerReachability(FAMILY_FAST_REACHABILITY_TIMEOUT_MS)
      .catch(() => false);

    if (!serverReachable) {
      setFamilyNotice(
        'The Guardian could not reach the server. Family sharing will be available again when you reconnect.'
      );
      setSharedItemsNotice('');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const [familyResult, sharedItemsResult] = await Promise.allSettled([
      requestApi.getFamilyOverview(),
      requestApi.getSharedFamilyItems(),
    ]);

    if (
      (familyResult.status === 'rejected' && isScreenRequestCancelled(familyResult.reason)) ||
      (sharedItemsResult.status === 'rejected' && isScreenRequestCancelled(sharedItemsResult.reason))
    ) {
      return;
    }

    if (familyResult.status === 'fulfilled') {
      setOverview(familyResult.value || EMPTY_FAMILY_OVERVIEW);
      setFamilyNotice('');
    } else {
      console.log('Family overview load failed', familyResult.reason);
      setFamilyNotice(
        getFriendlyFamilyError(
          familyResult.reason,
          'We could not refresh your family details right now. Please try again shortly.'
        )
      );
    }

    if (sharedItemsResult.status === 'fulfilled') {
      const items = sharedItemsResult.value || {
        passwords: [],
        cards: [],
        documents: [],
        notes: [],
      };

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
        getFriendlyFamilyError(
          sharedItemsResult.reason,
          'We could not refresh the items shared with you right now.'
        )
      );
    }

    setLoading(false);
    setRefreshing(false);
  }, [requestApi]);

  useFocusEffect(
    useCallback(() => {
      loadFamily();
    }, [loadFamily])
  );

  const handleRefresh = () => {
    hapticLight();
    setRefreshing(true);
    requestApi.clearCache();
    loadFamily({ manual: true });
  };

  const handleRemoveMember = (membershipId: number, name: string) => {
    if (deletingMemberId !== null) return;

    hapticDelete();
    screenAlert('Remove member', `Remove ${name} from your family group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (deletingMemberId !== null) return;

          try {
            setDeletingMemberId(membershipId);
            await requestApi.removeFamilyMember(membershipId);
            requestApi.clearCache();
            hapticSuccess();
            await loadFamily({ manual: true });
          } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
            hapticWarning();
            screenAlert('Could not remove member', error.message || 'Please try again.');
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
      <PulsingSkeleton styles={styles} style={styles.skeletonPageTitle} />

      <View style={styles.skeletonHeroCard}>
        <PulsingSkeleton styles={styles} style={styles.skeletonHeroIcon} />
        <View style={styles.skeletonHeroCopy}>
          <PulsingSkeleton styles={styles} style={styles.skeletonHeroTitle} />
          <PulsingSkeleton styles={styles} style={styles.skeletonHeroText} />
        </View>
      </View>

      <PulsingSkeleton styles={styles} style={styles.skeletonPrimaryAction} />

      <PulsingSkeleton styles={styles} style={styles.skeletonSectionLabel} />
      <View style={styles.skeletonCardShell}>
        <View style={styles.skeletonCardSurface}>
          <View style={styles.skeletonMemberRow}>
            <PulsingSkeleton styles={styles} style={styles.skeletonMemberAvatar} />

            <View style={styles.skeletonMemberDetails}>
              <PulsingSkeleton styles={styles} style={styles.skeletonMemberName} />
              <PulsingSkeleton styles={styles} style={styles.skeletonMemberEmail} />
              <PulsingSkeleton styles={styles} style={styles.skeletonPermission} />

              <View style={styles.skeletonMemberActions}>
                <PulsingSkeleton styles={styles} style={styles.skeletonMemberAction} />
                <PulsingSkeleton styles={styles} style={styles.skeletonMemberAction} />
              </View>
            </View>
          </View>
        </View>
      </View>

      <PulsingSkeleton styles={styles} style={styles.skeletonSectionLabelShort} />
      <View style={styles.skeletonCardShell}>
        <View style={styles.skeletonCardSurface}>
          <View style={styles.skeletonOwnerRow}>
            <PulsingSkeleton styles={styles} style={styles.skeletonOwnerIcon} />
            <View style={styles.skeletonOwnerCopy}>
              <PulsingSkeleton styles={styles} style={styles.skeletonOwnerName} />
              <PulsingSkeleton styles={styles} style={styles.skeletonOwnerEmail} />
            </View>
          </View>
        </View>
      </View>

      <PulsingSkeleton styles={styles} style={styles.skeletonSectionLabelCompact} />
      <View style={styles.skeletonCardShell}>
        <View style={styles.skeletonCardSurface}>
          <View style={styles.skeletonInnerHeader}>
            <PulsingSkeleton styles={styles} style={styles.skeletonInnerTitle} />
          </View>

          {[1, 2].map((item, index) => (
            <View
              key={`shared-item-skeleton-${item}`}
              style={[
                styles.skeletonSharedRow,
                index === 0 && styles.rowDivider,
              ]}
            >
              <PulsingSkeleton styles={styles} style={styles.skeletonSharedIcon} />
              <View style={styles.skeletonSharedCopy}>
                <PulsingSkeleton styles={styles} style={styles.skeletonSharedTitle} />
                <PulsingSkeleton styles={styles} style={styles.skeletonSharedSubtitle} />
                <PulsingSkeleton styles={styles} style={styles.skeletonSharedMeta} />
              </View>
              <PulsingSkeleton styles={styles} style={styles.skeletonChevron} />
            </View>
          ))}
        </View>
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

  if (!overview && familyNotice) {
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
            />
          }
        >
          <Text style={styles.title}>Family</Text>

          <View style={styles.serviceUnavailableCard}>
            <View style={styles.serviceUnavailableIcon}>
              <Users size={28} color={C.primary} />
            </View>

            <Text style={styles.serviceUnavailableTitle}>
              Family sharing is unavailable
            </Text>
            <Text style={styles.serviceUnavailableText}>
              We could not reach the Family service. Your plan, members, and
              shared items have not been changed.
            </Text>

            <TouchableOpacity
              style={styles.serviceRetryButton}
              activeOpacity={0.78}
              onPress={() => {
                hapticLight();
                setRefreshing(true);
                requestApi.clearCache();
                loadFamily({ manual: true });
              }}
            >
              <Text style={styles.serviceRetryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
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

        {!!familyNotice && (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeTitle}>Family data not refreshed</Text>
            <Text style={styles.noticeText}>{familyNotice}</Text>
            <TouchableOpacity
              style={styles.retrySmallButton}
              activeOpacity={0.75}
              onPress={() => {
                setRefreshing(true);
                requestApi.clearCache();
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
              {canAddMembers ? 'Family sharing' : 'Family plan needed'}
            </Text>
            <Text style={styles.heroText}>
              {canAddMembers
                ? `${memberCount} of ${memberLimit} members`
                : 'Upgrade to add and share with family members.'}
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

        <Text style={styles.sectionLabel}>Family members</Text>

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

                <View style={styles.memberDetails}>
                  <Text style={styles.memberName}>{member.fullName || 'Family member'}</Text>
                  <Text style={styles.memberEmail}>{member.email}</Text>
                  <Text style={styles.permissionText}>{permissionLabel(member)}</Text>

                  <View style={styles.memberActions}>
                    {canAddMembers && (
                      <TouchableOpacity
                        style={styles.editButton}
                        activeOpacity={0.72}
                        disabled={deletingMemberId !== null}
                        onPress={() => {
                          hapticLight();
                          router.push({
                            pathname: '/editfamilyaccess',
                            params: {
                              membershipId: String(member.membershipId),
                              memberName: member.fullName || 'Family member',
                              memberEmail: member.email,
                            },
                          });
                        }}
                      >
                        <Pencil size={17} color={C.primary} />
                        <Text style={styles.editButtonText}>Edit access</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.deleteButton}
                      activeOpacity={0.7}
                      disabled={deletingMemberId !== null}
                      onPress={() => handleRemoveMember(member.membershipId, member.fullName || member.email)}
                    >
                      {deletingMemberId === member.membershipId ? (
                        <>
                          <ActivityIndicator size="small" color={C.danger} />
                          <Text style={styles.deleteButtonText}>Removing</Text>
                        </>
                      ) : (
                        <>
                          <Trash2 size={17} color={C.danger} />
                          <Text style={styles.deleteButtonText}>Remove</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
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

        <Text style={styles.sectionLabel}>Shared with you</Text>

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
              <Text style={styles.emptyText}>Shared vaults will appear here.</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>Shared items</Text>

        {!!sharedItemsNotice && (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeTitle}>Shared items not refreshed</Text>
            <Text style={styles.noticeText}>{sharedItemsNotice}</Text>
            <TouchableOpacity
              style={styles.retrySmallButton}
              activeOpacity={0.75}
              onPress={() => {
                setRefreshing(true);
                requestApi.clearCache();
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
              <Text style={styles.emptyText}>Items shared with you will appear here.</Text>
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
            title={getFriendlyVaultTitle(item.title, item.website, 'Shared password')}
            subtitle={`Shared by ${item.ownerName || item.ownerEmail}`}
            extra={getFriendlyVaultSubtitle(undefined, item.website, 'Login details')}
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
      <Text style={styles.innerSectionTitle}>SecureNotes</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => `note-${item.ownerId}-${item.id}`}
        scrollEnabled={false}
        renderItem={({ item, index }) => (
          <SharedRow
            icon={<NotebookText size={18} color={C.primary} />}
            title={item.title || 'Shared SecureNote'}
            subtitle={`Shared by ${item.ownerName || item.ownerEmail}`}
            extra={item.category || 'SecureNote'}
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
  if (member.shareNotes) permissions.push('SecureNotes');
  return permissions.length ? `Can view: ${permissions.join(', ')}` : 'No vault access selected';
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    scrollContent: { paddingHorizontal: 18, paddingTop: 25, paddingBottom: 170 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 10, color: C.textSecondary },

    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
      shadowColor: '#000',
      shadowOpacity: 0.07,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    skeletonPageTitle: {
      width: 118,
      height: 36,
      borderRadius: 14,
      marginBottom: 12,
      alignSelf: 'flex-start',
    },
    skeletonHeroCard: {
      minHeight: 98,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 30,
      padding: 18,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.24,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 14 },
      elevation: 12,
    },
    skeletonHeroIcon: {
      width: 62,
      height: 62,
      borderRadius: 22,
      marginRight: 15,
      shadowColor: C.primary,
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    skeletonHeroCopy: {
      flex: 1,
      minWidth: 0,
    },
    skeletonHeroTitle: {
      width: '64%',
      height: 19,
      marginBottom: 10,
    },
    skeletonHeroText: {
      width: '88%',
      height: 13,
    },
    skeletonPrimaryAction: {
      width: '100%',
      height: 54,
      borderRadius: 22,
      marginBottom: 24,
      shadowColor: C.primary,
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 9 },
      elevation: 5,
    },
    skeletonSectionLabel: {
      width: 112,
      height: 12,
      marginLeft: 4,
      marginBottom: 10,
      borderRadius: 6,
    },
    skeletonSectionLabelShort: {
      width: 104,
      height: 12,
      marginLeft: 4,
      marginBottom: 10,
      borderRadius: 6,
    },
    skeletonSectionLabelCompact: {
      width: 88,
      height: 12,
      marginLeft: 4,
      marginBottom: 10,
      borderRadius: 6,
    },
    skeletonCardShell: {
      width: '100%',
      borderRadius: 24,
      marginBottom: 24,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
      backgroundColor: C.backgroundElement,
    },
    skeletonCardSurface: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },

      width: '100%',
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.border,
    },
    skeletonMemberRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: 16,
    },
    skeletonMemberAvatar: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 46,
      height: 46,
      borderRadius: 18,
      marginRight: 13,
      flexShrink: 0,
    },
    skeletonMemberDetails: {
      flex: 1,
      minWidth: 0,
    },
    skeletonMemberName: {
      width: '58%',
      height: 15,
      marginBottom: 8,
    },
    skeletonMemberEmail: {
      width: '82%',
      height: 12,
      marginBottom: 8,
    },
    skeletonPermission: {
      width: '92%',
      height: 12,
    },
    skeletonMemberActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 14,
    },
    skeletonMemberAction: {
      flex: 1,
      height: 42,
      borderRadius: 15,
    },
    skeletonOwnerRow: {
      minHeight: 78,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },
    skeletonOwnerIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 44,
      height: 44,
      borderRadius: 17,
      marginRight: 13,
      flexShrink: 0,
    },
    skeletonOwnerCopy: {
      flex: 1,
      minWidth: 0,
    },
    skeletonOwnerName: {
      width: '54%',
      height: 15,
      marginBottom: 8,
    },
    skeletonOwnerEmail: {
      width: '78%',
      height: 12,
    },
    skeletonInnerHeader: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
    },
    skeletonInnerTitle: {
      width: 86,
      height: 15,
    },
    skeletonSharedRow: {
      minHeight: 84,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },
    skeletonSharedIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 44,
      height: 44,
      borderRadius: 17,
      marginRight: 13,
      flexShrink: 0,
    },
    skeletonSharedCopy: {
      flex: 1,
      minWidth: 0,
    },
    skeletonSharedTitle: {
      width: '62%',
      height: 14,
      marginBottom: 7,
    },
    skeletonSharedSubtitle: {
      width: '88%',
      height: 11,
      marginBottom: 7,
    },
    skeletonSharedMeta: {
      width: '42%',
      height: 10,
    },
    skeletonChevron: {
      width: 12,
      height: 20,
      borderRadius: 6,
      marginLeft: 12,
    },

    title: {
      fontSize: 36,
      fontWeight: '900',
      color: C.text,
      marginBottom: 6,
      letterSpacing: -0.7,
    },
    subtitle: { fontSize: 15, color: C.textSecondary, marginBottom: 20, lineHeight: 22, fontWeight: '600' },
    noticeBox: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    noticeTitle: { color: C.text, fontSize: 14, fontWeight: '900', marginBottom: 5 },
    noticeText: { color: C.textSecondary, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    retrySmallButton: {
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      elevation: 10,
      shadowOffset: { width: 0, height: 11 },

      alignSelf: 'flex-start',
      backgroundColor: C.primary,
      borderRadius: 999,
      paddingHorizontal: 15,
      paddingVertical: 9,
      marginTop: 12,
    },
    retrySmallButtonText: { color: '#fff', fontWeight: '900', fontSize: 12 },
    serviceUnavailableCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 22,
      paddingVertical: 28,
      alignItems: 'center',
      marginTop: 18,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    serviceUnavailableIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 68,
      height: 68,
      borderRadius: 24,
      backgroundColor: C.actionCard || C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    serviceUnavailableTitle: {
      color: C.text,
      fontSize: 19,
      fontWeight: '900',
      textAlign: 'center',
    },
    serviceUnavailableText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: 8,
    },
    serviceRetryButton: {
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      elevation: 10,
      shadowOffset: { width: 0, height: 11 },

      minWidth: 132,
      minHeight: 44,
      borderRadius: 999,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 22,
      marginTop: 20,
    },
    serviceRetryButtonText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '900',
    },
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
      shadowOpacity: 0.24,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 14 },
      elevation: 12,
    },
    heroIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

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
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 11 },
      elevation: 10,
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
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 11 },
      elevation: 10,
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
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    memberRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 16 },
    memberDetails: { flex: 1, minWidth: 0 },
    vaultRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    avatar: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

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
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

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
    memberActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 14,
      alignSelf: 'stretch',
    },
    editButton: {
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      elevation: 10,
      shadowOffset: { width: 0, height: 11 },

      flex: 1,
      minHeight: 42,
      borderRadius: 15,
      backgroundColor: C.actionCard || C.backgroundSelected,
      borderWidth: 1,
      borderColor: C.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 12,
    },
    editButtonText: {
      color: C.primary,
      fontSize: 12,
      fontWeight: '900',
    },
    deleteButton: {
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      elevation: 10,
      shadowOffset: { width: 0, height: 11 },

      flex: 1,
      minHeight: 42,
      borderRadius: 15,
      backgroundColor: C.alertDangerBg,
      borderWidth: 1,
      borderColor: C.danger,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 12,
    },
    deleteButtonText: {
      color: C.danger,
      fontSize: 12,
      fontWeight: '900',
    },
    emptyBox: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },
 padding: 24, alignItems: 'center' },
    emptyTitle: { color: C.text, fontSize: 16, fontWeight: '900' },
    emptyText: { color: C.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 7, lineHeight: 20, fontWeight: '600' },
    chevronColor: { color: C.tabInactive },
  });