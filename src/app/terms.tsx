import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AlertTriangle, CreditCard, FileText, ShieldCheck, Users, Zap } from 'lucide-react-native';

import { useAppTheme } from '../context/ThemeContext';
import { hapticLight } from '../utils/haptics';

type TermsSection = {
  icon: React.ReactNode;
  title: string;
  body: string;
};

export default function TermsOfServiceScreen() {
  const { colors: C, isDark } = useAppTheme();
  const styles = makeStyles(C);

  const sections: TermsSection[] = [
    {
      icon: <ShieldCheck size={20} color={C.primary} />,
      title: 'Use The Guardian responsibly',
      body: 'You are responsible for keeping your login details, recovery kit, device access, and shared-vault permissions safe. Do not store or share content that you do not have the right to store.',
    },
    {
      icon: <AlertTriangle size={20} color={C.warning} />,
      title: 'No perfect-security guarantee',
      body: 'The Guardian is designed to improve security, but no app, network, device, or storage system can guarantee perfect security. Use strong device security, enable 2FA, and keep a recovery kit offline.',
    },
    {
      icon: <Users size={20} color={C.primary} />,
      title: 'Family and emergency access',
      body: 'When you share vault access, you are responsible for choosing trusted people and deciding which item types they can access. Emergency access is a safety feature and should be configured carefully.',
    },
    {
      icon: <CreditCard size={20} color={C.primary} />,
      title: 'Subscriptions',
      body: 'Premium and Family features may require an active subscription. Plan limits, feature access, and billing behavior may change as the app develops.',
    },
    {
      icon: <Zap size={20} color={C.primary} />,
      title: 'Acceptable use',
      body: 'Do not misuse The Guardian, attack the service, attempt to access other users’ data, upload malicious files, or use the app for illegal activities.',
    },
    {
      icon: <FileText size={20} color={C.primary} />,
      title: 'Changes to these terms',
      body: 'The terms may be updated as the app evolves. Continued use of The Guardian after changes means you accept the updated terms.',
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>LEGAL</Text>
        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.updated}>Last updated: July 2026</Text>

        {/* <View style={styles.noticeCard}>
          <Text style={styles.noticeText}>
            This is a starter Terms of Service page for your project. For production use, have a qualified legal professional review it.
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

        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.82}
          onPress={() => { hapticLight(); router.back(); }}
        >
          <Text style={styles.buttonText}>Done</Text>
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
  button: { height: 54, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
});
