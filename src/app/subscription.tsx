import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, Clock3, XCircle } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { api } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';

type PlanType = 'FREE' | 'PREMIUM' | 'FAMILY';
type ThemeColors = ReturnType<typeof useAppTheme>['colors'];
type ScreenStyles = ReturnType<typeof makeStyles>;

interface FeatureRowProps {
  label: string;
  isLast?: boolean;
  styles: ScreenStyles;
  colors: ThemeColors;
}

interface PriceTagProps {
  price: string;
  period: string;
  styles: ScreenStyles;
}

interface PlanCardProps {
  currentPlan: PlanType;
  upgradingPlan: 'PREMIUM' | 'FAMILY' | null;
  onUpgradePremium?: () => void;
  onChooseFamily?: () => void;
  styles: ScreenStyles;
  colors: ThemeColors;
}

const FeatureRow = ({ label, isLast = false, styles, colors }: FeatureRowProps) => (
  <View style={[styles.featureRow, isLast && { marginBottom: 0 }]}>
    <Check size={16} color={colors.primary} strokeWidth={3} />
    <Text style={styles.featureLabel}>{label}</Text>
  </View>
);

const PriceTag = ({ price, period, styles }: PriceTagProps) => (
  <Text style={styles.priceTag}>
    <Text style={styles.priceAmount}>{price}</Text>
    <Text style={styles.pricePeriod}>/{period}</Text>
  </Text>
);

const CurrentPlanBadge = ({ styles }: { styles: ScreenStyles }) => (
  <View style={styles.currentBadge}>
    <Text style={styles.currentBadgeText}>CURRENT PLAN</Text>
  </View>
);

const formatDate = (date?: string | null) => {
  if (!date) return 'Not set';

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return 'Not set';
  }

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const FreePlanCard = ({
  styles,
  colors,
}: Pick<PlanCardProps, 'styles' | 'colors'>) => (
  <View style={styles.card}>
    <View style={styles.cardHeaderRow}>
      <Text style={styles.planName}>Free</Text>
      <PriceTag price="$0" period="forever" styles={styles} />
    </View>

    <View style={styles.featureList}>
      <FeatureRow label="50 passwords" styles={styles} colors={colors} />
      <FeatureRow label="Basic vault" styles={styles} colors={colors} />
      <FeatureRow label="5 secure notes" styles={styles} colors={colors} />
      <FeatureRow label="1 emergency contact" styles={styles} colors={colors} />
      <FeatureRow label="Basic password generator" styles={styles} colors={colors} />
      <FeatureRow label="Basic security score" styles={styles} colors={colors} />
      <FeatureRow label="1 trusted device" isLast styles={styles} colors={colors} />
    </View>
  </View>
);

