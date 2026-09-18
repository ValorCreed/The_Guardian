import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import { useBlurTarget } from '../context/BlurTargetContext';
import {
  type FloatingActionBarAction,
  type FloatingActionBarConfig,
  useFloatingActionBarRegistry,
} from '../context/FloatingActionBarContext';
import { hapticDelete, hapticSelection } from '../utils/haptics';

export type { FloatingActionBarAction } from '../context/FloatingActionBarContext';

type FloatingActionBarProps = FloatingActionBarConfig;

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

const BAR_RADIUS = 52;
const ENTER_DURATION = 190;
const EXIT_DURATION = 150;

const clampChannel = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)));

function parseHexColor(value?: string | null): RgbColor | null {
  const clean = String(value || '').trim().replace('#', '');

  if (/^[0-9a-f]{3}$/i.test(clean)) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }

  if (/^[0-9a-f]{6}$/i.test(clean) || /^[0-9a-f]{8}$/i.test(clean)) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }

  return null;
}

function rgba(value: string, alpha: number) {
  const color = parseHexColor(value) || { r: 0, g: 0, b: 0 };
  const safeAlpha = Math.max(0, Math.min(1, alpha));

  return `rgba(${clampChannel(color.r)}, ${clampChannel(color.g)}, ${clampChannel(color.b)}, ${safeAlpha})`;
}

/**
 * Screen-side registrar only.
 *
 * IMPORTANT: this component intentionally renders nothing. The real BlurView is
 * rendered by FloatingActionBarHost in _layout.tsx, OUTSIDE BlurTargetView,
 * exactly like FloatingTabBar and AnimatedBlurBackButton. Keeping the BlurView
 * outside its own BlurTargetView avoids a circular Android blur/render target.
 */
export default function FloatingActionBar(props: FloatingActionBarProps) {
  const registry = useFloatingActionBarRegistry();
  const ownerId = useId();
  const latestPropsRef = useRef<FloatingActionBarProps>(props);
  const focusedRef = useRef(false);

  latestPropsRef.current = props;

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      registry.publish(ownerId, latestPropsRef.current);

      return () => {
        focusedRef.current = false;
        registry.clear(ownerId);
      };
    }, [ownerId, registry])
  );

  // Keep callbacks/loading/selection state current while this route is focused.
  // Registry updates only rerender the host, not the route tree, so inline action
  // arrays from screens cannot create a provider rerender loop.
  useEffect(() => {
    if (!focusedRef.current) return;
    registry.publish(ownerId, props);
  });

  return null;
}

/**
 * Global visual host. Render this as a sibling AFTER BlurTargetView in
 * _layout.tsx. This mirrors the existing FloatingTabBar architecture.
 */
