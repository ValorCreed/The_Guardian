import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';
import {
  getSecureClipboardMessage,
  setSecureClipboard,
} from '../utils/secureClipboard';
import {
  api,
  RecoveryCircleCandidate,
  RecoveryCircleOverview,
  RecoveryCircleRequest,
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
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function RecoveryCircleScreen() {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const { isDark, colors: C } = useAppTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [overview, setOverview] = useState<RecoveryCircleOverview | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [threshold, setThreshold] = useState(2);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workingRequestId, setWorkingRequestId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);

  useSensitiveScreenProtection(Boolean(newRecoveryCode));

  const applyOverview = useCallback((response: RecoveryCircleOverview) => {
    setOverview({ ...response, recoveryCode: null });
    setEnabled(response.enabled);
    setSelectedIds(response.members.map((member) => member.userId));
    setThreshold(response.threshold || 2);
  }, []);

  const load = useCallback(async (showLoader = false) => {
    let cancelled = false;
    try {
      if (showLoader) setLoading(true);
      setLoadError(null);
      const response = await requestApi.getRecoveryCircleOverview();
      applyOverview(response);
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return;
      }
      setLoadError(error?.message || 'Could not load Recovery Circle.');
    } finally {
      if (!cancelled) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [applyOverview, requestApi]);

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load])
  );

  const availableCandidates = useMemo(() => {
    const candidates = [...(overview?.candidates || [])];
    const known = new Set(candidates.map((item) => item.userId));
    for (const member of overview?.members || []) {
      if (!known.has(member.userId)) {
        candidates.push({
          contactId: -member.userId,
          userId: member.userId,
          name: member.name,
          email: member.email,
          relationship: 'Current member — no longer an eligible emergency contact',
        });
      }
    }
    return candidates;
  }, [overview]);

  const canConfigure = Boolean(overview?.canConfigure);
  const planUnavailable = overview?.plan === 'UNKNOWN';
  const canSaveEnabled = canConfigure && selectedIds.length >= 2;
  const allowedThresholds = Array.from(
    { length: Math.max(0, selectedIds.length - 1) },
    (_, index) => index + 2
  );

  const toggleCandidate = (candidate: RecoveryCircleCandidate) => {
    if (!canConfigure) {
      hapticWarning();
      screenAlert(
        planUnavailable ? 'Plan verification unavailable' : 'Premium or Family required',
        planUnavailable
          ? 'Guardian cannot verify your plan right now. Existing protection remains visible, but settings cannot be changed.'
          : 'An eligible plan is required to configure Recovery Circle.'
      );
      return;
    }

    const currentlySelected = selectedIds.includes(candidate.userId);
    if (!currentlySelected && selectedIds.length >= 5) {
      hapticWarning();
      screenAlert('Maximum reached', 'A Recovery Circle can contain up to five trusted contacts.');
      return;
    }

    hapticSelection();
    setSelectedIds((current) => {
      const next = currentlySelected
        ? current.filter((id) => id !== candidate.userId)
        : [...current, candidate.userId];
      setThreshold((currentThreshold) =>
        Math.min(Math.max(2, currentThreshold), Math.max(2, next.length))
      );
      return next;
    });
  };

  const saveCircle = async (nextEnabled = enabled) => {
    if (!password.trim()) {
      screenAlert('Password required', 'Enter your current account password to protect this change.');
      return;
    }

    if (nextEnabled && !canSaveEnabled) {
      screenAlert(
        'Choose trusted contacts',
        'Select at least two active, registered emergency contacts.'
      );
      return;
    }

    try {
      setSaving(true);
      const response = await requestApi.updateRecoveryCircle({
        enabled: nextEnabled,
        threshold,
        memberUserIds: selectedIds,
        password,
      });
      applyOverview(response);
      setPassword('');
      setNewRecoveryCode(nextEnabled ? response.recoveryCode || null : null);
      hapticSuccess();
      screenAlert(
        nextEnabled ? 'Recovery Circle active' : 'Recovery Circle disabled',
        nextEnabled && response.recoveryCode
          ? 'Your circle is active. Save the new recovery code shown on this screen now; Guardian cannot display it again.'
          : response.message
      );
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) return;
      hapticWarning();
      screenAlert('Could not update Recovery Circle', error?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const copyRecoveryCode = async () => {
    if (!newRecoveryCode) return;
    await setSecureClipboard(newRecoveryCode);
    hapticLight();
    screenAlert(
      'Recovery code copied',
      `${getSecureClipboardMessage('Recovery code')} Store it somewhere private and outside Guardian.`
    );
  };

  const confirmDisable = () => {
    if (!overview?.configured || !overview.enabled) {
      setEnabled(false);
      return;
    }
    hapticDelete();
    screenAlert(
      'Disable Recovery Circle?',
      'This cancels any active circle recovery request. Your saved members remain available if you enable it again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: () => {
            void saveCircle(false);
          },
        },
      ]
    );
  };

  const vote = (
    request: RecoveryCircleRequest,
    decision: 'APPROVE' | 'DENY'
  ) => {
    const approving = decision === 'APPROVE';
    hapticWarning();
    screenAlert(
      approving ? 'Approve account recovery?' : 'Deny account recovery?',
      approving
        ? `Only approve after verifying ${request.ownerName}'s identity outside Guardian. Your vote cannot reset the account alone.`
        : `Deny this request if you cannot verify ${request.ownerName} or believe the request is suspicious.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: approving ? 'Approve' : 'Deny',
          style: approving ? 'default' : 'destructive',
          onPress: async () => {
            try {
              setWorkingRequestId(request.requestId);
              if (approving) {
                await requestApi.approveRecoveryCircleRequest(request.requestId);
              } else {
                await requestApi.denyRecoveryCircleRequest(request.requestId);
              }
              hapticSuccess();
              await load(false);
            } catch (error: any) {
              if (isScreenRequestCancelled(error)) return;
              screenAlert('Could not record vote', error?.message || 'Please try again.');
            } finally {
              setWorkingRequestId(null);
            }
          },
        },
      ]
    );
  };

  const cancelRequest = (request: RecoveryCircleRequest) => {
    screenAlert(
      'Cancel recovery request?',
      'The saved request ID and recovery code will stop working immediately.',
      [
        { text: 'Keep request', style: 'cancel' },
        {
          text: 'Cancel request',
          style: 'destructive',
          onPress: async () => {
            try {
              setWorkingRequestId(request.requestId);
              await requestApi.cancelRecoveryCircleRequest(request.requestId);
              hapticSuccess();
              await load(false);
            } catch (error: any) {
              if (isScreenRequestCancelled(error)) return;
              screenAlert('Could not cancel request', error?.message || 'Please try again.');
            } finally {
              setWorkingRequestId(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={C.background}
        />
        <RecoveryCircleSkeleton styles={styles} />
      </SafeAreaView>
    );
  }

  if (!overview && loadError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={C.background}
        />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Recovery Circle</Text>
          <Text style={styles.subtitle}>Multi-person account recovery protection.</Text>
          <View style={styles.cardShell}>
            <View style={styles.centerCard}>
              <Ionicons name="cloud-offline-outline" size={38} color={C.warning} />
              <Text style={styles.centerTitle}>Recovery Circle unavailable</Text>
              <Text style={styles.centerText}>{loadError}</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => void load(true)}>
                <Ionicons name="refresh-outline" size={19} color="#fff" />
                <Text style={styles.primaryButtonText}>Try again</Text>
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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
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
        <Text style={styles.title}>Recovery Circle</Text>
        <Text style={styles.subtitle}>
          Require trusted people to approve account recovery.
        </Text>

        <View style={styles.heroShell}>
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <Ionicons name="people-circle-outline" size={30} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroEyebrow}>MULTI-PERSON RECOVERY</Text>
                <Text style={styles.heroTitle}>
                  {overview?.enabled ? `${overview.threshold} approvals required` : 'Protection is off'}
                </Text>
              </View>
              <View style={[styles.statusBadge, overview?.enabled && styles.statusBadgeActive]}>
                <Text style={styles.statusBadgeText}>{overview?.enabled ? 'Active' : 'Off'}</Text>
              </View>
            </View>
            <Text style={styles.heroText}>{overview?.message}</Text>
            <View style={styles.securityStrip}>
              <Ionicons name="shield-checkmark-outline" size={19} color={C.primary} />
              <Text style={styles.securityStripText}>
                Recovery needs member approval and your private setup code.
              </Text>
            </View>
          </View>
        </View>

        {newRecoveryCode && (
          <View style={styles.codeShell}>
            <View style={styles.codeCard}>
              <View style={styles.codeHeader}>
                <View style={styles.codeIcon}>
                  <Ionicons name="key-outline" size={22} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.codeTitle}>Save your recovery code now</Text>
                  <Text style={styles.codeSubtitle}>
                    This code is shown once and is required for recovery.
                  </Text>
                </View>
              </View>
              <Text selectable style={styles.codeValue}>{newRecoveryCode}</Text>
              <View style={styles.codeActions}>
                <TouchableOpacity style={styles.codeCopyButton} onPress={copyRecoveryCode}>
                  <Ionicons name="copy-outline" size={18} color="#fff" />
                  <Text style={styles.codeCopyText}>Copy securely</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.codeDismissButton}
                  onPress={() => setNewRecoveryCode(null)}
                >
                  <Text style={styles.codeDismissText}>I saved it</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.codeWarning}>
                Keep this code private. Members only need the request shown in Guardian.
              </Text>
            </View>
          </View>
        )}

        {(overview?.approvalRequests.length || 0) > 0 && (
          <>
            <SectionHeader
              title="Approvals needing you"
              count={overview?.approvalRequests.length || 0}
              styles={styles}
            />
            {overview?.approvalRequests.map((request) => (
              <ApprovalCard
                key={request.requestId}
                request={request}
                working={workingRequestId === request.requestId}
                onApprove={() => vote(request, 'APPROVE')}
                onDeny={() => vote(request, 'DENY')}
                C={C}
                styles={styles}
              />
            ))}
          </>
        )}

        {!overview?.eligible && !overview?.configured ? (
          <View style={styles.cardShell}>
            <View style={styles.centerCard}>
              <View style={styles.largeIcon}>
                <Ionicons
                  name={planUnavailable ? 'cloud-offline-outline' : 'diamond-outline'}
                  size={32}
                  color={planUnavailable ? C.warning : C.primary}
                />
              </View>
              <Text style={styles.centerTitle}>
                {planUnavailable ? 'Could not verify your plan' : 'Premium protection'}
              </Text>
              <Text style={styles.centerText}>
                {planUnavailable
                  ? 'Try again after Guardian can reach the subscription service.'
                  : 'Recovery Circle is available on Premium and Family plans.'}
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() =>
                  planUnavailable
                    ? void load(true)
                    : router.push('/subscription?from=recoverycircle')
                }
              >
                <Ionicons
                  name={planUnavailable ? 'refresh-outline' : 'diamond-outline'}
                  size={19}
                  color="#fff"
                />
                <Text style={styles.primaryButtonText}>
                  {planUnavailable ? 'Try again' : 'View plans'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.sectionRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Circle protection</Text>
                <Text style={styles.sectionSubtitle}>Turn multi-person recovery on or off.</Text>
              </View>
              <TouchableOpacity
                style={[styles.toggle, enabled && styles.toggleActive]}
                activeOpacity={0.8}
                onPress={() => {
                  hapticLight();
                  if (enabled) {
                    confirmDisable();
                    return;
                  }
                  if (!canConfigure) {
                    hapticWarning();
                    screenAlert(
                      planUnavailable ? 'Plan verification unavailable' : 'Premium or Family required',
                      planUnavailable
                        ? 'Guardian cannot verify your plan right now.'
                        : 'Upgrade to activate Recovery Circle.'
                    );
                    return;
                  }
                  setEnabled(true);
                }}
              >
                <View style={[styles.toggleKnob, enabled && styles.toggleKnobActive]} />
              </TouchableOpacity>
            </View>

            {enabled && (
              <>
                <Text style={styles.label}>TRUSTED CONTACTS</Text>
                <Text style={styles.helperText}>
                  Choose 2–5 registered emergency contacts.
                </Text>

                {availableCandidates.length === 0 ? (
                  <TouchableOpacity
                    style={styles.emptyContact}
                    onPress={() => router.push('/emergencyaccess')}
                    activeOpacity={0.82}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name="person-add-outline" size={21} color={C.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>Add registered emergency contacts</Text>
                      <Text style={styles.rowSubtitle}>
                        Choose from your emergency contacts.
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={19} color={C.tabInactive} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.cardShell}>
                    <View style={styles.listCard}>
                      {availableCandidates.map((candidate, index) => {
                        const selected = selectedIds.includes(candidate.userId);
                        const noLongerEligible = candidate.contactId < 0;
                        return (
                          <TouchableOpacity
                            key={candidate.userId}
                            style={[
                              styles.contactRow,
                              index !== availableCandidates.length - 1 && styles.divider,
                              !canConfigure && styles.controlDisabled,
                            ]}
                            activeOpacity={0.76}
                            onPress={() => toggleCandidate(candidate)}
                          >
                            <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
                              {selected && <Ionicons name="checkmark" size={15} color="#fff" />}
                            </View>
                            <View style={styles.avatar}>
                              <Text style={styles.avatarText}>
                                {(candidate.name || candidate.email).slice(0, 1).toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.rowTitle}>{candidate.name}</Text>
                              <Text style={styles.rowSubtitle}>{candidate.email}</Text>
                              <Text style={[styles.relationship, noLongerEligible && { color: C.warning }]}> 
                                {candidate.relationship}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                <Text style={styles.label}>APPROVAL THRESHOLD</Text>
                <View style={styles.thresholdRow}>
                  {allowedThresholds.map((value) => (
                    <TouchableOpacity
                      key={value}
                      style={[styles.thresholdChip, threshold === value && styles.thresholdChipActive]}
                      disabled={!canConfigure}
                      onPress={() => {
                        hapticSelection();
                        setThreshold(value);
                      }}
                    >
                      <Text style={[styles.thresholdText, threshold === value && styles.thresholdTextActive]}>
                        {value} of {selectedIds.length}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {selectedIds.length < 2 && (
                  <Text style={styles.warningText}>Choose at least two contacts to set a threshold.</Text>
                )}

                <Text style={styles.label}>CONFIRM WITH PASSWORD</Text>
                <View style={styles.passwordWrap}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Current account password"
                    placeholderTextColor={C.tabInactive}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!saving}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((current) => !current)}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={22}
                      color={C.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (saving || !canSaveEnabled || !canConfigure) && styles.disabled,
                  ]}
                  disabled={saving || !canSaveEnabled || !canConfigure}
                  onPress={() => void saveCircle(true)}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Ionicons name="shield-checkmark-outline" size={20} color="#fff" />
                  )}
                  <Text style={styles.primaryButtonText}>
                    {saving ? 'Saving...' : 'Save Recovery Circle'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {(overview?.ownedRequests.length || 0) > 0 && (
          <>
            <SectionHeader
              title="Your recovery activity"
              count={overview?.ownedRequests.length || 0}
              styles={styles}
            />
            {overview?.ownedRequests.map((request) => (
              <OwnedRequestCard
                key={request.requestId}
                request={request}
                working={workingRequestId === request.requestId}
                onCancel={() => cancelRequest(request)}
                C={C}
                styles={styles}
              />
            ))}
          </>
        )}

        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={22} color={C.primary} />
          <Text style={styles.infoText}>
            Circle members approve recovery; they never see your vault.
          </Text>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionHeader({ title, count, styles }: any) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.countBadge}>
        <Text style={styles.countText}>{count}</Text>
      </View>
    </View>
  );
}

function ApprovalCard({ request, working, onApprove, onDeny, C, styles }: any) {
  return (
    <View style={styles.requestShell}>
      <View style={styles.requestCard}>
        <View style={styles.requestTop}>
          <View style={styles.rowIcon}>
            <Ionicons name="person-circle-outline" size={22} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{request.ownerName}</Text>
            <Text style={styles.rowSubtitle}>{request.ownerEmail}</Text>
          </View>
          <StatusPill status={request.status} C={C} styles={styles} />
        </View>
        <Text style={styles.requestId}>Request {request.requestId}</Text>
        <Text style={styles.progressText}>
          {request.approvalCount} of {request.threshold} approvals · expires {formatDate(request.expiresAt)}
        </Text>
        <View style={styles.verifyWarning}>
          <Ionicons name="warning-outline" size={18} color={C.warning} />
          <Text style={styles.verifyWarningText}>
            Contact the owner through a trusted channel before voting.
          </Text>
        </View>
        {!request.canVote && (
          <Text style={styles.voteStatusText}>
            {request.currentUserDecision
              ? `You already ${String(request.currentUserDecision).toLowerCase()} this request.`
              : 'Voting is unavailable until Guardian can verify that you are still an active recovery contact.'}
          </Text>
        )}
        <View style={styles.voteRow}>
          <TouchableOpacity
            style={[styles.denyButton, !request.canVote && styles.disabled]}
            disabled={working || !request.canVote}
            onPress={onDeny}
          >
            <Text style={styles.denyText}>Deny</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.approveButton, !request.canVote && styles.disabled]}
            disabled={working || !request.canVote}
            onPress={onApprove}
          >
            {working ? <ActivityIndicator color="#fff" /> : <Text style={styles.approveText}>Approve</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function OwnedRequestCard({ request, working, onCancel, C, styles }: any) {
  const active = request.status === 'PENDING' || request.status === 'APPROVED';
  return (
    <View style={styles.requestShell}>
      <View style={styles.requestCard}>
        <View style={styles.requestTop}>
          <View style={styles.rowIcon}>
            <Ionicons name="key-outline" size={20} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{request.requestId}</Text>
            <Text style={styles.rowSubtitle}>Created {formatDate(request.createdAt)}</Text>
          </View>
          <StatusPill status={request.status} C={C} styles={styles} />
        </View>
        <Text style={styles.progressText}>
          {request.approvalCount} of {request.threshold} approvals · expires {formatDate(request.expiresAt)}
        </Text>
        {active && (
          <TouchableOpacity style={styles.cancelButton} disabled={working} onPress={onCancel}>
            {working ? <ActivityIndicator color={C.danger} /> : <Text style={styles.cancelText}>Cancel request</Text>}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function StatusPill({ status, C, styles }: any) {
  const value = String(status || '').toUpperCase();
  const color = value === 'APPROVED' || value === 'COMPLETED'
    ? C.success
    : value === 'PENDING'
      ? C.warning
      : C.danger;
  return (
    <View style={[styles.pill, { borderColor: `${color}55`, backgroundColor: `${color}12` }]}>
      <Text style={[styles.pillText, { color }]}>{value}</Text>
    </View>
  );
}

function RecoveryCircleSkeleton({ styles }: any) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
      <PulsingSkeleton styles={styles} style={styles.skeletonSubtitle} />
      <View style={styles.heroShell}>
        <View style={styles.heroCard}>
          <View style={styles.skeletonHeroRow}>
            <PulsingSkeleton styles={styles} style={styles.skeletonHeroIcon} />
            <View style={{ flex: 1 }}>
              <PulsingSkeleton styles={styles} style={styles.skeletonLineMedium} />
              <PulsingSkeleton styles={styles} style={styles.skeletonLineLarge} />
            </View>
            <PulsingSkeleton styles={styles} style={styles.skeletonPill} />
          </View>
          <PulsingSkeleton styles={styles} style={styles.skeletonParagraph} />
          <PulsingSkeleton styles={styles} style={styles.skeletonStrip} />
        </View>
      </View>
      <PulsingSkeleton styles={styles} style={styles.skeletonSection} />
      <View style={styles.cardShell}>
        <View style={styles.listCard}>
          {[1, 2, 3].map((item, index) => (
            <View key={item} style={[styles.contactRow, index !== 2 && styles.divider]}>
              <PulsingSkeleton styles={styles} style={styles.skeletonCheck} />
              <PulsingSkeleton styles={styles} style={styles.skeletonAvatar} />
              <View style={{ flex: 1 }}>
                <PulsingSkeleton styles={styles} style={styles.skeletonLineMedium} />
                <PulsingSkeleton styles={styles} style={styles.skeletonLineSmall} />
              </View>
            </View>
          ))}
        </View>
      </View>
      <PulsingSkeleton styles={styles} style={styles.skeletonSection} />
      <View style={styles.skeletonChipRow}>
        {[1, 2, 3].map((item) => (
          <PulsingSkeleton key={item} styles={styles} style={styles.skeletonChip} />
        ))}
      </View>
      <PulsingSkeleton styles={styles} style={styles.skeletonButton} />
    </ScrollView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    skeletonBlock: { backgroundColor: C.backgroundSelected, borderRadius: 999 },
    safeArea: { flex: 1, backgroundColor: C.background },
    content: { paddingHorizontal: 18, paddingTop: 92, paddingBottom: 140 },
    title: { color: C.text, fontSize: 34, fontWeight: '900', letterSpacing: -0.7 },
    subtitle: { color: C.textSecondary, fontSize: 16, lineHeight: 24, marginTop: 8, marginBottom: 22 },
    heroShell: { borderRadius: 28, marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.13, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 7 },
    heroCard: { borderRadius: 28, padding: 19, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    heroIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: C.backgroundbutton, alignItems: 'center', justifyContent: 'center', shadowColor: C.primary, shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
    heroEyebrow: { color: C.textSecondary, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    heroTitle: { color: C.text, fontSize: 19, fontWeight: '900', marginTop: 4 },
    heroText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 15 },
    statusBadge: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: C.backgroundSelected, borderWidth: 1, borderColor: C.border },
    statusBadgeActive: { backgroundColor: `${C.success}14`, borderColor: `${C.success}45` },
    statusBadgeText: { color: C.text, fontSize: 11, fontWeight: '900' },
    securityStrip: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 16, padding: 12, marginTop: 15, backgroundColor: C.actionCard, borderWidth: 1, borderColor: `${C.primary}35` },
    securityStripText: { flex: 1, color: C.text, fontSize: 12, lineHeight: 18, fontWeight: '700' },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 10 },
    sectionTitle: { color: C.text, fontSize: 18, fontWeight: '900' },
    sectionSubtitle: { color: C.textSecondary, fontSize: 12, marginTop: 4 },
    countBadge: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: C.backgroundSelected, alignItems: 'center', justifyContent: 'center' },
    countText: { color: C.text, fontSize: 11, fontWeight: '900' },
    toggle: { width: 56, height: 32, borderRadius: 18, padding: 3, backgroundColor: C.backgroundSelected, borderWidth: 1, borderColor: C.border, justifyContent: 'center' },
    toggleActive: { backgroundColor: C.primary, borderColor: C.primary },
    toggleKnob: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.backgroundElement, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
    toggleKnobActive: { alignSelf: 'flex-end', backgroundColor: '#fff' },
    label: { color: C.textSecondary, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 8, marginBottom: 7 },
    helperText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 11 },
    cardShell: { borderRadius: 24, marginBottom: 18, shadowColor: '#000', shadowOpacity: 0.09, shadowRadius: 17, shadowOffset: { width: 0, height: 9 }, elevation: 5 },
    listCard: { borderRadius: 24, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
    contactRow: { minHeight: 78, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
    divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    checkCircle: { width: 25, height: 25, borderRadius: 13, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    checkCircleSelected: { backgroundColor: C.primary, borderColor: C.primary },
    avatar: { width: 43, height: 43, borderRadius: 16, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: C.primary, fontSize: 16, fontWeight: '900' },
    rowIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { color: C.text, fontSize: 14, fontWeight: '900' },
    rowSubtitle: { color: C.textSecondary, fontSize: 12, marginTop: 3 },
    relationship: { color: C.primary, fontSize: 10, fontWeight: '800', marginTop: 4 },
    controlDisabled: { opacity: 0.55 },
    emptyContact: { borderRadius: 22, padding: 15, marginBottom: 18, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
    thresholdRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    thresholdChip: { minHeight: 42, borderRadius: 999, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border },
    thresholdChipActive: { backgroundColor: C.primary, borderColor: C.primary, shadowColor: C.primary, shadowOpacity: 0.18, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
    thresholdText: { color: C.textSecondary, fontSize: 12, fontWeight: '800' },
    thresholdTextActive: { color: '#fff' },
    warningText: { color: C.warning, fontSize: 13, lineHeight: 20, marginBottom: 16, fontWeight: '700' },
    passwordWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
    passwordInput: { flex: 1, color: C.text, paddingHorizontal: 16, paddingVertical: 15, fontSize: 14 },
    eyeButton: { width: 52, height: 54, alignItems: 'center', justifyContent: 'center' },
    primaryButton: { minHeight: 55, borderRadius: 999, paddingHorizontal: 18, backgroundColor: C.backgroundbutton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, shadowColor: C.primary, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
    primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
    disabled: { opacity: 0.5 },
    requestShell: { borderRadius: 24, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.09, shadowRadius: 17, shadowOffset: { width: 0, height: 9 }, elevation: 5 },
    requestCard: { borderRadius: 24, padding: 15, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border },
    requestTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    requestId: { color: C.text, fontSize: 12, fontWeight: '900', marginTop: 14 },
    progressText: { color: C.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 7, fontWeight: '700' },
    verifyWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: 15, marginTop: 13, backgroundColor: `${C.warning}10`, borderWidth: 1, borderColor: `${C.warning}35` },
    verifyWarningText: { flex: 1, color: C.text, fontSize: 11, lineHeight: 17, fontWeight: '700' },
    voteStatusText: { color: C.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 12, fontWeight: '700' },
    voteRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    denyButton: { flex: 1, minHeight: 47, borderRadius: 999, borderWidth: 1, borderColor: C.danger, alignItems: 'center', justifyContent: 'center' },
    denyText: { color: C.danger, fontSize: 13, fontWeight: '900' },
    approveButton: { flex: 1, minHeight: 47, borderRadius: 999, backgroundColor: C.backgroundbutton, alignItems: 'center', justifyContent: 'center' },
    approveText: { color: '#fff', fontSize: 13, fontWeight: '900' },
    cancelButton: { alignSelf: 'flex-start', marginTop: 13, borderRadius: 999, borderWidth: 1, borderColor: C.danger, paddingHorizontal: 14, paddingVertical: 9 },
    cancelText: { color: C.danger, fontSize: 11, fontWeight: '900' },
    pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6 },
    pillText: { fontSize: 9, fontWeight: '900' },
    codeShell: { borderRadius: 24, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    codeCard: { borderRadius: 24, padding: 17, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: `${C.primary}55` },
    codeHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    codeIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center' },
    codeTitle: { color: C.text, fontSize: 16, fontWeight: '900' },
    codeSubtitle: { color: C.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
    codeValue: { color: C.text, backgroundColor: C.background, borderWidth: 1, borderColor: C.border, borderRadius: 17, paddingHorizontal: 12, paddingVertical: 15, marginTop: 15, textAlign: 'center', fontSize: 15, lineHeight: 23, fontWeight: '900', letterSpacing: 0.7 },
    codeActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
    codeCopyButton: { flex: 1, minHeight: 48, borderRadius: 999, backgroundColor: C.backgroundbutton, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    codeCopyText: { color: '#fff', fontSize: 12, fontWeight: '900' },
    codeDismissButton: { flex: 1, minHeight: 48, borderRadius: 999, backgroundColor: C.actionCard, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    codeDismissText: { color: C.primary, fontSize: 12, fontWeight: '900' },
    codeWarning: { color: C.warning, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 12 },
    infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderRadius: 22, padding: 15, marginTop: 8, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
    infoText: { flex: 1, color: C.textSecondary, fontSize: 12, lineHeight: 19, fontWeight: '700' },
    centerCard: { borderRadius: 28, padding: 22, alignItems: 'center', backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border },
    largeIcon: { width: 68, height: 68, borderRadius: 24, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
    centerTitle: { color: C.text, fontSize: 21, fontWeight: '900', textAlign: 'center', marginTop: 12 },
    centerText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 18 },
    skeletonTitle: { width: '62%', height: 34, marginBottom: 12 },
    skeletonSubtitle: { width: '94%', height: 55, borderRadius: 16, marginBottom: 22 },
    skeletonHeroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    skeletonHeroIcon: { width: 56, height: 56, borderRadius: 20 },
    skeletonLineMedium: { width: '64%', height: 13, marginBottom: 9 },
    skeletonLineLarge: { width: '88%', height: 20 },
    skeletonLineSmall: { width: '48%', height: 11, marginTop: 8 },
    skeletonPill: { width: 55, height: 31 },
    skeletonParagraph: { width: '93%', height: 44, borderRadius: 14, marginTop: 16 },
    skeletonStrip: { width: '100%', height: 56, borderRadius: 16, marginTop: 15 },
    skeletonSection: { width: '45%', height: 20, marginBottom: 12 },
    skeletonCheck: { width: 25, height: 25 },
    skeletonAvatar: { width: 43, height: 43, borderRadius: 16 },
    skeletonChipRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
    skeletonChip: { width: 88, height: 42 },
    skeletonButton: { width: '100%', height: 55, marginTop: 4 },
  });