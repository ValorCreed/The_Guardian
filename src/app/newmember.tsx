import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = 'Admin' | 'Viewer';

const ROLES: { key: Role; description: string }[] = [
  { key: 'Admin', description: 'Can manage members and shared items' },
  { key: 'Viewer', description: 'Can view shared items only' },
];

// ---------------------------------------------------------------------------
// Role option row
// ---------------------------------------------------------------------------

const RoleOption = ({
  role,
  description,
  selected,
  onPress,
}: {
  role: Role;
  description: string;
  selected: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity
    activeOpacity={0.7}
    onPress={onPress}
    style={[styles.roleOption, selected && styles.roleOptionSelected]}
  >
    <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
      {selected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
    </View>
    <View style={styles.roleTextBlock}>
      <Text style={styles.roleLabel}>{role}</Text>
      <Text style={styles.roleDescription}>{description}</Text>
    </View>
  </TouchableOpacity>
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function InviteMemberScreen() {
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>('Admin');

  const handleSend = () => {
    // hook up invite logic here
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#E8E8E4" />

      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.6}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={20} color="#14201A" />
          </TouchableOpacity>
          <Text style={styles.title}>Invite Member</Text>
        </View>

        {/* Email input */}
        <View style={styles.inputRow}>
          <Ionicons name="mail-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="member@email.com"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Permission role */}
        <Text style={styles.permissionLabel}>Permission role</Text>

        <View style={styles.rolesContainer}>
          {ROLES.map((r) => (
            <RoleOption
              key={r.key}
              role={r.key}
              description={r.description}
              selected={selectedRole === r.key}
              onPress={() => setSelectedRole(r.key)}
            />
          ))}
        </View>

        {/* Send invitation button */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.sendButton}
          onPress={handleSend}
        >
          <Ionicons name="person-add-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.sendButtonText}>Send invitation</Text>
        </TouchableOpacity>
      </View>

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
  container: {
    marginTop: 30,
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#14201A',
  },

  // Email input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#14201A',
  },

  // Permission label
  permissionLabel: {
    fontSize: 13,
    color: '#7A8A80',
    marginBottom: 10,
    marginLeft: 2,
  },

  // Role options
  rolesContainer: {
    gap: 10,
    marginBottom: 24,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  roleOptionSelected: {
    borderColor: '#1B4332',
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#C4C9C4',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  radioOuterSelected: {
    backgroundColor: '#1B4332',
    borderColor: '#1B4332',
  },
  roleTextBlock: {
    flex: 1,
  },
  roleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#14201A',
    marginBottom: 2,
  },
  roleDescription: {
    fontSize: 13,
    color: '#7A8A80',
  },

  // Send button
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B4332',
    borderRadius: 30,
    paddingVertical: 16,
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
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