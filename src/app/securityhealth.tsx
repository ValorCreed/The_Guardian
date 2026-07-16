import React from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import { SecurityIssue, useSecurityScore } from '../hooks/useSecurityScore';

function issueIcon(type: SecurityIssue['type']) {
  if (type === 'RECOVERY_KIT_MISSING') return 'alert-circle-outline';
  if (type === 'WEAK' || type === 'SHARED_WEAK') return 'warning-outline';
  if (type === 'MEDIUM' || type === 'SHARED_MEDIUM') return 'alert-circle-outline';
  if (type === 'BREACHED_PASSWORD' || type === 'SHARED_BREACHED_PASSWORD') return 'skull-outline';
  if (type === 'REUSED' || type === 'SHARED_REUSED') return 'copy-outline';
  if (type === 'OLD' || type === 'SHARED_OLD') return 'time-outline';
  if (type === 'MISSING_USERNAME' || type === 'MISSING_WEBSITE') return 'create-outline';
  if (type === 'TWO_FACTOR_OFF') return 'keypad-outline';
  if (type === 'EMAIL_UNVERIFIED') return 'mail-unread-outline';
  if (type === 'BACKUP_NEEDED') return 'cloud-upload-outline';
  return 'shield-outline';
}

function severityColor(issue: SecurityIssue, C: any) {
  if (issue.severity === 'danger') return C.danger;
  if (issue.severity === 'warning') return C.warning;
  return C.info || C.primary;
}

function severityBg(issue: SecurityIssue, C: any) {
  if (issue.severity === 'danger') return C.alertDangerBg;
  if (issue.severity === 'warning') return C.alertWarningBg;
  return C.backgroundSelected;
}

