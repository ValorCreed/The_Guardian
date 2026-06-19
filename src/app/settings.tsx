import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import {
  Lock,
  Fingerprint,
  Wand2,
  LockKeyhole,
  Palette,
  Bell,
  Languages,
  ChevronRight,
  Download,
  CloudUpload,
  Crown,
  Trash2,
} from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

// ---------------------------------------------------------------------------
// Reusable row components
// ---------------------------------------------------------------------------

const Row = ({
  icon,
  label,
  value,
  onPress,
  showChevron = true,
  isLast = false,
  destructive = false,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  isLast?: boolean;
  destructive?: boolean;
}) => (
  <TouchableOpacity
    activeOpacity={0.6}
    onPress={onPress}
    style={[styles.row, !isLast && styles.rowDivider]}
  >
    <View style={[styles.iconCircle, destructive && styles.iconCircleDestructive]}>
      {icon}
    </View>
    <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>
      {label}
    </Text>
    {value !== undefined && <Text style={styles.rowValue}>{value}</Text>}
    {showChevron && (
      <ChevronRight
        size={20}
        color={destructive ? '#D88686' : '#9CA3AF'}
        style={{ marginLeft: 4 }}
      />
    )}
  </TouchableOpacity>
);

const ToggleRow = ({
  icon,
  label,
  value,
  onValueChange,
  isLast = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean;
  onValueChange: (val: boolean) => void;
  isLast?: boolean;
}) => (
  <View style={[styles.row, !isLast && styles.rowDivider]}>
    <View style={styles.iconCircle}>{icon}</View>
    <Text style={styles.rowLabel}>{label}</Text>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: '#E2E5E1', true: '#1B4332' }}
      thumbColor="#FFFFFF"
      ios_backgroundColor="#E2E5E1"
    />
  </View>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <Text style={styles.sectionLabel}>{children}</Text>
);

const Card = ({ children }: { children: React.ReactNode }) => (
  <View style={styles.card}>{children}</View>
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const [biometricUnlock, setBiometricUnlock] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F5F2" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Settings</Text>

        {/* Account card */}
        <View style={styles.accountCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>AM</Text>
          </View>
          <View style={styles.accountInfo}>
            <Text style={styles.accountName}>Alex Morgan</Text>
            <Text style={styles.accountEmail}>alex.morgan@gmail.com</Text>
          </View>
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumBadgeText}>Premium</Text>
          </View>
        </View>

        {/* SECURITY */}
        <SectionLabel>SECURITY</SectionLabel>
        <Card>
          <Row
            icon={<Lock size={20} color="#1F2A24" />}
            label="Auto-lock timeout"
            value="1 minute"
            showChevron={false}
            onPress={() => {}}
          />
          <ToggleRow
            icon={<Fingerprint size={20} color="#1F2A24" />}
            label="Biometric unlock"
            value={biometricUnlock}
            onValueChange={setBiometricUnlock}
          />
          <Row
            icon={<Wand2 size={20} color="#1F2A24" />}
            label="Auto-fill"
            onPress={() => {}}
          />
          <Row
            icon={<LockKeyhole size={20} color="#1F2A24" />}
            label="Lock vault now"
            isLast
            onPress={() => {}}
          />
        </Card>

        {/* PREFERENCES */}
        <SectionLabel>PREFERENCES</SectionLabel>
        <Card>
          <ToggleRow
            icon={<Palette size={20} color="#1F2A24" />}
            label="Dark mode"
            value={darkMode}
            onValueChange={setDarkMode}
          />
          <Row
            icon={<Bell size={20} color="#1F2A24" />}
            label="Notifications"
            onPress={() => {}}
          />
          <Row
            icon={<Languages size={20} color="#1F2A24" />}
            label="Language"
            value="English"
            showChevron={false}
            isLast
            onPress={() => {}}
          />
        </Card>

        {/* DATA */}
        <SectionLabel>DATA</SectionLabel>
        <Card>
          <Row
            icon={<Download size={20} color="#1F2A24" />}
            label="Export data"
            onPress={() => {}}
          />
          <Row
            icon={<CloudUpload size={20} color="#1F2A24" />}
            label="Backup"
            value="Today"
            showChevron={false}
            onPress={() => {}}
          />
          <Row
            icon={<Crown size={20} color="#1F2A24" />}
            label="Subscription"
            isLast
            onPress={() => router.push('/subscription')}
          />
        </Card>

        {/* DELETE ACCOUNT */}
        <View style={styles.card}>
          <Row
            icon={<Trash2 size={20} color="#C0392B" />}
            label="Delete account"
            destructive
            isLast
            onPress={() => {}}
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

        <TouchableOpacity style={styles.navItem}onPress={() => router.push('/security')} >
          <Ionicons name="shield-outline" size={22} color="#888" />
          <Text style={styles.navLabel}>Security</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/family')}>
          <Ionicons name="people-outline" size={22} color="#888" />
          <Text style={styles.navLabel}>Family</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="settings" size={22} color="#1B4332" />
          <Text style={styles.navLabelActive}>Settings</Text>
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
    backgroundColor: '#F3F5F2',
  },
  scrollContent: {
    marginTop: 35,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#14201A',
    marginBottom: 16,
  },

  // Account card
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    marginBottom: 24,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1B4332',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#14201A',
  },
  accountEmail: {
    fontSize: 13,
    color: '#7A8A80',
    marginTop: 2,
  },

  // Premium badge (warm beige replacing the old gray Free badge)
  premiumBadge: {
    backgroundColor: '#F5ECD7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  premiumBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7A5C1E',
  },

  // Section label
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8B968F',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: 24,
    overflow: 'hidden',
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1EE',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDEFEB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconCircleDestructive: {
    backgroundColor: '#FBE9E7',
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: '#1F2A24',
  },
  rowLabelDestructive: {
    color: '#C0392B',
  },
  rowValue: {
    fontSize: 15,
    color: '#9CA3AF',
    marginRight: 2,
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