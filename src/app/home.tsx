import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import FloatingTabBar from '../components/FloatingTabBar';
import Svg, { Circle } from 'react-native-svg';
import { useAppTheme } from '../context/ThemeContext';
import { useSecurityScore } from '../hooks/useSecurityScore';
import { api, VaultItem } from '../services/api';

const getAvatarColor = (text: string) => {
  const colors = ['#1a5c35', '#1e88e5', '#e53935', '#f5a623', '#7c3aed', '#212121'];
  return colors[text.length % colors.length];
};

const getItemTitle = (item: VaultItem) => item.title || item.website || item.fileName || 'Vault item';

const getItemSubtitle = (item: VaultItem) => {
  if (item.itemType === 'PASSWORD') return item.usernameValue || item.website || 'Password';
  if (item.itemType === 'DOCUMENT') return item.mimeType || 'Document';
  return item.usernameValue || 'Card';
};

const HomeScreen = () => {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [search, setSearch] = useState('');
  const [passwords, setPasswords] = useState<VaultItem[]>([]);
  const [documents, setDocuments] = useState<VaultItem[]>([]);
  const [cards, setCards] = useState<VaultItem[]>([]);
  const [subscriptionPlan, setSubscriptionPlan] = useState<'FREE' | 'PREMIUM' | 'FAMILY'>('FREE');
  const [loadingVault, setLoadingVault] = useState(false);

  const { colors: C } = useAppTheme();
  const { report } = useSecurityScore();
  const styles = makeStyles(C);

  useEffect(() => {
    const loadName = async () => {
      const name = await AsyncStorage.getItem('userName');
      if (name) setUserName(name);
    };
    loadName();
  }, []);

  const loadHomeData = async () => {
    try {
      setLoadingVault(true);

      const [passwordData, documentData, cardData, subscription] = await Promise.all([
        api.getVaultItems(),
        api.getDocuments(),
        api.getCards(),
        api.getSubscription().catch(() => ({ plan: 'FREE' as const })),
      ]);

      const fixedPasswords = passwordData.map((item: any) => ({
        ...item,
        itemType: 'PASSWORD' as const,
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
        };
      });

      const fixedCards = cardData.map((card: any) => ({
        id: card.id,
        itemType: 'CARD' as const,
        title: card.cardName || 'Saved Card',
        usernameValue: card.encryptedCardholderName || card.encryptedCardHolderName || 'Cardholder',
        encryptedData: JSON.stringify(card),
      }));

      setPasswords(fixedPasswords);
      setDocuments(fixedDocuments);
      setCards(fixedCards);
      setSubscriptionPlan(subscription.plan || 'FREE');
    } catch (error) {
      console.log('HOME DATA ERROR:', error);
    } finally {
      setLoadingVault(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadHomeData();
    }, [])
  );

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const ScoreRing = ({ score }: { score: number }) => {
    const size = 80;
    const strokeWidth = 6;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = circumference - (score / 100) * circumference;
    const scoreColor = score >= 80 ? C.success : score >= 50 ? C.warning : C.danger;

    return (
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={C.border} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={scoreColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={progress}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
    );
  };

  const score = report.score;
  const scoreColor = score >= 80 ? C.success : score >= 50 ? C.warning : C.danger;
  const allVaultItems = [...passwords, ...documents, ...cards];
  const showUpgradeBanner = subscriptionPlan === 'FREE';

  const recentPasswords = useMemo(() => {
    return [...passwords]
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 3);
  }, [passwords]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];

    return allVaultItems
      .filter((item) => `${item.title} ${item.website} ${item.usernameValue} ${item.fileName} ${item.mimeType}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, allVaultItems]);

  const openItem = (item: VaultItem) => {
    router.push({
      pathname: '/vaultdetails',
      params: {
        id: String(item.id),
        type: item.itemType,
      },
    });
  };

  const openVaultTab = (tab?: 'Passwords' | 'Documents' | 'Cards') => {
    if (!tab || tab === 'Passwords') router.push('/vault');
    else router.push({ pathname: '/vault', params: { tab } });
  };

  const scoreTitle = score >= 80 ? 'Strong protection' : score >= 50 ? 'Moderate protection' : 'Needs attention';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="shield-checkmark" size={22} color="#fff" />
            </View>
            <View>
              <Text style={styles.greeting}>{getGreeting()}</Text>
              <Text style={styles.userName}>{userName || 'User'}</Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerBtn}>
              <Ionicons name="notifications-outline" size={18} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={C.tabInactive} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search your vault"
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
            <Text style={styles.searchResultsTitle}>Search results</Text>
            {searchResults.length === 0 ? (
              <Text style={styles.emptyText}>No vault item found</Text>
            ) : (
              searchResults.map((item) => (
                <TouchableOpacity key={`${item.itemType}-${item.id}`} style={styles.searchResultItem} onPress={() => openItem(item)}>
                  <View style={[styles.recentAvatar, { backgroundColor: getAvatarColor(getItemTitle(item)) }]}> 
                    <Ionicons
                      name={item.itemType === 'PASSWORD' ? 'key-outline' : item.itemType === 'DOCUMENT' ? 'document-outline' : 'card-outline'}
                      size={18}
                      color="#fff"
                    />
                  </View>
                  <View style={styles.recentText}>
                    <Text style={styles.recentName}>{getItemTitle(item)}</Text>
                    <Text style={styles.recentSub}>{getItemSubtitle(item)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={C.tabInactive} />
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <TouchableOpacity style={styles.scoreCard} activeOpacity={0.8} onPress={() => router.push('/security')}>
          <View style={styles.scoreRingWrapper}>
            <ScoreRing score={score} />
            <View style={styles.scoreTextOverlay}>
              <Text style={[styles.scoreNumber, { color: scoreColor }]}>{score}</Text>
              <Text style={styles.scoreLabel}>Password{`\n`}Score</Text>
            </View>
          </View>

          <View style={styles.scoreInfo}>
            <Text style={styles.scoreTitle}>{scoreTitle}</Text>
            <Text style={styles.scoreSubtitle}>{report.issues.length} issues need your attention</Text>
            <View style={styles.scoreBadges}>
              <View style={[styles.badge, { backgroundColor: C.alertDangerBg }]}> 
                <Text style={styles.badgeText}>{report.weakCount} weak</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: C.alertWarningBg }]}> 
                <Text style={styles.badgeText}>{report.mediumCount} medium</Text>
              </View>
            </View>
          </View>

          <Ionicons name="chevron-forward" size={20} color={C.tabInactive} />
        </TouchableOpacity>

        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statCard} onPress={() => openVaultTab('Passwords')}>
            <Ionicons name="key-outline" size={24} color={C.primary} />
            <Text style={styles.statNumber}>{passwords.length}</Text>
            <Text style={styles.statLabel}>Password(s)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.statCard} onPress={() => openVaultTab('Documents')}>
            <Ionicons name="document-text-outline" size={24} color={C.primary} />
            <Text style={styles.statNumber}>{documents.length}</Text>
            <Text style={styles.statLabel}>Document(s)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.statCard} onPress={() => openVaultTab('Cards')}>
            <Ionicons name="card-outline" size={24} color={C.primary} />
            <Text style={styles.statNumber}>{cards.length}</Text>
            <Text style={styles.statLabel}>Card(s)</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/addpassword')}>
            <View style={styles.actionBtn}>
              <Ionicons name="key-outline" size={28} color="#fff" />
            </View>
            <Text style={styles.actionLabel}>Password</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/adddocument')}>
            <View style={styles.actionBtn}>
              <Ionicons name="document-outline" size={28} color="#fff" />
            </View>
            <Text style={styles.actionLabel}>Document</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/addcard')}>
            <View style={styles.actionBtn}>
              <Ionicons name="card-outline" size={28} color="#fff" />
            </View>
            <Text style={styles.actionLabel}>Card</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent passwords</Text>
          <TouchableOpacity onPress={() => openVaultTab('Passwords')}>
            <Text style={styles.viewAll}>Passwords</Text>
          </TouchableOpacity>
        </View>

        {loadingVault ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={C.primary} />
            <Text style={styles.emptyText}>Loading vault...</Text>
          </View>
        ) : recentPasswords.length === 0 ? (
          <View style={styles.loadingBox}>
            <Text style={styles.emptyText}>No passwords saved yet</Text>
          </View>
        ) : (
          recentPasswords.map((item) => {
            const title = getItemTitle(item);
            return (
              <TouchableOpacity key={`recent-${item.id}`} style={styles.recentCard} onPress={() => openItem(item)}>
                <View style={[styles.recentAvatar, { backgroundColor: getAvatarColor(title) }]}> 
                  <Text style={styles.recentAvatarText}>{title.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.recentText}>
                  <Text style={styles.recentName}>{title}</Text>
                  <Text style={styles.recentSub}>{item.usernameValue || item.website || 'Password'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={C.tabInactive} />
              </TouchableOpacity>
            );
          })
        )}

        {showUpgradeBanner && (
          <TouchableOpacity style={styles.upgradeBanner} onPress={() => router.push('/subscription')}>
            <View style={styles.upgradeIcon}>
              <Ionicons name="sparkles-outline" size={22} color="#fff" />
            </View>
            <View style={styles.upgradeText}>
              <Text style={styles.upgradeTitle}>Upgrade to Premium</Text>
              <Text style={styles.upgradeSub}>Unlock document vault & family sharing</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.tabInactive} />
          </TouchableOpacity>
        )}

        <View style={{ height: 110 }} />
      </ScrollView>

    </SafeAreaView>
  );
};

export default HomeScreen;

const makeStyles = (C: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerIcon: {
      width: 40,
      height: 40,
      backgroundColor: C.primary,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    greeting: { fontSize: 12, color: C.textSecondary },
    userName: { fontSize: 16, fontWeight: 'bold', color: C.text },
    headerRight: { flexDirection: 'row', gap: 8 },
    headerBtn: {
      width: 38,
      height: 38,
      backgroundColor: C.backgroundElement,
      borderRadius: 19,
      justifyContent: 'center',
      alignItems: 'center',
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 50,
      marginHorizontal: 20,
      marginBottom: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 8,
      borderWidth: 1,
      borderColor: C.border,
    },
    searchInput: { flex: 1, fontSize: 15, color: C.text },
    searchResultsCard: {
      backgroundColor: C.backgroundElement,
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: C.border,
    },
    searchResultsTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 },
    searchResultItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    scoreCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      marginHorizontal: 20,
      marginBottom: 16,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    scoreRingWrapper: { width: 80, height: 80, position: 'relative', justifyContent: 'center', alignItems: 'center' },
    scoreTextOverlay: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
    scoreNumber: { fontSize: 20, fontWeight: 'bold' },
    scoreLabel: { fontSize: 8, color: C.textSecondary, textAlign: 'center', lineHeight: 11 },
    scoreInfo: { flex: 1 },
    scoreTitle: { fontSize: 16, fontWeight: 'bold', color: C.text, marginBottom: 2 },
    scoreSubtitle: { fontSize: 12, color: C.textSecondary, marginBottom: 8 },
    scoreBadges: { flexDirection: 'row', gap: 6 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    badgeText: { fontSize: 11, color: C.text },
    statsRow: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 20, gap: 12 },
    statCard: {
      flex: 1,
      backgroundColor: C.backgroundElement,
      borderRadius: 16,
      padding: 14,
      alignItems: 'center',
      gap: 4,
    },
    statNumber: { fontSize: 20, fontWeight: 'bold', color: C.text },
    statLabel: { fontSize: 12, color: C.textSecondary },
    sectionTitle: { fontSize: 17, fontWeight: 'bold', color: C.text, paddingHorizontal: 20, marginBottom: 12 },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    viewAll: { fontSize: 14, color: C.primary, fontWeight: '600' },
    quickActions: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 24, gap: 12 },
    actionItem: { flex: 1, alignItems: 'center', gap: 8 },
    actionBtn: {
      width: 64,
      height: 64,
      backgroundColor: C.actionIconBg || C.primary,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    actionLabel: { fontSize: 13, color: C.text, fontWeight: '500' },
    recentCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 16,
      marginHorizontal: 20,
      marginBottom: 10,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    recentAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    recentAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    recentText: { flex: 1 },
    recentName: { fontSize: 15, fontWeight: '600', color: C.text },
    recentSub: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    loadingBox: {
      backgroundColor: C.backgroundElement,
      borderRadius: 16,
      marginHorizontal: 20,
      marginBottom: 12,
      padding: 18,
      alignItems: 'center',
      gap: 8,
    },
    emptyText: { color: C.textSecondary, fontSize: 13 },
    upgradeBanner: {
      backgroundColor: C.securityScoreBg,
      borderRadius: 16,
      marginHorizontal: 20,
      marginTop: 8,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    upgradeIcon: {
      width: 44,
      height: 44,
      backgroundColor: C.securityScore || C.warning,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    upgradeText: { flex: 1 },
    upgradeTitle: { fontSize: 15, fontWeight: 'bold', color: C.text },
    upgradeSub: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  });
