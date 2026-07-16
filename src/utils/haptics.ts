import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

type AlertKind = 'success' | 'error' | 'warning' | 'info';

export const HAPTICS_ENABLED_KEY = 'guardian:hapticsEnabled';

let cachedEnabled = true;
let preferenceLoaded = false;
let lastHapticAt = 0;

const MIN_HAPTIC_GAP_MS = 55;

const isHapticsAvailable = () => Platform.OS !== 'web';

export const getHapticsEnabledPreference = async () => {
  try {
    const saved = await AsyncStorage.getItem(HAPTICS_ENABLED_KEY);
    cachedEnabled = saved !== 'false';
    preferenceLoaded = true;
    return cachedEnabled;
  } catch {
    cachedEnabled = true;
    preferenceLoaded = true;
    return true;
  }
};

export const setHapticsEnabledPreference = async (enabled: boolean) => {
  cachedEnabled = enabled;
  preferenceLoaded = true;
  await AsyncStorage.setItem(HAPTICS_ENABLED_KEY, enabled ? 'true' : 'false');
};

const canRunHaptic = async () => {
  if (!isHapticsAvailable()) return false;

  if (!preferenceLoaded) {
    await getHapticsEnabledPreference();
  }

  if (!cachedEnabled) return false;

  const now = Date.now();
  if (now - lastHapticAt < MIN_HAPTIC_GAP_MS) {
    return false;
  }

  lastHapticAt = now;
  return true;
};

const runSafely = (work: () => Promise<void>) => {
  void (async () => {
    try {
      if (!(await canRunHaptic())) return;
      await work();
    } catch {
      // Haptics should never break navigation, forms, or vault actions.
    }
  })();
};

const runAndroidHaptic = async (androidName: string, fallback: () => Promise<void>) => {
  const performAndroidHapticsAsync = (Haptics as any).performAndroidHapticsAsync;
  const androidHaptics = (Haptics as any).AndroidHaptics;
  const androidValue = androidHaptics?.[androidName];

  if (Platform.OS === 'android' && performAndroidHapticsAsync && androidValue) {
    await performAndroidHapticsAsync(androidValue);
    return;
  }

  await fallback();
};

export const hapticSelection = () => {
  runSafely(() =>
    runAndroidHaptic('Segment_Tick', () => Haptics.selectionAsync())
  );
};

export const hapticLight = () => {
  runSafely(() =>
    runAndroidHaptic('Context_Click', () =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    )
  );
};

export const hapticMedium = () => {
  runSafely(() =>
    runAndroidHaptic('Confirm', () =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    )
  );
};

export const hapticHeavy = () => {
  runSafely(() =>
    runAndroidHaptic('Long_Press', () =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    )
  );
};

export const hapticSuccess = () => {
  runSafely(() =>
    runAndroidHaptic('Confirm', () =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    )
  );
};

export const hapticWarning = () => {
  runSafely(() =>
    runAndroidHaptic('Reject', () =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    )
  );
};

export const hapticError = () => {
  runSafely(() =>
    runAndroidHaptic('Reject', () =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    )
  );
};

export const hapticDelete = () => {
  hapticHeavy();
};

export const hapticToggleOn = () => {
  runSafely(() =>
    runAndroidHaptic('Toggle_On', () => Haptics.selectionAsync())
  );
};

export const hapticToggleOff = () => {
  runSafely(() =>
    runAndroidHaptic('Toggle_Off', () => Haptics.selectionAsync())
  );
};

export const hapticRefreshComplete = () => {
  hapticSuccess();
};

export const hapticScoreSettled = (score: number) => {
  if (score < 50) {
    hapticWarning();
    return;
  }

  if (score < 80) {
    hapticSelection();
    return;
  }

  hapticSuccess();
};

export const hapticForAlert = (type?: AlertKind) => {
  if (type === 'success') {
    hapticSuccess();
    return;
  }

  if (type === 'warning') {
    hapticWarning();
    return;
  }

  if (type === 'error') {
    hapticError();
    return;
  }

  hapticLight();
};
