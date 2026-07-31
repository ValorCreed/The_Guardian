import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';

type PulsingSkeletonProps = {
  style?: StyleProp<ViewStyle>;
  styles?: {
    skeletonBlock?: StyleProp<ViewStyle>;
  };
};

export default function PulsingSkeleton({ style, styles }: PulsingSkeletonProps) {
  const opacity = useRef(new Animated.Value(0.42)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 720,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.42,
          duration: 720,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles?.skeletonBlock, style, { opacity }]} />;
}
