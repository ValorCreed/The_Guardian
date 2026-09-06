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
import type { ThemePalette } from '../constants/theme';
import { SecurityIssue, useSecurityScore } from '../hooks/useSecurityScore';
import {
  hapticLight,
  hapticMedium,
  hapticSelection,
  hapticWarning,
} from '../utils/haptics';
import SecurityIssueModal from '../components/SecurityIssueModal';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_SIZE = 138;
const RING_STROKE = 10;
const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type IssueGroup = 'all' | 'shared' | 'danger' | 'warning';

type ProtectionTool = {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  danger?: boolean;
};

type ProtectionGroup = {
  key: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  tools: ProtectionTool[];
};

function getScoreColor(score: number, C: ThemePalette) {
  if (score >= 80) return '#FFFFFF';
  if (score >= 55) return C.warning;
  return C.danger;
}

function getScoreCopy(score: number) {
  if (score >= 85) return 'Excellent protection';
  if (score >= 70) return 'Your vault is well protected';
  if (score >= 50) return 'A few risks need attention';
  return 'Your vault needs attention';
}

function isSharedSecurityIssue(issue: SecurityIssue) {
  return (
    issue.source === 'SHARED_FAMILY' ||
    String(issue.type).startsWith('SHARED_') ||
    String(issue.type).startsWith('FAMILY_MEMBER_')
  );
}

function getEstimatedScoreGain(issue: SecurityIssue) {
  switch (issue.type) {
    case 'BREACHED_PASSWORD':
    case 'SHARED_BREACHED_PASSWORD':
      return 18;
    case 'RECOVERY_KIT_MISSING':
      return 18;
    case 'WEAK':
    case 'SHARED_WEAK':
    case 'FAMILY_MEMBER_WEAK':
      return 10;
    case 'TWO_FACTOR_OFF':
      return 10;
    case 'EMAIL_UNVERIFIED':
      return 8;
    case 'REUSED':
    case 'SHARED_REUSED':
    case 'FAMILY_MEMBER_REUSED':
      return 7;
    case 'BACKUP_NEEDED':
      return 4;
    case 'MEDIUM':
    case 'SHARED_MEDIUM':
    case 'FAMILY_MEMBER_MEDIUM':
    case 'OLD':
    case 'SHARED_OLD':
    case 'FAMILY_MEMBER_OLD':
      return 3;
    case 'MISSING_WEBSITE':
    case 'MISSING_USERNAME':
      return 1;
    default:
      return 0;
  }
}

function getIssueGroupCopy(group: IssueGroup) {
  if (group === 'shared') {
    return {
      title: 'Family warnings',
      emptyTitle: 'No family warnings',
      emptyText: 'Shared and family passwords are not reducing your score.',
    };
  }

  if (group === 'danger') {
    return {
      title: 'Critical issues',
      emptyTitle: 'No critical issues',
      emptyText: 'Your vault has no critical risks right now.',
    };
  }

  if (group === 'warning') {
    return {
      title: 'Warnings',
      emptyTitle: 'No warnings',
      emptyText: 'There are no medium-priority warnings to fix.',
    };
  }

  return {
    title: 'All security issues',
    emptyTitle: 'No issues found',
    emptyText: 'Your vault does not have any current security issues.',
  };
}