export default function SecurityHealthScreen() {
  const { colors: C, isDark } = useAppTheme();
  const styles = makeStyles(C);
  const { report, loading, reload } = useSecurityScore();

  const visibleIssues = report.isPremiumOrFamily ? report.issues : report.freeIssues;
  const lockedCount = report.isPremiumOrFamily ? 0 : report.premiumIssues.length;

  const openIssue = (issue: SecurityIssue) => {
    if (issue.premiumOnly && !report.isPremiumOrFamily) {
      Alert.alert(
        'Premium security scan',
        'Upgrade to Premium or Family to view reused password and old password details.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'View plans', onPress: () => router.push('/subscription?from=securityhealth') },
        ]
      );
      return;
    }

    if (issue.source === 'SHARED_FAMILY' && issue.itemId) {
      router.push({
        pathname: '/sharedvaultdetails',
        params: {
          id: String(issue.itemId),
          type: 'PASSWORD',
          source: 'securityhealth',
        },
      });
      return;
    }

    if (issue.itemId) {
      router.push({
        pathname: '/vaultdetails',
        params: {
          id: String(issue.itemId),
          type: 'PASSWORD',
          source: 'securityhealth',
        },
      });
      return;
    }

    if (issue.type === 'TWO_FACTOR_OFF') {
      router.push('/twofasetup');
      return;
    }

    if (issue.type === 'EMAIL_UNVERIFIED') {
      router.push('/userinfo');
      return;
    }

    if (issue.type === 'RECOVERY_KIT_MISSING') {
      router.push('/recoverykit');
      return;
    }

    if (issue.type === 'BACKUP_NEEDED') {
      router.push('/backup');
      return;
    }

    if (issue.actionRoute) {
      const route = issue.actionRoute === '/twofactor' ? '/twofasetup' : issue.actionRoute;
      router.push(route as any);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={C.primary} colors={[C.primary]} />}
      >
        <Text style={styles.eyebrow}>Full vault scan</Text>
        <Text style={styles.title}>Security Health Center</Text>
        <Text style={styles.subtitle}>Find weak, breached, reused, old, missing, recovery, and family-shared password risks that reduce your security score.</Text>

        <View style={styles.scoreCard}>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreNumber}>{report.score}</Text>
            <Text style={styles.scoreLabel}>Score</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.scoreTitle}>{report.score >= 80 ? 'Strong protection' : report.score >= 50 ? 'Some risks found' : 'Needs attention'}</Text>
            <Text style={styles.scoreSub}>{report.totalPasswords} owned · {report.totalSharedPasswords} family · {report.issues.length} recommendations</Text>
            <Text style={styles.planText}>{report.plan} scan</Text>
          </View>
        </View>

        <View style={styles.metricsGrid}>
          <Metric label="Breached" value={report.breachedCount || 0} C={C} icon="skull-outline" locked={!report.isPremiumOrFamily} />
          <Metric label="Weak" value={report.weakCount} C={C} icon="warning-outline" />
          <Metric label="Reused" value={report.reusedCount} C={C} icon="copy-outline" locked={!report.isPremiumOrFamily} />
          <Metric label="Old" value={report.oldCount} C={C} icon="time-outline" locked={!report.isPremiumOrFamily} />
        </View>

        {!report.isPremiumOrFamily && (
          <TouchableOpacity style={styles.upgradeCard} activeOpacity={0.86} onPress={() => router.push('/subscription?from=securityhealth')}>
            <Ionicons name="lock-closed-outline" size={22} color={C.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.upgradeTitle}>Unlock advanced scan</Text>
              <Text style={styles.upgradeText}>Premium shows breached passwords, reused passwords, old passwords, deeper issue details, and the full fix list.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.warning} />
          </TouchableOpacity>
        )}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Recommended fixes</Text>
          {loading && <ActivityIndicator color={C.primary} />}
        </View>

        <View style={styles.card}>
          {visibleIssues.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="shield-checkmark-outline" size={34} color={C.success} />
              <Text style={styles.emptyTitle}>No visible issues found</Text>
              <Text style={styles.emptyText}>Your current scan does not show any available fixes for this plan.</Text>
            </View>
          ) : (
            visibleIssues.map((issue, index) => {
              const color = severityColor(issue, C);
              const bg = severityBg(issue, C);

              return (
                <TouchableOpacity key={String(issue.id)} style={[styles.issueRow, index !== visibleIssues.length - 1 && styles.divider]} activeOpacity={0.76} onPress={() => openIssue(issue)}>
                  <View style={[styles.issueIcon, { backgroundColor: bg }]}>
                    <Ionicons name={issueIcon(issue.type) as any} size={19} color={color} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.issueTitleRow}>
                      <Text style={styles.issueTitle}>{issue.title}</Text>
                      {issue.premiumOnly && <Ionicons name="lock-closed-outline" size={13} color={C.warning} />}
                    </View>
                    <Text style={styles.issueSub}>{issue.subtitle}</Text>
                    <Text style={styles.fixText}>{issue.itemId ? 'Open and fix item' : 'Open setting'}</Text>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {lockedCount > 0 && (
          <View style={styles.lockedCard}>
            <Ionicons name="lock-closed-outline" size={20} color={C.warning} />
            <Text style={styles.lockedText}>{lockedCount} advanced issue{lockedCount === 1 ? '' : 's'} hidden on Free plan, including breach monitoring.</Text>
          </View>
        )}

        {report.isPremiumOrFamily && report.breachCheckFailed > 0 && (
          <View style={styles.lockedCard}>
            <Ionicons name="wifi-outline" size={20} color={C.warning} />
            <Text style={styles.lockedText}>Some breach checks could not complete. Pull down to scan again when your connection is stable.</Text>
          </View>
        )}

        <TouchableOpacity style={styles.generatorButton} onPress={() => router.push('/passwordgenerator')} activeOpacity={0.86}>
          <Ionicons name="sparkles-outline" size={20} color="#fff" />
          <Text style={styles.generatorButtonText}>Generate stronger password</Text>
        </TouchableOpacity>

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value, icon, C, locked = false }: { label: string; value: number; icon: string; C: any; locked?: boolean }) {
  return (
    <View style={{ width: '48%', backgroundColor: C.backgroundElement, borderRadius: 18, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
      <Ionicons name={(locked ? 'lock-closed-outline' : icon) as any} size={22} color={locked ? C.warning : C.primary} />
      <Text style={{ color: C.text, fontSize: 21, fontWeight: '900', marginTop: 6 }}>{locked ? '—' : value}</Text>
      <Text style={{ color: C.textSecondary, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    content: { paddingHorizontal: 18, paddingTop: 96, paddingBottom: 130 },
    eyebrow: { color: C.textSecondary, fontSize: 13, fontWeight: '700' },
    title: { color: C.text, fontSize: 30, fontWeight: '900', marginTop: 2 },
    subtitle: { color: C.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 },
    scoreCard: { backgroundColor: C.backgroundElement, borderRadius: 24, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 1, borderColor: C.border, marginBottom: 14 },
    scoreCircle: { width: 82, height: 82, borderRadius: 41, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center' },
    scoreNumber: { color: C.primary, fontSize: 28, fontWeight: '900' },
    scoreLabel: { color: C.textSecondary, fontSize: 11, fontWeight: '800' },
    scoreTitle: { color: C.text, fontSize: 17, fontWeight: '900' },
    scoreSub: { color: C.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
    planText: { color: C.primary, fontSize: 12, fontWeight: '900', marginTop: 6 },
    metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
    upgradeCard: { backgroundColor: C.securityScoreBg, borderWidth: 1, borderColor: C.warning, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
    upgradeTitle: { color: C.warning, fontWeight: '900', fontSize: 14 },
    upgradeText: { color: C.warning, fontSize: 12, lineHeight: 17, marginTop: 2 },
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    sectionTitle: { color: C.text, fontSize: 18, fontWeight: '900' },
    card: { backgroundColor: C.backgroundElement, borderRadius: 20, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 14 },
    issueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
    divider: { borderBottomWidth: 1, borderBottomColor: C.border },
    issueIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    issueTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    issueTitle: { flex: 1, color: C.text, fontSize: 15, fontWeight: '900' },
    issueSub: { color: C.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
    fixText: { color: C.primary, fontSize: 12, fontWeight: '900', marginTop: 6 },
    emptyBox: { alignItems: 'center', padding: 22 },
    emptyTitle: { color: C.text, fontSize: 16, fontWeight: '900', marginTop: 8 },
    emptyText: { color: C.textSecondary, textAlign: 'center', fontSize: 13, lineHeight: 18, marginTop: 4 },
    lockedCard: { backgroundColor: C.securityScoreBg, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    lockedText: { flex: 1, color: C.warning, fontWeight: '800', fontSize: 13 },
    generatorButton: { backgroundColor: C.backgroundbutton, minHeight: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
    generatorButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  });
