import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../context/ThemeContext';
import GuardianLogoTile from '../components/GuardianLogoTitle';

const LoginScreen = () => {
  const router = useRouter();
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topSection}>
        <GuardianLogoTile
          size={100}
          logoSize={84}
          radius={28}
          style={styles.iconBox}
        />

        <Text style={styles.title}>The Guardian</Text>

        <Text style={styles.subtitle}>
          Store your most sensitive life data in one secure place protected by
          zero-knowledge encryption.
        </Text>
      </View>

      <View style={styles.bottomSection}>
        <TouchableOpacity
          style={styles.createButton}
          activeOpacity={0.85}
          onPress={() => router.push('/signup')}
        >
          <Text style={styles.createButtonText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signInButton}
          activeOpacity={0.85}
          onPress={() => router.push('/signin')}
        >
          <Text style={styles.signInButtonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default LoginScreen;

const makeStyles = (C: any) =>
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
      marginBottom: 32,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 6,
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