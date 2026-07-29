import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  type GestureResponderEvent,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../context/ThemeContext';
import { useAppAlert } from '../context/AppAlertContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import VaultItemActionMenu, {
  type VaultActionMenuAnchor,
  type VaultActionMenuFocusRect,
  type VaultActionMenuPreview,
} from '../components/VaultItemActionMenu';
import ExpandingAddButton from '../components/ExpandingAddButton';
import { API_BASE_URL, api, SecureNoteResponse, VaultItem } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi, useCancelableRequest } from '../hooks/useCancelableApi';
import OfflineBanner from '../components/OfflineBanner';
import {
  createOfflineVaultSnapshot,
  getCurrentUserEmail,
  getOfflineVaultMemorySnapshot,
  isOfflineReadableError,
  isOfflineVaultStale,
  loadOfflineVaultSnapshot,
  markOfflineVaultStale,
  saveOfflineVaultSnapshot,
} from '../services/offlineVault';
import { hapticLight, hapticMedium, hapticSelection, hapticWarning } from '../utils/haptics';
import CardBrandLogo from '../components/CardBrandLogo';
import { detectCardBrand } from '../utils/cardBrand';
import { syncGuardianAutofillCache } from '../services/autofillSync';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const SCREEN_PADDING = 20;
const DOC_CARD_WIDTH = (width - SCREEN_PADDING * 2 - CARD_GAP) / 2;
const DOC_CARD_HEIGHT = 190;

const VAULT_AUTO_REFRESH_INTERVAL_MS = 60 * 1000;

const fastServerProbe = async (timeoutMs = 1800, externalSignal?: AbortSignal) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromScreen = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromScreen, { once: true });

  try {
    /*
     * This checks whether the backend process is reachable before starting the
     * heavier vault sync. Any HTTP response means the server is alive, even if
     * the root path returns 401/403/404.
     */
    await fetch(API_BASE_URL, {
      method: 'GET',
      signal: controller.signal,
    });

    return true;
  } catch (error) {
    if (isScreenRequestCancelled(error)) return;
    return false;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortFromScreen);
  }
};


type PreparedVaultScreenData = {
  email: string;
  vaultItems: VaultItem[];
  notes: SecureNoteResponse[];
  offlineMode: boolean;
  offlineSavedAt: string | null;
  offlineSecretsAvailable: boolean;
  loadedAt: number;
};

let vaultScreenMemoryCache: PreparedVaultScreenData | null = null;
let lastOnlineVaultSyncAt = 0;

type VaultTab = 'Passwords' | 'Documents' | 'Cards' | 'Notes';
type Plan = 'FREE' | 'PREMIUM' | 'FAMILY';

type VaultActionTarget = {
  id: number | string;
  itemKey: string;
  itemType: 'PASSWORD' | 'DOCUMENT' | 'CARD' | 'NOTE';
  title: string;
  anchor: VaultActionMenuAnchor;
  focusRect: VaultActionMenuFocusRect | null;
  preview: VaultActionMenuPreview;
};

const tabs: { label: VaultTab; icon: string }[] = [
  { label: 'Passwords', icon: 'key-outline' },
  { label: 'Documents', icon: 'document-text-outline' },
  { label: 'Cards', icon: 'card-outline' },
  { label: 'Notes', icon: 'reader-outline' },
];

const getAvatarColor = (text: string) => {
  const colors = ['#065F46', '#1D4ED8', '#BE123C', '#C2410C', '#7C3AED', '#111827'];
  return colors[Math.max(0, text.length) % colors.length];
};

