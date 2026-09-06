import React, { useCallback, useState } from 'react';
import {
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
  LockKeyhole,
} from 'lucide-react-native';

import { useAppTheme } from '../context/ThemeContext';
import {
  AUTO_LOCK_MODE_ON_APP_CLOSE,
  AUTO_LOCK_MODE_TIMEOUT,
  AutoLockMode,
  formatAutoLockSetting,
  getAutoLockSettings,
  setAutoLockSettings,
} from '../hooks/useAutoLock';
import { hapticLight, hapticSelection, hapticSuccess } from '../utils/haptics';
import { useScreenAlert } from '../hooks/useScreenAlert';

type AutoLockOption = {
  label: string;
  subtitle: string;
  mode: AutoLockMode;
  value?: number;
};

const TIMEOUT_OPTIONS: AutoLockOption[] = [
  {
    label: 'When app closes',
    subtitle: 'Lock as soon as The Guardian moves to the background.',
    mode: AUTO_LOCK_MODE_ON_APP_CLOSE,
  },
  {
    label: '30 seconds',
    subtitle: 'Recommended default for all new accounts.',
    mode: AUTO_LOCK_MODE_TIMEOUT,
    value: 30000,
  },
  {
    label: '1 minute',
    subtitle: 'A little more time when switching apps briefly.',
    mode: AUTO_LOCK_MODE_TIMEOUT,
    value: 60000,
  },
  {
    label: '3 minutes',
    subtitle: 'Balanced for normal phone use.',
    mode: AUTO_LOCK_MODE_TIMEOUT,
    value: 180000,
  },
  {
    label: '5 minutes',
    subtitle: 'Longest option. Use only on a private device.',
    mode: AUTO_LOCK_MODE_TIMEOUT,
    value: 300000,
  },
];

export default function AutoLockScreen() {
  const screenAlert = useScreenAlert();

  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [selectedMode, setSelectedMode] = useState<AutoLockMode>(AUTO_LOCK_MODE_TIMEOUT);
  const [selectedTimeout, setSelectedTimeout] = useState(30000);

  const loadSettings = useCallback(async () => {
    const saved = await getAutoLockSettings();
    setSelectedMode(saved.mode);
    setSelectedTimeout(saved.timeout);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings])
  );

  const isOptionActive = (option: AutoLockOption) => {
    if (option.mode === AUTO_LOCK_MODE_ON_APP_CLOSE) {
      return selectedMode === AUTO_LOCK_MODE_ON_APP_CLOSE;
    }

    return selectedMode === AUTO_LOCK_MODE_TIMEOUT && selectedTimeout === option.value;
  };

  const chooseOption = async (option: AutoLockOption) => {
    const nextTimeout =
      option.mode === AUTO_LOCK_MODE_ON_APP_CLOSE
        ? -1
        : option.value || 30000;

    hapticSelection();

    setSelectedMode(option.mode);
    setSelectedTimeout(nextTimeout);

    await setAutoLockSettings({
      mode: option.mode,
      timeout: nextTimeout,
    });

    hapticSuccess();

    screenAlert(
      'Auto-lock updated',
      `Your vault will lock ${formatAutoLockSetting(option.mode, nextTimeout)}.`
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
          Auto-lock protects your vault when you leave the app.
        </Text>

        {/* <View style={styles.infoCard}>
          <InfoRow
            icon={<Smartphone size={21} color={C.primary} />}
            title="What counts as leaving?"
            text="Switching apps, pressing Home, or moving The Guardian to the background starts auto-lock protection."
            styles={styles}
          />

          <View style={styles.divider} />

          <InfoRow
            icon={<Clock3 size={21} color={C.primary} />}
            title="30 seconds is the default"
            text="This gives users a short grace period without leaving sensitive vault items open for too long."
            styles={styles}
          />

          <View style={styles.divider} />

          <InfoRow
            icon={<ShieldCheck size={21} color={C.primary} />}
            title="Strict option available"
            text="Choose 'When app closes' to lock immediately when the app goes to the background."
            styles={styles}
          />
        </View> */}

        <Text style={styles.sectionLabel}>LOCK VAULT</Text>

        <View style={styles.optionsCard}>
          {TIMEOUT_OPTIONS.map((option, index) => {
            const active = isOptionActive(option);

            return (
              <TouchableOpacity
                key={`${option.mode}-${option.value ?? 'close'}`}
                activeOpacity={0.72}
                style={[
                  styles.optionRow,
                  index !== TIMEOUT_OPTIONS.length - 1 && styles.optionDivider,
                ]}
                onPress={() => chooseOption(option)}
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
                  <Text style={styles.optionSub}>{option.subtitle}</Text>
                </View>

                {active && <Text style={styles.selectedText}>Selected</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.doneButton}
          activeOpacity={0.85}
          onPress={() => {
            hapticLight();
            router.back();
          }}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
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
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

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
    
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},

    infoRow: {
      flexDirection: 'row',
      padding: 16,
      alignItems: 'center',
    },

    infoIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

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
      color: C.textSecondary,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 1.2,
      marginBottom: 10,
      marginLeft: 4,
    },

    optionsCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: 26,
    
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},

    optionRow: {
      minHeight: 74,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
    },

    optionDivider: {
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },

    radioCircle: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      backgroundColor: C.background,
    },

    radioCircleActive: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      borderColor: C.primary,
      backgroundColor: C.primary,
    },

    optionTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: '800',
      marginBottom: 4,
    },

    optionSub: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },

    selectedText: {
      color: C.primary,
      fontSize: 12,
      fontWeight: '900',
      marginLeft: 10,
    },

    doneButton: {
      height: 56,
      borderRadius: 18,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: C.shadow,
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 11 },
      elevation: 10,
    },

    doneButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '900',
    },
  });
