import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import { SecurityIssue, useSecurityScore } from '../hooks/useSecurityScore';
import { hapticLight, hapticMedium, hapticSelection, hapticWarning } from '../utils/haptics';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RADIUS = 74;
const STROKE = 11;
const SIZE = 188;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getScoreColor(score: number, C: any) {
  if (score >= 80) return C.success;
  if (score >= 55) return C.warning;
  return C.danger;
}

function getScoreCopy(score: number) {
  if (score >= 85) return 'Excellent protection';
  if (score >= 70) return 'Good, but keep improving';
  if (score >= 50) return 'Needs attention';
  return 'High-risk vault';
}

function issueIcon(type: SecurityIssue['type']) {
  if (type === 'RECOVERY_KIT_MISSING') return 'alert-circle-outline';
  if (type === 'WEAK' || type === 'SHARED_WEAK' || type === 'FAMILY_MEMBER_WEAK') return 'warning-outline';
  if (type === 'MEDIUM' || type === 'SHARED_MEDIUM' || type === 'FAMILY_MEMBER_MEDIUM') return 'alert-circle-outline';
  if (type === 'BREACHED_PASSWORD' || type === 'SHARED_BREACHED_PASSWORD') return 'skull-outline';
  if (type === 'REUSED' || type === 'SHARED_REUSED' || type === 'FAMILY_MEMBER_REUSED') return 'copy-outline';
  if (type === 'OLD' || type === 'SHARED_OLD' || type === 'FAMILY_MEMBER_OLD') return 'time-outline';
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

type IssueGroup = 'all' | 'owned' | 'shared' | 'danger' | 'warning';

function isSharedSecurityIssue(issue: SecurityIssue) {
  return issue.source === 'SHARED_FAMILY' || String(issue.type).startsWith('SHARED_') || String(issue.type).startsWith('FAMILY_MEMBER_');
}

function pluralizeIssue(count: number) {
  return count === 1 ? 'issue' : 'issues';
}

function getIssueGroupCopy(group: IssueGroup) {
  if (group === 'owned') {
    return {
      title: 'Owned vault warnings',
      subtitle: 'Password issues from your own vault items',
      emptyTitle: 'No owned password warnings',
      emptyText: 'Your own saved logins do not currently have major score-lowering issues.',
    };
  }

  if (group === 'shared') {
    return {
      title: 'Family shared warnings',
      subtitle: 'Weak or risky passwords shared with you or detected in your Family group',
      emptyTitle: 'No family password warnings',
      emptyText: 'No shared or family-member passwords are currently reducing your score.',
    };
  }

  if (group === 'danger') {
    return {
      title: 'Critical fixes',
      subtitle: 'High-risk issues that reduce your vault score the most',
      emptyTitle: 'No critical issues found',
      emptyText: 'You do not currently have critical vault risks.',
    };
  }

  if (group === 'warning') {
    return {
      title: 'Warning fixes',
      subtitle: 'Medium-priority issues that still affect your score',
      emptyTitle: 'No warning issues found',
      emptyText: 'You do not currently have medium-priority warnings.',
    };
  }

  return {
    title: 'Priority fixes',
    subtitle: 'Issues that affect the security score',
    emptyTitle: 'No major issues found',
    emptyText: 'Keep using strong unique passwords and maintain a recent recovery kit.',
  };
}


const ScoreRing = ({ C, score, loading }: { C: any; score: number; loading: boolean }) => {
  const animatedScore = useRef(new Animated.Value(score)).current;
  const [displayScore, setDisplayScore] = useState(score);

  useEffect(() => {
    const listener = animatedScore.addListener(({ value }) => {
      setDisplayScore(Math.round(value));
    });

    return () => animatedScore.removeListener(listener);
  }, [animatedScore]);

  useEffect(() => {
    Animated.timing(animatedScore, {
      toValue: Math.max(0, Math.min(score, 100)),
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animatedScore, score]);

  const animatedDashOffset = animatedScore.interpolate({
    inputRange: [0, 100],
    outputRange: [CIRCUMFERENCE, 0],
    extrapolate: 'clamp',
  });

  const scoreColor = getScoreColor(score, C);

  return (
    <View style={inlineStyles.ringWrapper}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={C.border}
          strokeWidth={STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={scoreColor}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE}`}
          strokeDashoffset={animatedDashOffset as any}
          strokeLinecap="round"
          rotation="-90"
          origin={`${SIZE / 2}, ${SIZE / 2}`}
        />
      </Svg>

      <View style={inlineStyles.ringCenter}>
        <Text style={[inlineStyles.scoreText, { color: scoreColor }]}>{displayScore}</Text>
        <Text style={[inlineStyles.scoreLabel, { color: C.textSecondary }]}>
          {loading ? 'Updating' : 'Vault score'}
        </Text>
      </View>
    </View>
  );
};

export default function SecurityScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);
  const { report, loading, reload } = useSecurityScore();
  const scrollRef = useRef<ScrollView | null>(null);
  const [selectedIssueGroup, setSelectedIssueGroup] = useState<IssueGroup>('all');

  const dangerousIssues = report.issues.filter((issue) => issue.severity === 'danger').length;
  const warningIssues = report.issues.filter((issue) => issue.severity === 'warning').length;
  const ownedIssues = report.issues.filter((issue) => !isSharedSecurityIssue(issue) && issue.itemId).length;
  const sharedIssues = report.issues.filter((issue) => isSharedSecurityIssue(issue)).length;
  const totalFamilyLoginScope = (report.totalSharedPasswords || 0) + (report.totalFamilyMemberPasswords || 0);
  const recoveryMissing = report.issues.some((issue) => issue.type === 'RECOVERY_KIT_MISSING');

  const filteredIssues = report.issues.filter((issue) => {
    if (selectedIssueGroup === 'owned') return !isSharedSecurityIssue(issue) && Boolean(issue.itemId);
    if (selectedIssueGroup === 'shared') return isSharedSecurityIssue(issue);
    if (selectedIssueGroup === 'danger') return issue.severity === 'danger';
    if (selectedIssueGroup === 'warning') return issue.severity === 'warning';
    return true;
  });
  const visibleIssues = filteredIssues.slice(0, selectedIssueGroup === 'all' ? 4 : 12);
  const selectedGroupCopy = getIssueGroupCopy(selectedIssueGroup);

  const selectIssueGroup = (group: IssueGroup) => {
    hapticSelection();
    setSelectedIssueGroup(group);

    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 570, animated: true });
    }, 80);
  };

  const openIssue = (issue: SecurityIssue) => {
    issue.severity === 'danger' ? hapticWarning() : hapticLight();
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
          source: 'security',
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
      router.push(issue.actionRoute as any);
    }
  };

  const statCards: {
    icon: string;
    count: number;
    label: string;
    detail: string;
    group: IssueGroup;
  }[] = [
    {
      icon: 'key-outline',
      count: report.totalPasswords,
      label: 'Owned logins',
      detail: ownedIssues > 0 ? `${ownedIssues} ${pluralizeIssue(ownedIssues)} to review` : `${report.strongCount} strong`,
      group: 'owned',
    },
    {
      icon: 'people-outline',
      count: totalFamilyLoginScope,
      label: 'Family logins',
      detail: report.isPremiumOrFamily
        ? sharedIssues > 0
          ? `${sharedIssues} family ${pluralizeIssue(sharedIssues)}`
          : 'Included in score'
        : 'Premium check',
      group: 'shared',
    },
    {
      icon: 'alert-circle-outline',
      count: dangerousIssues,
      label: 'Critical issues',
      detail: dangerousIssues > 0 ? 'Tap to fix first' : 'None found',
      group: 'danger',
    },
    {
      icon: 'shield-half-outline',
      count: warningIssues,
      label: 'Warnings',
      detail: warningIssues > 0 ? 'Tap to review' : 'None found',
      group: 'warning',
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={reload}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>Security center</Text>
            <Text style={styles.title}>Vault protection</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => { hapticLight(); reload(); }} activeOpacity={0.85}>
            {loading ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              <Ionicons name="refresh" size={20} color={C.primary} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <ScoreRing C={C} score={report.score} loading={loading} />

          <View style={styles.heroTextBlock}>
            <Text style={styles.heroTitle}>{getScoreCopy(report.score)}</Text>
            <Text style={styles.heroSubtitle}>
              Your score is reduced by weak, reused, breached, old, missing, and account recovery risks in your vault and that of your family members.
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => { hapticMedium(); router.push('/securityhealth'); }}
              activeOpacity={0.88}
            >
              <Text style={styles.primaryButtonText}>View full health report</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {recoveryMissing && (
          <TouchableOpacity
            style={styles.recoveryWarningCard}
            activeOpacity={0.9}
            onPress={() => { hapticWarning(); router.push('/recoverykit'); }}
          >
            <View style={styles.recoveryIcon}>
              <Ionicons name="warning-outline" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.flexibleTextBlock}>
              <Text style={styles.recoveryTitle}>Recovery kit missing</Text>
              <Text style={styles.recoveryText}>
                This is a serious safety risk. Generate your recovery kit before you lose access to your vault.
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color="#FFFFFF"
              style={styles.topAlignedChevron}
            />
          </TouchableOpacity>
        )}

        <View style={styles.statsGrid}>
          {statCards.map((card) => {
            const isSelected = selectedIssueGroup === card.group;

            return (
              <TouchableOpacity
                key={card.label}
                style={[styles.statCard, isSelected && styles.statCardActive]}
                activeOpacity={0.86}
                onPress={() => selectIssueGroup(card.group)}
              >
                <View style={styles.statIcon}>
                  <Ionicons name={card.icon as any} size={20} color={C.primary} />
                </View>
                <Text style={styles.statCount}>{card.count}</Text>
                <Text style={styles.statLabel}>{card.label}</Text>
                <View style={styles.statDetailRow}>
                  <Text style={styles.statDetail}>{card.detail}</Text>
                  <Ionicons name="chevron-down" size={13} color={C.textSecondary} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.sectionHeader}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.sectionTitle}>{selectedGroupCopy.title}</Text>
            <Text style={styles.sectionSubtitle}>{selectedGroupCopy.subtitle}</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              hapticLight();
              if (selectedIssueGroup !== 'all') {
                setSelectedIssueGroup('all');
                return;
              }

              router.push('/securityhealth');
            }}
          >
            <Text style={styles.sectionLink}>{selectedIssueGroup === 'all' ? 'See all' : 'Clear'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.issueList}>
          {visibleIssues.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="shield-checkmark-outline" size={30} color={C.success} />
              <Text style={styles.emptyTitle}>{selectedGroupCopy.emptyTitle}</Text>
              <Text style={styles.emptyText}>{selectedGroupCopy.emptyText}</Text>
            </View>
          ) : (
            visibleIssues.map((issue) => {
              const color = severityColor(issue, C);
              return (
                <TouchableOpacity
                  key={String(issue.id)}
                  style={styles.issueCard}
                  activeOpacity={0.85}
                  onPress={() => openIssue(issue)}
                >
                  <View style={[styles.issueIcon, { backgroundColor: `${color}22` }]}> 
                    <Ionicons name={issueIcon(issue.type) as any} size={19} color={color} />
                  </View>
                  <View style={styles.flexibleTextBlock}>
                    <Text style={styles.issueTitle}>{issue.title}</Text>
                    <Text style={styles.issueSubtitle}>{issue.subtitle}</Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={C.textSecondary}
                    style={styles.topAlignedChevron}
                  />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={styles.actionGrid}>
          <TouchableOpacity style={styles.actionCard} onPress={() => { hapticLight(); router.push('/twofasetup'); }} activeOpacity={0.88}>
            <Ionicons name="keypad-outline" size={23} color={C.primary} />
            <Text style={styles.actionTitle}>Two-factor auth</Text>
            <Text style={styles.actionText}>Protect login with a second step.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => { hapticWarning(); router.push('/recoverykit'); }} activeOpacity={0.88}>
            <Ionicons name="medkit-outline" size={23} color={C.primary} />
            <Text style={styles.actionTitle}>Recovery kit</Text>
            <Text style={styles.actionText}>Prepare for emergency recovery.</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const inlineStyles = StyleSheet.create({
  ringWrapper: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  scoreLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: -2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});

function makeStyles(C: any) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 170,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
    },
    eyebrow: {
      fontSize: 12,
      color: C.primary,
      fontWeight: '900',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
    },
    title: {
      color: C.text,
      fontSize: 30,
      fontWeight: '900',
      marginTop: 2,
      letterSpacing: -0.7,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 16,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    heroCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 30,
      padding: 18,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: 16,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    heroGlow: {
      position: 'absolute',
      right: -70,
      top: -70,
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: C.primaryLight || `${C.primary}18`,
    },
    heroTextBlock: {
      marginTop: 6,
    },
    heroTitle: {
      color: C.text,
      fontSize: 24,
      fontWeight: '900',
      letterSpacing: -0.4,
    },
    heroSubtitle: {
      marginTop: 8,
      color: C.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      fontWeight: '600',
    },
    primaryButton: {
      marginTop: 16,
      backgroundColor: C.primary,
      minHeight: 50,
      borderRadius: 18,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
    },
    recoveryWarningCard: {
      backgroundColor: C.danger,
      borderRadius: 24,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    recoveryIcon: {
      width: 48,
      height: 48,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    recoveryTitle: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '900',
      flexWrap: 'wrap',
    },
    recoveryText: {
      color: 'rgba(255,255,255,0.88)',
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
      marginTop: 3,
      flexWrap: 'wrap',
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 20,
    },
    statCard: {
      width: '48%',
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 15,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    statCardActive: {
      borderColor: C.primary,
      backgroundColor: C.primaryLight || C.backgroundElement,
    },
    statIcon: {
      width: 38,
      height: 38,
      borderRadius: 14,
      backgroundColor: C.actionCard || C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    statCount: {
      color: C.text,
      fontSize: 24,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    statLabel: {
      color: C.text,
      fontSize: 13,
      fontWeight: '900',
      marginTop: 2,
      flexWrap: 'wrap',
    },
    statDetailRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 4,
      marginTop: 3,
    },
    statDetail: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '800',
      flex: 1,
      minWidth: 0,
      flexWrap: 'wrap',
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginBottom: 12,
    },
    sectionTitle: {
      color: C.text,
      fontSize: 19,
      fontWeight: '900',
    },
    sectionSubtitle: {
      color: C.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 2,
    },
    sectionLink: {
      color: C.primary,
      fontSize: 13,
      fontWeight: '900',
    },
    issueList: {
      gap: 10,
      marginBottom: 18,
    },
    issueCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      padding: 14,
      borderWidth: 1,
      borderColor: C.border,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    issueIcon: {
      width: 42,
      height: 42,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    flexibleTextBlock: {
      flex: 1,
      minWidth: 0,
    },
    topAlignedChevron: {
      marginTop: 3,
      flexShrink: 0,
    },
    issueTitle: {
      color: C.text,
      fontSize: 14,
      fontWeight: '900',
      flexWrap: 'wrap',
    },
    issueSubtitle: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      marginTop: 3,
      flexWrap: 'wrap',
    },
    emptyCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 22,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    emptyTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: '900',
      marginTop: 8,
    },
    emptyText: {
      color: C.textSecondary,
      textAlign: 'center',
      fontSize: 13,
      lineHeight: 19,
      marginTop: 5,
      fontWeight: '600',
    },
    actionGrid: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    actionCard: {
      flex: 1,
      minWidth: 0,
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    actionTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: '900',
      marginTop: 12,
    },
    actionText: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      marginTop: 5,
    },
  });
}