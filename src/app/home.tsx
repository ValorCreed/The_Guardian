import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { useSecurityScore } from '../hooks/useSecurityScore';
import { api, VaultItem } from '../services/api';
import GuardianLogoTile from '../components/GuardianLogoTitle';
import * as Updates from 'expo-updates';
import WhatsNewModal from '../components/WhatsNewModal';
import { WHATS_NEW_VERSION } from '../constants/whatsNew';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type VaultTab = 'Passwords' | 'Documents' | 'Cards' | 'Notes';

const getAvatarColor = (text: string) => {
  const colors = ['#065F46', '#1D4ED8', '#BE123C', '#C2410C', '#7C3AED', '#111827'];
  return colors[Math.max(0, text.length) % colors.length];
};

const getItemTitle = (item: VaultItem) =>
  item.title || item.website || item.fileName || 'Vault item';

const getItemSubtitle = (item: VaultItem) => {
  if (item.itemType === 'PASSWORD') return item.usernameValue || item.website || 'Password login';
  if (item.itemType === 'DOCUMENT') return item.mimeType || 'Encrypted document';
  if (item.itemType === 'NOTE') return item.mimeType || 'Secure note';
  return item.usernameValue || 'Encrypted card';
};

const getItemIcon = (item: VaultItem) => {
  if (item.itemType === 'PASSWORD') return 'key-outline';
  if (item.itemType === 'DOCUMENT') return 'document-text-outline';
  if (item.itemType === 'NOTE') return 'reader-outline';
  return 'card-outline';
};

const normalizePlan = (value?: string) => {
  if (value === 'PREMIUM' || value === 'FAMILY') return value;
  return 'FREE';
};

