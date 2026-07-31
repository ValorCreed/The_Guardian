import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Check,
  CreditCard,
  FileText,
  KeyRound,
  Mail,
  NotebookText,
  UserPlus,
} from 'lucide-react-native';

import {
  api,
  CreditCardResponse,
  SecureNoteResponse,
  VaultItem,
} from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import {
  hapticToggleOn,
  hapticToggleOff,
  hapticWarning,
  hapticSuccess,
} from '../utils/haptics';

type DocumentOption = {
  id: number;
  documentName?: string;
  documentType?: string;
};

type SelectableItem = {
  id: number;
  title: string;
  subtitle: string;
};

const getFileExtension = (fileName?: string | null) => {
  const cleanName = String(fileName || '').split('?')[0].split('#')[0];
  const parts = cleanName.split('.');
  return parts.length > 1 ? String(parts.pop() || '').toLowerCase() : '';
};

const getFriendlyDocumentType = (mimeType?: string | null, fileName?: string | null) => {
  const mime = String(mimeType || '').trim().toLowerCase();
  const extension = getFileExtension(fileName);

  if (mime.startsWith('image/')) return 'Image';
  if (mime.startsWith('video/')) return 'Video';
  if (mime.startsWith('audio/')) return 'Audio';
  if (mime === 'application/pdf' || extension === 'pdf') return 'PDF';
  if (mime.includes('wordprocessingml') || mime === 'application/msword' || ['doc', 'docx'].includes(extension)) {
    return extension === 'doc' ? 'DOC' : 'DOCX';
  }
  if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel' || ['xls', 'xlsx'].includes(extension)) {
    return extension === 'xls' ? 'XLS' : 'XLSX';
  }
  if (mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint' || ['ppt', 'pptx'].includes(extension)) {
    return extension === 'ppt' ? 'PPT' : 'PPTX';
  }
  if (mime.includes('zip') || extension === 'zip') return 'ZIP';
  if (mime.includes('csv') || extension === 'csv') return 'CSV';
  if (mime.startsWith('text/') || extension === 'txt') return 'TXT';
  return extension ? extension.toUpperCase() : 'Document';
};

const toggleSelection = (
  current: number[],
  itemId: number,
  onChange: (next: number[]) => void
) => {
  const selected = current.includes(itemId);
  if (selected) {
    hapticToggleOff();
    onChange(current.filter((id) => id !== itemId));
  } else {
    hapticToggleOn();
    onChange([...current, itemId]);
  }
};

