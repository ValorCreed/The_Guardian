import React from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';

const SCORE = 72;
const RADIUS = 80;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ScoreRing = ({ C }: { C: typeof Colors.light }) => {
  const progress = SCORE / 100;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  return (
    <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={200} height={200} viewBox="0 0 200 200">
        <Circle cx={100} cy={100} r={RADIUS} stroke={C.border} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={100} cy={100} r={RADIUS}
          stroke={C.securityScore}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin="100, 100"
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: 48, fontWeight: '700', color: C.securityScore }}>{SCORE}</Text>
        <Text style={{ fontSize: 13, color: C.textSecondary, marginTop: 2 }}>Security Score</Text>
      </View>
    </View>
  );
};

export default function SecurityScreen() {
  const scheme = useColorScheme();
  const colorScheme = scheme === 'dark' ? 'dark' : 'light';
  const C = Colors[colorScheme] as typeof Colors.light;
  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>Vault health</Text>
        <Text style={styles.title}>Security Center</Text>

        {/* Score card */}
        <View style={styles.scoreCard}>
          <ScoreRing C={C} />
          <Text style={styles.resolveText}>Resolve issues below to reach 100</Text>
        </View>

        {/* Stat cards */}
        <View style={styles.statRow}>
          {[
            { icon: 'shield-outline', count: 1, label: 'Breached', iconBg: C.alertDangerBg, iconColor: C.danger },
            { icon: 'copy-outline', count: 2, label: 'Reused', iconBg: C.actionCard, iconColor: C.primary },
            { icon: 'warning-outline', count: 2, label: 'Weak', iconBg: C.actionCard, iconColor: C.primary },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <View style={[styles.statIconCircle, { backgroundColor: s.iconBg }]}>
                <Ionicons name={s.icon as any} size={20} color={s.iconColor} />
              </View>
              <Text style={styles.statCount}>{s.count}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Strength bar */}
        <View style={styles.strengthCard}>
          <Text style={styles.sectionTitle}>Password strength analysis</Text>
          <View style={styles.strengthBarRow}>
            <View style={[styles.strengthSegment, { backgroundColor: C.success, flex: 3 }]} />
            <View style={[styles.strengthSegment, { backgroundColor: C.warning, flex: 2, marginHorizontal: 3 }]} />
            <View style={[styles.strengthSegment, { backgroundColor: C.danger, flex: 2 }]} />
          </View>
          <View style={styles.strengthLegend}>
            {[
              { color: C.success, label: 'Strong · 3' },
              { color: C.warning, label: 'Medium · 2' },
              { color: C.danger, label: 'Weak · 2' },
            ].map((l) => (
              <View key={l.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                <Text style={styles.legendText}>{l.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Breach monitoring */}
        <Text style={styles.sectionTitle}>Breach monitoring</Text>
        <View style={styles.card}>
          {[
            {
              initial: 'N', avatarColor: C.danger, name: 'Netflix',
              tags: [
                { label: 'Breached', color: C.danger, bg: C.alertDangerBg },
                { label: 'Reused', color: C.warning, bg: C.alertWarningBg },
              ], isLast: false,
            },
            {
              initial: 'R', avatarColor: C.info, name: 'Revolut',
              tags: [{ label: 'Reused', color: C.warning, bg: C.alertWarningBg }],
              isLast: true,
            },
          ].map((item) => (
            <TouchableOpacity
              key={item.name}
              activeOpacity={0.7}
              style={[styles.listItem, !item.isLast && styles.listDivider]}
            >
              <View style={[styles.listAvatar, { backgroundColor: item.avatarColor }]}>
                <Text style={styles.listAvatarText}>{item.initial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.listName}>{item.name}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  {item.tags.map((tag) => (
                    <View key={tag.label} style={[styles.tag, { backgroundColor: tag.bg }]}>
                      <Text style={[styles.tagText, { color: tag.color }]}>{tag.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent activity */}
        <Text style={styles.sectionTitle}>Recent security activity</Text>
        <View style={styles.card}>
          {[
            { icon: 'finger-print-outline', iconBg: C.actionCard, iconColor: C.primary, title: 'Face ID unlock', subtitle: 'iPhone 15 Pro · Active now', isLast: false },
            { icon: 'key-outline', iconBg: C.backgroundSelected, iconColor: C.info, title: 'Password viewed', subtitle: 'GitHub · 1 hour ago', isLast: false },
            { icon: 'shield-outline', iconBg: C.alertDangerBg, iconColor: C.danger, title: 'Breach detected', subtitle: 'Netflix · Yesterday', isLast: true },
          ].map((item) => (
            <View key={item.title} style={[styles.listItem, !item.isLast && styles.listDivider]}>
              <View style={[styles.activityIconCircle, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.icon as any} size={18} color={item.iconColor} />
              </View>
              <View>
                <Text style={styles.listName}>{item.title}</Text>
                <Text style={styles.listSub}>{item.subtitle}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Device sessions */}
        <Text style={styles.sectionTitle}>Device sessions</Text>
        <View style={styles.card}>
          {[
            { icon: 'phone-portrait-outline', name: 'iPhone 15 Pro', meta: 'London, UK · Active now', isCurrent: true, isLast: false },
            { icon: 'laptop-outline', name: 'MacBook Pro', meta: 'London, UK · 2 hours ago', isCurrent: false, isLast: false },
            { icon: 'tablet-portrait-outline', name: 'iPad Air', meta: 'Manchester, UK · Yesterday', isCurrent: false, isLast: true },
          ].map((device) => (
            <View key={device.name} style={[styles.listItem, !device.isLast && styles.listDivider]}>
              <View style={[styles.deviceIconCircle, { backgroundColor: C.backgroundSelected }]}>
                <Ionicons name={device.icon as any} size={20} color={C.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.listName}>{device.name}</Text>
                  {device.isCurrent && (
                    <View style={[styles.tag, { backgroundColor: C.actionCard }]}>
                      <Text style={[styles.tagText, { color: C.primary }]}>This device</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.listSub}>{device.meta}</Text>
              </View>
              {!device.isCurrent && (
                <Ionicons name="exit-outline" size={20} color={C.danger} />
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Bottom nav */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home')}>
          <Ionicons name="home-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/vault')}>
          <Ionicons name="key-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Vault</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="shield" size={22} color={C.tabActive} />
          <Text style={styles.navLabelActive}>Security</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/family')}>
          <Ionicons name="people-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Family</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (C: typeof Colors.light) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    scrollContent: { marginTop: 35, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
    eyebrow: { fontSize: 13, color: C.textSecondary, marginBottom: 2 },
    title: { fontSize: 28, fontWeight: '700', color: C.text, marginBottom: 16 },
    scoreCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      alignItems: 'center',
      paddingVertical: 20,
      marginBottom: 16,
    },
    resolveText: { fontSize: 13, color: C.textSecondary, marginTop: 4 },
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
      width: 40, height: 40, borderRadius: 20,
      alignItems: 'center', justifyContent: 'center',
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
      flexDirection: 'row', height: 10, borderRadius: 6,
      overflow: 'hidden', marginVertical: 12,
    },
    strengthSegment: { borderRadius: 6 },
    strengthLegend: { flexDirection: 'row', gap: 16 },
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
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 14, paddingHorizontal: 14, gap: 12,
    },
    listDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    listAvatar: {
      width: 42, height: 42, borderRadius: 21,
      alignItems: 'center', justifyContent: 'center', marginRight: 0,
    },
    listAvatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    listName: { fontSize: 15, fontWeight: '600', color: C.text },
    listSub: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
    tagText: { fontSize: 12, fontWeight: '500' },
    activityIconCircle: {
      width: 38, height: 38, borderRadius: 19,
      alignItems: 'center', justifyContent: 'center',
    },
    deviceIconCircle: {
      width: 38, height: 38, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    bottomNav: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: C.backgroundElement,
      flexDirection: 'row',
      paddingTop: 10, paddingBottom: 28,
      borderTopWidth: 1, borderTopColor: C.border,
    },
    navItem: { flex: 1, alignItems: 'center', gap: 4 },
    navLabel: { fontSize: 11, color: C.tabInactive },
    navLabelActive: { fontSize: 11, color: C.tabActive, fontWeight: '600' },
  });