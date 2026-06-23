import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  // check if biometrics are available and enabled by user in settings
  useEffect(() => {
    const checkBiometric = async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const saved = await AsyncStorage.getItem('biometricUnlock');
      setBiometricEnabled(compatible && enrolled && saved === 'true');
    };
    checkBiometric();
  }, []);

  const handleBiometricAuth = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock The Guardian',
      fallbackLabel: 'Use Password',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    if (result.success) {
      router.replace('/home');
    } else {
      Alert.alert('Authentication Failed', 'Could not verify your identity. Please use your password.');
    }
  };

  const handleUnlock = () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter your email and master password.');
      return;
    }
    router.replace('/home');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0F4F0" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>

          {/* Back button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.6}
          >
            <Ionicons name="arrow-back" size={16} color="#3A4A40" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.logoBox}>
              <Ionicons name="shield-checkmark" size={28} color="#FFFFFF" />
            </View>
          </View>

          {/* Heading */}
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Unlock your vault with your master password.
          </Text>

          {/* Email field */}
          <Text style={styles.label}>Email</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>

          {/* Master password field */}
          <Text style={styles.label}>Master Password</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              placeholder="Enter master password"
              placeholderTextColor="#9CA3AF"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              activeOpacity={0.6}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          </View>

          {/* Forgot password */}
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => router.push('/forgotpassword')}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          {/* Biometric button — only shows if enabled in settings */}
          {biometricEnabled && (
            <TouchableOpacity
              style={styles.biometricBtn}
              onPress={handleBiometricAuth}
              activeOpacity={0.7}
            >
              <Ionicons name="finger-print-outline" size={26} color="#1B4332" />
              <Text style={styles.biometricText}>Use Face ID / Fingerprint</Text>
            </TouchableOpacity>
          )}

        </View>

        {/* Unlock button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.unlockButton}
            activeOpacity={0.85}
            onPress={handleUnlock}
          >
            <Text style={styles.unlockButtonText}>Unlock Vault</Text>
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F4F0',
  },

  flex: {
    flex: 1,
  },

  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 28,
  },

  backText: {
    fontSize: 15,
    color: '#3A4A40',
  },

  logoContainer: {
    marginBottom: 24,
  },

  logoBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#1B4332',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F2D1F',
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 15,
    color: '#7A8A80',
    lineHeight: 22,
    marginBottom: 32,
  },

  label: {
    fontSize: 13,
    color: '#3A4A40',
    marginBottom: 8,
    marginLeft: 2,
  },

  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },

  input: {
    flex: 1,
    fontSize: 15,
    color: '#0F2D1F',
  },

  forgotText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1B4332',
    marginTop: 4,
  },

  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 24,
    padding: 14,
    backgroundColor: '#e8f0e8',
    borderRadius: 16,
  },

  biometricText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1B4332',
  },

  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
  },

  unlockButton: {
    backgroundColor: '#1B4332',
    borderRadius: 30,
    paddingVertical: 18,
    alignItems: 'center',
  },

  unlockButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});