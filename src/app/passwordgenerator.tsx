import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import { hapticLight, hapticMedium, hapticSelection, hapticToggleOff, hapticToggleOn, hapticWarning } from '../utils/haptics';
import { getSecureClipboardMessage, setSecureClipboard } from '../utils/secureClipboard';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';

const HISTORY_KEY = 'guardian.passwordGenerator.history.v1';

type GeneratorMode = 'random' | 'passphrase' | 'pin';
type Plan = 'FREE' | 'PREMIUM' | 'FAMILY';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMBERS = '0123456789';
const SYMBOLS = '!@#$%^&*()_+-=[]{};:,.?';
const WORDS = [
  'forest',
  'shield',
  'river',
  'orbit',
  'stone',
  'ember',
  'summit',
  'velvet',
  'anchor',
  'silver',
  'rocket',
  'harbor',
  'garden',
  'planet',
  'castle',
  'thunder',
  'meadow',
  'guardian',
  'shadow',
  'bright',
];

const randomIndex = (max: number) => Math.floor(Math.random() * max);
const pick = (text: string) => text.charAt(randomIndex(text.length));

function shuffle(value: string[]) {
  const items = [...value];
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.join('');
}

function generateRandomPassword(
  length: number,
  includeUppercase: boolean,
  includeNumbers: boolean,
  includeSymbols: boolean
) {
  let chars = LOWER;
  const required: string[] = [pick(LOWER)];

  if (includeUppercase) {
    chars += UPPER;
    required.push(pick(UPPER));
  }

  if (includeNumbers) {
    chars += NUMBERS;
    required.push(pick(NUMBERS));
  }

  if (includeSymbols) {
    chars += SYMBOLS;
    required.push(pick(SYMBOLS));
  }

  while (required.length < length) {
    required.push(pick(chars));
  }

  return shuffle(required.slice(0, length));
}

function generatePassphrase(wordCount: number, includeNumbers: boolean, includeSymbols: boolean) {
  const selected = Array.from({ length: wordCount }, () => WORDS[randomIndex(WORDS.length)]);
  let phrase = selected.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('-');

  if (includeNumbers) phrase += `-${randomIndex(90) + 10}`;
  if (includeSymbols) phrase += pick('!@#$%&*?');

  return phrase;
}

function generatePin(length: number) {
  return Array.from({ length }, () => pick(NUMBERS)).join('');
}

function scorePassword(password: string) {
  let score = 0;
  if (password.length >= 8) score += 15;
  if (password.length >= 12) score += 20;
  if (password.length >= 16) score += 15;
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 15;
  if (/[0-9]/.test(password)) score += 10;
  if (/[^A-Za-z0-9]/.test(password)) score += 15;
  return Math.max(0, Math.min(100, score));
}

function strengthLabel(score: number) {
  if (score >= 80) return 'Very strong';
  if (score >= 65) return 'Strong';
  if (score >= 45) return 'Moderate';
  return 'Weak';
}

