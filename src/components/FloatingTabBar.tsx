import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
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
import AsyncStorage from '@react-native-async-storage/async-storage';

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

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

type AdaptiveTabBarPalette = {
  activeContent: string;
  activeShadow: string;
  barBorder: string;
  barSurface: string;
  blurIntensity: number;
  inactiveContent: string;
  inactiveShadow: string;
  pillBackground: string;
  pillBorder: string;
  pillBottomShade: string;
  pillDepth: string;
  pillHighlight: string;
  pillShadow: string;
  reduceTransparency: boolean;
  scrim: string;
  shadowOpacity: number;
  tint: 'light' | 'dark';
};

const BAR_RADIUS = 50;
const BAR_VERTICAL_PADDING = 8;
const BAR_HORIZONTAL_PADDING = 8;
const BAR_HEIGHT = 72;

const PILL_HEIGHT = 64;
const PILL_WIDTH_RATIO = 0.92;
const PILL_RADIUS = 24;

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

function rgbToHex(color: RgbColor) {
  const value = [color.r, color.g, color.b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, '0'))
    .join('');

  return `#${value}`;
}

function rgba(value: string, alpha: number) {
  const color = parseHexColor(value) || { r: 0, g: 0, b: 0 };
  const safeAlpha = Math.max(0, Math.min(1, alpha));

  return `rgba(${color.r}, ${color.g}, ${color.b}, ${safeAlpha})`;
}

function blendColors(
  foreground: string,
  background: string,
  foregroundAlpha: number
) {
  const front = parseHexColor(foreground) || { r: 0, g: 0, b: 0 };
  const back = parseHexColor(background) || { r: 255, g: 255, b: 255 };
  const alpha = Math.max(0, Math.min(1, foregroundAlpha));

  return rgbToHex({
    r: front.r * alpha + back.r * (1 - alpha),
    g: front.g * alpha + back.g * (1 - alpha),
    b: front.b * alpha + back.b * (1 - alpha),
  });
}

