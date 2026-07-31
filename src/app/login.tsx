import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../context/ThemeContext';
const guardianLogo = require('../assets/guardian-floating-logo.png');

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const pick = (...values: Array<string | undefined | null>) =>
  values.find(value => typeof value === 'string' && value.length > 0) || '#000000';

const isVeryDarkColor = (value?: string) => {
  if (!value || !value.startsWith('#')) return false;

  const hex = value.replace('#', '');
  if (hex.length < 6) return false;

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return r + g + b < 70;
};

const WelcomeScreen = () => {
  const router = useRouter();
  const { colors: C } = useAppTheme();

  const floatAnim = useRef(new Animated.Value(0)).current;
  const entranceAnim = useRef(new Animated.Value(0)).current;

  const palette = useMemo(() => {
    const background = pick(C.background, C.backgroundPrimary, '#F5F7FA');
    const surface = pick(C.surface, C.backgroundElement, C.card, '#FFFFFF');
    const elevated = pick(C.surfaceElevated, C.backgroundElement, surface);
    const primary = pick(C.primary, C.backgroundbutton, C.tint, '#1D9E75');
    const primaryDark = pick(C.primaryDark, '#145A3E');
    const text = pick(C.textPrimary, C.text, '#101828');
    const muted = pick(C.textSecondary, C.muted, '#667085');
    const border = pick(C.border, 'rgba(148, 163, 184, 0.26)');
    const dark = isVeryDarkColor(background);

    return {
      background,
      surface,
      elevated,
      primary,
      primaryDark,
      text,
      muted,
      border,
      dark,
      softPrimary: dark ? 'rgba(29, 158, 117, 0.14)' : 'rgba(29, 158, 117, 0.12)',
      softPrimaryStrong: dark ? 'rgba(29, 158, 117, 0.28)' : 'rgba(29, 158, 117, 0.18)',
      // floorShadow: dark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(15, 23, 42, 0.10)',
      floorCore: dark ? 'rgba(255, 255, 255, 0.13)' : 'rgba(15, 23, 42, 0.10)',
      floorGlow: dark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(15, 23, 42, 0.06)',
      logoHalo: dark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(29, 158, 117, 0.10)',
      orbOne: dark ? 'rgba(29, 158, 117, 0.14)' : 'rgba(29, 158, 117, 0.10)',
      orbTwo: dark ? 'rgba(20, 90, 62, 0.14)' : 'rgba(168, 221, 201, 0.30)',
    };
  }, [C]);

  const styles = useMemo(() => makeStyles(palette), [palette]);

  useEffect(() => {
    Animated.sequence([
      Animated.delay(80),
      Animated.timing(entranceAnim, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    ////Floating logo animation loop
    const floatingLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    floatingLoop.start();

    return () => {
      floatingLoop.stop();
    };
  }, [entranceAnim, floatAnim]);

  const logoTranslateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -13],
  });

  const logoScale = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.018],
  });

  // const shadowScaleX = floatAnim.interpolate({
  //   inputRange: [0, 1],
  //   outputRange: [1.15, 0.82],
  // });

  const shadowScaleY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.72],
  });

  const shadowOpacity = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.16, 0.06],
  });

  const entranceTranslateY = entranceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });

  const handleCreateAccount = () => {
    router.push('/signup');
  };

  const handleSignIn = () => {
    router.push('/signin');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={palette.dark ? 'light-content' : 'dark-content'} backgroundColor={palette.background} />

      <View pointerEvents="none" style={styles.backgroundLayer}>
        <View style={styles.orbLarge} />
        <View style={styles.orbSmall} />
        <View style={styles.gridGlow} />
      </View>

      <Animated.View
        style={[
          styles.content,
          {
            opacity: entranceAnim,
            transform: [{ translateY: entranceTranslateY }],
          },
        ]}
      >
        <View style={styles.heroSection}>
          <View style={styles.logoStage}>
            {/* <Animated.View
              style={[
                styles.floorGlow,
                {
                  opacity: floatAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: palette.dark ? [0.24, 0.10] : [0.18, 0.07],
                  }),
                  transform: [{ scaleX: shadowScaleX }, { scaleY: shadowScaleY }],
                },
              ]}
            /> */}

            {/* <Animated.View
              style={[
                styles.floorCore,
                {
                  opacity: shadowOpacity,
                  transform: [{ scaleX: shadowScaleX }, { scaleY: shadowScaleY }],
                },
              ]}
            /> */}

            <Animated.View
              style={[
                styles.floatingLogoWrap,
                {
                  transform: [{ translateY: logoTranslateY }, { scale: logoScale }],
                },
              ]}
            >
              <Image source={guardianLogo} style={styles.logoImage} resizeMode="contain" />
            </Animated.View>
          </View>

          <View style={styles.titleBlock}>
            {/* <Text style={styles.eyebrow}>Encrypted life vault</Text> */}
            <Text style={styles.title}>The Guardian</Text>
            <Text style={styles.subtitle}>
              Store your most sensitive life data in one secure place protected by zero-knowledge encryption.
            </Text>
          </View>

          <View style={styles.trustRow}>
            <View style={styles.trustPill}>
              <Ionicons name="shield-checkmark" size={16} color={palette.primary} />
              <Text style={styles.trustText}>Private</Text>
            </View>
            <View style={styles.trustPill}>
              <Ionicons name="lock-closed" size={16} color={palette.primary} />
              <Text style={styles.trustText}>Encrypted</Text>
            </View>
            <View style={styles.trustPill}>
              <Ionicons name="finger-print" size={16} color={palette.primary} />
              <Text style={styles.trustText}>Secure</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomSection}>
          <Pressable
            style={({ pressed }) => [styles.createButton, pressed && styles.buttonPressed]}
            onPress={handleCreateAccount}
          >
            <Text style={styles.createButtonText}>Create Account</Text>
            <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
          </Pressable>

          <Pressable style={({ pressed }) => [styles.signInButton, pressed && styles.buttonPressed]} onPress={handleSignIn}>
            <Text style={styles.signInButtonText}>Sign In</Text>
          </Pressable>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
};

