import React from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Building2,
  Code2,
  Info,
  KeyRound,
  ShieldCheck,
  Smartphone,
  UsersRound,
} from 'lucide-react-native';

import { useAppTheme } from '../context/ThemeContext';
import GuardianLogoTile from '../components/GuardianLogoTitle';

const APP_VERSION = '4.0.0';

const Developers = [
  {
    name: 'Peprah Isaac Korankye',
    role: 'isaacpeprahkorankye@gmail.com',
  },
  {
    name: 'Kingswell Ampoti',
    role: 'kingsleyampoti4@gmail.com',
  },
  {
    name: 'Kelvin Obirigya',
    role: 'kelvinobirigya@gmail.com',
  },
  {
    name: 'Developer Four',
    role: 'UNKNOWN',
  },
  {
    name: 'Developer Five',
    role: 'UNKNOWN',
  },
];

export default function AboutScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <GuardianLogoTile
          size={86}
          logoSize={70}
          radius={28}
          style={styles.logoBox}
        />

        <Text style={styles.title}>About</Text>

        <Text style={styles.subtitle}>
          A private vault for your most important digital information.
        </Text>

        <View style={styles.versionCard}>
          <View style={styles.versionIcon}>
            <Info size={22} color={C.primary} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.versionLabel}>App version</Text>
            <Text style={styles.versionValue}>v{APP_VERSION}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>What it does</Text>

        <View style={styles.card}>
          <FeatureRow
            icon={<KeyRound size={21} color={C.primary} />}
            title="Password vault"
            subtitle="Save and manage login credentials securely."
            styles={styles}
          />

          <View style={styles.divider} />

          <FeatureRow
            icon={<Smartphone size={21} color={C.primary} />}
            title="Cards and documents"
            subtitle="Store important card and document details in your vault."
            styles={styles}
          />

          <View style={styles.divider} />

          <FeatureRow
            icon={<UsersRound size={21} color={C.primary} />}
            title="Family sharing"
            subtitle="Family Plan users can share selected vault items with trusted members."
            styles={styles}
          />

          <View style={styles.divider} />

          <FeatureRow
            icon={<ShieldCheck size={21} color={C.primary} />}
            title="Security focused"
            subtitle="Built with authentication, encryption, biometrics, auto-lock features and other security measures to protect your data."
            styles={styles}
          />
        </View>

        <Text style={styles.sectionLabel}>Company</Text>

        <View style={styles.companyCard}>
          <View style={styles.companyIcon}>
            <Building2 size={24} color={C.primary} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.companyName}>TheGuardian.LLC</Text>
            <Text style={styles.companyText}>
              Product design, mobile development, backend development, and
              a security focused organization.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Developers</Text>

        <View style={styles.card}>
          {Developers.map((developer, index) => (
            <View key={`${developer.name}-${developer.role}`}>
              <View style={styles.developerRow}>
                <View style={styles.developerIcon}>
                  <Code2 size={19} color={C.primary} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.developerName}>{developer.name}</Text>
                  <Text style={styles.developerRole}>{developer.role}</Text>
                </View>
              </View>

              {index !== Developers.length - 1 && (
                <View style={styles.divider} />
              )}
            </View>
          ))}
        </View>

        <Text style={styles.footerText}>
          © 2026 TheGuardian LLC. All rights reserved.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureRow({
  icon,
  title,
  subtitle,
  styles,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  styles: any;
}) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIcon}>{icon}</View>

      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureSubtitle}>{subtitle}</Text>
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

    scrollContent: {
      paddingHorizontal: 18,
      paddingTop: 92,
      paddingBottom: 140,
    },

    logoBox: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },

      marginBottom: 20,
    },

    title: {
      fontSize: 34,
      fontWeight: '900',
      color: C.text,
      marginBottom: 10,
    },

    subtitle: {
      fontSize: 15,
      color: C.textSecondary,
      lineHeight: 23,
      marginBottom: 22,
    },

    versionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 26,
    
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},

    versionIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },

    versionLabel: {
      color: C.textSecondary,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 3,
    },

    versionValue: {
      color: C.text,
      fontSize: 18,
      fontWeight: '900',
    },

    sectionLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: C.textSecondary,
      letterSpacing: 0.6,
      marginLeft: 4,
      marginBottom: 8,
      marginTop: 4,
    },

    card: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: 24,
    
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},

    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },

    featureIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },

    featureTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: '800',
      marginBottom: 3,
    },

    featureSubtitle: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },

    divider: {
      height: 1,
      backgroundColor: C.border,
      marginLeft: 72,
    },

    companyCard: {
      flexDirection: 'row',
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 24,
    
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},

    companyIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },

    companyName: {
      color: C.text,
      fontSize: 18,
      fontWeight: '900',
      marginBottom: 5,
    },

    companyText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 20,
    },

    developerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },

    developerIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },

    developerName: {
      color: C.text,
      fontSize: 15,
      fontWeight: '800',
    },

    developerRole: {
      color: C.textSecondary,
      fontSize: 12,
      marginTop: 2,
      fontWeight: '600',
    },

    footerText: {
      color: C.textSecondary,
      textAlign: 'center',
      fontSize: 12,
      lineHeight: 18,
      marginTop: 2,
    },
  });