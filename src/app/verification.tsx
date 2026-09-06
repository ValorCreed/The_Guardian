import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../context/ThemeContext';
import { logout } from '../services/api';
import {
  getLegalConsentRecord,
  saveLegalConsentAcceptance,
} from '../services/legalConsent';
import {
  hapticLight,
  hapticMedium,
  hapticSuccess,
  hapticWarning,
} from '../utils/haptics';

type ConsentItemProps = {
  accepted: boolean;
  title: string;
  linkLabel: string;
  onToggle: () => void;
  onOpenDocument: () => void;
  styles: ReturnType<typeof makeStyles>;
  C: any;
};

function ConsentItem({
  accepted,
  title,
  linkLabel,
  onToggle,
  onOpenDocument,
  styles,
  C,
}: ConsentItemProps) {
  return (
    <View style={styles.consentItem}>
      <TouchableOpacity
        style={styles.consentMain}
        activeOpacity={0.78}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        accessibilityLabel={`Accept ${title}`}
      >
        <View style={[styles.checkbox, accepted && styles.checkboxAccepted]}>
          {accepted ? (
            <Ionicons name="checkmark" size={18} color="#FFFFFF" />
          ) : null}
        </View>

        <Text style={styles.consentTitle}>{title}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.72}
        onPress={onOpenDocument}
        style={styles.documentLinkButton}
        accessibilityRole="link"
        accessibilityLabel={linkLabel}
      >
        <Text style={styles.documentLink}>{linkLabel}</Text>
        <Ionicons name="open-outline" size={14} color={C.primary} />
      </TouchableOpacity>
    </View>
  );
}

