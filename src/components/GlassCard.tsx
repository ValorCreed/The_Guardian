import React from 'react';
import {
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { useAppTheme } from '../context/ThemeContext';

type GlassCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  intensity?: number;
  radius?: number;
};

/**
 * Safe glass card for normal screens.
 *
 * IMPORTANT:
 * The real target-based BlurView pattern is safe for FloatingTabBar and
 * AnimatedBlurBackButton because they are rendered outside BlurTargetView.
 * Normal screen cards are rendered inside BlurTargetView/ScrollView, so using
 * blurTarget from inside the screen can crash Android.
 *
 * This component keeps the same premium glass look without using Android
 * target-based blur inside screen content. It uses real BlurView only on iOS,
 * and a stable translucent glass fallback on Android.
 */
export default function GlassCard({
  children,
  style,
  contentStyle,
  intensity = 22,
  radius = 26,
}: GlassCardProps) {
  const { isDark } = useAppTheme();

  const borderColor = isDark
    ? 'rgba(255,255,255,0.09)'
    : 'rgba(255,255,255,0.78)';

  const fallbackBackground = isDark
    ? 'rgba(10, 15, 20, 0.92)'
    : 'rgba(255, 255, 255, 0.78)';

  const overlayBackground = isDark
    ? 'rgba(2, 6, 10, 0.08)'
    : 'rgba(255, 255, 255, 0.18)';

  const highlightBackground = isDark
    ? 'rgba(255,255,255,0.04)'
    : 'rgba(255,255,255,0.38)';

  const cardStyle = [
    styles.surface,
    {
      borderRadius: radius,
      borderColor,
      backgroundColor: fallbackBackground,
    },
    contentStyle,
  ];

  /**
   * Android note:
   * Do not use BlurView here. The working navbar/back-button blur is outside
   * BlurTargetView. Screen cards live inside the target/scroll content, and
   * target-based blur inside that tree is what causes crashes on some Android
   * devices.
   */
  if (Platform.OS === 'android') {
    return (
      <View style={[styles.shadow, { borderRadius: radius }, style]}>
        <View style={cardStyle}>
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: overlayBackground,
              },
            ]}
          />

          <View
            pointerEvents="none"
            style={[
              styles.topHighlight,
              {
                backgroundColor: highlightBackground,
                borderTopLeftRadius: radius,
                borderTopRightRadius: radius,
              },
            ]}
          />

          {children}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.shadow, { borderRadius: radius }, style]}>
      <BlurView
        intensity={intensity}
        tint={isDark ? 'dark' : 'light'}
        style={cardStyle}
      >
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: overlayBackground,
            },
          ]}
        />

        <View
          pointerEvents="none"
          style={[
            styles.topHighlight,
            {
              backgroundColor: highlightBackground,
              borderTopLeftRadius: radius,
              borderTopRightRadius: radius,
            },
          ]}
        />

        {children}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },

  surface: {
    overflow: 'hidden',
    borderWidth: 1,
  },

  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
});
