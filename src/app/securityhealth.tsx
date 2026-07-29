import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import type { ThemePalette } from '../constants/theme';
import { SecurityIssue, useSecurityScore } from '../hooks/useSecurityScore';
import SecurityIssueModal from '../components/SecurityIssueModal';
import { isScreenRequestCancelled, useCancelableRequest } from '../hooks/useCancelableApi';
import { hapticLight, hapticSelection } from '../utils/haptics';

type HealthIssueGroup = 'all' | 'breached' | 'weak' | 'reused' | 'old';

function issueMatchesGroup(issue: SecurityIssue, group: HealthIssueGroup) {
  const type = String(issue.type);

  if (group === 'breached') {
    return type === 'BREACHED_PASSWORD' || type === 'SHARED_BREACHED_PASSWORD';
  }

  if (group === 'weak') {
    return (
      type === 'WEAK' ||
      type === 'SHARED_WEAK' ||
      type === 'FAMILY_MEMBER_WEAK' ||
      type === 'MEDIUM' ||
      type === 'SHARED_MEDIUM' ||
      type === 'FAMILY_MEMBER_MEDIUM'
    );
  }

  if (group === 'reused') {
    return type === 'REUSED' || type === 'SHARED_REUSED' || type === 'FAMILY_MEMBER_REUSED';
  }

  if (group === 'old') {
    return type === 'OLD' || type === 'SHARED_OLD' || type === 'FAMILY_MEMBER_OLD';
  }

  return true;
}

function groupTitle(group: HealthIssueGroup) {
  if (group === 'breached') return 'Breached passwords';
  if (group === 'weak') return 'Weak passwords';
  if (group === 'reused') return 'Reused passwords';
  if (group === 'old') return 'Old passwords';
  return 'Recommended fixes';
}

function scoreCopy(score: number) {
  if (score >= 80) return 'Strong protection';
  if (score >= 50) return 'Some risks found';
  return 'Needs attention';
}