function linearizeChannel(channel: number) {
  const value = channel / 255;
  return value <= 0.03928
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

function getRelativeLuminance(value: string) {
  const color = parseHexColor(value) || { r: 0, g: 0, b: 0 };

  return (
    0.2126 * linearizeChannel(color.r) +
    0.7152 * linearizeChannel(color.g) +
    0.0722 * linearizeChannel(color.b)
  );
}

function getContrastRatio(first: string, second: string) {
  const firstLuminance = getRelativeLuminance(first);
  const secondLuminance = getRelativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function pickMostReadableColor(
  background: string,
  darkCandidate = '#07120E',
  lightCandidate = '#FFFFFF'
) {
  return getContrastRatio(background, darkCandidate) >=
    getContrastRatio(background, lightCandidate)
    ? darkCandidate
    : lightCandidate;
}

function useAdaptiveTabBarPalette(): AdaptiveTabBarPalette {
  const { isDark, isOled, colors } = useAppTheme();

  const [highTextContrast, setHighTextContrast] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);

  const refreshAccessibilityPreferences = useCallback(async () => {
    try {
      const highContrastMethod = (AccessibilityInfo as any)
        .isHighTextContrastEnabled;
      const reduceTransparencyMethod = (AccessibilityInfo as any)
        .isReduceTransparencyEnabled;

      const [highContrastResult, reduceTransparencyResult] =
        await Promise.allSettled([
          Platform.OS === 'android' && typeof highContrastMethod === 'function'
            ? highContrastMethod.call(AccessibilityInfo)
            : Promise.resolve(false),
          Platform.OS === 'ios' &&
          typeof reduceTransparencyMethod === 'function'
            ? reduceTransparencyMethod.call(AccessibilityInfo)
            : Promise.resolve(false),
        ]);

      if (highContrastResult.status === 'fulfilled') {
        setHighTextContrast(Boolean(highContrastResult.value));
      }

      if (reduceTransparencyResult.status === 'fulfilled') {
        setReduceTransparency(Boolean(reduceTransparencyResult.value));
      }
    } catch {
      // Accessibility preference checks must never prevent navigation.
    }
  }, []);

  useEffect(() => {
    void refreshAccessibilityPreferences();

    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextState) => {
        if (nextState === 'active') {
          void refreshAccessibilityPreferences();
        }
      }
    );

    const reduceTransparencySubscription =
      Platform.OS === 'ios'
        ? AccessibilityInfo.addEventListener(
            'reduceTransparencyChanged',
            setReduceTransparency
          )
        : null;

    return () => {
      appStateSubscription.remove();
      reduceTransparencySubscription?.remove();
    };
  }, [refreshAccessibilityPreferences]);

  return useMemo(() => {
    /*
     * BlurView renders the live screen content behind the bar. Instead of
     * attempting expensive screenshot/pixel sampling, the bar adds an adaptive
     * material layer strong enough to control the final luminance. Icon colors
     * are then selected from the calculated luminance of that rendered surface.
     *
     * This keeps the icons readable even when a bright card, dark card, image,
     * or OLED-black section scrolls behind the navigation bar.
     */
    const backdrop = colors.background || (isDark ? '#0A0F14' : '#F8FAF9');
    const materialBase = isDark
      ? colors.backgroundElement || '#111827'
      : colors.surface || '#FFFFFF';

    const materialAlpha = reduceTransparency
      ? 1
      : highTextContrast
        ? 0.95
        : isOled
          ? 0.96
          : isDark
            ? 0.94
            : 0.93;

    const estimatedSurface = blendColors(
      materialBase,
      backdrop,
      materialAlpha
    );

    const inactiveContent = pickMostReadableColor(
      estimatedSurface,
      '#111827',
      '#F8FAFC'
    );

    const pillBase = isDark
      ? colors.primaryDark || colors.primary || '#064737'
      : colors.primaryDark || colors.primary || '#065F46';

    const activeContent = pickMostReadableColor(
      pillBase,
      '#06110D',
      '#FFFFFF'
    );

    const inactiveIsLight = getRelativeLuminance(inactiveContent) > 0.55;
    const activeIsLight = getRelativeLuminance(activeContent) > 0.55;

    return {
      activeContent,
      activeShadow: activeIsLight
        ? 'rgba(0,0,0,0.36)'
        : 'rgba(255,255,255,0.24)',
      barBorder: highTextContrast
        ? rgba(inactiveContent, 0.4)
        : rgba(inactiveContent, isDark ? 0.22 : 0.15),
      barSurface: rgba(materialBase, materialAlpha),
      blurIntensity: reduceTransparency
        ? 1
        : Platform.OS === 'android'
          ? 35
          : 62,
      inactiveContent,
      inactiveShadow: inactiveIsLight
        ? 'rgba(0,0,0,0.52)'
        : 'rgba(255,255,255,0.36)',
      pillBackground: rgba(pillBase, highTextContrast ? 1 : 0.98),
      pillBorder: rgba(activeContent, highTextContrast ? 0.5 : 0.28),
      pillBottomShade: 'rgba(0,0,0,0.16)',
      pillDepth: blendColors(pillBase, '#000000', isDark ? 0.7 : 0.76),
      pillHighlight: rgba(activeContent, activeIsLight ? 0.16 : 0.11),
      pillShadow: isDark ? '#000000' : blendColors(pillBase, '#000000', 0.58),
      reduceTransparency,
      scrim: isDark
        ? 'rgba(0,0,0,0.10)'
        : 'rgba(255,255,255,0.08)',
      shadowOpacity: highTextContrast ? 0.3 : isDark ? 0.3 : 0.2,
      tint: isDark ? 'dark' : 'light',
    };
  }, [
    colors.background,
    colors.backgroundElement,
    colors.primary,
    colors.primaryDark,
    colors.primaryLight,
    colors.surface,
    highTextContrast,
    isDark,
    isOled,
    reduceTransparency,
  ]);
}

function getActiveIndex(pathname: string, tabItems: readonly TabItem[]) {
  const index = tabItems.findIndex(
    (tab) => pathname === tab.route || pathname.startsWith(`${tab.route}/`)
  );

  return index === -1 ? 0 : index;
}

