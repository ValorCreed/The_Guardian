import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { api, SecureNoteResponse } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import OfflineBanner from '../components/OfflineBanner';
import { findOfflineNote, isOfflineReadableError, loadOfflineVaultSnapshot } from '../services/offlineVault';
import { decryptJson, encryptJson } from '../utils/vaultcrypto';
import { getSecureClipboardMessage, setSecureClipboard } from '../utils/secureClipboard';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';
import { useScreenAlert } from '../hooks/useScreenAlert';

const CATEGORIES = ['General', 'Recovery Codes', 'Banking', 'School', 'Work', 'Family', 'Private'];

export default function NoteDetailsScreen() {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const router = useRouter();
  const { id, returnTab, mode } = useLocalSearchParams<{
    id: string;
    returnTab?: 'Notes' | 'Passwords' | 'Documents' | 'Cards';
    mode?: 'view' | 'edit';
  }>();
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const goBackToVaultNotes = () => {
    router.replace({
      pathname: '/vault',
      params: { tab: returnTab || 'Notes' },
    });
  };

  useSensitiveScreenProtection(true);

  const [note, setNote] = useState<SecureNoteResponse | null>(null);
  const [content, setContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('General');
  const [editContent, setEditContent] = useState('');
  const [editPinned, setEditPinned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);

  const decryptNoteContent = (value?: string) => {
    if (!value) return '';
    const decrypted = decryptJson<any>(value, null);
    if (decrypted !== null && decrypted !== undefined) return String(decrypted);
    return String(value);
  };

  const applyNote = (data: SecureNoteResponse, fromOffline = false, savedAt?: string | null) => {
    const plainContent = decryptNoteContent(data.encryptedContent);

    setNote(data);
    setContent(plainContent);
    setEditTitle(data.title || 'SecureNote');
    setEditCategory(data.category || 'General');
    setEditContent(plainContent);
    setEditPinned(Boolean(data.pinned));
    setOfflineMode(fromOffline);
    setOfflineSavedAt(savedAt || null);
    setEditing(mode === 'edit' && !fromOffline);
  };

  const loadNote = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setOfflineMode(false);
      setOfflineSavedAt(null);

      const data = await requestApi.getSecureNote(id);
      applyNote(data, false, null);
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      if (isOfflineReadableError(error)) {
        const [snapshot, offlineNote] = await Promise.all([
          loadOfflineVaultSnapshot(),
          findOfflineNote(id),
        ]);

        if (offlineNote) {
          applyNote(offlineNote, true, snapshot?.savedAt || null);
          return;
        }
      }

      screenAlert('Error', error.message || 'Could not load SecureNote.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNote();
  }, [id, mode]);

  const showOfflineWriteWarning = () => {
    screenAlert(
      'Offline mode',
      'Only this note’s title and category are stored in the offline item list. Its secret content, editing, and deleting will be available again when the server reconnects.'
    );
  };

  const copyContent = async () => {
    if (!content) return;
    await setSecureClipboard(content);
    screenAlert('Copied', getSecureClipboardMessage('SecureNote'));
  };

  const saveChanges = async () => {
    if (offlineMode) {
      showOfflineWriteWarning();
      return;
    }

    if (!note || saving) return;

    if (!editTitle.trim()) {
      screenAlert('Missing title', 'Please enter a note title.');
      return;
    }

    if (!editContent.trim()) {
      screenAlert('Missing content', 'Please enter note content.');
      return;
    }

    try {
      setSaving(true);
      const updated = await requestApi.updateSecureNote(note.id, {
        title: editTitle.trim(),
        category: editCategory,
        encryptedContent: encryptJson(editContent.trim()),
        pinned: editPinned,
      });

      setNote(updated);
      setContent(editContent.trim());
      setEditing(false);
      screenAlert('Updated', 'SecureNote updated.');
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      screenAlert('Update failed', error.message || 'Could not update SecureNote.');
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = () => {
    if (offlineMode) {
      showOfflineWriteWarning();
      return;
    }

    if (!note) return;

    screenAlert(
      'Delete SecureNote?',
      'This note will be permanently deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await requestApi.deleteSecureNote(note.id);
              screenAlert('Deleted', 'SecureNote deleted.', [
                { text: 'OK', onPress: goBackToVaultNotes },
              ]);
            } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
              screenAlert('Delete failed', error.message || 'Could not delete SecureNote.');
            }
          },
        },
      ]
    );
  };

  const renderNoteSkeleton = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <PulsingSkeleton styles={styles} style={styles.skeletonNoteIcon} />
        <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
        <PulsingSkeleton styles={styles} style={styles.skeletonSubtitle} />
      </View>

      <View style={styles.content}>
        <View style={styles.noteCard}>
          <PulsingSkeleton styles={styles} style={styles.skeletonNoteLine} />
          <PulsingSkeleton styles={styles} style={styles.skeletonNoteLineWide} />
          <PulsingSkeleton styles={styles} style={styles.skeletonNoteLine} />
          <PulsingSkeleton styles={styles} style={styles.skeletonNoteLineShort} />
        </View>

        <PulsingSkeleton styles={styles} style={styles.skeletonButton} />
        <PulsingSkeleton styles={styles} style={styles.skeletonButtonLight} />
        <PulsingSkeleton styles={styles} style={styles.skeletonButtonLight} />
      </View>
    </ScrollView>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {renderNoteSkeleton()}
      </SafeAreaView>
    );
  }

  if (!note) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <Text style={styles.loadingText}>SecureNote not found.</Text>
          <TouchableOpacity style={styles.mainBtn} onPress={goBackToVaultNotes}>
            <Text style={styles.mainBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={[styles.noteIcon, note.pinned && { backgroundColor: C.securityScoreBg }]}>
              <Ionicons name={note.pinned ? 'pin' : 'reader-outline'} size={27} color={note.pinned ? C.warning : C.primary} />
            </View>

            <Text style={styles.title}>{note.title}</Text>
            <Text style={styles.subtitle}>{note.category || 'General'}</Text>
          </View>

          {offlineMode && (
            <OfflineBanner
              colors={C}
              savedAt={offlineSavedAt}
              message="Only the note title and category are available offline. The note content is not stored on this device and will appear again when the server reconnects."
              onRetry={loadNote}
            />
          )}

          {editing ? (
            <View style={styles.form}>
              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholderTextColor={C.tabInactive}
                autoFocus={mode === 'edit'}
              />

              <Text style={styles.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                {CATEGORIES.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[styles.categoryChip, editCategory === item && styles.categoryChipActive]}
                    onPress={() => setEditCategory(item)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.categoryText, editCategory === item && styles.categoryTextActive]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.pinnedRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pinnedTitle}>Pin note</Text>
                  <Text style={styles.pinnedSub}>Pinned notes appear first.</Text>
                </View>
                <Switch
                  value={editPinned}
                  onValueChange={setEditPinned}
                  trackColor={{ false: C.border, true: C.primary }}
                  thumbColor="#fff"
                  ios_backgroundColor={C.border}
                />
              </View>

              <Text style={styles.label}>SecureNote</Text>
              <TextInput style={styles.noteInput} value={editContent} onChangeText={setEditContent} multiline textAlignVertical="top" />

              <TouchableOpacity style={styles.mainBtn} onPress={saveChanges} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="save-outline" size={18} color="#fff" />}
                <Text style={styles.mainBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setEditing(false)}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.content}>
              <View style={styles.noteCard}>
                <Text style={styles.noteText}>{content}</Text>
              </View>

              <TouchableOpacity style={styles.mainBtn} onPress={offlineMode ? showOfflineWriteWarning : () => setEditing(true)}>
                <Ionicons name="create-outline" size={18} color="#fff" />
                <Text style={styles.mainBtnText}>{offlineMode ? 'Read-only offline mode' : 'Edit Note'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryBtn} onPress={copyContent}>
                <Ionicons name="copy-outline" size={18} color={C.primary} />
                <Text style={styles.secondaryBtnText}>Copy Note</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.secondaryBtn, { borderColor: C.danger }]} onPress={offlineMode ? showOfflineWriteWarning : deleteNote}>
                <Ionicons name="trash-outline" size={18} color={C.danger} />
                <Text style={[styles.secondaryBtnText, { color: C.danger }]}>Delete Note</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

