import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, ChevronDown, ChevronUp, Clock3, Crown, XCircle } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import { api } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import { useAppTheme } from '../context/ThemeContext';
import { useScreenAlert } from '../hooks/useScreenAlert';

type PlanType = 'FREE' | 'PREMIUM' | 'FAMILY';
type ThemeColors = ReturnType<typeof useAppTheme>['colors'];
type ScreenStyles = ReturnType<typeof makeStyles>;

interface FeatureRowProps {
  label: string;
  isLast?: boolean;
  styles: ScreenStyles;
  colors: ThemeColors;
  accentColor?: string;
  textColor?: string;
  emphasized?: boolean;
}

interface PriceTagProps {
  price: string;
  period: string;
  styles: ScreenStyles;
  amountStyle?: any;
  periodStyle?: any;
}

interface PlanCardProps {
  currentPlan: PlanType;
  upgradingPlan: 'PREMIUM' | 'FAMILY' | null;
  onUpgradePremium?: () => void;
  onChooseFamily?: () => void;
  styles: ScreenStyles;
  colors: ThemeColors;
}

const FAMILY_ACCENT = '#7C3AED';
const FAMILY_ACCENT_LIGHT = '#A78BFA';

const FeatureRow = ({
  label,
  isLast = false,
  styles,
  colors,
  accentColor,
  textColor,
  emphasized = false,
}: FeatureRowProps) => (
  <View style={[styles.featureRow, isLast && { marginBottom: 0 }]}>
    <View
      style={[
        styles.featureCheck,
        accentColor && { backgroundColor: `${accentColor}18` },
      ]}
    >
      <Check
        size={15}
        color={accentColor || colors.primary}
        strokeWidth={3}
      />
    </View>
    <Text
      style={[
        styles.featureLabel,
        textColor ? { color: textColor } : null,
        emphasized && styles.featureLabelEmphasized,
      ]}
    >
      {label}
    </Text>
  </View>
);


