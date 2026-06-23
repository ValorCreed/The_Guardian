import React, { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Dimensions,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const SCREEN_PADDING = 20;
const DOC_CARD_WIDTH = (width - SCREEN_PADDING * 2 - CARD_GAP) / 2;

const passwordList = [
  { letter: 'G', color: '#e53935', name: 'Google', sub: 'alex.morgan@gmail.com', strength: 'Strong', favorite: true },
  { letter: 'R', color: '#1e88e5', name: 'Revolut', sub: 'alex.morgan', strength: 'Weak', favorite: true },
  { letter: 'N', color: '#212121', name: 'Notion', sub: 'alex@guardian.app', strength: 'Strong', favorite: false },
  { letter: 'N', color: '#e53935', name: 'Netflix', sub: 'alex.morgan@gmail.com', strength: 'Weak', favorite: false },
  { letter: 'G', color: '#212121', name: 'GitHub', sub: 'alexmorgan', strength: 'Strong', favorite: false },
  { letter: 'A', color: '#f5a623', name: 'Amazon', sub: 'alex.morgan@gmail.com', strength: 'Medium', favorite: false },
  { letter: 'T', color: '#1e88e5', name: 'Twitter', sub: 'alex.morgan', strength: 'Strong', favorite: false },
];

const documentList = [
  { name: 'Passport', category: 'Passports', size: '2.4 MB', icon: 'airplane-outline' },
  { name: "Driver's License", category: 'IDs', size: '1.1 MB', icon: 'card-outline' },
  { name: 'Home Insurance', category: 'Insurance', size: '820 KB', icon: 'heart-outline' },
  { name: 'Degree Certificate', category: 'Certificates', size: '3.0 MB', icon: 'ribbon-outline' },
  { name: 'Rental Contract', category: 'Contracts', size: '1.7 MB', icon: 'document-text-outline' },
];

const docFilters = ['All', 'IDs', 'Passports', 'Certificates', 'Contracts', 'Insurance'];

const cardList = [
  { name: 'Visa Debit', bank: 'Barclays', last4: '4242', color: '#1e88e5' },
  { name: 'Mastercard', bank: 'HSBC', last4: '8391', color: '#e53935' },
  { name: 'Amex Gold', bank: 'American Express', last4: '0005', color: '#f5a623' },
];

const VaultScreen = () => {
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const scheme = useColorScheme();
  const colorScheme = scheme === 'dark' ? 'dark' : 'light';
  const C = Colors[colorScheme];

  const [activeTab, setActiveTab] = useState('Passwords');
  const [activeFilter, setActiveFilter] = useState('All');
  const [activeDocFilter, setActiveDocFilter] = useState('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (tab === 'Documents') setActiveTab('Documents');
    else if (tab === 'Cards') setActiveTab('Cards');
    else setActiveTab('Passwords');
  }, [tab]);

  const styles = makeStyles(C);

  const filteredPasswords = passwordList.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.sub.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      activeFilter === 'All' || (activeFilter === 'Favorites' && item.favorite);
    return matchesSearch && matchesFilter;
  });

  const filteredDocuments = documentList.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = activeDocFilter === 'All' || item.category === activeDocFilter;
    return matchesSearch && matchesFilter;
  });

  const headerCount = () => {
    if (activeTab === 'Passwords') return `${filteredPasswords.length} logins`;
    if (activeTab === 'Documents') return `${documentList.length} files · encrypted`;
    return `${cardList.length} cards saved`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
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

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={C.tabInactive} />
        <TextInput
          style={styles.searchInput}
          placeholder={`Search ${activeTab.toLowerCase()}`}
          placeholderTextColor={C.tabInactive}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={C.tabInactive} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tab row */}
      <View style={styles.tabRow}>
        {['Passwords', 'Documents', 'Cards'].map((tabItem) => (
          <TouchableOpacity
            key={tabItem}
            style={[styles.tab, activeTab === tabItem && styles.tabActive]}
            onPress={() => {
              setActiveTab(tabItem);
              setSearch('');
              setActiveFilter('All');
              setActiveDocFilter('All');
            }}
          >
            <Ionicons
              name={
                tabItem === 'Passwords'
                  ? 'key-outline'
                  : tabItem === 'Documents'
                  ? 'document-text-outline'
                  : 'card-outline'
              }
              size={15}
              color={activeTab === tabItem ? C.text : C.tabInactive}
            />
            <Text style={[styles.tabText, activeTab === tabItem && styles.tabTextActive]}>
              {tabItem}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Passwords filter */}
      {activeTab === 'Passwords' && (
        <View style={styles.filterRow}>
          {['All', 'Favorites'].map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.filterBtn, activeFilter === filter && styles.filterBtnActive]}
              onPress={() => setActiveFilter(filter)}
            >
              {filter === 'Favorites' && (
                <Ionicons
                  name="star-outline"
                  size={13}
                  color={activeFilter === filter ? '#fff' : C.textSecondary}
                  style={{ marginRight: 4 }}
                />
              )}
              <Text style={[styles.filterText, activeFilter === filter && styles.filterTextActive]}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Passwords */}
      {activeTab === 'Passwords' && (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.list}>
            {filteredPasswords.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="key-outline" size={48} color={C.border} />
                <Text style={styles.emptyText}>No passwords found</Text>
              </View>
            ) : (
              filteredPasswords.map((item, index) => (
                <TouchableOpacity key={index} style={styles.passwordCard}>
                  <View style={[styles.avatar, { backgroundColor: item.color }]}>
                    <Text style={styles.avatarText}>{item.letter}</Text>
                  </View>
                  <View style={styles.cardText}>
                    <View style={styles.nameRow}>
                      <Text style={styles.cardName}>{item.name}</Text>
                      {item.favorite && (
                        <Ionicons name="star" size={14} color="#f5a623" style={{ marginLeft: 4 }} />
                      )}
                    </View>
                    <Text style={styles.cardSub}>{item.sub}</Text>
                  </View>
                  <View style={[
                    styles.strengthBadge,
                    item.strength === 'Strong'
                      ? { backgroundColor: C.actionCard }
                      : item.strength === 'Weak'
                      ? { backgroundColor: C.alertDangerBg }
                      : { backgroundColor: C.alertWarningBg },
                  ]}>
                    <Text style={[
                      styles.strengthText,
                      item.strength === 'Strong'
                        ? { color: C.primary }
                        : item.strength === 'Weak'
                        ? { color: C.danger }
                        : { color: C.warning },
                    ]}>
                      {item.strength}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Documents */}
      {activeTab === 'Documents' && (
        <ScrollView showsVerticalScrollIndicator={false}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.docFilterRow}
            style={styles.docFilterScroll}
          >
            {docFilters.map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[styles.filterBtn, activeDocFilter === filter && styles.filterBtnActive]}
                onPress={() => setActiveDocFilter(filter)}
              >
                <Text style={[styles.filterText, activeDocFilter === filter && styles.filterTextActive]}>
                  {filter}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {filteredDocuments.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={48} color={C.border} />
              <Text style={styles.emptyText}>No documents found</Text>
            </View>
          ) : (
            <View style={styles.docGrid}>
              {filteredDocuments.map((item, index) => (
                <TouchableOpacity key={index} style={styles.docCard}>
                  <View style={styles.docCardTop}>
                    <View style={styles.docIconCircle}>
                      <Ionicons name={item.icon as any} size={24} color={C.info} />
                    </View>
                    <Ionicons name="lock-closed-outline" size={16} color={C.info} />
                  </View>
                  <Text style={styles.docName}>{item.name}</Text>
                  <Text style={styles.docMeta}>{item.category} · {item.size}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Cards */}
      {activeTab === 'Cards' && (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.list}>
            {cardList.map((card, index) => (
              <TouchableOpacity key={index} style={styles.passwordCard}>
                <View style={[styles.cardChip, { backgroundColor: card.color }]}>
                  <Ionicons name="card-outline" size={20} color="#fff" />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardName}>{card.name}</Text>
                  <Text style={styles.cardSub}>{card.bank} · •••• {card.last4}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Bottom nav */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home')}>
          <Ionicons name="home-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="key" size={22} color={C.tabActive} />
          <Text style={styles.navLabelActive}>Vault</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/security')}>
          <Ionicons name="shield-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Security</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/family')}>
          <Ionicons name="people-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Family</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default VaultScreen;

const makeStyles = (C: (typeof Colors)[keyof typeof Colors]) =>
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
    headerCount: { fontSize: 13, color: C.textSecondary },
    headerTitle: { fontSize: 26, fontWeight: 'bold', color: C.text },
    addBtn: {
      width: 44,
      height: 44,
      backgroundColor: C.primary,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 50,
      marginHorizontal: 20,
      marginBottom: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 8,
    },
    searchInput: { flex: 1, fontSize: 15, color: C.text },
    tabRow: {
      flexDirection: 'row',
      backgroundColor: C.backgroundSelected,
      borderRadius: 50,
      marginHorizontal: 20,
      marginBottom: 14,
      padding: 4,
      gap: 4,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 50,
      gap: 5,
    },
    tabActive: { backgroundColor: C.backgroundElement },
    tabText: { fontSize: 13, color: C.tabInactive, fontWeight: '500' },
    tabTextActive: { color: C.text, fontWeight: '600' },
    filterRow: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      marginBottom: 14,
      gap: 10,
    },
    docFilterScroll: { marginBottom: 14 },
    docFilterRow: {
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    filterBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 22,
      backgroundColor: C.backgroundSelected,
    },
    filterBtnActive: { backgroundColor: C.primary },
    filterText: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
    filterTextActive: { color: '#ffffff', fontWeight: '600' },
    list: { paddingHorizontal: 20, gap: 10 },
    passwordCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 16,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 17 },
    cardText: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center' },
    cardName: { fontSize: 15, fontWeight: '600', color: C.text },
    cardSub: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    strengthBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    strengthText: { fontSize: 12, fontWeight: '600' },
    cardChip: {
      width: 44,
      height: 44,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    docGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-start',
      paddingHorizontal: SCREEN_PADDING,
      gap: CARD_GAP,
      marginTop: 2,
    },
    docCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 16,
      padding: 16,
      width: DOC_CARD_WIDTH,
    },
    docCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 20,
    },
    docIconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: C.backgroundSelected,
      justifyContent: 'center',
      alignItems: 'center',
    },
    docName: { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 4 },
    docMeta: { fontSize: 12, color: C.textSecondary },
    emptyState: {
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 60,
    },
    emptyText: { fontSize: 15, color: C.tabInactive },
    bottomNav: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: C.backgroundElement,
      flexDirection: 'row',
      paddingVertical: 10,
      paddingBottom: 24,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    navItem: { flex: 1, alignItems: 'center', gap: 4 },
    navLabel: { fontSize: 11, color: C.tabInactive },
    navLabelActive: { fontSize: 11, color: C.tabActive, fontWeight: '600' },
  });