const makeStyles = (C: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    skeletonBlock: { backgroundColor: C.backgroundSelected, borderRadius: 999
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    skeletonNoteIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },
 width: 74, height: 74, borderRadius: 24, marginBottom: 16 },
    skeletonTitle: { width: '62%', height: 26, marginBottom: 10 },
    skeletonSubtitle: { width: '48%', height: 13 },
    skeletonNoteLine: { width: '82%', height: 14, marginBottom: 12 },
    skeletonNoteLineWide: { width: '100%', height: 14, marginBottom: 12 },
    skeletonNoteLineShort: { width: '55%', height: 14 },
    skeletonButton: {
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      elevation: 10,
      shadowOffset: { width: 0, height: 11 },
 width: '100%', height: 52, borderRadius: 999, marginTop: 20 },
    skeletonButtonLight: {
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      elevation: 10,
      shadowOffset: { width: 0, height: 11 },
 width: '100%', height: 52, borderRadius: 999, marginTop: 12 },

    scrollContent: { paddingBottom: 30 },
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    loadingText: { color: C.textSecondary, marginTop: 12, fontSize: 15 },
    header: { paddingHorizontal: 20, paddingTop: 96, paddingBottom: 20, alignItems: 'center' },
    noteIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },
 width: 74, height: 74, borderRadius: 37, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    title: { color: C.text, fontSize: 26, fontWeight: '900', textAlign: 'center' },
    subtitle: { color: C.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 5 },
    content: { paddingHorizontal: 20 },
    form: { paddingHorizontal: 20 },
    label: { fontSize: 14, color: C.text, fontWeight: '800', marginBottom: 8 },
    input: {
      shadowColor: '#000000',
      shadowOpacity: 0.13,
      shadowRadius: 14,
      elevation: 6,
      shadowOffset: { width: 0, height: 7 },
 backgroundColor: C.backgroundElement, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 15, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border, marginBottom: 18 },
    categoryRow: { gap: 8, paddingBottom: 18 },
    categoryChip: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },
 backgroundColor: C.backgroundElement, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: C.border },
    categoryChipActive: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },
 backgroundColor: C.primary, borderColor: C.primary },
    categoryText: { color: C.textSecondary, fontSize: 12, fontWeight: '800' },
    categoryTextActive: { color: '#fff' },
    pinnedRow: { backgroundColor: C.backgroundElement, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', marginBottom: 18
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    pinnedTitle: { color: C.text, fontSize: 15, fontWeight: '900' },
    pinnedSub: { color: C.textSecondary, fontSize: 12, marginTop: 3 },
    noteInput: {
      shadowColor: '#000000',
      shadowOpacity: 0.13,
      shadowRadius: 14,
      elevation: 6,
      shadowOffset: { width: 0, height: 7 },
 minHeight: 220, backgroundColor: C.backgroundElement, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border, marginBottom: 16, lineHeight: 21 },
    noteCard: { backgroundColor: C.backgroundElement, borderRadius: 22, borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 18
      ,shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},
    noteText: { color: C.text, fontSize: 15, lineHeight: 23 },
    mainBtn: { width: '100%', backgroundColor: C.backgroundbutton, paddingVertical: 16, borderRadius: 50, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8
      ,shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 11 },
      elevation: 10,},
    mainBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
    secondaryBtn: { width: '100%', backgroundColor: C.backgroundElement, paddingVertical: 16, borderRadius: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, marginTop: 10, flexDirection: 'row', gap: 8
      ,shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 11 },
      elevation: 10,},
    secondaryBtnText: { color: C.primary, fontWeight: '900', fontSize: 15 },
  });