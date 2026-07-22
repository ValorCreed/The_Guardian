import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { api } from '../services/api';
import { hapticToggleOff, hapticToggleOn } from '../utils/haptics';
import { useAppTheme } from '../context/ThemeContext';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';

type SecuritySettings = {
  emailVerified: boolean;
  twoFactorEnabled: boolean;
};

export default function TwoFactorSetupScreen() {
  const { colors: C, isDark } = useAppTheme();
  const styles = makeStyles(C);

  useSensitiveScreenProtection(true);

  const [settings, setSettings] = useState<SecuritySettings>({
    emailVerified: false,
    twoFactorEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadSettings = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);

      const response = await api.getSecuritySettings();
      setSettings({
        emailVerified: Boolean(response.emailVerified),
        twoFactorEnabled: Boolean(response.twoFactorEnabled),
      });
    } catch (error: any) {
      Alert.alert(
        'Could not load security settings',
        error.message || 'Please check your connection and try again.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings(true);
    }, [loadSettings])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSettings(false);
  };

  const toggleTwoFactor = async (enabled: boolean) => {
    if (saving) return;

    if (enabled && !settings.emailVerified) {
      Alert.alert(
        'Verify your email first',
        'You need to verify your email before turning on two-factor authentication.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Verify email', onPress: () => router.push('/verifyemail') },
        ]
      );
      return;
    }

    const actionText = enabled ? 'turn on' : 'turn off';

    Alert.alert(
      enabled ? 'Turn on 2FA?' : 'Turn off 2FA?',
      enabled
        ? 'Two-factor authentication will add an extra verification step when signing in.'
        : 'Turning off 2FA reduces your account protection. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: enabled ? 'Turn on' : 'Turn off',
          style: enabled ? 'default' : 'destructive',
          onPress: async () => {
            try {
              setSaving(true);

              const updated = await api.setTwoFactorEnabled(enabled);
              setSettings({
                emailVerified: Boolean(updated.emailVerified),
                twoFactorEnabled: Boolean(updated.twoFactorEnabled),
              });

              api.clearCache?.();

              Alert.alert(
                'Security updated',
                `Two-factor authentication has been ${enabled ? 'enabled' : 'disabled'}.`
              );
            } catch (error: any) {
              Alert.alert(
                `Could not ${actionText} 2FA`,
                error.message || 'Please try again.'
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={C.background}
        />

        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.loadingText}>Loading 2FA settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={C.background}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        }
      >
        <Text style={styles.eyebrow}>Account protection</Text>
        <Text style={styles.title}>Two-factor authentication</Text>
        <Text style={styles.subtitle}>
          Add another verification step when signing in to The Guardian.
        </Text>

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="keypad-outline" size={28} color={C.primary} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>
              {settings.twoFactorEnabled ? '2FA is enabled' : '2FA is not enabled'}
            </Text>
            <Text style={styles.heroSub}>
              {settings.twoFactorEnabled
                ? 'Your account requires an extra verification code during sign in.'
                : 'Turn this on to make your account harder to access without your permission.'}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Two-factor authentication</Text>
              <Text style={styles.rowSub}>
                Require a verification code when signing in.
              </Text>
            </View>

            {saving ? (
              <ActivityIndicator color={C.primary} />
            ) : (
              <Switch
                value={settings.twoFactorEnabled}
                onValueChange={(nextValue) => {
                  nextValue ? hapticToggleOn() : hapticToggleOff();
                  toggleTwoFactor(nextValue);
                }}
                trackColor={{ false: C.border, true: C.primary }}
                thumbColor="#fff"
                ios_backgroundColor={C.border}
              />
            )}
          </View>
        </View>

        {!settings.emailVerified && (
          <TouchableOpacity
            style={styles.warningCard}
            activeOpacity={0.85}
            onPress={() => router.push('/verifyemail')}
          >
            <Ionicons name="mail-unread-outline" size={22} color={C.warning} />

            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>Email verification required</Text>
              <Text style={styles.warningText}>
                Verify your email before enabling 2FA.
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color={C.warning} />
          </TouchableOpacity>
        )}

        <Text style={styles.sectionTitle}>How it protects you</Text>

        <View style={styles.card}>
          <InfoRow
            icon="shield-checkmark-outline"
            title="Extra sign-in protection"
            subtitle="A password alone will not be enough when 2FA is active."
            C={C}
            styles={styles}
          />
          <View style={styles.divider} />
          <InfoRow
            icon="alert-circle-outline"
            title="Better account recovery safety"
            subtitle="It reduces the chance of someone accessing your vault from another device."
            C={C}
            styles={styles}
          />
          <View style={styles.divider} />
          <InfoRow
            icon="lock-closed-outline"
            title="Recommended for all users"
            subtitle="Use 2FA together with a strong master password and biometric unlock."
            C={C}
            styles={styles}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  icon,
  title,
  subtitle,
  C,
  styles,
}: {
  icon: string;
  title: string;
  subtitle: string;
  C: any;
  styles: any;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon as any} size={19} color={C.primary} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoSub}>{subtitle}</Text>
      </View>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },

    loadingBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },

    loadingText: {
      color: C.textSecondary,
      marginTop: 12,
      fontSize: 15,
      fontWeight: '700',
    },

    content: {
      paddingHorizontal: 18,
      paddingTop: 96,
      paddingBottom: 130,
    },

    eyebrow: {
      color: C.textSecondary,
      fontSize: 13,
      fontWeight: '800',
    },

    title: {
      color: C.text,
      fontSize: 30,
      fontWeight: '900',
      marginTop: 2,
    },

    subtitle: {
      color: C.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 8,
      marginBottom: 18,
    },

    heroCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      padding: 18,
      flexDirection: 'row',
      gap: 14,
      alignItems: 'center',
      marginBottom: 18,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

    heroIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
    },

    heroTitle: {
      color: C.text,
      fontSize: 17,
      fontWeight: '900',
    },

    heroSub: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
    },

    card: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: 18,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
    },

    rowTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: '900',
    },

    rowSub: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 3,
    },

    warningCard: {
      backgroundColor: C.securityScoreBg,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.warning,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 20,
    
      shadowColor: '#000',
      shadowOpacity: 0.065,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 3,},

    warningTitle: {
      color: C.warning,
      fontSize: 14,
      fontWeight: '900',
    },

    warningText: {
      color: C.warning,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
      fontWeight: '700',
    },

    sectionTitle: {
      color: C.text,
      fontSize: 18,
      fontWeight: '900',
      marginBottom: 10,
    },

    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
    },

    infoIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
    },

    infoTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: '900',
    },

    infoSub: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 3,
    },

    divider: {
      height: 1,
      backgroundColor: C.border,
      marginLeft: 66,
    },
  });
