import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, saveLoginSession } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RegisterScreen = () => {
  const router = useRouter();

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
      Alert.alert('Missing details', 'Enter your full name, email and master password.');
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
        password: password.trim(),
      });

      await saveLoginSession(data as any);
      await AsyncStorage.setItem('emailVerified', 'false');

      router.replace({
        pathname: '/verifyemail',
        params: {
          email: cleanEmail,
          next: 'verification',
        },
      });
    } catch (error: any) {
      Alert.alert('Registration failed', error.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.iconBox}>
        <View style={styles.shield}>
          <View style={styles.checkLeft} />
          <View style={styles.checkRight} />
        </View>
      </View>

      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>
        Your master password is the only key. We can never see it.
      </Text>

      <Text style={styles.label}>Full Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Alex Morgan"
        placeholderTextColor="#aaa"
        value={fullName}
        onChangeText={setFullName}
        autoCapitalize="words"
      />

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        placeholder="alex.morgan@gmail.com"
        placeholderTextColor="#aaa"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Text style={styles.label}>Master Password</Text>
      <View style={styles.passwordBox}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Enter master password"
          placeholderTextColor="#aaa"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowPassword((current) => !current)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
            size={22}
            color="#666"
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Confirm Password</Text>
      <View style={styles.passwordBox}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Re-enter master password"
          placeholderTextColor="#aaa"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showConfirmPassword}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowConfirmPassword((current) => !current)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
            size={22}
            color="#666"
          />
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={[styles.continueButton, loading && styles.disabledButton]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.continueText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default RegisterScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f0',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },

  backButton: {
    marginTop: 8,
    marginBottom: 20,
  },

  backText: {
    fontSize: 16,
    color: '#333',
  },

  iconBox: {
    width: 60,
    height: 60,
    backgroundColor: '#1a5c35',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },

  shield: {
    width: 30,
    height: 34,
    borderColor: '#ffffff',
    borderWidth: 2.5,
    borderRadius: 4,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },

  checkLeft: {
    position: 'absolute',
    width: 2.5,
    height: 8,
    backgroundColor: '#ffffff',
    borderRadius: 2,
    transform: [{ rotate: '45deg' }, { translateX: -4 }, { translateY: 2 }],
  },

  checkRight: {
    position: 'absolute',
    width: 2.5,
    height: 14,
    backgroundColor: '#ffffff',
    borderRadius: 2,
    transform: [{ rotate: '-45deg' }, { translateX: 4 }, { translateY: -1 }],
  },

  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#0f2d1f',
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 28,
  },

  label: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    marginBottom: 8,
  },

  input: {
    backgroundColor: '#ffffff',
    borderRadius: 50,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 15,
    color: '#333',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },

  passwordBox: {
    backgroundColor: '#ffffff',
    borderRadius: 50,
    paddingLeft: 20,
    paddingRight: 12,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },

  passwordInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    paddingVertical: 14,
    paddingRight: 10,
  },

  eyeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomSection: {
    flex: 1,
    justifyContent: 'flex-end',
  },

  continueButton: {
    backgroundColor: '#1a5c35',
    paddingVertical: 18,
    borderRadius: 50,
    alignItems: 'center',
  },

  disabledButton: {
    opacity: 0.7,
  },

  continueText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});