export default function SecurityHealthScreen() {
  const runCancelable = useCancelableRequest();
  const { colors: C, isDark } = useAppTheme();
  const styles = makeStyles(C);
  const { report, loading, syncing, reload } = useSecurityScore();
  const scoreUpdating = loading || syncing;
  const reloadSafely = () => {
    void Promise.resolve(runCancelable(() => reload())).catch((error) => {
      if (!isScreenRequestCancelled(error)) {
        console.log('SECURITY SCORE REFRESH ERROR:', error);
      }
    });
  };

  const visibleIssues = report.isPremiumOrFamily ? report.issues : report.freeIssues;
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<HealthIssueGroup>('all');
  const [lockedModal, setLockedModal] = useState(false);

  const modalIssues = lockedModal
    ? []
    : visibleIssues.filter((issue) => issueMatchesGroup(issue, selectedGroup));

  const openIssueGroup = (group: HealthIssueGroup, locked = false) => {
    hapticSelection();
    setSelectedGroup(group);
    setLockedModal(locked);
    setModalVisible(true);
  };

  const openIssue = (issue: SecurityIssue) => {
    if (issue.premiumOnly && !report.isPremiumOrFamily) {
      openIssueGroup('all', true);
      return;
    }

    hapticLight();

    if (String(issue.type).startsWith('FAMILY_MEMBER_')) {
      router.push('/family');
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

  const riskRows = [
    {
      group: 'breached' as HealthIssueGroup,
      label: 'Breached',
      value: report.breachedCount || 0,
      icon: 'skull-outline',
      color: C.danger,
      locked: !report.isPremiumOrFamily,
    },
    {
      group: 'weak' as HealthIssueGroup,
      label: 'Weak',
      value: report.weakCount,
      icon: 'warning-outline',
      color: C.warning,
      locked: false,
    },
    {
      group: 'reused' as HealthIssueGroup,
      label: 'Reused',
      value: report.reusedCount,
      icon: 'copy-outline',
      color: C.primary,
      locked: !report.isPremiumOrFamily,
    },
    {
      group: 'old' as HealthIssueGroup,
      label: 'Old',
      value: report.oldCount,
      icon: 'time-outline',
      color: C.textSecondary,
      locked: !report.isPremiumOrFamily,
    },
  ];

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
            refreshing={loading}
            onRefresh={reloadSafely}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        }
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Security health</Text>
            {/* <Text style={styles.subtitle}>Your password risk summary</Text> */}
          </View>
          {scoreUpdating && <ActivityIndicator color={C.primary} />}
        </View>

        <View style={styles.scoreCard}>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreNumber}>{report.score}</Text>
            <Text style={styles.scoreLabel}>{scoreUpdating ? 'UPDATING' : 'SCORE'}</Text>
          </View>

          <View style={styles.scoreCopy}>
            <View style={styles.planPill}>
              <Text style={styles.planText}>{report.plan}</Text>
            </View>
            <Text style={styles.scoreTitle}>{scoreCopy(report.score)}</Text>
            <Text style={styles.scoreSub}>
              {visibleIssues.length} {visibleIssues.length === 1 ? 'fix' : 'fixes'} available
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Password risks</Text>

        <View style={styles.riskCard}>
          {riskRows.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.riskRow,
                index !== riskRows.length - 1 && styles.riskDivider,
              ]}
              activeOpacity={0.8}
              onPress={() => openIssueGroup(item.group, item.locked)}
            >
              <View style={[styles.riskIcon, { backgroundColor: `${item.color}18` }]}>
                <Ionicons
                  name={(item.locked ? 'lock-closed-outline' : item.icon) as any}
                  size={20}
                  color={item.locked ? C.warning : item.color}
                />
              </View>

              <Text style={styles.riskLabel}>{item.label}</Text>

              <Text
                style={[
                  styles.riskValue,
                  { color: item.locked ? C.textSecondary : item.color },
                ]}
              >
                {item.locked ? '—' : item.value}
              </Text>

              <Ionicons
                name="chevron-forward"
                size={18}
                color={C.tabInactive}
              />
            </TouchableOpacity>
          ))}
        </View>

        {!report.isPremiumOrFamily && (
          <TouchableOpacity
            style={styles.upgradeCard}
            activeOpacity={0.86}
            onPress={() => router.push('/subscription?from=securityhealth')}
          >
            <View style={styles.upgradeIcon}>
              <Ionicons name="sparkles-outline" size={21} color={C.warning} />
            </View>
            <View style={styles.upgradeCopy}>
              <Text style={styles.upgradeTitle}>Unlock full scan</Text>
              <Text style={styles.upgradeText}>See breached, reused, and old passwords.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.warning} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.86}
          onPress={() => openIssueGroup('all')}
        >
          <Ionicons name="construct-outline" size={20} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Review fixes</Text>
          <View style={styles.primaryCount}>
            <Text style={styles.primaryCountText}>{visibleIssues.length}</Text>
          </View>
        </TouchableOpacity>

        {report.isPremiumOrFamily && report.breachCheckFailed > 0 && (
          <View style={styles.noticeCard}>
            <Ionicons name="wifi-outline" size={19} color={C.warning} />
            <Text style={styles.noticeText}>Some breach checks did not finish. Pull down to retry.</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/passwordgenerator')}
          activeOpacity={0.84}
        >
          <Ionicons name="sparkles-outline" size={19} color={C.primary} />
          <Text style={styles.secondaryButtonText}>Generate a stronger password</Text>
        </TouchableOpacity>
      </ScrollView>

      <SecurityIssueModal
        visible={modalVisible}
        title={lockedModal ? 'Advanced security scan' : groupTitle(selectedGroup)}
        issues={modalIssues}
        emptyTitle={`No ${groupTitle(selectedGroup).toLowerCase()} found`}
        emptyText="There is nothing to fix in this category."
        lockedMessage={
          lockedModal
            ? 'Premium or Family is required to view these password fixes.'
            : undefined
        }
        primaryActionLabel={lockedModal ? 'View plans' : undefined}
        onPrimaryAction={
          lockedModal
            ? () => router.push('/subscription?from=securityhealth')
            : undefined
        }
        onClose={() => setModalVisible(false)}
        onIssuePress={openIssue}
      />
    </SafeAreaView>
  );
}

