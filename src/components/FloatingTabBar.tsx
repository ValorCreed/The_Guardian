import React, { useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
//import { BlurView } from '@sbaiahmed1/react-native-blur';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useAppTheme } from '../context/ThemeContext';

const tabs = [
  { label: 'Home', route: '/home', icon: 'home-outline', activeIcon: 'home' },
  { label: 'Vault', route: '/vault', icon: 'key-outline', activeIcon: 'key' },
  { label: 'Security', route: '/security', icon: 'shield-outline', activeIcon: 'shield' },
  { label: 'Family', route: '/family', icon: 'people-outline', activeIcon: 'people' },
  { label: 'Settings', route: '/settings', icon: 'settings-outline', activeIcon: 'settings' },
] as const;

type TabItem = (typeof tabs)[number];

function FloatingTabItem({ tab, active }: { tab: TabItem; active: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const { colors } = useAppTheme();

  const animatePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 90, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
    ]).start();
  };

  const handlePress = () => {
    animatePress();
    if (!active) router.push(tab.route as never);
  };

  return (
    <Pressable onPress={handlePress} style={styles.item}>
      <Animated.View
        style={[
          styles.iconWrap,
          active && { backgroundColor: colors.primary },
          { transform: [{ scale }] },
        ]}
      >
        <Ionicons
          name={(active ? tab.activeIcon : tab.icon) as any}
          size={22}
          color={active ? '#FFFFFF' : colors.tabInactive}
        />
      </Animated.View>
      <Text style={[styles.label, { color: active ? colors.tabActive : colors.tabInactive }]}>
        {tab.label}
      </Text>
    </Pressable>
  );
}

export default function FloatingTabBar() {
  const pathname = usePathname();
  const { isDark, colors } = useAppTheme();

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <BlurView
        intensity={70}
        //blurAmount={70}
        //blurType={isDark ? 'dark' : 'light'}
        tint={isDark ? 'dark' : 'light'}
        style={[
          styles.blurBox,
          {
            backgroundColor: isDark ? 'rgba(20, 32, 26, 0.78)' : 'rgba(255, 255, 255, 0.72)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.9)',
            shadowColor: isDark ? '#000000' : '#000000',
          },
        ]}
      >
        {tabs.map((tab) => {
          const active = pathname === tab.route || pathname.startsWith(`${tab.route}/`);
          return <FloatingTabItem key={tab.route} tab={tab} active={active} />;
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 24 : 18,
    zIndex: 100,
  },
  blurBox: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderRadius: 30,
    paddingVertical: 10,
    paddingHorizontal: 8,
    overflow: 'hidden',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
  },
  item: { flex: 1, alignItems: 'center' },
  iconWrap: {
    width: 38,
    height: 34,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { marginTop: 2, fontSize: 10, fontWeight: '600' },
});
