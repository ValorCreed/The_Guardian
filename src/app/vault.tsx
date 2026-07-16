import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { API_BASE_URL, api, SecureNoteResponse, VaultItem } from '../services/api';
import OfflineBanner from '../components/OfflineBanner';
import {
  createOfflineVaultSnapshot,
  getCurrentUserEmail,
  getOfflineVaultMemorySnapshot,
  isOfflineReadableError,
  isOfflineVaultStale,
  loadOfflineVaultSnapshot,
  saveOfflineVaultSnapshot,
} from '../services/offlineVault';
import { hapticLight, hapticMedium, hapticSelection, hapticWarning } from '../utils/haptics';
import CardBrandLogo from '../components/CardBrandLogo';
import { detectCardBrand } from '../utils/cardBrand';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const SCREEN_PADDING = 20;
const DOC_CARD_WIDTH = (width - SCREEN_PADDING * 2 - CARD_GAP) / 2;

const VAULT_AUTO_REFRESH_INTERVAL_MS = 60 * 1000;

const fastServerProbe = async (timeoutMs = 2500) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
};


type PreparedVaultScreenData = {
  email: string;
  vaultItems: VaultItem[];
  notes: SecureNoteResponse[];
  offlineMode: boolean;
  offlineSavedAt: string | null;
  loadedAt: number;
};

let vaultScreenMemoryCache: PreparedVaultScreenData | null = null;
let lastOnlineVaultSyncAt = 0;

type VaultTab = 'Passwords' | 'Documents' | 'Cards' | 'Notes';
type Plan = 'FREE' | 'PREMIUM' | 'FAMILY';

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

