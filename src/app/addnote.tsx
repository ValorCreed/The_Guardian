import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';
import AddScreenEntrance from '../components/AddScreenEntrance';
import { api } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import { encryptJson } from '../utils/vaultcrypto';
import { hapticSelection, hapticToggleOff, hapticToggleOn } from '../utils/haptics';

type Plan = 'FREE' | 'PREMIUM' | 'FAMILY';

const FREE_SECURE_NOTE_LIMIT = 5;

const CATEGORIES = ['General', 'Recovery Codes', 'Banking', 'School', 'Work', 'Family', 'Private'];

export default function AddNoteScreen() {
  const requestApi = useCancelableApi(api);
  const router = useRouter();
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  useSensitiveScreenProtection(true);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('General');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<Plan>('FREE');
  const [noteCount, setNoteCount] = useState(0);
  const [checking, setChecking] = useState(true);

  const isPaid = plan === 'PREMIUM' || plan === 'FAMILY';
  const freeLimitReached = !isPaid && noteCount >= FREE_SECURE_NOTE_LIMIT;

  useEffect(() => {
    const loadLimits = async () => {
      try {
        setChecking(true);
        const [subscription, notes] = await Promise.all([
          api
            .getSubscriptionFresh()
            .catch(() => requestApi.getSubscription().catch(() => ({ plan: 'FREE' as const }))),
          requestApi.getSecureNotes().catch(() => []),
        ]);
        setPlan((subscription.plan || 'FREE') as Plan);
        setNoteCount(notes.length || 0);
      } finally {
        setChecking(false);
      }
    };

    loadLimits();
  }, []);

  const showUpgradeAlert = () => {
    Alert.alert(
      'SecureNotes limit reached',
      `Free accounts can save up to ${FREE_SECURE_NOTE_LIMIT} SecureNotes. Upgrade to Premium or Family for unlimited SecureNotes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/subscription?from=addnote') },
      ]
    );
  };

  const handleSave = async () => {
    if (saving) return;

    if (freeLimitReached) {
      showUpgradeAlert();
      return;
    }

    if (!title.trim()) {
      Alert.alert('Missing title', 'Please enter a title for this SecureNote.');
      return;
    }

    if (!content.trim()) {
      Alert.alert('Missing note', 'Please enter the note content.');
      return;
    }

    try {
      setSaving(true);

      await requestApi.createSecureNote({
        title: title.trim(),
        category,
        encryptedContent: encryptJson(content.trim()),
        pinned,
      });

      Alert.alert('Saved', 'SecureNote saved to your vault.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      const message = String(error?.message || 'Could not save SecureNote.');

      if (message.toUpperCase().includes('PLAN_LIMIT_REACHED') || message.toLowerCase().includes('limit')) {
        showUpgradeAlert();
        return;
      }

      Alert.alert('Save failed', message);
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <AddScreenEntrance
        style={styles.container}
        backgroundColor={C.background}
      >
        <View style={styles.centered}>
          <ActivityIndicator color={C.primary} />
          <Text style={styles.loadingText}>Checking note access...</Text>
        </View>
      </AddScreenEntrance>
    );
  }

  if (freeLimitReached) {
    return (
      <AddScreenEntrance
        style={styles.container}
        backgroundColor={C.background}
      >
        <View style={styles.lockedContent}>
          <View style={styles.noteIconLarge}>
            <Ionicons name="reader-outline" size={42} color="#fff" />
          </View>

          <Text style={styles.lockedTitle}>Free note limit reached</Text>
          <Text style={styles.lockedSubtitle}>
            You have used {noteCount}/{FREE_SECURE_NOTE_LIMIT} SecureNotes on the Free plan. Upgrade to Premium or Family for unlimited SecureNotes, categories, and pinned notes.
          </Text>

          <TouchableOpacity style={styles.saveBtn} onPress={() => router.push('/subscription?from=addnote')}>
            <Ionicons name="sparkles-outline" size={20} color="#fff" />
            <Text style={styles.saveBtnText}>Upgrade plan</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.notNowBtn} onPress={() => router.back()}>
            <Text style={styles.notNowText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </AddScreenEntrance>
    );
  }

  return (
    <AddScreenEntrance
        style={styles.container}
        backgroundColor={C.background}
      >
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
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.header}>
            <View style={styles.noteIcon}>
              <Ionicons name="reader-outline" size={26} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Add SecureNote</Text>
            </View>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Gmail recovery codes"
              placeholderTextColor={C.tabInactive}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {CATEGORIES.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.categoryChip, category === item && styles.categoryChipActive]}
                  onPress={() => { hapticSelection(); setCategory(item); }}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.pinnedRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pinnedTitle}>Pin note</Text>
              </View>
              <Switch
                value={pinned}
                onValueChange={(nextValue) => {
                  nextValue ? hapticToggleOn() : hapticToggleOff();
                  setPinned(nextValue);
                }}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#fff"
                ios_backgroundColor={C.border}
              />
            </View>

            <Text style={styles.label}>SecureNote</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Write your private note here..."
              placeholderTextColor={C.tabInactive}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
            />

            <View>
              {/* <Ionicons name="lock-closed-outline" size={18} color={C.primary} /> */}
              {/* <Text style={styles.noticeText}>The note content is encrypted before it is saved.</Text> */}
            </View>
          </View>

          <TouchableOpacity style={[styles.saveBtn, saving && styles.disabledBtn]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />}
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save SecureNote'}</Text>
          </TouchableOpacity>

          <View style={{ height: 90 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </AddScreenEntrance>
  );
}

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

const makeStyles = (C: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { color: C.textSecondary, marginTop: 10, fontSize: 14 },
    scrollContent: { paddingBottom: 30 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 94, paddingBottom: 18 },
    noteIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center' },
    title: { color: C.text, fontSize: 25, fontWeight: '900' },
    subTitle: { color: C.textSecondary, fontSize: 13, marginTop: 3, fontWeight: '700' },
    form: { paddingHorizontal: 20 },
    label: { fontSize: 14, color: C.text, fontWeight: '800', marginBottom: 8 },
    input: { backgroundColor: C.backgroundElement, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 15, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border, marginBottom: 18 },
    categoryRow: { gap: 8, paddingBottom: 18 },
    categoryChip: { backgroundColor: C.backgroundElement, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: C.border },
    categoryChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    categoryText: { color: C.textSecondary, fontSize: 12, fontWeight: '800' },
    categoryTextActive: { color: '#fff' },
    pinnedRow: { backgroundColor: C.backgroundElement, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', marginBottom: 18
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    pinnedTitle: { color: C.text, fontSize: 15, fontWeight: '900' },
    pinnedSub: { color: C.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 17 },
    noteInput: { minHeight: 220, backgroundColor: C.backgroundElement, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border, marginBottom: 16, lineHeight: 21 },
    noticeBox: { backgroundColor: C.actionCard, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    noticeText: { color: C.primary, fontSize: 13, fontWeight: '800', flex: 1, lineHeight: 18 },
    saveBtn: { backgroundColor: C.backgroundbutton, borderRadius: 999, minHeight: 56, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, marginHorizontal: 20, marginTop: 4
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
    disabledBtn: { opacity: 0.7 },
    lockedContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 40 },
    noteIconLarge: { width: 86, height: 86, borderRadius: 30, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
    lockedTitle: { color: C.text, fontSize: 30, fontWeight: '900', marginBottom: 10 },
    lockedSubtitle: { color: C.textSecondary, fontSize: 15, lineHeight: 23, marginBottom: 24 },
    notNowBtn: { paddingVertical: 14, alignItems: 'center' },
    notNowText: { color: C.textSecondary, fontSize: 15, fontWeight: '800' },
  });