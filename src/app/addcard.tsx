import React, { useState } from 'react';
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
import { api } from '../services/api';
import { encryptJson } from '../utils/vaultcrypto';

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

  const handleSave = async () => {
    if (saving) return;
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
      const encryptedData = encryptJson({
        cardholderName: cardholderName.trim(),
        cardNumber: rawDigits,
        expiry: expiry.trim(),
        cvv: cvv.trim(),
        bankName: bankName.trim(),
      });

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
      Alert.alert('Save failed', error.message || 'Could not save card.');
    } finally {
      setSaving(false);
    }
  };

  const displayNumber = cardNumber
  ? formatCardNumber(cardNumber)
  : '••••  ••••  ••••  ••••';
  const displayName = cardholderName || 'Cardholder Name';
  const displayBank = bankName || 'Secure Card';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Card</Text>
        </View>

        <View style={styles.cardPreview}>
          <View style={styles.previewTop}>
            <View style={styles.chip} />
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

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
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
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 12 },
    backBtn: { width: 36, height: 36, backgroundColor: C.backgroundSelected, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 22, fontWeight: 'bold', color: C.text },
    cardPreview: { backgroundColor: C.primary, borderRadius: 20, marginHorizontal: 20, marginBottom: 28, padding: 24, height: 190, justifyContent: 'space-between' },
    previewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    chip: { width: 44, height: 32, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 6 },
    bankPreview: { color: '#fff', fontSize: 14, fontWeight: '700' },
    cardNumberPreview: { color: '#fff', fontSize: 19, letterSpacing: 2, fontWeight: '600' },
    previewBottom: { flexDirection: 'row', justifyContent: 'space-between' },
    previewLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 9, marginBottom: 4, letterSpacing: 1 },
    cardNamePreview: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
    form: { paddingHorizontal: 20 },
    label: { fontSize: 14, color: C.text, fontWeight: '600', marginBottom: 8 },
    input: { backgroundColor: C.backgroundElement, borderRadius: 50, paddingHorizontal: 20, paddingVertical: 16, fontSize: 15, color: C.text, marginBottom: 20, borderWidth: 1, borderColor: C.border },
    notesInput: { backgroundColor: C.backgroundElement, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16, fontSize: 15, color: C.text, marginBottom: 20, borderWidth: 1, borderColor: C.border, height: 90, textAlignVertical: 'top' },
    row: { flexDirection: 'row', gap: 12 },
    halfField: { flex: 1 },
    saveBtn: { position: 'absolute', left: 20, right: 20, bottom: 20, backgroundColor: C.backgroundbutton, paddingVertical: 18, borderRadius: 50, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  });
