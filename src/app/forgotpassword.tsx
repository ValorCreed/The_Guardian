import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { api } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';

export default function ForgotPasswordScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert('Email required', 'Please enter your email address.');
      return;
    }

    try {
      setLoading(true);

      await api.forgotPassword({ email: cleanEmail });

      Alert.alert(
        'Reset code sent',
        'If this email belongs to a verified account, a password reset code has been sent.',
        [
          {
            text: 'Enter code',
            onPress: () => {
              router.push({
                pathname: '/resetpassword',
                params: {
                  email: cleanEmail,
                },
              });
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert(
        'Could not send reset code',
        error.message || 'Please check your email and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={C.background}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroIcon}>
            <Ionicons name="lock-open-outline" size={36} color="#FFFFFF" />
          </View>

          <Text style={styles.title}>Forgot password?</Text>

          <Text style={styles.subtitle}>
            Enter your email address and we’ll send you a code to reset your
            password.
          </Text>

          <View style={styles.infoCard}>
            <View style={styles.infoIcon}>
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color={C.primary}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Secure reset</Text>
              <Text style={styles.infoText}>
                For your safety, password reset only works for verified email
                accounts.
              </Text>
            </View>
          </View>

          <View style={styles.warningBox}>
            <Ionicons name="warning-outline" size={20} color={C.warning} />

            <Text style={styles.warningText}>
              The Guardian cannot reveal your old password. You can only create
              a new one after confirming your reset code.
            </Text>
          </View>

          <Text style={styles.label}>Email address</Text>

          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={C.tabInactive}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.disabledButton]}
            activeOpacity={0.85}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Send reset code</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.75}
            onPress={() => router.back()}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>Back to sign in</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },

    flex: {
      flex: 1,
    },

    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 118,
      paddingBottom: 44,
    },

    heroIcon: {
      width: 82,
      height: 82,
      borderRadius: 28,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.18,
      shadowRadius: 20,
      elevation: 6,
    },

    title: {
      fontSize: 34,
      fontWeight: '900',
      color: C.text,
      marginBottom: 10,
      letterSpacing: -0.5,
    },

    subtitle: {
      fontSize: 15,
      color: C.textSecondary,
      lineHeight: 23,
      marginBottom: 22,
    },

    infoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      marginBottom: 14,
    },

    infoIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },

    infoTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: C.text,
      marginBottom: 3,
    },

    infoText: {
      fontSize: 13,
      color: C.textSecondary,
      lineHeight: 19,
    },

    warningBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: C.securityScoreBg,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.warning,
      padding: 14,
      gap: 10,
      marginBottom: 26,
    },

    warningText: {
      flex: 1,
      fontSize: 13,
      color: C.warning,
      lineHeight: 20,
      fontWeight: '600',
    },

    label: {
      fontSize: 14,
      color: C.text,
      fontWeight: '800',
      marginBottom: 8,
      marginLeft: 4,
    },

    input: {
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      paddingHorizontal: 18,
      paddingVertical: 16,
      fontSize: 15,
      color: C.text,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 18,
    },

    submitButton: {
      backgroundColor: C.backgroundbutton,
      borderRadius: 999,
      minHeight: 58,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },

    disabledButton: {
      opacity: 0.65,
    },

    submitButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '900',
    },

    secondaryButton: {
      alignItems: 'center',
      paddingVertical: 18,
    },

    secondaryButtonText: {
      color: C.primary,
      fontSize: 15,
      fontWeight: '800',
    },
  });