const PremiumPlanCard = ({
  currentPlan,
  upgradingPlan,
  onUpgradePremium,
  styles,
  colors,
}: PlanCardProps) => {
  const isCurrent = currentPlan === 'PREMIUM';
  const isLoading = upgradingPlan === 'PREMIUM';
  const isAnyUpgradeLoading = upgradingPlan !== null;

  return (
    <View style={[styles.card, styles.premiumCard]}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>MOST POPULAR</Text>
      </View>

      {isCurrent && <CurrentPlanBadge styles={styles} />}

      <View style={styles.cardHeaderRow}>
        <Text style={styles.planName}>Premium</Text>
        <PriceTag price="$3.99" period="month" styles={styles} />
      </View>

      <View style={styles.featureList}>
        <FeatureRow
          label="Unlimited password storage"
          styles={styles}
          colors={colors}
        />
        <FeatureRow label="Document vault" styles={styles} colors={colors} />
        <FeatureRow label="Unlimited secure notes" styles={styles} colors={colors} />
        <FeatureRow label="Up to 3 emergency contacts" styles={styles} colors={colors} />
        <FeatureRow
          label="Advanced Security Health Center"
          styles={styles}
          colors={colors}
        />
        <FeatureRow
          label="Advanced password generator"
          styles={styles}
          colors={colors}
        />
        <FeatureRow
          label="Breach monitoring"
          styles={styles}
          colors={colors}
        />
        <FeatureRow
          label="Encrypted cloud backup"
          styles={styles}
          colors={colors}
        />
        <FeatureRow label="Unlimited trusted devices" isLast styles={styles} colors={colors} />
      </View>

      {!isCurrent && currentPlan !== 'FAMILY' && (
        <TouchableOpacity
          activeOpacity={0.7}
          style={[
            styles.upgradeButton,
            isAnyUpgradeLoading && styles.disabledButton,
          ]}
          onPress={onUpgradePremium}
          disabled={isAnyUpgradeLoading}
        >
          {isLoading ? (
            <View style={styles.buttonContent}>
              <ActivityIndicator size="small" color="#14201A" />
              <Text style={styles.upgradeButtonText}>Preparing payment...</Text>
            </View>
          ) : (
            <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

const FamilyPlanCard = ({
  currentPlan,
  upgradingPlan,
  onChooseFamily,
  styles,
  colors,
}: PlanCardProps) => {
  const isCurrent = currentPlan === 'FAMILY';
  const isLoading = upgradingPlan === 'FAMILY';
  const isAnyUpgradeLoading = upgradingPlan !== null;

  return (
    <View style={styles.card}>
      {isCurrent && <CurrentPlanBadge styles={styles} />}

      <View style={styles.cardHeaderRow}>
        <Text style={styles.planName}>Family</Text>
        <PriceTag price="$6.99" period="month" styles={styles} />
      </View>

      <View style={styles.featureList}>
        <FeatureRow
          label="Everything in Premium"
          styles={styles}
          colors={colors}
        />
        <FeatureRow label="Up to 6 members" styles={styles} colors={colors} />
        <FeatureRow label="Shared vaults" styles={styles} colors={colors} />
        <FeatureRow label="Family security health checks" styles={styles} colors={colors} />
        <FeatureRow label="Up to 6 emergency contacts" styles={styles} colors={colors} />
        {/* <FeatureRow
          label="Family  backup support"
          styles={styles}
          colors={colors}
        /> */}
        <FeatureRow
          label="Admin controls when sharing vaults"
          isLast
          styles={styles}
          colors={colors}
        />
      </View>

      {!isCurrent && (
        <TouchableOpacity
          activeOpacity={0.8}
          style={[
            styles.chooseFamilyButton,
            isAnyUpgradeLoading && styles.disabledButton,
          ]}
          onPress={onChooseFamily}
          disabled={isAnyUpgradeLoading}
        >
          {isLoading ? (
            <View style={styles.buttonContent}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.chooseFamilyButtonText}>
                Preparing payment...
              </Text>
            </View>
          ) : (
            <Text style={styles.chooseFamilyButtonText}>Choose Family</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};


function AnimatedSkeleton({
  styles,
  style,
}: {
  styles: any;
  style?: any;
}) {
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

  return <Animated.View style={[styles.skeletonBlock, style, { opacity }]} />;
}

export default function PlansScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = makeStyles(colors);

  const [currentPlan, setCurrentPlan] = useState<PlanType>('FREE');
  const [active, setActive] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [upgradingPlan, setUpgradingPlan] = useState<'PREMIUM' | 'FAMILY' | null>(
    null
  );

  const [canceling, setCanceling] = useState(false);

  const loadCurrentSubscription = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) {
        setLoading(true);
      }

      const response: any = await api.getSubscription();

      const plan =
        response?.plan ||
        response?.subscription?.plan ||
        response?.subscriptionPlan ||
        response?.data?.plan ||
        'FREE';

      setCurrentPlan(plan as PlanType);
      setActive(Boolean(response?.active));
      setStartedAt(response?.startedAt || null);
      setExpiresAt(response?.expiresAt || null);
    } catch (error) {
      console.log('SUBSCRIPTION LOAD ERROR:', error);

      setCurrentPlan('FREE');
      setActive(false);
      setStartedAt(null);
      setExpiresAt(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCurrentSubscription(true);
    }, [loadCurrentSubscription])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCurrentSubscription(true);
  };

  const handlePayment = async (plan: 'PREMIUM' | 'FAMILY') => {
    if (upgradingPlan) return;

    try {
      setUpgradingPlan(plan);

      const response: any = await api.initializePayment(plan);

      const paymentUrl =
        response?.authorizationUrl ||
        response?.authorization_url ||
        response?.data?.authorizationUrl;

      if (!paymentUrl) {
        Alert.alert('Payment error', 'No payment link was returned.');
        return;
      }

      await Linking.openURL(paymentUrl);
    } catch (error: any) {
      Alert.alert('Payment failed', error.message || 'Please try again.');
    } finally {
      setUpgradingPlan(null);
    }
  };

  const handleCancelSubscription = () => {
    Alert.alert(
      'Cancel subscription?',
      'Your plan will return to Free and Premium or Family features will be locked.',
      [
        {
          text: 'Keep plan',
          style: 'cancel',
        },
        {
          text: 'Cancel plan',
          style: 'destructive',
          onPress: async () => {
            try {
              setCanceling(true);

              await api.cancelSubscription();
              await loadCurrentSubscription(true);

              Alert.alert(
                'Subscription cancelled',
                'Your account has been moved to the Free plan.'
              );
            } catch (error: any) {
              Alert.alert(
                'Cancel failed',
                error.message || 'Could not cancel your subscription.'
              );
            } finally {
              setCanceling(false);
            }
          },
        },
      ]
    );
  };


  const renderPlansSkeleton = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <AnimatedSkeleton styles={styles} style={styles.skeletonEyebrow} />
          <AnimatedSkeleton styles={styles} style={styles.skeletonPageTitle} />
        </View>
      </View>

      <View style={styles.currentPlanCard}>
        <AnimatedSkeleton styles={styles} style={styles.skeletonStatusTitle} />
        <AnimatedSkeleton styles={styles} style={styles.skeletonStatusText} />
      </View>

      {[1, 2, 3].map((item) => (
        <View key={`plan-skeleton-${item}`} style={styles.card}>
          <AnimatedSkeleton styles={styles} style={styles.skeletonPlanTitle} />
          <AnimatedSkeleton styles={styles} style={styles.skeletonPrice} />
          {[1, 2, 3, 4].map((line) => (
            <View key={`feature-skeleton-${item}-${line}`} style={styles.skeletonFeatureRow}>
              <AnimatedSkeleton styles={styles} style={styles.skeletonCheck} />
              <AnimatedSkeleton styles={styles} style={styles.skeletonFeatureText} />
            </View>
          ))}
          <AnimatedSkeleton styles={styles} style={styles.skeletonButton} />
        </View>
      ))}
    </ScrollView>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />

        {renderPlansSkeleton()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.backgroundElement}
          />
        }
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Choose your protection</Text>
            <Text style={styles.title}>Plans</Text>
          </View>
        </View>

        {currentPlan !== 'FREE' && (
          <View style={styles.currentPlanCard}>
            <View style={styles.currentPlanIcon}>
              <Clock3 size={22} color={colors.primary} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.currentPlanTitle}>
                {currentPlan} plan active
              </Text>

              <Text style={styles.currentPlanText}>
                Started: {formatDate(startedAt)}
              </Text>

              <Text style={styles.currentPlanText}>
                Expires: {formatDate(expiresAt)}
              </Text>

              <Text style={styles.currentPlanText}>
               Subscription lasts for 1 month.
              </Text>
            </View>
          </View>
        )}

        {currentPlan === 'FREE' && (
          <FreePlanCard styles={styles} colors={colors} />
        )}

        <PremiumPlanCard
          currentPlan={currentPlan}
          upgradingPlan={upgradingPlan}
          onUpgradePremium={() => handlePayment('PREMIUM')}
          styles={styles}
          colors={colors}
        />

        <FamilyPlanCard
          currentPlan={currentPlan}
          upgradingPlan={upgradingPlan}
          onChooseFamily={() => handlePayment('FAMILY')}
          styles={styles}
          colors={colors}
        />

        {currentPlan !== 'FREE' && active && (
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.cancelButton, canceling && styles.disabledButton]}
            onPress={handleCancelSubscription}
            disabled={canceling || upgradingPlan !== null}
          >
            {canceling ? (
              <ActivityIndicator color={colors.danger} />
            ) : (
              <XCircle size={20} color={colors.danger} />
            )}

            <Text style={styles.cancelButtonText}>
              {canceling ? 'Cancelling...' : 'Cancel subscription'}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={styles.footnote}>
          Cancel anytime.
          Each paid plan is valid for 1 month after activation.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C: ThemeColors) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },

    scrollContent: {
      marginTop: 0,
      paddingHorizontal: 16,
      paddingTop: 104,
      paddingBottom: 140,
    },

    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    loadingText: {
      marginTop: 12,
      color: C.textSecondary,
      fontSize: 15,
    },


    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
    },

    skeletonEyebrow: {
      width: 140,
      height: 12,
      marginBottom: 8,
    },

    skeletonPageTitle: {
      width: 90,
      height: 30,
    },

    skeletonStatusTitle: {
      width: '45%',
      height: 17,
      marginBottom: 10,
    },

    skeletonStatusText: {
      width: '70%',
      height: 12,
    },

    skeletonPlanTitle: {
      width: '38%',
      height: 20,
      marginBottom: 14,
    },

    skeletonPrice: {
      width: '55%',
      height: 32,
      marginBottom: 18,
    },

    skeletonFeatureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },

    skeletonCheck: {
      width: 22,
      height: 22,
    },

    skeletonFeatureText: {
      flex: 1,
      height: 13,
    },

    skeletonButton: {
      height: 48,
      borderRadius: 999,
      marginTop: 8,
    },

    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
    },

    eyebrow: {
      fontSize: 14,
      color: C.textSecondary,
      marginBottom: 2,
    },

    title: {
      fontSize: 30,
      fontWeight: '700',
      color: C.text,
    },

    currentPlanCard: {
      flexDirection: 'row',
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 20,
    },

    currentPlanIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundSelected,
      marginRight: 12,
    },

    currentPlanTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: '900',
      marginBottom: 4,
    },

    currentPlanText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },

    card: {
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      padding: 20,
      marginBottom: 20,
    },

    premiumCard: {
      backgroundColor: C.securityScoreBg,
      borderColor: C.securityScore,
      paddingTop: 16,
    },

    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 16,
    },

    planName: {
      fontSize: 22,
      fontWeight: '700',
      color: C.text,
    },

    priceTag: {
      textAlign: 'right',
    },

    priceAmount: {
      fontSize: 20,
      fontWeight: '700',
      color: C.text,
    },

    pricePeriod: {
      fontSize: 14,
      color: C.textSecondary,
    },

    badge: {
      alignSelf: 'flex-start',
      backgroundColor: C.securityScore,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 12,
      marginBottom: 10,
    },

    badgeText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
      color: '#14201A',
    },

    currentBadge: {
      alignSelf: 'flex-start',
      backgroundColor: C.primary,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 12,
      marginBottom: 14,
    },

    currentBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
      color: '#FFFFFF',
    },

    featureList: {
      marginBottom: 20,
    },

    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },

    featureLabel: {
      fontSize: 15,
      color: C.textSecondary,
      marginLeft: 10,
    },

    upgradeButton: {
      backgroundColor: C.securityScore,
      borderRadius: 30,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
    },

    upgradeButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#14201A',
    },

    chooseFamilyButton: {
      backgroundColor: C.backgroundbutton,
      borderRadius: 30,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 54,
    },

    chooseFamilyButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },

    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },

    cancelButton: {
      borderRadius: 30,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 9,
      backgroundColor: C.alertDangerBg,
      borderWidth: 1,
      borderColor: C.danger,
      marginBottom: 18,
    },

    disabledButton: {
      opacity: 0.65,
    },

    cancelButtonText: {
      color: C.danger,
      fontSize: 15,
      fontWeight: '900',
    },

    footnote: {
      fontSize: 13,
      color: C.textSecondary,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 18,
    },
  });