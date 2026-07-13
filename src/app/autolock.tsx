import React, { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import {
  Check,
  Clock3,
  Info,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
} from 'lucide-react-native';

import { useAppTheme } from '../context/ThemeContext';
import {
  formatAutoLockTimeout,
  getAutoLockTimeout,
  setAutoLockTimeout,
} from '../hooks/useAutoLock';

const TIMEOUT_OPTIONS = [
  { label: '30 seconds', value: 30000 },
  { label: '1 minute', value: 60000 },
  { label: '5 minutes', value: 300000 },
  { label: '15 minutes', value: 900000 },
  { label: '1 hour', value: 3600000 },
];

export default function AutoLockScreen() {
  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [selectedTimeout, setSelectedTimeout] = useState(60000);

  const loadTimeout = useCallback(async () => {
    const saved = await getAutoLockTimeout();
    setSelectedTimeout(saved);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTimeout();
    }, [loadTimeout])
  );

  const chooseTimeout = async (value: number) => {
    setSelectedTimeout(value);
    await setAutoLockTimeout(value);

    Alert.alert(
      'Auto-lock updated',
      `Your vault will lock if you leave the app for ${formatAutoLockTimeout(value)}.`
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroIcon}>
          <LockKeyhole size={36} color="#fff" />
        </View>

        <Text style={styles.title}>Auto-lock</Text>

        <Text style={styles.subtitle}>
          Auto-lock protects your vault when you leave the app. The timer starts
          only after the app goes to the background.
        </Text>

        <View style={styles.infoCard}>
          <InfoRow
            icon={<Smartphone size={21} color={C.primary} />}
            title="When does the timer start?"
            text="The timer starts when you leave the app, switch apps, open a file picker, or open the camera."
            styles={styles}
          />

          <View style={styles.divider} />

          <InfoRow
            icon={<Clock3 size={21} color={C.primary} />}
            title="What happens when you return?"
            text="If you return before the timeout ends, your vault stays open. If you return after the timeout, the app locks."
            styles={styles}
          />

          <View style={styles.divider} />

          <InfoRow
            icon={<ShieldCheck size={21} color={C.primary} />}
            title="Why it matters"
            text="This helps protect your passwords, cards, and documents if you leave your phone unlocked."
            styles={styles}
          />
        </View>

        <Text style={styles.sectionLabel}>LOCK AFTER LEAVING APP</Text>

        <View style={styles.optionsCard}>
          {TIMEOUT_OPTIONS.map((option, index) => {
            const active = selectedTimeout === option.value;

            return (
              <TouchableOpacity
                key={option.value}
                activeOpacity={0.72}
                style={[
                  styles.optionRow,
                  index !== TIMEOUT_OPTIONS.length - 1 && styles.optionDivider,
                ]}
                onPress={() => chooseTimeout(option.value)}
              >
                <View
                  style={[
                    styles.radioCircle,
                    active && styles.radioCircleActive,
                  ]}
                >
                  {active && <Check size={15} color="#fff" strokeWidth={3} />}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{option.label}</Text>
                  <Text style={styles.optionSub}>
                    Lock vault after {option.label} outside the app
                  </Text>
                </View>

                {active && <Text style={styles.selectedText}>Selected</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.doneButton}
          activeOpacity={0.85}
          onPress={() => router.back()}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  icon,
  title,
  text,
  styles,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  styles: any;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>{icon}</View>

      <View style={{ flex: 1 }}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoText}>{text}</Text>
      </View>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },

    scrollContent: {
      paddingHorizontal: 18,
      paddingTop: 118,
      paddingBottom: 140,
    },

    heroIcon: {
      width: 82,
      height: 82,
      borderRadius: 28,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },

    title: {
      fontSize: 34,
      fontWeight: '900',
      color: C.text,
      marginBottom: 8,
    },

    subtitle: {
      color: C.textSecondary,
      fontSize: 15,
      lineHeight: 23,
      marginBottom: 22,
    },

    infoCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: 24,
    },

    infoRow: {
      flexDirection: 'row',
      padding: 16,
      alignItems: 'center',
    },

    infoIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: C.backgroundSelected,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },

    infoTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: '800',
      marginBottom: 3,
    },

    infoText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },

    divider: {
      height: 1,
      backgroundColor: C.border,
      marginLeft: 74,
    },

    sectionLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: C.textSecondary,
      letterSpacing: 0.6,
      marginLeft: 4,
      marginBottom: 8,
    },

    optionsCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: 22,
    },

    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 15,
    },

    optionDivider: {
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },

    radioCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      backgroundColor: C.backgroundSelected,
    },

    radioCircleActive: {
      borderColor: C.primary,
      backgroundColor: C.primary,
    },

    optionTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: '800',
    },

    optionSub: {
      color: C.textSecondary,
      fontSize: 12,
      marginTop: 3,
      lineHeight: 17,
    },

    selectedText: {
      color: C.primary,
      fontSize: 12,
      fontWeight: '800',
      marginLeft: 10,
    },

    doneButton: {
      backgroundColor: C.backgroundbutton,
      borderRadius: 50,
      paddingVertical: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },

    doneButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '900',
    },
  });