import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
import { BlurView } from 'expo-blur';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';

import { useAppTheme } from '../context/ThemeContext';
import { useBlurTarget } from '../context/BlurTargetContext';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';
import {
  api,
  EstateActionType,
  EstateContactOption,
  EstateExecution,
  EstateOverview,
  EstatePlaybook,
  EstateReleasedItem,
  EstateTriggerType,
  EstateVaultItemOption,
  VaultItemType,
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
import {
  getSecureClipboardMessage,
  setSecureClipboard,
} from '../utils/secureClipboard';
import { useScreenAlert } from '../hooks/useScreenAlert';

const ACTIONS: Array<{
  value: EstateActionType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}> = [
  {
    value: 'RELEASE',
    label: 'Release',
    icon: 'key-outline',
    description: 'Release the item and instructions.',
  },
  {
    value: 'TRANSFER',
    label: 'Transfer',
    icon: 'swap-horizontal-outline',
    description: 'Give transfer steps.',
  },
  {
    value: 'CANCEL',
    label: 'Cancel',
    icon: 'close-circle-outline',
    description: 'Give cancellation steps.',
  },
  {
    value: 'DELETE',
    label: 'Delete',
    icon: 'trash-outline',
    description: 'Give account-closure steps.',
  },
  {
    value: 'ARCHIVE',
    label: 'Archive',
    icon: 'archive-outline',
    description: 'Preserve the item and records.',
  },
  {
    value: 'NEVER_RELEASE',
    label: 'Never release',
    icon: 'shield-outline',
    description: 'Block all emergency release.',
  },
];

const TRIGGERS: Array<{
  value: EstateTriggerType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}> = [
  {
    value: 'OWNER_RELEASE',
    label: 'Release manually',
    icon: 'hand-left-outline',
    description: 'Release only when you approve it.',
  },
  {
    value: 'EMERGENCY_APPROVAL',
    label: 'Approved request',
    icon: 'checkmark-done-outline',
    description: 'Release after you approve a request.',
  },
  {
    value: 'SAFETY_CHECK',
    label: 'Safety Check',
    icon: 'pulse-outline',
    description: 'Release when Safety Check triggers.',
  },
];

const ITEM_ICONS: Record<VaultItemType, keyof typeof Ionicons.glyphMap> = {
  PASSWORD: 'key-outline',
  CARD: 'card-outline',
  DOCUMENT: 'document-text-outline',
  NOTE: 'document-outline',
};

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

const actionLabel = (value?: string | null) =>
  ACTIONS.find((item) => item.value === value)?.label || 'Estate action';

const triggerLabel = (value?: string | null) =>
  TRIGGERS.find((item) => item.value === value)?.label || 'Trigger';

const itemKey = (itemType: string, itemId: number | string) =>
  `${String(itemType).toUpperCase()}:${itemId}`;

const contactAllowsItem = (
  contact: EstateContactOption,
  itemType?: VaultItemType | null
) => {
  if (!itemType) return false;
  return contact.active && contact.registered;
};

export default function EstatePlaybooksScreen() {
  const screenAlert = useScreenAlert();

  const params = useLocalSearchParams<{
    itemId?: string;
    itemType?: VaultItemType;
    tab?: 'plan' | 'received';
  }>();
  const requestApi = useCancelableApi(api);
  const { isDark, colors: C } = useAppTheme();
  const blurTarget = useBlurTarget();
  const styles = useMemo(() => makeStyles(C), [C]);
  const prefilledRef = useRef(false);

  const [overview, setOverview] = useState<EstateOverview | null>(null);
  const [tab, setTab] = useState<'PLAN' | 'RECEIVED'>(
    params.tab === 'received' ? 'RECEIVED' : 'PLAN'
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedItemKey, setSelectedItemKey] = useState('');
  const [actionType, setActionType] = useState<EstateActionType>('RELEASE');
  const [triggerType, setTriggerType] = useState<EstateTriggerType>('OWNER_RELEASE');
  const [recipientContactId, setRecipientContactId] = useState<number | null>(null);
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [releasedItem, setReleasedItem] = useState<EstateReleasedItem | null>(null);
  const [releasedExecution, setReleasedExecution] = useState<EstateExecution | null>(null);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [loadingReleasedItem, setLoadingReleasedItem] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useSensitiveScreenProtection(true);

  const selectedItem = useMemo(
    () =>
      overview?.vaultItems.find(
        (item) => itemKey(item.itemType, item.id) === selectedItemKey
      ) || null,
    [overview, selectedItemKey]
  );

  const eligibleContacts = useMemo(
    () =>
      (overview?.contacts || []).filter((contact) =>
        contactAllowsItem(contact, selectedItem?.itemType)
      ),
    [overview, selectedItem]
  );

  const applyOverview = useCallback(
    (response: EstateOverview) => {
      setOverview(response);
      if (!response.canConfigure || !response.vaultAvailable) {
        setFormVisible(false);
        setEditingId(null);
      }

      if (
        !prefilledRef.current &&
        params.itemId &&
        params.itemType &&
        response.vaultItems.some(
          (item) =>
            item.id === Number(params.itemId) &&
            item.itemType === params.itemType
        )
      ) {
        prefilledRef.current = true;
        setSelectedItemKey(itemKey(params.itemType, params.itemId));
        setFormVisible(response.canConfigure && response.vaultAvailable);
        setTab('PLAN');
      }
    },
    [params.itemId, params.itemType]
  );

  const load = useCallback(
    async (showLoader = false) => {
      let cancelled = false;
      try {
        if (showLoader) setLoading(true);
        setLoadError(null);
        const response = await requestApi.getEstateOverview();
        applyOverview(response);
      } catch (error: any) {
        if (isScreenRequestCancelled(error)) {
          cancelled = true;
          return;
        }
        setLoadError(error?.message || 'Could not load Digital Estate Playbooks.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [applyOverview, requestApi]
  );

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load])
  );

  const resetForm = () => {
    setEditingId(null);
    setSelectedItemKey('');
    setActionType('RELEASE');
    setTriggerType('OWNER_RELEASE');
    setRecipientContactId(null);
    setInstructions('');
    setFormVisible(false);
  };

  const chooseItem = (item: EstateVaultItemOption) => {
    hapticSelection();
    setSelectedItemKey(itemKey(item.itemType, item.id));
    const selectedContact = overview?.contacts.find(
      (contact) => contact.contactId === recipientContactId
    );
    if (selectedContact && !contactAllowsItem(selectedContact, item.itemType)) {
      setRecipientContactId(null);
    }
  };

  const chooseAction = (value: EstateActionType) => {
    hapticSelection();
    setActionType(value);
    if (value === 'NEVER_RELEASE') {
      setTriggerType('OWNER_RELEASE');
      setRecipientContactId(null);
      setInstructions('');
    }
  };

  const save = async () => {
    if (!selectedItem) {
      hapticWarning();
      screenAlert('Choose a vault item', 'Select the item this playbook should govern.');
      return;
    }

    if (actionType !== 'NEVER_RELEASE' && !recipientContactId) {
      hapticWarning();
      screenAlert(
        'Choose a recipient',
        'Select an active contact with a registered Guardian account.'
      );
      return;
    }

    if (
      actionType !== 'RELEASE' &&
      actionType !== 'NEVER_RELEASE' &&
      instructions.trim().length < 10
    ) {
      hapticWarning();
      screenAlert(
        'Add clearer instructions',
        'Transfer, cancellation, deletion and archive playbooks need at least 10 characters of instructions.'
      );
      return;
    }

    let cancelled = false;
    try {
      setSaving(true);
      const body = {
        itemType: selectedItem.itemType,
        itemId: selectedItem.id,
        actionType,
        triggerType:
          actionType === 'NEVER_RELEASE' ? 'OWNER_RELEASE' : triggerType,
        recipientContactId:
          actionType === 'NEVER_RELEASE' ? null : recipientContactId,
        instructions: instructions.trim(),
      } as const;

      if (editingId) {
        await requestApi.updateEstatePlaybook(editingId, body);
      } else {
        await requestApi.createEstatePlaybook(body);
      }

      hapticSuccess();
      screenAlert(
        editingId ? 'Playbook updated' : 'Playbook created',
        actionType === 'NEVER_RELEASE'
          ? 'Guardian will block this item from emergency and playbook release while the rule remains active.'
          : 'The playbook is active. Guardian will release it only through the trigger you selected.'
      );
      resetForm();
      await load(false);
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return;
      }
      hapticWarning();
      screenAlert('Could not save playbook', error?.message || 'Please try again.');
    } finally {
      if (!cancelled) setSaving(false);
    }
  };

  const editPlaybook = (playbook: EstatePlaybook) => {
    hapticLight();
    setEditingId(playbook.id);
    setSelectedItemKey(itemKey(playbook.itemType, playbook.itemId));
    setActionType(playbook.actionType);
    setTriggerType(playbook.triggerType);
    setRecipientContactId(playbook.recipientContactId ?? null);
    setInstructions(playbook.instructions || '');
    setFormVisible(true);
  };

  const archivePlaybook = (playbook: EstatePlaybook) => {
    hapticDelete();
    screenAlert(
      'Archive playbook?',
      'The rule will stop triggering. Previously opened release records remain in the activity history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            let cancelled = false;
            try {
              setWorkingId(playbook.id);
              await requestApi.archiveEstatePlaybook(playbook.id);
              hapticSuccess();
              await load(false);
            } catch (error: any) {
              if (isScreenRequestCancelled(error)) {
                cancelled = true;
                return;
              }
              hapticWarning();
              screenAlert('Could not archive playbook', error?.message || 'Please try again.');
            } finally {
              if (!cancelled) setWorkingId(null);
            }
          },
        },
      ]
    );
  };

  const togglePlaybook = async (playbook: EstatePlaybook) => {
    let cancelled = false;
    try {
      setWorkingId(playbook.id);
      if (playbook.status === 'ACTIVE') {
        await requestApi.pauseEstatePlaybook(playbook.id);
      } else {
        await requestApi.resumeEstatePlaybook(playbook.id);
      }
      hapticSuccess();
      await load(false);
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return;
      }
      hapticWarning();
      screenAlert('Could not update playbook', error?.message || 'Please try again.');
    } finally {
      if (!cancelled) setWorkingId(null);
    }
  };

  const releaseNow = (playbook: EstatePlaybook) => {
    hapticWarning();
    screenAlert(
      'Release this playbook now?',
      `Guardian will immediately allow ${playbook.recipientEmail || 'the recipient'} to open the linked item and instructions. You can cancel only until they open it.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Release now',
          onPress: async () => {
            let cancelled = false;
            try {
              setWorkingId(playbook.id);
              await requestApi.releaseEstatePlaybook(playbook.id);
              hapticSuccess();
              screenAlert('Playbook released', 'The recipient has been notified.');
              await load(false);
            } catch (error: any) {
              if (isScreenRequestCancelled(error)) {
                cancelled = true;
                return;
              }
              hapticWarning();
              screenAlert('Could not release playbook', error?.message || 'Please try again.');
            } finally {
              if (!cancelled) setWorkingId(null);
            }
          },
        },
      ]
    );
  };

  const cancelRelease = (execution: EstateExecution) => {
    hapticDelete();
    screenAlert(
      'Cancel unrevealed release?',
      'This works only because the recipient has not opened the released item yet.',
      [
        { text: 'Keep release', style: 'cancel' },
        {
          text: 'Cancel release',
          style: 'destructive',
          onPress: async () => {
            let cancelled = false;
            try {
              setWorkingId(execution.id);
              await requestApi.cancelEstateExecution(execution.id);
              hapticSuccess();
              await load(false);
            } catch (error: any) {
              if (isScreenRequestCancelled(error)) {
                cancelled = true;
                return;
              }
              hapticWarning();
              screenAlert('Could not cancel release', error?.message || 'Please try again.');
            } finally {
              if (!cancelled) setWorkingId(null);
            }
          },
        },
      ]
    );
  };

  const openReleasedItem = async (execution: EstateExecution) => {
    let cancelled = false;
    try {
      setReleasedExecution(execution);
      setReleasedItem(null);
      setItemModalVisible(true);
      setLoadingReleasedItem(true);
      const item = await requestApi.getEstateReleasedItem(execution.id);
      setReleasedItem(item);
      setReleasedExecution({
        ...execution,
        status: 'VIEWED',
        canCancel: false,
        canComplete: true,
        viewedAt: new Date().toISOString(),
      });
      await load(false);
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return;
      }
      setItemModalVisible(false);
      setReleasedExecution(null);
      hapticWarning();
      screenAlert('Could not open playbook', error?.message || 'Please try again.');
    } finally {
      if (!cancelled) setLoadingReleasedItem(false);
    }
  };

  const completeExecution = async (execution: EstateExecution) => {
    let cancelled = false;
    try {
      setWorkingId(execution.id);
      await requestApi.completeEstateExecution(execution.id);
      hapticSuccess();
      screenAlert(
        'Marked complete',
        'This records completion inside Guardian. It does not claim that a third-party website performed the action.'
      );
      setItemModalVisible(false);
      setReleasedItem(null);
      setReleasedExecution(null);
      await load(false);
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return;
      }
      hapticWarning();
      screenAlert('Could not mark complete', error?.message || 'Please try again.');
    } finally {
      if (!cancelled) setWorkingId(null);
    }
  };

  const copyValue = async (label: string, value?: string | null) => {
    if (!value) return;
    try {
      await setSecureClipboard(value);
      hapticSuccess();
      screenAlert('Copied', getSecureClipboardMessage(label));
    } catch {
      hapticWarning();
      screenAlert('Copy failed', `Could not copy ${label.toLowerCase()}.`);
    }
  };

  const downloadReleasedDocument = async () => {
    if (!releasedItem || !releasedExecution) return;
    let cancelled = false;
    try {
      setDownloading(true);
      const file = await requestApi.downloadEstateDocumentToCache(
        releasedExecution.id,
        releasedItem.documentName || releasedItem.title || 'estate-document',
        releasedItem.documentType || 'application/octet-stream'
      );
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: file.mimeType,
          dialogTitle: 'Open released estate document',
        });
      } else {
        screenAlert('Document prepared', file.uri);
      }
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) {
        cancelled = true;
        return;
      }
      hapticWarning();
      screenAlert('Could not prepare document', error?.message || 'Please try again.');
    } finally {
      if (!cancelled) setDownloading(false);
    }
  };

  if (loading) {
    return <EstateSkeleton C={C} isDark={isDark} styles={styles} />;
  }

  if (!overview && loadError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Digital Estate Playbooks</Text>
          <Text style={styles.subtitle}>
            Prepare instructions for trusted people.
          </Text>
          <View style={styles.errorShell}>
            <View style={styles.errorCard}>
              <Ionicons name="cloud-offline-outline" size={34} color={C.warning} />
              <Text style={styles.errorTitle}>Playbooks unavailable</Text>
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

  const canConfigure = Boolean(overview?.canConfigure);
  const vaultAvailable = overview?.vaultAvailable !== false;
  const canChangePlaybooks = canConfigure && vaultAvailable;
  const planUnavailable = overview?.plan === 'UNKNOWN';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
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
          <Text style={styles.title}>Digital Estate Playbooks</Text>
          <Text style={styles.subtitle}>
            Choose the item, recipient and release trigger.
          </Text>

          <View style={styles.heroShell}>
            <View style={styles.heroCard}>
              <View style={styles.heroIcon}>
                <Ionicons name="library-outline" size={28} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroEyebrow}>DIGITAL CONTINUITY</Text>
                <Text style={styles.heroTitle}>
                  {overview?.playbooks.length || 0} active or paused playbook
                  {(overview?.playbooks.length || 0) === 1 ? '' : 's'}
                </Text>
                <Text style={styles.heroText}>{overview?.message}</Text>
              </View>
            </View>
          </View>

          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabButton, tab === 'PLAN' && styles.tabButtonActive]}
              onPress={() => {
                hapticSelection();
                setTab('PLAN');
              }}
            >
              <Ionicons
                name="list-outline"
                size={18}
                color={tab === 'PLAN' ? '#fff' : C.textSecondary}
              />
              <Text style={[styles.tabText, tab === 'PLAN' && styles.tabTextActive]}>
                My plan
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabButton, tab === 'RECEIVED' && styles.tabButtonActive]}
              onPress={() => {
                hapticSelection();
                setTab('RECEIVED');
              }}
            >
              <Ionicons
                name="mail-open-outline"
                size={18}
                color={tab === 'RECEIVED' ? '#fff' : C.textSecondary}
              />
              <Text style={[styles.tabText, tab === 'RECEIVED' && styles.tabTextActive]}>
                Received ({overview?.received.length || 0})
              </Text>
            </TouchableOpacity>
          </View>

          {tab === 'PLAN' ? (
            <>
              {!vaultAvailable && (
                <View style={styles.planNotice}>
                  <Ionicons name="cloud-offline-outline" size={21} color={C.warning} />
                  <Text style={styles.planNoticeText}>
                    Vault Service is unavailable. History remains visible, but changes are locked.
                  </Text>
                </View>
              )}

              {!canConfigure && (
                <TouchableOpacity
                  style={styles.planNotice}
                  activeOpacity={0.84}
                  onPress={() =>
                    planUnavailable
                      ? void load(true)
                      : router.push('/subscription?from=estateplaybooks')
                  }
                >
                  <Ionicons
                    name={planUnavailable ? 'cloud-offline-outline' : 'diamond-outline'}
                    size={21}
                    color={C.warning}
                  />
                  <Text style={styles.planNoticeText}>
                    {planUnavailable
                      ? 'Plan verification failed. Existing releases remain accessible.'
                      : 'Premium or Family is required to create or change playbooks.'}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
                </TouchableOpacity>
              )}

              {canChangePlaybooks && !formVisible && (
                <TouchableOpacity
                  style={styles.primaryButton}
                  activeOpacity={0.86}
                  onPress={() => {
                    hapticLight();
                    setFormVisible(true);
                  }}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#fff" />
                  <Text style={styles.primaryButtonText}>Create a playbook</Text>
                </TouchableOpacity>
              )}

              {formVisible && (
                <View style={styles.formShell}>
                  <View style={styles.formCard}>
                    <View style={styles.formHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sectionTitle}>
                          {editingId ? 'Edit playbook' : 'New playbook'}
                        </Text>
                        <Text style={styles.sectionSub}>
                          Guardian rechecks the item and recipient before release.
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.closeButton}
                        onPress={resetForm}
                      >
                        <Ionicons name="close" size={20} color={C.text} />
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.label}>VAULT ITEM</Text>
                    {overview?.vaultItems.length ? (
                      <View style={styles.choiceList}>
                        {overview.vaultItems.map((item, index) => {
                          const selected = selectedItemKey === itemKey(item.itemType, item.id);
                          return (
                            <TouchableOpacity
                              key={itemKey(item.itemType, item.id)}
                              style={[
                                styles.choiceRow,
                                selected && styles.choiceRowSelected,
                                index !== overview.vaultItems.length - 1 && styles.divider,
                              ]}
                              onPress={() => chooseItem(item)}
                            >
                              <View style={[styles.choiceIcon, selected && styles.choiceIconSelected]}>
                                <Ionicons
                                  name={ITEM_ICONS[item.itemType]}
                                  size={19}
                                  color={selected ? '#fff' : C.primary}
                                />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.choiceTitle}>{item.title}</Text>
                                <Text style={styles.choiceSub}>{item.itemType}</Text>
                              </View>
                              <Ionicons
                                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                                size={21}
                                color={selected ? C.primary : C.tabInactive}
                              />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.emptyCard}
                        onPress={() => router.push('/vault')}
                      >
                        <Ionicons name="add-circle-outline" size={22} color={C.primary} />
                        <Text style={styles.emptyText}>Add a vault item before creating a playbook.</Text>
                      </TouchableOpacity>
                    )}

                    <Text style={styles.label}>ACTION</Text>
                    <View style={styles.actionChoiceGrid}>
                      {ACTIONS.map((action) => {
                        const selected = actionType === action.value;
                        return (
                          <TouchableOpacity
                            key={action.value}
                            style={[styles.actionChoice, selected && styles.actionChoiceSelected]}
                            onPress={() => chooseAction(action.value)}
                          >
                            <Ionicons
                              name={action.icon}
                              size={20}
                              color={selected ? '#fff' : C.primary}
                            />
                            <Text style={[styles.actionChoiceText, selected && styles.actionChoiceTextSelected]}>
                              {action.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.helperText}>
                      {ACTIONS.find((action) => action.value === actionType)?.description}
                    </Text>

                    {actionType !== 'NEVER_RELEASE' && (
                      <>
                        <Text style={styles.label}>RECIPIENT</Text>
                        {eligibleContacts.length ? (
                          <View style={styles.choiceList}>
                            {eligibleContacts.map((contact, index) => {
                              const selected = recipientContactId === contact.contactId;
                              return (
                                <TouchableOpacity
                                  key={contact.contactId}
                                  style={[
                                    styles.choiceRow,
                                    selected && styles.choiceRowSelected,
                                    index !== eligibleContacts.length - 1 && styles.divider,
                                  ]}
                                  onPress={() => {
                                    hapticSelection();
                                    setRecipientContactId(contact.contactId);
                                  }}
                                >
                                  <View style={[styles.avatar, selected && styles.choiceIconSelected]}>
                                    <Text style={[styles.avatarText, selected && { color: '#fff' }]}>
                                      {(contact.name || contact.email).slice(0, 1).toUpperCase()}
                                    </Text>
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.choiceTitle}>{contact.name}</Text>
                                    <Text style={styles.choiceSub}>{contact.email}</Text>
                                  </View>
                                  <Ionicons
                                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                                    size={21}
                                    color={selected ? C.primary : C.tabInactive}
                                  />
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.emptyCard}
                            onPress={() => router.push('/emergencyaccess')}
                          >
                            <Ionicons name="people-outline" size={22} color={C.warning} />
                            <Text style={styles.emptyText}>
                              Select an item, then choose a registered emergency contact.
                            </Text>
                          </TouchableOpacity>
                        )}

                        <Text style={styles.label}>RELEASE TRIGGER</Text>
                        <View style={styles.triggerList}>
                          {TRIGGERS.map((trigger) => {
                            const selected = triggerType === trigger.value;
                            return (
                              <TouchableOpacity
                                key={trigger.value}
                                style={[styles.triggerCard, selected && styles.triggerCardSelected]}
                                onPress={() => {
                                  hapticSelection();
                                  setTriggerType(trigger.value);
                                }}
                              >
                                <View style={[styles.triggerIcon, selected && styles.choiceIconSelected]}>
                                  <Ionicons
                                    name={trigger.icon}
                                    size={19}
                                    color={selected ? '#fff' : C.primary}
                                  />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.choiceTitle}>{trigger.label}</Text>
                                  <Text style={styles.choiceSub}>{trigger.description}</Text>
                                </View>
                                <Ionicons
                                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                                  size={21}
                                  color={selected ? C.primary : C.tabInactive}
                                />
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </>
                    )}

                    {actionType !== 'NEVER_RELEASE' && (
                      <>
                        <Text style={styles.label}>INSTRUCTIONS</Text>
                        <TextInput
                          style={styles.instructionsInput}
                          value={instructions}
                          onChangeText={setInstructions}
                          placeholder="Add the steps the recipient should follow."
                          placeholderTextColor={C.tabInactive}
                          multiline
                          maxLength={4000}
                          textAlignVertical="top"
                        />
                        <Text style={styles.characterCount}>{instructions.length}/4000</Text>
                      </>
                    )}

                    <TouchableOpacity
                      style={[styles.primaryButton, saving && styles.buttonDisabled]}
                      onPress={save}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="shield-checkmark-outline" size={20} color="#fff" />
                      )}
                      <Text style={styles.primaryButtonText}>
                        {saving ? 'Saving...' : editingId ? 'Update playbook' : 'Create playbook'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <SectionHeader title="Playbook rules" count={overview?.playbooks.length || 0} styles={styles} />
              {overview?.playbooks.length ? (
                overview.playbooks.map((playbook) => (
                  <PlaybookCard
                    key={playbook.id}
                    playbook={playbook}
                    C={C}
                    styles={styles}
                    working={workingId === playbook.id}
                    onEdit={() => editPlaybook(playbook)}
                    onToggle={() => void togglePlaybook(playbook)}
                    onRelease={() => releaseNow(playbook)}
                    onArchive={() => archivePlaybook(playbook)}
                    canConfigure={canChangePlaybooks}
                  />
                ))
              ) : (
                <EmptyState
                  icon="library-outline"
                  title="No playbooks yet"
                  text="Create a release rule or mark an item Never release."
                  C={C}
                  styles={styles}
                />
              )}

              <SectionHeader title="Release activity" count={overview?.releasedByMe.length || 0} styles={styles} />
              {overview?.releasedByMe.length ? (
                overview.releasedByMe.map((execution) => (
                  <ExecutionCard
                    key={execution.id}
                    execution={execution}
                    ownerView
                    C={C}
                    styles={styles}
                    working={workingId === execution.id}
                    onOpen={() => undefined}
                    onCancel={() => cancelRelease(execution)}
                    onComplete={() => undefined}
                  />
                ))
              ) : (
                <EmptyState
                  icon="time-outline"
                  title="No releases yet"
                  text="Manual and automatic playbook releases will appear here."
                  C={C}
                  styles={styles}
                />
              )}
            </>
          ) : overview?.received.length ? (
            overview.received.map((execution) => (
              <ExecutionCard
                key={execution.id}
                execution={execution}
                ownerView={false}
                C={C}
                styles={styles}
                working={workingId === execution.id}
                onOpen={() => void openReleasedItem(execution)}
                onCancel={() => undefined}
                onComplete={() => void completeExecution(execution)}
              />
            ))
          ) : (
            <EmptyState
              icon="mail-open-outline"
              title="No estate instructions received"
              text="Released playbooks from people who trust you will appear here."
              C={C}
              styles={styles}
            />
          )}

          <View style={styles.truthCard}>
            <Ionicons name="information-circle-outline" size={21} color={C.primary} />
            <Text style={styles.truthText}>
              Guardian releases the linked vault information and records recipient acknowledgement. It cannot guarantee that an external provider transferred, cancelled, deleted or archived an account.
            </Text>
          </View>
          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <ReleasedItemModal
        visible={itemModalVisible}
        loading={loadingReleasedItem}
        item={releasedItem}
        execution={releasedExecution}
        C={C}
        isDark={isDark}
        styles={styles}
        blurTarget={blurTarget}
        downloading={downloading}
        working={releasedExecution ? workingId === releasedExecution.id : false}
        onClose={() => {
          hapticLight();
          setItemModalVisible(false);
          setReleasedItem(null);
          setReleasedExecution(null);
        }}
        onCopy={copyValue}
        onDownload={() => void downloadReleasedDocument()}
        onComplete={() => {
          if (releasedExecution) void completeExecution(releasedExecution);
        }}
      />
    </SafeAreaView>
  );
}

function EstateSkeleton({ C, isDark, styles }: any) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.content}>
        <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
        <PulsingSkeleton styles={styles} style={styles.skeletonSub} />
        <View style={styles.skeletonCardShell}>
          <View style={styles.skeletonCard3d}>
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
          <View key={value} style={styles.skeletonCardShell}>
            <View style={styles.skeletonListCard}>
              <PulsingSkeleton styles={styles} style={styles.skeletonRowIcon} />
              <View style={{ flex: 1 }}>
                <PulsingSkeleton styles={styles} style={styles.skeletonLineLarge} />
                <PulsingSkeleton styles={styles} style={styles.skeletonLine} />
                <View style={styles.skeletonChipRow}>
                  <PulsingSkeleton styles={styles} style={styles.skeletonChip} />
                  <PulsingSkeleton styles={styles} style={styles.skeletonChip} />
                </View>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
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

function EmptyState({ icon, title, text, C, styles }: any) {
  return (
    <View style={styles.emptyStateShell}>
      <View style={styles.emptyStateCard}>
        <View style={styles.emptyStateIcon}>
          <Ionicons name={icon} size={28} color={C.primary} />
        </View>
        <Text style={styles.emptyStateTitle}>{title}</Text>
        <Text style={styles.emptyStateText}>{text}</Text>
      </View>
    </View>
  );
}

function PlaybookCard({
  playbook,
  C,
  styles,
  working,
  onEdit,
  onToggle,
  onRelease,
  onArchive,
  canConfigure,
}: any) {
  const neverRelease = playbook.actionType === 'NEVER_RELEASE';
  return (
    <View style={styles.playbookShell}>
      <View style={styles.playbookCard}>
        <View style={styles.cardTopRow}>
          <View style={styles.itemIcon}>
            <Ionicons name={ITEM_ICONS[playbook.itemType as VaultItemType]} size={21} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{playbook.itemTitle}</Text>
            <Text style={styles.cardSub}>
              {actionLabel(playbook.actionType)} · {neverRelease ? 'Emergency-release rule' : triggerLabel(playbook.triggerType)}
            </Text>
          </View>
          <View style={[styles.statusBadge, playbook.status === 'ACTIVE' ? styles.statusActive : styles.statusPaused]}>
            <Text style={styles.statusText}>{playbook.status === 'ACTIVE' ? 'Active' : 'Paused'}</Text>
          </View>
        </View>

        {!playbook.itemAvailable && (
          <View style={styles.warningRow}>
            <Ionicons name="warning-outline" size={17} color={C.warning} />
            <Text style={styles.warningRowText}>The linked vault item no longer exists.</Text>
          </View>
        )}

        {!neverRelease && (
          <View style={styles.metaRow}>
            <Ionicons name="person-outline" size={16} color={C.primary} />
            <Text style={styles.metaText}>{playbook.recipientEmail || 'No recipient'}</Text>
          </View>
        )}

        {!!playbook.instructions && (
          <Text style={styles.instructionsPreview} numberOfLines={3}>
            {playbook.instructions}
          </Text>
        )}

        <View style={styles.cardActions}>
          {working ? (
            <ActivityIndicator size="small" color={C.primary} />
          ) : (
            <>
              {canConfigure && (
                <TouchableOpacity style={styles.smallAction} onPress={onEdit}>
                  <Ionicons name="create-outline" size={17} color={C.primary} />
                  <Text style={styles.smallActionText}>Edit</Text>
                </TouchableOpacity>
              )}
              {(playbook.status === 'ACTIVE' || canConfigure) && (
                <TouchableOpacity style={styles.smallAction} onPress={onToggle}>
                  <Ionicons
                    name={playbook.status === 'ACTIVE' ? 'pause-outline' : 'play-outline'}
                    size={17}
                    color={C.primary}
                  />
                  <Text style={styles.smallActionText}>
                    {playbook.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                  </Text>
                </TouchableOpacity>
              )}
              {canConfigure && !neverRelease && playbook.status === 'ACTIVE' && playbook.itemAvailable && (
                <TouchableOpacity style={styles.smallAction} onPress={onRelease}>
                  <Ionicons name="send-outline" size={17} color={C.primary} />
                  <Text style={styles.smallActionText}>Release now</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.smallDangerAction} onPress={onArchive}>
                <Ionicons name="archive-outline" size={17} color={C.danger} />
                <Text style={styles.smallDangerText}>Archive</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function ExecutionCard({
  execution,
  ownerView,
  C,
  styles,
  working,
  onOpen,
  onCancel,
  onComplete,
}: any) {
  const statusColor =
    execution.status === 'COMPLETED'
      ? C.success
      : execution.status === 'CANCELLED'
        ? C.danger
        : execution.status === 'VIEWED'
          ? C.warning
          : C.primary;

  return (
    <View style={styles.playbookShell}>
      <View style={styles.playbookCard}>
        <View style={styles.cardTopRow}>
          <View style={styles.itemIcon}>
            <Ionicons name={ITEM_ICONS[execution.itemType as VaultItemType]} size={21} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{execution.itemTitle}</Text>
            <Text style={styles.cardSub}>
              {ownerView ? `To ${execution.recipientEmail}` : `From ${execution.ownerName}`}
            </Text>
          </View>
          <View style={[styles.statusBadge, { borderColor: `${statusColor}55`, backgroundColor: `${statusColor}14` }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{execution.status}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={16} color={C.primary} />
          <Text style={styles.metaText}>Released {formatDate(execution.releasedAt)}</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="git-branch-outline" size={16} color={C.primary} />
          <Text style={styles.metaText}>
            {actionLabel(execution.actionType)} · {String(execution.sourceType).replaceAll('_', ' ')}
          </Text>
        </View>

        {!execution.itemAvailable && execution.status !== 'CANCELLED' && (
          <View style={styles.warningRow}>
            <Ionicons name="warning-outline" size={17} color={C.warning} />
            <Text style={styles.warningRowText}>The linked item is no longer available.</Text>
          </View>
        )}

        <View style={styles.cardActions}>
          {working ? (
            <ActivityIndicator size="small" color={C.primary} />
          ) : ownerView ? (
            execution.canCancel && (
              <TouchableOpacity style={styles.smallDangerAction} onPress={onCancel}>
                <Ionicons name="close-circle-outline" size={17} color={C.danger} />
                <Text style={styles.smallDangerText}>Cancel release</Text>
              </TouchableOpacity>
            )
          ) : (
            <>
              {execution.canOpen && (
                <TouchableOpacity style={styles.smallAction} onPress={onOpen}>
                  <Ionicons name="lock-open-outline" size={17} color={C.primary} />
                  <Text style={styles.smallActionText}>Open securely</Text>
                </TouchableOpacity>
              )}
              {execution.canComplete && (
                <TouchableOpacity style={styles.smallAction} onPress={onComplete}>
                  <Ionicons name="checkmark-done-outline" size={17} color={C.primary} />
                  <Text style={styles.smallActionText}>Mark complete</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function ReleasedItemModal({
  visible,
  loading,
  item,
  execution,
  C,
  isDark,
  styles,
  blurTarget,
  downloading,
  working,
  onClose,
  onCopy,
  onDownload,
  onComplete,
}: any) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        {blurTarget?.targetRef ? (
          <BlurView
            blurTarget={blurTarget.targetRef}
            blurMethod={Platform.OS === 'android' ? ('dimezisBlurViewSdk31Plus' as any) : undefined}
            blurReductionFactor={Platform.OS === 'android' ? 2 : undefined}
            intensity={Platform.OS === 'android' ? 22 : 34}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={styles.modalFallback} />
        )}
        <View style={styles.modalOverlay} />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{item?.title || execution?.itemTitle || 'Released playbook'}</Text>
              <Text style={styles.modalSub}>
                {item ? `${actionLabel(item.actionType)} from ${item.ownerName}` : 'Opening protected item...'}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={21} color={C.text} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator size="large" color={C.primary} />
              <Text style={styles.modalLoadingText}>Opening released instructions securely...</Text>
            </View>
          ) : item ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
              <View style={styles.instructionsCard}>
                <Text style={styles.label}>OWNER INSTRUCTIONS</Text>
                <Text style={styles.instructionsText}>
                  {item.instructions || 'The owner did not add extra instructions. Review the linked item carefully.'}
                </Text>
              </View>

              <View style={styles.releasedDataCard}>
                <ReleasedItemRows item={item} C={C} styles={styles} onCopy={onCopy} />
              </View>

              {item.itemType === 'DOCUMENT' && (
                <TouchableOpacity
                  style={[styles.secondaryButton, downloading && styles.buttonDisabled]}
                  onPress={onDownload}
                  disabled={downloading}
                >
                  {downloading ? (
                    <ActivityIndicator size="small" color={C.primary} />
                  ) : (
                    <Ionicons name="download-outline" size={19} color={C.primary} />
                  )}
                  <Text style={styles.secondaryButtonText}>
                    {downloading ? 'Preparing document...' : 'Open / share document'}
                  </Text>
                </TouchableOpacity>
              )}

              {execution?.canComplete && (
                <TouchableOpacity
                  style={[styles.primaryButton, working && styles.buttonDisabled]}
                  onPress={onComplete}
                  disabled={working}
                >
                  {working ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
                  )}
                  <Text style={styles.primaryButtonText}>Mark Guardian task complete</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.modalDisclaimer}>
                Verify the owner’s wishes independently before taking irreversible action. Guardian records acknowledgement but does not control third-party providers.
              </Text>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ReleasedItemRows({ item, C, styles, onCopy }: any) {
  const rows: Array<[string, string]> = [];
  if (item.itemType === 'PASSWORD') {
    if (item.website) rows.push(['Website', item.website]);
    if (item.usernameValue) rows.push(['Username', item.usernameValue]);
    if (item.password) rows.push(['Password', item.password]);
    if (item.notes) rows.push(['Notes', item.notes]);
  } else if (item.itemType === 'CARD') {
    if (item.cardName) rows.push(['Card', item.cardName]);
    if (item.cardholderName) rows.push(['Cardholder', item.cardholderName]);
    if (item.cardNumber) rows.push(['Card number', item.cardNumber]);
    if (item.expiryDate) rows.push(['Expiry', item.expiryDate]);
    if (item.cvv) rows.push(['CVV', item.cvv]);
  } else if (item.itemType === 'DOCUMENT') {
    if (item.documentName) rows.push(['Document', item.documentName]);
    if (item.documentType) rows.push(['Type', item.documentType]);
    if (item.documentNotes) rows.push(['Notes', item.documentNotes]);
  } else {
    if (item.category) rows.push(['Category', item.category]);
    if (item.content) rows.push(['Content', item.content]);
  }

  if (!rows.length) {
    return <Text style={styles.emptyText}>The linked item has no text fields to display.</Text>;
  }

  return (
    <>
      {rows.map(([label, value], index) => (
        <View key={label}>
          <View style={styles.releasedRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.releasedLabel}>{label}</Text>
              <Text style={styles.releasedValue} selectable>{value}</Text>
            </View>
            <TouchableOpacity style={styles.copyButton} onPress={() => onCopy(label, value)}>
              <Ionicons name="copy-outline" size={18} color={C.primary} />
            </TouchableOpacity>
          </View>
          {index !== rows.length - 1 && <View style={styles.divider} />}
        </View>
      ))}
    </>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    content: { paddingHorizontal: 18, paddingTop: 92, paddingBottom: 40 },
    skeletonBlock: { backgroundColor: C.backgroundSelected, borderRadius: 999 },
    skeletonTitle: { width: '82%', height: 34, marginBottom: 12 },
    skeletonSub: { width: '96%', height: 52, borderRadius: 16, marginBottom: 20 },
    skeletonCardShell: {
      borderRadius: 26,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOpacity: 0.11,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    skeletonCard3d: {
      height: 158,
      borderRadius: 26,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      padding: 18,
      flexDirection: 'row',
      gap: 14,
    },
    skeletonListCard: {
      minHeight: 146,
      borderRadius: 24,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      flexDirection: 'row',
      gap: 13,
    },
    skeletonIcon: { width: 58, height: 58, borderRadius: 20 },
    skeletonRowIcon: { width: 48, height: 48, borderRadius: 17 },
    skeletonLineLarge: { width: '78%', height: 18, marginBottom: 12 },
    skeletonLine: { width: '92%', height: 13, marginBottom: 10 },
    skeletonLineShort: { width: '58%', height: 13 },
    skeletonTabs: { width: '100%', height: 48, borderRadius: 18, marginBottom: 20 },
    skeletonChipRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    skeletonChip: { width: 76, height: 30 },
    title: { color: C.text, fontSize: 32, fontWeight: '900', letterSpacing: -0.7 },
    subtitle: { color: C.textSecondary, fontSize: 16, lineHeight: 24, marginTop: 8, marginBottom: 20 },
    heroShell: {
      borderRadius: 28,
      marginBottom: 18,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 13 },
      elevation: 8,
    },
    heroCard: {
      borderRadius: 28,
      padding: 19,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      flexDirection: 'row',
      gap: 14,
      alignItems: 'center',
    },
    heroIcon: {
      width: 58,
      height: 58,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundbutton,
      shadowColor: C.primary,
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 7 },
      elevation: 4,
    },
    heroEyebrow: { color: C.textSecondary, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
    heroTitle: { color: C.text, fontSize: 19, fontWeight: '900', marginTop: 4 },
    heroText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 6 },
    tabBar: {
      flexDirection: 'row',
      padding: 4,
      borderRadius: 18,
      backgroundColor: C.backgroundSelected,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 20,
    },
    tabButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    tabButtonActive: { backgroundColor: C.primary },
    tabText: { color: C.textSecondary, fontSize: 12, fontWeight: '900' },
    tabTextActive: { color: '#fff' },
    planNotice: {
      borderRadius: 18,
      padding: 14,
      marginBottom: 18,
      backgroundColor: `${C.warning}12`,
      borderWidth: 1,
      borderColor: `${C.warning}38`,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    planNoticeText: { flex: 1, color: C.text, fontSize: 12, lineHeight: 18, fontWeight: '700' },
    primaryButton: {
      minHeight: 54,
      borderRadius: 999,
      paddingHorizontal: 18,
      backgroundColor: C.backgroundbutton,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      marginBottom: 18,
      shadowColor: C.primary,
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
    primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
    secondaryButton: {
      minHeight: 52,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: `${C.primary}55`,
      backgroundColor: C.actionCard,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      marginBottom: 14,
    },
    secondaryButtonText: { color: C.primary, fontSize: 14, fontWeight: '900' },
    buttonDisabled: { opacity: 0.55 },
    formShell: {
      borderRadius: 28,
      marginBottom: 22,
      shadowColor: '#000',
      shadowOpacity: 0.13,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 7,
    },
    formCard: { borderRadius: 28, padding: 17, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border },
    formHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
    closeButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.backgroundSelected },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 10 },
    sectionTitle: { color: C.text, fontSize: 18, fontWeight: '900' },
    sectionSub: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 4 },
    countBadge: { minWidth: 30, height: 28, paddingHorizontal: 9, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.actionCard },
    countText: { color: C.primary, fontSize: 12, fontWeight: '900' },
    label: { color: C.textSecondary, fontSize: 11, fontWeight: '900', letterSpacing: 1.05, marginTop: 16, marginBottom: 9 },
    choiceList: { borderRadius: 22, borderWidth: 1, borderColor: C.border, backgroundColor: C.backgroundElement, overflow: 'hidden' },
    choiceRow: { minHeight: 67, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
    choiceRowSelected: { backgroundColor: C.actionCard },
    divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    choiceIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.actionCard },
    choiceIconSelected: { backgroundColor: C.primary },
    choiceTitle: { color: C.text, fontSize: 14, fontWeight: '900' },
    choiceSub: { color: C.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 },
    avatar: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.actionCard },
    avatarText: { color: C.primary, fontSize: 16, fontWeight: '900' },
    emptyCard: { borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.backgroundSelected, flexDirection: 'row', alignItems: 'center', gap: 10 },
    emptyText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, flex: 1 },
    actionChoiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    actionChoice: { minHeight: 44, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.backgroundElement },
    actionChoiceSelected: { backgroundColor: C.primary, borderColor: C.primary },
    actionChoiceText: { color: C.textSecondary, fontSize: 12, fontWeight: '900' },
    actionChoiceTextSelected: { color: '#fff' },
    helperText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 9 },
    triggerList: { gap: 9 },
    triggerCard: { borderRadius: 18, padding: 13, borderWidth: 1, borderColor: C.border, backgroundColor: C.backgroundElement, flexDirection: 'row', alignItems: 'center', gap: 11 },
    triggerCardSelected: { borderColor: `${C.primary}66`, backgroundColor: C.actionCard },
    triggerIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center' },
    instructionsInput: { minHeight: 130, borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.backgroundSelected, color: C.text, padding: 14, fontSize: 13, lineHeight: 20 },
    characterCount: { color: C.tabInactive, fontSize: 10, fontWeight: '800', textAlign: 'right', marginTop: 6 },
    playbookShell: { borderRadius: 24, marginBottom: 13, shadowColor: '#000', shadowOpacity: 0.09, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
    playbookCard: { borderRadius: 24, padding: 15, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    itemIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { color: C.text, fontSize: 15, fontWeight: '900' },
    cardSub: { color: C.textSecondary, fontSize: 13, marginTop: 4 },
    statusBadge: { minHeight: 28, borderRadius: 999, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    statusActive: { backgroundColor: `${C.success}14`, borderColor: `${C.success}50` },
    statusPaused: { backgroundColor: `${C.warning}14`, borderColor: `${C.warning}50` },
    statusText: { color: C.text, fontSize: 10, fontWeight: '900' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 11 },
    metaText: { color: C.textSecondary, fontSize: 13, flex: 1 },
    instructionsPreview: { color: C.text, fontSize: 12, lineHeight: 18, marginTop: 12, padding: 12, borderRadius: 15, backgroundColor: C.backgroundSelected },
    warningRow: { borderRadius: 14, padding: 10, marginTop: 11, backgroundColor: `${C.warning}12`, borderWidth: 1, borderColor: `${C.warning}35`, flexDirection: 'row', alignItems: 'center', gap: 8 },
    warningRowText: { color: C.text, fontSize: 13, lineHeight: 20, flex: 1, fontWeight: '700' },
    cardActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 14 },
    smallAction: { minHeight: 38, borderRadius: 14, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.actionCard, borderWidth: 1, borderColor: `${C.primary}30` },
    smallActionText: { color: C.primary, fontSize: 11, fontWeight: '900' },
    smallDangerAction: { minHeight: 38, borderRadius: 14, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${C.danger}10`, borderWidth: 1, borderColor: `${C.danger}28` },
    smallDangerText: { color: C.danger, fontSize: 11, fontWeight: '900' },
    emptyStateShell: { borderRadius: 24, marginBottom: 18, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
    emptyStateCard: { borderRadius: 24, padding: 20, alignItems: 'center', backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border },
    emptyStateIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.actionCard, marginBottom: 12 },
    emptyStateTitle: { color: C.text, fontSize: 17, fontWeight: '900' },
    emptyStateText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 6 },
    truthCard: { borderRadius: 18, padding: 14, backgroundColor: C.actionCard, borderWidth: 1, borderColor: `${C.primary}28`, flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8 },
    truthText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, flex: 1 },
    errorShell: { borderRadius: 28, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    errorCard: { borderRadius: 28, padding: 22, alignItems: 'center', backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border },
    errorTitle: { color: C.text, fontSize: 21, fontWeight: '900', marginTop: 13 },
    errorText: { color: C.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7, marginBottom: 18 },
    modalRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 34 },
    modalFallback: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.72)' },
    modalOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.40)' },
    modalCard: { maxHeight: '88%', borderRadius: 28, backgroundColor: C.backgroundElement, borderWidth: 1, borderColor: C.border, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 28, shadowOffset: { width: 0, height: 16 }, elevation: 16 },
    modalHeader: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    modalTitle: { color: C.text, fontSize: 19, fontWeight: '900' },
    modalSub: { color: C.textSecondary, fontSize: 11, marginTop: 4 },
    modalLoading: { minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: 24 },
    modalLoadingText: { color: C.textSecondary, fontSize: 12, marginTop: 14 },
    modalContent: { padding: 16, paddingBottom: 30 },
    instructionsCard: { borderRadius: 20, padding: 14, backgroundColor: C.actionCard, borderWidth: 1, borderColor: `${C.primary}28`, marginBottom: 14 },
    instructionsText: { color: C.text, fontSize: 13, lineHeight: 21 },
    releasedDataCard: { borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.backgroundElement, overflow: 'hidden', marginBottom: 14 },
    releasedRow: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
    releasedLabel: { color: C.textSecondary, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
    releasedValue: { color: C.text, fontSize: 13, lineHeight: 20, marginTop: 4 },
    copyButton: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.actionCard },
    modalDisclaimer: { color: C.textSecondary, fontSize: 10, lineHeight: 16, textAlign: 'center', paddingHorizontal: 12 },
  });