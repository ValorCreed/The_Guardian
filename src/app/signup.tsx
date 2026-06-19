import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const RegisterScreen = () => {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <SafeAreaView style={styles.container}>

      {/* Back button */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      {/* Shield icon box */}
      <View style={styles.iconBox}>
        <View style={styles.shield}>
          <View style={styles.checkLeft} />
          <View style={styles.checkRight} />
        </View>
      </View>

      {/* Title and subtitle */}
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>
        Your master password is the only key. We can never see it.
      </Text>

      {/* Email field */}
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

      {/* Master Password field */}
      <Text style={styles.label}>Master Password</Text>
      <View style={styles.passwordBox}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Enter master password"
          placeholderTextColor="#aaa"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
        />
        {/* Eye toggle */}
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
          <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
      </View>

      {/* Confirm Password field */}
      <Text style={styles.label}>Confirm Password</Text>
      <TextInput
        style={styles.input}
        placeholder="Re-enter master password"
        placeholderTextColor="#aaa"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry={true}
      />

      {/* Continue button */}
      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={styles.continueButton}
          onPress={() => router.replace('/verification')}
        >
          <Text style={styles.continueText}>Continue</Text>
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

  // Small green icon box
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

  // Password field with eye icon
  passwordBox: {
    backgroundColor: '#ffffff',
    borderRadius: 50,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },

  passwordInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },

  eyeIcon: {
    fontSize: 18,
    marginLeft: 10,
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

  continueText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});