const formatSize = (bytes?: number) => {
  if (bytes === undefined || bytes === null || bytes <= 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileExtension = (fileName?: string | null) => {
  const cleanName = String(fileName || '').split('?')[0].split('#')[0];
  const parts = cleanName.split('.');

  if (parts.length < 2) return '';

  return String(parts.pop() || '').trim().toLowerCase();
};

const IMAGE_FORMAT_LABELS: Record<string, string> = {
  jpeg: 'JPG',
  jpg: 'JPG',
  png: 'PNG',
  gif: 'GIF',
  webp: 'WEBP',
  heic: 'HEIC',
  heif: 'HEIF',
  avif: 'AVIF',
  bmp: 'BMP',
  svg: 'SVG',
  tif: 'TIFF',
  tiff: 'TIFF',
};

const isImageDocumentFile = (mimeType?: string | null, fileName?: string | null) => {
  const mime = String(mimeType || '').trim().toLowerCase();
  const extension = getFileExtension(fileName);

  return mime.startsWith('image/') || Boolean(IMAGE_FORMAT_LABELS[extension]);
};

const getImageDocumentFormat = (mimeType?: string | null, fileName?: string | null) => {
  const mime = String(mimeType || '').trim().toLowerCase();
  const extension = getFileExtension(fileName);

  if (IMAGE_FORMAT_LABELS[extension]) return IMAGE_FORMAT_LABELS[extension];

  if (mime.startsWith('image/')) {
    const subtype = mime.slice('image/'.length).split(';')[0].split('+')[0].trim();
    return IMAGE_FORMAT_LABELS[subtype] || subtype.toUpperCase() || 'IMAGE';
  }

  return 'IMAGE';
};

const getFriendlyDocumentType = (mimeType?: string | null, fileName?: string | null) => {
  const mime = String(mimeType || '').trim().toLowerCase();
  const extension = getFileExtension(fileName);

  if (isImageDocumentFile(mimeType, fileName)) {
    return getImageDocumentFormat(mimeType, fileName);
  }
  if (mime.startsWith('video/')) return 'Video';
  if (mime.startsWith('audio/')) return 'Audio';

  if (mime === 'application/pdf' || extension === 'pdf') return 'PDF';

  if (
    mime.includes('wordprocessingml') ||
    mime === 'application/msword' ||
    extension === 'docx' ||
    extension === 'doc'
  ) {
    return extension === 'doc' ? 'DOC' : 'DOCX';
  }

  if (
    mime.includes('spreadsheetml') ||
    mime === 'application/vnd.ms-excel' ||
    extension === 'xlsx' ||
    extension === 'xls'
  ) {
    return extension === 'xls' ? 'XLS' : 'XLSX';
  }

  if (
    mime.includes('presentationml') ||
    mime === 'application/vnd.ms-powerpoint' ||
    extension === 'pptx' ||
    extension === 'ppt'
  ) {
    return extension === 'ppt' ? 'PPT' : 'PPTX';
  }

  if (mime.includes('zip') || extension === 'zip') return 'ZIP';
  if (mime.includes('csv') || extension === 'csv') return 'CSV';
  if (mime.startsWith('text/') || extension === 'txt') return 'TXT';

  if (extension) return extension.toUpperCase();

  return 'Document';
};


const getDocumentSize = (doc: any) => {
  if (doc.sizeBytes) return doc.sizeBytes;

  try {
    return JSON.parse(doc.encryptedNotes || '{}').sizeBytes || 0;
  } catch (error) {
    if (isScreenRequestCancelled(error)) return;
    return 0;
  }
};

const normalizeDate = (value?: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

const cleanVaultDisplayValue = (value?: string | null) => {
  if (value === undefined || value === null) return '';

  let cleaned = String(value).trim();

  if (!cleaned || cleaned.startsWith('v1:')) return '';

  for (let index = 0; index < 2; index++) {
    if (!cleaned.includes('%')) break;

    try {
      const decoded = decodeURIComponent(cleaned);
      if (decoded === cleaned) break;
      cleaned = decoded.trim();
    } catch (error) {
    if (isScreenRequestCancelled(error)) return;
      break;
    }
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'string') cleaned = parsed.trim();
  } catch (error) {
    if (isScreenRequestCancelled(error)) return;
    // Keep the cleaned string when it is not JSON.
  }

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  return cleaned;
};

const getRejectedReason = (results: PromiseSettledResult<any>[]) => {
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );

  return failed?.reason || null;
};

const getFulfilledValue = <T,>(
  result: PromiseSettledResult<T>,
  fallback: T
): T => {
  return result.status === 'fulfilled' ? result.value : fallback;
};

const VaultScreen = () => {
  const requestApi = useCancelableApi(api);
  const runCancelable = useCancelableRequest();
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { colors: C } = useAppTheme();
  const { showAlert } = useAppAlert();
  const styles = makeStyles(C);

  const [activeTab, setActiveTab] = useState<VaultTab>('Passwords');
  const [search, setSearch] = useState('');
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [notes, setNotes] = useState<SecureNoteResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);
  const [offlineSecretsAvailable, setOfflineSecretsAvailable] = useState(false);
  const [plan, setPlan] = useState<Plan>('FREE');
  const [checkingPlan, setCheckingPlan] = useState(true);
  const [actionTarget, setActionTarget] = useState<VaultActionTarget | null>(null);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [deletingAction, setDeletingAction] = useState(false);

  const lastLoadAttemptRef = useRef(0);
  const activeLoadSequenceRef = useRef(0);
  const currentEmailRef = useRef<string | null>(null);
  const suppressNextItemPressRef = useRef(false);
  const suppressResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionMenuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionMenuOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceTransitionOpacity = useRef(new Animated.Value(1)).current;
  const vaultItemRefs = useRef<Record<string, any>>({});

  const setVaultItemRef = useCallback((key: string, node: any) => {
    if (node) {
      vaultItemRefs.current[key] = node;
      return;
    }

    delete vaultItemRefs.current[key];
  }, []);


  const isPaidPlan = plan === 'PREMIUM' || plan === 'FAMILY';
  const shouldBlockDocumentAdd = activeTab === 'Documents' && !checkingPlan && !isPaidPlan;

  const loadSubscriptionPlan = async () => {
    try {
      setCheckingPlan(true);

      const serverReachable = await api
        .checkServerReachability(1800)
        .catch(() => false);

      if (!serverReachable) {
        const cachedPlan = String(
          (await AsyncStorage.getItem('subscriptionPlan')) || 'FREE'
        ).toUpperCase();

        setPlan(
          cachedPlan === 'PREMIUM' || cachedPlan === 'FAMILY'
            ? (cachedPlan as Plan)
            : 'FREE'
        );
        return;
      }

      const subscription = await api
        .getSubscriptionFresh()
        .catch(() => requestApi.getSubscription().catch(() => ({ plan: 'FREE' as const })));

      setPlan((subscription?.plan || 'FREE') as Plan);
    } finally {
      setCheckingPlan(false);
    }
  };

  const buildVaultScreenData = (
    passwords: any[] = [],
    cards: any[] = [],
    documents: any[] = [],
    noteData: SecureNoteResponse[] = [],
    fromOffline = false,
    savedAt?: string | null,
    ownerEmail?: string | null,
    secureSecretsAvailable = false
  ): PreparedVaultScreenData => {
    const fixedPasswords = passwords.map((item: any) => ({
      ...item,
      itemType: 'PASSWORD' as const,
    }));

    const fixedCards = cards.map((card: any) => {
      const cardholderName =
        cleanVaultDisplayValue(
          card.encryptedCardholderName ||
            card.encryptedCardHolderName ||
            card.cardholderName
        ) || 'Cardholder';

      return {
        id: card.id,
        itemType: 'CARD' as const,
        title: cleanVaultDisplayValue(card.cardName) || 'Saved Card',
        usernameValue: cardholderName,
        encryptedData: JSON.stringify({
          ...card,
          encryptedCardholderName: cardholderName,
          encryptedCardHolderName: cardholderName,
        }),
        website: cleanVaultDisplayValue(card.last4) || '••••',
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
      };
    });

    const fixedDocuments = documents.map((doc: any) => ({
      id: doc.id,
      itemType: 'DOCUMENT' as const,
      title: doc.documentName,
      fileName: doc.documentName,
      mimeType: doc.documentType,
      sizeBytes: getDocumentSize(doc),
      encryptedData: doc.encryptedFileUrl,
      notes: doc.encryptedNotes,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));

    return {
      email: String(ownerEmail || '').trim().toLowerCase(),
      vaultItems: [...fixedPasswords, ...fixedCards, ...fixedDocuments],
      notes: noteData || [],
      offlineMode: fromOffline,
      offlineSavedAt: savedAt || null,
      offlineSecretsAvailable: fromOffline && secureSecretsAvailable,
      loadedAt: Date.now(),
    };
  };

  const applyPreparedVaultData = (data: PreparedVaultScreenData) => {
    vaultScreenMemoryCache = data;
    setVaultItems(data.vaultItems);
    setNotes(data.notes);
    setOfflineMode(data.offlineMode);
    setOfflineSavedAt(data.offlineSavedAt);
    setOfflineSecretsAvailable(data.offlineSecretsAvailable);
  };

  const applyVaultData = (
    passwords: any[] = [],
    cards: any[] = [],
    documents: any[] = [],
    noteData: SecureNoteResponse[] = [],
    fromOffline = false,
    savedAt?: string | null,
    ownerEmail?: string | null,
    secureSecretsAvailable = false
  ) => {
    applyPreparedVaultData(
      buildVaultScreenData(
        passwords, cards, documents, noteData, fromOffline, savedAt, ownerEmail, secureSecretsAvailable
      )
    );
  };

  const applyOfflineSnapshotInstantly = async (markAsOffline: boolean) => {
    const memorySnapshot = await getOfflineVaultMemorySnapshot();
    const snapshot = memorySnapshot || await loadOfflineVaultSnapshot();

    if (!snapshot) return false;

    applyVaultData(
      snapshot.passwords,
      snapshot.cards,
      snapshot.documents,
      snapshot.notes,
      markAsOffline,
      snapshot.savedAt,
      snapshot.email,
      snapshot.secureSecretsAvailable
    );

    return true;
  };

  const loadVaultItems = async (options?: {
    force?: boolean;
    showFullLoader?: boolean;
    background?: boolean;
  }) => {
    const force = Boolean(options?.force);
    const showFullLoader = Boolean(options?.showFullLoader);
    const background = Boolean(options?.background);
    const now = Date.now();
    const currentEmail = await getCurrentUserEmail();

    if (currentEmailRef.current && currentEmailRef.current !== currentEmail) {
      vaultScreenMemoryCache = null;
      lastOnlineVaultSyncAt = 0;
      setVaultItems([]);
      setNotes([]);
      setOfflineMode(false);
      setOfflineSavedAt(null);
      setOfflineSecretsAvailable(false);
    }

    currentEmailRef.current = currentEmail;

    const hasMatchingMemoryCache = vaultScreenMemoryCache?.email === currentEmail;
    const hasVisibleData = vaultItems.length > 0 || notes.length > 0 || hasMatchingMemoryCache;

    if (!force && vaultScreenMemoryCache && hasMatchingMemoryCache) {
      applyPreparedVaultData(vaultScreenMemoryCache);
    }

    const stale = await isOfflineVaultStale();
    const recentlySynced =
      lastOnlineVaultSyncAt > 0 &&
      now - lastOnlineVaultSyncAt < VAULT_AUTO_REFRESH_INTERVAL_MS;

    /*
     * This prevents a full reload every time the user returns to Vault from a
     * details page. Manual pull-to-refresh still forces a server sync.
     */
    if (!force && recentlySynced && !stale && vaultScreenMemoryCache && hasMatchingMemoryCache) {
      return;
    }

    /*
     * If we have an offline snapshot, show it immediately while the server sync
     * runs silently in the background. This removes the slow blank/skeleton wait.
     */
    if (!force && !hasVisibleData) {
      await applyOfflineSnapshotInstantly(false);
    }

    if (!force && !stale && background && now - lastLoadAttemptRef.current < 8000) {
      return;
    }

    /*
     * Fast offline detection:
     * Before starting the heavier vault section requests, do a tiny server probe.
     * If the laptop/Render server is unreachable, show the local encrypted snapshot
     * immediately instead of waiting for every vault request to timeout.
     */
    const serverReachable = await runCancelable((signal) => fastServerProbe(1800, signal));

    if (serverReachable === false) {
      const loaded = await applyOfflineSnapshotInstantly(true);

      if (loaded) {
        return;
      }
    }

    lastLoadAttemptRef.current = now;

    const loadSequence = activeLoadSequenceRef.current + 1;
    activeLoadSequenceRef.current = loadSequence;

    try {
      if (showFullLoader && !hasVisibleData) {
        setLoading(true);
      }

      const results = await Promise.allSettled([
        requestApi.getVaultItems(),
        requestApi.getCards(),
        requestApi.getDocuments(),
        requestApi.getSecureNotes(),
      ]);

      if (loadSequence !== activeLoadSequenceRef.current) {
        return;
      }

      const failedReason = getRejectedReason(results);

      if (isScreenRequestCancelled(failedReason)) {
        return;
      }

      if (failedReason) {
        console.log('VAULT SERVER SYNC FAILED', failedReason);

        /**
         * Important UX rule:
         * If the user already has visible vault data, do not suddenly switch the
         * whole screen into offline mode because of one slow background refresh.
         * Keep the current encrypted vault visible and only show offline mode
         * when we are using an offline snapshot as the primary source.
         */
        if (hasVisibleData) {
          if (force) {
            Alert.alert(
              'Could not refresh vault',
              'The Guardian could not refresh your vault right now. Your latest loaded vault data is still shown.'
            );
          }
          return;
        }

        if (isOfflineReadableError(failedReason)) {
          const loaded = await applyOfflineSnapshotInstantly(true);
          if (loaded) return;
        }

        Alert.alert(
          'Could not load vault',
          failedReason?.message || 'The Guardian could not load your vault right now.'
        );
        return;
      }

      const passwords = getFulfilledValue(results[0], []);
      const cards = getFulfilledValue(results[1], []);
      const documents = getFulfilledValue(results[2], []);
      const noteData = getFulfilledValue(results[3], []);

      applyVaultData(passwords || [], cards || [], documents || [], noteData || [], false, null, currentEmail);
      lastOnlineVaultSyncAt = Date.now();

      const snapshot = await createOfflineVaultSnapshot({
        passwords: passwords || [],
        cards: cards || [],
        documents: documents || [],
        notes: noteData || [],
      });

      await saveOfflineVaultSnapshot(snapshot);
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      console.log('VAULT LOAD FAILED', error);

      if (!hasVisibleData && isOfflineReadableError(error)) {
        const loaded = await applyOfflineSnapshotInstantly(true);
        if (loaded) return;
      }

      if (!hasVisibleData) {
        Alert.alert('Error', error.message || 'Could not load vault.');
      } else if (force) {
        Alert.alert(
          'Could not refresh vault',
          'The Guardian could not refresh your vault right now. Your latest loaded vault data is still shown.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      /*
       * Preserve the current vault section when returning from a details screen.
       * Before this, every focus with no ?tab= param forced the Vault back to
       * Passwords, so Android native back from Documents/Cards/Notes felt wrong.
       */
      if (tab === 'Documents') setActiveTab('Documents');
      else if (tab === 'Cards') setActiveTab('Cards');
      else if (tab === 'Notes') setActiveTab('Notes');
      else if (tab === 'Passwords') setActiveTab('Passwords');

      loadSubscriptionPlan();
      loadVaultItems({ showFullLoader: true, background: true });
    }, [tab])
  );

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await loadVaultItems({ force: true });
    } finally {
      setRefreshing(false);
    }
  };

  const openItem = (item: VaultItem) => {
    hapticLight();
    router.push({
      pathname: '/vaultdetails',
      params: {
        id: String(item.id),
        type: item.itemType,
        returnTab: activeTab,
      },
    });
  };

  const openNote = (note: SecureNoteResponse) => {
    hapticLight();
    router.push({
      pathname: '/notedetails',
      params: {
        id: String(note.id),
        returnTab: 'Notes',
      },
    });
  };

  const closeActionMenu = useCallback(() => {
    if (deletingAction) return;

    if (actionMenuOpenTimerRef.current) {
      clearTimeout(actionMenuOpenTimerRef.current);
      actionMenuOpenTimerRef.current = null;
    }

    setActionMenuVisible(false);
  }, [deletingAction]);

  const handleActionMenuDismissed = useCallback(() => {
    sourceTransitionOpacity.stopAnimation();
    sourceTransitionOpacity.setValue(0);

    Animated.timing(sourceTransitionOpacity, {
      toValue: 1,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setActionTarget(null);
      }
    });
  }, [sourceTransitionOpacity]);

  const handleRegularItemPress = useCallback((open: () => void) => {
    if (suppressNextItemPressRef.current) {
      suppressNextItemPressRef.current = false;
      return;
    }

    open();
  }, []);

  const showItemActionMenu = useCallback(
    (
      event: GestureResponderEvent,
      itemKey: string,
      borderRadius: number,
      target: Omit<VaultActionTarget, 'anchor' | 'focusRect' | 'itemKey'>
    ) => {
      if (deletingAction) return;

      hapticMedium();

      suppressNextItemPressRef.current = true;

      if (suppressResetTimerRef.current) {
        clearTimeout(suppressResetTimerRef.current);
      }

      suppressResetTimerRef.current = setTimeout(() => {
        suppressNextItemPressRef.current = false;
      }, 850);

      const pageX = Number(event.nativeEvent.pageX || width / 2);
      const pageY = Number(event.nativeEvent.pageY || 260);
      const anchor = { x: pageX, y: pageY };
      const node = vaultItemRefs.current[itemKey];

      const openMenu = (focusRect: VaultActionMenuFocusRect | null) => {
        if (actionMenuCloseTimerRef.current) {
          clearTimeout(actionMenuCloseTimerRef.current);
          actionMenuCloseTimerRef.current = null;
        }

        setActionTarget({
          ...target,
          itemKey,
          anchor,
          focusRect,
        });

        if (actionMenuOpenTimerRef.current) {
          clearTimeout(actionMenuOpenTimerRef.current);
        }

        sourceTransitionOpacity.stopAnimation();
        sourceTransitionOpacity.setValue(1);

        Animated.timing(sourceTransitionOpacity, {
          toValue: 0,
          duration: 95,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start(() => {
          actionMenuOpenTimerRef.current = setTimeout(() => {
            setActionMenuVisible(true);
            actionMenuOpenTimerRef.current = null;
          }, Platform.OS === 'android' ? 45 : 10);
        });
      };

      if (!node || typeof node.measureInWindow !== 'function') {
        openMenu(null);
        return;
      }

      node.measureInWindow(
        (x: number, y: number, measuredWidth: number, measuredHeight: number) => {
          if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            measuredWidth <= 0 ||
            measuredHeight <= 0
          ) {
            openMenu(null);
            return;
          }

          openMenu({
            x,
            y,
            width: measuredWidth,
            height: measuredHeight,
            borderRadius,
          });
        }
      );
    },
    [deletingAction, sourceTransitionOpacity]
  );

  const openTargetForEdit = useCallback(() => {
    const target = actionTarget;
    if (!target) return;

    if (offlineMode) {
      hapticWarning();
      showOfflineWriteWarning();
      return;
    }

    if (target.itemType === 'DOCUMENT') {
      return;
    }

    hapticLight();

    if (target.itemType === 'NOTE') {
      router.push({
        pathname: '/notedetails',
        params: {
          id: String(target.id),
          returnTab: 'Notes',
          mode: 'edit',
        },
      });
      return;
    }

    router.push({
      pathname: '/vaultdetails',
      params: {
        id: String(target.id),
        type: target.itemType,
        returnTab: activeTab,
        mode: 'edit',
      },
    });
  }, [actionTarget, activeTab, offlineMode, router]);

  const removeDeletedTargetFromVisibleData = useCallback(
    (target: VaultActionTarget) => {
      const nextVaultItems =
        target.itemType === 'NOTE'
          ? vaultItems
          : vaultItems.filter(
              (item) =>
                !(
                  String(item.id) === String(target.id) &&
                  item.itemType === target.itemType
                )
            );

      const nextNotes =
        target.itemType === 'NOTE'
          ? notes.filter((note) => String(note.id) !== String(target.id))
          : notes;

      setVaultItems(nextVaultItems);
      setNotes(nextNotes);

      const email = currentEmailRef.current || vaultScreenMemoryCache?.email || '';

      vaultScreenMemoryCache = {
        email,
        vaultItems: nextVaultItems,
        notes: nextNotes,
        offlineMode: false,
        offlineSavedAt: null,
        offlineSecretsAvailable: false,
        loadedAt: Date.now(),
      };

      lastOnlineVaultSyncAt = 0;
    },
    [notes, vaultItems]
  );

  const deleteTarget = useCallback(
    async (target: VaultActionTarget) => {
      if (deletingAction) return;

      /*
       * Dismiss the action menu before starting the network request. The target
       * is captured in this function, so the exit animation can safely clear
       * the selected source while deletion continues. This also guarantees the
       * user is never trapped behind a deleting modal if a follow-up cache or
       * storage operation is slow.
       */
      if (actionMenuOpenTimerRef.current) {
        clearTimeout(actionMenuOpenTimerRef.current);
        actionMenuOpenTimerRef.current = null;
      }
      setActionMenuVisible(false);

      try {
        setDeletingAction(true);

        if (target.itemType === 'PASSWORD') {
          await requestApi.deleteVaultItem(target.id);
        } else if (target.itemType === 'DOCUMENT') {
          await requestApi.deleteDocument(target.id);
        } else if (target.itemType === 'CARD') {
          await requestApi.deleteCard(target.id);
        } else {
          await requestApi.deleteSecureNote(target.id);
        }

        removeDeletedTargetFromVisibleData(target);


        await Promise.allSettled([
          markOfflineVaultStale(),
          AsyncStorage.multiSet([
            ['homeNeedsInitialSync', 'true'],
            ['securityScoreNeedsInitialSync', 'true'],
          ]),
        ]);

        /*
         * Keep the optimistic list visible, then silently rebuild the encrypted
         * offline snapshot and in-memory vault cache from the server.
         */
        void loadVaultItems({ background: true });
        void syncGuardianAutofillCache().catch(() => undefined);

        showAlert({
          title: 'Deleted',
          message: `${target.title} was removed from your vault.`,
          type: 'success',
        });
      } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
        showAlert({
          title: 'Delete failed',
          message: error?.message || 'The item could not be deleted. Please try again.',
          type: 'error',
        });
      } finally {
        setDeletingAction(false);
      }
    },
    [
      deletingAction,
      loadVaultItems,
      removeDeletedTargetFromVisibleData,
      showAlert,
    ]
  );

  const requestTargetDelete = useCallback(() => {
    const target = actionTarget;
    if (!target) return;

    if (offlineMode) {
      hapticWarning();
      showOfflineWriteWarning();
      return;
    }

    hapticWarning();

    showAlert({
      title: `Delete ${target.itemType.toLowerCase()}?`,
      message: `This permanently removes "${target.title}" from your vault.`,
      type: 'warning',
      cancelable: true,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteTarget(target);
          },
        },
      ],
    });
  }, [actionTarget, deleteTarget, offlineMode, showAlert]);

  const searchText = search.trim().toLowerCase();

  const passwords = useMemo(() => {
    return vaultItems.filter(
      (item) =>
        item.itemType === 'PASSWORD' &&
        `${item.title || ''} ${item.website || ''} ${item.usernameValue || ''}`.toLowerCase().includes(searchText)
    );
  }, [vaultItems, searchText]);

  const documents = useMemo(() => {
    return vaultItems.filter(
      (item) =>
        item.itemType === 'DOCUMENT' &&
        `${item.title || ''} ${item.fileName || ''} ${item.mimeType || ''}`.toLowerCase().includes(searchText)
    );
  }, [vaultItems, searchText]);

  const cards = useMemo(() => {
    return vaultItems.filter(
      (item) =>
        item.itemType === 'CARD' &&
        `${item.title || ''} ${item.usernameValue || ''} ${item.website || ''}`.toLowerCase().includes(searchText)
    );
  }, [vaultItems, searchText]);

  const filteredNotes = useMemo(() => {
    return notes.filter((note) =>
      `${note.title || ''} ${note.category || ''}`.toLowerCase().includes(searchText)
    );
  }, [notes, searchText]);


  const headerCount = () => {
    if (activeTab === 'Passwords') return `${passwords.length} login${passwords.length === 1 ? '' : 's'}`;
    if (activeTab === 'Documents') return `${documents.length} encrypted file${documents.length === 1 ? '' : 's'}`;
    if (activeTab === 'Cards') return `${cards.length} saved card${cards.length === 1 ? '' : 's'}`;
    return `${filteredNotes.length} SecureNote${filteredNotes.length === 1 ? '' : 's'}`;
  };

  const getAddRoute = () => {
    if (activeTab === 'Passwords') return '/addpassword';
    if (activeTab === 'Documents') return '/adddocument';
    if (activeTab === 'Cards') return '/addcard';
    return '/addnote';
  };

  const activeTabIcon = tabs.find((item) => item.label === activeTab)?.icon || 'lock-closed-outline';

  const showOfflineWriteWarning = () => {
    Alert.alert(
      'Offline mode',
      offlineSecretsAvailable
        ? 'Your encrypted offline copy lets you view passwords, card details, and SecureNote contents. Adding, editing, deleting, and document downloads require The Guardian to reconnect.'
        : 'Only vault metadata is available on this device right now. Reconnect and refresh the vault to create the protected offline copy of secret values.'
    );
  };


  const showDocumentUpgradePrompt = () => {
    hapticWarning();
    Alert.alert(
      'Document uploads are premium',
      'Free accounts can view existing documents, but uploading new encrypted documents requires Premium or Family.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/subscription?from=vault-documents') },
      ]
    );
  };

  const getAddNavigationAction = () => {
    if (offlineMode) {
      hapticWarning();
      showOfflineWriteWarning();
      return null;
    }

    if (activeTab === 'Documents') {
      if (checkingPlan) return null;

      if (!isPaidPlan) {
        showDocumentUpgradePrompt();
        return null;
      }
    }

    const route = getAddRoute();

    hapticMedium();

    return () => {
      router.push(route as any);
    };
  };

  const handleAddPress = () => {
    const navigate = getAddNavigationAction();
    navigate?.();
  };

  const renderDocumentUpgradeCard = () => (
    <View style={styles.documentUpgradeCard}>
      <View style={styles.documentUpgradeIcon}>
        <Ionicons name="document-text-outline" size={32} color={C.primary} />
      </View>

      <Text style={styles.documentUpgradeTitle}>Upgrade to add documents</Text>
      <Text style={styles.documentUpgradeSub}>
        Free accounts can view saved documents, but uploading encrypted PDFs, images, and files requires Premium or Family.
      </Text>

      <TouchableOpacity
        style={styles.documentUpgradeBtn}
        onPress={() => { hapticMedium(); router.push('/subscription?from=vault-documents'); }}
        activeOpacity={0.85}
      >
        <Ionicons name="sparkles-outline" size={18} color="#fff" />
        <Text style={styles.documentUpgradeBtnText}>Upgrade plan</Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmpty = (type: 'password' | 'document' | 'card' | 'note') => {
    if (type === 'document' && !checkingPlan && !isPaidPlan) {
      return renderDocumentUpgradeCard();
    }

    const route =
      type === 'password'
        ? '/addpassword'
        : type === 'document'
          ? '/adddocument'
          : type === 'card'
            ? '/addcard'
            : '/addnote';

    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Ionicons
            name={
              type === 'password'
                ? 'key-outline'
                : type === 'document'
                  ? 'document-outline'
                  : type === 'card'
                    ? 'card-outline'
                    : 'reader-outline'
            }
            size={34}
            color={C.primary}
          />
        </View>

        <Text style={styles.emptyTitle}>No {type}s found</Text>
        <Text style={styles.emptySub}>
          Add your first {type}.
        </Text>

        {!offlineMode && (
          <TouchableOpacity
            style={styles.emptyBtn}
            activeOpacity={0.82}
            onPress={type === 'document' ? handleAddPress : () => router.push(route as any)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.emptyBtnText}>Add {type}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderPasswordList = () => (
    <View style={styles.list}>
      {passwords.length === 0
        ? renderEmpty('password')
        : passwords.map((item) => {
            const title = item.title || item.website || 'Untitled login';
            const itemKey = `password-${item.id}`;
            const selected = actionTarget?.itemKey === itemKey;

            return (
              <Animated.View
                key={itemKey}
                style={[
                  styles.listItemTransitionWrap,
                  selected && { opacity: sourceTransitionOpacity },
                ]}
              >
              <TouchableOpacity
                ref={(node) => setVaultItemRef(itemKey, node)}
                style={styles.itemCard}
                onPress={() => handleRegularItemPress(() => openItem(item))}
                onLongPress={(event) =>
                  showItemActionMenu(
                    event,
                    itemKey,
                    22,
                    {
                      id: item.id,
                      itemType: 'PASSWORD',
                      title,
                      preview: {
                        kind: 'password',
                        title,
                        subtitle: item.usernameValue || item.website || 'Login details',
                        leadingText: title.charAt(0).toUpperCase(),
                        leadingColor: getAvatarColor(title),
                        meta: normalizeDate(item.updatedAt || item.createdAt),
                      },
                    }
                  )
                }
                delayLongPress={430}
                activeOpacity={0.76}
              >
                <View style={[styles.avatar, { backgroundColor: getAvatarColor(title) }]}>
                  <Text style={styles.avatarText}>{title.charAt(0).toUpperCase()}</Text>
                </View>

                <View style={styles.cardText}>
                  <Text style={styles.cardName}>{title}</Text>
                  <Text style={styles.cardSub}>
                    {item.usernameValue || item.website || 'Login details'}
                  </Text>
                </View>

                <View style={styles.itemMeta}>
                  {!!(item.updatedAt || item.createdAt) && (
                    <Text style={styles.itemDate}>
                      {normalizeDate(item.updatedAt || item.createdAt)}
                    </Text>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
                </View>
              </TouchableOpacity>
              </Animated.View>
            );
          })}
    </View>
  );

  const renderDocuments = () => (
    <View style={styles.documentGrid}>
      {documents.length === 0
        ? renderEmpty('document')
        : documents.map((item) => {
            const itemKey = `document-${item.id}`;
            const selected = actionTarget?.itemKey === itemKey;

            return (
              <Animated.View
                key={itemKey}
                style={[
                  styles.documentItemTransitionWrap,
                  selected && { opacity: sourceTransitionOpacity },
                ]}
              >
              <TouchableOpacity
                ref={(node) => setVaultItemRef(itemKey, node)}
                style={styles.documentCard}
                onPress={() => handleRegularItemPress(() => openItem(item))}
                onLongPress={(event) =>
                  showItemActionMenu(
                    event,
                    itemKey,
                    24,
                    {
                      id: item.id,
                      itemType: 'DOCUMENT',
                      title: item.fileName || item.title || 'Document',
                      preview: {
                        kind: 'document',
                        title: item.fileName || item.title || 'Document',
                        category: getFriendlyDocumentType(item.mimeType, item.fileName || item.title),
                        size: formatSize(item.sizeBytes),
                        isImage: isImageDocumentFile(item.mimeType, item.fileName || item.title),
                      },
                    }
                  )
                }
                delayLongPress={430}
                activeOpacity={0.78}
              >
                <View style={styles.documentTop}>
                  <View style={styles.documentIcon}>
                    <Ionicons
                      name={isImageDocumentFile(item.mimeType, item.fileName || item.title) ? 'image-outline' : 'document-text-outline'}
                      size={23}
                      color={C.primary}
                    />
                  </View>
                  <Ionicons name="lock-closed-outline" size={15} color={C.tabInactive} />
                </View>

                <Text
                  style={styles.documentName}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {item.fileName || item.title || 'Document'}
                </Text>
                <Text style={styles.documentCategory} numberOfLines={1}>
                  {getFriendlyDocumentType(item.mimeType, item.fileName || item.title)}
                </Text>
                <Text style={styles.documentSize} numberOfLines={1}>
                  {formatSize(item.sizeBytes)}
                </Text>
              </TouchableOpacity>
              </Animated.View>
            );
          })}
    </View>
  );

  const renderCards = () => (
    <View style={styles.cardList}>
      {cards.length === 0
        ? renderEmpty('card')
        : cards.map((item) => {
            const brand = detectCardBrand(item.title || 'Card', item.encryptedData || item.website || '');
            const itemKey = `card-${item.id}`;
            const selected = actionTarget?.itemKey === itemKey;

            return (
              <Animated.View
                key={itemKey}
                style={[
                  styles.cardItemTransitionWrap,
                  selected && { opacity: sourceTransitionOpacity },
                ]}
              >
              <TouchableOpacity
                ref={(node) => setVaultItemRef(itemKey, node)}
                style={[
                  styles.creditCard,
                  { backgroundColor: getAvatarColor(item.title || 'Card') },
                ]}
                onPress={() => handleRegularItemPress(() => openItem(item))}
                onLongPress={(event) =>
                  showItemActionMenu(
                    event,
                    itemKey,
                    28,
                    {
                      id: item.id,
                      itemType: 'CARD',
                      title: item.title || 'Saved Card',
                      preview: {
                        kind: 'card',
                        title: item.title || 'Saved Card',
                        cardholder: item.usernameValue || 'Cardholder',
                        last4: item.website || '••••',
                        backgroundColor: getAvatarColor(item.title || 'Card'),
                        brand,
                      },
                    }
                  )
                }
                delayLongPress={430}
                activeOpacity={0.85}
              >
                <View style={styles.creditCardTop}>
                  <View>
                    <CardBrandLogo brand={brand} compact />
                    <Text style={styles.creditCardLabel}>SECURE CARD</Text>
                    <Text style={styles.creditCardName}>{item.title || 'Saved Card'}</Text>
                  </View>
                  <Ionicons name="card-outline" size={28} color="#fff" />
                </View>

                <Text style={styles.creditCardNumber}>••••  ••••  ••••  {item.website || '••••'}</Text>

                <View style={styles.creditCardBottom}>
                  <Text style={styles.creditCardBank}>{item.usernameValue || 'Cardholder'}</Text>
                  <View style={styles.cardEncryptedPill}>
                    <Ionicons name="lock-closed" size={10} color="#fff" />
                    <Text style={styles.cardEncryptedText}>Encrypted</Text>
                  </View>
                </View>
              </TouchableOpacity>
              </Animated.View>
            );
          })}
    </View>
  );

  const renderNotes = () => (
    <View style={styles.list}>
      {filteredNotes.length === 0
        ? renderEmpty('note')
        : filteredNotes.map((note) => {
            const itemKey = `note-${note.id}`;
            const selected = actionTarget?.itemKey === itemKey;

            return (
              <Animated.View
                key={itemKey}
                style={[
                  styles.listItemTransitionWrap,
                  selected && { opacity: sourceTransitionOpacity },
                ]}
              >
              <TouchableOpacity
                ref={(node) => setVaultItemRef(itemKey, node)}
                style={styles.noteCard}
                onPress={() => handleRegularItemPress(() => openNote(note))}
                onLongPress={(event) =>
                  showItemActionMenu(
                    event,
                    itemKey,
                    22,
                    {
                      id: note.id,
                      itemType: 'NOTE',
                      title: note.title || 'SecureNote',
                      preview: {
                        kind: 'note',
                        title: note.title || 'SecureNote',
                        subtitle: `${note.category || 'General'}`,
                        leadingColor: note.pinned ? C.warning : C.primary,
                        pinned: Boolean(note.pinned),
                      },
                    }
                  )
                }
                delayLongPress={430}
                activeOpacity={0.78}
              >
                <View style={[styles.avatar, { backgroundColor: note.pinned ? C.warning : C.primary }]}>
                  <Ionicons name={note.pinned ? 'pin' : 'reader-outline'} size={19} color="#fff" />
                </View>

                <View style={styles.cardText}>
                  <Text style={styles.cardName}>
                    {note.title || 'SecureNote'}
                  </Text>
                  <Text style={styles.cardSub}>
                    {note.category || 'General'}
                  </Text>
                </View>

                <View style={styles.noteRight}>
                  {note.pinned && (
                    <View style={styles.pinnedPill}>
                      <Text style={styles.pinnedText}>PINNED</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
                </View>
              </TouchableOpacity>
              </Animated.View>
            );
          })}
    </View>
  );


  const renderVaultSkeleton = () => {
    if (activeTab === 'Documents') {
      return (
        <View style={styles.documentGrid}>
          {[1, 2, 3, 4].map((item) => (
            <View key={`document-skeleton-${item}`} style={styles.documentCard}>
              <PulsingSkeleton styles={styles} style={styles.documentIcon} />
              <PulsingSkeleton styles={styles} style={styles.skeletonDocTitle} />
              <PulsingSkeleton styles={styles} style={styles.skeletonDocSub} />
              <PulsingSkeleton styles={styles} style={styles.skeletonDocSize} />
            </View>
          ))}
        </View>
      );
    }

    if (activeTab === 'Cards') {
      return (
        <View style={styles.cardList}>
          {[1, 2].map((item) => (
            <View key={`card-skeleton-${item}`} style={styles.creditCardSkeleton}>
              <PulsingSkeleton styles={styles} style={[styles.skeletonLightBlock, styles.skeletonCardTitle]} />
              <PulsingSkeleton styles={styles} style={[styles.skeletonLightBlock, styles.skeletonCardNumber]} />
              <View style={styles.skeletonCardBottomRow}>
                <PulsingSkeleton styles={styles} style={[styles.skeletonLightBlock, styles.skeletonCardSmall]} />
                <PulsingSkeleton styles={styles} style={[styles.skeletonLightBlock, styles.skeletonCardSmall]} />
              </View>
            </View>
          ))}
        </View>
      );
    }

    return (
      <View style={styles.list}>
        {[1, 2, 3, 4, 5].map((item) => (
          <View key={`list-skeleton-${item}`} style={styles.itemCard}>
            <PulsingSkeleton styles={styles} style={styles.avatar} />
            <View style={styles.cardText}>
              <PulsingSkeleton styles={styles} style={styles.skeletonListTitle} />
              <PulsingSkeleton styles={styles} style={styles.skeletonListSub} />
            </View>
            <PulsingSkeleton styles={styles} style={styles.skeletonChevron} />
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
      <ScrollView
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
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>My Vault</Text>
            <Text style={styles.headerSubtitle}>{headerCount()}</Text>
          </View>

          {activeTab === 'Documents' && !isPaidPlan ? (
            <TouchableOpacity
              style={styles.headerUpgradeBtn}
              activeOpacity={0.82}
              disabled={checkingPlan}
              onPress={handleAddPress}
            >
              {checkingPlan ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles-outline" size={17} color="#fff" />
                  <Text style={styles.headerUpgradeText}>Upgrade</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <ExpandingAddButton
              color={C.background}
              style={styles.addBtn}
              accessibilityLabel={`Add ${activeTab.toLowerCase().replace(/s$/, '')}`}
              onRequestOpen={() => getAddNavigationAction()}
            />
          )}
        </View>

        {offlineMode && (
          <OfflineBanner
            colors={C}
            savedAt={offlineSavedAt}
            message={offlineSecretsAvailable
              ? "Showing the encrypted offline vault saved on this device. Items might take longer to access in this mode."
              : "Showing offline vault metadata. Reconnect and refresh to restore protected offline access to passwords, card details, and SecureNotes."}
            onRetry={() => { hapticLight(); loadVaultItems({ force: true }); }}
          />
        )}

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={C.tabInactive} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${activeTab.toLowerCase()}`}
            placeholderTextColor={C.tabInactive}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />

          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={C.tabInactive} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tabRow}>
          {tabs.map((tabItem) => {
            const isActive = activeTab === tabItem.label;

            return (
              <TouchableOpacity
                key={tabItem.label}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => {
                  hapticSelection();
                  setActiveTab(tabItem.label);
                  setSearch('');
                }}
                activeOpacity={0.78}
              >
                <Ionicons
                  name={tabItem.icon as any}
                  size={15}
                  color={isActive ? '#fff' : C.tabInactive}
                />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tabItem.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          renderVaultSkeleton()
        ) : activeTab === 'Passwords' ? (
          renderPasswordList()
        ) : activeTab === 'Documents' ? (
          renderDocuments()
        ) : activeTab === 'Cards' ? (
          renderCards()
        ) : (
          renderNotes()
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <VaultItemActionMenu
        visible={actionMenuVisible}
        anchor={actionTarget?.anchor || null}
        focusRect={actionTarget?.focusRect || null}
        preview={actionTarget?.preview || null}
        title={actionTarget?.title || 'Vault item'}
        deleting={deletingAction}
        showEdit={actionTarget?.itemType !== 'DOCUMENT'}
        onClose={closeActionMenu}
        onDismissed={handleActionMenuDismissed}
        onEdit={openTargetForEdit}
        onDelete={requestTargetDelete}
      />
    </SafeAreaView>
  );
};

export default VaultScreen;

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

const makeStyles = (C: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },

    keyboardAvoider: {
      flex: 1,
    },

    listItemTransitionWrap: {
      width: '100%',
    },

    documentItemTransitionWrap: {
      width: DOC_CARD_WIDTH,
      height: DOC_CARD_HEIGHT,
    },

    cardItemTransitionWrap: {
      width: '100%',
    },

    scrollContent: {
      paddingBottom: 140,
    },

    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 14,
    },

    eyebrow: {
      fontSize: 13,
      color: C.textSecondary,
      fontWeight: '800',
      marginBottom: 2,
    },

    headerTitle: {
      fontSize: 32,
      fontWeight: '900',
      color: C.text,
      letterSpacing: -0.5,
    },

    headerSubtitle: {
      marginTop: 3,
      color: C.textSecondary,
      fontSize: 13,
      fontWeight: '700',
    },

    addBtn: {
      width: 48,
      height: 48,
      backgroundColor: C.primary,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: C.primary,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.14,
      shadowRadius: 16,
      elevation: 4,
    },


    headerUpgradeBtn: {
      minWidth: 104,
      height: 48,
      backgroundColor: C.primary,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'row',
      gap: 7,
      paddingHorizontal: 14,
      shadowColor: C.primary,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.14,
      shadowRadius: 16,
      elevation: 4,
    },

    headerUpgradeText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '900',
    },

    overviewCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginHorizontal: 20,
      marginBottom: 16,
      backgroundColor: C.primary,
      borderRadius: 28,
      padding: 18,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    overviewIcon: {
      width: 54,
      height: 54,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.16)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    overviewLabel: {
      color: 'rgba(255,255,255,0.72)',
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },

    overviewTitle: {
      color: '#fff',
      fontSize: 20,
      fontWeight: '900',
      marginTop: 2,
    },

    overviewSub: {
      color: 'rgba(255,255,255,0.72)',
      fontSize: 12,
      lineHeight: 17,
      marginTop: 3,
    },

    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      marginHorizontal: 20,
      marginBottom: 14,
      paddingHorizontal: 16,
      paddingVertical: 13,
      gap: 8,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    searchInput: {
      flex: 1,
      fontSize: 14,
      color: C.text,
      fontWeight: '600',
    },

    tabRow: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginBottom: 16,
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 5,
      borderWidth: 1,
      borderColor: C.border,
      gap: 4,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    tab: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 9,
      borderRadius: 18,
      gap: 4,
    },

    tabActive: {
      backgroundColor: C.primary,
    },

    tabText: {
      fontSize: 10,
      color: C.tabInactive,
      fontWeight: '900',
    },

    tabTextActive: {
      color: '#fff',
    },

    list: {
      paddingHorizontal: 20,
      gap: 10,
    },

    itemCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    noteCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    avatar: {
      width: 46,
      height: 46,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },

    avatarText: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 17,
    },

    cardText: {
      flex: 1,
      minWidth: 0,
      flexShrink: 1,
    },

    cardName: {
      fontSize: 15,
      fontWeight: '900',
      color: C.text,
      lineHeight: 21,
      flexShrink: 1,
    },

    cardSub: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 3,
      fontWeight: '600',
      lineHeight: 18,
      flexShrink: 1,
    },

    itemMeta: {
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: 5,
      flexShrink: 0,
    },

    itemDate: {
      color: C.textSecondary,
      fontSize: 10,
      fontWeight: '800',
    },

    documentGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 20,
      gap: CARD_GAP,
    },

    documentCard: {
      width: DOC_CARD_WIDTH,
      height: DOC_CARD_HEIGHT,
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    documentTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },

    documentIcon: {
      width: 48,
      height: 48,
      borderRadius: 18,
      backgroundColor: C.actionCard,
      justifyContent: 'center',
      alignItems: 'center',
    },

    documentName: {
      height: 38,
      fontSize: 14,
      fontWeight: '900',
      color: C.text,
      lineHeight: 19,
      flexShrink: 0,
    },

    documentCategory: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 7,
      fontWeight: '700',
    },

    documentSize: {
      fontSize: 12,
      color: C.tabInactive,
      marginTop: 4,
      fontWeight: '700',
    },


    documentUpgradeCard: {
      marginHorizontal: 3,
      backgroundColor: C.backgroundElement,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: C.border,
      padding: 22,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    documentUpgradeIcon: {
      width: 74,
      height: 74,
      borderRadius: 26,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },

    documentUpgradeTitle: {
      color: C.text,
      fontSize: 18,
      fontWeight: '900',
      textAlign: 'center',
    },

    documentUpgradeSub: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 18,
    },

    documentUpgradeBtn: {
      backgroundColor: C.primary,
      borderRadius: 999,
      paddingHorizontal: 18,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },

    documentUpgradeBtnText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '900',
    },

    cardList: {
      paddingHorizontal: 20,
      gap: 14,
    },

    creditCard: {
      borderRadius: 28,
      padding: 22,
      minHeight: 190,
      justifyContent: 'space-between',
      overflow: 'hidden',
      gap: 18,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    creditCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },

    creditCardLabel: {
      color: 'rgba(255,255,255,0.62)',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
      marginTop: 8,
      marginBottom: 4,
    },

    creditCardName: {
      color: '#fff',
      fontSize: 18,
      fontWeight: '900',
      lineHeight: 24,
      flexShrink: 1,
    },

    creditCardNumber: {
      color: '#fff',
      fontSize: 19,
      letterSpacing: 2,
      fontWeight: '800',
      lineHeight: 28,
      flexShrink: 1,
    },

    creditCardBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 12,
      flexWrap: 'wrap',
    },

    creditCardBank: {
      color: 'rgba(255,255,255,0.88)',
      fontSize: 13,
      fontWeight: '800',
      lineHeight: 19,
      flexShrink: 1,
    },

    cardEncryptedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(255,255,255,0.18)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },

    cardEncryptedText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '900',
    },

    noteRight: {
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: 8,
      flexShrink: 0,
    },

    pinnedPill: {
      backgroundColor: C.alertWarningBg,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },

    pinnedText: {
      color: C.warning,
      fontSize: 9,
      fontWeight: '900',
    },


    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
      opacity: 0.85,
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },

    skeletonLightBlock: {
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderRadius: 999,
      shadowColor: '#000',
      shadowOpacity: 0.03,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },

    skeletonListTitle: {
      width: '68%',
      height: 15,
      marginBottom: 9,
    },

    skeletonListSub: {
      width: '45%',
      height: 11,
    },

    skeletonChevron: {
      width: 22,
      height: 22,
    },

    skeletonDocTitle: {
      width: '88%',
      height: 14,
      marginTop: 2,
      marginBottom: 10,
    },

    skeletonDocSub: {
      width: '70%',
      height: 11,
      marginBottom: 8,
    },

    skeletonDocSize: {
      width: '42%',
      height: 10,
    },

    creditCardSkeleton: {
      borderRadius: 24,
      padding: 20,
      height: 176,
      justifyContent: 'space-between',
      backgroundColor: C.primary,
      opacity: 0.88,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    skeletonCardTitle: {
      width: '45%',
      height: 16,
    },

    skeletonCardNumber: {
      width: '86%',
      height: 19,
    },

    skeletonCardBottomRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },

    skeletonCardSmall: {
      width: '30%',
      height: 12,
    },

    emptyState: {
      paddingVertical: 56,
      justifyContent: 'center',
      alignItems: 'center',
      width: '100%',
      paddingHorizontal: 30,
      backgroundColor: 'transparent',
    },

    emptyIcon: {
      width: 76,
      height: 76,
      borderRadius: 28,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },

    emptyTitle: {
      marginTop: 8,
      color: C.text,
      fontSize: 17,
      fontWeight: '900',
      textAlign: 'center',
    },

    emptySub: {
      marginTop: 6,
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },

    emptyBtn: {
      marginTop: 16,
      backgroundColor: C.primary,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },

    emptyBtnText: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 13,
    },
  });
