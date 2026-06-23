import React, { useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  ScrollView, TextInput, Switch, useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

const generatePassword = (length: number, useNumbers: boolean, useSymbols: boolean) => {
  let chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (useNumbers) chars += '0123456789';
  if (useSymbols) chars += '!@#$%^&*()_+-=[]{}';
  let result = '';
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
};

const AddPasswordScreen = () => {
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const C = Colors[scheme];
  const styles = makeStyles(C);

  const [website, setWebsite] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('aZlodBEt^5gdanPU');
  const [notes, setNotes] = useState('');
  const [passLength, setPassLength] = useState(16);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Password</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Website / App</Text>
          <TextInput
            style={styles.input}
            placeholder="example.com"
            placeholderTextColor={C.tabInactive}
            value={website}
            onChangeText={setWebsite}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Username or Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={C.tabInactive}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordField}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setPassword(generatePassword(passLength, includeNumbers, includeSymbols))}>
              <Ionicons name="refresh-outline" size={20} color={C.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.generatorCard}>
            <View style={styles.generatorHeader}>
              <Ionicons name="refresh-outline" size={18} color={C.primary} />
              <Text style={styles.generatorTitle}>Password Generator</Text>
            </View>

            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>Length</Text>
              <View style={styles.sliderControls}>
                <TouchableOpacity
                  style={styles.sliderBtn}
                  onPress={() => {
                    if (passLength > 8) {
                      const newLen = passLength - 1;
                      setPassLength(newLen);
                      setPassword(generatePassword(newLen, includeNumbers, includeSymbols));
                    }
                  }}
                >
                  <Ionicons name="remove" size={18} color={C.primary} />
                </TouchableOpacity>
                <Text style={styles.sliderValue}>{passLength}</Text>
                <TouchableOpacity
                  style={styles.sliderBtn}
                  onPress={() => {
                    if (passLength < 32) {
                      const newLen = passLength + 1;
                      setPassLength(newLen);
                      setPassword(generatePassword(newLen, includeNumbers, includeSymbols));
                    }
                  }}
                >
                  <Ionicons name="add" size={18} color={C.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Include numbers</Text>
              <Switch
                value={includeNumbers}
                onValueChange={(val) => {
                  setIncludeNumbers(val);
                  setPassword(generatePassword(passLength, val, includeSymbols));
                }}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#fff"
                ios_backgroundColor={C.border}
              />
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Include symbols</Text>
              <Switch
                value={includeSymbols}
                onValueChange={(val) => {
                  setIncludeSymbols(val);
                  setPassword(generatePassword(passLength, includeNumbers, val));
                }}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#fff"
                ios_backgroundColor={C.border}
              />
            </View>
          </View>

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Add a note..."
            placeholderTextColor={C.tabInactive}
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity style={styles.saveBtn} onPress={() => router.back()}>
        <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
        <Text style={styles.saveBtnText}>Save Password</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default AddPasswordScreen;

const makeStyles = (C: typeof Colors.light | typeof Colors.dark) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 12,
    },
    backBtn: {
      width: 36, height: 36, backgroundColor: C.backgroundSelected,
      borderRadius: 18, justifyContent: 'center', alignItems: 'center',
    },
    headerTitle: { fontSize: 22, fontWeight: 'bold', color: C.text },
    form: { paddingHorizontal: 20, paddingTop: 8 },
    label: { fontSize: 14, color: C.text, fontWeight: '600', marginBottom: 8 },
    input: {
      backgroundColor: C.backgroundElement,
      borderRadius: 50, paddingHorizontal: 20, paddingVertical: 16,
      fontSize: 15, color: C.text, marginBottom: 20,
      borderWidth: 1, borderColor: C.border,
    },
    passwordRow: {
      backgroundColor: C.backgroundElement,
      borderRadius: 50, paddingHorizontal: 20, paddingVertical: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 16, borderWidth: 1, borderColor: C.border,
    },
    passwordField: { flex: 1, fontSize: 15, color: C.text },
    generatorCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 16, padding: 16, marginBottom: 20,
      borderWidth: 1, borderColor: C.border,
    },
    generatorHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    generatorTitle: { fontSize: 15, fontWeight: 'bold', color: C.primary },
    sliderRow: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 16,
    },
    sliderLabel: { fontSize: 14, color: C.text },
    sliderControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    sliderBtn: {
      width: 30, height: 30, backgroundColor: C.backgroundSelected,
      borderRadius: 15, justifyContent: 'center', alignItems: 'center',
    },
    sliderValue: {
      fontSize: 15, fontWeight: 'bold', color: C.text,
      minWidth: 24, textAlign: 'center',
    },
    toggleRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border,
    },
    toggleLabel: { fontSize: 14, color: C.text },
    notesInput: {
      backgroundColor: C.backgroundElement,
      borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16,
      fontSize: 15, color: C.text, marginBottom: 20,
      borderWidth: 1, borderColor: C.border,
      height: 100, textAlignVertical: 'top',
    },
    saveBtn: {
      backgroundColor: C.backgroundbutton,
      paddingVertical: 18, borderRadius: 50,
      flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
      gap: 10, marginHorizontal: 20, marginBottom: 20,
    },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  });