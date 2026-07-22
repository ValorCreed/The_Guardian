import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
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

export default function EmergencyRequestScreen() {
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [ownerEmail, setOwnerEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const sendRequest = async () => {
    if (sending) return;

    if (!ownerEmail.trim()) {
      Alert.alert('Missing owner email', 'Enter the email of the vault owner who added you as an emergency contact.');
      return;
    }

    try {
      setSending(true);
      await api.requestEmergencyAccess({ ownerEmail, message });
      Alert.alert(
        'Request sent',
        'The vault owner has been notified. Access will only be released if they approve or if the waiting period expires.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert('Request failed', error.message || 'Could not send emergency request.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.iconCircle}>
            <Ionicons name="hand-left-outline" size={34} color={C.primary} />
          </View>

          <Text style={styles.eyebrow}>Trusted contact</Text>
          <Text style={styles.title}>Request Emergency Access</Text>
          <Text style={styles.subtitle}>
            Use this only when the vault owner is unavailable and has added you as a trusted emergency contact.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Vault owner email</Text>
            <TextInput
              style={styles.input}
              placeholder="owner@example.com"
              placeholderTextColor={C.tabInactive}
              value={ownerEmail}
              onChangeText={setOwnerEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />

            <Text style={styles.label}>Message</Text>
            <TextInput
              style={styles.messageInput}
              placeholder="Explain why you need emergency access..."
              placeholderTextColor={C.tabInactive}
              value={message}
              onChangeText={setMessage}
              multiline
            />
          </View>

          <View style={styles.noticeBox}>
            <Ionicons name="shield-checkmark-outline" size={20} color={C.primary} />
            <Text style={styles.noticeText}>
              The owner can approve or deny this request. If they do not respond, the configured waiting period controls when access becomes available.
            </Text>
          </View>

          <TouchableOpacity style={[styles.sendButton, sending && styles.disabledButton]} onPress={sendRequest} disabled={sending}>
            {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send-outline" size={20} color="#fff" />}
            <Text style={styles.sendButtonText}>{sending ? 'Sending...' : 'Send Emergency Request'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 20, paddingTop: 96, paddingBottom: 130 },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: C.actionCard,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  eyebrow: { color: C.textSecondary, fontSize: 13, fontWeight: '800' },
  title: { color: C.text, fontSize: 29, fontWeight: '900', marginTop: 2 },
  subtitle: { color: C.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  card: {
    backgroundColor: C.backgroundElement,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  label: { color: C.text, fontSize: 14, fontWeight: '800', marginBottom: 8 },
  input: { backgroundColor: C.background, borderRadius: 16, borderWidth: 1, borderColor: C.border, color: C.text, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 16 },
  messageInput: { backgroundColor: C.background, borderRadius: 16, borderWidth: 1, borderColor: C.border, color: C.text, paddingHorizontal: 14, paddingVertical: 13, minHeight: 130, textAlignVertical: 'top' },
  noticeBox: {
    backgroundColor: C.actionCard,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  noticeText: { color: C.primary, flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  sendButton: {
    backgroundColor: C.backgroundbutton,
    borderRadius: 999,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: C.primary,
    shadowOpacity: 0.20,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  disabledButton: { opacity: 0.65 },
  sendButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});