import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';

// ---------------------------------------------------------------------------
// Security Score Ring
// ---------------------------------------------------------------------------

const SCORE = 72;
const RADIUS = 80;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ScoreRing = () => {
  const progress = SCORE / 100;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  return (
    <View style={styles.ringContainer}>
      <Svg width={200} height={200} viewBox="0 0 200 200">
        {/* Background track */}
        <Circle
          cx={100}
          cy={100}
          r={RADIUS}
          stroke="#E0DDD4"
          strokeWidth={STROKE}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={100}
          cy={100}
          r={RADIUS}
          stroke="#D4AA5F"
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin="100, 100"
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.scoreNumber}>{SCORE}</Text>
        <Text style={styles.scoreLabel}>Security Score</Text>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

const StatCard = ({
  icon,
  count,
  label,
  iconBg,
  iconColor,
}: {
  icon: string;
  count: number;
  label: string;
  iconBg: string;
  iconColor: string;
}) => (
  <View style={styles.statCard}>
    <View style={[styles.statIconCircle, { backgroundColor: iconBg }]}>
      <Ionicons name={icon as any} size={20} color={iconColor} />
    </View>
    <Text style={styles.statCount}>{count}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// ---------------------------------------------------------------------------
// Password strength bar
// ---------------------------------------------------------------------------

const StrengthBar = () => (
  <View style={styles.strengthCard}>
    <Text style={styles.sectionTitle}>Password strength analysis</Text>
    <View style={styles.strengthBarRow}>
      <View style={[styles.strengthSegment, { backgroundColor: '#4CAF50', flex: 3 }]} />
      <View style={[styles.strengthSegment, { backgroundColor: '#D4AA5F', flex: 2, marginHorizontal: 3 }]} />
      <View style={[styles.strengthSegment, { backgroundColor: '#E57373', flex: 2 }]} />
    </View>
    <View style={styles.strengthLegend}>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
        <Text style={styles.legendText}>Strong · 3</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: '#D4AA5F' }]} />
        <Text style={styles.legendText}>Medium · 2</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: '#E57373' }]} />
        <Text style={styles.legendText}>Weak · 2</Text>
      </View>
    </View>
  </View>
);

// ---------------------------------------------------------------------------
// Breach item
// ---------------------------------------------------------------------------

const BreachItem = ({
  initial,
  avatarColor,
  name,
  tags,
  isLast,
}: {
  initial: string;
  avatarColor: string;
  name: string;
  tags: { label: string; color: string; bg: string }[];
  isLast: boolean;
}) => (
  <TouchableOpacity
    activeOpacity={0.7}
    style={[styles.breachItem, !isLast && styles.breachItemDivider]}
  >
    <View style={[styles.breachAvatar, { backgroundColor: avatarColor }]}>
      <Text style={styles.breachAvatarText}>{initial}</Text>
    </View>
    <View style={styles.breachInfo}>
      <Text style={styles.breachName}>{name}</Text>
      <View style={styles.tagRow}>
        {tags.map((tag) => (
          <View key={tag.label} style={[styles.tag, { backgroundColor: tag.bg }]}>
            <Text style={[styles.tagText, { color: tag.color }]}>{tag.label}</Text>
          </View>
        ))}
      </View>
    </View>
    <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
  </TouchableOpacity>
);

// ---------------------------------------------------------------------------
// Activity item
// ---------------------------------------------------------------------------

const ActivityItem = ({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  isLast,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  isLast: boolean;
}) => (
  <View style={[styles.activityItem, !isLast && styles.activityDivider]}>
    <View style={[styles.activityIconCircle, { backgroundColor: iconBg }]}>
      <Ionicons name={icon as any} size={18} color={iconColor} />
    </View>
    <View>
      <Text style={styles.activityTitle}>{title}</Text>
      <Text style={styles.activitySubtitle}>{subtitle}</Text>
    </View>
  </View>
);

// ---------------------------------------------------------------------------
// Device session item
// ---------------------------------------------------------------------------