function ScoreRing({ C, score, loading }: { C: ThemePalette; score: number; loading: boolean }) {
  const animatedScore = useRef(new Animated.Value(score)).current;
  const [displayScore, setDisplayScore] = useState(score);
  const lastDisplayedScore = useRef(score);
  const lastDisplayUpdateAt = useRef(0);

  useEffect(() => {
    const listener = animatedScore.addListener(({ value }) => {
      const rounded = Math.round(value);
      const now = Date.now();

      if (rounded === lastDisplayedScore.current || now - lastDisplayUpdateAt.current < 40) {
        return;
      }

      lastDisplayedScore.current = rounded;
      lastDisplayUpdateAt.current = now;
      setDisplayScore((current) => (current === rounded ? current : rounded));
    });

    return () => animatedScore.removeListener(listener);
  }, [animatedScore]);

  useEffect(() => {
    Animated.timing(animatedScore, {
      toValue: Math.max(0, Math.min(score, 100)),
      duration: 850,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animatedScore, score]);

  const dashOffset = animatedScore.interpolate({
    inputRange: [0, 100],
    outputRange: [RING_CIRCUMFERENCE, 0],
    extrapolate: 'clamp',
  });

  const scoreColor = getScoreColor(score, C);

  return (
    <View style={ringStyles.wrapper}>
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="rgba(255,255,255,0.20)"
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={scoreColor}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={`${RING_CIRCUMFERENCE}`}
          strokeDashoffset={dashOffset as any}
          strokeLinecap="round"
          rotation="-90"
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>

      <View style={ringStyles.center}>
        <Text style={ringStyles.score}>{displayScore}</Text>
        <Text style={ringStyles.label}>{loading ? 'Updating' : 'Score'}</Text>
      </View>
    </View>
  );
}


function SetupProgressBar({
  progress,
  syncing,
  C,
  styles,
}: {
  progress: number;
  syncing: boolean;
  C: ThemePalette;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    sweep.stopAnimation();
    sweep.setValue(0);

    if (!syncing || trackWidth <= 0) return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: 820,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(sweep, {
          toValue: 0,
          duration: 820,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ])
    );

    loop.start();

    return () => {
      loop.stop();
      sweep.stopAnimation();
      sweep.setValue(0);
    };
  }, [sweep, syncing, trackWidth]);

  const safeProgress = Math.max(0, Math.min(progress, 1));
  const sweepWidth = Math.max(54, Math.min(trackWidth * 0.36, 124));
  const translateX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-sweepWidth, trackWidth],
  });

  return (
    <View
      style={styles.setupProgressTrack}
      onLayout={(event) => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        setTrackWidth((current) => (current === nextWidth ? current : nextWidth));
      }}
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(safeProgress * 100),
      }}
    >
      <View
        style={[
          styles.setupProgressFill,
          { width: `${Math.round(safeProgress * 100)}%` },
        ]}
      />

      {syncing && trackWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.setupProgressSweep,
            {
              width: sweepWidth,
              backgroundColor: C.success,
              transform: [{ translateX }],
            },
          ]}
        />
      )}
    </View>
  );
}

