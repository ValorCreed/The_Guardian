import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';

const LoginScreen = () => {
  const router = useRouter();
  const scheme = useColorScheme();
  const colorScheme = scheme === 'dark' ? 'dark' : 'light';
  const C = Colors[colorScheme];
  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topSection}>
        <View style={styles.iconBox}>
          <View style={styles.shield}>
            <View style={styles.checkLeft} />
            <View style={styles.checkRight} />
          </View>
        </View>
        <Text style={styles.title}>The Guardian</Text>
        <Text style={styles.subtitle}>
          Store your most sensitive life data in one secure place protected by zero-knowledge encryption.
        </Text>
      </View>

      <View style={styles.bottomSection}>
        <TouchableOpacity style={styles.createButton} onPress={() => router.push('/signup')}>
          <Text style={styles.createButtonText}>Create Account</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.signInButton} onPress={() => router.push('/signin')}>
          <Text style={styles.signInButtonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default LoginScreen;

type ThemeColors = (typeof Colors)[keyof typeof Colors];

const makeStyles = (C: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
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
    iconBox: {
      width: 100,
      height: 100,
      backgroundColor: C.primary,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 32,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 6,
    },
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
    checkLeft: {
      position: 'absolute',
      width: 3,
      height: 13,
      backgroundColor: '#ffffff',
      borderRadius: 2,
      transform: [{ rotate: '45deg' }, { translateX: -6 }, { translateY: 3 }],
    },
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
      color: C.text,
      marginBottom: 16,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
      paddingHorizontal: 10,
    },
    bottomSection: {
      gap: 12,
    },
    createButton: {
      backgroundColor: C.backgroundbutton,
      paddingVertical: 18,
      borderRadius: 50,
      alignItems: 'center',
    },
    createButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: 'bold',
    },
    signInButton: {
      backgroundColor: C.backgroundElement,
      paddingVertical: 18,
      borderRadius: 50,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.border,
    },
    signInButtonText: {
      color: C.text,
      fontSize: 16,
      fontWeight: '600',
    },
  });