const FeatureDisclosure = ({
  label,
  details,
  styles,
  colors,
  accentColor,
  textColor,
}: {
  label: string;
  details: string;
  styles: ScreenStyles;
  colors: ThemeColors;
  accentColor?: string;
  textColor?: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const accent = accentColor || colors.primary;

  return (
    <View style={styles.featureDisclosure}>
      <TouchableOpacity
        style={styles.featureDisclosureHeader}
        activeOpacity={0.78}
        onPress={() => setExpanded((current) => !current)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${label}. ${expanded ? 'Hide details' : 'Show details'}`}
      >
        <View style={[styles.featureCheck, { backgroundColor: `${accent}18` }]}>
          <Check size={15} color={accent} strokeWidth={3} />
        </View>
        <Text
          style={[
            styles.featureLabel,
            textColor ? { color: textColor } : null,
            styles.featureDisclosureLabel,
          ]}
        >
          {label}
        </Text>
        {expanded ? (
          <ChevronUp size={18} color={accent} strokeWidth={2.6} />
        ) : (
          <ChevronDown size={18} color={accent} strokeWidth={2.6} />
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.featureDisclosureBody}>
          <Text style={styles.featureDisclosureText}>{details}</Text>
        </View>
      )}
    </View>
  );
};

const PriceTag = ({
  price,
  period,
  styles,
  amountStyle,
  periodStyle,
}: PriceTagProps) => (
  <Text style={styles.priceTag}>
    <Text style={[styles.priceAmount, amountStyle]}>{price}</Text>
    <Text style={[styles.pricePeriod, periodStyle]}>/{period}</Text>
  </Text>
);

const CurrentPlanBadge = ({
  styles,
  family = false,
}: {
  styles: ScreenStyles;
  family?: boolean;
}) => (
  <View style={[styles.currentBadge, family && styles.familyCurrentBadge]}>
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

const getEntryContext = (from?: string | string[]) => {
  const source = Array.isArray(from) ? from[0] : from;

  switch (source) {
    case 'adddocument':
      return {
        title: 'Document vault upgrade',
        message: 'Premium and Family unlock encrypted document storage',
      };
    case 'addnote':
      return {
        title: 'SecureNotes upgrade',
        message: 'Premium and Family remove the Free secure-note limit.',
      };
    case 'backup':
      return {
        title: 'Encrypted backup upgrade',
        message: 'Premium and Family unlock encrypted backups.',
      };
    case 'emergencyaccess':
      return {
        title: 'Emergency access upgrade',
        message: 'Paid plans unlock more emergency contacts and advanced emergency sharing controls.',
      };
    case 'estateplaybooks':
      return {
        title: 'Digital Estate Playbooks',
        message: 'Premium and Family unlock controlled item-level release rules and trusted instructions.',
      };
    case 'continuitydrill':
      return {
        title: 'Guardian Continuity Drill',
        message: 'Family unlocks multi-person continuity rehearsals and readiness reports without releasing secrets.',
      };
    case 'duressmode':
      return {
        title: 'Coercion-Safe Decoy Vault',
        message: 'Premium and Family unlock a separate duress password, isolated decoy items, and optional delayed trusted-contact alerts.',
      };
    case 'incidentlockdown':
      return {
        title: 'Incident Lockdown & Recovery Autopilot',
        message: 'Premium and Family unlock one-action containment, a safe recovery device, prioritized recovery tasks, and a tamper-evident incident timeline.',
      };
    case 'family':
      return {
        title: 'Family upgrade recommendation',
        message: 'The Family plan unlocks shared vaults, family controls, and more emergency contacts.',
      };
    case 'home':
      return {
        title: 'Upgrade your protection',
        message: 'Premium and Family add stronger protection across your vault.',
      };
    case 'passwordgenerator':
      return {
        title: 'Password generator upgrade',
        message: 'Premium and Family unlock advanced password generation options.',
      };
    case 'securityhealth':
      return {
        title: 'Security Health upgrade',
        message: 'Premium and Family unlock advanced breach monitoring and deeper security reports.',
      };
    default:
      return null;
  }
};

const FreePlanCard = ({
  styles,
  colors,
}: Pick<PlanCardProps, 'styles' | 'colors'>) => (
  <View style={[styles.card, styles.freeCard]}>
    <View style={styles.freeBadge}>
      <Text style={styles.freeBadgeText}>ESSENTIALS</Text>
    </View>

    <View style={styles.cardHeaderRow}>
      <Text style={styles.planName}>Free</Text>
      <PriceTag price="$0" period="forever" styles={styles} />
    </View>

    <View style={styles.featureList}>
      <FeatureRow label="10 passwords" styles={styles} colors={colors} />
      <FeatureRow label="Basic vault" styles={styles} colors={colors} />
      <FeatureRow label="5 SecureNotes" styles={styles} colors={colors} />
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

      <Text style={styles.planSubtitle}>Strong individual protection.</Text>

      <View style={styles.featureList}>
        <FeatureRow
          label="Unlimited password storage"
          styles={styles}
          colors={colors}
        />
        <FeatureRow label="Document vault" styles={styles} colors={colors} />
        <FeatureRow label="Unlimited SecureNotes" styles={styles} colors={colors} />
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
        <FeatureDisclosure
          label="Guardian Safety Check"
          details="Set scheduled proof-of-life check-ins and release only the emergency information you approved after a visible grace period."
          styles={styles}
          colors={colors}
        />
        <FeatureDisclosure
          label="Recovery Circle"
          details="Require several trusted people plus your private recovery code before the account password can be reset."
          styles={styles}
          colors={colors}
        />
        <FeatureDisclosure
          label="Digital Estate Playbooks"
          details="Assign item-level instructions, recipients and release triggers without exposing an entire vault category."
          styles={styles}
          colors={colors}
        />
        <FeatureDisclosure
          label="Coercion-Safe Decoy Vault"
          details="Use a separate duress password to open believable decoy items while your real vault remains isolated."
          styles={styles}
          colors={colors}
        />
        <FeatureDisclosure
          label="Incident Lockdown & Recovery Autopilot"
          details="Contain a suspected compromise, revoke other sessions and follow a prioritized recovery checklist on one trusted device."
          styles={styles}
          colors={colors}
        />
        <FeatureRow
          label="Encrypted backup"
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
    <View style={[styles.card, styles.familyCard]}>
      <View pointerEvents="none" style={styles.familyGlowLarge} />
      <View pointerEvents="none" style={styles.familyGlowSmall} />

      <View style={styles.familyBadgeRow}>
        <View style={styles.familyBadge}>
          <Crown size={14} color="#FFFFFF" strokeWidth={2.8} />
          <Text style={styles.familyBadgeText}>ULTIMATE PROTECTION</Text>
        </View>

        {/* <View style={styles.familyCoverageBadge}>
          <ShieldCheck size={13} color={FAMILY_ACCENT} strokeWidth={2.7} />
          <Text style={styles.familyCoverageText}>TOP TIER</Text>
        </View> */}
      </View>

      {isCurrent && <CurrentPlanBadge styles={styles} family />}

      <View style={styles.familyHeaderRow}>
        <View style={styles.familyHeaderCopy}>
          <Text style={styles.familyPlanName}>Family</Text>
          {/* <Text style={styles.familyPlanSubtitle}>
            Maximum protection for everyone you trust.
          </Text> */}
        </View>

        <PriceTag
          price="$6.99"
          period="month"
          styles={styles}
          amountStyle={styles.familyPriceAmount}
          periodStyle={styles.familyPricePeriod}
        />
      </View>

      <View>
        {/* <View style={styles.familyMembersIcon}>
          <UsersRound size={18} color={FAMILY_ACCENT} strokeWidth={2.5} />
        </View> */}
        {/* <Text style={styles.familyMembersText}>Protect up to 6 members together</Text> */}
      </View>

      <View style={styles.familyDivider} />

      <View style={styles.featureList}>
        <FeatureRow
          label="Everything in Premium"
          styles={styles}
          colors={colors}
          accentColor={FAMILY_ACCENT_LIGHT}
          textColor={colors.text}
          emphasized
        />
        <FeatureRow
          label="Up to 6 members"
          styles={styles}
          colors={colors}
          accentColor={FAMILY_ACCENT_LIGHT}
          textColor={colors.text}
        />
        <FeatureRow
          label="Shared vaults"
          styles={styles}
          colors={colors}
          accentColor={FAMILY_ACCENT_LIGHT}
          textColor={colors.text}
        />
        <FeatureRow
          label="Family security health checks"
          styles={styles}
          colors={colors}
          accentColor={FAMILY_ACCENT_LIGHT}
          textColor={colors.text}
        />
        <FeatureDisclosure
          label="Guardian Continuity Drill"
          details="Run a safe household rehearsal that verifies contacts, Recovery Circle, Recovery Kit, Safety Check and Estate Playbooks without releasing secrets."
          styles={styles}
          colors={colors}
          accentColor={FAMILY_ACCENT_LIGHT}
          textColor={colors.text}
        />
        <FeatureRow
          label="Up to 6 emergency contacts"
          styles={styles}
          colors={colors}
          accentColor={FAMILY_ACCENT_LIGHT}
          textColor={colors.text}
        />
        <FeatureRow
          label="Admin controls when sharing vaults"
          isLast
          styles={styles}
          colors={colors}
          accentColor={FAMILY_ACCENT_LIGHT}
          textColor={colors.text}
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
            <View style={styles.buttonContent}>
              <Crown size={18} color="#FFFFFF" strokeWidth={2.8} />
              <Text style={styles.chooseFamilyButtonText}>
                Choose ultimate protection
              </Text>
            </View>
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
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const { colors, isDark } = useAppTheme();
  const styles = makeStyles(colors, isDark);
  const params = useLocalSearchParams<{ from?: string }>();
  const entryContext = getEntryContext(params.from);

  const [currentPlan, setCurrentPlan] = useState<PlanType>('FREE');
  const [active, setActive] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [upgradingPlan, setUpgradingPlan] = useState<'PREMIUM' | 'FAMILY' | null>(
    null
  );

  const [canceling, setCanceling] = useState(false);

  const loadCurrentSubscription = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) {
        setLoading(true);
      }

      const response: any = await requestApi.getSubscription();
      setLoadError(null);

      const plan =
        response?.plan ||
        response?.subscription?.plan ||
        response?.subscriptionPlan ||
        response?.data?.plan ||
        'FREE';

      setCurrentPlan(plan as PlanType);
      setActive(Boolean(response?.active));
      setExpiresAt(response?.expiresAt || null);
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      console.log('SUBSCRIPTION LOAD ERROR:', error);
      setLoadError(error?.message || 'We could not refresh your subscription right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestApi]);

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

      const response: any = await requestApi.initializePayment(plan);

      const paymentUrl =
        response?.authorizationUrl ||
        response?.authorization_url ||
        response?.data?.authorizationUrl;

      if (!paymentUrl) {
        screenAlert('Payment error', 'No payment link was returned.');
        return;
      }

      await Linking.openURL(paymentUrl);
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      screenAlert('Payment failed', error.message || 'Please try again.');
    } finally {
      setUpgradingPlan(null);
    }
  };

  const handleCancelSubscription = () => {
    screenAlert(
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

              await requestApi.cancelSubscription();
              await loadCurrentSubscription(true);

              screenAlert(
                'Subscription cancelled',
                'Your account has been moved to the Free plan.'
              );
            } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
              screenAlert(
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
            <Text style={styles.title}>Choose your protection</Text>
            {/* <Text style={styles.headerSubtitle}>
              Family offers the highest level of protection and sharing.
            </Text> */}
          </View>
        </View>

        {entryContext && (
          <View style={styles.entryContextCard}>
            <Text style={styles.entryContextTitle}>{entryContext.title}</Text>
            <Text style={styles.entryContextText}>{entryContext.message}</Text>
          </View>
        )}

        {loadError && (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Could not refresh plan</Text>
            <Text style={styles.warningText}>{loadError}</Text>
          </View>
        )}

        {currentPlan !== 'FREE' && (
          <View style={styles.currentPlanCard}>
            <View style={styles.currentPlanIcon}>
              <Clock3 size={22} color={colors.primary} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.currentPlanTitle}>
                {currentPlan} plan active
              </Text>
              <Text style={styles.currentPlanText}>Expires {formatDate(expiresAt)}</Text>
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

        <Text style={styles.footnote}>Cancel anytime.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C: ThemeColors, isDark: boolean) =>
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
    
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

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
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      elevation: 10,
      shadowOffset: { width: 0, height: 11 },

      height: 48,
      borderRadius: 999,
      marginTop: 8,
    },

    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
    },

    entryContextCard: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },

      backgroundColor: C.backgroundSelected,
      borderColor: C.primary,
      borderWidth: 1,
      borderRadius: 20,
      padding: 14,
      marginBottom: 18,
    },

    entryContextTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: '900',
      marginBottom: 4,
    },

    entryContextText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },

    warningCard: {
      backgroundColor: C.alertWarningBg,
      borderColor: C.warning,
      borderWidth: 1,
      borderRadius: 20,
      padding: 14,
      marginBottom: 18,
    
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},

    warningTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: '900',
      marginBottom: 4,
    },

    warningText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },

    eyebrow: {
      fontSize: 14,
      color: C.textSecondary,
      marginBottom: 2,
    },

    title: {
      fontSize: 30,
      fontWeight: '800',
      color: C.text,
      letterSpacing: -0.5,
    },

    headerSubtitle: {
      color: C.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 6,
      maxWidth: 330,
    },

    currentPlanCard: {
      flexDirection: 'row',
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 20,
    
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},

    currentPlanIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

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
      position: 'relative',
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: C.border,
      padding: 20,
      marginBottom: 20,
    
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},

    freeCard: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },

      backgroundColor: isDark ? C.backgroundElement : '#F8FAFC',
      borderColor: isDark ? C.border : '#CBD5E1',
    },

    freeBadge: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      alignSelf: 'flex-start',
      backgroundColor: isDark ? C.backgroundSelected : '#E2E8F0',
      paddingHorizontal: 11,
      paddingVertical: 5,
      borderRadius: 11,
      marginBottom: 12,
    },

    freeBadgeText: {
      color: C.textSecondary,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.7,
    },

    premiumCard: {
      backgroundColor: C.securityScoreBg,
      borderColor: C.securityScore,
      borderWidth: 1.5,
      paddingTop: 16,
    
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,},

    planSubtitle: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
      marginBottom: 14,
    },

    familyCard: {
      overflow: 'hidden',
      backgroundColor: isDark ? '#241A3A' : '#F5F0FF',
      borderColor: isDark ? FAMILY_ACCENT_LIGHT : FAMILY_ACCENT,
      borderWidth: 2,
      paddingTop: 18,
      shadowColor: FAMILY_ACCENT,
      shadowOpacity: isDark ? 0.30 : 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },

    familyGlowLarge: {
      position: 'absolute',
      width: 190,
      height: 190,
      borderRadius: 95,
      right: -78,
      top: -86,
      backgroundColor: isDark
        ? 'rgba(167,139,250,0.14)'
        : 'rgba(124,58,237,0.10)',
    },

    familyGlowSmall: {
      position: 'absolute',
      width: 112,
      height: 112,
      borderRadius: 56,
      left: -52,
      bottom: 54,
      backgroundColor: isDark
        ? 'rgba(124,58,237,0.12)'
        : 'rgba(167,139,250,0.15)',
    },

    familyBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 14,
    },

    familyBadge: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      alignSelf: 'flex-start',
      backgroundColor: FAMILY_ACCENT,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 13,
    },

    familyBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.75,
    },

    familyCoverageBadge: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: isDark
        ? 'rgba(255,255,255,0.90)'
        : 'rgba(255,255,255,0.82)',
      borderWidth: 1,
      borderColor: isDark ? '#DDD6FE' : '#E9D5FF',
    },

    familyCoverageText: {
      color: FAMILY_ACCENT,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.65,
    },

    familyHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 14,
    },

    familyHeaderCopy: {
      flex: 1,
      minWidth: 0,
    },

    familyPlanName: {
      color: isDark ? '#F5F3FF' : '#4C1D95',
      fontSize: 28,
      fontWeight: '900',
      letterSpacing: -0.6,
    },

    familyPlanSubtitle: {
      color: isDark ? '#DDD6FE' : '#6D28D9',
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
      marginTop: 5,
    },

    familyPriceAmount: {
      color: isDark ? '#F5F3FF' : '#4C1D95',
      fontSize: 22,
      fontWeight: '900',
    },

    familyPricePeriod: {
      color: isDark ? '#C4B5FD' : '#7C3AED',
      fontWeight: '700',
    },

    familyMembersRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 11,
      borderRadius: 16,
      backgroundColor: isDark
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(255,255,255,0.70)',
      borderWidth: 1,
      borderColor: isDark ? '#4C3B6B' : '#DDD6FE',
    },

    familyMembersIcon: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#F5F3FF' : '#EDE9FE',
    },

    familyMembersText: {
      flex: 1,
      color: isDark ? '#EDE9FE' : '#5B21B6',
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '900',
    },

    familyDivider: {
      height: 1,
      backgroundColor: isDark ? '#4C3B6B' : '#DDD6FE',
      marginVertical: 16,
    },


    cardHeaderRow: {
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 22,
      elevation: 10,
      shadowOffset: { width: 0, height: 12 },

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
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

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
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      alignSelf: 'flex-start',
      backgroundColor: C.primary,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 12,
      marginBottom: 14,
    },

    familyCurrentBadge: {
      shadowColor: '#000000',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 6,
      shadowOffset: { width: 0, height: 6 },

      backgroundColor: isDark ? '#A78BFA' : '#6D28D9',
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

    featureDisclosure: {
      marginBottom: 10,
      borderRadius: 15,
      overflow: 'hidden',
    },

    featureDisclosureHeader: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
    },

    featureDisclosureLabel: {
      fontWeight: '800',
    },

    featureDisclosureBody: {
      marginLeft: 35,
      marginRight: 4,
      marginTop: -2,
      marginBottom: 7,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 13,
      backgroundColor: C.backgroundSelected,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },

    featureDisclosureText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '600',
    },

    featureCheck: {
      width: 25,
      height: 25,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundSelected,
      flexShrink: 0,
    },

    featureLabel: {
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
      color: C.textSecondary,
      marginLeft: 10,
    },

    featureLabelEmphasized: {
      fontWeight: '900',
    },

    upgradeButton: {
      backgroundColor: C.securityScore,
      borderRadius: 30,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
    
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 11 },
      elevation: 10,},

    upgradeButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#14201A',
    },

    chooseFamilyButton: {
      backgroundColor: FAMILY_ACCENT,
      borderRadius: 30,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 54,
    
      shadowColor: FAMILY_ACCENT,
      shadowOpacity: 0.28,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 11 },
      elevation: 10,},

    chooseFamilyButtonText: {
      fontSize: 15,
      fontWeight: '900',
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
    
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 11 },
      elevation: 10,},

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