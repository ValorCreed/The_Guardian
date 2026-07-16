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
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, getEmailDeliveryWarning, saveLoginSession } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import GuardianLogoTile from '../components/GuardianLogoTitle';

const RegisterScreen = () => {
  const router = useRouter();

  const { colors: C, resetThemeForNewAccount } = useAppTheme();
  const styles = makeStyles(C);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (loading) return;

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      Alert.alert(
        'Missing details',
        'Enter your full name, email and master password.'
      );
      return;
    }

    if (!confirmPassword.trim()) {
      Alert.alert('Missing details', 'Please confirm your master password.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Your passwords do not match.');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }

    try {
      setLoading(true);

      const cleanEmail = email.trim().toLowerCase();

      await AsyncStorage.multiRemove([
        'token',
        'userName',
        'userEmail',
        'subscriptionPlan',
        'emailVerified',
        'twoFactorEnabled',
        'vaultLocked',
      ]);

      const data = await api.register({
        fullname: fullName.trim(),
        email: cleanEmail,
        password,
      });

      await saveLoginSession(data as any);

      await resetThemeForNewAccount(cleanEmail);

      const verified = Boolean((data as any)?.emailVerified);
      await AsyncStorage.setItem('emailVerified', String(verified));

      const emailWarning = getEmailDeliveryWarning(data);

      if (verified) {
        Alert.alert('Account created', 'Your account is ready.', [
          {
            text: 'Continue',
            onPress: () => router.replace('/verification'),
          },
        ]);
        return;
      }

      if (emailWarning) {
        Alert.alert(
          'Account created',
          'Your account was created, but we could not send the verification email right now. You can still sign in and use the app. For better account security, verify your email later from User Information.',
          [
            {
              text: 'Continue',
              onPress: () => router.replace('/verification'),
              style: 'cancel',
            },
            {
              text: 'Verify later',
              onPress: () => router.replace('/verification'),
            },
          ]
        );
        return;
      }

      Alert.alert(
        'Account created',
        'We sent a verification code to your email. You can verify now, or continue and verify later from User Information.',
        [
          {
            text: 'Continue',
            onPress: () => router.replace('/verification'),
            style: 'cancel',
          },
          {
            text: 'Verify now',
            onPress: () =>
              router.replace({
                pathname: '/verifyemail',
                params: {
                  email: cleanEmail,
                  next: 'verification',
                },
              }),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Registration failed', error.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={styles.scrollContent}
        >
          <GuardianLogoTile
            size={62}
            logoSize={50}
            radius={18}
            style={styles.iconBox}
          />

          <Text style={styles.title}>Create your account</Text>

          <Text style={styles.subtitle}>
            Your master password is the only key. We can never see it.
          </Text>

          <View style={styles.formCard}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Alex Morgan"
              placeholderTextColor={C.tabInactive}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="alex.morgan@gmail.com"
              placeholderTextColor={C.tabInactive}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              importantForAutofill="yes"
              returnKeyType="next"
            />

            <Text style={styles.label}>Master Password</Text>
            <View style={styles.passwordBox}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter master password"
                placeholderTextColor={C.tabInactive}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                importantForAutofill="yes"
                returnKeyType="next"
              />

              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((current) => !current)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={C.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.passwordBox}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Re-enter master password"
                placeholderTextColor={C.tabInactive}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                importantForAutofill="yes"
                returnKeyType="done"
                onSubmitEditing={handleRegister}
              />

              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword((current) => !current)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={C.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.continueButton, loading && styles.disabledButton]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.continueText}>Continue</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signinLink}
            activeOpacity={0.7}
            onPress={() => router.replace('/signin')}
          >
            <Text style={styles.signinText}>
              Already have an account?{' '}
              <Text style={styles.signinTextBold}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default RegisterScreen;

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },

    keyboardView: {
      flex: 1,
    },

    scrollView: {
      flex: 1,
    },

    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 108,
      paddingBottom: 180,
    },

    iconBox: {
      marginBottom: 20,
    },

    title: {
      fontSize: 30,
      fontWeight: '900',
      color: C.text,
      marginBottom: 8,
    },

    subtitle: {
      fontSize: 14,
      color: C.textSecondary,
      lineHeight: 21,
      marginBottom: 22,
    },

    formCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 18,
    },

    label: {
      fontSize: 13,
      color: C.text,
      fontWeight: '800',
      marginBottom: 8,
      marginLeft: 4,
    },

    input: {
      backgroundColor: C.background,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 15,
      fontSize: 15,
      color: C.text,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: C.border,
    },

    passwordBox: {
      backgroundColor: C.background,
      borderRadius: 18,
      paddingLeft: 16,
      paddingRight: 8,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
      borderWidth: 1,
      borderColor: C.border,
    },

    passwordInput: {
      flex: 1,
      fontSize: 15,
      color: C.text,
      paddingVertical: 15,
      paddingRight: 10,
    },

    eyeButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },

    continueButton: {
      backgroundColor: C.backgroundbutton,
      paddingVertical: 18,
      borderRadius: 50,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 56,
      marginTop: 2,
    },

    disabledButton: {
      opacity: 0.7,
    },

    continueText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '900',
    },

    signinLink: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 18,
    },

    signinText: {
      color: C.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },

    signinTextBold: {
      color: C.primary,
      fontWeight: '900',
    },
  });