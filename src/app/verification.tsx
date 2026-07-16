import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../context/ThemeContext';
import { hapticLight, hapticMedium, hapticWarning } from '../utils/haptics';

type FeatureCard = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
};

export default function VerificationScreen() {
  const { colors: C, isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const params = useLocalSearchParams<{ from?: string }>();
  const fromSettings = params.from === 'settings';

  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const features: FeatureCard[] = [
    {
      icon: 'shield-checkmark-outline',
      title: 'Encrypted vault protection',
      description: 'Passwords, cards, secure notes, and documents are protected with strong encryption before storage.',
    },
    {
      icon: 'eye-off-outline',
      title: 'Private by design',
      description: 'The Guardian is built to keep sensitive vault contents away from support reports, logs, and unnecessary exposure.',
    },
    {
      icon: 'medkit-outline',
      title: 'Recovery matters',
      description: 'Save your recovery kit safely. It helps you regain access when you need it most.',
    },
  ];

  const handleToggleTerms = () => {
    setAcceptedTerms((current) => {
      const next = !current;
      if (next) {
        hapticLight();
      } else {
        hapticWarning();
      }
      return next;
    });
  };

  const handleContinue = () => {
    if (!acceptedTerms) return;

    hapticMedium();

    if (fromSettings) {
      router.back();
      return;
    }

    router.replace('/home');
  };

  const goBack = () => {
    hapticLight();
    router.back();
  };

  const openPrivacy = () => {
    hapticLight();
    router.push('/privacy');
  };

  const openTerms = () => {
    hapticLight();
    router.push('/terms');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {fromSettings ? (
        <TouchableOpacity style={styles.backButton} activeOpacity={0.78} onPress={goBack}>
          <Ionicons name="chevron-back" size={23} color={C.text} />
        </TouchableOpacity>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.heroIconWrap}>
          <View style={styles.heroIconGlow} />
          <View style={styles.heroIconCircle}>
            <Ionicons name="shield-checkmark" size={36} color="#FFFFFF" />
          </View>
        </View>

        <Text style={styles.kicker}>THE GUARDIAN</Text>
        <Text style={styles.title}>Your vault is almost ready</Text>
        <Text style={styles.subtitle}>
          Before you continue, review how The Guardian protects your vault and accept the legal terms for using the app.
        </Text>

        <View style={styles.statusCard}>
          <View style={styles.statusIconCircle}>
            <Ionicons name="lock-closed-outline" size={22} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>Secure vault verification</Text>
            <Text style={styles.statusBody}>
              Your vault experience includes encrypted storage, device-based security, recovery tools, privacy controls, and safe support reporting.
            </Text>
          </View>
        </View>

        <View style={styles.cardsSection}>
          {features.map((feature) => (
            <View key={feature.title} style={styles.card}>
              <View style={styles.cardIconCircle}>
                <Ionicons name={feature.icon} size={22} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{feature.title}</Text>
                <Text style={styles.cardSubtitle}>{feature.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.warningBox}>
          <View style={styles.warningIconCircle}>
            <Ionicons name="information-circle-outline" size={20} color={C.warning} />
          </View>
          <Text style={styles.warningText}>
            Keep your recovery kit somewhere safe. The Guardian can help protect your vault, but you are responsible for keeping your account, device, and recovery information secure.
          </Text>
        </View>

        <View style={styles.legalCard}>
          <TouchableOpacity
            style={styles.checkboxRow}
            activeOpacity={0.8}
            onPress={handleToggleTerms}
          >
            <View style={[styles.checkbox, acceptedTerms && styles.checkboxAccepted]}>
              {acceptedTerms ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
            </View>

            <Text style={styles.checkboxText}>
              I have read and agree to The Guardian&apos;s Privacy Policy and Terms of Service.
            </Text>
          </TouchableOpacity>

          <View style={styles.legalLinksRow}>
            <TouchableOpacity activeOpacity={0.75} onPress={openPrivacy}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>•</Text>
            <TouchableOpacity activeOpacity={0.75} onPress={openTerms}>
              <Text style={styles.legalLink}>Terms of Service</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.continueButton, !acceptedTerms && styles.continueButtonDisabled]}
          activeOpacity={acceptedTerms ? 0.85 : 1}
          disabled={!acceptedTerms}
          onPress={handleContinue}
        >
          <Ionicons
            name={acceptedTerms ? 'checkmark-circle-outline' : 'lock-closed-outline'}
            size={22}
            color={acceptedTerms ? '#FFFFFF' : C.textSecondary}
          />
          <Text style={[styles.continueButtonText, !acceptedTerms && styles.continueButtonTextDisabled]}>
            {fromSettings ? 'Done reviewing' : 'Accept and continue'}
          </Text>
        </TouchableOpacity>

        {!acceptedTerms ? (
          <Text style={styles.disabledHint}>Accept the Privacy Policy and Terms of Service to continue.</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (C: any, isDark: boolean) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  backButton: {
    position: 'absolute',
    top: 58,
    left: 20,
    zIndex: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.backgroundElement,
    borderWidth: 1,
    borderColor: C.border,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 34,
    paddingBottom: 190,
  },
  heroIconWrap: {
    width: 94,
    height: 94,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 22,
  },
  heroIconGlow: {
    position: 'absolute',
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: C.primary,
    opacity: isDark ? 0.18 : 0.12,
  },
  heroIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primary,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.7)',
  },
  kicker: {
    color: C.primary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    color: C.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
    textAlign: 'center',
    lineHeight: 39,
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 22,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.backgroundElement,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 16,
  },
  statusIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.actionCard || C.backgroundSelected,
    marginRight: 14,
  },
  statusTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
  },
  statusBody: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  cardsSection: {
    gap: 12,
    marginBottom: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.backgroundElement,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 15,
  },
  cardIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.actionCard || C.backgroundSelected,
    marginRight: 14,
  },
  cardTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.alertWarningBg || (isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFF7E8'),
    borderRadius: 22,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245, 158, 11, 0.22)' : 'rgba(245, 158, 11, 0.26)',
    padding: 15,
    marginBottom: 16,
  },
  warningIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.10)',
    marginRight: 12,
  },
  warningText: {
    flex: 1,
    color: C.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  legalCard: {
    backgroundColor: C.backgroundElement,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 25,
    height: 25,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.background,
    marginRight: 12,
    marginTop: 1,
  },
  checkboxAccepted: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  checkboxText: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 21,
  },
  legalLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingLeft: 37,
    marginTop: 12,
  },
  legalLink: {
    color: C.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  legalDot: {
    color: C.textSecondary,
    fontSize: 16,
    fontWeight: '900',
    marginHorizontal: 10,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
    backgroundColor: C.background,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  continueButton: {
    minHeight: 58,
    borderRadius: 22,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  continueButtonDisabled: {
    backgroundColor: C.backgroundSelected,
    borderWidth: 1,
    borderColor: C.border,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  continueButtonTextDisabled: {
    color: C.textSecondary,
  },
  disabledHint: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 9,
  },
});