const makeStyles = (C: ThemePalette) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 89,
      paddingBottom: 140,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
    },
    title: {
      color: C.text,
      fontSize: 30,
      fontWeight: '900',
      letterSpacing: -0.7,
    },
    subtitle: {
      color: C.textSecondary,
      fontSize: 13,
      fontWeight: '700',
      marginTop: 4,
    },
    scoreCard: {
      backgroundColor: C.primary,
      borderRadius: 28,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
      shadowColor: C.primary,
      shadowOpacity: 0.24,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
      elevation: 7,
    },
    scoreCircle: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    scoreNumber: {
      color: '#FFFFFF',
      fontSize: 30,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    scoreLabel: {
      color: 'rgba(255,255,255,0.70)',
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.7,
    },
    scoreCopy: {
      flex: 1,
      minWidth: 0,
    },
    planPill: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.16)',
      paddingHorizontal: 9,
      paddingVertical: 5,
      marginBottom: 9,
    },
    planText: {
      color: '#FFFFFF',
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.6,
    },
    scoreTitle: {
      color: '#FFFFFF',
      fontSize: 20,
      fontWeight: '900',
      lineHeight: 25,
    },
    scoreSub: {
      color: 'rgba(255,255,255,0.74)',
      fontSize: 12,
      fontWeight: '600',
      marginTop: 5,
    },
    sectionTitle: {
      color: C.text,
      fontSize: 17,
      fontWeight: '900',
      marginBottom: 10,
    },
    riskCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOpacity: 0.055,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 9 },
      elevation: 3,
    },
    riskRow: {
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingHorizontal: 14,
    },
    riskDivider: {
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    riskIcon: {
      width: 38,
      height: 38,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    riskLabel: {
      flex: 1,
      color: C.text,
      fontSize: 14,
      fontWeight: '800',
    },
    riskValue: {
      minWidth: 24,
      textAlign: 'right',
      fontSize: 16,
      fontWeight: '900',
    },
    upgradeCard: {
      backgroundColor: C.securityScoreBg,
      borderWidth: 1,
      borderColor: C.warning,
      borderRadius: 20,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      marginBottom: 16,
      shadowColor: C.warning,
      shadowOpacity: 0.14,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    upgradeIcon: {
      width: 40,
      height: 40,
      borderRadius: 15,
      backgroundColor: `${C.warning}18`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    upgradeCopy: {
      flex: 1,
      minWidth: 0,
    },
    upgradeTitle: {
      color: C.text,
      fontWeight: '900',
      fontSize: 14,
    },
    upgradeText: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
    },
    primaryButton: {
      minHeight: 56,
      backgroundColor: C.backgroundbutton,
      borderRadius: 19,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
      shadowColor: C.backgroundbutton,
      shadowOpacity: 0.20,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5,
    },
    primaryButtonText: {
      flex: 1,
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
    },
    primaryCount: {
      minWidth: 30,
      height: 30,
      borderRadius: 15,
      paddingHorizontal: 8,
      backgroundColor: 'rgba(255,255,255,0.17)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryCountText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '900',
    },
    noticeCard: {
      backgroundColor: C.securityScoreBg,
      borderRadius: 17,
      padding: 13,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: `${C.warning}55`,
      shadowColor: C.warning,
      shadowOpacity: 0.10,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    noticeText: {
      flex: 1,
      color: C.warning,
      fontWeight: '700',
      fontSize: 12,
      lineHeight: 17,
    },
    secondaryButton: {
      minHeight: 54,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.backgroundElement,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },
    secondaryButtonText: {
      color: C.text,
      fontSize: 14,
      fontWeight: '900',
    },
  });