export default function SecurityScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C, isDark);
  const { report, loading, updating: scoreUpdating, reload } = useSecurityScore();
  const [selectedIssueGroup, setSelectedIssueGroup] = useState<IssueGroup>('all');
  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [lockedIssueGroup, setLockedIssueGroup] = useState(false);

  const dangerousIssues = report.issues.filter((issue) => issue.severity === 'danger').length;
  const warningIssues = report.issues.filter((issue) => issue.severity === 'warning').length;
  const familyIssues = report.issues.filter(isSharedSecurityIssue).length;
  const familyIssuesLocked = !report.isPremiumOrFamily;
  const recoveryMissing = report.issues.some((issue) => issue.type === 'RECOVERY_KIT_MISSING');

  const setupItems = [
    {
      title: 'Verify account email',
      complete: Boolean(report.emailVerified),
      route: '/userinfo',
    },
    {
      title: 'Enable two-factor authentication',
      complete: Boolean(report.twoFactorEnabled),
      route: '/twofasetup',
    },
    {
      title: 'Create a recovery kit',
      complete: Boolean(report.recoveryKitCreated),
      route: '/recoverykit',
    },
  ];
  const completedSetupCount = setupItems.filter((item) => item.complete).length;
  const scoreRecommendations = [...report.issues]
    .map((issue) => ({ issue, gain: getEstimatedScoreGain(issue) }))
    .filter((item) => item.gain > 0)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 2);

  const filteredIssues = report.issues.filter((issue) => {
    if (selectedIssueGroup === 'shared') return isSharedSecurityIssue(issue);
    if (selectedIssueGroup === 'danger') return issue.severity === 'danger';
    if (selectedIssueGroup === 'warning') return issue.severity === 'warning';
    return true;
  });

  const selectedGroupCopy = getIssueGroupCopy(selectedIssueGroup);

  const selectIssueGroup = (group: IssueGroup, locked = false) => {
    hapticSelection();
    setSelectedIssueGroup(group);
    setLockedIssueGroup(locked);
    setIssueModalVisible(true);
  };

  const openIssue = (issue: SecurityIssue) => {
    if (issue.severity === 'danger') {
      hapticWarning();
    } else {
      hapticLight();
    }

    if (String(issue.type).startsWith('FAMILY_MEMBER_')) {
      router.push('/family');
      return;
    }

    if (issue.source === 'SHARED_FAMILY' && issue.itemId) {
      router.push({
        pathname: '/sharedvaultdetails',
        params: { id: String(issue.itemId), type: 'PASSWORD' },
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

    if (issue.actionRoute) router.push(issue.actionRoute as any);
  };

  const issueRows: {
    label: string;
    count: number;
    icon: string;
    group: IssueGroup;
    color: string;
    locked?: boolean;
  }[] = [
    {
      label: 'Critical',
      count: dangerousIssues,
      icon: 'alert-circle-outline',
      group: 'danger',
      color: C.danger,
    },
    {
      label: 'Warnings',
      count: warningIssues,
      icon: 'warning-outline',
      group: 'warning',
      color: C.warning,
    },
    {
      label: 'Family',
      count: familyIssues,
      icon: 'people-outline',
      group: 'shared',
      color: C.primary,
      locked: familyIssuesLocked,
    },
  ];

  const protectionGroups: ProtectionGroup[] = [
    {
      key: 'account',
      title: 'Sign-in & recovery',
      description: 'Sign-in and account recovery.',
      icon: 'shield-checkmark-outline' as const,
      tools: [
        {
          title: 'Two-factor authentication',
          description: report.twoFactorEnabled
            ? 'Enabled'
            : 'Add a second sign-in check',
          icon: 'keypad-outline' as const,
          route: '/twofasetup',
        },
        {
          title: 'Recovery Kit',
          description: report.recoveryKitCreated
            ? 'Ready'
            : 'Create an offline recovery option',
          icon: 'medkit-outline' as const,
          route: '/recoverykit',
        },
      ],
    },
    {
      key: 'continuity',
      title: 'Continuity',
      description: 'Trusted recovery and release plans.',
      icon: 'people-outline' as const,
      tools: [
        {
          title: 'Recovery Circle',
          description: 'Multi-person recovery approval',
          icon: 'people-circle-outline' as const,
          route: '/recoverycircle',
        },
        {
          title: 'Digital Estate Playbooks',
          description: 'Item-specific release instructions',
          icon: 'book-outline' as const,
          route: '/estateplaybooks',
        },
        {
          title: 'Continuity Drill',
          description: 'Test recovery readiness',
          icon: 'analytics-outline' as const,
          route: '/continuitydrill',
        },
      ],
    },
    {
      key: 'emergency',
      title: 'Emergency controls',
      description: 'Emergency and compromise controls.',
      icon: 'warning-outline' as const,
      tools: [
        {
          title: 'Guardian Safety Check',
          description: 'Scheduled check-ins and approved release',
          icon: 'pulse-outline' as const,
          route: '/safetycheck',
        },
        {
          title: 'Duress Mode',
          description: 'Coercion-safe decoy vault',
          icon: 'shield-half-outline' as const,
          route: '/duressmode',
        },
        {
          title: 'Incident Lockdown',
          description: 'Contain compromise and recover',
          icon: 'lock-closed-outline' as const,
          route: '/incidentlockdown',
          danger: true,
        },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
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
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Security center</Text>
            <Text style={styles.headerSub}>
              Review risks and essential protection tools.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              hapticLight();
              reload();
            }}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              <Ionicons name="refresh" size={20} color={C.primary} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />

          <View style={styles.heroTop}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>SECURITY STATUS</Text>
              <Text style={styles.heroTitle}>{getScoreCopy(report.score)}</Text>
              <Text style={styles.heroSubtitle}>
                {report.issues.length === 0
                  ? 'No action is needed right now.'
                  : `${report.issues.length} ${report.issues.length === 1 ? 'issue needs' : 'issues need'} review.`}
              </Text>
            </View>

            <ScoreRing C={C} score={report.score} loading={scoreUpdating} />
          </View>

          <TouchableOpacity
            style={styles.heroButton}
            onPress={() => {
              hapticMedium();
              router.push('/securityhealth');
            }}
            activeOpacity={0.88}
          >
            <Text style={styles.heroButtonText}>Open security health</Text>
            <Ionicons name="arrow-forward" size={17} color={C.primary} />
          </TouchableOpacity>
        </View>

        {recoveryMissing && (
          <TouchableOpacity
            style={styles.recoveryWarningCard}
            activeOpacity={0.9}
            onPress={() => {
              hapticWarning();
              router.push('/recoverykit');
            }}
          >
            <View style={styles.recoveryIcon}>
              <Ionicons name="warning-outline" size={21} color="#FFFFFF" />
            </View>
            <View style={styles.flexibleTextBlock}>
              <Text style={styles.recoveryTitle}>Recovery kit missing</Text>
              <Text style={styles.recoveryText}>Create one to protect account recovery.</Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Security setup</Text>
          <Text style={styles.setupProgress}>{completedSetupCount}/{setupItems.length}</Text>
        </View>

        <View style={styles.setupCard}>
          <SetupProgressBar
            progress={completedSetupCount / setupItems.length}
            syncing={scoreUpdating}
            C={C}
            styles={styles}
          />

          {setupItems.map((item, index) => (
            <TouchableOpacity
              key={item.title}
              style={[
                styles.setupRow,
                index !== setupItems.length - 1 && styles.setupRowDivider,
              ]}
              activeOpacity={0.82}
              onPress={() => {
                hapticLight();
                router.push(item.route as any);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.complete ? 'Complete' : 'Not complete'}`}
            >
              <View style={[styles.setupStatusIcon, item.complete && styles.setupStatusIconComplete]}>
                <Ionicons
                  name={item.complete ? 'checkmark' : 'ellipse-outline'}
                  size={18}
                  color={item.complete ? '#FFFFFF' : C.textSecondary}
                />
              </View>
              <Text style={styles.setupTitle}>{item.title}</Text>
              <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Issues to review</Text>
          <TouchableOpacity onPress={() => selectIssueGroup('all')} activeOpacity={0.75}>
            <Text style={styles.sectionAction}>View all</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.issueSummaryCard}>
          {issueRows.map((row, index) => (
            <TouchableOpacity
              key={row.label}
              style={[
                styles.issueRow,
                index !== issueRows.length - 1 && styles.issueRowDivider,
              ]}
              activeOpacity={0.8}
              onPress={() => selectIssueGroup(row.group, Boolean(row.locked))}
            >
              <View style={[styles.issueIcon, { backgroundColor: `${row.color}18` }]}>
                <Ionicons name={row.icon as any} size={20} color={row.color} />
                {row.locked && (
                  <View style={styles.issueLockBadge}>
                    <Ionicons name="lock-closed" size={9} color="#FFFFFF" />
                  </View>
                )}
              </View>
              <Text style={styles.issueLabel}>{row.label}</Text>
              {row.locked ? (
                <Ionicons name="lock-closed-outline" size={17} color={C.warning} />
              ) : (
                <Text
                  style={[
                    styles.issueCount,
                    { color: row.count > 0 ? row.color : C.textSecondary },
                  ]}
                >
                  {row.count}
                </Text>
              )}
              <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
            </TouchableOpacity>
          ))}
        </View>

        {scoreRecommendations.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionCopy}>
                <Text style={styles.sectionTitle}>Best ways to improve</Text>
                <Text style={styles.sectionIntro}>
                  Review what is wrong, then open the item to fix it.
                </Text>
              </View>
            </View>

            <View style={styles.recommendationCard}>
              {scoreRecommendations.map(({ issue, gain }, index) => (
                <TouchableOpacity
                  key={`recommendation-${issue.id}`}
                  style={[
                    styles.recommendationRow,
                    index !== scoreRecommendations.length - 1 && styles.setupRowDivider,
                  ]}
                  activeOpacity={0.82}
                  onPress={() => openIssue(issue)}
                  accessibilityRole="button"
                  accessibilityLabel={`${issue.title}. ${issue.subtitle}. Fixing this may add ${gain} points.`}
                >
                  <View style={styles.gainPill}>
                    <Text style={styles.gainText}>+{gain} points</Text>
                  </View>

                  <View style={styles.recommendationCopy}>
                    <Text style={styles.recommendationTitle}>
                      {issue.title}
                    </Text>
                    <Text style={styles.recommendationDescription}>
                      {issue.subtitle}
                    </Text>
                  </View>

                  <Ionicons
                    name="arrow-forward"
                    size={17}
                    color={C.primary}
                    style={styles.recommendationArrow}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <View style={styles.sectionHeader}>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>Protection tools</Text>
          </View>
        </View>

        {protectionGroups.map((group) => (
          <View key={group.key} style={styles.toolGroupShell}>
            <View style={styles.toolGroupCard}>
              <View style={styles.toolGroupHeader}>
                <View style={styles.toolGroupHeaderIcon}>
                  <Ionicons name={group.icon} size={21} color={C.primary} />
                </View>
                <View style={styles.flexibleTextBlock}>
                  <Text style={styles.toolGroupTitle}>{group.title}</Text>
                </View>
              </View>

              {group.tools.map((tool, index) => (
                <TouchableOpacity
                  key={tool.route}
                  style={[
                    styles.toolRow,
                    index !== group.tools.length - 1 && styles.toolRowDivider,
                    tool.danger && styles.dangerToolRow,
                  ]}
                  onPress={() => {
                    if (tool.danger) {
                      hapticWarning();
                    } else {
                      hapticLight();
                    }
                    router.push(tool.route as any);
                  }}
                  activeOpacity={0.84}
                  accessibilityRole="button"
                  accessibilityLabel={`${tool.title}. ${tool.description}`}
                >
                  <View
                    style={[
                      styles.actionIcon,
                      tool.danger && { backgroundColor: `${C.danger}12` },
                    ]}
                  >
                    <Ionicons
                      name={tool.icon}
                      size={21}
                      color={tool.danger ? C.danger : C.primary}
                    />
                  </View>
                  <View style={styles.flexibleTextBlock}>
                    <Text style={styles.actionTitle}>{tool.title}</Text>
                    {/* <Text style={styles.toolDescription}>{tool.description}</Text> */}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <SecurityIssueModal
        visible={issueModalVisible}
        title={lockedIssueGroup ? 'Family security' : selectedGroupCopy.title}
        issues={lockedIssueGroup ? [] : filteredIssues}
        emptyTitle={selectedGroupCopy.emptyTitle}
        emptyText={selectedGroupCopy.emptyText}
        lockedMessage={
          lockedIssueGroup
            ? 'Family security monitoring is locked on the Free plan. Upgrade to Family to review shared and family-member password risks.'
            : undefined
        }
        primaryActionLabel={lockedIssueGroup ? 'View Family plan' : undefined}
        onPrimaryAction={
          lockedIssueGroup
            ? () => router.push('/subscription?from=security-family')
            : undefined
        }
        onClose={() => {
          setIssueModalVisible(false);
          setLockedIssueGroup(false);
        }}
        onIssuePress={openIssue}
      />
    </SafeAreaView>
  );
}

const ringStyles = StyleSheet.create({
  wrapper: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  label: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontWeight: '800',
    marginTop: -2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

function makeStyles(C: ThemePalette, isDark: boolean) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 150,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 18,
      gap: 12,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      color: C.text,
      fontSize: 30,
      fontWeight: '900',
      letterSpacing: -0.7,
    },
    headerSub: {
      color: C.textSecondary,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '600',
      marginTop: 6,
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
    },
    heroCard: {
      backgroundColor: C.primary,
      borderRadius: 30,
      padding: 18,
      overflow: 'hidden',
      marginBottom: 16,
      shadowColor: C.primary,
      shadowOpacity: 0.18,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 5,
    },
    heroGlow: {
      position: 'absolute',
      right: -58,
      top: -70,
      width: 190,
      height: 190,
      borderRadius: 95,
      backgroundColor: 'rgba(255,255,255,0.09)',
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    heroCopy: {
      flex: 1,
      minWidth: 0,
    },
    heroEyebrow: {
      color: 'rgba(255,255,255,0.70)',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    heroTitle: {
      color: '#FFFFFF',
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '900',
      letterSpacing: -0.4,
      marginTop: 7,
    },
    heroSubtitle: {
      color: 'rgba(255,255,255,0.76)',
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '600',
      marginTop: 7,
    },
    heroButton: {
      marginTop: 14,
      borderRadius: 17,
      paddingHorizontal: 15,
      paddingVertical: 14,
      backgroundColor: '#FFFFFF',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    heroButtonText: {
      color: C.primary,
      fontSize: 14,
      fontWeight: '900',
    },
    recoveryWarningCard: {
      backgroundColor: C.danger,
      borderRadius: 21,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      marginBottom: 22,
      shadowColor: C.danger,
      shadowOpacity: 0.22,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    recoveryIcon: {
      width: 42,
      height: 42,
      borderRadius: 15,
      backgroundColor: 'rgba(255,255,255,0.17)',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    flexibleTextBlock: {
      flex: 1,
      minWidth: 0,
      top: 9,
    },
    recoveryTitle: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
    },
    recoveryText: {
      color: 'rgba(255,255,255,0.82)',
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      marginTop: 2,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    sectionCopy: {
      flex: 1,
      minWidth: 0,
    },
    sectionTitle: {
      color: C.text,
      fontSize: 17,
      fontWeight: '900',
    },
    sectionIntro: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
      maxWidth: 330,
    },
    sectionAction: {
      color: C.primary,
      fontSize: 13,
      fontWeight: '900',
    },
    setupProgress: {
      color: C.primary,
      fontSize: 13,
      fontWeight: '900',
    },
    setupCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: 22,
      shadowColor: '#000',
      shadowOpacity: 0.075,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 9 },
      elevation: 4,
    },
    setupProgressTrack: {
      height: 6,
      backgroundColor: C.backgroundSelected,
      overflow: 'hidden',
    },
    setupProgressFill: {
      height: 6,
      backgroundColor: C.success,
    },
    setupProgressSweep: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      borderRadius: 999,
      opacity: 0.92,
      shadowColor: C.success,
      shadowOpacity: 0.45,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 0 },
      elevation: 2,
    },
    setupRow: {
      minHeight: 66,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
    },
    setupRowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    setupStatusIcon: {
      width: 36,
      height: 36,
      borderRadius: 13,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
    },
    setupStatusIconComplete: {
      backgroundColor: C.success,
    },
    setupTitle: {
      flex: 1,
      minWidth: 0,
      color: C.text,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '900',
      textAlignVertical: 'center',
    },
    recommendationCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: 22,
      shadowColor: '#000',
      shadowOpacity: 0.075,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 9 },
      elevation: 4,
    },
    recommendationRow: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
    },
    gainPill: {
      minWidth: 82,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 10,
      backgroundColor: C.primary,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.24)' : C.primaryDark,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: C.primary,
      shadowOpacity: isDark ? 0.34 : 0.18,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    gainText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.1,
    },
    recommendationCopy: {
      flex: 1,
      minWidth: 0,
    },
    recommendationTitle: {
      color: C.text,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '900',
    },
    recommendationDescription: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600',
      marginTop: 4,
    },
    recommendationArrow: {
      marginTop: 10,
    },
    issueSummaryCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: 22,
      shadowColor: '#000',
      shadowOpacity: 0.075,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 9 },
      elevation: 4,
    },
    issueRow: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
    },
    issueRowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    issueIcon: {
      width: 38,
      height: 38,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    issueLockBadge: {
      position: 'absolute',
      right: -4,
      bottom: -4,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: C.warning,
      borderWidth: 2,
      borderColor: C.backgroundElement,
      alignItems: 'center',
      justifyContent: 'center',
    },
    issueLabel: {
      flex: 1,
      flexShrink: 1,
      color: C.text,
      fontSize: 14,
      fontWeight: '800',
    },
    issueCount: {
      minWidth: 24,
      textAlign: 'right',
      fontSize: 16,
      fontWeight: '900',
    },
    actionGrid: {
      gap: 10,
    },
    toolGroupShell: {
      borderRadius: 24,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOpacity: 0.075,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 9 },
      elevation: 4,
    },
    toolGroupCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    toolGroupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 15,
      paddingVertical: 15,
      backgroundColor: C.backgroundSelected,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    toolGroupHeaderIcon: {
      width: 44,
      height: 44,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.actionCard,
      flexShrink: 0,
    },
    toolGroupTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: '900',
    },
    toolGroupDescription: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 3,
    },
    toolRow: {
      paddingHorizontal: 14,
      paddingVertical: 13,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
    },
    toolRowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    dangerToolRow: {
      backgroundColor: `${C.danger}08`,
    },
    actionCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderWidth: 1,
      borderColor: C.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      shadowColor: '#000',
      shadowOpacity: 0.07,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    actionIcon: {
      width: 40,
      height: 40,
      borderRadius: 15,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionTitle: {
      flex: 1,
      flexShrink: 1,
      color: C.text,
      fontSize: 15,
      fontWeight: '900',
    },
    toolDescription: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 3,
    },
  });
}