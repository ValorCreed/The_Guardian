import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, saveLoginSession } from '../services/api';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TwoFactorScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!email) {
      Alert.alert('Missing email', 'Please go back and sign in again.');
      return;
    }

    if (code.trim().length < 6) {
      Alert.alert('Code required', 'Enter the 6-digit code sent to your email.');
      return;
    }

    try {
      setLoading(true);
      const data = await api.verifyTwoFactor({ email, code });
      await saveLoginSession(data);
      router.replace('/home');
    } catch (error: any) {
      Alert.alert('2FA failed', error.message || 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.iconCircle}>
          <Ionicons name="shield-checkmark-outline" size={42} color="#2563EB" />
        </View>

        <Text style={styles.title}>Two-Factor Verification</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit login code to {email || 'your email'}. Enter it below to continue.
        </Text>

        <TextInput
          value={code}
          onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
          placeholder="Enter 6-digit code"
          keyboardType="number-pad"
          maxLength={6}
          style={styles.input}
          textAlign="center"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Verify and Continue</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/login')} disabled={loading}>
          <Text style={styles.backText}>Back to sign in</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
    color: '#0F172A',
    marginBottom: 18,
  },
  button: {
    width: '100%',
    backgroundColor: '#065F46',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 18,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  backText: {
    color: '#065F46',
    fontSize: 15,
    fontWeight: '700',
  },
});
