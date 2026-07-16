import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { hapticSelection } from '../utils/haptics';

const tabs = [
  { label: 'Home', route: '/home', icon: 'home-outline', activeIcon: 'home' },
  { label: 'Vault', route: '/vault', icon: 'key-outline', activeIcon: 'key' },
  {
    label: 'Security',
    route: '/security',
    icon: 'shield-outline',
    activeIcon: 'shield',
  },
  {
    label: 'Family',
    route: '/family',
    icon: 'people-outline',
    activeIcon: 'people',
  },
  {
    label: 'Settings',
    route: '/settings',
    icon: 'settings-outline',
    activeIcon: 'settings',
  },
] as const;

type TabItem = (typeof tabs)[number];

const BAR_RADIUS = 50;
const BAR_VERTICAL_PADDING = 8;
const BAR_HORIZONTAL_PADDING = 8;
const BAR_HEIGHT = 70;

const PILL_HEIGHT = 65;
const PILL_WIDTH_RATIO = 0.99;
const PILL_RADIUS = 50;

/**
 * BOUNCINESS CONTROLS
 *
 * TAB_SWITCH_SPRING:
 * Controls pill movement when user taps a different tab.
 * Higher friction = less bounce.
 * Lower friction = more bounce.
 * Higher tension = faster movement.
 *
 * STATIONARY_TAP_BOUNCE:
 * Controls bounce when user taps the already-active tab.
 */
const TAB_SWITCH_SPRING = {
  friction: 14,
  tension: 190,
};

