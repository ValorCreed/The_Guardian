import React from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import FloatingTabBar from '../components/FloatingTabBar';
import { useAppTheme } from '../context/ThemeContext';
import { useSecurityScore } from '../hooks/useSecurityScore';

const RADIUS = 80;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ScoreRing = ({ C, score }: { C: any; score: number }) => {
  const progress = score / 100;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  const scoreColor = score >= 80 ? C.success : score >= 50 ? C.warning : C.danger;

  return (
    <View style={inlineStyles.ringWrapper}>
      <Svg width={200} height={200} viewBox="0 0 200 200">
        <Circle cx={100} cy={100} r={RADIUS} stroke={C.border} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={100}
          cy={100}
          r={RADIUS}
          stroke={scoreColor}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin="100, 100"
        />
      </Svg>

      <View style={inlineStyles.ringCenter}>
        <Text style={[inlineStyles.scoreText, { color: scoreColor }]}>{score}</Text>
        <Text style={[inlineStyles.scoreLabel, { color: C.textSecondary }]}>Password Strength</Text>
      </View>
    </View>
  );
};

export default function SecurityScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);
  const { report } = useSecurityScore();

  const statCards = [
    {
      icon: 'shield-checkmark-outline',
      count: report.strongCount,
      label: 'Strong',
      iconBg: C.actionCard,
      iconColor: C.success,
    },
    {
      icon: 'alert-circle-outline',
      count: report.mediumCount,
      label: 'Medium',
      iconBg: C.alertWarningBg,
      iconColor: C.warning,
    },
    {
      icon: 'warning-outline',
      count: report.weakCount,
      label: 'Weak',
      iconBg: C.alertDangerBg,
      iconColor: C.danger,
    },
  ];

  const strengthLegend = [
    { color: C.success, label: `Strong · ${report.strongCount}` },
    { color: C.warning, label: `Medium · ${report.mediumCount}` },
    { color: C.danger, label: `Weak · ${report.weakCount}` },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>Vault health</Text>
        <Text style={styles.title}>Security Center</Text>

        <View style={styles.scoreCard}>
          <ScoreRing C={C} score={report.score} />
          <Text style={styles.resolveText}>
            Score is based on the strength of your saved passwords.
          </Text>
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
          <Text style={styles.sectionTitle}>Password strength analysis</Text>

          <View style={styles.strengthBarRow}>
            <View style={[styles.strengthSegment, { backgroundColor: C.success, flex: Math.max(report.strongCount, 1) }]} />
            <View style={[styles.strengthSegment, { backgroundColor: C.warning, flex: Math.max(report.mediumCount, 1), marginHorizontal: 3 }]} />
            <View style={[styles.strengthSegment, { backgroundColor: C.danger, flex: Math.max(report.weakCount, 1) }]} />
          </View>

          <View style={styles.strengthLegend}>
            {strengthLegend.map((l) => (
              <View key={l.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                <Text style={styles.legendText}>{l.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Password strength issues</Text>
        <View style={styles.card}>
          {report.issues.length === 0 ? (
            <View style={styles.listItem}>
              <View style={[styles.activityIconCircle, { backgroundColor: C.actionCard }]}> 
                <Ionicons name="shield-checkmark-outline" size={18} color={C.primary} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.listName}>No weak or moderate passwords found</Text>
                <Text style={styles.listSub}>All saved passwords are strong</Text>
              </View>
            </View>
          ) : (
            report.issues.map((item, index) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.7}
                style={[styles.listItem, index !== report.issues.length - 1 && styles.listDivider]}
              >
                <View style={[styles.listAvatar, { backgroundColor: item.severity === 'danger' ? C.danger : C.warning }]}> 
                  <Text style={styles.listAvatarText}>{item.initial}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.listName}>{item.title}</Text>
                  <View style={styles.tagRow}>
                    <View
                      style={[
                        styles.tag,
                        { backgroundColor: item.severity === 'danger' ? C.alertDangerBg : C.alertWarningBg },
                      ]}
                    >
                      <Text style={[styles.tagText, { color: item.severity === 'danger' ? C.danger : C.warning }]}> 
                        {item.type === 'WEAK' ? 'Weak' : 'Moderate'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.listSub}>{item.subtitle}</Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
              </TouchableOpacity>
            ))
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

      <FloatingTabBar />
    </SafeAreaView>
  );
}

const inlineStyles = StyleSheet.create({
  ringWrapper: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 48,
    fontWeight: '700',
  },
  scoreLabel: {
    fontSize: 13,
    marginTop: 2,
  },
});

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    scrollContent: {
      marginTop: 35,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 110,
    },
    eyebrow: { fontSize: 13, color: C.textSecondary, marginBottom: 2 },
    title: { fontSize: 28, fontWeight: '700', color: C.text, marginBottom: 16 },
    scoreCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      alignItems: 'center',
      paddingVertical: 20,
      marginBottom: 16,
    },
    resolveText: { fontSize: 13, color: C.textSecondary, marginTop: 4, textAlign: 'center' },
    statRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    statCard: {
      flex: 1,
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      alignItems: 'center',
      paddingVertical: 16,
      gap: 6,
    },
    statIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statCount: { fontSize: 22, fontWeight: '700', color: C.text },
    statLabel: { fontSize: 12, color: C.textSecondary },
    strengthCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      padding: 16,
      marginBottom: 24,
    },
    strengthBarRow: {
      flexDirection: 'row',
      height: 10,
      borderRadius: 6,
      overflow: 'hidden',
      marginVertical: 12,
    },
    strengthSegment: { borderRadius: 6 },
    strengthLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 12, color: C.textSecondary },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 12 },
    card: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      overflow: 'hidden',
      marginBottom: 24,
    },
    listItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 14,
      gap: 12,
    },
    listDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    listAvatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listAvatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    listName: { fontSize: 15, fontWeight: '600', color: C.text },
    listSub: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    tagRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
    tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
    tagText: { fontSize: 12, fontWeight: '500' },
    activityIconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
