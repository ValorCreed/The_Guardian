import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Check,
  CreditCard,
  FileText,
  KeyRound,
  NotebookText,
  Pencil,
  UserRound,
} from 'lucide-react-native';

import {
  api,
  CreditCardResponse,
  FamilyMemberAccess,
  SecureNoteResponse,
  VaultItem,
} from '../services/api';
import {
  isScreenRequestCancelled,
  useCancelableApi,
} from '../hooks/useCancelableApi';
import { useAppTheme } from '../context/ThemeContext';
import {
  hapticLight,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from '../utils/haptics';
import { useScreenAlert } from '../hooks/useScreenAlert';

type SelectableItem = {
  id: number;
  title: string;
  subtitle: string;
};

type SelectionSectionProps = {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  items: SelectableItem[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  emptyText: string;
  styles: ReturnType<typeof makeStyles>;
  C: any;
};

const getFileExtension = (fileName?: string | null) => {
  const cleanName = String(fileName || '').split('?')[0].split('#')[0];
  const parts = cleanName.split('.');
  return parts.length > 1 ? String(parts.pop() || '').toUpperCase() : '';
};

const getDocumentType = (document: any) => {
  const mime = String(document?.documentType || document?.mimeType || '').toLowerCase();
  const extension = getFileExtension(document?.documentName || document?.fileName);

  if (mime.includes('pdf') || extension === 'PDF') return 'PDF';
  if (mime.startsWith('image/')) return 'Image';
  if (mime.includes('word') || ['DOC', 'DOCX'].includes(extension)) return extension || 'Document';
  if (mime.includes('sheet') || ['XLS', 'XLSX'].includes(extension)) return extension || 'Spreadsheet';
  if (mime.includes('presentation') || ['PPT', 'PPTX'].includes(extension)) return extension || 'Presentation';
  return extension || 'Document';
};

const normalizeIds = (values?: number[]) =>
  Array.from(new Set((values || []).map(Number).filter((id) => Number.isFinite(id))));

export default function EditFamilyAccessScreen() {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const params = useLocalSearchParams<{
    membershipId?: string;
    memberName?: string;
    memberEmail?: string;
  }>();
  const membershipId = Number(params.membershipId || 0);

  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [member, setMember] = useState<FamilyMemberAccess | null>(null);
  const [passwords, setPasswords] = useState<VaultItem[]>([]);
  const [cards, setCards] = useState<CreditCardResponse[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [notes, setNotes] = useState<SecureNoteResponse[]>([]);

  const [selectedPasswordIds, setSelectedPasswordIds] = useState<number[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<number[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const loadAccess = useCallback(async () => {
    if (!membershipId) {
      setLoading(false);
      screenAlert('Family member not found', 'Return to Family and choose a member again.', [
        { text: 'Back', onPress: () => router.back() },
      ]);
      return;
    }

    try {
      setLoading(true);
      requestApi.clearCache();

      const [access, passwordItems, cardItems, documentItems, noteItems] = await Promise.all([
        requestApi.getFamilyMemberAccess(membershipId),
        requestApi.getVaultItems(),
        requestApi.getCards(),
        requestApi.getDocuments(),
        requestApi.getSecureNotes(),
      ]);

      setMember(access);
      setPasswords(passwordItems || []);
      setCards(cardItems || []);
      setDocuments(documentItems || []);
      setNotes(noteItems || []);

      const availablePasswordIds = new Set((passwordItems || []).map((item: any) => Number(item.id)));
      const availableCardIds = new Set((cardItems || []).map((item: any) => Number(item.id)));
      const availableDocumentIds = new Set((documentItems || []).map((item: any) => Number(item.id)));
      const availableNoteIds = new Set((noteItems || []).map((item: any) => Number(item.id)));

      setSelectedPasswordIds(normalizeIds(access.passwordItemIds).filter((id) => availablePasswordIds.has(id)));
      setSelectedCardIds(normalizeIds(access.cardItemIds).filter((id) => availableCardIds.has(id)));
      setSelectedDocumentIds(normalizeIds(access.documentItemIds).filter((id) => availableDocumentIds.has(id)));
      setSelectedNoteIds(normalizeIds(access.noteItemIds).filter((id) => availableNoteIds.has(id)));
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) return;
      screenAlert(
        'Could not load member access',
        error?.message || 'Please return to Family and try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [membershipId]);

  useFocusEffect(
    useCallback(() => {
      void loadAccess();
    }, [loadAccess])
  );

  const selectedCount = useMemo(
    () =>
      selectedPasswordIds.length +
      selectedCardIds.length +
      selectedDocumentIds.length +
      selectedNoteIds.length,
    [selectedPasswordIds, selectedCardIds, selectedDocumentIds, selectedNoteIds]
  );

  const passwordOptions: SelectableItem[] = passwords.map((item) => ({
    id: Number(item.id),
    title: item.title || item.website || 'Untitled password',
    subtitle: item.usernameValue || item.website || 'Saved login',
  }));

  const cardOptions: SelectableItem[] = cards.map((item) => ({
    id: Number(item.id),
    title: item.cardName || 'Saved card',
    subtitle: 'Payment card',
  }));

  const documentOptions: SelectableItem[] = documents.map((item) => ({
    id: Number(item.id),
    title: item.documentName || item.fileName || item.title || 'Untitled document',
    subtitle: getDocumentType(item),
  }));

  const noteOptions: SelectableItem[] = notes.map((item) => ({
    id: Number(item.id),
    title: item.title || 'Untitled SecureNote',
    subtitle: item.category || 'SecureNote',
  }));

  const saveAccess = async () => {
    /*
     * React state updates are asynchronous. A ref closes the tiny window in
     * which two rapid taps could both see saving === false and submit twice.
     */
    if (savingRef.current) return;

    const passwordItemIds = normalizeIds(selectedPasswordIds);
    const cardItemIds = normalizeIds(selectedCardIds);
    const documentItemIds = normalizeIds(selectedDocumentIds);
    const noteItemIds = normalizeIds(selectedNoteIds);
    const nextSelectedCount =
      passwordItemIds.length +
      cardItemIds.length +
      documentItemIds.length +
      noteItemIds.length;

    if (nextSelectedCount === 0) {
      hapticWarning();
      screenAlert(
        'Choose at least one item',
        'A family member must have at least one specific vault item selected.'
      );
      return;
    }

    savingRef.current = true;

    try {
      setSaving(true);
      await requestApi.updateFamilyMemberAccess(membershipId, {
        sharePasswords: passwordItemIds.length > 0,
        shareCards: cardItemIds.length > 0,
        shareDocuments: documentItemIds.length > 0,
        shareNotes: noteItemIds.length > 0,
        passwordItemIds,
        cardItemIds,
        documentItemIds,
        noteItemIds,
      });

      requestApi.clearCache();
      hapticSuccess();
      screenAlert(
        'Family access updated',
        `${nextSelectedCount} vault item${nextSelectedCount === 1 ? '' : 's'} can now be viewed by this member.`,
        [{ text: 'Done', onPress: () => router.back() }]
      );
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) return;
      hapticWarning();
      screenAlert('Could not update access', error?.message || 'Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.loadingBox}>
          <ActivityIndicator color={C.primary} />
          <Text style={styles.loadingText}>Loading shared vault access...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = member?.fullName || String(params.memberName || 'Family member');
  const displayEmail = member?.email || String(params.memberEmail || '');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerIcon}>
          <Pencil size={28} color="#FFFFFF" />
        </View>

        <Text style={styles.title}>Edit family access</Text>
        <Text style={styles.subtitle}>
          Choose the exact vault items this member can view. Changes replace their previous access.
        </Text>

        <View style={styles.memberCard}>
          <View style={styles.memberAvatar}>
            <UserRound size={24} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.memberName}>{displayName}</Text>
            {!!displayEmail && <Text style={styles.memberEmail}>{displayEmail}</Text>}
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{selectedCount} selected</Text>
          </View>
        </View>

        <SelectionSection
          title="Passwords"
          subtitle="Saved logins this member can open"
          icon={<KeyRound size={20} color={C.primary} />}
          items={passwordOptions}
          selectedIds={selectedPasswordIds}
          onChange={setSelectedPasswordIds}
          emptyText="No passwords are available in your vault."
          styles={styles}
          C={C}
        />

        <SelectionSection
          title="Cards"
          subtitle="Payment cards this member can open"
          icon={<CreditCard size={20} color={C.primary} />}
          items={cardOptions}
          selectedIds={selectedCardIds}
          onChange={setSelectedCardIds}
          emptyText="No cards are available in your vault."
          styles={styles}
          C={C}
        />

        <SelectionSection
          title="Documents"
          subtitle="Files this member can open or download"
          icon={<FileText size={20} color={C.primary} />}
          items={documentOptions}
          selectedIds={selectedDocumentIds}
          onChange={setSelectedDocumentIds}
          emptyText="No documents are available in your vault."
          styles={styles}
          C={C}
        />

        <SelectionSection
          title="SecureNotes"
          subtitle="Private notes this member can open"
          icon={<NotebookText size={20} color={C.primary} />}
          items={noteOptions}
          selectedIds={selectedNoteIds}
          onChange={setSelectedNoteIds}
          emptyText="No SecureNotes are available in your vault."
          styles={styles}
          C={C}
        />

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.disabledButton]}
          onPress={() => {
            hapticLight();
            void saveAccess();
          }}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Check size={20} color="#FFFFFF" />
          )}
          <Text style={styles.saveButtonText}>
            {saving ? 'Updating access...' : 'Save family access'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={saving}
          activeOpacity={0.75}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function SelectionSection({
  title,
  subtitle,
  icon,
  items,
  selectedIds,
  onChange,
  emptyText,
  styles,
  C,
}: SelectionSectionProps) {
  const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  const toggleAll = () => {
    hapticSelection();
    onChange(allSelected ? [] : items.map((item) => item.id));
  };

  const toggleItem = (id: number) => {
    hapticSelection();
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((currentId) => currentId !== id)
        : [...selectedIds, id]
    );
  };

  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
        {!!items.length && (
          <TouchableOpacity style={styles.selectAllButton} onPress={toggleAll} activeOpacity={0.75}>
            <Text style={styles.selectAllText}>{allSelected ? 'Clear' : 'Select all'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {!items.length ? (
        <Text style={styles.emptyText}>{emptyText}</Text>
      ) : (
        items.map((item, index) => {
          const selected = selectedIds.includes(item.id);
          return (
            <TouchableOpacity
              key={`${title}-${item.id}`}
              style={[styles.itemRow, index !== items.length - 1 && styles.itemDivider]}
              onPress={() => toggleItem(item.id)}
              activeOpacity={0.72}
            >
              <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                {selected && <Check size={15} color="#FFFFFF" />}
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
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    loadingText: { color: C.textSecondary, fontSize: 14, fontWeight: '700', marginTop: 12 },
    scrollContent: { paddingHorizontal: 18, paddingTop: 100, paddingBottom: 130 },
    headerIcon: {
      width: 62,
      height: 62,
      borderRadius: 23,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
      shadowColor: C.primary,
      shadowOpacity: 0.16,
      shadowRadius: 15,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    title: { color: C.text, fontSize: 31, fontWeight: '900', letterSpacing: -0.5 },
    subtitle: { color: C.textSecondary, fontSize: 14, lineHeight: 21, fontWeight: '600', marginTop: 8, marginBottom: 20 },
    memberCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 23,
      borderWidth: 1,
      borderColor: C.border,
      padding: 15,
      marginBottom: 20,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    memberAvatar: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 48,
      height: 48,
      borderRadius: 19,
      backgroundColor: C.actionCard || C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    memberName: { color: C.text, fontSize: 16, fontWeight: '900' },
    memberEmail: { color: C.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 4 },
    countBadge: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },
 backgroundColor: C.backgroundSelected, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, marginLeft: 8 },
    countBadgeText: { color: C.primary, fontSize: 11, fontWeight: '900' },
    sectionCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 23,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: 16,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: C.border },
    sectionIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },
 width: 42, height: 42, borderRadius: 17, backgroundColor: C.actionCard || C.backgroundSelected, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
    sectionTitle: { color: C.text, fontSize: 15, fontWeight: '900' },
    sectionSubtitle: { color: C.textSecondary, fontSize: 11, lineHeight: 16, fontWeight: '600', marginTop: 3 },
    selectAllButton: {
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      elevation: 10,
      shadowOffset: { width: 0, height: 11 },
 paddingHorizontal: 10, paddingVertical: 8, borderRadius: 13, backgroundColor: C.backgroundSelected, marginLeft: 8 },
    selectAllText: { color: C.primary, fontSize: 11, fontWeight: '900' },
    itemRow: { minHeight: 65, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 11 },
    itemDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    checkbox: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },
 width: 26, height: 26, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    checkboxSelected: { backgroundColor: C.primary, borderColor: C.primary },
    itemTitle: { color: C.text, fontSize: 14, fontWeight: '800' },
    itemSubtitle: { color: C.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 3 },
    emptyText: { color: C.textSecondary, fontSize: 13, lineHeight: 19, fontWeight: '600', padding: 16 },
    saveButton: {
      minHeight: 56,
      borderRadius: 999,
      backgroundColor: C.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      marginTop: 8,
      shadowColor: C.primary,
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 11 },
      elevation: 10,
    },
    disabledButton: { opacity: 0.65 },
    saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
    cancelButton: {
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      elevation: 10,
      shadowOffset: { width: 0, height: 11 },
 alignItems: 'center', paddingVertical: 15, marginTop: 5 },
    cancelButtonText: { color: C.textSecondary, fontSize: 14, fontWeight: '800' },
  });