export function FloatingActionBarHost() {
  const registry = useFloatingActionBarRegistry();
  const blurTarget = useBlurTarget();
  const { colors, isDark } = useAppTheme();

  const [registration, setRegistration] = useState(() => registry.getCurrent());
  const [renderConfig, setRenderConfig] = useState<FloatingActionBarConfig | null>(
    () => registry.getCurrent()
  );
  const [mounted, setMounted] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [highTextContrast, setHighTextContrast] = useState(false);

  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => registry.subscribe(setRegistration), [registry]);

  const visible = Boolean(
    registration?.visible && registration.actions.length > 0
  );

  useEffect(() => {
    if (registration?.actions.length) {
      setRenderConfig({
        visible: registration.visible,
        actions: registration.actions,
        onDismiss: registration.onDismiss,
        bottomOffset: registration.bottomOffset,
      });
    }
  }, [registration]);

  const refreshAccessibilityPreferences = useCallback(async () => {
    try {
      const reduceTransparencyMethod = (AccessibilityInfo as any)
        .isReduceTransparencyEnabled;
      const highContrastMethod = (AccessibilityInfo as any)
        .isHighTextContrastEnabled;

      const [motion, transparency, highContrast] = await Promise.all([
        AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
        Platform.OS === 'ios' && typeof reduceTransparencyMethod === 'function'
          ? reduceTransparencyMethod.call(AccessibilityInfo).catch(() => false)
          : Promise.resolve(false),
        Platform.OS === 'android' && typeof highContrastMethod === 'function'
          ? highContrastMethod.call(AccessibilityInfo).catch(() => false)
          : Promise.resolve(false),
      ]);

      setReduceMotion(Boolean(motion));
      setReduceTransparency(Boolean(transparency));
      setHighTextContrast(Boolean(highContrast));
    } catch {
      // Accessibility checks must never prevent the action bar from rendering.
    }
  }, []);

  useEffect(() => {
    void refreshAccessibilityPreferences();

    const reduceMotionSubscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );

    const reduceTransparencySubscription =
      Platform.OS === 'ios'
        ? AccessibilityInfo.addEventListener(
            'reduceTransparencyChanged',
            setReduceTransparency
          )
        : null;

    return () => {
      reduceMotionSubscription.remove();
      reduceTransparencySubscription?.remove();
    };
  }, [refreshAccessibilityPreferences]);

  useEffect(() => {
    opacity.stopAnimation();

    if (visible) {
      setMounted(true);
      opacity.setValue(0);

      requestAnimationFrame(() => {
        Animated.timing(opacity, {
          toValue: 1,
          duration: reduceMotion ? 80 : ENTER_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
      return;
    }

    if (!mounted) return;

    Animated.timing(opacity, {
      toValue: 0,
      duration: reduceMotion ? 70 : EXIT_DURATION,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
        setRenderConfig(null);
      }
    });
  }, [mounted, opacity, reduceMotion, visible]);

  const palette = useMemo(() => {
    const materialBase = isDark
      ? colors.backgroundElement || '#111827'
      : colors.surface || colors.backgroundElement || '#FFFFFF';

    const content = isDark ? '#F8FAFC' : '#111827';

    return {
      surface: rgba(
        materialBase,
        reduceTransparency ? 1 : highTextContrast ? 0.96 : isDark ? 0.88 : 0.86
      ),
      border: rgba(content, highTextContrast ? 0.38 : isDark ? 0.22 : 0.14),
      scrim: isDark ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.08)',
      content,
      secondary: colors.textSecondary || rgba(content, 0.72),
      primary: colors.primary || '#0B8FAC',
      danger: colors.danger || '#DC2626',
      tint: isDark ? ('dark' as const) : ('light' as const),
      intensity: reduceTransparency ? 1 : Platform.OS === 'android' ? 45 : 62,
      shadowOpacity: highTextContrast ? 0.28 : isDark ? 0.30 : 0.18,
    };
  }, [
    colors.backgroundElement,
    colors.danger,
    colors.primary,
    colors.surface,
    colors.textSecondary,
    highTextContrast,
    isDark,
    reduceTransparency,
  ]);

  const handleActionPress = useCallback((action: FloatingActionBarAction) => {
    if (action.disabled || action.loading) return;

    if (action.tone === 'danger') {
      hapticDelete();
    } else {
      hapticSelection();
    }

    action.onPress();
  }, []);

  if (!mounted || !renderConfig || renderConfig.actions.length === 0) {
    return null;
  }

  const androidBlurMethod =
    Platform.OS === 'android'
      ? reduceTransparency
        ? 'none'
        : 'dimezisBlurViewSdk31Plus'
      : undefined;

  // Match FloatingTabBar's bottom placement exactly. Optional bottomOffset is
  // kept for future exceptional screens, but current Guardian screens use 0.
  const bottom =
    (Platform.OS === 'ios' ? 24 : 25) + (renderConfig.bottomOffset || 0);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrapper, { bottom, opacity }]}
    >
      <View
        style={[
          styles.shadowContainer,
          { shadowOpacity: palette.shadowOpacity },
        ]}
      >
        <BlurView
          blurTarget={blurTarget?.targetRef}
          blurMethod={androidBlurMethod}
          intensity={palette.intensity}
          blurReductionFactor={Platform.OS === 'android' ? 2 : undefined}
          tint={palette.tint}
          style={[
            styles.blurBox,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              borderWidth: reduceTransparency ? 1.5 : 1,
            },
          ]}
        >
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: palette.scrim },
            ]}
          />

          <View style={styles.row}>
            {renderConfig.onDismiss ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close actions"
                  hitSlop={8}
                  onPress={() => {
                    hapticSelection();
                    renderConfig.onDismiss?.();
                  }}
                  style={({ pressed }) => [
                    styles.dismissButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="close" size={20} color={palette.secondary} />
                </Pressable>
                <View
                  style={[
                    styles.separator,
                    { backgroundColor: palette.border },
                  ]}
                />
              </>
            ) : null}

            {renderConfig.actions.map((action) => {
              const actionColor =
                action.tone === 'danger'
                  ? palette.danger
                  : action.tone === 'primary'
                    ? palette.primary
                    : palette.content;

              const disabled = Boolean(action.disabled || action.loading);

              return (
                <Pressable
                  key={action.key}
                  accessibilityRole="button"
                  accessibilityLabel={action.accessibilityLabel || action.label}
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  hitSlop={4}
                  onPress={() => handleActionPress(action)}
                  style={({ pressed }) => [
                    styles.action,
                    disabled && styles.disabled,
                    pressed && !disabled && styles.pressed,
                  ]}
                >
                  {action.loading ? (
                    <ActivityIndicator size="small" color={actionColor} />
                  ) : (
                    <Ionicons
                      name={action.icon as any}
                      size={21}
                      color={actionColor}
                    />
                  )}
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.15}
                    style={[styles.actionLabel, { color: actionColor }]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </BlurView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
    elevation: 999,
  },
  shadowContainer: {
    borderRadius: BAR_RADIUS,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 22,
    elevation: 18,
  },
  blurBox: {
    borderRadius: BAR_RADIUS,
    overflow: 'hidden',
    minHeight: 73,
  },
  row: {
    minHeight: 68,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dismissButton: {
    width: 40,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  separator: {
    width: StyleSheet.hairlineWidth,
    height: 34,
    marginRight: 4,
  },
  action: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  actionLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.66,
    transform: [{ scale: 0.97 }],
  },
});
