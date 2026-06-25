import React, { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import FloatingTabBar from '../components/FloatingTabBar';
import { useAppTheme } from '../context/ThemeContext';
import { api, VaultItem } from '../services/api';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const SCREEN_PADDING = 20;
const DOC_CARD_WIDTH = (width - SCREEN_PADDING * 2 - CARD_GAP) / 2;

const getAvatarColor = (text: string) => {
  const colors = ['#1a5c35', '#1e88e5', '#e53935', '#f5a623', '#7c3aed', '#212121'];
  return colors[text.length % colors.length];
};

const formatSize = (bytes?: number) => {
  if (bytes === undefined || bytes === null || bytes <= 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getDocumentSize = (doc: any) => {
  if (doc.sizeBytes) return doc.sizeBytes;

  try {
    return JSON.parse(doc.encryptedNotes || '{}').sizeBytes || 0;
  } catch {
    return 0;
  }
};

const VaultScreen = () => {
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [activeTab, setActiveTab] = useState('Passwords');
  const [search, setSearch] = useState('');
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadVaultItems = async () => {
    try {
      setLoading(true);

      const [passwords, cards, documents] = await Promise.all([
        api.getVaultItems(),
        api.getCards(),
        api.getDocuments(),
      ]);

      const fixedPasswords = passwords.map((item: any) => ({
        ...item,
        itemType: 'PASSWORD',
      }));

      const fixedCards = cards.map((card: any) => ({
        id: card.id,
        itemType: 'CARD',
        title: card.cardName || 'Saved Card',
        usernameValue: card.encryptedCardholderName || 'Cardholder',
        encryptedData: JSON.stringify(card),
        website: card.last4 || '••••',
      }));

      const fixedDocuments = documents.map((doc: any) => ({
        id: doc.id,
        itemType: 'DOCUMENT',
        title: doc.documentName,
        fileName: doc.documentName,
        mimeType: doc.documentType,
        sizeBytes: getDocumentSize(doc),
        encryptedData: doc.encryptedFileUrl,
      }));

      setVaultItems([...fixedPasswords, ...fixedCards, ...fixedDocuments]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not load vault.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (tab === 'Documents') setActiveTab('Documents');
      else if (tab === 'Cards') setActiveTab('Cards');
      else setActiveTab('Passwords');

      loadVaultItems();
    }, [tab])
  );

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await loadVaultItems();
    } finally {
      setRefreshing(false);
    }
  };

  const openItem = (item: VaultItem) => {
    router.push({
      pathname: '/vaultdetails',
      params: {
        id: String(item.id),
        type: item.itemType,
      },
    });
  };

  const searchText = search.toLowerCase();

  const passwords = vaultItems.filter(
    (item) =>
      item.itemType === 'PASSWORD' &&
      `${item.title} ${item.website} ${item.usernameValue}`.toLowerCase().includes(searchText)
  );

  const documents = vaultItems.filter(
    (item) =>
      item.itemType === 'DOCUMENT' &&
      `${item.title} ${item.fileName} ${item.mimeType}`.toLowerCase().includes(searchText)
  );

  const cards = vaultItems.filter(
    (item) =>
      item.itemType === 'CARD' &&
      `${item.title} ${item.usernameValue}`.toLowerCase().includes(searchText)
  );

  const headerCount = () => {
    if (activeTab === 'Passwords') return `${passwords.length} logins`;
    if (activeTab === 'Documents') return `${documents.length} files · encrypted`;
    return `${cards.length} cards saved`;
  };

  const renderEmpty = (type: 'password' | 'document' | 'card') => {
    const route = type === 'password' ? '/addpassword' : type === 'document' ? '/adddocument' : '/addcard';

    return (
      <View style={styles.emptyState}>
        <Ionicons
          name={type === 'password' ? 'key-outline' : type === 'document' ? 'document-outline' : 'card-outline'}
          size={48}
          color={C.border}
        />
        <Text style={styles.emptyText}>No {type}s found</Text>
        <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push(route)}>
          <Text style={styles.emptyBtnText}>Add {type}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerCount}>{headerCount()}</Text>
          <Text style={styles.headerTitle}>{activeTab}</Text>
        </View>

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            if (activeTab === 'Passwords') router.push('/addpassword');
            if (activeTab === 'Documents') router.push('/adddocument');
            if (activeTab === 'Cards') router.push('/addcard');
          }}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={C.tabInactive} />
        <TextInput
          style={styles.searchInput}
          placeholder={`Search ${activeTab.toLowerCase()}`}
          placeholderTextColor={C.tabInactive}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.tabRow}>
        {['Passwords', 'Documents', 'Cards'].map((tabItem) => (
          <TouchableOpacity
            key={tabItem}
            style={[styles.tab, activeTab === tabItem && styles.tabActive]}
            onPress={() => {
              setActiveTab(tabItem);
              setSearch('');
            }}
          >
            <Text style={[styles.tabText, activeTab === tabItem && styles.tabTextActive]}>{tabItem}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={styles.emptyText}>Loading vault...</Text>
          </View>
        ) : activeTab === 'Passwords' ? (
          <View style={styles.list}>
            {passwords.length === 0
              ? renderEmpty('password')
              : passwords.map((item) => {
                  const title = item.title || item.website || 'Untitled';

                  return (
                    <TouchableOpacity key={`password-${item.id}`} style={styles.passwordCard} onPress={() => openItem(item)}>
                      <View style={[styles.avatar, { backgroundColor: getAvatarColor(title) }]}>
                        <Text style={styles.avatarText}>{title.charAt(0).toUpperCase()}</Text>
                      </View>

                      <View style={styles.cardText}>
                        <Text style={styles.cardName}>{title}</Text>
                        <Text style={styles.cardSub}>{item.usernameValue || item.website}</Text>
                      </View>

                      <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
                    </TouchableOpacity>
                  );
                })}
          </View>
        ) : activeTab === 'Documents' ? (
          <View style={styles.documentGrid}>
            {documents.length === 0
              ? renderEmpty('document')
              : documents.map((item) => (
                  <TouchableOpacity key={`document-${item.id}`} style={styles.documentCard} onPress={() => openItem(item)}>
                    <View style={styles.documentIcon}>
                      <Ionicons
                        name={(item.mimeType || '').startsWith('image/') ? 'image-outline' : 'document-text-outline'}
                        size={24}
                        color={C.primary}
                      />
                    </View>

                    <Text style={styles.documentName} numberOfLines={2}>
                      {item.fileName || item.title}
                    </Text>
                    <Text style={styles.documentCategory} numberOfLines={1}>
                      {item.mimeType || 'Document'}
                    </Text>
                    <Text style={styles.documentSize}>{formatSize(item.sizeBytes)}</Text>
                  </TouchableOpacity>
                ))}
          </View>
        ) : (
          <View style={styles.cardList}>
            {cards.length === 0
              ? renderEmpty('card')
              : cards.map((item) => (
                  <TouchableOpacity
                    key={`card-${item.id}`}
                    style={[styles.creditCard, { backgroundColor: getAvatarColor(item.title || 'Card') }]}
                    onPress={() => openItem(item)}
                  >
                    <View style={styles.creditCardTop}>
                      <Text style={styles.creditCardName}>{item.title || 'Saved Card'}</Text>
                      <Ionicons name="card-outline" size={24} color="#fff" />
                    </View>

                    <Text style={styles.creditCardNumber}>••••  ••••  ••••  {item.website || '••••'}</Text>

                    <View style={styles.creditCardBottom}>
                      <Text style={styles.creditCardBank}>{item.usernameValue || 'Cardholder'}</Text>
                      <Text style={styles.creditCardBank}>Encrypted</Text>
                    </View>
                  </TouchableOpacity>
                ))}
          </View>
        )}

        <View style={{ height: 110 }} />
      </ScrollView>

      <FloatingTabBar />
    </SafeAreaView>
  );
};

