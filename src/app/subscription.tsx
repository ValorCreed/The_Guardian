import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { ChevronLeft, Check } from 'lucide-react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
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

interface PlanCardProps {
  currentPlan: PlanType;
  onUpgrade?: () => void;
  onChooseFamily?: () => void;
  styles: ScreenStyles;
  colors: ThemeColors;
}

const FreePlanCard = ({ styles, colors }: Pick<PlanCardProps, 'styles' | 'colors'>) => (
  <View style={styles.card}>
    <View style={styles.cardHeaderRow}>
      <Text style={styles.planName}>Free</Text>
      <PriceTag price="$0" period="forever" styles={styles} />
    </View>

    <View style={styles.featureList}>
      <FeatureRow label="50 passwords" styles={styles} colors={colors} />
      <FeatureRow label="Basic vault" styles={styles} colors={colors} />
      <FeatureRow label="1 device" isLast styles={styles} colors={colors} />
    </View>
  </View>
);

const PremiumPlanCard = ({ currentPlan, onUpgrade, styles, colors }: PlanCardProps) => {
  const isCurrent = currentPlan === 'PREMIUM';

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
        <FeatureRow label="Unlimited passwords" styles={styles} colors={colors} />
        <FeatureRow label="Document vault" styles={styles} colors={colors} />
        <FeatureRow label="Breach monitoring" styles={styles} colors={colors} />
        <FeatureRow label="All devices" isLast styles={styles} colors={colors} />
      </View>

      {!isCurrent && currentPlan !== 'FAMILY' && (
        <TouchableOpacity activeOpacity={0.7} style={styles.upgradeButton} onPress={onUpgrade}>
          <Text style={styles.upgradeButtonText}>Upgrade</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const FamilyPlanCard = ({ currentPlan, onChooseFamily, styles, colors }: PlanCardProps) => {
  const isCurrent = currentPlan === 'FAMILY';

  return (
    <View style={styles.card}>
      {isCurrent && <CurrentPlanBadge styles={styles} />}

      <View style={styles.cardHeaderRow}>
        <Text style={styles.planName}>Family</Text>
        <PriceTag price="$6.99" period="month" styles={styles} />
      </View>

      <View style={styles.featureList}>
        <FeatureRow label="Everything in Premium" styles={styles} colors={colors} />
        <FeatureRow label="Up to 6 members" styles={styles} colors={colors} />
        <FeatureRow label="Shared vaults" styles={styles} colors={colors} />
        <FeatureRow label="Admin controls" isLast styles={styles} colors={colors} />
      </View>

      {!isCurrent && (
        <TouchableOpacity activeOpacity={0.8} style={styles.chooseFamilyButton} onPress={onChooseFamily}>
          <Text style={styles.chooseFamilyButtonText}>Choose Family</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default function PlansScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = makeStyles(colors);

  const [currentPlan, setCurrentPlan] = useState<PlanType>('FREE');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurrentSubscription();
  }, []);

  const loadCurrentSubscription = async () => {
    try {
      const response: any = await api.getSubscription();

      const plan =
        response?.plan ||
        response?.subscription?.plan ||
        response?.subscriptionPlan ||
        response?.data?.plan ||
        'FREE';

      setCurrentPlan(plan as PlanType);
    } catch (error) {
      console.log('SUBSCRIPTION LOAD ERROR:', error);
      setCurrentPlan('FREE');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async (plan: 'PREMIUM' | 'FAMILY') => {
    try {
      const response: any = await api.initializePayment(plan);
      const paymentUrl = response?.authorizationUrl || response?.authorization_url || response?.data?.authorizationUrl;

      if (!paymentUrl) {
        Alert.alert('Payment error', 'No payment link was returned.');
        return;
      }

      await Linking.openURL(paymentUrl);
    } catch (error: any) {
      Alert.alert('Payment failed', error.message || 'Please try again.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading plans...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity activeOpacity={0.6} style={styles.backButton} onPress={() => router.replace('/home')}>
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>

        <Text style={styles.eyebrow}>Choose your protection</Text>
        <Text style={styles.title}>Plans</Text>

        {currentPlan === 'FREE' && <FreePlanCard styles={styles} colors={colors} />}

        <PremiumPlanCard
          currentPlan={currentPlan}
          onUpgrade={() => handlePayment('PREMIUM')}
          styles={styles}
          colors={colors}
        />

        <FamilyPlanCard
          currentPlan={currentPlan}
          onChooseFamily={() => handlePayment('FAMILY')}
          styles={styles}
          colors={colors}
        />

        <Text style={styles.footnote}>Cancel anytime. Prices include VAT. Payment handled securely.</Text>
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
      marginTop: 25,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 32,
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
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.backgroundElement,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      borderWidth: 1,
      borderColor: C.border,
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
      marginBottom: 20,
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
    },
    chooseFamilyButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    footnote: {
      fontSize: 13,
      color: C.textSecondary,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 18,
    },
  });
