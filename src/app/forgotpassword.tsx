import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../context/ThemeContext';
import GuardianLogoTile from '../components/GuardianLogoTitle';

export default function ForgotPasswordScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
          <GuardianLogoTile size={62} logoSize={50} radius={18} style={styles.logoBox} />

          <Text style={styles.title}>Account recovery</Text>

          <Text style={styles.subtitle}>
            Choose how you want to regain access. Your Recovery Kit is the safe way to reset your password without erasing your vault.
          </Text>

          <TouchableOpacity
            style={styles.primaryCard}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/accountrecovery', params: { mode: 'kit' } })}
          >
            <View style={styles.cardIcon}>
              <Ionicons name="key-outline" size={24} color="#FFFFFF" />
            </View>

            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>Use Recovery Kit</Text>
              <Text style={styles.cardText}>
                Enter your Recovery ID and Recovery Key. No email is needed because the Recovery ID identifies the account.
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={20} color={C.tabInactive} />
          </TouchableOpacity>

          <View style={styles.warningBox}>
            <Ionicons name="shield-checkmark-outline" size={22} color={C.primary} />
            <Text style={styles.warningText}>
              Email-only password reset is disabled for vault safety. Email can only be used for Reset & Erase when no Recovery Kit is available.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.dangerCard}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/accountrecovery', params: { mode: 'erase' } })}
          >
            <View style={styles.dangerIcon}>
              <Ionicons name="trash-outline" size={24} color="#FFFFFF" />
            </View>

            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>No Recovery Kit?</Text>
              <Text style={styles.cardText}>
                Reset the account with an email code, but permanently erase old passwords, cards, documents, and notes.
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={20} color={C.tabInactive} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.backButton} activeOpacity={0.75} onPress={() => router.replace('/signin')}>
            <Text style={styles.backButtonText}>Back to sign in</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    flex: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 108,
      paddingBottom: 160,
    },
    logoBox: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },
 marginBottom: 20 },
    title: {
      fontSize: 32,
      fontWeight: '900',
      color: C.text,
      marginBottom: 10,
      letterSpacing: -0.4,
    },
    subtitle: {
      fontSize: 14,
      color: C.textSecondary,
      lineHeight: 21,
      marginBottom: 22,
    },
    primaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      gap: 12,
      marginBottom: 14,
    
      shadowColor: '#000',
      shadowOpacity: 0.24,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 14 },
      elevation: 12,},
    dangerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      gap: 12,
      marginBottom: 16,
    
      shadowColor: '#000',
      shadowOpacity: 0.24,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 14 },
      elevation: 12,},
    cardIcon: {
      width: 48,
      height: 48,
      borderRadius: 18,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
    
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},
    dangerIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 48,
      height: 48,
      borderRadius: 18,
      backgroundColor: C.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTextWrap: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },
 flex: 1 },
    cardTitle: { color: C.text, fontSize: 16, fontWeight: '900', marginBottom: 3 },
    cardText: { color: C.textSecondary, fontSize: 13, lineHeight: 19, fontWeight: '700' },
    warningBox: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      padding: 15,
      marginBottom: 14,
    
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},
    warningText: {
      flex: 1,
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '700',
    },
    backButton: {
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      elevation: 10,
      shadowOffset: { width: 0, height: 11 },
 alignItems: 'center', paddingVertical: 14 },
    backButtonText: { color: C.textSecondary, fontSize: 14, fontWeight: '800' },
  });
