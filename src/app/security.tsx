import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
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
import { useSecurityScore } from '../hooks/useSecurityScore';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RADIUS = 80;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ScoreRing = ({ C, score }: { C: any; score: number }) => {
  const animatedScore = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    const listener = animatedScore.addListener(({ value }) => {
      setDisplayScore(Math.round(value));
    });

    return () => animatedScore.removeListener(listener);
  }, [animatedScore]);

  useEffect(() => {
    Animated.timing(animatedScore, {
      toValue: Math.max(0, Math.min(score, 100)),
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animatedScore, score]);

  const animatedDashOffset = animatedScore.interpolate({
    inputRange: [0, 100],
    outputRange: [CIRCUMFERENCE, 0],
    extrapolate: 'clamp',
  });

  const scoreColor = score >= 80 ? C.success : score >= 50 ? C.warning : C.danger;

  return (
    <View style={inlineStyles.ringWrapper}>
      <Svg width={200} height={200} viewBox="0 0 200 200">
        <Circle cx={100} cy={100} r={RADIUS} stroke={C.border} strokeWidth={STROKE} fill="none" />
        <AnimatedCircle
          cx={100}
          cy={100}
          r={RADIUS}
          stroke={scoreColor}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE}`}
          strokeDashoffset={animatedDashOffset as any}
          strokeLinecap="round"
          rotation="-90"
          origin="100, 100"
        />
      </Svg>

      <View style={inlineStyles.ringCenter}>
        <Text style={[inlineStyles.scoreText, { color: scoreColor }]}>{displayScore}</Text>
        <Text style={[inlineStyles.scoreLabel, { color: C.textSecondary }]}>Security Score</Text>
      </View>
    </View>
  );
};

export default function SecurityScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);
  const { report, loading, reload } = useSecurityScore();

  const openProblemPassword = (id: number | string) => {
    if (!id) {
      Alert.alert('Could not open password', 'This password could not be found. Please refresh your vault and try again.');
      return;
    }

    router.push({
      pathname: '/vaultdetails',
      params: {
        id: String(id),
        type: 'PASSWORD',
        source: 'security',
      },
    });
  };

  const openSecurityIssue = (item: any) => {
    if (item.itemId) {
      openProblemPassword(item.itemId);
      return;
    }

    if (item.type === 'TWO_FACTOR_OFF') {
      router.push('/twofasetup');
      return;
    }

    if (item.type === 'EMAIL_UNVERIFIED') {
      router.push('/verifyemail');
      return;
    }

    if (item.type === 'BACKUP_NEEDED') {
      router.push('/backup');
      return;
    }

    if (item.actionRoute) {
      const route = item.actionRoute === '/twofactor' ? '/twofasetup' : item.actionRoute;
      router.push(route as any);
    }
  };

  const statCards = [
    { icon: 'shield-checkmark-outline', count: report.strongCount, label: 'Strong', iconBg: C.actionCard, iconColor: C.success },
    { icon: 'alert-circle-outline', count: report.mediumCount, label: 'Medium', iconBg: C.alertWarningBg, iconColor: C.warning },
    { icon: 'warning-outline', count: report.weakCount, label: 'Weak', iconBg: C.alertDangerBg, iconColor: C.danger },
  ];

  const topIssues = report.issues.slice(0, 5);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={C.primary} colors={[C.primary]} />}
      >
        <Text style={styles.eyebrow}>Vault health</Text>
        <Text style={styles.title}>Security Center</Text>

        <View style={styles.scoreCard}>
          <ScoreRing C={C} score={report.score} />
          <Text style={styles.resolveText}>Score is based on password strength, reused passwords, missing details, 2FA, and backup health.</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/securityhealth')} activeOpacity={0.82}>
            <Ionicons name="pulse-outline" size={24} color={C.primary} />
            <Text style={styles.actionTitle}>Health Center</Text>
            {/* <Text style={styles.actionSub}>View full scan</Text> */}
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/passwordgenerator')} activeOpacity={0.82}>
            <Ionicons name="sparkles-outline" size={24} color={C.primary} />
            <Text style={styles.actionTitle}>Advanced Password Generator</Text>
            {/* <Text style={styles.actionSub}>Create password</Text> */}
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/devices')} activeOpacity={0.82}>
            <Ionicons name="phone-portrait-outline" size={24} color={C.primary} />
            <Text style={styles.actionTitle}>Devices</Text>
            {/* <Text style={styles.actionSub}>Review sessions</Text> */}
          </TouchableOpacity>
        </View>

        <View style={styles.statRow}>
          {statCards.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <View style={[styles.statIconCircle, { backgroundColor: s.iconBg }]}>
                <Ionicons name={s.icon as any} size={20} color={s.iconColor} />
              </View>
              <Text style={styles.statCount}>{s.count}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.strengthCard}>
          <Text style={styles.sectionTitle}>Advanced scan summary</Text>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Reused passwords</Text><Text style={styles.summaryValue}>{report.isPremiumOrFamily ? report.reusedCount : 'Premium'}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Old passwords</Text><Text style={styles.summaryValue}>{report.isPremiumOrFamily ? report.oldCount : 'Premium'}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Missing login details</Text><Text style={styles.summaryValue}>{report.missingInfoCount}</Text></View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Top security issues</Text>
            {topIssues.length > 0 && <Text style={styles.sectionSub}>Tap any password below to open and fix it.</Text>}
          </View>
          <TouchableOpacity onPress={() => router.push('/securityhealth')}>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {topIssues.length === 0 ? (
            <View style={styles.listItem}>
              <View style={[styles.activityIconCircle, { backgroundColor: C.actionCard }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.listName}>No urgent issues found</Text>
                <Text style={styles.listSub}>Your visible scan looks good</Text>
              </View>
            </View>
          ) : (
            topIssues.map((item, index) => {
              const severityColor = item.severity === 'danger' ? C.danger : item.severity === 'warning' ? C.warning : C.info || C.primary;
              const severityBg = item.severity === 'danger' ? C.alertDangerBg : item.severity === 'warning' ? C.alertWarningBg : C.backgroundSelected;

              return (
                <TouchableOpacity
                  key={String(item.id)}
                  activeOpacity={0.72}
                  onPress={() => openSecurityIssue(item)}
                  style={[styles.issueItem, index !== topIssues.length - 1 && styles.listDivider]}
                >
                  <View style={[styles.listAvatar, { backgroundColor: severityColor }]}>
                    <Text style={styles.listAvatarText}>{item.initial}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.issueTitleRow}>
                      <Text style={styles.listName}>{item.title}</Text>
                      {item.premiumOnly && <Ionicons name="lock-closed-outline" size={13} color={C.warning} />}
                    </View>
                    <Text style={styles.listSub}>{item.subtitle}</Text>
                  </View>

                  <View style={[styles.issueMiniBadge, { backgroundColor: severityBg }]}>
                    <Ionicons name={item.severity === 'danger' ? 'warning-outline' : 'alert-circle-outline'} size={12} color={severityColor} />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <Text style={styles.sectionTitle}>Recent security activity</Text>

        <View style={styles.card}>
          <View style={[styles.listItem, styles.listDivider]}>
            <View style={[styles.activityIconCircle, { backgroundColor: C.backgroundSelected }]}>
              <Ionicons name="key-outline" size={18} color={C.info} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.listName}>Vault checked</Text>
              <Text style={styles.listSub}>{report.totalPasswords} passwords scanned</Text>
            </View>
          </View>

          <View style={styles.listItem}>
            <View style={[styles.activityIconCircle, { backgroundColor: C.actionCard }]}>
              <Ionicons name="shield-outline" size={18} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.listName}>Security score updated</Text>
              <Text style={styles.listSub}>Current score · {report.score}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const inlineStyles = StyleSheet.create({
  ringWrapper: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  scoreText: { fontSize: 48, fontWeight: '700' },
  scoreLabel: { fontSize: 13, marginTop: 2 },
});

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    scrollContent: { marginTop: 35, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },
    eyebrow: { fontSize: 13, color: C.textSecondary, marginBottom: 2 },
    title: { fontSize: 28, fontWeight: '700', color: C.text, marginBottom: 16 },
    scoreCard: { backgroundColor: C.backgroundElement, borderRadius: 20, alignItems: 'center', paddingVertical: 20, marginBottom: 16 },
    resolveText: { fontSize: 13, color: C.textSecondary, marginTop: 4, textAlign: 'center', paddingHorizontal: 20, lineHeight: 19 },
    actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    actionCard: { flex: 1, backgroundColor: C.backgroundElement, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 14 },
    actionTitle: { color: C.text, fontSize: 15, fontWeight: '900', marginTop: 10 },
    actionSub: { color: C.textSecondary, fontSize: 12, marginTop: 2 },
    statRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    statCard: { flex: 1, backgroundColor: C.backgroundElement, borderRadius: 20, alignItems: 'center', paddingVertical: 16, gap: 6 },
    statIconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    statCount: { fontSize: 22, fontWeight: '700', color: C.text },
    statLabel: { fontSize: 12, color: C.textSecondary },
    strengthCard: { backgroundColor: C.backgroundElement, borderRadius: 20, padding: 16, marginBottom: 24 },
    summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 11 },
    summaryLabel: { color: C.textSecondary, fontSize: 13, fontWeight: '700' },
    summaryValue: { color: C.text, fontSize: 13, fontWeight: '900' },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 4 },
    sectionSub: { fontSize: 13, color: C.textSecondary, lineHeight: 18 },
    viewAll: { color: C.primary, fontSize: 13, fontWeight: '900' },
    card: { backgroundColor: C.backgroundElement, borderRadius: 20, overflow: 'hidden', marginBottom: 24 },
    listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, gap: 12 },
    issueItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 14, gap: 12 },
    listDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    listAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    listAvatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    issueTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
    listName: { fontSize: 15, fontWeight: '600', color: C.text },
    listSub: { fontSize: 12, color: C.textSecondary, marginTop: 2, lineHeight: 17 },
    issueMiniBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    activityIconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  });