export default function VerificationScreen() {
  const { colors: C, isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const params = useLocalSearchParams<{ from?: string; preview?: string }>();
  const fromSettings = params.from === 'settings' || params.preview === '1';

  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loadingConsent, setLoadingConsent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [declining, setDeclining] = useState(false);

  const fullyAccepted = privacyAccepted && termsAccepted;
  const acceptedCount = Number(privacyAccepted) + Number(termsAccepted);

  useEffect(() => {
    let mounted = true;

    const loadConsent = async () => {
      try {
        const record = await getLegalConsentRecord();

        if (!mounted) return;

        if (record) {
          setPrivacyAccepted(true);
          setTermsAccepted(true);
        }
      } finally {
        if (mounted) setLoadingConsent(false);
      }
    };

    void loadConsent();

    return () => {
      mounted = false;
    };
  }, []);

  const togglePrivacy = () => {
    setPrivacyAccepted((current) => {
      const next = !current;
      if (next) {
        hapticLight();
      } else {
        hapticWarning();
      }
      return next;
    });
  };

  const toggleTerms = () => {
    setTermsAccepted((current) => {
      const next = !current;
      if (next) {
        hapticLight();
      } else {
        hapticWarning();
      }
      return next;
    });
  };

  const handleContinue = async () => {
    if (!fullyAccepted || saving) return;

    try {
      setSaving(true);
      hapticMedium();

      await saveLegalConsentAcceptance();
      hapticSuccess();

      if (fromSettings) {
        router.back();
        return;
      }

      router.replace('/home');
    } finally {
      setSaving(false);
    }
  };

  const handleDecline = async () => {
    if (declining || saving) return;

    if (fromSettings) {
      hapticLight();
      router.back();
      return;
    }

    try {
      setDeclining(true);
      hapticWarning();

      await logout();
      await AsyncStorage.removeItem('vaultLocked');
      router.replace('/login');
    } finally {
      setDeclining(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: fromSettings ? 96 : 28 },
        ]}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroGlowLarge} />
          <View style={styles.heroGlowSmall} />

          <View style={styles.logoSurface}>
            <Image
              source={require('../assets/ForegroundIconGuardianTrans.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>

          <Text style={styles.kicker}>WELCOME TO THE GUARDIAN</Text>
          <Text style={styles.title}>Your private vault starts here.</Text>
          <Text style={styles.subtitle}>
            Accept the Privacy Policy and Terms of Service to continue.
          </Text>
        </View>

        <View style={styles.trustStrip}>
          <View style={styles.trustItem}>
            <Ionicons name="lock-closed" size={16} color={C.primary} />
            <Text style={styles.trustText}>Encrypted</Text>
          </View>
          <View style={styles.trustDivider} />
          <View style={styles.trustItem}>
            <Ionicons name="eye-off" size={16} color={C.primary} />
            <Text style={styles.trustText}>Private</Text>
          </View>
          <View style={styles.trustDivider} />
          <View style={styles.trustItem}>
            <Ionicons name="shield-checkmark" size={16} color={C.primary} />
            <Text style={styles.trustText}>Protected</Text>
          </View>
        </View>

        <View style={styles.legalHeaderRow}>
          <Text style={styles.legalTitle}>Review and accept</Text>

          <View style={[styles.progressPill, fullyAccepted && styles.progressPillComplete]}>
            <Ionicons
              name={fullyAccepted ? 'checkmark-circle' : 'document-text-outline'}
              size={15}
              color={fullyAccepted ? '#FFFFFF' : C.primary}
            />
            <Text style={[styles.progressText, fullyAccepted && styles.progressTextComplete]}>
              {acceptedCount}/2
            </Text>
          </View>
        </View>

        <View style={styles.legalCard}>
          {loadingConsent ? (
            <View style={styles.legalLoading}>
              <ActivityIndicator size="small" color={C.primary} />
              <Text style={styles.legalLoadingText}>Checking acceptance…</Text>
            </View>
          ) : (
            <>
              <ConsentItem
                accepted={privacyAccepted}
                title="Privacy Policy"
                linkLabel="Read policy"
                onToggle={togglePrivacy}
                onOpenDocument={() => {
                  hapticLight();
                  router.push('/privacy');
                }}
                styles={styles}
                C={C}
              />

              <View style={styles.legalDivider} />

              <ConsentItem
                accepted={termsAccepted}
                title="Terms of Service"
                linkLabel="Read terms"
                onToggle={toggleTerms}
                onOpenDocument={() => {
                  hapticLight();
                  router.push('/terms');
                }}
                styles={styles}
                C={C}
              />
            </>
          )}
        </View>

        <Text style={styles.versionText}>© 2026 The Guardian LLC</Text>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            (!fullyAccepted || loadingConsent) && styles.continueButtonDisabled,
          ]}
          activeOpacity={fullyAccepted ? 0.86 : 1}
          disabled={!fullyAccepted || loadingConsent || saving || declining}
          onPress={handleContinue}
          accessibilityRole="button"
          accessibilityState={{ disabled: !fullyAccepted || loadingConsent }}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons
              name={fullyAccepted ? 'shield-checkmark' : 'lock-closed-outline'}
              size={21}
              color={fullyAccepted ? '#FFFFFF' : C.textSecondary}
            />
          )}

          <Text
            style={[
              styles.continueButtonText,
              (!fullyAccepted || loadingConsent) && styles.continueButtonTextDisabled,
            ]}
          >
            {saving
              ? 'Saving…'
              : fromSettings
                ? 'Done'
                : 'Accept and continue'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.declineButton}
          activeOpacity={0.72}
          disabled={saving || declining}
          onPress={handleDecline}
        >
          {declining ? (
            <ActivityIndicator size="small" color={C.textSecondary} />
          ) : null}
          <Text style={styles.declineText}>
            {fromSettings ? 'Return without changes' : 'Decline and sign out'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 190,
    },
    heroCard: {
      minHeight: 292,
      borderRadius: 34,
      backgroundColor: C.primary,
      paddingHorizontal: 22,
      paddingVertical: 24,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
      shadowColor: C.primary,
      shadowOpacity: 0.2,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
      elevation: 6,
    },
    heroGlowLarge: {
      position: 'absolute',
      width: 280,
      height: 280,
      borderRadius: 140,
      top: -150,
      right: -100,
      backgroundColor: 'rgba(255,255,255,0.10)',
    },
    heroGlowSmall: {
      position: 'absolute',
      width: 170,
      height: 170,
      borderRadius: 85,
      bottom: -105,
      left: -65,
      backgroundColor: 'rgba(255,255,255,0.07)',
    },
    logoSurface: {
      width: 104,
      height: 104,
      borderRadius: 32,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.75)',
      shadowColor: '#000',
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5,
      marginBottom: 18,
    },
    logo: {
      width: 90,
      height: 90,
    },
    kicker: {
      color: 'rgba(255,255,255,0.74)',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.25,
      textAlign: 'center',
      marginBottom: 8,
    },
    title: {
      color: '#FFFFFF',
      fontSize: 29,
      fontWeight: '900',
      letterSpacing: -0.75,
      lineHeight: 35,
      textAlign: 'center',
    },
    subtitle: {
      color: 'rgba(255,255,255,0.78)',
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 19,
      textAlign: 'center',
      marginTop: 9,
      maxWidth: 300,
    },
    trustStrip: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-evenly',
      marginTop: 14,
      marginBottom: 24,
      paddingHorizontal: 10,
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
    },
    trustItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      flex: 1,
    },
    trustText: {
      color: C.text,
      fontSize: 12,
      fontWeight: '900',
    },
    trustDivider: {
      width: 1,
      height: 24,
      backgroundColor: C.border,
    },
    legalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    legalTitle: {
      color: C.text,
      fontSize: 24,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
    progressPill: {
      minWidth: 66,
      minHeight: 34,
      borderRadius: 17,
      paddingHorizontal: 11,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: C.actionCard || C.backgroundSelected,
      borderWidth: 1,
      borderColor: C.border,
    },
    progressPillComplete: {
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    progressText: {
      color: C.primary,
      fontSize: 12,
      fontWeight: '900',
    },
    progressTextComplete: {
      color: '#FFFFFF',
    },
    legalCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 16,
      overflow: 'hidden',
    },
    legalLoading: {
      minHeight: 110,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    legalLoadingText: {
      color: C.textSecondary,
      fontSize: 13,
      fontWeight: '700',
    },
    consentItem: {
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 14,
    },
    consentMain: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
    },
    checkbox: {
      width: 29,
      height: 29,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: C.border,
      backgroundColor: C.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      flexShrink: 0,
    },
    checkboxAccepted: {
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    consentTitle: {
      flex: 1,
      color: C.text,
      fontSize: 15,
      fontWeight: '900',
    },
    documentLinkButton: {
      minHeight: 38,
      borderRadius: 16,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      backgroundColor: C.actionCard || C.backgroundSelected,
    },
    documentLink: {
      color: C.primary,
      fontSize: 11,
      fontWeight: '900',
    },
    legalDivider: {
      height: 1,
      backgroundColor: C.border,
      marginLeft: 41,
    },
    versionText: {
      color: C.textSecondary,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: 13,
    },
    bottomBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 20,
      backgroundColor: C.background,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    continueButton: {
      minHeight: 58,
      borderRadius: 21,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
      shadowColor: C.primary,
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 9 },
      elevation: 4,
    },
    continueButtonDisabled: {
      backgroundColor: C.backgroundSelected,
      borderWidth: 1,
      borderColor: C.border,
      shadowOpacity: 0,
      elevation: 0,
    },
    continueButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
    },
    continueButtonTextDisabled: {
      color: C.textSecondary,
    },
    declineButton: {
      minHeight: 39,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      marginTop: 4,
    },
    declineText: {
      color: C.textSecondary,
      fontSize: 12,
      fontWeight: '800',
    },
  });