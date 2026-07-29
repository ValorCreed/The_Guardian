import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Device from 'expo-device';
import { AlertTriangle, Bug, CheckCircle2, Send, ShieldAlert } from 'lucide-react-native';

import { useAppTheme } from '../context/ThemeContext';
import { useAppAlert } from '../context/AppAlertContext';
import { api } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import {
  hapticError,
  hapticLight,
  hapticSelection,
  hapticSuccess,
  hapticToggleOff,
  hapticToggleOn,
  hapticWarning,
} from '../utils/haptics';

const CATEGORIES = ['Vault', 'Documents', 'Family', 'Security', 'Payment', 'UI', 'Other'];
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

export default function BugReportScreen() {
  const requestApi = useCancelableApi(api);
  const { colors: C, isDark } = useAppTheme();
  const { showAlert } = useAppAlert();
  const styles = makeStyles(C);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Vault');
  const [severity, setSeverity] = useState('Medium');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const deviceInfo = useMemo(() => {
    return [
      `OS: ${Platform.OS}`,
      `OS version: ${String(Platform.Version)}`,
      `Device brand: ${Device.brand || 'Unknown'}`,
      `Device model: ${Device.modelName || 'Unknown'}`,
      `Device type: ${Device.deviceType || 'Unknown'}`,
      `Physical device: ${Device.isDevice ? 'Yes' : 'No'}`,
    ].join('\n');
  }, []);

  const validate = () => {
    if (!title.trim()) {
      hapticWarning();
      showAlert({ title: 'Title required', message: 'Give the bug a short title.', type: 'warning' });
      return false;
    }

    if (!description.trim()) {
      hapticWarning();
      showAlert({ title: 'Description required', message: 'Describe what went wrong and what you expected.', type: 'warning' });
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!validate()) return;

    try {
      setSubmitting(true);
      hapticLight();

      await requestApi.submitBugReport({
        title,
        category,
        severity,
        description,
        stepsToReproduce,
        includeDiagnostics,
        deviceInfo: includeDiagnostics ? deviceInfo : '',
        appVersion: 'The Guardian mobile app',
      });

      hapticSuccess();
      showAlert({
        title: 'Bug report sent',
        message: 'Thanks for helping improve The Guardian. We saved your report securely.',
        type: 'success',
        buttons: [
          {
            text: 'Done',
            onPress: () => router.back(),
          },
        ],
      });
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) return;
      hapticError();
      showAlert({
        title: 'Could not send report',
        message: error?.message || 'Please check your connection and try again.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <Text style={styles.kicker}></Text>
          <Text style={styles.title}>Report a Bug</Text>
          <Text style={styles.subtitle}>
            Tell us what broke. Please do not include passwords, card numbers, recovery codes, SecureNotes, or document contents.
          </Text>

          {/* <View style={styles.warningCard}>
            <ShieldAlert size={20} color={C.warning} />
            <Text style={styles.warningText}>
              Describe the problem without including vault secrets.
            </Text>
          </View> */}

          <View style={styles.card}>
            <Text style={styles.label}>Bug title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Document download button freezes"
              placeholderTextColor={C.textSecondary}
              maxLength={140}
            />

            <Text style={styles.label}>Category</Text>
            <View style={styles.chipWrap}>
              {CATEGORIES.map((item) => {
                const selected = category === item;
                return (
                  <TouchableOpacity
                    key={item}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => { setCategory(item); hapticSelection(); }}
                    activeOpacity={0.82}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{item}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Severity</Text>
            <View style={styles.chipWrap}>
              {SEVERITIES.map((item) => {
                const selected = severity === item;
                return (
                  <TouchableOpacity
                    key={item}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => { setSeverity(item); hapticSelection(); }}
                    activeOpacity={0.82}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{item}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>What happened?</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the bug clearly..."
              placeholderTextColor={C.textSecondary}
              multiline
              textAlignVertical="top"
              maxLength={4000}
            />

            <Text style={styles.label}>Steps to reproduce</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={stepsToReproduce}
              onChangeText={setStepsToReproduce}
              placeholder={"1. Open Vault \n2. Tap Documents \n3. ..."}
              placeholderTextColor={C.textSecondary}
              multiline
              textAlignVertical="top"
              maxLength={4000}
            />

            <View style={styles.diagnosticsRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Include diagnostics</Text>
                <Text style={styles.rowSub}>
                  Adds device model, OS, and app context. No vault secrets are included.
                </Text>
              </View>
              <Switch
                value={includeDiagnostics}
                onValueChange={(value) => {
                  setIncludeDiagnostics(value);
                  value ? hapticToggleOn() : hapticToggleOff();
                }}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.86}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Send size={18} color="#FFFFFF" />
            )}
            <Text style={styles.submitText}>{submitting ? 'Sending report...' : 'Send Bug Report'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => { hapticLight(); router.back(); }}
            disabled={submitting}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryText}>Cancel</Text>
          </TouchableOpacity>

          <View style={styles.statusRow}>
            {/* <CheckCircle2 size={16} color={C.success} />
            <Text style={styles.statusText}>Reports are attached to your account for follow-up.</Text> */}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  scrollContent: { paddingHorizontal: 20, paddingTop: 112, paddingBottom: 150 },
  kicker: { color: C.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, marginBottom: 8 },
  title: { color: C.text, fontSize: 34, fontWeight: '900', letterSpacing: -0.7 },
  subtitle: { color: C.textSecondary, fontSize: 14, lineHeight: 21, fontWeight: '600', marginTop: 8, marginBottom: 16 },
  warningCard: { flexDirection: 'row', gap: 10, backgroundColor: C.alertWarningBg, borderRadius: 22, borderWidth: 1, borderColor: C.border, padding: 15, marginBottom: 16 },
  warningText: { flex: 1, color: C.text, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  card: { backgroundColor: C.backgroundElement, borderRadius: 26, borderWidth: 1, borderColor: C.border, padding: 16 },
  label: { color: C.text, fontSize: 13, fontWeight: '900', marginTop: 14, marginBottom: 8 },
  input: { minHeight: 52, borderRadius: 18, borderWidth: 1, borderColor: C.inputBorder || C.border, backgroundColor: C.inputBackground || C.surface, color: C.text, paddingHorizontal: 14, fontSize: 14, fontWeight: '700' },
  textArea: { minHeight: 118, paddingTop: 13, paddingBottom: 13 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.background },
  chipSelected: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { color: C.textSecondary, fontSize: 12, fontWeight: '900' },
  chipTextSelected: { color: '#FFFFFF' },
  diagnosticsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 18, marginTop: 4 },
  rowTitle: { color: C.text, fontSize: 15, fontWeight: '900' },
  rowSub: { color: C.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 3, lineHeight: 17 },
  submitButton: { height: 56, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginTop: 18 },
  submitButtonDisabled: { opacity: 0.65 },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  secondaryButton: { height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 10, backgroundColor: C.backgroundSelected },
  secondaryText: { color: C.text, fontSize: 14, fontWeight: '900' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18 },
  statusText: { color: C.textSecondary, fontSize: 12, fontWeight: '700' },
});