export default function PasswordGeneratorScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  useSensitiveScreenProtection(true);

  const [plan, setPlan] = useState<Plan>('FREE');
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [mode, setMode] = useState<GeneratorMode>('random');
  const [length, setLength] = useState(16);
  const [wordCount, setWordCount] = useState(4);
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [generated, setGenerated] = useState('');
  const [history, setHistory] = useState<string[]>([]);

  const isPaid = plan === 'PREMIUM' || plan === 'FAMILY';
  const maxLength = isPaid ? 64 : 16;
  const maxWords = isPaid ? 8 : 4;

  const score = useMemo(() => scorePassword(generated), [generated]);
  const label = strengthLabel(score);

  const addHistory = useCallback(
    async (value: string) => {
      if (!isPaid || !value) return;

      const next = [value, ...history.filter((item) => item !== value)].slice(0, 8);
      setHistory(next);
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    },
    [history, isPaid]
  );

  const generate = useCallback(async () => {
    let value = '';

    if (mode === 'random') {
      value = generateRandomPassword(length, includeUppercase, includeNumbers, includeSymbols);
    } else if (mode === 'passphrase') {
      if (!isPaid) {
        Alert.alert('Premium feature', 'Passphrase generation is available on Premium and Family plans.');
        return;
      }
      value = generatePassphrase(wordCount, includeNumbers, includeSymbols);
    } else {
      if (!isPaid) {
        Alert.alert('Premium feature', 'PIN generation is available on Premium and Family plans.');
        return;
      }
      value = generatePin(Math.min(length, 12));
    }

    setGenerated(value);
    await addHistory(value);
  }, [addHistory, includeNumbers, includeSymbols, includeUppercase, isPaid, length, mode, wordCount]);

  useEffect(() => {
    const load = async () => {
      try {
        const [subscription, savedHistory] = await Promise.all([
          api.getSubscription().catch(() => ({ plan: 'FREE' as const })),
          AsyncStorage.getItem(HISTORY_KEY),
        ]);

        const loadedPlan = subscription?.plan || 'FREE';
        setPlan(loadedPlan as Plan);

        if (savedHistory) {
          try {
            const parsed = JSON.parse(savedHistory);
            if (Array.isArray(parsed)) setHistory(parsed.slice(0, 8));
          } catch {
            setHistory([]);
          }
        }
      } finally {
        setLoadingPlan(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!isPaid && length > 16) setLength(16);
    if (!isPaid && wordCount > 4) setWordCount(4);
    if (!isPaid && mode !== 'random') setMode('random');
  }, [isPaid, length, mode, wordCount]);

  useEffect(() => {
    if (!generated) {
      generate();
    }
  }, [generate, generated]);

  const copyPassword = async () => {
    if (!generated) return;
    await setSecureClipboard(generated);
    Alert.alert('Copied', getSecureClipboardMessage('Generated password'));
  };

  const useInAddPassword = () => {
    if (!generated) return;

    router.push({
      pathname: '/addpassword',
      params: {
        generatedPassword: generated,
      },
    });
  };

  const lockPremiumMode = (target: GeneratorMode) => {
    if (!isPaid && target !== 'random') {
      Alert.alert(
        'Premium feature',
        'Passphrases and PIN generation are available on Premium and Family plans.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'View plans', onPress: () => router.push('/subscription?from=passwordgenerator') },
        ]
      );
      return;
    }

    setMode(target);
  };

  if (loadingPlan) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={C.primary} />
          <Text style={styles.loadingText}>Loading generator...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>Vault tool</Text>
        <Text style={styles.title}>Password Generator</Text>
        <Text style={styles.subtitle}>Create strong passwords, passphrases, and PINs without leaving The Guardian.</Text>

        <View style={styles.outputCard}>
          <Text style={styles.outputLabel}>Generated password</Text>
          <TextInput
            style={styles.outputText}
            value={generated}
            onChangeText={setGenerated}
            multiline
            autoCapitalize="none"
            placeholder="Tap generate"
            placeholderTextColor={C.tabInactive}
          />

          <View style={styles.scoreRow}>
            <View style={styles.scoreTrack}>
              <View style={[styles.scoreFill, { width: `${score}%`, backgroundColor: score >= 75 ? C.success : score >= 45 ? C.warning : C.danger }]} />
            </View>
            <Text style={styles.scoreText}>{label}</Text>
          </View>
        </View>

        <View style={styles.modeRow}>
          {(['random', 'passphrase', 'pin'] as GeneratorMode[]).map((item) => {
            const locked = !isPaid && item !== 'random';
            const active = mode === item;

            return (
              <TouchableOpacity
                key={item}
                style={[styles.modePill, active && styles.modePillActive]}
                onPress={() => lockPremiumMode(item)}
                activeOpacity={0.8}
              >
                <Ionicons name={locked ? 'lock-closed-outline' : item === 'random' ? 'shuffle-outline' : item === 'passphrase' ? 'text-outline' : 'keypad-outline'} size={15} color={active ? '#fff' : C.textSecondary} />
                <Text style={[styles.modeText, active && styles.modeTextActive]}>{item === 'pin' ? 'PIN' : item}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.card}>
          {mode === 'passphrase' ? (
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Words</Text>
              <Stepper value={wordCount} min={3} max={maxWords} onChange={setWordCount} C={C} />
            </View>
          ) : (
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Length</Text>
              <Stepper value={mode === 'pin' ? Math.min(length, 12) : length} min={mode === 'pin' ? 4 : 8} max={mode === 'pin' ? 12 : maxLength} onChange={setLength} C={C} />
            </View>
          )}

          {mode !== 'pin' && (
            <>
              <ToggleRow label="Uppercase letters" value={includeUppercase} onValueChange={setIncludeUppercase} C={C} disabled={mode === 'passphrase'} />
              <ToggleRow label="Numbers" value={includeNumbers} onValueChange={setIncludeNumbers} C={C} />
              <ToggleRow label="Symbols" value={includeSymbols} onValueChange={setIncludeSymbols} C={C} />
            </>
          )}
        </View>

        {!isPaid && (
          <TouchableOpacity style={styles.upgradeCard} onPress={() => { hapticWarning(); router.push('/subscription?from=passwordgenerator'); }} activeOpacity={0.85}>
            <Ionicons name="sparkles-outline" size={22} color={C.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.upgradeTitle}>Unlock advanced generator</Text>
              <Text style={styles.upgradeText}>Premium adds passphrases, PINs, longer passwords, and generator history.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.warning} />
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.primaryButton} onPress={() => { hapticMedium(); generate(); }} activeOpacity={0.86}>
          <Ionicons name="refresh-outline" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>Generate new</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => { hapticLight(); copyPassword(); }} activeOpacity={0.82}>
          <Ionicons name="copy-outline" size={20} color={C.primary} />
          <Text style={styles.secondaryButtonText}>Copy password</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => { hapticMedium(); useInAddPassword(); }} activeOpacity={0.82}>
          <Ionicons name="add-circle-outline" size={20} color={C.primary} />
          <Text style={styles.secondaryButtonText}>Use in Add Password</Text>
        </TouchableOpacity>

        {isPaid && history.length > 0 && (
          <View style={styles.historyCard}>
            <Text style={styles.sectionTitle}>Recent generated passwords</Text>
            {history.map((item, index) => (
              <TouchableOpacity key={`${item}-${index}`} style={styles.historyRow} onPress={() => { hapticSelection(); setGenerated(item); }}>
                <Text style={styles.historyText} numberOfLines={1}>{item}</Text>
                <Ionicons name="return-down-back-outline" size={18} color={C.primary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stepper({ value, min, max, onChange, C }: { value: number; min: number; max: number; onChange: (value: number) => void; C: any }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <TouchableOpacity style={[stepStyles.btn, { backgroundColor: C.backgroundSelected }]} onPress={() => onChange(Math.max(min, value - 1))}>
        <Ionicons name="remove" size={18} color={C.primary} />
      </TouchableOpacity>
      <Text style={{ color: C.text, fontSize: 16, fontWeight: '900', minWidth: 28, textAlign: 'center' }}>{value}</Text>
      <TouchableOpacity style={[stepStyles.btn, { backgroundColor: C.backgroundSelected }]} onPress={() => onChange(Math.min(max, value + 1))}>
        <Ionicons name="add" size={18} color={C.primary} />
      </TouchableOpacity>
    </View>
  );
}

function ToggleRow({ label, value, onValueChange, C, disabled = false }: { label: string; value: boolean; onValueChange: (value: boolean) => void; C: any; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 12 }}>
      <Text style={{ color: disabled ? C.textSecondary : C.text, fontSize: 14, fontWeight: '700' }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={(nextValue) => {
          nextValue ? hapticToggleOn() : hapticToggleOff();
          onValueChange(nextValue);
        }}
        disabled={disabled}
        trackColor={{ false: C.border, true: C.primary }}
        thumbColor="#fff"
        ios_backgroundColor={C.border}
      />
    </View>
  );
}

const stepStyles = StyleSheet.create({
  btn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 10, color: C.textSecondary, fontSize: 14 },
    content: { paddingHorizontal: 20, paddingTop: 96, paddingBottom: 120 },
    eyebrow: { color: C.textSecondary, fontSize: 13, fontWeight: '700' },
    title: { color: C.text, fontSize: 30, fontWeight: '900', marginTop: 2 },
    subtitle: { color: C.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 20 },
    outputCard: { backgroundColor: C.backgroundElement, borderRadius: 22, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 16 
      ,shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    outputLabel: { color: C.textSecondary, fontSize: 12, fontWeight: '800', marginBottom: 8 },
    outputText: { color: C.text, fontSize: 18, fontWeight: '800', minHeight: 62, textAlignVertical: 'top' },
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
    scoreTrack: { flex: 1, height: 8, backgroundColor: C.border, borderRadius: 99, overflow: 'hidden' },
    scoreFill: { height: 8, borderRadius: 99 },
    scoreText: { color: C.text, fontSize: 12, fontWeight: '900', minWidth: 76, textAlign: 'right' },
    modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    modePill: { flex: 1, minHeight: 42, borderRadius: 99, borderWidth: 1, borderColor: C.border, backgroundColor: C.backgroundElement, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 
      ,shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    modePillActive: { backgroundColor: C.primary, borderColor: C.primary 
      ,shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    modeText: { color: C.textSecondary, fontSize: 12, fontWeight: '900', textTransform: 'capitalize' },
    modeTextActive: { color: '#fff' },
    card: { backgroundColor: C.backgroundElement, borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, borderWidth: 1, borderColor: C.border, marginBottom: 16 
      ,shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 },
    controlLabel: { color: C.text, fontSize: 15, fontWeight: '800' },
    upgradeCard: { backgroundColor: C.securityScoreBg, borderRadius: 18, borderWidth: 1, borderColor: C.warning, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 
      ,shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    upgradeTitle: { color: C.warning, fontSize: 14, fontWeight: '900' },
    upgradeText: { color: C.warning, fontSize: 12, lineHeight: 17, marginTop: 2 },
    primaryButton: { backgroundColor: C.backgroundbutton, borderRadius: 999, minHeight: 56, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, marginBottom: 12 
      ,shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
    secondaryButton: { backgroundColor: C.backgroundElement, borderRadius: 999, minHeight: 54, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: C.border, marginBottom: 12 
      ,shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    secondaryButtonText: { color: C.primary, fontSize: 14, fontWeight: '900' },
    historyCard: { backgroundColor: C.backgroundElement, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: C.border, marginTop: 8 
      ,shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},
    sectionTitle: { color: C.text, fontSize: 16, fontWeight: '900', marginBottom: 10 },
    historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 12 },
    historyText: { flex: 1, color: C.text, fontSize: 13, fontWeight: '700' },
  });
