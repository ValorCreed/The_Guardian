import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../constants/theme';

const HomeScreen = () => {
  const router = useRouter();
  const systemScheme = useColorScheme();
  const [manualScheme, setManualScheme] = useState<'light' | 'dark' | null>(null);
  const [userName, setUserName] = useState('');

  const scheme = manualScheme ?? (systemScheme === 'dark' ? 'dark' : 'light');
  const C = Colors[scheme];

  useEffect(() => {
    const loadPrefs = async () => {
      const name = await AsyncStorage.getItem('userName');
      if (name) setUserName(name);

      const saved = await AsyncStorage.getItem('themeOverride');
      if (saved === 'light' || saved === 'dark') setManualScheme(saved);
    };
    loadPrefs();
  }, []);

  const toggleTheme = async () => {
    if (manualScheme === null) {
      // first tap: override to opposite of system
      const next = systemScheme === 'dark' ? 'light' : 'dark';
      setManualScheme(next);
      await AsyncStorage.setItem('themeOverride', next);
    } else if (manualScheme !== systemScheme) {
      // second tap: go back to system
      setManualScheme(null);
      await AsyncStorage.removeItem('themeOverride');
    } else {
      // toggle between light and dark
      const next = manualScheme === 'light' ? 'dark' : 'light';
      setManualScheme(next);
      await AsyncStorage.setItem('themeOverride', next);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const ScoreRing = ({ score }: { score: number }) => {
    const size = 80;
    const strokeWidth = 6;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = circumference - (score / 100) * circumference;

    const getColor = () => {
      if (score >= 80) return C.success;
      if (score >= 60) return C.warning;
      return C.danger;
    };

    return (
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={C.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={getColor()}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={progress}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
    );
  };

  const score = 72;
  const scoreColor = score >= 80 ? C.success : score >= 60 ? C.warning : C.danger;

  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="shield-checkmark" size={22} color="#fff" />
            </View>
            <View>
              <Text style={styles.greeting}>{getGreeting()}</Text>
              <Text style={styles.userName}>{userName || 'User'}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerBtn} onPress={toggleTheme}>
              <Ionicons
                name={scheme === 'dark' ? 'sunny-outline' : 'moon-outline'}
                size={18}
                color={C.text}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerBtn}>
              <Ionicons name="notifications-outline" size={18} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Security score card */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreRingWrapper}>
            <ScoreRing score={score} />
            <View style={styles.scoreTextOverlay}>
              <Text style={[styles.scoreNumber, { color: scoreColor }]}>{score}</Text>
              <Text style={styles.scoreLabel}>Security{'\n'}Score</Text>
            </View>
          </View>

          <View style={styles.scoreInfo}>
            <Text style={styles.scoreTitle}>Good protection</Text>
            <Text style={styles.scoreSubtitle}>3 issues need your attention</Text>
            <View style={styles.scoreBadges}>
              <View style={[styles.badge, { backgroundColor: C.alertDangerBg }]}>
                <Text style={styles.badgeText}>1 breached</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: C.alertWarningBg }]}>
                <Text style={styles.badgeText}>2 reused</Text>
              </View>
            </View>
          </View>

          <Ionicons name="chevron-forward" size={20} color={C.tabInactive} />
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/vault')}>
              <Ionicons name="globe-outline" size={24} color={C.primary} />
              <Text style={styles.statNumber}>7</Text>
              <Text style={styles.statLabel}>Passwords</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statCard}>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => router.push({ pathname: '/vault', params: { tab: 'Documents' } })}
            >
              <Ionicons name="document-text-outline" size={24} color={C.primary} />
              <Text style={styles.statNumber}>5</Text>
              <Text style={styles.statLabel}>Documents</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statCard}>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => router.push({ pathname: '/vault', params: { tab: 'Cards' } })}
            >
              <Ionicons name="card-outline" size={24} color={C.primary} />
              <Text style={styles.statNumber}>3</Text>
              <Text style={styles.statLabel}>Cards</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/addpassword')}>
            <View style={styles.actionBtn}>
              <Ionicons name="key-outline" size={28} color="#fff" />
            </View>
            <Text style={styles.actionLabel}>Password</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => router.push({ pathname: '/adddocument', params: { tab: 'Documents' } })}
          >
            <View style={styles.actionBtn}>
              <Ionicons name="document-outline" size={28} color="#fff" />
            </View>
            <Text style={styles.actionLabel}>Document</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => router.push({ pathname: '/vault', params: { tab: 'Cards' } })}
          >
            <View style={styles.actionBtn}>
              <Ionicons name="card-outline" size={28} color="#fff" />
            </View>
            <Text style={styles.actionLabel}>Card</Text>
          </TouchableOpacity>
        </View>

        {/* Security alerts */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Security alerts</Text>
          <TouchableOpacity>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.alertCard}>
          <View style={[styles.alertIcon, { backgroundColor: C.alertDangerBg }]}>
            <Ionicons name="warning-outline" size={20} color={C.danger} />
          </View>
          <View style={styles.alertText}>
            <Text style={styles.alertTitle}>Password found in data breach</Text>
            <Text style={styles.alertSubtitle}>Netflix - update recommended</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={C.tabInactive} />
        </View>

        <View style={styles.alertCard}>
          <View style={[styles.alertIcon, { backgroundColor: C.alertDangerBg }]}>
            <Ionicons name="warning-outline" size={20} color={C.danger} />
          </View>
          <View style={styles.alertText}>
            <Text style={styles.alertTitle}>2 reused passwords</Text>
            <Text style={styles.alertSubtitle}>Revolut, Netflix</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={C.tabInactive} />
        </View>

        {/* Recent items */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent items</Text>
          <TouchableOpacity onPress={() => router.push('/vault')}>
            <Text style={styles.viewAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {[
          { letter: 'G', color: '#e53935', name: 'Google', sub: 'alex.morgan@gmail.com' },
          { letter: 'R', color: '#1e88e5', name: 'Revolut', sub: 'alex.morgan' },
          { letter: 'N', color: '#212121', name: 'Notion', sub: 'alex@guardian.app' },
        ].map((item) => (
          <TouchableOpacity key={item.name} style={styles.recentCard}>
            <View style={[styles.recentAvatar, { backgroundColor: item.color }]}>
              <Text style={styles.recentAvatarText}>{item.letter}</Text>
            </View>
            <View style={styles.recentText}>
              <Text style={styles.recentName}>{item.name}</Text>
              <Text style={styles.recentSub}>{item.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.tabInactive} />
          </TouchableOpacity>
        ))}

        {/* Upgrade banner */}
        <TouchableOpacity style={styles.upgradeBanner} onPress={() => router.push('/subscription')}>
          <View style={styles.upgradeIcon}>
            <Ionicons name="sparkles-outline" size={22} color="#fff" />
          </View>
          <View style={styles.upgradeText}>
            <Text style={styles.upgradeTitle}>Upgrade to Premium</Text>
            <Text style={styles.upgradeSub}>Unlock document vault & family sharing</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={C.tabInactive} />
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom nav */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="home" size={22} color={C.tabActive} />
          <Text style={styles.navLabelActive}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/vault')}>
          <Ionicons name="key-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Vault</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/security')}>
          <Ionicons name="shield-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Security</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/family')}>
          <Ionicons name="people-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Family</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={22} color={C.tabInactive} />
          <Text style={styles.navLabel}>Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default HomeScreen;

const makeStyles = (C: typeof Colors.light | typeof Colors.dark) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headerIcon: {
      width: 40,
      height: 40,
      backgroundColor: C.primary,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    greeting: {
      fontSize: 12,
      color: C.textSecondary,
    },
    userName: {
      fontSize: 16,
      fontWeight: 'bold',
      color: C.text,
    },
    headerRight: {
      flexDirection: 'row',
      gap: 8,
    },
    headerBtn: {
      width: 38,
      height: 38,
      backgroundColor: C.backgroundElement,
      borderRadius: 19,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scoreCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      marginHorizontal: 20,
      marginBottom: 16,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    scoreRingWrapper: {
      width: 80,
      height: 80,
      position: 'relative',
      justifyContent: 'center',
      alignItems: 'center',
    },
    scoreTextOverlay: {
      position: 'absolute',
      justifyContent: 'center',
      alignItems: 'center',
    },
    scoreNumber: {
      fontSize: 20,
      fontWeight: 'bold',
    },
    scoreLabel: {
      fontSize: 8,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: 11,
    },
    scoreInfo: {
      flex: 1,
    },
    scoreTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: C.text,
      marginBottom: 2,
    },
    scoreSubtitle: {
      fontSize: 12,
      color: C.textSecondary,
      marginBottom: 8,
    },
    scoreBadges: {
      flexDirection: 'row',
      gap: 6,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 20,
    },
    badgeText: {
      fontSize: 11,
      color: C.text,
    },
    statsRow: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginBottom: 20,
      gap: 12,
    },
    statCard: {
      flex: 1,
      backgroundColor: C.backgroundElement,
      borderRadius: 16,
      padding: 14,
      alignItems: 'center',
      gap: 4,
    },
    statNumber: {
      fontSize: 20,
      fontWeight: 'bold',
      color: C.text,
    },
    statLabel: {
      fontSize: 12,
      color: C.textSecondary,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: 'bold',
      color: C.text,
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    viewAll: {
      fontSize: 14,
      color: C.primary,
      fontWeight: '600',
    },
    quickActions: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      marginBottom: 24,
      gap: 12,
    },
    actionItem: {
      flex: 1,
      alignItems: 'center',
      gap: 8,
    },
    actionBtn: {
      width: 64,
      height: 64,
      backgroundColor: C.actionIconBg,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    actionLabel: {
      fontSize: 13,
      color: C.text,
      fontWeight: '500',
    },
    alertCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 16,
      marginHorizontal: 20,
      marginBottom: 10,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    alertIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      justifyContent: 'center',
      alignItems: 'center',
    },
    alertText: {
      flex: 1,
    },
    alertTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: C.text,
    },
    alertSubtitle: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
    },
    recentCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 16,
      marginHorizontal: 20,
      marginBottom: 10,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    recentAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    recentAvatarText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 16,
    },
    recentText: {
      flex: 1,
    },
    recentName: {
      fontSize: 15,
      fontWeight: '600',
      color: C.text,
    },
    recentSub: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
    },
    upgradeBanner: {
      backgroundColor: C.securityScoreBg,
      borderRadius: 16,
      marginHorizontal: 20,
      marginTop: 8,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    upgradeIcon: {
      width: 44,
      height: 44,
      backgroundColor: C.securityScore,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    upgradeText: {
      flex: 1,
    },
    upgradeTitle: {
      fontSize: 15,
      fontWeight: 'bold',
      color: C.text,
    },
    upgradeSub: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
    },
    bottomNav: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: C.backgroundElement,
      flexDirection: 'row',
      paddingVertical: 10,
      paddingBottom: 24,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    navItem: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    navLabel: {
      fontSize: 11,
      color: C.tabInactive,
    },
    navLabelActive: {
      fontSize: 11,
      color: C.tabActive,
      fontWeight: '600',
    },
  });