const DeviceItem = ({
  icon,
  name,
  meta,
  isCurrentDevice,
  isLast,
}: {
  icon: string;
  name: string;
  meta: string;
  isCurrentDevice: boolean;
  isLast: boolean;
}) => (
  <View style={[styles.deviceItem, !isLast && styles.deviceDivider]}>
    <View style={styles.deviceIconCircle}>
      <Ionicons name={icon as any} size={20} color="#4A5C50" />
    </View>
    <View style={styles.deviceInfo}>
      <View style={styles.deviceNameRow}>
        <Text style={styles.deviceName}>{name}</Text>
        {isCurrentDevice && (
          <View style={styles.thisDeviceBadge}>
            <Text style={styles.thisDeviceText}>This device</Text>
          </View>
        )}
      </View>
      <Text style={styles.deviceMeta}>{meta}</Text>
    </View>
    {!isCurrentDevice && (
      <Ionicons name="exit-outline" size={20} color="#E57373" />
    )}
  </View>
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SecurityScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#E8E8E4" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={styles.eyebrow}>Vault health</Text>
        <Text style={styles.title}>Security Center</Text>

        {/* Score card */}
        <View style={styles.scoreCard}>
          <ScoreRing />
          <Text style={styles.resolveText}>Resolve issues below to reach 100</Text>
        </View>

        {/* Stat cards */}
        <View style={styles.statRow}>
          <StatCard
            icon="shield-outline"
            count={1}
            label="Breached"
            iconBg="#FDECEA"
            iconColor="#E57373"
          />
          <StatCard
            icon="copy-outline"
            count={2}
            label="Reused"
            iconBg="#EDEFEB"
            iconColor="#4A5C50"
          />
          <StatCard
            icon="warning-outline"
            count={2}
            label="Weak"
            iconBg="#EDEFEB"
            iconColor="#4A5C50"
          />
        </View>

        {/* Strength bar */}
        <StrengthBar />

        {/* Breach monitoring */}
        <Text style={styles.sectionTitle}>Breach monitoring</Text>
        <View style={styles.card}>
          <BreachItem
            initial="N"
            avatarColor="#E57373"
            name="Netflix"
            tags={[
              { label: 'Breached', color: '#C0392B', bg: '#FDECEA' },
              { label: 'Reused', color: '#7A5C1E', bg: '#F5ECD7' },
            ]}
            isLast={false}
          />
          <BreachItem
            initial="R"
            avatarColor="#5B8DEF"
            name="Revolut"
            tags={[{ label: 'Reused', color: '#7A5C1E', bg: '#F5ECD7' }]}
            isLast
          />
        </View>

        {/* Recent activity */}
        <Text style={styles.sectionTitle}>Recent security activity</Text>
        <View style={styles.card}>
          <ActivityItem
            icon="finger-print-outline"
            iconBg="#E8F5E9"
            iconColor="#2D6A4F"
            title="Face ID unlock"
            subtitle="iPhone 15 Pro · Active now"
            isLast={false}
          />
          <ActivityItem
            icon="key-outline"
            iconBg="#EAF0FB"
            iconColor="#3A6BC4"
            title="Password viewed"
            subtitle="GitHub · 1 hour ago"
            isLast={false}
          />
          <ActivityItem
            icon="shield-outline"
            iconBg="#FDECEA"
            iconColor="#E57373"
            title="Breach detected"
            subtitle="Netflix · Yesterday"
            isLast
          />
        </View>

        {/* Device sessions */}
        <Text style={styles.sectionTitle}>Device sessions</Text>
        <View style={styles.card}>
          <DeviceItem
            icon="phone-portrait-outline"
            name="iPhone 15 Pro"
            meta="London, UK · Active now"
            isCurrentDevice
            isLast={false}
          />
          <DeviceItem
            icon="laptop-outline"
            name="MacBook Pro"
            meta="London, UK · 2 hours ago"
            isCurrentDevice={false}
            isLast={false}
          />
          <DeviceItem
            icon="tablet-portrait-outline"
            name="iPad Air"
            meta="Manchester, UK · Yesterday"
            isCurrentDevice={false}
            isLast
          />
        </View>
      </ScrollView>

      {/* Bottom nav */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home')}>
          <Ionicons name="home-outline" size={22} color="#888" />
          <Text style={styles.navLabel}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/vault')}>
          <Ionicons name="key-outline" size={22} color="#888" />
          <Text style={styles.navLabel}>Vault</Text>
        </TouchableOpacity>

        {/* Security is active */}
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="shield" size={22} color="#1B4332" />
          <Text style={styles.navLabelActive}>Security</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/family')}>
          <Ionicons name="people-outline" size={22} color="#888" />
          <Text style={styles.navLabel}>Family</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={22} color="#888" />
          <Text style={styles.navLabel}>Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E8E8E4',
  },
  scrollContent: {
    marginTop: 35,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },

  // Header
  eyebrow: {
    fontSize: 13,
    color: '#7A8A80',
    marginBottom: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#14201A',
    marginBottom: 16,
  },

  // Score card
  scoreCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 16,
  },
  ringContainer: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  scoreNumber: {
    fontSize: 48,
    fontWeight: '700',
    color: '#D4AA5F',
  },
  scoreLabel: {
    fontSize: 13,
    color: '#7A8A80',
    marginTop: 2,
  },
  resolveText: {
    fontSize: 13,
    color: '#7A8A80',
    marginTop: 4,
  },

  // Stat row
  statRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
  statCount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#14201A',
  },
  statLabel: {
    fontSize: 12,
    color: '#7A8A80',
  },

  // Strength bar
  strengthCard: {
    backgroundColor: '#FFFFFF',
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
  strengthSegment: {
    borderRadius: 6,
  },
  strengthLegend: {
    flexDirection: 'row',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: '#7A8A80',
  },

  // Section title
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#14201A',
    marginBottom: 12,
  },

  // Generic card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
  },

  // Breach item
  breachItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  breachItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1EE',
  },
  breachAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  breachAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  breachInfo: {
    flex: 1,
  },
  breachName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#14201A',
    marginBottom: 4,
  },
  tagRow: {
    flexDirection: 'row',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Activity item
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 14,
  },
  activityDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1EE',
  },
  activityIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#14201A',
  },
  activitySubtitle: {
    fontSize: 12,
    color: '#7A8A80',
    marginTop: 2,
  },

  // Device item
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 14,
  },
  deviceDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1EE',
  },
  deviceIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EDEFEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#14201A',
  },
  thisDeviceBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  thisDeviceText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2D6A4F',
  },
  deviceMeta: {
    fontSize: 12,
    color: '#7A8A80',
    marginTop: 2,
  },

  // Bottom nav
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#EDEFEB',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  navLabel: {
    fontSize: 11,
    color: '#888',
  },
  navLabelActive: {
    fontSize: 11,
    color: '#1B4332',
    fontWeight: '600',
  },
});