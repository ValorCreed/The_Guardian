import React from 'react';
import { ScrollView, View, Text,
  TouchableOpacity, StyleSheet, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppTheme } from '../context/ThemeContext';
import FloatingTabBar from '../components/FloatingTabBar';
import { SafeAreaView } from 'react-native-safe-area-context';

type Role = 'Owner' | 'Admin' | 'Viewer';
interface Member {
  id: string; name: string; email: string;
  initials: string; avatarColor: string; role: Role;
}

const MEMBERS: Member[] = [
  { id: '1', name: 'Alex Morgan', email: 'alex@guardian.app', initials: 'AM', avatarColor: '#1a5c35', role: 'Owner' },
  { id: '2', name: 'Jamie Morgan', email: 'jamie@guardian.app', initials: 'JM', avatarColor: '#2e7d52', role: 'Admin' },
  { id: '3', name: 'Sam Morgan', email: 'sam@guardian.app', initials: 'SM', avatarColor: '#f5a623', role: 'Viewer' },
];

export default function FamilyScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const roleBadge = (role: Role) => {
    if (role === 'Admin') return { bg: C.backgroundSelected, text: C.info };
    return { bg: C.backgroundSelected, text: C.textSecondary };
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>3 of 6 members</Text>
            <Text style={styles.title}>Family</Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={() => router.push('/newmember')}>
            <Ionicons name="person-add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Group card */}
        <View style={styles.groupCard}>
          <View style={styles.groupIconCircle}>
            <Ionicons name="people" size={22} color={C.primary} />
          </View>
          <View>
            <Text style={styles.groupName}>Morgan Family</Text>
            <Text style={styles.groupMeta}>3 members · 1 shared vault</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Members</Text>

        <View style={styles.membersCard}>
          {MEMBERS.map((member, index) => {
            const badge = roleBadge(member.role);
            return (
              <View
                key={member.id}
                style={[styles.memberRow, index !== MEMBERS.length - 1 && styles.memberRowDivider]}
              >
                <View style={[styles.avatar, { backgroundColor: member.avatarColor }]}>
                  <Text style={styles.avatarText}>{member.initials}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberEmail}>{member.email}</Text>
                </View>
                <View style={[styles.roleBadge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.roleBadgeText, { color: badge.text }]}>{member.role}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={styles.inviteButton} activeOpacity={0.7} onPress={() => router.push('/newmember')}>
          <Ionicons name="person-add-outline" size={18} color={C.text} style={{ marginRight: 8 }} />
          <Text style={styles.inviteButtonText}>Invite member</Text>
        </TouchableOpacity>
      </ScrollView>

      <FloatingTabBar />
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    scrollContent: { marginTop: 35, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
    header: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', marginBottom: 20,
    },
    eyebrow: { fontSize: 13, color: C.textSecondary, marginBottom: 2 },
    title: { fontSize: 30, fontWeight: '700', color: C.text },
    addButton: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: C.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    groupCard: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 20, padding: 16, marginBottom: 24,
    },
    groupIconCircle: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center', justifyContent: 'center', marginRight: 14,
    },
    groupName: { fontSize: 16, fontWeight: '600', color: C.text },
    groupMeta: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
    sectionLabel: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 12 },
    membersCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20, overflow: 'hidden', marginBottom: 16,
    },
    memberRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 14, paddingHorizontal: 14,
    },
    memberRowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    avatar: {
      width: 42, height: 42, borderRadius: 21,
      alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    avatarText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    memberInfo: { flex: 1 },
    memberName: { fontSize: 15, fontWeight: '600', color: C.text },
    memberEmail: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    roleBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
    roleBadgeText: { fontSize: 13, fontWeight: '500' },
    inviteButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 20, paddingVertical: 16,
    },
    inviteButtonText: { fontSize: 16, fontWeight: '600', color: C.text },
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