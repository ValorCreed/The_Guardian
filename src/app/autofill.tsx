import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useAppTheme } from '../context/ThemeContext';

const AUTOFILL_KEY = 'autofillEnabled';

export default function AutofillScreen() {
  const { colors: C, isDark } = useAppTheme();
  const styles = makeStyles(C);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const load = async () => {
      setEnabled((await AsyncStorage.getItem(AUTOFILL_KEY)) === 'true');
    };
    load();
  }, []);

  const toggleAutofill = async (value: boolean) => {
    setEnabled(value);
    await AsyncStorage.setItem(AUTOFILL_KEY, String(value));

    if (value) {
      Alert.alert('Auto-fill enabled', 'The Guardian will show saved login suggestions inside the app where supported.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Auto-fill</Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="sparkles-outline" size={28} color={C.primary} />
          </View>
          <Text style={styles.heroTitle}>Fill passwords faster</Text>
          <Text style={styles.heroText}>
            When enabled, The Guardian can suggest saved vault logins inside supported app screens. For system-wide keyboard/browser autofill, a native credential-provider setup is required outside Expo Go.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Enable in-app auto-fill</Text>
              <Text style={styles.rowSub}>Show matching saved logins when a supported form asks for credentials.</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={toggleAutofill}
              trackColor={{ false: C.border, true: C.primary }}
              thumbColor="#fff"
              ios_backgroundColor={C.border}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>How it works</Text>
        <View style={styles.card}>
          {[
            ['Searches your vault', 'The app checks saved passwords that match the current website or app name.'],
            ['You approve first', 'The app should ask before filling usernames or passwords.'],
            ['Protected by login', 'If the vault is locked, you must sign in or use biometric login first.'],
          ].map(([title, subtitle], index) => (
            <View key={title} style={[styles.infoRow, index !== 2 && styles.divider]}>
              <View style={styles.numberCircle}><Text style={styles.numberText}>{index + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoTitle}>{title}</Text>
                <Text style={styles.infoSub}>{subtitle}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
    backBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: C.backgroundElement,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 28, fontWeight: '800', color: C.text },
    heroCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: C.border,
    },
    iconCircle: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    heroTitle: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 8 },
    heroText: { fontSize: 14, color: C.textSecondary, lineHeight: 21 },
    card: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      overflow: 'hidden',
      marginBottom: 22,
      borderWidth: 1,
      borderColor: C.border,
    },
    row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
    rowTitle: { fontSize: 16, color: C.text, fontWeight: '700' },
    rowSub: { fontSize: 13, color: C.textSecondary, marginTop: 4, lineHeight: 18 },
    sectionTitle: { fontSize: 18, color: C.text, fontWeight: '800', marginBottom: 10 },
    infoRow: { flexDirection: 'row', gap: 12, padding: 16 },
    divider: { borderBottomWidth: 1, borderBottomColor: C.border },
    numberCircle: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    numberText: { color: '#fff', fontWeight: '800' },
    infoTitle: { fontSize: 15, color: C.text, fontWeight: '700' },
    infoSub: { fontSize: 13, color: C.textSecondary, lineHeight: 19, marginTop: 3 },
  });
