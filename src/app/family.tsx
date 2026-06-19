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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = 'Owner' | 'Admin' | 'Viewer';

interface Member {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatarColor: string;
  role: Role;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const MEMBERS: Member[] = [
  {
    id: '1',
    name: 'Alex Morgan',
    email: 'alex@guardian.app',
    initials: 'AM',
    avatarColor: '#1B4332',
    role: 'Owner',
  },
  {
    id: '2',
    name: 'Jamie Morgan',
    email: 'jamie@guardian.app',
    initials: 'JM',
    avatarColor: '#2D6A4F',
    role: 'Admin',
  },
  {
    id: '3',
    name: 'Sam Morgan',
    email: 'sam@guardian.app',
    initials: 'SM',
    avatarColor: '#B5935A',
    role: 'Viewer',
  },
];

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

const roleBadgeStyle = (role: Role) => {
  switch (role) {
    case 'Owner':
      return { bg: '#EDEFEB', text: '#4A5C50' };
    case 'Admin':
      return { bg: '#E8F0FA', text: '#3A6BC4' };
    case 'Viewer':
      return { bg: '#EDEFEB', text: '#4A5C50' };
  }
};

const RoleBadge = ({ role }: { role: Role }) => {
  const { bg, text } = roleBadgeStyle(role);
  return (
    <View style={[styles.roleBadge, { backgroundColor: bg }]}>
      <Text style={[styles.roleBadgeText, { color: text }]}>{role}</Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Member row
// ---------------------------------------------------------------------------

const MemberRow = ({ member, isLast }: { member: Member; isLast: boolean }) => (
  <View style={[styles.memberRow, !isLast && styles.memberRowDivider]}>
    <View style={[styles.avatar, { backgroundColor: member.avatarColor }]}>
      <Text style={styles.avatarText}>{member.initials}</Text>
    </View>
    <View style={styles.memberInfo}>
      <Text style={styles.memberName}>{member.name}</Text>
      <Text style={styles.memberEmail}>{member.email}</Text>
    </View>
    <RoleBadge role={member.role} />
  </View>
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function FamilyScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#E8E8E4" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>3 of 6 members</Text>
            <Text style={styles.title}>Family</Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={() =>router.push('/newmember')}>
            <Ionicons name="person-add" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Family group card */}
        <View style={styles.groupCard}>
          <View style={styles.groupIconCircle}>
            <Ionicons name="people" size={22} color="#4A7C6A" />
          </View>
          <View>
            <Text style={styles.groupName}>Morgan Family</Text>
            <Text style={styles.groupMeta}>3 members · 1 shared vault</Text>
          </View>
        </View>

        {/* Members section */}
        <Text style={styles.sectionLabel}>Members</Text>

        <View style={styles.membersCard}>
          {MEMBERS.map((member, index) => (
            <MemberRow
              key={member.id}
              member={member}
              isLast={index === MEMBERS.length - 1}
            />
          ))}
        </View>

        {/* Invite button */}
        <TouchableOpacity style={styles.inviteButton} activeOpacity={0.7} onPress={() =>router.push ('/newmember')}>
          <Ionicons name="person-add-outline" size={18} color="#4A5C50" style={{ marginRight: 8 }} />
          <Text style={styles.inviteButtonText}>Invite member</Text>
        </TouchableOpacity>
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

        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/security')}>
          <Ionicons name="shield-outline" size={22} color="#888" />
          <Text style={styles.navLabel}>Security</Text>
        </TouchableOpacity>

        {/* Family is active */}
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="people" size={22} color="#1B4332" />
          <Text style={styles.navLabelActive}>Family</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  eyebrow: {
    fontSize: 13,
    color: '#7A8A80',
    marginBottom: 2,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#14201A',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1B4332',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Group card
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
  },
  groupIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EDEFEB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#14201A',
  },
  groupMeta: {
    fontSize: 13,
    color: '#7A8A80',
    marginTop: 2,
  },

  // Section label
  sectionLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#14201A',
    marginBottom: 12,
  },

  // Members card
  membersCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  memberRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1EE',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#14201A',
  },
  memberEmail: {
    fontSize: 12,
    color: '#7A8A80',
    marginTop: 2,
  },

  // Role badge
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Invite button
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 16,
  },
  inviteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#14201A',
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