const getFriendlyDocumentType = (mimeType?: string | null, fileName?: string | null) => {
  const mime = String(mimeType || '').trim().toLowerCase();
  const extension = getFileExtension(fileName);

  if (mime.startsWith('image/')) return 'Image';
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
  } catch {
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
    } catch {
      break;
    }
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'string') cleaned = parsed.trim();
  } catch {
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
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [activeTab, setActiveTab] = useState<VaultTab>('Passwords');
  const [search, setSearch] = useState('');
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [notes, setNotes] = useState<SecureNoteResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>('FREE');
  const [checkingPlan, setCheckingPlan] = useState(true);

  const lastLoadAttemptRef = useRef(0);
  const activeLoadSequenceRef = useRef(0);
  const currentEmailRef = useRef<string | null>(null);


  const isPaidPlan = plan === 'PREMIUM' || plan === 'FAMILY';
  const shouldBlockDocumentAdd = activeTab === 'Documents' && !checkingPlan && !isPaidPlan;

  const loadSubscriptionPlan = async () => {
    try {
      setCheckingPlan(true);
      const subscription = await api
        .getSubscriptionFresh()
        .catch(() => api.getSubscription().catch(() => ({ plan: 'FREE' as const })));

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
    ownerEmail?: string | null
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
      loadedAt: Date.now(),
    };
  };

  const applyPreparedVaultData = (data: PreparedVaultScreenData) => {
    vaultScreenMemoryCache = data;
    setVaultItems(data.vaultItems);
    setNotes(data.notes);
    setOfflineMode(data.offlineMode);
    setOfflineSavedAt(data.offlineSavedAt);
  };

  const applyVaultData = (
    passwords: any[] = [],
    cards: any[] = [],
    documents: any[] = [],
    noteData: SecureNoteResponse[] = [],
    fromOffline = false,
    savedAt?: string | null,
    ownerEmail?: string | null
  ) => {
    applyPreparedVaultData(
      buildVaultScreenData(passwords, cards, documents, noteData, fromOffline, savedAt, ownerEmail)
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
      snapshot.email
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
    const serverReachable = await fastServerProbe(2500);

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
        api.getVaultItems(),
        api.getCards(),
        api.getDocuments(),
        api.getSecureNotes(),
      ]);

      if (loadSequence !== activeLoadSequenceRef.current) {
        return;
      }

      const failedReason = getRejectedReason(results);

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
    return `${filteredNotes.length} secure note${filteredNotes.length === 1 ? '' : 's'}`;
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
      'You can view your saved vault while offline. Add, edit, and delete will work again when The Guardian can reach the server.'
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

  const handleAddPress = () => {
    if (offlineMode) {
      hapticWarning();
      showOfflineWriteWarning();
      return;
    }

    if (activeTab === 'Documents') {
      if (checkingPlan) return;

      if (!isPaidPlan) {
        showDocumentUpgradePrompt();
        return;
      }
    }

    hapticMedium();
    router.push(getAddRoute() as any);
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
          Add your first {type} or adjust your search.
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

            return (
              <TouchableOpacity
                key={`password-${item.id}`}
                style={styles.itemCard}
                onPress={() => openItem(item)}
                activeOpacity={0.76}
              >
                <View style={[styles.avatar, { backgroundColor: getAvatarColor(title) }]}>
                  <Text style={styles.avatarText}>{title.charAt(0).toUpperCase()}</Text>
                </View>

                <View style={styles.cardText}>
                  <Text style={styles.cardName} numberOfLines={1}>{title}</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
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
            );
          })}
    </View>
  );

  const renderDocuments = () => (
    <View style={styles.documentGrid}>
      {documents.length === 0
        ? renderEmpty('document')
        : documents.map((item) => (
            <TouchableOpacity
              key={`document-${item.id}`}
              style={styles.documentCard}
              onPress={() => openItem(item)}
              activeOpacity={0.78}
            >
              <View style={styles.documentTop}>
                <View style={styles.documentIcon}>
                  <Ionicons
                    name={(item.mimeType || '').startsWith('image/') ? 'image-outline' : 'document-text-outline'}
                    size={23}
                    color={C.primary}
                  />
                </View>
                <Ionicons name="lock-closed-outline" size={15} color={C.tabInactive} />
              </View>

              <Text style={styles.documentName} numberOfLines={2}>
                {item.fileName || item.title || 'Document'}
              </Text>
              <Text style={styles.documentCategory} numberOfLines={1}>
                {getFriendlyDocumentType(item.mimeType, item.fileName || item.title)}
              </Text>
              <Text style={styles.documentSize}>{formatSize(item.sizeBytes)}</Text>
            </TouchableOpacity>
          ))}
    </View>
  );

  const renderCards = () => (
    <View style={styles.cardList}>
      {cards.length === 0
        ? renderEmpty('card')
        : cards.map((item) => {
            const brand = detectCardBrand(item.title || 'Card', item.encryptedData || item.website || '');

            return (
              <TouchableOpacity
                key={`card-${item.id}`}
                style={[styles.creditCard, { backgroundColor: getAvatarColor(item.title || 'Card') }]}
                onPress={() => openItem(item)}
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
            );
          })}
    </View>
  );

  const renderNotes = () => (
    <View style={styles.list}>
      {filteredNotes.length === 0
        ? renderEmpty('note')
        : filteredNotes.map((note) => (
            <TouchableOpacity
              key={`note-${note.id}`}
              style={styles.noteCard}
              onPress={() => openNote(note)}
              activeOpacity={0.78}
            >
              <View style={[styles.avatar, { backgroundColor: note.pinned ? C.warning : C.primary }]}>
                <Ionicons name={note.pinned ? 'pin' : 'reader-outline'} size={19} color="#fff" />
              </View>

              <View style={styles.cardText}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {note.title || 'Secure Note'}
                </Text>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {note.category || 'General'} · encrypted
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
          ))}
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
        keyboardDismissMode="on-drag"
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{offlineMode ? 'Offline encrypted vault' : 'Encrypted vault'}</Text>
            <Text style={styles.headerTitle}>My Vault</Text>
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
            <TouchableOpacity
              style={styles.addBtn}
              activeOpacity={0.82}
              onPress={handleAddPress}
            >
              <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.overviewCard}>
          <View style={styles.overviewIcon}>
            <Ionicons name={activeTabIcon as any} size={25} color="#fff" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.overviewLabel}>{activeTab}</Text>
            <Text style={styles.overviewTitle}>{headerCount()}</Text>
          </View>
        </View>

        {offlineMode && (
          <OfflineBanner
            colors={C}
            savedAt={offlineSavedAt}
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
      fontSize: 34,
      fontWeight: '900',
      color: C.text,
      letterSpacing: -0.5,
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
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 7,
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
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 7,
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
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: C.border,
    },

    noteCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: C.border,
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
    },

    cardName: {
      fontSize: 15,
      fontWeight: '900',
      color: C.text,
    },

    cardSub: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 3,
      fontWeight: '600',
    },

    itemMeta: {
      alignItems: 'flex-end',
      gap: 5,
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
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      padding: 16,
      marginBottom: 4,
      borderWidth: 1,
      borderColor: C.border,
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
      fontSize: 14,
      fontWeight: '900',
      color: C.text,
      minHeight: 38,
      lineHeight: 19,
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
      height: 190,
      justifyContent: 'space-between',
      overflow: 'hidden',
    },

    creditCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
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
    },

    creditCardNumber: {
      color: '#fff',
      fontSize: 19,
      letterSpacing: 2,
      fontWeight: '800',
    },

    creditCardBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },

    creditCardBank: {
      color: 'rgba(255,255,255,0.88)',
      fontSize: 13,
      fontWeight: '800',
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
      gap: 8,
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
    },

    skeletonLightBlock: {
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderRadius: 999,
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