function FloatingTabItem({
  tab,
  active,
  onPress,
  palette,
}: {
  tab: TabItem;
  active: boolean;
  onPress: () => void;
  palette: AdaptiveTabBarPalette;
}) {
  const itemScale = useRef(new Animated.Value(active ? 1.04 : 1)).current;
  const itemTranslateY = useRef(new Animated.Value(active ? -2 : 0)).current;
  const itemOpacity = useRef(new Animated.Value(1)).current;
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
        toValue: 1,
        duration: 100,
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

  const contentColor = active
    ? palette.activeContent
    : palette.inactiveContent;

  const contentShadow = active
    ? palette.activeShadow
    : palette.inactiveShadow;

  return (
    <Pressable
      accessibilityLabel={`${tab.label} tab`}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      hitSlop={4}
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
          size={active ? 25 : 24}
          color={contentColor}
          style={{
            textShadowColor: contentShadow,
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 2,
          }}
        />

        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          style={[
            styles.label,
            {
              color: contentColor,
              textShadowColor: contentShadow,
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 2,
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
  const blurTarget = useBlurTarget();
  const palette = useAdaptiveTabBarPalette();

  const [duressMode, setDuressMode] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('guardianSessionMode')
      .then((value) => {
        if (active) setDuressMode(value === 'DURESS');
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [pathname]);

  const visibleTabs = useMemo(
    () => (duressMode === true ? tabs.slice(0, 2) : tabs),
    [duressMode]
  );
  const routeActiveIndex = useMemo(
    () => getActiveIndex(pathname, visibleTabs),
    [pathname, visibleTabs]
  );

  const [localActiveIndex, setLocalActiveIndex] = useState(routeActiveIndex);
  const [barWidth, setBarWidth] = useState(0);

  const indicatorX = useRef(new Animated.Value(0)).current;
  const pillScale = useRef(new Animated.Value(1)).current;
  const pillTranslateY = useRef(new Animated.Value(0)).current;

  const localActiveIndexRef = useRef(routeActiveIndex);
  const pillPositionedRef = useRef(false);

  const availableWidth = Math.max(barWidth - BAR_HORIZONTAL_PADDING * 2, 0);
  const tabWidth = availableWidth > 0 ? availableWidth / visibleTabs.length : 0;
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
      const tab = visibleTabs[index];

      localActiveIndexRef.current = index;
      setLocalActiveIndex(index);

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

    if (!tabWidth || !pillWidth) return;

    if (!pillPositionedRef.current) {
      indicatorX.stopAnimation();
      indicatorX.setValue(getPillX(routeActiveIndex));
      pillPositionedRef.current = true;
      return;
    }

    springPillToIndex(routeActiveIndex);
  }, [
    getPillX,
    indicatorX,
    pillWidth,
    routeActiveIndex,
    springPillToIndex,
    tabWidth,
  ]);

  const handleTabPress = useCallback(
    (index: number) => {
      const isSameTab =
        index === localActiveIndexRef.current && pathname === visibleTabs[index].route;

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
    Platform.OS === 'android'
      ? palette.reduceTransparency
        ? 'none'
        : 'dimezisBlurViewSdk31Plus'
      : undefined;

  if (duressMode === null) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <View
        style={[
          styles.shadowContainer,
          { shadowOpacity: palette.shadowOpacity },
        ]}
      >
        <BlurView
          blurTarget={blurTarget?.targetRef}
          blurMethod={androidBlurMethod}
          intensity={palette.blurIntensity}
          blurReductionFactor={Platform.OS === 'android' ? 2 : undefined}
          tint={palette.tint}
          style={[
            styles.blurBox,
            {
              backgroundColor: palette.barSurface,
              borderColor: palette.barBorder,
              borderWidth: palette.reduceTransparency ? 1.5 : 1,
            },
          ]}
        >
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: palette.scrim,
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
                nextAvailableWidth > 0 ? nextAvailableWidth / visibleTabs.length : 0;

              const nextPillWidth =
                nextTabWidth > 0
                  ? Math.max(nextTabWidth * PILL_WIDTH_RATIO, 50)
                  : 0;

              const nextX =
                BAR_HORIZONTAL_PADDING +
                localActiveIndexRef.current * nextTabWidth +
                (nextTabWidth - nextPillWidth) / 2;

              indicatorX.stopAnimation();
              indicatorX.setValue(nextX || BAR_HORIZONTAL_PADDING);
              pillPositionedRef.current = true;
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
                    shadowColor: palette.pillShadow,
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
                    styles.pillDepth,
                    { backgroundColor: palette.pillDepth },
                  ]}
                />

                <View
                  pointerEvents="none"
                  style={[
                    styles.pillSurface,
                    {
                      backgroundColor: palette.pillBackground,
                      borderColor: palette.pillBorder,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.pillHighlight,
                      { backgroundColor: palette.pillHighlight },
                    ]}
                  />
                  <View
                    style={[
                      styles.pillBottomShade,
                      { backgroundColor: palette.pillBottomShade },
                    ]}
                  />
                </View>
              </Animated.View>
            )}

            {visibleTabs.map((tab, index) => {
              const active = index === localActiveIndex;

              return (
                <MemoTabItem
                  key={tab.route}
                  tab={tab}
                  active={active}
                  palette={palette}
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
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 20,
  },

  blurBox: {
    borderRadius: BAR_RADIUS,
    overflow: 'hidden',
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
    zIndex: 1,
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.34,
    shadowRadius: 12,
    elevation: 12,
  },

  pillDepth: {
    position: 'absolute',
    left: 3,
    right: 3,
    top: 7,
    bottom: -4,
    borderRadius: PILL_RADIUS,
    opacity: 0.94,
  },

  pillSurface: {
    ...StyleSheet.absoluteFill,
    borderRadius: PILL_RADIUS,
    overflow: 'hidden',
    borderWidth: 1.25,
  },

  pillHighlight: {
    position: 'absolute',
    left: 5,
    right: 5,
    top: 4,
    height: '43%',
    borderRadius: PILL_RADIUS - 5,
  },

  pillBottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '38%',
  },

  item: {
    flex: 1,
    minHeight: 60,
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
    fontSize: 12,
    fontWeight: '900',
  },
});