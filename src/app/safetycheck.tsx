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
import { router, useFocusEffect } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import {
  api,
  GuardianSafetyCheckContact,
  GuardianSafetyCheckResponse,
} from '../services/api';
import {
  isScreenRequestCancelled,
  useCancelableApi,
} from '../hooks/useCancelableApi';
import PulsingSkeleton from '../components/PulsingSkeleton';
import {
  hapticLight,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from '../utils/haptics';
import { useScreenAlert } from '../hooks/useScreenAlert';

const INTERVAL_OPTIONS = [1, 3, 7, 14, 30] as const;
const GRACE_OPTIONS = [12, 24, 48, 72] as const;

const formatDate = (value?: string | null) => {
  if (!value) return 'Not scheduled';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatGrace = (hours: number) =>
  hours === 24
    ? '24 hours'
    : hours === 48
      ? '2 days'
      : hours === 72
        ? '3 days'
        : `${hours} hours`;

export default function SafetyCheckScreen() {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const { colors: C, isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [data, setData] = useState<GuardianSafetyCheckResponse | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [contactId, setContactId] = useState<number | null>(null);
  const [intervalDays, setIntervalDays] = useState(7);
  const [gracePeriodHours, setGracePeriodHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const applyResponse = useCallback((response: GuardianSafetyCheckResponse) => {
    setData(response);
    setEnabled(response.enabled);
    setContactId(response.contactId ?? null);
    setIntervalDays(response.intervalDays || 7);
    setGracePeriodHours(response.gracePeriodHours || 24);
  }, []);

  const load = useCallback(async (showLoader = false) => {
    let cancelled = false;

    try {
      if (showLoader) setLoading(true);
      setLoadError(null);
      const response = await requestApi.getGuardianSafetyCheck();
      applyResponse(response);
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return;
      }

      const message = error?.message || 'Please try again.';
      setLoadError(message);
      screenAlert('Could not load Safety Check', message);
    } finally {
      if (!cancelled) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [applyResponse, requestApi, screenAlert]);

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load])
  );

  const contacts = data?.contacts || [];
  const eligibleContacts = contacts.filter(
    (contact) => contact.registered && contact.active && contact.hasSharedItems
  );
  const selectedContact = contacts.find((contact) => contact.id === contactId);
  const canCheckIn =
    data?.configured &&
    data.enabled &&
    (data.status === 'ACTIVE' || data.status === 'GRACE');
  const canConfigure = Boolean(data?.canConfigure);
  const planUnavailable = data?.plan === 'UNKNOWN';
  const settingsLocked = enabled && !canConfigure;

  const selectContact = (contact: GuardianSafetyCheckContact) => {
    if (!canConfigure) {
      hapticWarning();
      screenAlert(
        planUnavailable ? 'Plan verification unavailable' : 'Premium or Family required',
        planUnavailable
          ? 'Guardian could not verify your plan. Your active cycle can still be checked in or disabled, but settings cannot be changed until verification succeeds.'
          : 'Your active cycle can still be checked in or disabled, but changing its contact or timing requires an eligible plan.'
      );
      return;
    }

    if (!contact.active) {
      hapticWarning();
      screenAlert(
        'Contact is inactive',
        'Activate this emergency contact before selecting them.'
      );
      return;
    }

    if (!contact.registered) {
      hapticWarning();
      screenAlert(
        'Guardian account required',
        'Automatic release requires the contact to have a Guardian account.'
      );
      return;
    }

    if (!contact.hasSharedItems) {
      hapticWarning();
      screenAlert(
        'No release scope configured',
        'Allow an emergency vault category or create an active Safety Check estate playbook for this contact.'
      );
      return;
    }

    hapticSelection();
    setContactId(contact.id);
  };

  const save = async () => {
    let cancelled = false;
    if (enabled && !canConfigure) {
      hapticWarning();
      screenAlert(
        'Settings are locked',
        planUnavailable
          ? 'Guardian could not verify your plan. You can still check in or disable this active cycle.'
          : 'You can still check in or disable this active cycle. Upgrade to Premium or Family to change or restart it.'
      );
      return;
    }

    if (enabled && !contactId) {
      screenAlert(
        'Choose a release contact',
        'Select an eligible emergency contact before enabling Safety Check.'
      );
      return;
    }

    try {
      setSaving(true);
      const response = await requestApi.updateGuardianSafetyCheck({
        enabled,
        contactId,
        intervalDays,
        gracePeriodHours,
      });
      applyResponse(response);
      hapticSuccess();
      screenAlert(
        enabled ? 'Safety Check active' : 'Safety Check disabled',
        response.message
      );
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return;
      }
      hapticWarning();
      screenAlert(
        'Could not update Safety Check',
        error?.message || 'Please try again.'
      );
    } finally {
      if (!cancelled) setSaving(false);
    }
  };

  const checkIn = async () => {
    let cancelled = false;

    try {
      setCheckingIn(true);
      const response = await requestApi.completeGuardianSafetyCheck();
      applyResponse(response);
      hapticSuccess();
      screenAlert('Check-in complete', response.message);
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return;
      }
      hapticWarning();
      screenAlert(
        'Could not complete check-in',
        error?.message || 'Please try again.'
      );
    } finally {
      if (!cancelled) setCheckingIn(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={C.background}
        />
        <SafetyCheckSkeleton styles={styles} />
      </SafeAreaView>
    );
  }

  if (!data && loadError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={C.background}
        />

        <ScrollView contentContainerStyle={styles.content}>
          <Header styles={styles} />

          <View style={styles.lockedCardShell}>
            <View style={styles.lockedCard}>
              <View style={styles.lockIcon}>
                <Ionicons name="cloud-offline-outline" size={32} color={C.warning} />
              </View>
              <Text style={styles.lockedTitle}>Safety Check unavailable</Text>
              <Text style={styles.lockedText}>{loadError}</Text>

              <TouchableOpacity
                style={styles.primaryButton}
                activeOpacity={0.85}
                onPress={() => void load(true)}
              >
                <Ionicons name="refresh-outline" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Try again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (data && !data.eligible) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={C.background}
        />

        <ScrollView contentContainerStyle={styles.content}>
          <Header styles={styles} />

          <View style={styles.lockedCardShell}>
            <View style={styles.lockedCard}>
              <View style={styles.lockIcon}>
                <Ionicons
                  name={planUnavailable ? 'cloud-offline-outline' : 'pulse-outline'}
                  size={32}
                  color={planUnavailable ? C.warning : C.primary}
                />
              </View>
              <Text style={styles.lockedTitle}>
                {planUnavailable ? 'Could not verify your plan' : 'Guardian Safety Check'}
              </Text>
              <Text style={styles.lockedText}>
                {planUnavailable
                  ? 'Plan verification is temporarily unavailable. No Safety Check settings were changed.'
                  : 'Scheduled check-ins are available on Premium and Family.'}
              </Text>

              <TouchableOpacity
                style={styles.primaryButton}
                activeOpacity={0.85}
                onPress={() =>
                  planUnavailable
                    ? void load(true)
                    : router.push('/subscription?from=safetycheck')
                }
              >
                <Ionicons
                  name={planUnavailable ? 'refresh-outline' : 'diamond-outline'}
                  size={18}
                  color="#fff"
                />
                <Text style={styles.primaryButtonText}>
                  {planUnavailable ? 'Try again' : 'View plans'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={C.background}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(false);
            }}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        }
      >
        <Header styles={styles} />

        <View style={styles.heroShell}>
          <View style={styles.hero}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroIcon}>
                <Ionicons name="pulse" size={28} color="#fff" />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.heroEyebrow}>CURRENT STATUS</Text>
                <Text style={styles.heroTitle}>
                  {data?.status === 'GRACE'
                    ? 'Check in now'
                    : data?.status === 'TRIGGERED'
                      ? 'Access released'
                      : data?.enabled
                        ? 'Protection active'
                        : 'Protection off'}
                </Text>
              </View>

              <StatusBadge status={data?.status || 'DISABLED'} C={C} styles={styles} />
            </View>

            <Text style={styles.heroText}>{data?.message}</Text>

            {data?.status === 'GRACE' && (
              <View style={styles.warningStrip}>
                <Ionicons name="warning-outline" size={18} color={C.warning} />
                <Text style={styles.warningText}>
                  The grace period began {formatDate(data.graceStartedAt)}.
                </Text>
              </View>
            )}

            {data?.status === 'TRIGGERED' && (
              <View style={styles.dangerStrip}>
                <Ionicons name="lock-open-outline" size={18} color={C.danger} />
                <Text style={styles.dangerText}>
                  Released {formatDate(data.triggeredAt)} to {data.contactEmail}.
                </Text>
              </View>
            )}

            {canCheckIn && (
              <TouchableOpacity
                style={styles.checkInButton}
                activeOpacity={0.86}
                disabled={checkingIn}
                onPress={checkIn}
              >
                {checkingIn ? (
                  <ActivityIndicator size="small" color={C.primary} />
                ) : (
                  <Ionicons name="checkmark-circle" size={20} color={C.primary} />
                )}
                <Text style={styles.checkInButtonText}>
                  {checkingIn ? 'Checking in...' : 'I am safe — check in'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {data?.configured && data.enabled && !canConfigure && (
          <View style={styles.planNotice}>
            <Ionicons name="information-circle-outline" size={20} color={C.warning} />
            <Text style={styles.planNoticeText}>
              {planUnavailable
                ? 'Plan verification is temporarily unavailable. This active cycle remains available for check-in or disabling.'
                : 'This active cycle remains available for check-in or disabling. An eligible Premium or Family plan is required to change its settings or start another cycle.'}
            </Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Automatic protection</Text>
            <Text style={styles.sectionSub}>
              Turn scheduled check-ins on or off.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.toggle, enabled && styles.toggleActive]}
            activeOpacity={0.8}
            onPress={() => {
              hapticLight();

              if (!enabled && !canConfigure) {
                hapticWarning();
                screenAlert(
                  planUnavailable
                    ? 'Plan verification unavailable'
                    : 'Premium or Family required',
                  planUnavailable
                    ? 'Try again after Guardian can verify your plan.'
                    : 'Upgrade to start a Guardian Safety Check cycle.'
                );
                return;
              }

              setEnabled((current) => !current);
            }}
          >
            <View
              style={[
                styles.toggleKnob,
                enabled && styles.toggleKnobActive,
              ]}
            />
          </TouchableOpacity>
        </View>

        {enabled && (
          <>
            <Text style={styles.label}>RELEASE CONTACT</Text>

            {contacts.length === 0 ? (
              <TouchableOpacity
                style={[
                  styles.emptyContactCard,
                  !canConfigure && styles.controlDisabled,
                ]}
                activeOpacity={0.82}
                disabled={!canConfigure}
                onPress={() => router.push('/addemergencycontact')}
              >
                <View style={styles.contactIcon}>
                  <Ionicons name="person-add-outline" size={20} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactTitle}>Add an emergency contact</Text>
                  <Text style={styles.contactSub}>
                    Choose a registered release contact.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
              </TouchableOpacity>
            ) : (
              <View style={styles.optionsShell}>
                <View style={styles.optionsCard}>
                  {contacts.map((contact, index) => {
                    const selected = contact.id === contactId;
                    const eligible =
                      contact.active && contact.registered && contact.hasSharedItems;

                    return (
                      <TouchableOpacity
                        key={contact.id}
                        style={[
                          styles.contactRow,
                          !canConfigure && styles.controlDisabled,
                          index !== contacts.length - 1 && styles.divider,
                        ]}
                        activeOpacity={0.75}
                        onPress={() => selectContact(contact)}
                      >
                        <View
                          style={[
                            styles.radio,
                            selected && styles.radioSelected,
                            !eligible && styles.radioDisabled,
                          ]}
                        >
                          {selected && (
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          )}
                        </View>

                        <View style={styles.contactAvatar}>
                          <Text style={styles.contactAvatarText}>
                            {(contact.name || contact.email)
                              .slice(0, 1)
                              .toUpperCase()}
                          </Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.contactTitle}>{contact.name}</Text>
                          <Text style={styles.contactSub}>{contact.email}</Text>
                          {!eligible && (
                            <Text style={styles.contactProblem}>
                              {!contact.active
                                ? 'Inactive contact'
                                : !contact.registered
                                  ? 'Guardian account required'
                                  : 'No release scope configured'}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {contacts.length > 0 && eligibleContacts.length === 0 && (
              <TouchableOpacity
                style={styles.fixContactCard}
                activeOpacity={0.82}
                onPress={() => router.push('/emergencyaccess')}
              >
                <Ionicons name="construct-outline" size={20} color={C.warning} />
                <Text style={styles.fixContactText}>
                  No contact is eligible. Activate one and assign approved release items.
                </Text>
              </TouchableOpacity>
            )}

            <Text style={styles.label}>CHECK-IN INTERVAL</Text>
            <View style={styles.chipRow}>
              {INTERVAL_OPTIONS.map((days) => (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.chip,
                    intervalDays === days && styles.chipSelected,
                    !canConfigure && styles.controlDisabled,
                  ]}
                  activeOpacity={0.8}
                  disabled={!canConfigure}
                  onPress={() => {
                    hapticSelection();
                    setIntervalDays(days);
                  }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      intervalDays === days && styles.chipTextSelected,
                    ]}
                  >
                    {days === 1 ? 'Daily' : `${days} days`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.helperText}>
              {/* Guardian will ask you to check in {formatInterval(intervalDays).toLowerCase()}. */}
            </Text>

            <Text style={styles.label}>GRACE PERIOD</Text>
            <View style={styles.chipRow}>
              {GRACE_OPTIONS.map((hours) => (
                <TouchableOpacity
                  key={hours}
                  style={[
                    styles.chip,
                    gracePeriodHours === hours && styles.chipSelected,
                    !canConfigure && styles.controlDisabled,
                  ]}
                  activeOpacity={0.8}
                  disabled={!canConfigure}
                  onPress={() => {
                    hapticSelection();
                    setGracePeriodHours(hours);
                  }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      gracePeriodHours === hours && styles.chipTextSelected,
                    ]}
                  >
                    {hours === 24
                      ? '1 day'
                      : hours === 48
                        ? '2 days'
                        : hours === 72
                          ? '3 days'
                          : '12 hrs'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.helperText}>
              After a missed check-in, you still have {formatGrace(gracePeriodHours)} to respond.
            </Text>
          </>
        )}

        <View style={styles.summaryShell}>
          <View style={styles.summaryCard}>
            <SummaryRow
              icon="calendar-outline"
              title="Next check-in"
              value={
                enabled
                  ? data?.status === 'ACTIVE'
                    ? formatDate(data.nextCheckInAt)
                    : 'Updates after saving'
                  : 'Disabled'
              }
              C={C}
              styles={styles}
            />
            <View style={styles.divider} />
            <SummaryRow
              icon="person-outline"
              title="Release contact"
              value={selectedContact?.email || 'Not selected'}
              C={C}
              styles={styles}
            />
            <View style={styles.divider} />
            <SummaryRow
              icon="shield-checkmark-outline"
              title="Release scope"
              value="Approved items only"
              C={C}
              styles={styles}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            saving && styles.buttonDisabled,
            enabled && !contactId && styles.buttonDisabled,
            settingsLocked && styles.buttonDisabled,
          ]}
          activeOpacity={0.86}
          disabled={saving || (enabled && !contactId) || settingsLocked}
          onPress={save}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons
              name={enabled ? 'shield-checkmark-outline' : 'power-outline'}
              size={19}
              color="#fff"
            />
          )}
          <Text style={styles.primaryButtonText}>
            {saving
              ? 'Saving...'
              : settingsLocked
                ? 'Upgrade to change settings'
                : enabled
                  ? data?.status === 'TRIGGERED'
                    ? 'Start a new Safety Check cycle'
                    : 'Save Safety Check'
                  : 'Disable Safety Check'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Guardian records each release. Information already viewed cannot be recalled.
        </Text>

        <View style={{ height: 70 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ styles }: any) {
  return (
    <>
      <Text style={styles.title}>Guardian Safety Check</Text>
      <Text style={styles.subtitle}>
        Check in on schedule. After the grace period, Guardian releases only what you approved.
      </Text>
    </>
  );
}

function SafetyCheckSkeleton({ styles }: any) {
  return (
    <ScrollView
      contentContainerStyle={styles.skeletonContent}
      showsVerticalScrollIndicator={false}
      scrollEnabled={false}
    >
      <PulsingSkeleton styles={styles} style={styles.skeletonPageTitle} />
      <PulsingSkeleton styles={styles} style={styles.skeletonPageSubtitle} />

      <View style={styles.skeletonCardShell}>
        <View style={[styles.skeletonCardSurface, styles.skeletonHeroSurface]}>
          <View style={styles.skeletonHeroHeader}>
            <PulsingSkeleton styles={styles} style={styles.skeletonHeroIcon} />
            <View style={styles.skeletonHeroCopy}>
              <PulsingSkeleton styles={styles} style={styles.skeletonEyebrow} />
              <PulsingSkeleton styles={styles} style={styles.skeletonHeroTitle} />
            </View>
            <PulsingSkeleton styles={styles} style={styles.skeletonBadge} />
          </View>

          <PulsingSkeleton styles={styles} style={styles.skeletonHeroLine} />
          <PulsingSkeleton styles={styles} style={styles.skeletonHeroLineShort} />
          <PulsingSkeleton styles={styles} style={styles.skeletonCheckInButton} />
        </View>
      </View>

      <View style={styles.skeletonSectionHeader}>
        <View style={styles.skeletonSectionCopy}>
          <PulsingSkeleton styles={styles} style={styles.skeletonSectionTitle} />
          <PulsingSkeleton styles={styles} style={styles.skeletonSectionSubtitle} />
        </View>
        <PulsingSkeleton styles={styles} style={styles.skeletonToggle} />
      </View>

      <PulsingSkeleton styles={styles} style={styles.skeletonLabel} />
      <View style={styles.skeletonCardShell}>
        <View style={styles.skeletonCardSurface}>
          {[0, 1].map((item) => (
            <View
              key={`safety-contact-skeleton-${item}`}
              style={[
                styles.skeletonContactRow,
                item === 0 && styles.skeletonRowDivider,
              ]}
            >
              <PulsingSkeleton styles={styles} style={styles.skeletonRadio} />
              <PulsingSkeleton styles={styles} style={styles.skeletonAvatar} />
              <View style={styles.skeletonContactCopy}>
                <PulsingSkeleton styles={styles} style={styles.skeletonContactName} />
                <PulsingSkeleton styles={styles} style={styles.skeletonContactEmail} />
              </View>
            </View>
          ))}
        </View>
      </View>

      <PulsingSkeleton styles={styles} style={styles.skeletonLabelShort} />
      <View style={styles.skeletonChipRow}>
        {[0, 1, 2, 3].map((item) => (
          <PulsingSkeleton
            key={`safety-chip-skeleton-${item}`}
            styles={styles}
            style={styles.skeletonChip}
          />
        ))}
      </View>

      <View style={styles.skeletonCardShell}>
        <View style={styles.skeletonCardSurface}>
          {[0, 1, 2].map((item) => (
            <View
              key={`safety-summary-skeleton-${item}`}
              style={[
                styles.skeletonSummaryRow,
                item !== 2 && styles.skeletonRowDivider,
              ]}
            >
              <PulsingSkeleton styles={styles} style={styles.skeletonSummaryIcon} />
              <View style={styles.skeletonSummaryCopy}>
                <PulsingSkeleton styles={styles} style={styles.skeletonSummaryLabel} />
                <PulsingSkeleton styles={styles} style={styles.skeletonSummaryValue} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function SummaryRow({ icon, title, value, C, styles }: any) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryIcon}>
        <Ionicons name={icon} size={18} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.summaryTitle}>{title}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    </View>
  );
}

function StatusBadge({ status, C, styles }: any) {
  const normalized = String(status || 'DISABLED').toUpperCase();

  const badgeStyle =
    normalized === 'ACTIVE'
      ? styles.badgeActive
      : normalized === 'GRACE'
        ? styles.badgeGrace
        : normalized === 'TRIGGERED'
          ? styles.badgeTriggered
          : styles.badgeDisabled;

  const label =
    normalized === 'ACTIVE'
      ? 'Active'
      : normalized === 'GRACE'
        ? 'Grace'
        : normalized === 'TRIGGERED'
          ? 'Released'
          : 'Off';

  return (
    <View style={[styles.badge, badgeStyle]}>
      <View
        style={[
          styles.badgeDot,
          {
            backgroundColor:
              normalized === 'ACTIVE'
                ? C.success
                : normalized === 'GRACE'
                  ? C.warning
                  : normalized === 'TRIGGERED'
                    ? C.danger
                    : C.tabInactive,
          },
        ]}
      />
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
    },
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: 92,
      paddingBottom: 40,
    },
    skeletonContent: {
      paddingHorizontal: 18,
      paddingTop: 92,
      paddingBottom: 140,
    },
    skeletonPageTitle: {
      width: '76%',
      height: 34,
      borderRadius: 12,
      marginBottom: 12,
    },
    skeletonPageSubtitle: {
      width: '96%',
      height: 54,
      borderRadius: 16,
      marginBottom: 20,
    },
    skeletonCardShell: {
      width: '100%',
      borderRadius: 26,
      marginBottom: 22,
      backgroundColor: C.backgroundElement,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    skeletonCardSurface: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },

      width: '100%',
      borderRadius: 26,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    skeletonHeroSurface: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },

      padding: 19,
    },
    skeletonHeroHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    skeletonHeroIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 54,
      height: 54,
      borderRadius: 19,
      flexShrink: 0,
    },
    skeletonHeroCopy: {
      flex: 1,
      minWidth: 0,
    },
    skeletonEyebrow: {
      width: 82,
      height: 10,
      borderRadius: 5,
      marginBottom: 8,
    },
    skeletonHeroTitle: {
      width: '80%',
      height: 20,
      borderRadius: 8,
    },
    skeletonBadge: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 64,
      height: 32,
      borderRadius: 999,
      flexShrink: 0,
    },
    skeletonHeroLine: {
      width: '100%',
      height: 12,
      borderRadius: 6,
      marginTop: 20,
    },
    skeletonHeroLineShort: {
      width: '72%',
      height: 12,
      borderRadius: 6,
      marginTop: 9,
    },
    skeletonCheckInButton: {
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      elevation: 10,
      shadowOffset: { width: 0, height: 11 },

      width: '100%',
      height: 50,
      borderRadius: 18,
      marginTop: 18,
    },
    skeletonSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 14,
      marginBottom: 18,
    },
    skeletonSectionCopy: {
      flex: 1,
    },
    skeletonSectionTitle: {
      width: 172,
      height: 18,
      borderRadius: 8,
      marginBottom: 8,
    },
    skeletonSectionSubtitle: {
      width: 218,
      maxWidth: '88%',
      height: 12,
      borderRadius: 6,
    },
    skeletonToggle: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 56,
      height: 32,
      borderRadius: 18,
      flexShrink: 0,
    },
    skeletonLabel: {
      width: 124,
      height: 11,
      borderRadius: 6,
      marginBottom: 10,
    },
    skeletonLabelShort: {
      width: 108,
      height: 11,
      borderRadius: 6,
      marginBottom: 10,
    },
    skeletonContactRow: {
      minHeight: 78,
      paddingHorizontal: 15,
      paddingVertical: 13,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
    },
    skeletonRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    skeletonRadio: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 24,
      height: 24,
      borderRadius: 12,
      flexShrink: 0,
    },
    skeletonAvatar: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 42,
      height: 42,
      borderRadius: 15,
      flexShrink: 0,
    },
    skeletonContactCopy: {
      flex: 1,
      minWidth: 0,
    },
    skeletonContactName: {
      width: '46%',
      height: 14,
      borderRadius: 7,
      marginBottom: 8,
    },
    skeletonContactEmail: {
      width: '76%',
      height: 11,
      borderRadius: 6,
    },
    skeletonChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 22,
    },
    skeletonChip: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 72,
      height: 40,
      borderRadius: 999,
    },
    skeletonSummaryRow: {
      padding: 15,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    skeletonSummaryIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 40,
      height: 40,
      borderRadius: 14,
      flexShrink: 0,
    },
    skeletonSummaryCopy: {
      flex: 1,
      minWidth: 0,
    },
    skeletonSummaryLabel: {
      width: 96,
      height: 10,
      borderRadius: 5,
      marginBottom: 8,
    },
    skeletonSummaryValue: {
      width: '72%',
      height: 13,
      borderRadius: 6,
    },
    title: {
      color: C.text,
      fontSize: 30,
      fontWeight: '900',
      letterSpacing: -0.7,
    },
    subtitle: {
      color: C.textSecondary,
      fontSize: 16,
      lineHeight: 24,
      marginTop: 8,
      marginBottom: 20,
    },
    heroShell: {
      borderRadius: 28,
      marginBottom: 20,
      shadowColor: '#000',
      shadowOpacity: 0.24,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 14 },
      elevation: 12,
    },
    hero: {
      backgroundColor: C.backgroundElement,
      borderRadius: 28,
      padding: 19,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    heroIcon: {
      width: 54,
      height: 54,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundbutton,
      shadowColor: C.primary,
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 7 },
      elevation: 6,
    },
    heroEyebrow: {
      color: C.textSecondary,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.1,
    },
    heroTitle: {
      color: C.text,
      fontSize: 20,
      fontWeight: '900',
      marginTop: 3,
    },
    heroText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 16,
    },
    badge: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      minHeight: 32,
      borderRadius: 999,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
    },
    badgeActive: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      backgroundColor: `${C.success}16`,
      borderColor: `${C.success}45`,
    },
    badgeGrace: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      backgroundColor: `${C.warning}16`,
      borderColor: `${C.warning}45`,
    },
    badgeTriggered: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      backgroundColor: `${C.danger}16`,
      borderColor: `${C.danger}45`,
    },
    badgeDisabled: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      backgroundColor: C.backgroundSelected,
      borderColor: C.border,
    },
    badgeDot: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 7,
      height: 7,
      borderRadius: 4,
    },
    badgeText: {
      color: C.text,
      fontSize: 11,
      fontWeight: '900',
    },
    planNotice: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },

      marginBottom: 18,
      borderRadius: 18,
      padding: 13,
      backgroundColor: `${C.warning}12`,
      borderWidth: 1,
      borderColor: `${C.warning}38`,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 9,
    },
    planNoticeText: {
      color: C.text,
      flex: 1,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '700',
    },
    warningStrip: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },

      marginTop: 14,
      borderRadius: 16,
      padding: 12,
      backgroundColor: `${C.warning}12`,
      borderWidth: 1,
      borderColor: `${C.warning}35`,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    warningText: {
      color: C.text,
      flex: 1,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '700',
    },
    dangerStrip: {
      marginTop: 14,
      borderRadius: 16,
      padding: 12,
      backgroundColor: `${C.danger}12`,
      borderWidth: 1,
      borderColor: `${C.danger}35`,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },
    dangerText: {
      color: C.text,
      flex: 1,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '700',
    },
    checkInButton: {
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      elevation: 10,
      shadowOffset: { width: 0, height: 11 },

      marginTop: 16,
      minHeight: 50,
      borderRadius: 18,
      backgroundColor: C.actionCard,
      borderWidth: 1,
      borderColor: `${C.primary}55`,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    checkInButtonText: {
      color: C.primary,
      fontSize: 14,
      fontWeight: '900',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 14,
      marginBottom: 18,
    },
    sectionTitle: {
      color: C.text,
      fontSize: 18,
      fontWeight: '900',
    },
    sectionSub: {
      color: C.textSecondary,
      fontSize: 13,
      marginTop: 3,
    },
    toggle: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 56,
      height: 32,
      borderRadius: 18,
      padding: 3,
      backgroundColor: C.backgroundSelected,
      borderWidth: 1,
      borderColor: C.border,
      justifyContent: 'center',
    },
    toggleActive: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    toggleKnob: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: C.backgroundElement,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    toggleKnobActive: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      alignSelf: 'flex-end',
      backgroundColor: '#fff',
    },
    label: {
      color: C.textSecondary,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.05,
      marginTop: 8,
      marginBottom: 10,
    },
    optionsShell: {
      borderRadius: 24,
      marginBottom: 18,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    optionsCard: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },

      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    contactRow: {
      minHeight: 78,
      paddingHorizontal: 15,
      paddingVertical: 13,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
    },
    controlDisabled: {
      opacity: 0.55,
    },
    divider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    radio: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    radioDisabled: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      opacity: 0.45,
    },
    contactAvatar: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 42,
      height: 42,
      borderRadius: 15,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contactAvatarText: {
      color: C.primary,
      fontSize: 16,
      fontWeight: '900',
    },
    contactTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: '900',
    },
    contactSub: {
      color: C.textSecondary,
      fontSize: 13,
      marginTop: 3,
    },
    contactProblem: {
      color: C.warning,
      fontSize: 11,
      fontWeight: '800',
      marginTop: 4,
    },
    emptyContactCard: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },

      borderRadius: 22,
      padding: 16,
      marginBottom: 18,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    contactIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 44,
      height: 44,
      borderRadius: 16,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fixContactCard: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },

      borderRadius: 18,
      padding: 13,
      marginTop: -5,
      marginBottom: 18,
      backgroundColor: `${C.warning}10`,
      borderWidth: 1,
      borderColor: `${C.warning}30`,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    fixContactText: {
      color: C.text,
      fontSize: 13,
      lineHeight: 20,
      flex: 1,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      minHeight: 40,
      borderRadius: 999,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
    },
    chipSelected: {
      backgroundColor: C.primary,
      borderColor: C.primary,
      shadowColor: C.primary,
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    chipText: {
      color: C.textSecondary,
      fontSize: 12,
      fontWeight: '800',
    },
    chipTextSelected: {
      color: '#fff',
    },
    helperText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 9,
      marginBottom: 18,
    },
    summaryShell: {
      borderRadius: 24,
      marginTop: 8,
      marginBottom: 18,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    summaryCard: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },

      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    summaryRow: {
      padding: 15,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    summaryIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    summaryTitle: {
      color: C.textSecondary,
      fontSize: 11,
      fontWeight: '800',
    },
    summaryValue: {
      color: C.text,
      fontSize: 13,
      fontWeight: '900',
      marginTop: 4,
    },
    primaryButton: {
      minHeight: 54,
      borderRadius: 999,
      backgroundColor: C.backgroundbutton,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      paddingHorizontal: 18,
      shadowColor: C.primary,
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 11 },
      elevation: 10,
    },
    primaryButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '900',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    disclaimer: {
      color: C.textSecondary,
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
      marginTop: 14,
      paddingHorizontal: 14,
    },
    lockedCardShell: {
      borderRadius: 28,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    lockedCard: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },

      backgroundColor: C.backgroundElement,
      borderRadius: 28,
      padding: 21,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
    },
    lockIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 66,
      height: 66,
      borderRadius: 24,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    lockedTitle: {
      color: C.text,
      fontSize: 22,
      fontWeight: '900',
    },
    lockedText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 18,
    },
    featureList: {
      alignSelf: 'stretch',
      marginBottom: 20,
      gap: 11,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    featureIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    featureText: {
      color: C.text,
      fontSize: 12,
      lineHeight: 18,
      flex: 1,
      fontWeight: '700',
    },
  });