import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const LoginScreen = () => {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>

      {/* Top section - logo and text */}
      <View style={styles.topSection}>

        {/* Shield icon box */}
        <View style={styles.iconBox}>
          <View style={styles.shield}>
            <View style={styles.checkLeft} />
            <View style={styles.checkRight} />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>The Guardian</Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          Store your most sensitive life data in one secure place protected by zero-knowledge encryption.
        </Text>

      </View>

      {/* Bottom section - buttons */}
      <View style={styles.bottomSection}>

        {/* Create Account button */}
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/signup')}
        >
          <Text style={styles.createButtonText}>Create Account</Text>
        </TouchableOpacity>

        {/* Sign In button */}
        <TouchableOpacity
          style={styles.signInButton}
          onPress={() => router.push('/signin')}
        >
          <Text style={styles.signInButtonText}>Sign In</Text>
        </TouchableOpacity>

      </View>

    </SafeAreaView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f0', // light greenish white background
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },

  topSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },

  // Green rounded square behind shield
  iconBox: {
    width: 100,
    height: 100,
    backgroundColor: '#1a5c35',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    // shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },

  // Shield border shape
  shield: {
    width: 48,
    height: 54,
    borderColor: '#ffffff',
    borderWidth: 3,
    borderRadius: 6,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Left stroke of checkmark
  checkLeft: {
    position: 'absolute',
    width: 3,
    height: 13,
    backgroundColor: '#ffffff',
    borderRadius: 2,
    transform: [{ rotate: '45deg' }, { translateX: -6 }, { translateY: 3 }],
  },

  // Right stroke of checkmark
  checkRight: {
    position: 'absolute',
    width: 3,
    height: 22,
    backgroundColor: '#ffffff',
    borderRadius: 2,
    transform: [{ rotate: '-45deg' }, { translateX: 6 }, { translateY: -1 }],
  },

  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#0f2d1f',
    marginBottom: 16,
    textAlign: 'center',
  },

  subtitle: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 10,
  },

  bottomSection: {
    gap: 12,
  },

  // Dark green filled button
  createButton: {
    backgroundColor: '#1a5c35',
    paddingVertical: 18,
    borderRadius: 50,
    alignItems: 'center',
  },

  createButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // White outlined button
  signInButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 18,
    borderRadius: 50,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },

  signInButtonText: {
    color: '#0f2d1f',
    fontSize: 16,
    fontWeight: '600',
  },
});