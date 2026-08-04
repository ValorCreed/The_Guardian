import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
import { router, useFocusEffect } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { api, EmergencyAccessRequestResponse, EmergencyContactResponse, EmergencyOverviewResponse } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import { useScreenAlert } from '../hooks/useScreenAlert';

const formatDate = (value?: string | null) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statusColor = (status: string, C: any) => {
  if (status === 'APPROVED' || status === 'AVAILABLE') return C.success;
  if (status === 'DENIED' || status === 'CANCELLED') return C.danger;
  return C.warning;
};

export default function EmergencyAccessScreen() {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const { colors: C, isDark } = useAppTheme();
  const styles = makeStyles(C);

  const [overview, setOverview] = useState<EmergencyOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingRequestId, setWorkingRequestId] = useState<number | null>(null);

  const loadOverview = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      const data = await requestApi.getEmergencyOverview();
      setOverview(data);
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      screenAlert('Could not load emergency access', error.message || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOverview(true);
    }, [loadOverview])
  );

  const refresh = async () => {
    setRefreshing(true);
    await loadOverview(false);
  };

  const updateReceivedRequest = useCallback(
    (updatedRequest: EmergencyAccessRequestResponse) => {
      setOverview((current) => {
        if (!current) return current;

        return {
          ...current,
          receivedRequests: current.receivedRequests.map((item) =>
            item.id === updatedRequest.id ? { ...item, ...updatedRequest } : item
          ),
        };
      });
    },
    []
  );

  const approveRequest = (request: EmergencyAccessRequestResponse) => {
    screenAlert(
      'Approve emergency access?',
      `${request.requesterEmail} will be approved for emergency access according to the permissions you set.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              setWorkingRequestId(request.id);
              const updatedRequest = await requestApi.approveEmergencyRequest(request.id);
              updateReceivedRequest(updatedRequest);
              await loadOverview(false);
            } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
              screenAlert('Approval failed', error.message || 'Could not approve this request.');
            } finally {
              setWorkingRequestId(null);
            }
          },
        },
      ]
    );
  };

  const denyRequest = (request: EmergencyAccessRequestResponse) => {
    screenAlert(
      'Deny emergency access?',
      `${request.requesterEmail} will not receive emergency access.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deny',
          style: 'destructive',
          onPress: async () => {
            try {
              setWorkingRequestId(request.id);
              const updatedRequest = await requestApi.denyEmergencyRequest(request.id);
              updateReceivedRequest(updatedRequest);
              await loadOverview(false);
            } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
              screenAlert('Deny failed', error.message || 'Could not deny this request.');
            } finally {
              setWorkingRequestId(null);
            }
          },
        },
      ]
    );
  };

  const contacts = overview?.contacts || [];
  const receivedRequests = overview?.receivedRequests || [];
  const sentRequests = overview?.sentRequests || [];
  const auditLogs = overview?.auditLogs || [];
  const canAddMore = overview ? overview.contactCount < overview.contactLimit : false;

  const renderEmergencySkeleton = () => (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
      <PulsingSkeleton styles={styles} style={styles.skeletonSubtitle} />

      <View style={styles.heroCardShell}>
        <View style={styles.heroCard}>
          <PulsingSkeleton styles={styles} style={styles.skeletonHeroIcon} />
          <View style={{ flex: 1 }}>
            <PulsingSkeleton styles={styles} style={styles.skeletonHeroTitle} />
            <PulsingSkeleton styles={styles} style={styles.skeletonHeroSub} />
          </View>
        </View>
      </View>

      <View style={styles.actionRow}>
        {[1, 2].map((item) => (
          <View key={`emergency-action-skeleton-${item}`} style={styles.skeletonActionShell}>
            <PulsingSkeleton styles={styles} style={styles.skeletonActionButton} />
          </View>
        ))}
      </View>

      {[1, 2, 3, 4].map((section) => (
        <View key={`emergency-section-skeleton-${section}`}>
          <PulsingSkeleton styles={styles} style={styles.skeletonSectionHeader} />
          <View style={styles.cardShell}>
            <View style={styles.card}>
              {[1, 2].map((row, index) => (
                <View key={`emergency-row-skeleton-${section}-${row}`} style={[styles.row, index !== 1 && styles.divider]}>
                  <PulsingSkeleton styles={styles} style={styles.skeletonSmallIcon} />
                  <View style={{ flex: 1 }}>
                    <PulsingSkeleton styles={styles} style={styles.skeletonRowTitle} />
                    <PulsingSkeleton styles={styles} style={styles.skeletonRowSub} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />
        {renderEmergencySkeleton()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.primary} colors={[C.primary]} />}
      >
        <Text style={styles.title}>Emergency access</Text>
        <Text style={styles.subtitle}>
          Manage trusted contacts and access requests.
        </Text>

        <View style={styles.heroCardShell}>
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Ionicons name="shield-checkmark-outline" size={28} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Emergency protection</Text>
              <Text style={styles.heroSub}>
                {overview?.contactCount || 0}/{overview?.contactLimit || 1} emergency contacts used
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, !canAddMore && styles.disabledAction]}
            disabled={!canAddMore}
            onPress={() => router.push('/addemergencycontact')}
          >
            <Ionicons name="person-add-outline" size={19} color="#fff" />
            <Text style={styles.actionButtonText}>Add contact</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryAction} onPress={() => router.push('/emergencyrequest')}>
            <Ionicons name="hand-left-outline" size={19} color={C.primary} />
            <Text style={styles.secondaryActionText}>Request access</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.safetyCheckCardShell}
          activeOpacity={0.84}
          onPress={() => router.push('/safetycheck')}
        >
          <View style={styles.safetyCheckCard}>
            <View style={styles.safetyCheckIcon}>
              <Ionicons name="pulse-outline" size={23} color={C.primary} />
            </View>

            <View style={{ flex: 1 }}>
              <View style={styles.safetyCheckTitleRow}>
                <Text style={styles.safetyCheckTitle}>Guardian Safety Check</Text>
                {/* <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>NEW</Text>
                </View> */}
              </View>
              <Text style={styles.safetyCheckSub}>
                Periodic check-ins with a grace period and automatic release to
                one trusted contact.
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={19} color={C.tabInactive} />
          </View>
        </TouchableOpacity>


        <TouchableOpacity
          style={styles.safetyCheckCardShell}
          activeOpacity={0.84}
          onPress={() => router.push('/estateplaybooks')}
        >
          <View style={styles.safetyCheckCard}>
            <View style={styles.safetyCheckIcon}>
              <Ionicons name="book-outline" size={23} color={C.primary} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.safetyCheckTitle}>Digital Estate Playbooks</Text>
              <Text style={styles.safetyCheckSub}>
                Decide which vault items may be released, to whom, and what trusted
                recipients should do with them.
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={19} color={C.tabInactive} />
          </View>
        </TouchableOpacity>

        {!canAddMore && (
          <TouchableOpacity style={styles.upgradeCard} onPress={() => router.push('/subscription?from=emergencyaccess')}>
            <Ionicons name="lock-closed-outline" size={20} color={C.warning} />
            <Text style={styles.upgradeText}>You have reached your emergency contact limit. Upgrade for more contacts.</Text>
          </TouchableOpacity>
        )}

        <SectionTitle title="Your emergency contacts" count={contacts.length} C={C} />
        <View style={styles.cardShell}>
          <View style={styles.card}>
            {contacts.length === 0 ? (
              <EmptyRow icon="people-outline" title="No emergency contacts yet" subtitle="Add a trusted contact to prepare for emergencies." C={C} styles={styles} />
            ) : contacts.map((contact, index) => (
              <ContactRow key={contact.id} contact={contact} index={index} total={contacts.length} C={C} styles={styles} />
            ))}
          </View>
        </View>

        <SectionTitle title="Requests to your vault" count={receivedRequests.length} C={C} />
        <View style={styles.cardShell}>
          <View style={styles.card}>
            {receivedRequests.length === 0 ? (
              <EmptyRow icon="mail-open-outline" title="No requests" subtitle="Emergency requests from your contacts will appear here." C={C} styles={styles} />
            ) : receivedRequests.map((request, index) => (
              <RequestRow
                key={request.id}
                request={request}
                index={index}
                total={receivedRequests.length}
                C={C}
                styles={styles}
                working={workingRequestId === request.id}
                onApprove={() => approveRequest(request)}
                onDeny={() => denyRequest(request)}
              />
            ))}
          </View>
        </View>

        <SectionTitle title="Your sent requests" count={sentRequests.length} C={C} />
        <View style={styles.cardShell}>
          <View style={styles.card}>
            {sentRequests.length === 0 ? (
              <EmptyRow icon="send-outline" title="No sent requests" subtitle="Requests you send to other vault owners will appear here." C={C} styles={styles} />
            ) : sentRequests.map((request, index) => (
              <SentRequestRow key={request.id} request={request} index={index} total={sentRequests.length} C={C} styles={styles} />
            ))}
          </View>
        </View>

        <SectionTitle title="Recent emergency activity" count={auditLogs.length} C={C} />
        <View style={styles.cardShell}>
          <View style={styles.card}>
            {auditLogs.length === 0 ? (
              <EmptyRow icon="time-outline" title="No emergency activity yet" subtitle="Contact changes and emergency requests will be logged here." C={C} styles={styles} />
            ) : auditLogs.slice(0, 8).map((log, index) => (
              <View key={log.id} style={[styles.auditRow, index !== Math.min(auditLogs.length, 8) - 1 && styles.divider]}>
                <View style={styles.smallIcon}><Ionicons name="time-outline" size={16} color={C.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{log.title}</Text>
                  <Text style={styles.rowSub}>{log.message || log.action}</Text>
                  <Text style={styles.timeText}>{formatDate(log.createdAt)}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 90 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title, count, C }: { title: string; count: number; C: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 10 }}>
      <Text style={{ color: C.text, fontSize: 18, fontWeight: '900' }}>{title}</Text>
      <Text style={{ color: C.textSecondary, fontSize: 13, fontWeight: '800' }}>{count}</Text>
    </View>
  );
}

function EmptyRow({ icon, title, subtitle, C, styles }: any) {
  return (
    <View style={styles.emptyRow}>
      <View style={styles.smallIcon}><Ionicons name={icon} size={18} color={C.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
    </View>
  );
}

function ContactRow({ contact, index, total, C, styles }: { contact: EmergencyContactResponse; index: number; total: number; C: any; styles: any }) {
  return (
    <TouchableOpacity
      style={[styles.row, index !== total - 1 && styles.divider]}
      onPress={() => router.push({ pathname: '/emergencydetails', params: { id: String(contact.id) } })}
    >
      <View style={styles.avatar}><Text style={styles.avatarText}>{(contact.contactName || contact.contactEmail).slice(0, 1).toUpperCase()}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{contact.contactName || contact.contactEmail}</Text>
        <Text style={styles.rowSub}>{contact.contactEmail}</Text>
        <Text style={styles.timeText}>Owner approval required</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
    </TouchableOpacity>
  );
}

function RequestRow({ request, index, total, C, styles, working, onApprove, onDeny }: any) {
  const color = statusColor(request.status, C);
  const normalizedStatus = String(request.status || '').toUpperCase();
  const canAct = normalizedStatus === 'PENDING';

  return (
    <View style={[styles.requestRow, index !== total - 1 && styles.divider]}>
      <View style={[styles.smallIcon, { backgroundColor: C.backgroundSelected }]}><Ionicons name="alert-circle-outline" size={18} color={color} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{request.requesterEmail}</Text>
        <Text style={styles.rowSub}>{request.message || 'Emergency access requested.'}</Text>
        <Text style={[styles.statusText, { color }]}>{request.status} · requested {formatDate(request.requestedAt)}</Text>
        {canAct && (
          <View style={styles.requestActions}>
            <TouchableOpacity style={styles.approveMini} onPress={onApprove} disabled={working}>
              {working ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.approveMiniText}>Approve</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.denyMini} onPress={onDeny} disabled={working}>
              <Text style={styles.denyMiniText}>Deny</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

function SentRequestRow({ request, index, total, C, styles }: any) {
  const color = statusColor(request.status, C);
  const canOpenVault = request.status === 'AVAILABLE' || request.status === 'APPROVED';

  return (
    <View style={[styles.requestRow, index !== total - 1 && styles.divider]}>
      <View style={styles.smallIcon}><Ionicons name="send-outline" size={17} color={color} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{request.ownerEmail}</Text>
        <Text style={styles.rowSub}>Status: {request.status}</Text>
        <Text style={styles.timeText}>Requested {formatDate(request.requestedAt)}</Text>

        {canOpenVault ? (
          <TouchableOpacity
            style={styles.openVaultButton}
            activeOpacity={0.85}
            onPress={() => router.push({
              pathname: '/emergencyvault',
              params: {
                requestId: String(request.id),
                ownerName: request.ownerName || request.ownerEmail,
                ownerEmail: request.ownerEmail,
              },
            })}
          >
            <Ionicons name="lock-open-outline" size={16} color="#fff" />
            <Text style={styles.openVaultButtonText}>Open emergency vault</Text>
          </TouchableOpacity>
        ) : request.status === 'PENDING' ? (
          <Text style={styles.waitingText}>Waiting for the vault owner to approve or deny this request.</Text>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  skeletonBlock: {
    backgroundColor: C.backgroundSelected,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  skeletonTitle: { width: 230, height: 30, marginBottom: 10 },
  skeletonSubtitle: { width: '86%', height: 13, marginBottom: 18 },
  skeletonHeroIcon: {
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
    shadowOffset: { width: 0, height: 6 },
 width: 56, height: 56, borderRadius: 18 },
  skeletonHeroTitle: { width: '70%', height: 17, marginBottom: 9 },
  skeletonHeroSub: { width: '50%', height: 12 },
  skeletonActionShell: {
    flex: 1,
    height: 50,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  skeletonActionButton: {
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 10,
    shadowOffset: { width: 0, height: 11 },
 width: '100%', height: 50, borderRadius: 999 },
  skeletonSectionHeader: { width: 190, height: 18, marginTop: 10, marginBottom: 10 },
  skeletonSmallIcon: {
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
    shadowOffset: { width: 0, height: 6 },
 width: 38, height: 38, borderRadius: 14 },
  skeletonRowTitle: { width: '66%', height: 14, marginBottom: 8 },
  skeletonRowSub: { width: '86%', height: 11 },
  safeArea: { flex: 1, backgroundColor: C.background },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: C.textSecondary, marginTop: 12, fontSize: 15, fontWeight: '700' },
  content: { paddingHorizontal: 18, paddingTop: 96, paddingBottom: 130 },
  eyebrow: { color: C.textSecondary, fontSize: 13, fontWeight: '800' },
  title: { color: C.text, fontSize: 30, fontWeight: '900', marginTop: 2 },
  subtitle: { color: C.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  heroCardShell: {
    borderRadius: 24,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  heroCard: {
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 26,
    elevation: 12,
    shadowOffset: { width: 0, height: 14 },

    backgroundColor: C.backgroundElement,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.actionCard,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  heroTitle: { color: C.text, fontSize: 17, fontWeight: '900' },
  heroSub: { color: C.textSecondary, fontSize: 13, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actionButton: {
    flex: 1,
    backgroundColor: C.backgroundbutton,
    borderRadius: 999,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: C.primary,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 11 },
    elevation: 10,
  },
  disabledAction: { opacity: 0.55 },
  actionButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  secondaryAction: {
    flex: 1,
    backgroundColor: C.actionCard,
    borderRadius: 999,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  secondaryActionText: { color: C.primary, fontSize: 14, fontWeight: '900' },
  safetyCheckCardShell: {
    borderRadius: 20,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  safetyCheckCard: {
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    elevation: 10,
    shadowOffset: { width: 0, height: 12 },

    minHeight: 92,
    backgroundColor: C.backgroundElement,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: `${C.primary}42`,
    paddingHorizontal: 15,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  safetyCheckIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: C.actionCard,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  safetyCheckTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  safetyCheckTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '900',
  },
  safetyCheckSub: {
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  newBadge: {
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
    shadowOffset: { width: 0, height: 6 },

    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: `${C.primary}18`,
    borderWidth: 1,
    borderColor: `${C.primary}42`,
  },
  newBadgeText: {
    color: C.primary,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  upgradeCard: {
    backgroundColor: C.securityScoreBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.warning,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  upgradeText: { color: C.warning, flex: 1, fontSize: 13, fontWeight: '800', lineHeight: 18 },
  cardShell: {
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    elevation: 10,
    shadowOffset: { width: 0, height: 12 },

    backgroundColor: C.backgroundElement,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  requestRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 15 },
  auditRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 15 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.border },
  avatar: {
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
    shadowOffset: { width: 0, height: 6 },
 width: 42, height: 42, borderRadius: 21, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  smallIcon: {
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
    shadowOffset: { width: 0, height: 6 },
 width: 38, height: 38, borderRadius: 19, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '900' },
  rowSub: { color: C.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  timeText: { color: C.tabInactive, fontSize: 11, marginTop: 5, fontWeight: '700' },
  statusText: { fontSize: 12, marginTop: 6, fontWeight: '900' },
  requestActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  approveMini: { backgroundColor: C.primary, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, minWidth: 78, alignItems: 'center' },
  approveMiniText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  denyMini: { backgroundColor: C.alertDangerBg, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  denyMiniText: { color: C.danger, fontWeight: '900', fontSize: 12 },
  openVaultButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: C.primary,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    shadowColor: C.primary,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 11 },
    elevation: 10,
  },
  openVaultButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  waitingText: { color: C.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 8, fontWeight: '700' },
});