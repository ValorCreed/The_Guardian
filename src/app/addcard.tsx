import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const AddCardScreen = () => {
  const router = useRouter();

  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  // formats card number with spaces every 4 digits
  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 16);
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join('  ') : cleaned;
  };

  // formats expiry as MM/YY
  const formatExpiry = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 4);
    if (cleaned.length >= 3) {
      return cleaned.slice(0, 2) + '/' + cleaned.slice(2);
    }
    return cleaned;
  };

  // what shows on the card preview
  const displayNumber = cardNumber.length > 0
    ? cardNumber
    : '• • • •  • • • •  • • • •  • • • •';

  const displayName = cardholderName.length > 0
    ? cardholderName
    : 'Cardholder Name';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Card</Text>
        </View>

        {/* Card preview */}
        <View style={styles.cardPreview}>
          {/* Chip */}
          <View style={styles.chip} />

          {/* Card number */}
          <Text style={styles.cardNumberPreview}>{displayNumber}</Text>

          {/* Cardholder name */}
          <Text style={styles.cardNamePreview}>{displayName}</Text>
        </View>

        <View style={styles.form}>

          {/* Cardholder Name */}
          <Text style={styles.label}>Cardholder Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Alex Morgan"
            placeholderTextColor="#aaa"
            value={cardholderName}
            onChangeText={setCardholderName}
            autoCapitalize="words"
          />

          {/* Card Number */}
          <Text style={styles.label}>Card Number</Text>
          <TextInput
            style={styles.input}
            placeholder="0000  0000  0000  0000"
            placeholderTextColor="#aaa"
            value={cardNumber}
            onChangeText={(val) => setCardNumber(formatCardNumber(val))}
            keyboardType="numeric"
            maxLength={22}
          />

          {/* Expiry and CVV side by side */}
          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>Expiry</Text>
              <TextInput
                style={styles.input}
                placeholder="MM/YY"
                placeholderTextColor="#aaa"
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
                placeholderTextColor="#aaa"
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

      {/* Save button */}
      <TouchableOpacity
        style={styles.saveBtn}
        onPress={() => router.back()}
      >
        <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
        <Text style={styles.saveBtnText}>Save Card</Text>
      </TouchableOpacity>

    </SafeAreaView>
  );
};

export default AddCardScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f0',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },

  backBtn: {
    width: 36,
    height: 36,
    backgroundColor: '#e8ede8',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f2d1f',
  },

  // Card preview
  cardPreview: {
    backgroundColor: '#1a5c35',
    borderRadius: 20,
    marginHorizontal: 20,
    marginBottom: 28,
    padding: 24,
    height: 180,
    justifyContent: 'space-between',
  },

  chip: {
    width: 44,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
  },

  cardNumberPreview: {
    color: '#ffffff',
    fontSize: 18,
    letterSpacing: 2,
    fontWeight: '500',
  },

  cardNamePreview: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1,
  },

  form: {
    paddingHorizontal: 20,
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

  // Expiry and CVV side by side
  row: {
    flexDirection: 'row',
    gap: 12,
  },

  halfField: {
    flex: 1,
  },

  saveBtn: {
    backgroundColor: '#1a5c35',
    paddingVertical: 18,
    borderRadius: 50,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 20,
  },

  saveBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});