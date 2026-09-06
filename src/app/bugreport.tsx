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
import { Send } from 'lucide-react-native';

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
          <Text style={styles.title}>Report a Bug</Text>
          <Text style={styles.subtitle}>
            Describe the issue without including passwords, card numbers, recovery codes, notes, or document contents.
          </Text>

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

            <View style={styles.diagnosticsCard}>
              <View style={styles.diagnosticsText}>
                <Text style={styles.rowTitle}>Include diagnostics</Text>
                <Text style={styles.rowSub}>
                  Adds device and app details only.
                </Text>
              </View>
              <Switch
                value={includeDiagnostics}
                onValueChange={(value) => {
                  setIncludeDiagnostics(value);
                  if (value) {
                    hapticToggleOn();
                  } else {
                    hapticToggleOff();
                  }
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 112,
    paddingBottom: 150,
  },
  title: {
    color: C.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 18,
  },
  card: {
    backgroundColor: C.backgroundElement,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.border,
    padding: 17,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  label: {
    color: C.text,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 14,
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.inputBorder || C.border,
    backgroundColor: C.inputBackground || C.surface,
    color: C.text,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '700',
    shadowColor: '#000000',
    shadowOpacity: 0.13,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  textArea: {
    minHeight: 118,
    paddingTop: 13,
    paddingBottom: 13,
  },
  chipWrap: {
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
    shadowOffset: { width: 0, height: 6 },

    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.background,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  chipSelected: {
    shadowColor: '#000000',

    backgroundColor: C.primary,
    borderColor: C.primary,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  chipText: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '900',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  diagnosticsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.background,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  diagnosticsText: {
    flex: 1,
  },
  rowTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '900',
  },
  rowSub: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
    lineHeight: 17,
  },
  submitButton: {
    height: 58,
    borderRadius: 21,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
    marginTop: 20,
    borderWidth: 1,
    borderColor: `${C.primary}CC`,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 11 },
    elevation: 10,
  },
  submitButtonDisabled: {
    opacity: 0.65,
    shadowOpacity: 0.08,
    elevation: 3,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    height: 54,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    backgroundColor: C.backgroundSelected,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 11 },
    elevation: 10,
  },
  secondaryText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '900',
  },
});