export default VaultScreen;

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

const makeStyles = (C: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 16,
    },
    headerCount: { fontSize: 13, color: C.textSecondary, marginBottom: 2 },
    headerTitle: { fontSize: 30, fontWeight: 'bold', color: C.text },
    addBtn: {
      width: 46,
      height: 46,
      backgroundColor: C.primary,
      borderRadius: 23,
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
    tabRow: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginBottom: 16,
      backgroundColor: C.backgroundElement,
      borderRadius: 50,
      padding: 4,
      borderWidth: 1,
      borderColor: C.border,
    },
    tab: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 50,
    },
    tabActive: { backgroundColor: C.backgroundSelected },
    tabText: { fontSize: 13, color: C.tabInactive, fontWeight: '600' },
    tabTextActive: { color: C.text },
    list: { paddingHorizontal: 20, gap: 10 },
    passwordCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 16,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    cardText: { flex: 1 },
    cardName: { fontSize: 15, fontWeight: '700', color: C.text },
    cardSub: { fontSize: 12, color: C.textSecondary, marginTop: 3 },
    documentGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 20,
      gap: CARD_GAP,
    },
    documentCard: {
      width: DOC_CARD_WIDTH,
      backgroundColor: C.backgroundElement,
      borderRadius: 18,
      padding: 16,
      marginBottom: 4,
      borderWidth: 1,
      borderColor: C.border,
    },
    documentIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: C.actionCard,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    documentName: { fontSize: 14, fontWeight: '700', color: C.text, minHeight: 38 },
    documentCategory: { fontSize: 12, color: C.textSecondary, marginTop: 6 },
    documentSize: { fontSize: 12, color: C.tabInactive, marginTop: 4 },
    cardList: { paddingHorizontal: 20, gap: 14 },
    creditCard: {
      borderRadius: 20,
      padding: 20,
      height: 170,
      justifyContent: 'space-between',
    },
    creditCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    creditCardName: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
    creditCardNumber: { color: '#fff', fontSize: 18, letterSpacing: 2, fontWeight: '600' },
    creditCardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
    creditCardBank: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
    emptyState: {
      paddingVertical: 60,
      justifyContent: 'center',
      alignItems: 'center',
      width: '100%',
    },
    emptyText: { marginTop: 12, color: C.textSecondary, fontSize: 15, fontWeight: '600' },
    emptyBtn: {
      marginTop: 14,
      backgroundColor: C.primary,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 25,
    },
    emptyBtnText: { color: '#fff', fontWeight: '700' },
  });