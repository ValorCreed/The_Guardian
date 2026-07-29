import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type AddScreenEntranceProps = {
  children: React.ReactNode;
  backgroundColor: string;
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
};

export default function AddScreenEntrance({
  children,
  backgroundColor,
  style,
}: AddScreenEntranceProps) {
  const contentScale = useRef(new Animated.Value(0.997)).current;
  const contentTranslateY = useRef(new Animated.Value(4)).current;

  useEffect(() => {
    const animation = requestAnimationFrame(() => {
      Animated.parallel([
        Animated.spring(contentScale, {
          toValue: 1,
          friction: 11,
          tension: 125,
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateY, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });

    return () => cancelAnimationFrame(animation);
  }, [contentScale, contentTranslateY]);

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <Animated.View
        style={[
          styles.content,
          {
            transform: [
              { translateY: contentTranslateY },
              { scale: contentScale },
            ],
          },
        ]}
      >
        <SafeAreaView style={[styles.safeArea, style]}>
          {children}
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },

  content: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
  },
});