const HomeScreen = () => {
  const router = useRouter();

  const [userName, setUserName] = useState('');
  const [search, setSearch] = useState('');
  const [passwords, setPasswords] = useState<VaultItem[]>([]);
  const [documents, setDocuments] = useState<VaultItem[]>([]);
  const [cards, setCards] = useState<VaultItem[]>([]);
  const [notes, setNotes] = useState<VaultItem[]>([]);
  const [subscriptionPlan, setSubscriptionPlan] = useState<'FREE' | 'PREMIUM' | 'FAMILY'>('FREE');
  const [loadingVault, setLoadingVault] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  const { colors: C } = useAppTheme();
  const { report, reload: reloadSecurityScore } = useSecurityScore();
  const styles = makeStyles(C);

  useEffect(() => {
    const loadName = async () => {
      const name = await AsyncStorage.getItem('userName');
      if (name) setUserName(name);
    };

    loadName();
  }, []);

  const getHomeCacheKey = async () => {
    const email = await AsyncStorage.getItem('userEmail');
    return `theguardian.home.snapshot.v3:${(email || 'anonymous').trim().toLowerCase()}`;
  };

  const applyHomeSnapshot = useCallback((snapshot: any) => {
    setPasswords(snapshot.passwords || []);
    setDocuments(snapshot.documents || []);
    setCards(snapshot.cards || []);
    setNotes(snapshot.notes || []);
    setSubscriptionPlan(normalizePlan(snapshot.subscriptionPlan));
    setUnreadNotifications(Number(snapshot.unreadNotifications || 0));
  }, []);

  const mapHomeData = (
    passwordData: any[],
    documentData: any[],
    cardData: any[],
    noteData: any[],
    subscription: any,
    notificationCount: any
  ) => {
    const fixedPasswords = passwordData.map((item: any) => ({
      ...item,
      itemType: 'PASSWORD' as const,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    const fixedDocuments = documentData.map((doc: any) => {
      let sizeBytes = 0;

      try {
        sizeBytes = JSON.parse(doc.encryptedNotes || '{}').sizeBytes || 0;
      } catch {
        sizeBytes = 0;
      }

      return {
        id: doc.id,
        itemType: 'DOCUMENT' as const,
        title: doc.documentName,
        fileName: doc.documentName,
        mimeType: doc.documentType,
        encryptedData: doc.encryptedFileUrl,
        notes: doc.encryptedNotes,
        sizeBytes,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    });

    const fixedCards = cardData.map((card: any) => ({
      id: card.id,
      itemType: 'CARD' as const,
      title: card.cardName || 'Saved Card',
      usernameValue:
        card.encryptedCardholderName ||
        card.encryptedCardHolderName ||
        'Cardholder',
      encryptedData: JSON.stringify(card),
      website: card.last4 || '••••',
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    }));

    const fixedNotes = noteData.map((note: any) => ({
      id: note.id,
      itemType: 'NOTE' as const,
      title: note.title || 'Secure Note',
      mimeType: note.category || 'General',
      encryptedData: note.encryptedContent,
      notes: note.encryptedContent,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    }));

    return {
      passwords: fixedPasswords,
      documents: fixedDocuments,
      cards: fixedCards,
      notes: fixedNotes,
      subscriptionPlan: normalizePlan(subscription?.plan),
      unreadNotifications: Number(notificationCount?.unreadCount || 0),
      savedAt: new Date().toISOString(),
    };
  };

  const hydrateHomeData = useCallback(async () => {
    try {
      const cacheKey = await getHomeCacheKey();
      const raw = await AsyncStorage.getItem(cacheKey);

      if (!raw) return false;

      const snapshot = JSON.parse(raw);
      applyHomeSnapshot(snapshot);
      return true;
    } catch {
      return false;
    }
  }, [applyHomeSnapshot]);

  const fetchHomeDataFromServer = useCallback(async (force = false) => {
    try {
      if (force) {
        api.clearCache?.();
      }

      setLoadingVault(true);

      const [
        passwordData,
        documentData,
        cardData,
        noteData,
        subscription,
        notificationCount,
      ] = await Promise.all([
        api.getVaultItems(),
        api.getDocuments(),
        api.getCards(),
        api.getSecureNotes(),
        api.getSubscription().catch(() => ({ plan: 'FREE' as const })),
        api.getUnreadNotificationCount().catch(() => ({ unreadCount: 0 })),
      ]);

      const snapshot = mapHomeData(
        passwordData || [],
        documentData || [],
        cardData || [],
        noteData || [],
        subscription,
        notificationCount
      );

      applyHomeSnapshot(snapshot);

      const cacheKey = await getHomeCacheKey();
      await AsyncStorage.setItem(cacheKey, JSON.stringify(snapshot));
      await AsyncStorage.removeItem('homeNeedsInitialSync');
    } catch (error) {
      console.log('HOME DATA ERROR:', error);
    } finally {
      setLoadingVault(false);
    }
  }, [applyHomeSnapshot]);

  const loadHomeData = useCallback(async () => {
    const needsInitialSync = await AsyncStorage.getItem('homeNeedsInitialSync');

    if (needsInitialSync === 'true') {
      await fetchHomeDataFromServer(true);
      return;
    }

    const hydrated = await hydrateHomeData();

    if (!hydrated) {
      await fetchHomeDataFromServer(true);
    }
  }, [fetchHomeDataFromServer, hydrateHomeData]);

  useFocusEffect(
    useCallback(() => {
      loadHomeData();
    }, [loadHomeData])
  );

  /*
   * Android back gesture / hardware back protection:
   * Home is the authenticated root screen. If Android pops the stack from here,
   * it can expose the previous login/sign-in screen and make it look like the
   * user was logged out. We consume the back gesture while Home is focused.
   */
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);

      return () => subscription.remove();
    }, [])
  );

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        fetchHomeDataFromServer(true),
        reloadSecurityScore(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();

    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const ScoreRing = ({ score }: { score: number }) => {
    const size = 92;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    const animatedScore = useRef(new Animated.Value(0)).current;
    const [displayScore, setDisplayScore] = useState(0);

    useEffect(() => {
      const listenerId = animatedScore.addListener(({ value }) => {
        setDisplayScore(Math.round(value));
      });

      return () => {
        animatedScore.removeListener(listenerId);
      };
    }, [animatedScore]);

    useEffect(() => {
      const safeScore = Math.max(0, Math.min(score, 100));

      Animated.timing(animatedScore, {
        toValue: safeScore,
        duration: 1050,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }, [animatedScore, score]);

    const animatedDashOffset = animatedScore.interpolate({
      inputRange: [0, 100],
      outputRange: [circumference, 0],
      extrapolate: 'clamp',
    });

    const scoreColor =
      score >= 80 ? C.success : score >= 50 ? C.warning : C.danger;

    return (
      <View style={styles.scoreRingWrapper}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255,255,255,0.22)"
            strokeWidth={strokeWidth}
            fill="none"
          />

          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={scoreColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={animatedDashOffset as any}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>

        <View style={styles.scoreTextOverlay}>
          <Text style={styles.scoreNumber}>{displayScore}</Text>
          <Text style={styles.scoreLabel}>Score</Text>
        </View>
      </View>
    );
  };

  const score = report.score;
  const allVaultItems = [...passwords, ...documents, ...cards, ...notes];
  const totalItems = allVaultItems.length;
  const showUpgradeBanner = subscriptionPlan === 'FREE';

  const getRecentTime = (item: VaultItem) => {
    const parsed = new Date(item.updatedAt || item.createdAt || '').getTime();

    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }

    /*
     * Some older card/document responses do not include createdAt/updatedAt.
     * Falling back to the id keeps them visible in Recently updated instead
     * of making the list look like it only supports passwords and notes.
     */
    return Number(item.id || 0);
  };

  const recentItems = useMemo(() => {
    return [...allVaultItems]
      .sort((a, b) => getRecentTime(b) - getRecentTime(a))
      .slice(0, 6);
  }, [allVaultItems]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];

    return allVaultItems
      .filter((item) =>
        `${item.title || ''} ${item.website || ''} ${item.usernameValue || ''} ${item.fileName || ''} ${item.mimeType || ''}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 8);
  }, [search, allVaultItems]);

  const openItem = (item: VaultItem) => {
    if (item.itemType === 'NOTE') {
      router.push({ pathname: '/notedetails', params: { id: String(item.id) } });
      return;
    }

    router.push({
      pathname: '/vaultdetails',
      params: {
        id: String(item.id),
        type: item.itemType,
      },
    });
  };

  const openVaultTab = (tab?: VaultTab) => {
    if (!tab || tab === 'Passwords') {
      router.push('/vault');
    } else {
      router.push({ pathname: '/vault', params: { tab } });
    }
  };

  const scoreTitle =
    score >= 80
      ? 'Strong protection'
      : score >= 50
        ? 'Protection needs a few fixes'
        : 'Security needs attention';

  const statCards = [
    { label: 'Passwords', count: passwords.length, icon: 'key-outline', tab: 'Passwords' as VaultTab },
    { label: 'Documents', count: documents.length, icon: 'document-text-outline', tab: 'Documents' as VaultTab },
    { label: 'Cards', count: cards.length, icon: 'card-outline', tab: 'Cards' as VaultTab },
    { label: 'Notes', count: notes.length, icon: 'reader-outline', tab: 'Notes' as VaultTab },
  ];

  const quickActions = [
    { label: 'Password', icon: 'key-outline', route: '/addpassword' },
    { label: 'Document', icon: 'document-outline', route: '/adddocument' },
    { label: 'Card', icon: 'card-outline', route: '/addcard' },
    { label: 'Note', icon: 'reader-outline', route: '/addnote' },
  ];


  const renderStatsSkeleton = () => (
    <View style={styles.statsGrid}>
      {[1, 2, 3, 4].map((item) => (
        <View key={`stat-skeleton-${item}`} style={styles.statCard}>
          <PulsingSkeleton styles={styles} style={styles.skeletonIcon} />
          <View style={{ flex: 1 }}>
            <PulsingSkeleton styles={styles} style={styles.skeletonNumber} />
            <PulsingSkeleton styles={styles} style={styles.skeletonSmallText} />
          </View>
        </View>
      ))}
    </View>
  );

  const renderRecentSkeleton = () => (
    <View style={styles.recentList}>
      {[1, 2, 3, 4].map((item, index) => (
        <View
          key={`recent-skeleton-${item}`}
          style={[
            styles.recentCard,
            index !== 3 && styles.recentDivider,
          ]}
        >
          <PulsingSkeleton styles={styles} style={styles.recentAvatar} />
          <View style={styles.recentText}>
            <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
            <PulsingSkeleton styles={styles} style={styles.skeletonSubtitle} />
          </View>
          <PulsingSkeleton styles={styles} style={styles.skeletonPill} />
        </View>
      ))}
    </View>
  );

  //Whats new modal addition in the homescreen after updates
  useEffect(() => {
  const checkWhatsNewModal = async () => {
    try {
      /*
       * This key uses your editable WHATS_NEW_VERSION.
       * So whenever you change WHATS_NEW_VERSION in constants/whatsNew.ts,
       * the modal will show again after OTA.
       */
      const currentModalVersion = WHATS_NEW_VERSION;

      const lastSeenVersion = await AsyncStorage.getItem(
        'guardian:lastSeenWhatsNewVersion'
      );

      console.log('WHAT IS NEW CURRENT VERSION:', currentModalVersion);
      console.log('WHAT IS NEW LAST SEEN VERSION:', lastSeenVersion);
      console.log('EXPO UPDATE ID:', Updates.updateId);
      console.log('EXPO IS EMBEDDED LAUNCH:', Updates.isEmbeddedLaunch);

      if (lastSeenVersion !== currentModalVersion) {
        setShowWhatsNew(true);
      }
    } catch (error) {
      console.log('Could not check what is new modal:', error);
    }
  };

  checkWhatsNewModal();
}, []);
/**Closing the Whats New modal */
const closeWhatsNewModal = async () => {
  try {
    await AsyncStorage.setItem(
      'guardian:lastSeenWhatsNewVersion',
      WHATS_NEW_VERSION
    );
  } catch (error) {
    console.log('Could not save what is new version:', error);
  } finally {
    setShowWhatsNew(false);
  }
};

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <GuardianLogoTile
              size={44}
              logoSize={32}
              radius={14}
              style={styles.headerIcon}
            />

            <View>
              <Text style={styles.greeting}>{getGreeting()}</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {userName || 'User'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.headerBtn}
            activeOpacity={0.75}
            onPress={() => router.push('/notifications')}
          >
            <Ionicons
              name={unreadNotifications > 0 ? 'notifications' : 'notifications-outline'}
              size={19}
              color={C.text}
            />

            {unreadNotifications > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroCopy}>
              <View style={styles.planPill}>
                <Ionicons
                  name={subscriptionPlan === 'FREE' ? 'leaf-outline' : 'sparkles-outline'}
                  size={13}
                  color="#fff"
                />
                <Text style={styles.planPillText}>{subscriptionPlan} PLAN</Text>
              </View>

              <Text style={styles.heroTitle}>Your vault is protected</Text>
              <Text style={styles.heroSubtitle}>
                {totalItems} encrypted item{totalItems === 1 ? '' : 's'} stored safely.
              </Text>
            </View>

            <ScoreRing score={score} />
          </View>

          <View style={styles.heroFooter}>
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{report.issues.length}</Text>
              <Text style={styles.heroMetricLabel}>Issues</Text>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricValue}>{report.weakCount}</Text>
              <Text style={styles.heroMetricLabel}>Weak</Text>
            </View>

            <View style={styles.heroDivider} />

            <TouchableOpacity
              style={styles.heroAction}
              activeOpacity={0.8}
              onPress={() => router.push('/security')}
            >
              <Text style={styles.heroActionText}>Review</Text>
              <Ionicons name="arrow-forward" size={15} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={C.tabInactive} />

          <TextInput
            style={styles.searchInput}
            placeholder="Search vault"
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

        {search.trim().length > 0 && (
          <View style={styles.searchResultsCard}>
            <View style={styles.sectionHeaderCompact}>
              <Text style={styles.sectionTitleNoPadding}>Search results</Text>
              <Text style={styles.resultCount}>{searchResults.length}</Text>
            </View>

            {searchResults.length === 0 ? (
              <Text style={styles.emptyText}>No vault item found</Text>
            ) : (
              searchResults.map((item) => (
                <TouchableOpacity
                  key={`${item.itemType}-${item.id}`}
                  style={styles.compactItem}
                  onPress={() => openItem(item)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.compactIcon,
                      { backgroundColor: getAvatarColor(getItemTitle(item)) },
                    ]}
                  >
                    <Ionicons name={getItemIcon(item) as any} size={18} color="#fff" />
                  </View>

                  <View style={styles.compactText}>
                    <Text style={styles.compactTitle} numberOfLines={1}>
                      {getItemTitle(item)}
                    </Text>
                    <Text style={styles.compactSub} numberOfLines={1}>
                      {getItemSubtitle(item)}
                    </Text>
                  </View>

                  <Ionicons name="chevron-forward" size={19} color={C.tabInactive} />
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {loadingVault ? (
          renderStatsSkeleton()
        ) : (
          <View style={styles.statsGrid}>
            {statCards.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.statCard}
                activeOpacity={0.82}
                onPress={() => openVaultTab(item.tab)}
              >
                <View style={styles.statIconCircle}>
                  <Ionicons name={item.icon as any} size={20} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statNumber}>{item.count}</Text>
                  <Text style={styles.statLabel}>{item.label}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleNoPadding}>Quick actions</Text>
          <TouchableOpacity onPress={() => router.push('/vault')}>
            <Text style={styles.viewAll}>Open vault</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.quickActions}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={styles.actionItem}
              activeOpacity={0.85}
              onPress={() => router.push(action.route as any)}
            >
              <View style={styles.actionBtn}>
                <Ionicons name={action.icon as any} size={23} color="#fff" />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleNoPadding}>Recently updated</Text>
          <TouchableOpacity onPress={() => router.push('/vault')}>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>

        {loadingVault ? (
          renderRecentSkeleton()
        ) : recentItems.length === 0 ? (
          <View style={styles.loadingBox}>
            <Ionicons name="lock-closed-outline" size={28} color={C.primary} />
            <Text style={styles.emptyText}>No vault items saved yet</Text>
          </View>
        ) : (
          <View style={styles.recentList}>
            {recentItems.map((item, index) => {
              const title = getItemTitle(item);

              return (
                <TouchableOpacity
                  key={`recent-${item.itemType}-${item.id}`}
                  style={[
                    styles.recentCard,
                    index !== recentItems.length - 1 && styles.recentDivider,
                  ]}
                  onPress={() => openItem(item)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.recentAvatar,
                      { backgroundColor: getAvatarColor(title) },
                    ]}
                  >
                    <Ionicons name={getItemIcon(item) as any} size={18} color="#fff" />
                  </View>

                  <View style={styles.recentText}>
                    <Text style={styles.recentName} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={styles.recentSub} numberOfLines={1}>
                      {getItemSubtitle(item)}
                    </Text>
                  </View>

                  <View style={styles.typePill}>
                    <Text style={styles.typePillText}>{item.itemType}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {showUpgradeBanner && (
          <TouchableOpacity
            style={styles.upgradeBanner}
            activeOpacity={0.86}
            onPress={() => router.push('/subscription')}
          >
            <View style={styles.upgradeIcon}>
              <Ionicons name="sparkles-outline" size={22} color="#fff" />
            </View>

            <View style={styles.upgradeText}>
              <Text style={styles.upgradeTitle}>Upgrade your protection</Text>
              <Text style={styles.upgradeSub}>
                Unlock documents, unlimited notes, backup and family sharing.
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={20} color={C.tabInactive} />
          </TouchableOpacity>
        )}

        <Text style={styles.securityHint}>
          {scoreTitle}. Keep your vault healthy with unique passwords and 2FA.
        </Text>
        </ScrollView>

      <WhatsNewModal
        visible={showWhatsNew}
        onClose={closeWhatsNewModal}
      />
    </SafeAreaView>
  );
};

export default HomeScreen;

const makeStyles = (C: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
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

    headerLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingRight: 12,
    },

    headerIcon: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 3,
    },

    greeting: {
      fontSize: 12,
      color: C.textSecondary,
      fontWeight: '700',
    },

    userName: {
      fontSize: 18,
      fontWeight: '900',
      color: C.text,
      maxWidth: 210,
    },

    headerBtn: {
      position: 'relative',
      width: 42,
      height: 42,
      backgroundColor: C.backgroundElement,
      borderRadius: 21,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.border,
    },

    notificationBadge: {
      position: 'absolute',
      top: -3,
      right: -3,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: C.danger,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: C.backgroundElement,
    },

    notificationBadgeText: {
      color: '#fff',
      fontSize: 9,
      fontWeight: '900',
    },

    heroCard: {
      marginHorizontal: 20,
      marginBottom: 16,
      backgroundColor: C.primary,
      borderRadius: 28,
      padding: 20,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.18,
      shadowRadius: 22,
      elevation: 8,
    },

    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },

    heroCopy: {
      flex: 1,
    },

    planPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginBottom: 12,
    },

    planPillText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.6,
    },

    heroTitle: {
      color: '#fff',
      fontSize: 25,
      fontWeight: '900',
      lineHeight: 30,
    },

    heroSubtitle: {
      color: 'rgba(255,255,255,0.78)',
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6,
    },

    scoreRingWrapper: {
      width: 92,
      height: 92,
      alignItems: 'center',
      justifyContent: 'center',
    },

    scoreTextOverlay: {
      position: 'absolute',
      justifyContent: 'center',
      alignItems: 'center',
    },

    scoreNumber: {
      color: '#fff',
      fontSize: 24,
      fontWeight: '900',
    },

    scoreLabel: {
      fontSize: 9,
      color: 'rgba(255,255,255,0.72)',
      textAlign: 'center',
      lineHeight: 11,
      fontWeight: '800',
    },

    heroFooter: {
      marginTop: 18,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: 20,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
    },

    heroMetric: {
      flex: 1,
    },

    heroMetricValue: {
      color: '#fff',
      fontSize: 17,
      fontWeight: '900',
    },

    heroMetricLabel: {
      color: 'rgba(255,255,255,0.72)',
      fontSize: 11,
      marginTop: 2,
      fontWeight: '700',
    },

    heroDivider: {
      width: 1,
      height: 28,
      backgroundColor: 'rgba(255,255,255,0.18)',
      marginHorizontal: 10,
    },

    heroAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.16)',
    },

    heroActionText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '900',
    },

    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      marginHorizontal: 20,
      marginBottom: 16,
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

    searchResultsCard: {
      backgroundColor: C.backgroundElement,
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: 22,
      padding: 14,
      borderWidth: 1,
      borderColor: C.border,
    },

    sectionHeaderCompact: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },

    resultCount: {
      color: C.primary,
      fontSize: 13,
      fontWeight: '900',
    },

    compactItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
    },

    compactIcon: {
      width: 40,
      height: 40,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },

    compactText: {
      flex: 1,
    },

    compactTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: C.text,
    },

    compactSub: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
    },

    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 20,
      marginBottom: 22,
      gap: 12,
    },

    statCard: {
      width: '48%',
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: C.border,
    },

    statIconCircle: {
      width: 42,
      height: 42,
      borderRadius: 16,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
    },

    statNumber: {
      fontSize: 20,
      fontWeight: '900',
      color: C.text,
    },

    statLabel: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
      fontWeight: '700',
    },

    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      marginBottom: 12,
    },

    sectionTitleNoPadding: {
      fontSize: 18,
      fontWeight: '900',
      color: C.text,
    },

    viewAll: {
      fontSize: 13,
      color: C.primary,
      fontWeight: '900',
    },

    quickActions: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      marginBottom: 24,
      gap: 10,
    },

    actionItem: {
      flex: 1,
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      paddingVertical: 14,
      alignItems: 'center',
      gap: 9,
      borderWidth: 1,
      borderColor: C.border,
    },

    actionBtn: {
      width: 46,
      height: 46,
      backgroundColor: C.actionIconBg || C.primary,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },

    actionLabel: {
      fontSize: 12,
      color: C.text,
      fontWeight: '800',
    },

    recentList: {
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      marginHorizontal: 20,
      marginBottom: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.border,
    },

    recentCard: {
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },

    recentDivider: {
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },

    recentAvatar: {
      width: 44,
      height: 44,
      borderRadius: 17,
      justifyContent: 'center',
      alignItems: 'center',
    },

    recentText: {
      flex: 1,
    },

    recentName: {
      fontSize: 15,
      fontWeight: '900',
      color: C.text,
    },

    recentSub: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
    },

    typePill: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },

    typePillText: {
      color: C.textSecondary,
      fontSize: 9,
      fontWeight: '900',
    },


    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
    },

    skeletonIcon: {
      width: 42,
      height: 42,
      borderRadius: 16,
    },

    skeletonNumber: {
      width: 42,
      height: 18,
      marginBottom: 7,
    },

    skeletonSmallText: {
      width: 66,
      height: 11,
    },

    skeletonTitle: {
      width: '72%',
      height: 14,
      marginBottom: 8,
    },

    skeletonSubtitle: {
      width: '48%',
      height: 11,
    },

    skeletonPill: {
      width: 54,
      height: 24,
      borderRadius: 999,
    },

    loadingBox: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      marginHorizontal: 20,
      marginBottom: 14,
      padding: 22,
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: C.border,
    },

    emptyText: {
      color: C.textSecondary,
      fontSize: 13,
      fontWeight: '700',
    },

    upgradeBanner: {
      backgroundColor: C.securityScoreBg,
      borderRadius: 22,
      marginHorizontal: 20,
      marginTop: 2,
      marginBottom: 14,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: C.securityScore,
    },

    upgradeIcon: {
      width: 46,
      height: 46,
      backgroundColor: C.securityScore || C.warning,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },

    upgradeText: {
      flex: 1,
    },

    upgradeTitle: {
      fontSize: 15,
      fontWeight: '900',
      color: C.text,
    },

    upgradeSub: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
      lineHeight: 17,
    },

    securityHint: {
      marginHorizontal: 20,
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
    },
  });
