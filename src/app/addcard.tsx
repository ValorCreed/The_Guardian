import React, { useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  ScrollView, TextInput, useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

const AddCardScreen = () => {
  const router = useRouter();
  const scheme = useColorScheme();
  const schemeKey: 'light' | 'dark' = scheme === 'dark' ? 'dark' : 'light';
  const C = Colors[schemeKey];
  const styles = makeStyles(C);

  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

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

  const displayNumber = cardNumber.length > 0 ? cardNumber : '• • • •  • • • •  • • • •  • • • •';
  const displayName = cardholderName.length > 0 ? cardholderName : 'Cardholder Name';

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
          <View style={styles.chip} />
          <Text style={styles.cardNumberPreview}>{displayNumber}</Text>
          <Text style={styles.cardNamePreview}>{displayName}</Text>
        </View>

        <View style={styles.form}>
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
                placeholder="• • •"
                placeholderTextColor={C.tabInactive}
                value={cvv}
                onChangeText={(val) => setCvv(val.replace(/\D/g, '').slice(0, 4))}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
              />
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity style={styles.saveBtn} onPress={() => router.back()}>
        <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
        <Text style={styles.saveBtnText}>Save Card</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default AddCardScreen;

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
    cardPreview: {
      backgroundColor: C.primary,
      borderRadius: 20, marginHorizontal: 20, marginBottom: 28,
      padding: 24, height: 180, justifyContent: 'space-between',
    },
    chip: {
      width: 44, height: 32,
      backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6,
    },
    cardNumberPreview: { color: '#fff', fontSize: 18, letterSpacing: 2, fontWeight: '500' },
    cardNamePreview: { color: '#fff', fontSize: 15, fontWeight: '600', letterSpacing: 1 },
    form: { paddingHorizontal: 20 },
    label: { fontSize: 14, color: C.text, fontWeight: '600', marginBottom: 8 },
    input: {
      backgroundColor: C.backgroundElement,
      borderRadius: 50, paddingHorizontal: 20, paddingVertical: 16,
      fontSize: 15, color: C.text, marginBottom: 20,
      borderWidth: 1, borderColor: C.border,
    },
    row: { flexDirection: 'row', gap: 12 },
    halfField: { flex: 1 },
    saveBtn: {
      backgroundColor: C.backgroundbutton,
      paddingVertical: 18, borderRadius: 50,
      flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
      gap: 10, marginHorizontal: 20, marginBottom: 20,
    },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  });