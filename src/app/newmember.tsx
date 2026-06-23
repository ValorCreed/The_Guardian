import React, { useState } from 'react';
import {
  SafeAreaView, View, Text, TextInput,
  TouchableOpacity, StyleSheet, StatusBar, useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../constants/theme';

type Role = 'Admin' | 'Viewer';

const ROLES: { key: Role; description: string }[] = [
  { key: 'Admin', description: 'Can manage members and shared items' },
  { key: 'Viewer', description: 'Can view shared items only' },
];

export default function InviteMemberScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const C = Colors[scheme];
  const styles = makeStyles(C);

  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>('Admin');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />

      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.6}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Invite Member</Text>
        </View>

        <View style={styles.inputRow}>
          <Ionicons name="mail-outline" size={18} color={C.tabInactive} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="member@email.com"
            placeholderTextColor={C.tabInactive}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Text style={styles.permissionLabel}>Permission role</Text>

        <View style={styles.rolesContainer}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r.key}
              activeOpacity={0.7}
              onPress={() => setSelectedRole(r.key)}
              style={[
                styles.roleOption,
                selectedRole === r.key && styles.roleOptionSelected,
              ]}
            >
              <View style={[
                styles.radioOuter,
                selectedRole === r.key && styles.radioOuterSelected,
              ]}>
                {selectedRole === r.key && (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                )}
              </View>
              <View style={styles.roleTextBlock}>
                <Text style={styles.roleLabel}>{r.key}</Text>
                <Text style={styles.roleDescription}>{r.description}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity activeOpacity={0.8} style={styles.sendButton} onPress={() => {}}>
          <Ionicons name="person-add-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.sendButtonText}>Send invitation</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home')}>
          <Ionicons name="home-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/vault')}>
          <Ionicons name="key-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Vault</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/security')}>
          <Ionicons name="shield-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Security</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="people" size={22} color={C.tabActive} />
          <Text style={styles.navLabelActive}>Family</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (C: typeof Colors.light | typeof Colors.dark) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    container: {
      marginTop: 30, flex: 1,
      paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100,
    },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
    backButton: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: C.backgroundElement,
      alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: 22, fontWeight: '700', color: C.text },
    inputRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20,
    },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, fontSize: 15, color: C.text },
    permissionLabel: { fontSize: 13, color: C.textSecondary, marginBottom: 10, marginLeft: 2 },
    rolesContainer: { gap: 10, marginBottom: 24 },
    roleOption: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 20, padding: 16,
      borderWidth: 1.5, borderColor: 'transparent',
    },
    roleOptionSelected: { borderColor: C.primary },
    radioOuter: {
      width: 24, height: 24, borderRadius: 12,
      borderWidth: 1.5, borderColor: C.border,
      backgroundColor: 'transparent',
      alignItems: 'center', justifyContent: 'center', marginRight: 14,
    },
    radioOuterSelected: { backgroundColor: C.primary, borderColor: C.primary },
    roleTextBlock: { flex: 1 },
    roleLabel: { fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 2 },
    roleDescription: { fontSize: 13, color: C.textSecondary },
    sendButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.backgroundbutton,
      borderRadius: 30, paddingVertical: 16,
    },
    sendButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
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