import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { router, usePathname } from 'expo-router';

import { useAppTheme } from '../context/ThemeContext';
import { useBlurTarget } from '../context/BlurTargetContext';

const tabs = [
  { label: 'Home', route: '/home', icon: 'home-outline', activeIcon: 'home' },
  { label: 'Vault', route: '/vault', icon: 'key-outline', activeIcon: 'key' },
  { label: 'Security', route: '/security', icon: 'shield-outline', activeIcon: 'shield' },
  { label: 'Family', route: '/family', icon: 'people-outline', activeIcon: 'people' },
  { label: 'Settings', route: '/settings', icon: 'settings-outline', activeIcon: 'settings' },
] as const;

type TabItem = (typeof tabs)[number];

function getActiveIndex(pathname: string) {
  const index = tabs.findIndex(
    (tab) => pathname === tab.route || pathname.startsWith(`${tab.route}/`)
  );

  return index === -1 ? 0 : index;
}

function FloatingTabItem({
  tab,
  active,
  onPress,
}: {
  tab: TabItem;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  const scale = useRef(new Animated.Value(active ? 1.05 : 1)).current;
  const translateY = useRef(new Animated.Value(active ? -2 : 0)).current;
  const opacity = useRef(new Animated.Value(active ? 1 : 0.72)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: active ? 1.05 : 1,
        friction: 8,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: active ? -2 : 0,
        friction: 8,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: active ? 1 : 0.72,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [active, opacity, scale, translateY]);

  const animatePress = () => {
    Animated.sequence([
      Animated.timing(pressScale, {
        toValue: 0.9,
        duration: 70,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(pressScale, {
        toValue: 1,
        friction: 4,
        tension: 120,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePress = () => {
    animatePress();
    onPress();
  };

  return (
    <Pressable onPress={handlePress} style={styles.item}>
      <Animated.View
        style={[
          styles.itemContent,
          {
            opacity,
            transform: [{ translateY }, { scale: pressScale }, { scale }],
          },
        ]}
      >
        <Ionicons
          name={(active ? tab.activeIcon : tab.icon) as any}
          size={22}
          color={active ? '#FFFFFF' : colors.tabInactive}
        />

        <Text
          numberOfLines={1}
          style={[
            styles.label,
            {
              color: active ? '#FFFFFF' : colors.tabInactive,
            },
          ]}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export default function FloatingTabBar() {
  const pathname = usePathname();
  const { isDark, colors } = useAppTheme();
  const blurTarget = useBlurTarget();

  const activeIndex = useMemo(() => getActiveIndex(pathname), [pathname]);

  const [barWidth, setBarWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;

  const tabWidth = barWidth > 0 ? barWidth / tabs.length : 0;

  useEffect(() => {
    if (!tabWidth) return;

    Animated.spring(indicatorX, {
      toValue: activeIndex * tabWidth,
      friction: 10,
      tension: 85,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, indicatorX, tabWidth]);

  const handleTabPress = (route: string, active: boolean) => {
    if (!active) {
      router.replace(route as never);
    }
  };

  const androidBlurMethod =
    Platform.OS === 'android' ? 'dimezisBlurViewSdk31Plus' : undefined;

  /**
   * ACTIVE SELECTOR SIZE CONTROLS
   *
   * Change these values to resize the oval selector:
   *
   * pillHorizontalInset: bigger number = narrower selector
   * pillTop: bigger number = shorter selector
   * pillBottom: bigger number = shorter selector
   * pillRadius: 999 gives a full oval/pill shape
   */
  const pillHorizontalInset = 9;
  const pillTop = 7;
  const pillBottom = 10;
  const pillWidth = Math.max(tabWidth - pillHorizontalInset, 48);

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <View style={styles.shadowContainer}>
        <BlurView
          blurTarget={blurTarget?.targetRef}
          blurMethod={androidBlurMethod}
          intensity={Platform.OS === 'android' ? 15 : 15}
          blurReductionFactor={Platform.OS === 'android' ? 2 : undefined}
          tint={isDark ? 'dark' : 'light'}
          style={[
            styles.blurBox,
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

          <View
            style={styles.innerRow}
            onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
          >
            {barWidth > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.activePill,
                  {
                    width: pillWidth,
                    top: pillTop,
                    bottom: pillBottom,
                    backgroundColor: isDark
                      ? 'rgba(21, 168, 106, 0.72)'
                      : 'rgba(21, 168, 106, 0.86)',
                    borderColor: isDark
                      ? 'rgba(255,255,255,0.16)'
                      : 'rgba(255,255,255,0.68)',
                    transform: [
                      {
                        translateX: indicatorX.interpolate({
                          inputRange: [0, barWidth],
                          outputRange: [
                            pillHorizontalInset / 2,
                            barWidth + pillHorizontalInset / 2,
                          ],
                          extrapolate: 'clamp',
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      borderRadius: 999,
                      backgroundColor: colors.primary + '55',
                    },
                  ]}
                />

                <View
                  pointerEvents="none"
                  style={styles.pillHighlight}
                />
              </Animated.View>
            )}

            {tabs.map((tab, index) => {
              const active = index === activeIndex;

              return (
                <FloatingTabItem
                  key={tab.route}
                  tab={tab}
                  active={active}
                  onPress={() => handleTabPress(tab.route, active)}
                />
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 24 : 18,
    zIndex: 999,
    elevation: 999,
  },

  shadowContainer: {
    borderRadius: 34,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 18,
  },

  blurBox: {
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: 1,
  },

  innerRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },

  activePill: {
    position: 'absolute',
    left: 2,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
  },

  pillHighlight: {
    position: 'absolute',
    left: 3,
    right: 3,
    top: 3,
    height: 50,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  itemContent: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
  },

  label: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '700',
  },
});