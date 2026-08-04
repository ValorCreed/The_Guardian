import React, { useCallback, useMemo, useState } from 'react';
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
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import {
  api,
  ContinuityCheck,
  ContinuityDrill,
  ContinuityIncomingRequest,
  ContinuityOverview,
} from '../services/api';
import {
  isScreenRequestCancelled,
  useCancelableApi,
} from '../hooks/useCancelableApi';
import PulsingSkeleton from '../components/PulsingSkeleton';
import {
  hapticDelete,
  hapticLight,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from '../utils/haptics';
import { useScreenAlert } from '../hooks/useScreenAlert';

const formatDate = (value?: string | null) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statusIcon = (status: ContinuityCheck['status']) =>
  status === 'PASS'
    ? 'checkmark-circle-outline'
    : status === 'WARN'
      ? 'warning-outline'
      : 'close-circle-outline';

export default function ContinuityDrillScreen() {
  const screenAlert = useScreenAlert();

  const params = useLocalSearchParams<{ tab?: 'requests' | 'mine' }>();
  const requestApi = useCancelableApi(api);
  const { isDark, colors: C } = useAppTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [overview, setOverview] = useState<ContinuityOverview | null>(null);
  const [tab, setTab] = useState<'MINE' | 'REQUESTS'>(
    params.tab === 'requests' ? 'REQUESTS' : 'MINE'
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState<string | number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(
    async (showLoader = false) => {
      let cancelled = false;
      try {
        if (showLoader) setLoading(true);
        setLoadError(null);
        const response = await requestApi.getContinuityOverview();
        setOverview(response);
      } catch (error: any) {
        if (isScreenRequestCancelled(error)) {
          cancelled = true;
          return;
        }
        setLoadError(error?.message || 'Could not load Continuity Drill.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [requestApi]
  );

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load])
  );

  const startDrill = () => {
    hapticWarning();
    screenAlert(
      'Start a Continuity Drill?',
      'Guardian sends test notices only. No vault data is released.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Start drill',
          onPress: async () => {
            let cancelled = false;
            try {
              setWorking('start');
              await requestApi.startContinuityDrill();
              hapticSuccess();
              await load(false);
            } catch (error: any) {
              if (isScreenRequestCancelled(error)) {
                cancelled = true;
                return;
              }
              hapticWarning();
              screenAlert('Could not start drill', error?.message || 'Please try again.');
            } finally {
              if (!cancelled) setWorking(null);
            }
          },
        },
      ]
    );
  };

  const completeDrill = (drill: ContinuityDrill) => {
    hapticLight();
    screenAlert(
      'Finish this drill?',
      'Guardian saves the current score and marks unanswered notices as failed.',
      [
        { text: 'Keep running', style: 'cancel' },
        {
          text: 'Finish drill',
          onPress: async () => {
            let cancelled = false;
            try {
              setWorking(drill.id);
              await requestApi.completeContinuityDrill(drill.id);
              hapticSuccess();
              await load(false);
            } catch (error: any) {
              if (isScreenRequestCancelled(error)) {
                cancelled = true;
                return;
              }
              hapticWarning();
              screenAlert('Could not finish drill', error?.message || 'Please try again.');
            } finally {
              if (!cancelled) setWorking(null);
            }
          },
        },
      ]
    );
  };

  const cancelDrill = (drill: ContinuityDrill) => {
    hapticDelete();
    screenAlert(
      'Cancel this drill?',
      'The test notices will close. No vault data was released.',
      [
        { text: 'Keep drill', style: 'cancel' },
        {
          text: 'Cancel drill',
          style: 'destructive',
          onPress: async () => {
            let cancelled = false;
            try {
              setWorking(`cancel-${drill.id}`);
              await requestApi.cancelContinuityDrill(drill.id);
              hapticSuccess();
              await load(false);
            } catch (error: any) {
              if (isScreenRequestCancelled(error)) {
                cancelled = true;
                return;
              }
              hapticWarning();
              screenAlert('Could not cancel drill', error?.message || 'Please try again.');
            } finally {
              if (!cancelled) setWorking(null);
            }
          },
        },
      ]
    );
  };

  const acknowledge = async (request: ContinuityIncomingRequest) => {
    let cancelled = false;
    try {
      setWorking(request.publicId);
      await requestApi.acknowledgeContinuityDrill(request.publicId);
      hapticSuccess();
      screenAlert(
        'Notice acknowledged',
        'Guardian recorded only that the simulated notice reached you. No vault secret was opened or released.'
      );
      await load(false);
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return;
      }
      hapticWarning();
      screenAlert('Could not acknowledge drill', error?.message || 'Please try again.');
    } finally {
      if (!cancelled) setWorking(null);
    }
  };

  if (loading) {
    return <ContinuitySkeleton C={C} isDark={isDark} styles={styles} />;
  }

  if (!overview && loadError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Guardian Continuity Drill</Text>
          <Text style={styles.subtitle}>Test your recovery plan safely.</Text>
          <View style={styles.errorShell}>
            <View style={styles.errorCard}>
              <Ionicons name="cloud-offline-outline" size={34} color={C.warning} />
              <Text style={styles.errorTitle}>Drill unavailable</Text>
              <Text style={styles.errorText}>{loadError}</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => void load(true)}>
                <Ionicons name="refresh-outline" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Try again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const active = overview?.activeDrill || null;
  const requests = overview?.receivedRequests || [];
  const planUnavailable = overview?.plan === 'UNKNOWN';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={C.primary}
            colors={[C.primary]}
            onRefresh={() => {
              setRefreshing(true);
              void load(false);
            }}
          />
        }
      >
        <Text style={styles.title}>Guardian Continuity Drill</Text>
        <Text style={styles.subtitle}>
          Check that contacts and recovery tools still work.
        </Text>

        <View style={styles.heroShell}>
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Ionicons name="shield-checkmark-outline" size={29} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroEyebrow}>CONTINUITY READINESS</Text>
              <Text style={styles.heroTitle}>
                {active ? `${active.score}/100 live score` : 'Safe recovery rehearsal'}
              </Text>
              <Text style={styles.heroText}>{overview?.message}</Text>
            </View>
          </View>
        </View>

        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabButton, tab === 'MINE' && styles.tabButtonActive]}
            onPress={() => {
              hapticSelection();
              setTab('MINE');
            }}
          >
            <Ionicons name="analytics-outline" size={18} color={tab === 'MINE' ? '#fff' : C.textSecondary} />
            <Text style={[styles.tabText, tab === 'MINE' && styles.tabTextActive]}>My drill</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, tab === 'REQUESTS' && styles.tabButtonActive]}
            onPress={() => {
              hapticSelection();
              setTab('REQUESTS');
            }}
          >
            <Ionicons name="mail-unread-outline" size={18} color={tab === 'REQUESTS' ? '#fff' : C.textSecondary} />
            <Text style={[styles.tabText, tab === 'REQUESTS' && styles.tabTextActive]}>
              Requests ({requests.filter((item) => item.canAcknowledge).length})
            </Text>
          </TouchableOpacity>
        </View>

        {tab === 'MINE' ? (
          <>
            {!overview?.eligible && !active && (
              <TouchableOpacity
                style={styles.planNotice}
                activeOpacity={0.84}
                onPress={() =>
                  planUnavailable
                    ? void load(true)
                    : router.push('/subscription?from=continuitydrill')
                }
              >
                <Ionicons
                  name={planUnavailable ? 'cloud-offline-outline' : 'people-circle-outline'}
                  size={22}
                  color={C.warning}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.noticeTitle}>
                    {planUnavailable ? 'Plan verification unavailable' : 'Family plan feature'}
                  </Text>
                  <Text style={styles.noticeText}>
                    {planUnavailable
                      ? 'Guardian could not verify your plan. Existing reports and received requests remain available.'
                      : 'Continuity Drill coordinates several trusted people, so starting drills is reserved for the Family plan.'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
              </TouchableOpacity>
            )}

            {overview?.canRun && !active && (
              <TouchableOpacity
                style={[styles.primaryButton, working === 'start' && styles.disabled]}
                disabled={working === 'start'}
                onPress={startDrill}
              >
                {working === 'start' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="play-circle-outline" size={20} color="#fff" />
                )}
                <Text style={styles.primaryButtonText}>
                  {working === 'start' ? 'Starting safe drill...' : 'Start a 48-hour drill'}
                </Text>
              </TouchableOpacity>
            )}

            {active ? (
              <DrillReport
                drill={active}
                C={C}
                styles={styles}
                working={working}
                active
                onComplete={() => completeDrill(active)}
                onCancel={() => cancelDrill(active)}
              />
            ) : (
              <EmptyState
                icon="shield-checkmark-outline"
                title="No active drill"
                text="A drill checks your recovery tools and trusted contacts."
                C={C}
                styles={styles}
              />
            )}

            <SectionHeader title="Previous reports" count={(overview?.history || []).filter((item) => item.status !== 'RUNNING').length} styles={styles} />
            {(overview?.history || []).filter((item) => item.status !== 'RUNNING').length ? (
              (overview?.history || [])
                .filter((item) => item.status !== 'RUNNING')
                .map((drill) => (
                  <DrillReport
                    key={drill.id}
                    drill={drill}
                    C={C}
                    styles={styles}
                    working={working}
                    active={false}
                    onComplete={() => undefined}
                    onCancel={() => undefined}
                  />
                ))
            ) : (
              <EmptyState
                icon="document-text-outline"
                title="No completed report"
                text="Completed drills appear here."
                C={C}
                styles={styles}
              />
            )}
          </>
        ) : requests.length ? (
          requests.map((request) => (
            <RequestCard
              key={request.publicId}
              request={request}
              C={C}
              styles={styles}
              working={working === request.publicId}
              onAcknowledge={() => void acknowledge(request)}
            />
          ))
        ) : (
          <EmptyState
            icon="mail-open-outline"
            title="No drill requests"
            text="Trusted-contact test notices appear here."
            C={C}
            styles={styles}
          />
        )}

        <View style={styles.truthCard}>
          <Ionicons name="lock-closed-outline" size={21} color={C.primary} />
          <Text style={styles.truthText}>
            A drill records readiness and contact acknowledgements only. It never releases secrets.
          </Text>
        </View>
        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function DrillReport({ drill, C, styles, working, active, onComplete, onCancel }: any) {
  return (
    <View style={styles.reportShell}>
      <View style={styles.reportCard}>
        <View style={styles.reportHeader}>
          <View style={[styles.scoreRing, { borderColor: drill.score >= 80 ? C.success : drill.score >= 50 ? C.warning : C.danger }]}>
            <Text style={styles.scoreValue}>{drill.score}</Text>
            <Text style={styles.scoreTotal}>/100</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reportTitle}>{active ? 'Live drill' : `${drill.status} report`}</Text>
            <Text style={styles.reportSub}>
              {drill.acknowledgedCount}/{drill.participantCount} contacts acknowledged · expires {formatDate(drill.expiresAt)}
            </Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{drill.status}</Text>
          </View>
        </View>

        <Text style={styles.label}>READINESS CHECKS</Text>
        {drill.checks.map((check: ContinuityCheck, index: number) => (
          <TouchableOpacity
            key={check.code}
            style={[styles.checkRow, index !== drill.checks.length - 1 && styles.divider]}
            activeOpacity={check.actionRoute ? 0.78 : 1}
            onPress={() => {
              if (check.actionRoute) router.push(check.actionRoute as any);
            }}
          >
            <View style={styles.checkIcon}>
              <Ionicons
                name={statusIcon(check.status) as any}
                size={21}
                color={check.status === 'PASS' ? C.success : check.status === 'WARN' ? C.warning : C.danger}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.checkTitle}>{check.title}</Text>
              <Text style={styles.checkDetail}>{check.detail}</Text>
            </View>
            <Text style={styles.points}>{check.earnedPoints}/{check.weight}</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>TRUSTED CONTACTS</Text>
        {drill.participants.map((participant: any, index: number) => (
          <View
            key={`${participant.userId ?? participant.email}-${index}`}
            style={[styles.personRow, index !== drill.participants.length - 1 && styles.divider]}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{String(participant.name || participant.email).slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.personName}>{participant.name}</Text>
              <Text style={styles.personSub}>
                {participant.roles}
                {!participant.eligible ? ' · no longer eligible' : ''}
              </Text>
            </View>
            <Ionicons
              name={
                !participant.eligible
                  ? 'close-circle-outline'
                  : participant.status === 'ACKNOWLEDGED'
                    ? 'checkmark-circle'
                    : 'time-outline'
              }
              size={21}
              color={
                !participant.eligible
                  ? C.danger
                  : participant.status === 'ACKNOWLEDGED'
                    ? C.success
                    : C.warning
              }
            />
          </View>
        ))}

        {active && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              disabled={working === drill.id}
              onPress={onComplete}
            >
              {working === drill.id ? <ActivityIndicator size="small" color={C.primary} /> : <Ionicons name="checkmark-done-outline" size={18} color={C.primary} />}
              <Text style={styles.secondaryButtonText}>Finish report</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dangerButton}
              disabled={working === `cancel-${drill.id}`}
              onPress={onCancel}
            >
              {working === `cancel-${drill.id}` ? <ActivityIndicator size="small" color={C.danger} /> : <Ionicons name="close-circle-outline" size={18} color={C.danger} />}
              <Text style={styles.dangerButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

function RequestCard({ request, C, styles, working, onAcknowledge }: any) {
  return (
    <View style={styles.reportShell}>
      <View style={styles.reportCard}>
        <View style={styles.reportHeader}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarText}>{String(request.ownerName || request.ownerEmail).slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reportTitle}>{request.ownerName}</Text>
            <Text style={styles.reportSub}>{request.ownerEmail}</Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{request.status}</Text>
          </View>
        </View>
        <View style={styles.infoStrip}>
          <Ionicons name="information-circle-outline" size={19} color={C.primary} />
          <Text style={styles.infoText}>
            This is a simulated reachability check for your role as {request.roles}. No vault information was shared.
          </Text>
        </View>
        <Text style={styles.requestMeta}>Respond before {formatDate(request.expiresAt)}</Text>
        {request.canAcknowledge && (
          <TouchableOpacity
            style={[styles.primaryButton, working && styles.disabled]}
            disabled={working}
            onPress={onAcknowledge}
          >
            {working ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />}
            <Text style={styles.primaryButtonText}>{working ? 'Acknowledging...' : 'I received this drill notice'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function SectionHeader({ title, count, styles }: any) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.countBadge}><Text style={styles.countText}>{count}</Text></View>
    </View>
  );
}

function EmptyState({ icon, title, text, C, styles }: any) {
  return (
    <View style={styles.emptyShell}>
      <View style={styles.emptyCard}>
        <View style={styles.emptyIcon}><Ionicons name={icon} size={28} color={C.primary} /></View>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyText}>{text}</Text>
      </View>
    </View>
  );
}

function ContinuitySkeleton({ isDark, styles }: any) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.content}>
        <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
        <PulsingSkeleton styles={styles} style={styles.skeletonSub} />
        <View style={styles.skeletonShell}>
          <View style={styles.skeletonHero}>
            <PulsingSkeleton styles={styles} style={styles.skeletonIcon} />
            <View style={{ flex: 1 }}>
              <PulsingSkeleton styles={styles} style={styles.skeletonLineLarge} />
              <PulsingSkeleton styles={styles} style={styles.skeletonLine} />
              <PulsingSkeleton styles={styles} style={styles.skeletonLineShort} />
            </View>
          </View>
        </View>
        <PulsingSkeleton styles={styles} style={styles.skeletonTabs} />
        {[0, 1, 2].map((value) => (
          <View key={value} style={styles.skeletonShell}>
            <View style={styles.skeletonCard}>
              <PulsingSkeleton styles={styles} style={styles.skeletonRowIcon} />
              <View style={{ flex: 1 }}>
                <PulsingSkeleton styles={styles} style={styles.skeletonLineLarge} />
                <PulsingSkeleton styles={styles} style={styles.skeletonLine} />
                <PulsingSkeleton styles={styles} style={styles.skeletonLineShort} />
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 18, paddingTop: 92, paddingBottom: 40 },
  skeletonBlock: { backgroundColor: C.backgroundSelected, borderRadius: 999 },
  skeletonTitle: { width: '84%', height: 34, marginBottom: 12 },
  skeletonSub: { width: '96%', height: 54, borderRadius: 16, marginBottom: 20 },
  skeletonShell: { borderRadius: 27, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.11, shadowRadius: 19, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  skeletonHero: { minHeight: 158, borderRadius: 27, padding: 18, flexDirection: 'row', gap: 14, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border },
  skeletonCard: { minHeight: 145, borderRadius: 25, padding: 17, flexDirection: 'row', gap: 13, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border },
  skeletonIcon: { width: 58, height: 58, borderRadius: 20 },
  skeletonRowIcon: { width: 48, height: 48, borderRadius: 17 },
  skeletonLineLarge: { width: '80%', height: 18, marginBottom: 12 },
  skeletonLine: { width: '92%', height: 13, marginBottom: 10 },
  skeletonLineShort: { width: '58%', height: 13 },
  skeletonTabs: { width: '100%', height: 48, borderRadius: 18, marginBottom: 20 },
  title: { color: C.text, fontSize: 32, fontWeight: '900', letterSpacing: -0.7 },
  subtitle: { color: C.textSecondary, fontSize: 16, lineHeight: 24, marginTop: 8, marginBottom: 20 },
  heroShell: { borderRadius: 28, marginBottom: 18, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 13 }, elevation: 8 },
  heroCard: { borderRadius: 28, padding: 19, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border, flexDirection: 'row', gap: 14, alignItems: 'center' },
  heroIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: C.backgroundbutton, alignItems: 'center', justifyContent: 'center', shadowColor: C.primary, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  heroEyebrow: { color: C.textSecondary, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: C.text, fontSize: 19, fontWeight: '900', marginTop: 4 },
  heroText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 6 },
  tabBar: { flexDirection: 'row', padding: 4, borderRadius: 18, backgroundColor: C.backgroundSelected, borderWidth: 1, borderColor: C.border, marginBottom: 20 },
  tabButton: { flex: 1, minHeight: 44, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  tabButtonActive: { backgroundColor: C.primary },
  tabText: { color: C.textSecondary, fontSize: 12, fontWeight: '900' },
  tabTextActive: { color: '#fff' },
  planNotice: { borderRadius: 20, padding: 15, marginBottom: 18, backgroundColor: `${C.warning}12`, borderWidth: 1, borderColor: `${C.warning}38`, flexDirection: 'row', alignItems: 'center', gap: 11 },
  noticeTitle: { color: C.text, fontSize: 14, fontWeight: '900' },
  noticeText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 4 },
  primaryButton: { minHeight: 54, borderRadius: 999, paddingHorizontal: 18, backgroundColor: C.backgroundbutton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 18, shadowColor: C.primary, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  reportShell: { borderRadius: 26, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 5 },
  reportCard: { borderRadius: 26, padding: 16, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border },
  reportHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: C.backgroundSelected },
  scoreValue: { color: C.text, fontSize: 19, fontWeight: '900' },
  scoreTotal: { color: C.textSecondary, fontSize: 8, fontWeight: '800' },
  reportTitle: { color: C.text, fontSize: 17, fontWeight: '900' },
  reportSub: { color: C.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 4 },
  statusBadge: { minHeight: 29, borderRadius: 999, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: C.actionCard, borderWidth: 1, borderColor: `${C.primary}35` },
  statusText: { color: C.primary, fontSize: 9, fontWeight: '900' },
  label: { color: C.textSecondary, fontSize: 10, fontWeight: '900', letterSpacing: 1.0, marginTop: 17, marginBottom: 7 },
  checkRow: { paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  checkIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.backgroundSelected },
  checkTitle: { color: C.text, fontSize: 13, fontWeight: '900' },
  checkDetail: { color: C.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 },
  points: { color: C.text, fontSize: 11, fontWeight: '900' },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  personRow: { paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.actionCard },
  avatarLarge: { width: 50, height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.actionCard },
  avatarText: { color: C.primary, fontSize: 16, fontWeight: '900' },
  personName: { color: C.text, fontSize: 13, fontWeight: '900' },
  personSub: { color: C.textSecondary, fontSize: 10, marginTop: 3 },
  actionRow: { flexDirection: 'row', gap: 9, marginTop: 16 },
  secondaryButton: { flex: 1, minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: `${C.primary}40`, backgroundColor: C.actionCard, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryButtonText: { color: C.primary, fontSize: 12, fontWeight: '900' },
  dangerButton: { minWidth: 105, minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: `${C.danger}35`, backgroundColor: `${C.danger}10`, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  dangerButtonText: { color: C.danger, fontSize: 12, fontWeight: '900' },
  infoStrip: { marginTop: 15, borderRadius: 17, padding: 12, backgroundColor: C.actionCard, borderWidth: 1, borderColor: `${C.primary}30`, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  infoText: { color: C.text, fontSize: 12, lineHeight: 18, flex: 1 },
  requestMeta: { color: C.textSecondary, fontSize: 11, marginTop: 12, marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 10 },
  sectionTitle: { color: C.text, fontSize: 18, fontWeight: '900' },
  countBadge: { minWidth: 30, height: 28, borderRadius: 14, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: C.actionCard },
  countText: { color: C.primary, fontSize: 12, fontWeight: '900' },
  emptyShell: { borderRadius: 24, marginBottom: 18, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  emptyCard: { borderRadius: 24, padding: 20, alignItems: 'center', backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.actionCard, marginBottom: 12 },
  emptyTitle: { color: C.text, fontSize: 17, fontWeight: '900' },
  emptyText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 6 },
  truthCard: { borderRadius: 18, padding: 14, backgroundColor: C.actionCard, borderWidth: 1, borderColor: `${C.primary}28`, flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8 },
  truthText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, flex: 1 },
  errorShell: { borderRadius: 28, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  errorCard: { borderRadius: 28, padding: 22, alignItems: 'center', backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border },
  errorTitle: { color: C.text, fontSize: 21, fontWeight: '900', marginTop: 13 },
  errorText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7, marginBottom: 18 },
});