export default WelcomeScreen;

const makeStyles = (P: any) => {
  const compact = SCREEN_HEIGHT < 760;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: P.background,
    },

    backgroundLayer: {
      ...StyleSheet.absoluteFill,
      overflow: 'hidden',
    },

    orbLarge: {
      position: 'absolute',
      width: 310,
      height: 310,
      borderRadius: 155,
      backgroundColor: P.orbOne,
      top: -96,
      right: -118,
      opacity: 0.8,
    },

    orbSmall: {
      position: 'absolute',
      width: 230,
      height: 230,
      borderRadius: 115,
      backgroundColor: P.orbTwo,
      bottom: 88,
      left: -104,
      opacity: 0.75,
    },

    gridGlow: {
      position: 'absolute',
      left: 22,
      right: 22,
      top: compact ? 150 : 190,
      height: 230,
      borderRadius: 36,
      backgroundColor: P.softPrimary,
      opacity: P.dark ? 0.24 : 0.45,
      transform: [{ rotate: '-8deg' }],
    },

    content: {
      flex: 1,
      paddingHorizontal: 24,
      paddingBottom: Platform.OS === 'android' ? 22 : 18,
      justifyContent: 'space-between',
    },

    heroSection: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: compact ? 18 : 34,
    },

    logoStage: {
      width: 230,
      height: compact ? 218 : 244,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: compact ? 4 : 10,
    },

    floatingLogoWrap: {
      zIndex: 3,
    },

    logoImage: {
      width: compact ? 164 : 184,
      height: compact ? 168 : 188,
    },

    floorGlow: {
      position: 'absolute',
      bottom: compact ? 18 : 24,
      width: 132,
      height: 18,
      borderRadius: 999,
      backgroundColor: P.floorGlow,
    },

    floorCore: {
      position: 'absolute',
      bottom: compact ? 23 : 29,
      width: 78,
      height: 7,
      borderRadius: 999,
      backgroundColor: P.floorCore,
    },

    titleBlock: {
      alignItems: 'center',
      maxWidth: 360,
    },

    eyebrow: {
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: P.primary,
      marginBottom: 10,
    },

    title: {
      fontSize: compact ? 38 : 44,
      lineHeight: compact ? 44 : 50,
      fontWeight: '900',
      color: P.text,
      textAlign: 'center',
      letterSpacing: -1.6,
      marginBottom: 14,
    },

    subtitle: {
      fontSize: 16,
      color: P.muted,
      textAlign: 'center',
      lineHeight: 25,
      paddingHorizontal: 4,
      fontWeight: '500',
    },

    trustRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 9,
      marginTop: compact ? 22 : 28,
    },

    trustPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: P.softPrimaryStrong,
      borderWidth: 1,
      borderColor: P.border,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

    trustText: {
      color: P.text,
      fontSize: 12,
      fontWeight: '800',
    },

    bottomSection: {
      paddingTop: 16,
      gap: 12,
    },

    createButton: {
      minHeight: 58,
      borderRadius: 999,
      backgroundColor: P.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
      shadowColor: P.primary,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: P.dark ? 0.24 : 0.28,
      shadowRadius: 24,
      elevation: 8,
    },

    createButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '900',
      letterSpacing: 0.1,
    },

    signInButton: {
      minHeight: 58,
      borderRadius: 999,
      backgroundColor: P.elevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: P.border,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

    signInButtonText: {
      color: P.text,
      fontSize: 16,
      fontWeight: '800',
    },

    buttonPressed: {
      transform: [{ scale: 0.985 }],
      opacity: 0.92,
    },
  });
};
