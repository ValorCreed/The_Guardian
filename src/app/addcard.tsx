import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useAppTheme } from '../context/ThemeContext';
import { hapticLight, hapticMedium, hapticWarning } from '../utils/haptics';
import { api } from '../services/api';
import { encryptJson } from '../utils/vaultcrypto';
import CardBrandLogo from '../components/CardBrandLogo';
import { detectCardBrand } from '../utils/cardBrand';

type Plan = 'FREE' | 'PREMIUM' | 'FAMILY';

const FREE_CARD_LIMIT = 3;

const AddCardScreen = () => {
  const router = useRouter();
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [bankName, setBankName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<Plan>('FREE');
  const [cardCount, setCardCount] = useState(0);
  const [checkingAccess, setCheckingAccess] = useState(true);

  const isPaid = plan === 'PREMIUM' || plan === 'FAMILY';
  const freeLimitReached = !isPaid && cardCount >= FREE_CARD_LIMIT;

  useEffect(() => {
    let mounted = true;

    const loadAccess = async () => {
      try {
        setCheckingAccess(true);

        const [subscription, savedCards] = await Promise.all([
          api
            .getSubscriptionFresh()
            .catch(() => api.getSubscription().catch(() => ({ plan: 'FREE' as const }))),
          api.getCards().catch(() => []),
        ]);

        if (!mounted) return;

        setPlan((subscription?.plan || 'FREE') as Plan);
        setCardCount(savedCards?.length || 0);
      } finally {
        if (mounted) setCheckingAccess(false);
      }
    };

    loadAccess();

    return () => {
      mounted = false;
    };
  }, []);

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 16);
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join('  ') : cleaned;
  };

  const formatExpiry = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 4);
    if (cleaned.length >= 3) return cleaned.slice(0, 2) + '/' + cleaned.slice(2);
    return cleaned;
  };

  const showUpgradeAlert = () => {
    hapticWarning();
    Alert.alert(
      'Card limit reached',
      `Free accounts can save up to ${FREE_CARD_LIMIT} cards. Upgrade to Premium or Family for unlimited card storage.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/subscription?from=addcard') },
      ]
    );
  };

  const handleSave = async () => {
    if (saving) return;

    if (freeLimitReached) {
      showUpgradeAlert();
      return;
    }

    const rawDigits = cardNumber.replace(/\D/g, '');

    if (!cardholderName.trim()) {
      Alert.alert('Missing name', 'Please enter the cardholder name.');
      return;
    }
    if (rawDigits.length < 12) {
      Alert.alert('Invalid card number', 'Please enter a valid card number.');
      return;
    }
    if (!expiry.trim()) {
      Alert.alert('Missing expiry', 'Please enter the card expiry date.');
      return;
    }
    if (!cvv.trim()) {
      Alert.alert('Missing CVV', 'Please enter the CVV.');
      return;
    }

    try {
      setSaving(true);
      const last4 = rawDigits.slice(-4);
      await api.createCard({
        cardName: bankName.trim() || `Card ending ${last4}`,
        encryptedCardNumber: encryptJson(rawDigits),
        encryptedExpiryDate: encryptJson(expiry.trim()),
        encryptedCvv: encryptJson(cvv.trim()),
        encryptedCardholderName: encryptJson(cardholderName.trim()),
      });

      Alert.alert('Saved', 'Card saved securely to your vault.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      const message = String(error?.message || 'Could not save card.');

      if (message.toUpperCase().includes('PLAN_LIMIT_REACHED') || message.toLowerCase().includes('limit')) {
        Alert.alert(
          'Card limit reached',
          `Free accounts can save up to ${FREE_CARD_LIMIT} cards. Upgrade to Premium or Family for unlimited card storage.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upgrade', onPress: () => router.push('/subscription?from=addcard') },
          ]
        );
        return;
      }

      Alert.alert('Save failed', message);
    } finally {
      setSaving(false);
    }
  };

  const displayNumber = cardNumber
    ? formatCardNumber(cardNumber)
    : '••••  ••••  ••••  ••••';
  const displayName = cardholderName || 'Cardholder Name';
  const displayBank = bankName || 'Secure Card';
  const detectedBrand = detectCardBrand(displayBank, cardNumber);

  if (checkingAccess) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator color={C.primary} />
          <Text style={styles.loadingText}>Checking card access...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (freeLimitReached) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.lockedContent}>
          <View style={styles.cardIconLarge}>
            <Ionicons name="card-outline" size={42} color="#fff" />
          </View>

          <Text style={styles.lockedTitle}>Free card limit reached</Text>
          <Text style={styles.lockedSubtitle}>
            You have used {cardCount}/{FREE_CARD_LIMIT} saved cards on the Free plan. Upgrade to Premium or Family for unlimited encrypted card storage.
          </Text>

          <TouchableOpacity
            style={styles.lockedUpgradeBtn}
            onPress={() => { hapticMedium(); router.push('/subscription?from=addcard'); }}
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles-outline" size={20} color="#fff" />
            <Text style={styles.lockedUpgradeText}>Upgrade plan</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.notNowBtn} onPress={() => router.back()}>
            <Text style={styles.notNowText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Add Card</Text>
            <Text style={styles.headerSubTitle}>{isPaid ? 'Unlimited encrypted cards' : `${cardCount}/${FREE_CARD_LIMIT} cards used on Free plan`}</Text>
          </View>
        </View>

        <View style={styles.cardPreview}>
          <View style={styles.previewTop}>
            <CardBrandLogo brand={detectedBrand} />
            <Text style={styles.bankPreview}>{displayBank}</Text>
          </View>
          <Text style={styles.cardNumberPreview}>{displayNumber}</Text>
          <View style={styles.previewBottom}>
            <View>
              <Text style={styles.previewLabel}>CARD HOLDER</Text>
              <Text style={styles.cardNamePreview}>{displayName}</Text>
            </View>
            <View>
              <Text style={styles.previewLabel}>EXPIRES</Text>
              <Text style={styles.cardNamePreview}>{expiry || 'MM/YY'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Bank / Card Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Visa Debit"
            placeholderTextColor={C.tabInactive}
            value={bankName}
            onChangeText={setBankName}
          />

          <Text style={styles.label}>Cardholder Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Alex Morgan"
            placeholderTextColor={C.tabInactive}
            value={cardholderName}
            onChangeText={setCardholderName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Card Number</Text>
          <TextInput
            style={styles.input}
            placeholder="0000  0000  0000  0000"
            placeholderTextColor={C.tabInactive}
            value={cardNumber}
            onChangeText={(val) => setCardNumber(formatCardNumber(val))}
            keyboardType="numeric"
            maxLength={22}
          />

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>Expiry</Text>
              <TextInput
                style={styles.input}
                placeholder="MM/YY"
                placeholderTextColor={C.tabInactive}
                value={expiry}
                onChangeText={(val) => setExpiry(formatExpiry(val))}
                keyboardType="numeric"
                maxLength={5}
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>CVV</Text>
              <TextInput
                style={styles.input}
                placeholder="•••"
                placeholderTextColor={C.tabInactive}
                value={cvv}
                onChangeText={(val) => setCvv(val.replace(/\D/g, '').slice(0, 4))}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
              />
            </View>
          </View>

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Add notes..."
            placeholderTextColor={C.tabInactive}
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>

        <View style={{ height: 110 }} />
      </ScrollView>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.disabledBtn]}
        onPress={() => { hapticMedium(); handleSave(); }}
        disabled={saving}
      >
        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />}
        <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Card'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default AddCardScreen;

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

