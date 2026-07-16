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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { encryptJson } from '../utils/vaultcrypto';
import { hapticToggleOff, hapticToggleOn } from '../utils/haptics';

type Plan = 'FREE' | 'PREMIUM' | 'FAMILY';

const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

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
        const loadedPlan = String(subscription?.plan || 'FREE').toUpperCase();

        if (loadedPlan === 'PREMIUM' || loadedPlan === 'FAMILY') {
          setPlan(loadedPlan as Plan);
        } else {
          setPlan('FREE');
        }
      } catch (error) {
        console.log('Could not load subscription plan:', error);
        setPlan('FREE');
      } finally {
        setLoadingPlan(false);
      }
    };

    loadPlan();
  }, []);

  const isPaid = plan === 'PREMIUM' || plan === 'FAMILY';
  const waitingOptions = isPaid ? [24, 48, 72] : [72];

  const effectiveAllowNotes = isPaid ? allowNotes : true;

  const planNote = useMemo(() => {
    if (plan === 'FREE') {
      return 'Free users can add 1 emergency contact with a fixed 72-hour waiting period and emergency note access. Upgrade to share passwords, cards, and documents.';
    }

    if (plan === 'PREMIUM') {
      return 'Premium users can add up to 3 emergency contacts and choose what emergency items can be accessed.';
    }

    return 'Family users can add more emergency contacts and allow emergency access to passwords, cards, documents, and notes.';
  }, [plan]);

  const handleSave = async () => {
    if (saving) return;

    const cleanEmail = contactEmail.trim().toLowerCase();
    const cleanName = contactName.trim();
    const cleanRelationship = relationship.trim() || 'Trusted contact';
    const cleanEmergencyNote = emergencyNote.trim();

    if (!cleanEmail) {
      Alert.alert('Missing email', 'Enter your trusted contact email address.');
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      Alert.alert('Invalid email', 'Enter a valid email address for your trusted contact.');
      return;
    }

    try {
      const currentUserEmail = (await AsyncStorage.getItem('userEmail'))?.trim().toLowerCase();

      if (currentUserEmail && currentUserEmail === cleanEmail) {
        Alert.alert(
          'Use another email',
          'Your emergency contact should be a different trusted person, not your own account email.'
        );
        return;
      }
    } catch {
      // If reading local storage fails, continue. Backend will still validate the request.
    }

    if (isPaid && !allowPasswords && !allowCards && !allowDocuments && !allowNotes && !cleanEmergencyNote) {
      Alert.alert(
        'Choose access',
        'Select at least one emergency access option or write an emergency note before saving.'
      );
      return;
    }

    try {
      setSaving(true);

      await api.createEmergencyContact({
        contactEmail: cleanEmail,
        contactName: cleanName,
        relationship: cleanRelationship,
        waitingPeriodHours: isPaid ? waitingPeriodHours : 72,
        allowPasswords: isPaid && allowPasswords,
        allowCards: isPaid && allowCards,
        allowDocuments: isPaid && allowDocuments,
        allowNotes: effectiveAllowNotes,
        encryptedEmergencyNote: cleanEmergencyNote ? encryptJson(cleanEmergencyNote) : '',
        active: true,
      });

      Alert.alert(
        'Emergency contact added',
        'Your trusted contact has been added. They can request emergency access based on the waiting period and permissions you selected.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert(
        'Could not add contact',
        error?.message || 'We could not add this emergency contact. Please check the details and try again.'
      );
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <View style={styles.planPill}>
              <Ionicons
                name={isPaid ? 'shield-checkmark-outline' : 'lock-closed-outline'}
                size={14}
                color={isPaid ? C.primary : C.warning}
              />
              <Text style={[styles.planPillText, { color: isPaid ? C.primary : C.warning }]}>
                {plan} plan
              </Text>
            </View>
          </View>

          <Text style={styles.eyebrow}>Trusted contact</Text>
          <Text style={styles.title}>Add Emergency Contact</Text>
          <Text style={styles.subtitle}>{planNote}</Text>

          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={20} color={C.primary} />
            <Text style={styles.infoText}>
              Emergency contacts do not get instant access. They must request access first, and your selected waiting period controls when access becomes available.
            </Text>
          </View>

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
              placeholder="Alex Smith"
              placeholderTextColor={C.tabInactive}
              value={contactName}
              onChangeText={setContactName}
            />

            <Text style={styles.label}>Relationship</Text>
            <TextInput
              style={styles.input}
              placeholder="Brother, sister, spouse, parent..."
              placeholderTextColor={C.tabInactive}
              value={relationship}
              onChangeText={setRelationship}
            />
          </View>

          <Text style={styles.sectionTitle}>Waiting period</Text>
          <Text style={styles.sectionHint}>
            This is how long the contact must wait before emergency access becomes available.
          </Text>

          <View style={styles.optionRow}>
            {waitingOptions.map((hours) => (
              <TouchableOpacity
                key={hours}
                style={[styles.waitOption, waitingPeriodHours === hours && styles.waitOptionActive]}
                onPress={() => setWaitingPeriodHours(hours)}
                activeOpacity={0.85}
              >
                <Text style={[styles.waitOptionText, waitingPeriodHours === hours && styles.waitOptionTextActive]}>
                  {hours}h
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Allowed emergency access</Text>
          <View style={styles.card}>
            {!isPaid && (
              <TouchableOpacity style={styles.lockedHint} onPress={() => router.push('/subscription')} activeOpacity={0.85}>
                <Ionicons name="lock-closed-outline" size={18} color={C.warning} />
                <Text style={styles.lockedHintText}>
                  Upgrade to allow emergency access to passwords, cards, and documents.
                </Text>
              </TouchableOpacity>
            )}

            <PermissionRow
              title="Secure notes"
              subtitle={
                isPaid
                  ? 'Allow access to emergency notes and secure notes.'
                  : 'Included for Free users as emergency note access.'
              }
              value={effectiveAllowNotes}
              onValueChange={setAllowNotes}
              C={C}
              disabled={!isPaid}
              first
            />

            <PermissionRow
              title="Passwords"
              subtitle="Premium and Family only."
              value={allowPasswords}
              onValueChange={setAllowPasswords}
              C={C}
              disabled={!isPaid}
            />

            <PermissionRow
              title="Cards"
              subtitle="Premium and Family only."
              value={allowCards}
              onValueChange={setAllowCards}
              C={C}
              disabled={!isPaid}
            />

            <PermissionRow
              title="Documents"
              subtitle="Premium and Family only."
              value={allowDocuments}
              onValueChange={setAllowDocuments}
              C={C}
              disabled={!isPaid}
            />
          </View>

          <Text style={styles.sectionTitle}>Emergency note</Text>
          <Text style={styles.sectionHint}>
            Add instructions your trusted contact may need in an emergency. This is optional.
          </Text>

          <TextInput
            style={styles.noteInput}
            placeholder="Example: Call my brother first, check the family documents folder, and use the recovery note if needed..."
            placeholderTextColor={C.tabInactive}
            value={emergencyNote}
            onChangeText={setEmergencyNote}
            multiline
          />

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.disabledButton]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.88}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
            )}
            <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Emergency Contact'}</Text>
          </TouchableOpacity>

          <View style={{ height: 80 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PermissionRow({ title, subtitle, value, onValueChange, C, disabled, first }: any) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 13,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: C.border,
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: disabled ? C.tabInactive : C.text, fontWeight: '900', fontSize: 15 }}>
          {title}
        </Text>
        <Text style={{ color: C.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
          {subtitle}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={(nextValue) => {
          nextValue ? hapticToggleOn() : hapticToggleOff();
          onValueChange(nextValue);
        }}
        disabled={disabled}
        trackColor={{ false: C.border, true: C.primary }}
        thumbColor="#fff"
        ios_backgroundColor={C.border}
      />
    </View>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: C.textSecondary,
    marginTop: 12,
    fontSize: 15,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 130,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 22,
  },
  planPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.backgroundElement,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  planPillText: {
    fontSize: 12,
    fontWeight: '900',
  },
  eyebrow: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    color: C.text,
    fontSize: 29,
    fontWeight: '900',
    marginTop: 2,
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 18,
  },
  infoCard: {
    backgroundColor: C.actionCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 18,
    flexDirection: 'row',
    gap: 10,
  },
  infoText: {
    flex: 1,
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  card: {
    backgroundColor: C.backgroundElement,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 18,
  },
  label: {
    color: C.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  input: {
    backgroundColor: C.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 14,
  },
  sectionTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6,
  },
  sectionHint: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  waitOption: {
    flex: 1,
    backgroundColor: C.backgroundElement,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    paddingVertical: 14,
  },
  waitOptionActive: {
    backgroundColor: C.actionCard,
    borderColor: C.primary,
  },
  waitOptionText: {
    color: C.textSecondary,
    fontWeight: '900',
  },
  waitOptionTextActive: {
    color: C.primary,
  },
  lockedHint: {
    backgroundColor: C.securityScoreBg,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 10,
  },
  lockedHintText: {
    color: C.warning,
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  noteInput: {
    backgroundColor: C.backgroundElement,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 130,
    textAlignVertical: 'top',
    marginBottom: 18,
  },
  saveButton: {
    backgroundColor: C.backgroundbutton,
    borderRadius: 999,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  disabledButton: {
    opacity: 0.65,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
});