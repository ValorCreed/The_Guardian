import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { api, EmergencyContactResponse } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import { decryptJson } from '../utils/vaultcrypto';

export default function EmergencyDetailsScreen() {
  const requestApi = useCancelableApi(api);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: C, isDark } = useAppTheme();
  const styles = makeStyles(C);

  const [contact, setContact] = useState<EmergencyContactResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const loadContact = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      const data = await requestApi.getEmergencyContact(id);
      setContact(data);
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      Alert.alert('Could not load contact', error.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadContact();
    }, [loadContact])
  );

  const deleteContact = () => {
    if (!contact || deleting) return;

    Alert.alert(
      'Remove emergency contact?',
      `${contact.contactEmail} will no longer be able to request emergency access.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await requestApi.deleteEmergencyContact(contact.id);
              Alert.alert('Removed', 'Emergency contact removed.', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
              Alert.alert('Remove failed', error.message || 'Could not remove this contact.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const renderContactSkeleton = () => (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <PulsingSkeleton styles={styles} style={styles.skeletonAvatar} />
      <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
      <PulsingSkeleton styles={styles} style={styles.skeletonSubtitle} />

      <View style={styles.skeletonCard}>
        {[1, 2, 3].map((item, index) => (
          <View
            key={`contact-info-skeleton-${item}`}
            style={[
              styles.skeletonInfoRow,
              index === 2 && styles.skeletonLastRow,
            ]}
          >
            <PulsingSkeleton styles={styles} style={styles.skeletonInfoLabel} />
            <PulsingSkeleton styles={styles} style={styles.skeletonInfoValue} />
          </View>
        ))}
      </View>

      <PulsingSkeleton styles={styles} style={styles.skeletonSectionTitle} />
      <View style={styles.skeletonCard}>
        {[1, 2, 3, 4].map((item, index) => (
          <View
            key={`contact-access-skeleton-${item}`}
            style={[
              styles.skeletonAccessRow,
              index === 3 && styles.skeletonLastRow,
            ]}
          >
            <PulsingSkeleton styles={styles} style={styles.skeletonAccessText} />
            <PulsingSkeleton styles={styles} style={styles.skeletonAccessIcon} />
          </View>
        ))}
      </View>

      <PulsingSkeleton styles={styles} style={styles.skeletonButton} />
      <PulsingSkeleton styles={styles} style={styles.skeletonButtonDanger} />
    </ScrollView>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />
        {renderContactSkeleton()}
      </SafeAreaView>
    );
  }

  if (!contact) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingBox}>
          <Text style={styles.loadingText}>Emergency contact not found.</Text>
          <TouchableOpacity style={styles.mainButton} onPress={() => router.back()}>
            <Text style={styles.mainButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const emergencyNote = contact.encryptedEmergencyNote
    ? decryptJson<string>(contact.encryptedEmergencyNote, '')
    : '';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(contact.contactName || contact.contactEmail).slice(0, 1).toUpperCase()}</Text>
        </View>

        <Text style={styles.title}>{contact.contactName || contact.contactEmail}</Text>
        <Text style={styles.subtitle}>{contact.contactEmail}</Text>

        <View style={styles.card}>
          <InfoRow label="Relationship" value={contact.relationship || 'Trusted contact'} C={C} />
          <InfoRow label="Waiting period" value={`${contact.waitingPeriodHours} hours`} C={C} />
          <InfoRow label="Status" value={contact.active ? 'Active' : 'Inactive'} C={C} />
        </View>

        <Text style={styles.sectionTitle}>Allowed access</Text>
        <View style={styles.card}>
          <AccessRow label="Passwords" allowed={contact.allowPasswords} C={C} />
          <AccessRow label="Cards" allowed={contact.allowCards} C={C} />
          <AccessRow label="Documents" allowed={contact.allowDocuments} C={C} />
          <AccessRow label="SecureNotes" allowed={contact.allowNotes} C={C} />
        </View>

        {!!emergencyNote && (
          <>
            <Text style={styles.sectionTitle}>Emergency note</Text>
            <View style={styles.noteCard}>
              <Text style={styles.noteText}>{emergencyNote}</Text>
            </View>
          </>
        )}

        <TouchableOpacity style={styles.mainButton} onPress={() => router.push('/addemergencycontact')}>
          <Ionicons name="person-add-outline" size={20} color="#fff" />
          <Text style={styles.mainButtonText}>Add another contact</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteButton} onPress={deleteContact} disabled={deleting}>
          {deleting ? <ActivityIndicator color={C.danger} /> : <Ionicons name="trash-outline" size={20} color={C.danger} />}
          <Text style={styles.deleteButtonText}>{deleting ? 'Removing...' : 'Remove Contact'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, C }: any) {
  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: label === 'Status' ? 0 : 1, borderBottomColor: C.border }}>
      <Text style={{ color: C.textSecondary, fontSize: 12, fontWeight: '800' }}>{label}</Text>
      <Text style={{ color: C.text, fontSize: 15, fontWeight: '900', marginTop: 4 }}>{value}</Text>
    </View>
  );
}

function AccessRow({ label, allowed, C }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: label === 'SecureNotes' ? 0 : 1, borderBottomColor: C.border }}>
      <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '800' }}>{label}</Text>
      <Ionicons name={allowed ? 'checkmark-circle' : 'close-circle'} size={20} color={allowed ? C.success : C.tabInactive} />
    </View>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  skeletonBlock: {
    backgroundColor: C.backgroundSelected,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  skeletonAvatar: {
    width: 78,
    height: 78,
    borderRadius: 24,
    marginBottom: 14,
    shadowOpacity: 0.11,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  skeletonTitle: { width: '62%', height: 26, marginBottom: 10 },
  skeletonSubtitle: { width: '74%', height: 13, marginBottom: 22 },
  skeletonCard: {
    width: '100%',
    backgroundColor: C.backgroundElement,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 11 },
    elevation: 6,
  },
  skeletonInfoRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  skeletonInfoLabel: { width: '34%', height: 11, marginBottom: 8 },
  skeletonInfoValue: { width: '62%', height: 15 },
  skeletonSectionTitle: {
    width: '42%',
    height: 18,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  skeletonAccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  skeletonLastRow: {
    borderBottomWidth: 0,
  },
  skeletonAccessText: { width: '42%', height: 14 },
  skeletonAccessIcon: { width: 22, height: 22, borderRadius: 8 },
  skeletonButton: {
    width: '100%',
    height: 52,
    borderRadius: 999,
    marginTop: 2,
    shadowColor: C.backgroundbutton,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  skeletonButtonDanger: {
    width: '100%',
    height: 52,
    borderRadius: 999,
    marginTop: 12,
    shadowColor: C.danger,
    shadowOpacity: 0.13,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  safeArea: { flex: 1, backgroundColor: C.background },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: C.textSecondary, marginTop: 12, fontSize: 15, fontWeight: '700' },
  content: { paddingHorizontal: 20, paddingTop: 96, paddingBottom: 120, alignItems: 'center' },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: C.primary,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '900' },
  title: { color: C.text, fontSize: 26, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: C.textSecondary, fontSize: 14, marginTop: 4, marginBottom: 22, textAlign: 'center' },
  sectionTitle: { width: '100%', color: C.text, fontSize: 18, fontWeight: '900', marginBottom: 10 },
  card: {
    width: '100%',
    backgroundColor: C.backgroundElement,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 11 },
    elevation: 6,
  },
  noteCard: {
    width: '100%',
    backgroundColor: C.backgroundElement,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  noteText: { color: C.text, fontSize: 14, lineHeight: 21 },
  mainButton: {
    width: '100%',
    backgroundColor: C.backgroundbutton,
    borderRadius: 999,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 2,
    shadowColor: C.backgroundbutton,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  mainButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  deleteButton: {
    width: '100%',
    backgroundColor: C.alertDangerBg,
    borderColor: C.danger,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 12,
    shadowColor: C.danger,
    shadowOpacity: 0.13,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  deleteButtonText: { color: C.danger, fontSize: 15, fontWeight: '900' },
});