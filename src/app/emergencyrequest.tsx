import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import { useScreenAlert } from '../hooks/useScreenAlert';

export default function EmergencyRequestScreen() {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [ownerEmail, setOwnerEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const sendRequest = async () => {
    if (sending) return;

    if (!ownerEmail.trim()) {
      screenAlert('Missing owner email', 'Enter the email of the vault owner who added you as an emergency contact.');
      return;
    }

    try {
      setSending(true);
      await requestApi.requestEmergencyAccess({ ownerEmail, message });
      screenAlert(
        'Request sent',
        'The vault owner has been notified. This request requires their approval. Automatic release can occur only through Guardian Safety Check.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      screenAlert('Request failed', error.message || 'Could not send emergency request.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="hand-left-outline" size={34} color={C.primary} />
          </View>

          <Text style={styles.eyebrow}></Text>
          <Text style={styles.title}>Request emergency access</Text>
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
              The owner can approve or deny this request. It will not release automatically; Guardian Safety Check is the separate owner-inactivity path.
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
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
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
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  label: { color: C.text, fontSize: 14, fontWeight: '800', marginBottom: 8 },
  input: {
    shadowColor: '#000000',
    shadowOpacity: 0.13,
    shadowRadius: 14,
    elevation: 6,
    shadowOffset: { width: 0, height: 7 },
 backgroundColor: C.background, borderRadius: 16, borderWidth: 1, borderColor: C.border, color: C.text, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 16 },
  messageInput: {
    shadowColor: '#000000',
    shadowOpacity: 0.13,
    shadowRadius: 14,
    elevation: 6,
    shadowOffset: { width: 0, height: 7 },
 backgroundColor: C.background, borderRadius: 16, borderWidth: 1, borderColor: C.border, color: C.text, paddingHorizontal: 14, paddingVertical: 13, minHeight: 130, textAlignVertical: 'top' },
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
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
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
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 11 },
    elevation: 10,
  },
  disabledButton: { opacity: 0.65 },
  sendButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});