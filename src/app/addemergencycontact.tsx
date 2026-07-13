import React, { useEffect, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { encryptJson } from '../utils/vaultcrypto';

type Plan = 'FREE' | 'PREMIUM' | 'FAMILY';

export default function AddEmergencyContactScreen() {
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [plan, setPlan] = useState<Plan>('FREE');
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [saving, setSaving] = useState(false);

  const [contactEmail, setContactEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [waitingPeriodHours, setWaitingPeriodHours] = useState(72);
  const [allowPasswords, setAllowPasswords] = useState(false);
  const [allowCards, setAllowCards] = useState(false);
  const [allowDocuments, setAllowDocuments] = useState(false);
  const [allowNotes, setAllowNotes] = useState(true);
  const [emergencyNote, setEmergencyNote] = useState('');

  useEffect(() => {
    const loadPlan = async () => {
      try {
        const subscription = await api.getSubscription();
        const loadedPlan = subscription.plan || 'FREE';
        setPlan(loadedPlan as Plan);
      } catch {
        setPlan('FREE');
      } finally {
        setLoadingPlan(false);
      }
    };

    loadPlan();
  }, []);

  const isPaid = plan === 'PREMIUM' || plan === 'FAMILY';
  const waitingOptions = isPaid ? [24, 48, 72] : [72];

  const planNote = useMemo(() => {
    if (plan === 'FREE') return 'Free users can add 1 emergency contact with a fixed 72-hour waiting period and emergency note access.';
    if (plan === 'PREMIUM') return 'Premium users can add up to 3 contacts and choose what emergency items are allowed.';
    return 'Family users can add up to 6 emergency contacts and configure wider emergency permissions.';
  }, [plan]);

  const handleSave = async () => {
    if (saving) return;

    if (!contactEmail.trim()) {
      Alert.alert('Missing email', 'Enter the trusted contact email address.');
      return;
    }

    try {
      setSaving(true);

      await api.createEmergencyContact({
        contactEmail,
        contactName,
        relationship,
        waitingPeriodHours,
        allowPasswords: isPaid && allowPasswords,
        allowCards: isPaid && allowCards,
        allowDocuments: isPaid && allowDocuments,
        allowNotes: isPaid ? allowNotes : true,
        encryptedEmergencyNote: emergencyNote.trim() ? encryptJson(emergencyNote.trim()) : '',
        active: true,
      });

      Alert.alert('Emergency contact added', 'Your trusted contact has been added.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Could not add contact', error.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingPlan) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={C.primary} />
          <Text style={styles.loadingText}>Checking your plan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>Trusted contact</Text>
          <Text style={styles.title}>Add Emergency Contact</Text>
          <Text style={styles.subtitle}>{planNote}</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Contact email</Text>
            <TextInput
              style={styles.input}
              placeholder="trusted@example.com"
              placeholderTextColor={C.tabInactive}
              value={contactEmail}
              onChangeText={setContactEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />

            <Text style={styles.label}>Contact name</Text>
            <TextInput
              style={styles.input}
              placeholder="Brother, sister, spouse..."
              placeholderTextColor={C.tabInactive}
              value={contactName}
              onChangeText={setContactName}
            />

            <Text style={styles.label}>Relationship</Text>
            <TextInput
              style={styles.input}
              placeholder="Brother"
              placeholderTextColor={C.tabInactive}
              value={relationship}
              onChangeText={setRelationship}
            />
          </View>

          <Text style={styles.sectionTitle}>Waiting period</Text>
          <View style={styles.optionRow}>
            {waitingOptions.map((hours) => (
              <TouchableOpacity
                key={hours}
                style={[styles.waitOption, waitingPeriodHours === hours && styles.waitOptionActive]}
                onPress={() => setWaitingPeriodHours(hours)}
              >
                <Text style={[styles.waitOptionText, waitingPeriodHours === hours && styles.waitOptionTextActive]}>{hours}h</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Allowed emergency access</Text>
          <View style={styles.card}>
            {!isPaid && (
              <TouchableOpacity style={styles.lockedHint} onPress={() => router.push('/subscription')}>
                <Ionicons name="lock-closed-outline" size={18} color={C.warning} />
                <Text style={styles.lockedHintText}>Upgrade to allow passwords, cards, and documents during emergencies.</Text>
              </TouchableOpacity>
            )}

            <PermissionRow title="Secure notes" subtitle="Emergency note and selected secure notes" value={allowNotes} onValueChange={setAllowNotes} C={C} disabled={false} />
            <PermissionRow title="Passwords" subtitle="Premium and Family only" value={allowPasswords} onValueChange={setAllowPasswords} C={C} disabled={!isPaid} />
            <PermissionRow title="Cards" subtitle="Premium and Family only" value={allowCards} onValueChange={setAllowCards} C={C} disabled={!isPaid} />
            <PermissionRow title="Documents" subtitle="Premium and Family only" value={allowDocuments} onValueChange={setAllowDocuments} C={C} disabled={!isPaid} />
          </View>

          <Text style={styles.sectionTitle}>Emergency note</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Write instructions your trusted contact may need in an emergency..."
            placeholderTextColor={C.tabInactive}
            value={emergencyNote}
            onChangeText={setEmergencyNote}
            multiline
          />

          <TouchableOpacity style={[styles.saveButton, saving && styles.disabledButton]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />}
            <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Emergency Contact'}</Text>
          </TouchableOpacity>

          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PermissionRow({ title, subtitle, value, onValueChange, C, disabled }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderTopWidth: title === 'Secure notes' ? 0 : 1, borderTopColor: C.border }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: disabled ? C.tabInactive : C.text, fontWeight: '900', fontSize: 15 }}>{title}</Text>
        <Text style={{ color: C.textSecondary, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: C.border, true: C.primary }}
        thumbColor="#fff"
        ios_backgroundColor={C.border}
      />
    </View>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: C.textSecondary, marginTop: 12, fontSize: 15 },
  content: { paddingHorizontal: 18, paddingTop: 96, paddingBottom: 130 },
  eyebrow: { color: C.textSecondary, fontSize: 13, fontWeight: '800' },
  title: { color: C.text, fontSize: 29, fontWeight: '900', marginTop: 2 },
  subtitle: { color: C.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  card: { backgroundColor: C.backgroundElement, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 18 },
  label: { color: C.text, fontSize: 14, fontWeight: '800', marginBottom: 8 },
  input: { backgroundColor: C.background, borderRadius: 16, borderWidth: 1, borderColor: C.border, color: C.text, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 14 },
  sectionTitle: { color: C.text, fontSize: 17, fontWeight: '900', marginBottom: 10 },
  optionRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  waitOption: { flex: 1, backgroundColor: C.backgroundElement, borderRadius: 16, borderWidth: 1, borderColor: C.border, alignItems: 'center', paddingVertical: 14 },
  waitOptionActive: { backgroundColor: C.actionCard, borderColor: C.primary },
  waitOptionText: { color: C.textSecondary, fontWeight: '900' },
  waitOptionTextActive: { color: C.primary },
  lockedHint: { backgroundColor: C.securityScoreBg, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 },
  lockedHintText: { color: C.warning, flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  noteInput: { backgroundColor: C.backgroundElement, borderRadius: 18, borderWidth: 1, borderColor: C.border, color: C.text, paddingHorizontal: 16, paddingVertical: 14, minHeight: 130, textAlignVertical: 'top', marginBottom: 18 },
  saveButton: { backgroundColor: C.backgroundbutton, borderRadius: 999, paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  disabledButton: { opacity: 0.65 },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
