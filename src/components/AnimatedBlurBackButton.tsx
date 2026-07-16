import React, { useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

import { useAppTheme } from '../context/ThemeContext';
import { useBlurTarget } from '../context/BlurTargetContext';
import { hapticLight } from '../utils/haptics';

type AnimatedBlurBackButtonProps = {
  onPress?: () => void;
  top?: number;
  left?: number;
  style?: ViewStyle;
};

const BUTTON_SIZE = 60;

/**
 * IMPORTANT:
 * This button is designed to be rendered from _layout.tsx, OUTSIDE BlurTargetView.
 * That matches the working FloatingTabBar pattern and prevents Android blur crashes.
 */
export default function AnimatedBlurBackButton({
  onPress,
  top = Platform.OS === 'ios' ? 50 : 54,
  left = 18,
  style,
}: AnimatedBlurBackButtonProps) {
  const router = useRouter();
  const { isDark, colors: C } = useAppTheme();
  const blurTarget = useBlurTarget();

  const pressScale = useRef(new Animated.Value(1)).current;
  const liquidScale = useRef(new Animated.Value(0.18)).current;
  const liquidOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(1)).current;

  const androidBlurMethod =
    Platform.OS === 'android' ? 'dimezisBlurViewSdk31Plus' : undefined;

  const animateIn = () => {
    liquidScale.stopAnimation();
    liquidOpacity.stopAnimation();
    pressScale.stopAnimation();
    iconScale.stopAnimation();

    liquidScale.setValue(0.18);
    liquidOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(pressScale, {
        toValue: 0.94,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(iconScale, {
        toValue: 0.88,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(liquidScale, {
        toValue: 1.18,
        duration: 230,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(liquidOpacity, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateOut = () => {
    Animated.parallel([
      Animated.spring(pressScale, {
        toValue: 1,
        friction: 6,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.spring(iconScale, {
        toValue: 1,
        friction: 6,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.timing(liquidScale, {
        toValue: 1.55,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(liquidOpacity, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePress = () => {
    hapticLight();

    if (onPress) {
      onPress();
      return;
    }

    router.back();
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          top,
          left,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.shadowContainer,
          {
            transform: [{ scale: pressScale }],
          },
        ]}
      >
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

          <Animated.View
            pointerEvents="none"
            style={[
              styles.liquidFill,
              {
                backgroundColor: isDark
                  ? 'rgba(255,255,255,0.18)'
                  : 'rgba(0,0,0,0.08)',
                opacity: liquidOpacity,
                transform: [{ scale: liquidScale }],
              },
            ]}
          />

          <Pressable
            onPress={handlePress}
            onPressIn={animateIn}
            onPressOut={animateOut}
            style={styles.pressable}
            hitSlop={8}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.iconWrap,
                {
                  transform: [{ scale: iconScale }],
                },
              ]}
            >
              <ChevronLeft size={26} color={C.text} strokeWidth={3} />
            </Animated.View>
          </Pressable>
        </BlurView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    zIndex: 1000,
    elevation: 1000,
  },

  shadowContainer: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.18,
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

  liquidFill: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
  },

  pressable: {
    ...StyleSheet.absoluteFill,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconWrap: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