export default function NewMemberScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [email, setEmail] = useState('');
  const [passwords, setPasswords] = useState<VaultItem[]>([]);
  const [cards, setCards] = useState<CreditCardResponse[]>([]);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [notes, setNotes] = useState<SecureNoteResponse[]>([]);

  const [selectedPasswordIds, setSelectedPasswordIds] = useState<number[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<number[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);

  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsNotice, setItemsNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    let active = true;

    const loadShareableItems = async () => {
      setItemsLoading(true);
      const results = await Promise.allSettled([
        api.getVaultItems(),
        api.getCards(),
        api.getDocuments(),
        api.getSecureNotes(),
      ]);

      if (!active) return;

      const [passwordResult, cardResult, documentResult, noteResult] = results;

      setPasswords(passwordResult.status === 'fulfilled' ? passwordResult.value || [] : []);
      setCards(cardResult.status === 'fulfilled' ? cardResult.value || [] : []);
      setDocuments(documentResult.status === 'fulfilled' ? documentResult.value || [] : []);
      setNotes(noteResult.status === 'fulfilled' ? noteResult.value || [] : []);

      const failedCount = results.filter((result) => result.status === 'rejected').length;
      setItemsNotice(
        failedCount > 0
          ? 'Some vault categories could not be loaded. Refresh this screen before sharing an item from those categories.'
          : ''
      );
      setItemsLoading(false);
    };

    loadShareableItems();
    return () => {
      active = false;
    };
  }, []);

  const selectedCount = useMemo(
    () =>
      selectedPasswordIds.length +
      selectedCardIds.length +
      selectedDocumentIds.length +
      selectedNoteIds.length,
    [selectedPasswordIds, selectedCardIds, selectedDocumentIds, selectedNoteIds]
  );

  const ensureFamilyPlanBeforeSubmit = async () => {
    const subscription = await api.getSubscriptionFresh?.();
    const plan = String(subscription?.plan || '').toUpperCase();
    const active = subscription?.active !== false;

    if (plan !== 'FAMILY' || !active) {
      Alert.alert(
        'Family plan required',
        'This account is not currently recognized as an active Family plan account.'
      );
      return false;
    }

    return true;
  };

  const handleAddMember = async () => {
    if (submittingRef.current || loading) return;

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      hapticWarning();
      Alert.alert('Missing email', 'Enter the email of the user you want to add.');
      return;
    }

    if (selectedCount === 0) {
      hapticWarning();
      Alert.alert(
        'Choose specific items',
        'Select at least one password, card, document, or secure note to share.'
      );
      return;
    }

    try {
      submittingRef.current = true;
      setLoading(true);

      if (!(await ensureFamilyPlanBeforeSubmit())) return;

      try {
        await api.lookupFamilyMemberAccount(cleanEmail);
      } catch (lookupError: any) {
        const lookupStatus = lookupError?.status;
        const lookupCode = String(lookupError?.code || '').toUpperCase();

        if (lookupStatus === 404 || lookupCode === 'ACCOUNT_NOT_FOUND') {
          hapticWarning();
          Alert.alert(
            'Account not found',
            'That email is not registered on The Guardian. Ask the person to create an account first.'
          );
          return;
        }

        if (lookupStatus === 403 || lookupCode === 'FAMILY_PLAN_REQUIRED') {
          hapticWarning();
          Alert.alert('Family plan required', 'Only active Family plan users can add members.');
          return;
        }

        throw lookupError;
      }

      await api.addFamilyMember(cleanEmail, {
        sharePasswords: selectedPasswordIds.length > 0,
        shareCards: selectedCardIds.length > 0,
        shareDocuments: selectedDocumentIds.length > 0,
        shareNotes: selectedNoteIds.length > 0,
        passwordItemIds: selectedPasswordIds,
        cardItemIds: selectedCardIds,
        documentItemIds: selectedDocumentIds,
        noteItemIds: selectedNoteIds,
      });
      api.clearCache();

      hapticSuccess();
      Alert.alert(
        'Member added',
        `${selectedCount} selected vault item${selectedCount === 1 ? '' : 's'} can now be viewed by this member.`,
        [{ text: 'OK', onPress: () => router.replace('/family') }]
      );
    } catch (error: any) {
      const status = error?.status;
      const message =
        status === 404
          ? 'That email is not registered on The Guardian.'
          : status === 403
            ? 'Only active Family plan users can add members.'
            : error?.message || 'Please try again.';

      hapticWarning();
      Alert.alert(status === 404 ? 'Account not found' : 'Could not add member', message);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const passwordOptions: SelectableItem[] = passwords.map((item) => ({
    id: Number(item.id),
    title: item.title || 'Untitled password',
    subtitle: item.usernameValue || item.website || 'Saved login',
  }));

  const cardOptions: SelectableItem[] = cards.map((item) => ({
    id: Number(item.id),
    title: item.cardName || 'Saved card',
    subtitle: 'Payment card',
  }));

  const documentOptions: SelectableItem[] = documents.map((item) => ({
    id: Number(item.id),
    title: item.documentName || 'Untitled document',
    subtitle: getFriendlyDocumentType(item.documentType, item.documentName),
  }));

  const noteOptions: SelectableItem[] = notes.map((item) => ({
    id: Number(item.id),
    title: item.title || 'Untitled note',
    subtitle: item.category || 'Secure note',
  }));

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.iconBox}>
          <UserPlus size={34} color="#fff" />
        </View>

        <Text style={styles.title}>Add family member</Text>
        <Text style={styles.subtitle}>
          Enter a Guardian account email, then choose the exact vault items this person can view.
        </Text>

        <Text style={styles.label}>Member email</Text>
        <View style={styles.inputBox}>
          <Mail size={20} color={C.textSecondary} />
          <TextInput
            style={styles.input}
            placeholder="family@example.com"
            placeholderTextColor={C.tabInactive}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
          />
        </View>

        <View style={styles.selectionHeader}>
          <Text style={styles.sectionLabel}>SELECT SPECIFIC VAULT ITEMS</Text>
          <View style={styles.selectionCount}>
            <Text style={styles.selectionCountText}>{selectedCount} selected</Text>
          </View>
        </View>

        {!!itemsNotice && <Text style={styles.notice}>{itemsNotice}</Text>}

        {itemsLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={C.primary} />
            <Text style={styles.loadingText}>Loading your vault items…</Text>
          </View>
        ) : (
          <>
            <ItemSection
              icon={<KeyRound size={20} color={C.primary} />}
              title="Passwords"
              items={passwordOptions}
              selectedIds={selectedPasswordIds}
              setSelectedIds={setSelectedPasswordIds}
              emptyText="No saved passwords"
              C={C}
              styles={styles}
            />
            <ItemSection
              icon={<CreditCard size={20} color={C.primary} />}
              title="Cards"
              items={cardOptions}
              selectedIds={selectedCardIds}
              setSelectedIds={setSelectedCardIds}
              emptyText="No saved cards"
              C={C}
              styles={styles}
            />
            <ItemSection
              icon={<FileText size={20} color={C.primary} />}
              title="Documents"
              items={documentOptions}
              selectedIds={selectedDocumentIds}
              setSelectedIds={setSelectedDocumentIds}
              emptyText="No saved documents"
              C={C}
              styles={styles}
            />
            <ItemSection
              icon={<NotebookText size={20} color={C.primary} />}
              title="Secure notes"
              items={noteOptions}
              selectedIds={selectedNoteIds}
              setSelectedIds={setSelectedNoteIds}
              emptyText="No saved secure notes"
              C={C}
              styles={styles}
            />
          </>
        )}

        <TouchableOpacity
          style={[styles.button, (loading || itemsLoading) && styles.disabledButton]}
          onPress={handleAddMember}
          disabled={loading || itemsLoading}
          activeOpacity={0.75}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Add member</Text>}
        </TouchableOpacity>

        <Text style={styles.note}>
          The member receives read-only access only to the items checked above. Unselected items remain private.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ItemSection({
  icon,
  title,
  items,
  selectedIds,
  setSelectedIds,
  emptyText,
  C,
  styles,
}: {
  icon: React.ReactNode;
  title: string;
  items: SelectableItem[];
  selectedIds: number[];
  setSelectedIds: (ids: number[]) => void;
  emptyText: string;
  C: any;
  styles: any;
}) {
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  return (
    <View style={styles.itemsCard}>
      <View style={styles.itemsHeader}>
        <View style={styles.permissionIcon}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.permissionTitle}>{title}</Text>
          <Text style={styles.permissionSub}>{selectedIds.length}/{items.length} selected</Text>
        </View>
        {items.length > 0 && (
          <TouchableOpacity
            style={styles.selectAllButton}
            onPress={() => {
              if (allSelected) {
                hapticToggleOff();
                setSelectedIds([]);
              } else {
                hapticToggleOn();
                setSelectedIds(items.map((item) => item.id));
              }
            }}
          >
            <Text style={styles.selectAllText}>{allSelected ? 'Clear' : 'Select all'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {items.length === 0 ? (
        <Text style={styles.emptyText}>{emptyText}</Text>
      ) : (
        items.map((item, index) => {
          const selected = selectedIds.includes(item.id);
          return (
            <TouchableOpacity
              key={`${title}-${item.id}`}
              style={[styles.itemRow, index !== items.length - 1 && styles.itemDivider]}
              activeOpacity={0.75}
              onPress={() => toggleSelection(selectedIds, item.id, setSelectedIds)}
            >
              <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                {selected && <Check size={15} color="#fff" strokeWidth={3} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.itemSubtitle} numberOfLines={1}>{item.subtitle}</Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    scrollContent: { paddingHorizontal: 20, paddingTop: 100, paddingBottom: 150 },
    iconBox: {
      width: 86,
      height: 86,
      borderRadius: 28,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 28,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    title: { color: C.text, fontSize: 34, fontWeight: '800', marginBottom: 10 },
    subtitle: { color: C.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 30 },
    label: { color: C.text, fontWeight: '800', fontSize: 14, marginBottom: 8 },
    inputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 24,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    input: { flex: 1, color: C.text, fontSize: 16, paddingVertical: 16, marginLeft: 10 },
    selectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    sectionLabel: { flex: 1, color: C.textSecondary, fontSize: 12, fontWeight: '900', letterSpacing: 0.7 },
    selectionCount: { backgroundColor: C.actionCard, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 },
    selectionCountText: { color: C.primary, fontSize: 11, fontWeight: '900' },
    notice: { color: C.warning, fontSize: 12, lineHeight: 18, marginBottom: 12, fontWeight: '700' },
    loadingCard: {
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 22,
      padding: 22,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 18,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    loadingText: { color: C.textSecondary, fontSize: 13, fontWeight: '700' },
    itemsCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: 14,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    itemsHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, backgroundColor: C.actionCard 
      ,shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    permissionIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.backgroundElement, alignItems: 'center', justifyContent: 'center' },
    permissionTitle: { color: C.text, fontSize: 15, fontWeight: '900' },
    permissionSub: { color: C.textSecondary, fontSize: 11, marginTop: 3, fontWeight: '700' },
    selectAllButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: C.backgroundElement 
      ,shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    selectAllText: { color: C.primary, fontSize: 11, fontWeight: '900' },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 13 },
    itemDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' 
      ,shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    checkboxSelected: { backgroundColor: C.primary, borderColor: C.primary 
      ,shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    itemTitle: { color: C.text, fontSize: 14, fontWeight: '800' },
    itemSubtitle: { color: C.textSecondary, fontSize: 11, marginTop: 3 },
    emptyText: { color: C.textSecondary, fontSize: 12, padding: 16, textAlign: 'center' },
    button: { backgroundColor: C.primary, borderRadius: 999, paddingVertical: 17, alignItems: 'center', justifyContent: 'center', marginTop: 10 
      ,shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    disabledButton: { opacity: 0.55 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '900' },
    note: { color: C.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 16 },
  });
