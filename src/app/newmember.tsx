import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CreditCard, FileText, KeyRound, Mail, NotebookText, UserPlus } from 'lucide-react-native';

import { api } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import { hapticToggleOn, hapticToggleOff, hapticWarning, hapticSuccess } from '../utils/haptics';

export default function NewMemberScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [email, setEmail] = useState('');
  const [sharePasswords, setSharePasswords] = useState(true);
  const [shareCards, setShareCards] = useState(false);
  const [shareDocuments, setShareDocuments] = useState(false);
  const [shareNotes, setShareNotes] = useState(false);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  const ensureFamilyPlanBeforeSubmit = async () => {
    const subscription = await api.getSubscriptionFresh?.();

    const plan = String(subscription?.plan || '').toUpperCase();
    const active = subscription?.active !== false;

    if (plan !== 'FAMILY' || !active) {
      Alert.alert(
        'Family plan required',
        'This account is not currently recognized as a Family plan account by the server. Refresh your subscription, sign in again, or confirm the subscription is active.'
      );
      return false;
    }

    return true;
  };

  const handleAddMember = async () => {
    if (submittingRef.current || loading) return;

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      hapticWarning();
      Alert.alert('Missing email', 'Enter the email of the user you want to add.');
      return;
    }

    if (!sharePasswords && !shareCards && !shareDocuments && !shareNotes) {
      hapticWarning();
      Alert.alert('Choose what to share', 'Select at least one vault type: passwords, cards, documents, or secure notes.');
      return;
    }

    try {
      submittingRef.current = true;
      setLoading(true);

      const familyAllowed = await ensureFamilyPlanBeforeSubmit();
      if (!familyAllowed) {
        return;
      }

      /*
       * Check the target account before creating the family member.
       * This prevents the confusing case where a non-existing email reaches
       * the create endpoint and gets displayed as a Family-plan error.
       */
      try {
        await api.lookupFamilyMemberAccount(cleanEmail);
      } catch (lookupError: any) {
        const lookupStatus = lookupError?.status;
        const lookupCode = String(lookupError?.code || '').toUpperCase();

        if (lookupStatus === 404 || lookupCode === 'ACCOUNT_NOT_FOUND') {
          hapticWarning();
          Alert.alert(
            'Account not found',
            'That email is not registered on The Guardian. Ask the person to create an account first, then add them again.'
          );
          return;
        }

        if (lookupStatus === 403 || lookupCode === 'FAMILY_PLAN_REQUIRED') {
          hapticWarning();
          Alert.alert(
            'Family plan required',
            'Only Family plan users can add members. Refresh your subscription, sign in again, or confirm that this account is active on the Family plan.'
          );
          return;
        }

        throw lookupError;
      }

      await api.addFamilyMember(cleanEmail, {
        sharePasswords,
        shareCards,
        shareDocuments,
        shareNotes,
      });
      api.clearCache();

      hapticSuccess();
      Alert.alert('Member added', 'This user can now access the vault types you selected.', [
        { text: 'OK', onPress: () => router.replace('/family') },
      ]);
    } catch (error: any) {
      const status = error?.status;
      const message =
        status === 404
          ? 'That email is not registered on The Guardian. Ask the person to create an account first, then add them again.'
          : status === 403
            ? 'Only Family plan users can add members. Refresh your subscription, sign in again, or confirm that this account is active on the Family plan.'
            : error?.message || 'Please try again.';

      const title =
        status === 404
          ? 'Account not found'
          : status === 403
            ? 'Family plan required'
            : 'Could not add member';

      hapticWarning();
      Alert.alert(title, message);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.iconBox}>
          <UserPlus size={34} color="#fff" />
        </View>

        <Text style={styles.title}>Add family member</Text>
        <Text style={styles.subtitle}>
          Enter the email address of someone who already has a Guardian account, then choose what they can view.
        </Text>

        <Text style={styles.label}>Member email</Text>
        <View style={styles.inputBox}>
          <Mail size={20} color={C.textSecondary} />
          <TextInput
            style={styles.input}
            placeholder="family@example.com"
            placeholderTextColor={C.tabInactive}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
          />
        </View>

        <Text style={styles.sectionLabel}>WHAT SHOULD THIS MEMBER ACCESS?</Text>

        <View style={styles.permissionsCard}>
          <PermissionRow
            icon={<KeyRound size={20} color={C.primary} />}
            title="Passwords"
            subtitle="Share saved login credentials"
            value={sharePasswords}
            onChange={setSharePasswords}
            C={C}
            styles={styles}
            divider
          />

          <PermissionRow
            icon={<CreditCard size={20} color={C.primary} />}
            title="Cards"
            subtitle="Share saved credit/debit cards"
            value={shareCards}
            onChange={setShareCards}
            C={C}
            styles={styles}
            divider
          />

          <PermissionRow
            icon={<FileText size={20} color={C.primary} />}
            title="Documents"
            subtitle="Share uploaded encrypted documents"
            value={shareDocuments}
            onChange={setShareDocuments}
            C={C}
            styles={styles}
            divider
          />

          <PermissionRow
            icon={<NotebookText size={20} color={C.primary} />}
            title="Secure notes"
            subtitle="Share encrypted notes, recovery codes, and private text"
            value={shareNotes}
            onChange={setShareNotes}
            C={C}
            styles={styles}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.disabledButton]}
          onPress={handleAddMember}
          disabled={loading}
          activeOpacity={0.75}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Add member</Text>}
        </TouchableOpacity>

        <Text style={styles.note}>
          Only Family plan users can add members. Members can only view the vault types you select; they cannot edit or delete your items.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PermissionRow({
  icon,
  title,
  subtitle,
  value,
  onChange,
  C,
  styles,
  divider,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (value: boolean) => void;
  C: any;
  styles: any;
  divider?: boolean;
}) {
  return (
    <View style={[styles.permissionRow, divider && styles.permissionDivider]}>
      <View style={styles.permissionIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.permissionTitle}>{title}</Text>
        <Text style={styles.permissionSub}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue) {
            hapticToggleOn();
          } else {
            hapticToggleOff();
          }
          onChange(nextValue);
        }}
        trackColor={{ false: C.border, true: C.primary }}
        thumbColor="#fff"
        ios_backgroundColor={C.border}
      />
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.background },
    scrollContent: { paddingHorizontal: 20, paddingTop: 100, paddingBottom: 150 },
    backButton: { marginTop: 6, marginBottom: 30 },
    backText: { color: C.text, fontSize: 18, fontWeight: '600' },
    iconBox: {
      width: 86,
      height: 86,
      borderRadius: 28,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 28,
    },
    title: { color: C.text, fontSize: 34, fontWeight: '800', marginBottom: 10 },
    subtitle: { color: C.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 30 },
    label: { color: C.text, fontWeight: '800', fontSize: 14, marginBottom: 8 },
    inputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 22,
    },
    input: { flex: 1, color: C.text, fontSize: 16, paddingVertical: 16, paddingLeft: 10 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: C.textSecondary,
      letterSpacing: 0.5,
      marginLeft: 4,
      marginBottom: 8,
    },
    permissionsCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: 18,
    },
    permissionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    permissionDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    permissionIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundSelected,
      marginRight: 12,
    },
    permissionTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
    permissionSub: { color: C.textSecondary, fontSize: 12, marginTop: 3 },
    button: {
      backgroundColor: C.primary,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 17,
      marginTop: 4,
    },
    disabledButton: { opacity: 0.7 },
    buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    note: { color: C.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 18, textAlign: 'center' },
  });
