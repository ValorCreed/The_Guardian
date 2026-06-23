import React, { useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  TextInput, Alert, useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

const ForgotPasswordScreen = () => {
  const router = useRouter();
  const rawScheme = useColorScheme();
  const scheme: 'light' | 'dark' = rawScheme === 'dark' ? 'dark' : 'light';
  const C = Colors[scheme];
  const styles = makeStyles(C);

  const [email, setEmail] = useState('');

  const handleSubmit = () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }
    Alert.alert(
      'Recovery Email Sent',
      'If an account exists for this email, you will receive recovery instructions.',
      [{ text: 'OK', onPress: () => router.back() }]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.iconBox}>
          <Ionicons name="lock-open-outline" size={32} color={C.primary} />
        </View>

        <Text style={styles.title}>Forgot Password?</Text>
        <Text style={styles.subtitle}>
          Enter your email address and we'll send you instructions to recover your vault.
        </Text>

        <View style={styles.warningBox}>
          <Ionicons name="warning-outline" size={18} color={C.warning} />
          <Text style={styles.warningText}>
            Due to zero-knowledge encryption, we cannot recover your master password. You can only reset access if you saved your recovery kit.
          </Text>
        </View>

        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={C.tabInactive}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitBtnText}>Send Recovery Email</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default ForgotPasswordScreen;

const makeStyles = (C: typeof Colors.light | typeof Colors.dark) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    backBtn: {
      width: 36, height: 36, backgroundColor: C.backgroundSelected,
      borderRadius: 18, justifyContent: 'center', alignItems: 'center',
    },
    content: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
    iconBox: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: C.actionCard,
      justifyContent: 'center', alignItems: 'center', marginBottom: 24,
    },
    title: { fontSize: 28, fontWeight: 'bold', color: C.text, marginBottom: 10 },
    subtitle: { fontSize: 15, color: C.textSecondary, lineHeight: 22, marginBottom: 24 },
    warningBox: {
      backgroundColor: C.securityScoreBg,
      borderRadius: 12, padding: 14,
      flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 28,
    },
    warningText: { flex: 1, fontSize: 13, color: C.warning, lineHeight: 20 },
    label: { fontSize: 14, color: C.text, fontWeight: '600', marginBottom: 8 },
    input: {
      backgroundColor: C.backgroundElement,
      borderRadius: 50, paddingHorizontal: 20, paddingVertical: 16,
      fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.border,
    },
    footer: { paddingHorizontal: 24, paddingBottom: 32 },
    submitBtn: {
      backgroundColor: C.backgroundbutton,
      paddingVertical: 18, borderRadius: 50, alignItems: 'center',
    },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  });