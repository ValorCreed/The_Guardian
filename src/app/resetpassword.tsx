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
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../context/ThemeContext';
import GuardianLogoTile from '../components/GuardianLogoTitle';

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const openRecoveryKit = () => {
    router.replace({ pathname: '/accountrecovery', params: { mode: 'kit' } });
  };

  const openResetErase = () => {
    router.replace({
      pathname: '/accountrecovery',
      params: {
        mode: 'erase',
        email: String(params.email || ''),
      },
    });
  };

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

          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.subtitle}>
            Email-only password reset is no longer allowed because it could let someone reset the account while keeping encrypted vault data they cannot safely unlock.
          </Text>

          <View style={styles.infoCard}>
            <Ionicons name="key-outline" size={22} color={C.primary} />
            <Text style={styles.infoText}>
              Use your Recovery Kit to reset the password and keep the account safe.
            </Text>
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={openRecoveryKit} activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>Use Recovery Kit</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dangerButton} onPress={openResetErase} activeOpacity={0.85}>
            <Text style={styles.dangerButtonText}>No Recovery Kit? Reset & Erase</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/signin')} activeOpacity={0.75}>
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
    logoBox: { marginBottom: 20 },
    title: { fontSize: 32, fontWeight: '900', color: C.text, marginBottom: 10, letterSpacing: -0.4 },
    subtitle: { fontSize: 14, color: C.textSecondary, lineHeight: 21, marginBottom: 22 },
    infoCard: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      padding: 16,
      marginBottom: 18,
    
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    infoText: { flex: 1, color: C.textSecondary, fontSize: 13, lineHeight: 20, fontWeight: '700' },
    primaryButton: {
      minHeight: 56,
      borderRadius: 999,
      backgroundColor: C.backgroundbutton || C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
    dangerButton: {
      minHeight: 56,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.danger,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    dangerButtonText: { color: C.danger, fontSize: 15, fontWeight: '900' },
    backButton: { alignItems: 'center', paddingVertical: 16 },
    backButtonText: { color: C.textSecondary, fontSize: 14, fontWeight: '800' },
  });
