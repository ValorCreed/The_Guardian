import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BarChart3, Database, FileLock2, ShieldCheck, Users, Bug, Trash2 } from 'lucide-react-native';

import { useAppTheme } from '../context/ThemeContext';
import { hapticLight } from '../utils/haptics';

type PolicySection = {
  icon: React.ReactNode;
  title: string;
  body: string;
};

export default function PrivacyPolicyScreen() {
  const { colors: C, isDark } = useAppTheme();
  const styles = makeStyles(C);

  const sections: PolicySection[] = [
    {
      icon: <ShieldCheck size={20} color={C.primary} />,
      title: 'What The Guardian protects',
      body: 'The Guardian helps you store passwords, cards, documents, secure notes, emergency access contacts, family sharing settings, trusted devices, security alerts, backups, and subscription information.',
    },
    {
      icon: <FileLock2 size={20} color={C.primary} />,
      title: 'Vault encryption',
      body: 'Sensitive vault values are encrypted before storage. Documents are encrypted by the backend before they are stored in private object storage. The app should never include passwords, card numbers, secure note contents, or document contents in support reports.',
    },
    {
      icon: <Database size={20} color={C.primary} />,
      title: 'Data we store',
      body: 'We store account details such as your name, email, plan, device sessions, notification records, and vault metadata. Some data is stored locally on your device to support offline vault access and app preferences such as appearance, haptics, and auto-lock settings.',
    },
    {
      icon: <Users size={20} color={C.primary} />,
      title: 'Family sharing and emergency access',
      body: 'Family sharing and emergency access only expose the item types and vault records you explicitly allow. Shared users should only see the vault items they are permitted to access.',
    },
    {
      icon: <BarChart3 size={20} color={C.primary} />,
      title: 'Privacy-preserving analytics',
      body: 'The Guardian uses limited, always-on product analytics to improve reliability, security, and user experience. These events may include screen views, feature usage, plan-limit prompts, upload success or failure, API error categories, and bug report submission status. Analytics events are designed to be privacy-safe and must never include passwords, card numbers, CVVs, secure note contents, document contents, recovery codes, JWTs, encryption secrets, email addresses, or full names.',
    },
    {
      icon: <Bug size={20} color={C.primary} />,
      title: 'Bug reports',
      body: 'When you submit a bug report, we store the title, category, severity, description, reproduction steps, and optional diagnostic details. Do not include secret vault data in bug reports.',
    },
    {
      icon: <Trash2 size={20} color={C.primary} />,
      title: 'Deleting your data',
      body: 'You can delete your account from Settings. Account deletion is intended to remove your account and vault data from The Guardian services. Offline snapshots saved on a device can also be cleared from Settings.',
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>LEGAL</Text>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: July 2026</Text>

        {/* <View style={styles.noticeCard}>
          <Text style={styles.noticeText}>
            This policy is a practical in-app summary for The Guardian. Before public release, have a qualified legal professional review the final policy for your target countries and app stores.
          </Text>
        </View> */}

        {sections.map((section) => (
          <View key={section.title} style={styles.card}>
            <View style={styles.cardIcon}>{section.icon}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.body}>{section.body}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.footer}>
          For privacy questions or account deletion concerns, contact the project owner or use the bug report/support page inside the app.
        </Text>

        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.82}
          onPress={() => { hapticLight(); router.back(); }}
        >
          <Text style={styles.buttonText}>Back to Settings</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.background },
  scrollContent: { paddingHorizontal: 20, paddingTop: 112, paddingBottom: 150 },
  kicker: { color: C.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, marginBottom: 8 },
  title: { color: C.text, fontSize: 34, fontWeight: '900', letterSpacing: -0.7 },
  updated: { color: C.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 6, marginBottom: 20 },
  noticeCard: { backgroundColor: C.alertWarningBg, borderRadius: 22, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 18 },
  noticeText: { color: C.text, fontSize: 13, lineHeight: 20, fontWeight: '700' },
  card: { flexDirection: 'row', backgroundColor: C.backgroundElement, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 14 },
  cardIcon: { width: 42, height: 42, borderRadius: 16, backgroundColor: C.actionCard || C.backgroundSelected, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  sectionTitle: { color: C.text, fontSize: 16, fontWeight: '900', marginBottom: 5 },
  body: { color: C.textSecondary, fontSize: 13, lineHeight: 20, fontWeight: '600' },
  footer: { color: C.textSecondary, fontSize: 12, lineHeight: 19, fontWeight: '600', marginTop: 8, marginBottom: 16 },
  button: { height: 54, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
});
