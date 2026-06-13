import { Colors } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { TextInput, StyleSheet, Text, View, TouchableOpacity, ScrollView, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const Signup: React.FC = () => {
  const colorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const router = useRouter();
  const [step, setStep] = useState(1);
  // Step 1 - Personal Info
const [firstName, setFirstName] = useState('');
const [lastName, setLastName] = useState('');
const [otherName, setOtherName] = useState('');
const [username, setUsername] = useState('');
const [email, setEmail] = useState('');
const [recoveryEmail, setRecoveryEmail] = useState('');
const [dateOfBirth, setDateOfBirth] = useState('');

// Step 2 - Security
const [password, setPassword] = useState('');
const [confirmPassword, setConfirmPassword] = useState('');
const [pin, setPin] = useState('');

// Step 3 - Recovery
const [securityQuestion, setSecurityQuestion] = useState('');
const [customQuestion, setCustomQuestion] = useState('');
const [securityAnswer, setSecurityAnswer] = useState('');

// Step 4 - Terms
const [termsAccepted, setTermsAccepted] = useState(false);
const [privacyAccepted, setPrivacyAccepted] = useState(false);

  return (
    <LinearGradient
      colors={[
        Colors[colorScheme].background,
        Colors[colorScheme].backgroundElement,
        Colors[colorScheme].background,
      ]}
      style={styles.container}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
      {step === 1 && (
  <View style={styles.stepContainer}>
    <Text style={[styles.title, { color: Colors[colorScheme].text }]}>Personal Info</Text>
    <Text style={[styles.subtitle, { color: Colors[colorScheme].textSecondary }]}>Step 1 of 4</Text>
  </View>
)}

<View style={styles.inputWrapper}>
  <Ionicons name="person-outline" size={20} color={Colors[colorScheme].textSecondary} />
  <TextInput
    style={[styles.input, { color: Colors[colorScheme].text }]}
    placeholder="First Name"
    placeholderTextColor={Colors[colorScheme].textSecondary}
    value={firstName}
    onChangeText={setFirstName}
  />
</View>

<View style={styles.inputWrapper}>
  <Ionicons name="person-outline" size={20} color={Colors[colorScheme].textSecondary} />
  <TextInput
    style={[styles.input, { color: Colors[colorScheme].text }]}
    placeholder="Last Name"
    placeholderTextColor={Colors[colorScheme].textSecondary}
    value={lastName}
    onChangeText={setLastName}
  />
</View>

<View style={styles.inputWrapper}>
  <Ionicons name="person-outline" size={20} color={Colors[colorScheme].textSecondary} />
  <TextInput
    style={[styles.input, { color: Colors[colorScheme].text }]}
    placeholder="Other Name (optional)"
    placeholderTextColor={Colors[colorScheme].textSecondary}
    value={otherName}
    onChangeText={setOtherName}
  />
</View>







      </ScrollView>
    </LinearGradient>
  );
};

export default Signup;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    alignSelf: 'center',
    fontSize: 25,
    fontWeight: 'bold',
    marginTop: 60,
  },

  stepContainer: {
  padding: 24,
},
subtitle: {
  alignSelf: 'center',
  fontSize: 14,
  marginTop: 5,
  marginBottom: 20,
},

inputWrapper: {
  flexDirection: 'row',
  alignItems: 'center',
  borderWidth: 1,
  borderColor: Colors.light.textSecondary,
  borderRadius: 10,
  paddingHorizontal: 10,
  marginTop: 15,
},
input: {
  flex: 1,
  padding: 14,
  fontSize: 16,
},




});