const STATIONARY_TAP_BOUNCE = {
  scaleUp: 1.13,
  translateYUp: -4,
  pressInDuration: 75,
  releaseFriction: 3,
  releaseTension: 220,
};

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
  const { isDark, colors } = useAppTheme();
  const inactiveColor = isDark ? 'rgba(243, 244, 246, 0.98)' : '#475569';

  const itemScale = useRef(new Animated.Value(active ? 1.04 : 1)).current;
  const itemTranslateY = useRef(new Animated.Value(active ? -2 : 0)).current;
  const itemOpacity = useRef(new Animated.Value(active ? 1 : 0.72)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(itemScale, {
        toValue: active ? 1.04 : 1,
        friction: 8,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.spring(itemTranslateY, {
        toValue: active ? -2 : 0,
        friction: 8,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.timing(itemOpacity, {
        toValue: active ? 1 : 0.72,
        duration: 80,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [active, itemOpacity, itemScale, itemTranslateY]);

  const handlePressIn = useCallback(() => {
    Animated.timing(pressScale, {
      toValue: 0.92,
      duration: 45,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [pressScale]);

  const handlePressOut = useCallback(() => {
    Animated.spring(pressScale, {
      toValue: 1,
      friction: 5,
      tension: 210,
      useNativeDriver: true,
    }).start();
  }, [pressScale]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      delayLongPress={120}
      style={styles.item}
    >
      <Animated.View
        style={[
          styles.itemContent,
          {
            opacity: itemOpacity,
            transform: [
              { translateY: itemTranslateY },
              { scale: pressScale },
              { scale: itemScale },
            ],
          },
        ]}
      >
        <Ionicons
          name={(active ? tab.activeIcon : tab.icon) as any}
          size={23}
          color={active ? '#FFFFFF' : inactiveColor}
        />

        <Text
          numberOfLines={1}
          style={[
            styles.label,
            {
              color: active ? '#FFFFFF' : inactiveColor,
            },
          ]}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const MemoTabItem = memo(FloatingTabItem);

function FloatingTabBar() {
  const pathname = usePathname();
  const { isDark, colors } = useAppTheme();
  const blurTarget = useBlurTarget();

  const routeActiveIndex = useMemo(() => getActiveIndex(pathname), [pathname]);

  const [localActiveIndex, setLocalActiveIndex] = useState(routeActiveIndex);
  const [barWidth, setBarWidth] = useState(0);

  const indicatorX = useRef(new Animated.Value(0)).current;
  const pillScale = useRef(new Animated.Value(1)).current;
  const pillTranslateY = useRef(new Animated.Value(0)).current;

  const localActiveIndexRef = useRef(routeActiveIndex);

  const availableWidth = Math.max(barWidth - BAR_HORIZONTAL_PADDING * 2, 0);
  const tabWidth = availableWidth > 0 ? availableWidth / tabs.length : 0;
  const pillWidth = tabWidth > 0 ? Math.max(tabWidth * PILL_WIDTH_RATIO, 50) : 0;
  const pillTop = BAR_VERTICAL_PADDING + (BAR_HEIGHT - PILL_HEIGHT) / 2 - 1;

  const getPillX = useCallback(
    (index: number) => {
      if (!tabWidth || !pillWidth) return BAR_HORIZONTAL_PADDING;

      return (
        BAR_HORIZONTAL_PADDING +
        index * tabWidth +
        (tabWidth - pillWidth) / 2
      );
    },
    [pillWidth, tabWidth]
  );

  const animateStationaryPillBounce = useCallback(() => {
    pillScale.stopAnimation();
    pillTranslateY.stopAnimation();

    Animated.sequence([
      Animated.parallel([
        Animated.timing(pillScale, {
          toValue: STATIONARY_TAP_BOUNCE.scaleUp,
          duration: STATIONARY_TAP_BOUNCE.pressInDuration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pillTranslateY, {
          toValue: STATIONARY_TAP_BOUNCE.translateYUp,
          duration: STATIONARY_TAP_BOUNCE.pressInDuration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.spring(pillScale, {
          toValue: 1,
          friction: STATIONARY_TAP_BOUNCE.releaseFriction,
          tension: STATIONARY_TAP_BOUNCE.releaseTension,
          useNativeDriver: true,
        }),
        Animated.spring(pillTranslateY, {
          toValue: 0,
          friction: STATIONARY_TAP_BOUNCE.releaseFriction,
          tension: STATIONARY_TAP_BOUNCE.releaseTension,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [pillScale, pillTranslateY]);

  const resetPillShape = useCallback(() => {
    Animated.parallel([
      Animated.spring(pillScale, {
        toValue: 1,
        friction: 8,
        tension: 180,
        useNativeDriver: true,
      }),
      Animated.spring(pillTranslateY, {
        toValue: 0,
        friction: 8,
        tension: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [pillScale, pillTranslateY]);

  const springPillToIndex = useCallback(
    (index: number) => {
      if (!tabWidth || !pillWidth) return;

      indicatorX.stopAnimation();

      Animated.spring(indicatorX, {
        toValue: getPillX(index),
        friction: TAB_SWITCH_SPRING.friction,
        tension: TAB_SWITCH_SPRING.tension,
        useNativeDriver: true,
      }).start();
    },
    [getPillX, indicatorX, pillWidth, tabWidth]
  );

  const moveToTabImmediately = useCallback(
    (index: number) => {
      const tab = tabs[index];

      localActiveIndexRef.current = index;
      setLocalActiveIndex(index);

      /**
       * Navigation happens immediately.
       * The pill animation runs alongside it instead of delaying it.
       */
      if (pathname !== tab.route) {
        router.replace(tab.route as never);
      }

      springPillToIndex(index);
      resetPillShape();
    },
    [pathname, resetPillShape, springPillToIndex]
  );

  useEffect(() => {
    localActiveIndexRef.current = localActiveIndex;
  }, [localActiveIndex]);

  useEffect(() => {
    localActiveIndexRef.current = routeActiveIndex;
    setLocalActiveIndex(routeActiveIndex);
    springPillToIndex(routeActiveIndex);
  }, [routeActiveIndex, springPillToIndex]);

  const handleTabPress = useCallback(
    (index: number) => {
      const isSameTab =
        index === localActiveIndexRef.current && pathname === tabs[index].route;

      if (isSameTab) {
        hapticSelection();
        animateStationaryPillBounce();
        return;
      }

      hapticSelection();
      moveToTabImmediately(index);
    },
    [animateStationaryPillBounce, moveToTabImmediately, pathname]
  );

  const androidBlurMethod =
    Platform.OS === 'android' ? 'dimezisBlurViewSdk31Plus' : undefined;

    //Blur configuration for the tab bar using the blur effect from expo blur.
  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <View style={styles.shadowContainer}>
        <BlurView
          blurTarget={blurTarget?.targetRef}
          blurMethod={androidBlurMethod}
          intensity={Platform.OS === 'android' ? 47 : 48}
          blurReductionFactor={Platform.OS === 'android' ? 2 : undefined}
          tint={isDark ? 'dark' : 'light'}
          style={[
            styles.blurBox,
            {
              backgroundColor: isDark
                ? 'rgba(10, 15, 20, 0.76)'
                : 'rgba(255, 255, 255, 0.72)',
              borderColor: isDark
                ? 'rgba(255,255,255,0.20)'
                : 'rgba(255,255,255,0.95)',
            },
          ]}
        >
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDark
                  ? 'rgba(2, 6, 10, 0.34)'
                  : 'rgba(255, 255, 255, 0.22)',
              },
            ]}
          />

          <View
            style={styles.innerRow}
            onLayout={(event) => {
              const width = event.nativeEvent.layout.width;
              setBarWidth(width);

              const nextAvailableWidth = Math.max(
                width - BAR_HORIZONTAL_PADDING * 2,
                0
              );

              const nextTabWidth =
                nextAvailableWidth > 0 ? nextAvailableWidth / tabs.length : 0;

              const nextPillWidth =
                nextTabWidth > 0
                  ? Math.max(nextTabWidth * PILL_WIDTH_RATIO, 50)
                  : 0;

              const nextX =
                BAR_HORIZONTAL_PADDING +
                localActiveIndexRef.current * nextTabWidth +
                (nextTabWidth - nextPillWidth) / 2;

              indicatorX.setValue(nextX || BAR_HORIZONTAL_PADDING);
            }}
          >
            {barWidth > 0 && pillWidth > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.activePill,
                  {
                    width: pillWidth,
                    height: PILL_HEIGHT,
                    top: pillTop,
                    backgroundColor: isDark
                      ? 'rgba(16, 185, 129, 0.92)'
                      : 'rgba(6, 95, 70, 0.96)',
                    borderColor: isDark
                      ? 'rgba(255,255,255,0.16)'
                      : 'rgba(255,255,255,0.68)',
                    transform: [
                      { translateX: indicatorX },
                      { translateY: pillTranslateY },
                      { scale: pillScale },
                    ],
                  },
                ]}
              >
                <View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      borderRadius: PILL_RADIUS,
                      backgroundColor: colors.primary + '38',
                    },
                  ]}
                />

                <View
                  pointerEvents="none"
                  style={[
                    styles.pillHighlight,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255,255,255,0.16)'
                        : 'rgba(255,255,255,0.24)',
                    },
                  ]}
                />
              </Animated.View>
            )}

            {tabs.map((tab, index) => {
              const active = index === localActiveIndex;

              return (
                <MemoTabItem
                  key={tab.route}
                  tab={tab}
                  active={active}
                  onPress={() => handleTabPress(index)}
                />
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

export default memo(FloatingTabBar);

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 24 : 25,
    zIndex: 999,
    elevation: 999,
  },

  shadowContainer: {
    borderRadius: BAR_RADIUS,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 18,
  },

  blurBox: {
    borderRadius: BAR_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
  },

  innerRow: {
    minHeight: BAR_HEIGHT + BAR_VERTICAL_PADDING * 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BAR_HORIZONTAL_PADDING,
    paddingVertical: BAR_VERTICAL_PADDING,
  },

  activePill: {
    position: 'absolute',
    left: 0,
    borderRadius: PILL_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    zIndex: 1,
  },

  pillHighlight: {
    position: 'absolute',
    left: 5,
    right: 5,
    top: 5,
    bottom: 5,
    borderRadius: PILL_RADIUS - 5,
  },

  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },

  itemContent: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
  },

  label: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '900',
  },
});