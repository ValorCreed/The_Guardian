import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const EncryptionScreen = () => {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Lock icon circle */}
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed" size={32} color="#1a5c35" />
        </View>

        {/* Title */}
        <Text style={styles.title}>Zero-Knowledge{'\n'}Encryption</Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          Your master password encrypts everything before it leaves your device.
          It is never stored or transmitted — not even to us.
        </Text>

        {/* Feature cards */}
        <View style={styles.cardsSection}>

          <View style={styles.card}>
            <View style={styles.cardIconCircle}>
              <Ionicons name="shield-checkmark-outline" size={22} color="#1a5c35" />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>End-to-end encrypted</Text>
              <Text style={styles.cardSubtitle}>Only you can decrypt your vault.</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardIconCircle}>
              <Ionicons name="eye-off-outline" size={22} color="#1a5c35" />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>We can't see your data</Text>
              <Text style={styles.cardSubtitle}>Zero-knowledge by design.</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardIconCircle}>
              <Ionicons name="refresh-circle-outline" size={22} color="#1a5c35" />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Recovery matters</Text>
              <Text style={styles.cardSubtitle}>
                If you lose it, your data can't be recovered.
              </Text>
            </View>
          </View>

        </View>

        {/* Warning box */}
        <View style={styles.warningBox}>
          <Ionicons name="information-circle-outline" size={20} color="#5a4020" style={{ marginBottom: 6 }} />
          <Text style={styles.warningText}>
            Save your recovery kit somewhere safe. There is no "reset password"
            for a zero-knowledge vault.
          </Text>
        </View>

      </ScrollView>

      {/* Bottom button */}
      <TouchableOpacity
        style={styles.button}
        onPress={() => router.replace('/home')}
      >
        <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
        <Text style={styles.buttonText}>I understand — Secure my vault</Text>
      </TouchableOpacity>

    </SafeAreaView>
  );
};

export default EncryptionScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f0',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },

  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#dce8dc',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0f2d1f',
    marginBottom: 14,
    lineHeight: 36,
  },

  subtitle: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
    marginBottom: 32,
  },

  cardsSection: {
    gap: 12,
    marginBottom: 24,
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  cardIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dce8dc',
    justifyContent: 'center',
    alignItems: 'center',
  },

  cardText: {
    flex: 1,
  },

  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f2d1f',
    marginBottom: 2,
  },

  cardSubtitle: {
    fontSize: 13,
    color: '#777',
  },

  warningBox: {
    backgroundColor: '#f5ead8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },

  warningText: {
    fontSize: 14,
    color: '#5a4020',
    lineHeight: 21,
  },

  button: {
    backgroundColor: '#1a5c35',
    paddingVertical: 18,
    borderRadius: 50,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },

  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});