const makeStyles = (C: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { color: C.textSecondary, marginTop: 10, fontSize: 14, fontWeight: '700' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 94, paddingBottom: 18, gap: 12 },
    backBtn: { width: 38, height: 38, backgroundColor: C.backgroundSelected, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: -0.4 },
    headerSubTitle: { color: C.textSecondary, fontSize: 13, marginTop: 4, fontWeight: '700' },
    cardPreview: {
      backgroundColor: C.primary,
      borderRadius: 28,
      marginHorizontal: 20,
      marginBottom: 30,
      padding: 24,
      height: 198,
      justifyContent: 'space-between',
      shadowColor: C.primary,
      shadowOpacity: 0.22,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    previewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    chip: { width: 46, height: 34, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)' },
    bankPreview: { color: '#fff', fontSize: 14, fontWeight: '900' },
    cardNumberPreview: { color: '#fff', fontSize: 20, letterSpacing: 2.2, fontWeight: '800' },
    previewBottom: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
    previewLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 9, marginBottom: 5, letterSpacing: 1.1, fontWeight: '900' },
    cardNamePreview: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 0.4, maxWidth: 180 },
    form: { paddingHorizontal: 20 },
    label: { fontSize: 14, color: C.text, fontWeight: '900', marginBottom: 8, marginLeft: 2 },
    input: { backgroundColor: C.backgroundElement, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16, fontSize: 15, color: C.text, marginBottom: 18, borderWidth: 1, borderColor: C.border, fontWeight: '700' },
    notesInput: { backgroundColor: C.backgroundElement, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16, fontSize: 15, color: C.text, marginBottom: 20, borderWidth: 1, borderColor: C.border, height: 100, textAlignVertical: 'top', fontWeight: '700' },
    row: { flexDirection: 'row', gap: 12 },
    halfField: { flex: 1 },
    saveBtn: { position: 'absolute', left: 20, right: 20, bottom: 20, backgroundColor: C.backgroundbutton, paddingVertical: 18, borderRadius: 50, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, shadowColor: C.primary, shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 9 }, elevation: 5 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
    disabledBtn: { opacity: 0.72 },
    lockedContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 40 },
    cardIconLarge: { width: 86, height: 86, borderRadius: 30, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
    lockedTitle: { color: C.text, fontSize: 30, fontWeight: '900', marginBottom: 10 },
    lockedSubtitle: { color: C.textSecondary, fontSize: 15, lineHeight: 23, marginBottom: 24 },
    lockedUpgradeBtn: { backgroundColor: C.backgroundbutton, borderRadius: 999, minHeight: 56, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
    lockedUpgradeText: { color: '#fff', fontSize: 16, fontWeight: '900' },
    notNowBtn: { paddingVertical: 14, alignItems: 'center' },
    notNowText: { color: C.textSecondary, fontSize: 15, fontWeight: '800' },
  });
