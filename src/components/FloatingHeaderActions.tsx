import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import { useBlurTarget } from '../context/BlurTargetContext';
import {
  type FloatingHeaderAction,
  type FloatingHeaderActionsConfig,
  useFloatingHeaderActionsRegistry,
} from '../context/FloatingHeaderActionsContext';
import { hapticDelete, hapticSelection } from '../utils/haptics';

export type { FloatingHeaderAction } from '../context/FloatingHeaderActionsContext';

type FloatingHeaderActionsProps = FloatingHeaderActionsConfig;

const BUTTON_SIZE = 60;
const GAP = 10;

/**
 * Screen-side registrar only.
 *
 * The actual BlurViews are rendered by FloatingHeaderActionsHost from
 * _layout.tsx, outside the global BlurTargetView. This is the same safe blur
 * architecture used by AnimatedBlurBackButton and FloatingActionBarHost.
 */
export default function FloatingHeaderActions(props: FloatingHeaderActionsProps) {
  const registry = useFloatingHeaderActionsRegistry();
  const ownerId = useId();
  const latestPropsRef = useRef(props);
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

  useEffect(() => {
    if (!focusedRef.current) return;
    registry.publish(ownerId, props);
  });

  return null;
}

/**
 * Global visual host.
 *
 * Keep this outside BlurTargetView in _layout.tsx. Each circular action mirrors
 * Guardian's AnimatedBlurBackButton dimensions and safe Android blur method.
 */
export function FloatingHeaderActionsHost() {
  const registry = useFloatingHeaderActionsRegistry();
  const blurTarget = useBlurTarget();
  const { isDark, colors: C } = useAppTheme();

  const [registration, setRegistration] = useState(() => registry.getCurrent());
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => registry.subscribe(setRegistration), [registry]);

  const visible = Boolean(
    registration?.visible && registration.actions.length > 0
  );

  useEffect(() => {
    opacity.stopAnimation();

    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 130,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [opacity, visible]);

  if (!registration || registration.actions.length === 0) return null;

  const androidBlurMethod =
    Platform.OS === 'android' ? 'dimezisBlurViewSdk31Plus' : undefined;

  const handlePress = (action: FloatingHeaderAction) => {
    if (action.disabled || action.loading) return;

    if (action.tone === 'danger') {
      hapticDelete();
    } else {
      hapticSelection();
    }

    action.onPress();
  };

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        styles.wrapper,
        {
          top: Platform.OS === 'ios' ? 50 : 54,
          opacity,
        },
      ]}
    >
      {registration.actions.map((action) => {
        const color =
          action.tone === 'danger'
            ? C.danger
            : action.tone === 'primary'
              ? C.primary
              : C.text;
        const disabled = Boolean(action.disabled || action.loading);

        return (
          <View key={action.key} style={styles.shadowContainer}>
            <BlurView
              blurTarget={blurTarget?.targetRef}
              blurMethod={androidBlurMethod}
              intensity={Platform.OS === 'android' ? 24 : 30}
              blurReductionFactor={Platform.OS === 'android' ? 2 : undefined}
              tint={isDark ? 'dark' : 'light'}
              style={[
                styles.blurCircle,
                {
                  backgroundColor: isDark
                    ? 'rgba(6, 10, 8, 0.58)'
                    : 'rgba(255, 255, 255, 0.56)',
                  borderColor: isDark
                    ? 'rgba(255,255,255,0.14)'
                    : 'rgba(255,255,255,0.82)',
                },
              ]}
            >
              <View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: isDark
                      ? 'rgba(6, 10, 8, 0.28)'
                      : 'rgba(255, 255, 255, 0.18)',
                  },
                ]}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={action.accessibilityLabel}
                accessibilityState={{ disabled }}
                disabled={disabled}
                hitSlop={8}
                onPress={() => handlePress(action)}
                style={({ pressed }) => [
                  styles.pressable,
                  disabled && styles.disabled,
                  pressed && !disabled && styles.pressed,
                ]}
              >
                {action.loading ? (
                  <ActivityIndicator size="small" color={color} />
                ) : (
                  <Ionicons name={action.icon as any} size={24} color={color} />
                )}
              </Pressable>
            </BlurView>
          </View>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    right: 18,
    zIndex: 1000,
    elevation: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
  },
  shadowContainer: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.10,
    shadowRadius: 18,
    elevation: 14,
  },
  blurCircle: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressable: {
    ...StyleSheet.absoluteFill,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.42,
  },
  pressed: {
    opacity: 0.68,
    transform: [{ scale: 0.94 }],
  },
});
