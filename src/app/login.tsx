import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { useAppTheme } from '../context/ThemeContext';

const GUARDIAN_LOGO = require('../assets/ForegroundIconGuardianTrans.png');

const WelcomeScreen = () => {
  const router = useRouter();
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.logoWrapper}>
          <Image source={GUARDIAN_LOGO} style={styles.logoImage} resizeMode="contain" />
          
          <Svg
            width={160}
            height={20}
            style={styles.shadowSvg}
          >
            <Defs>
              <RadialGradient id="shadowGrad" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%" stopColor="#000000" stopOpacity={0.9} />
                <Stop offset="35%" stopColor="#000000" stopOpacity={0.7} />
                <Stop offset="100%" stopColor="#000000" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            {/* Reduced ry for thinness, adjusted rx/cx/cy for concentration */}
            <Ellipse cx={80} cy={10} rx={82} ry={11.5} fill="url(#shadowGrad)" />
          </Svg>
        </View>

        <Text style={styles.title}>The Guardian</Text>

        <Text style={styles.subtitle}>
          Store your most sensitive life data in one secure place protected by
          zero-knowledge encryption.
        </Text>
      </View>

      <View style={styles.buttonGroup}>
        <TouchableOpacity
          style={styles.createButton}
          activeOpacity={0.85}
          onPress={() => router.push('/signup')}
        >
          <Text style={styles.createText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signinButton}
          activeOpacity={0.85}
          onPress={() => router.push('/signin')}
        >
          <Text style={styles.signinText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default WelcomeScreen;

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
      justifyContent: 'space-between',
    },

    content: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },

    logoWrapper: {
      width: 200,
      height: 200,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 28,
      position: 'relative', // Ensure absolute children position relative to this wrapper
    },

    logoImage: {
      width: 200,
      height: 200,
      zIndex: 2, // Place the image above the shadow
    },

    shadowSvg: {
      position: 'absolute',
      bottom: -15, // Pushed down slightly below the logo wrapper center
      zIndex: 1,
    },

    title: {
      fontSize: 30,
      fontWeight: '900',
      color: C.text,
      marginBottom: 14,
    },

    subtitle: {
      fontSize: 15,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },

    buttonGroup: {
      paddingHorizontal: 24,
      paddingBottom: 24,
      gap: 14,
    },

    createButton: {
      backgroundColor: C.backgroundbutton,
      paddingVertical: 18,
      borderRadius: 50,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 56,
    },

    createText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '900',
    },

    signinButton: {
      backgroundColor: C.backgroundElement,
      paddingVertical: 18,
      borderRadius: 50,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 56,
      borderWidth: 1,
      borderColor: C.border,
    },

    signinText: {
      color: C.text,
      fontSize: 16,
      fontWeight: '900',
    },
  });