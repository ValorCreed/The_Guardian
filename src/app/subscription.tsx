import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { ChevronLeft, Check } from 'lucide-react-native';
import { router } from 'expo-router';

// ---------------------------------------------------------------------------
// Reusable bits
// ---------------------------------------------------------------------------

interface FeatureRowProps {
  label: string;
  isLast?: boolean;
}

interface PriceTagProps {
  price: string;
  period: string;
}

const FeatureRow = ({ label, isLast = false }: FeatureRowProps) => (
  <View style={[styles.featureRow, isLast && { marginBottom: 0 }]}> 
    <Check size={16} color="#1B4332" strokeWidth={3} />
    <Text style={styles.featureLabel}>{label}</Text>
  </View>
);

const PriceTag = ({ price, period }: PriceTagProps) => (
  <Text style={styles.priceTag}>
    <Text style={styles.priceAmount}>{price}</Text>
    <Text style={styles.pricePeriod}>/{period}</Text>
  </Text>
);

// ---------------------------------------------------------------------------
// Plan cards
// ---------------------------------------------------------------------------

interface PremiumPlanCardProps {
  onUpgrade: () => void;
}

interface FamilyPlanCardProps {
  onChooseFamily: () => void;
}

const FreePlanCard = () => (
  <View style={styles.card}>
    <View style={styles.cardHeaderRow}>
      <Text style={styles.planName}>Free</Text>
      <PriceTag price="£0" period="forever" />
    </View>

    <View style={styles.featureList}>
      <FeatureRow label="50 passwords" />
      <FeatureRow label="Basic vault" />
      <FeatureRow label="1 device" isLast />
    </View>

    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.currentPlanButton}
      disabled
    >
      <Text style={styles.currentPlanButtonText}>Current plan</Text>
    </TouchableOpacity>
  </View>
);

const PremiumPlanCard = ({ onUpgrade }: PremiumPlanCardProps) => (
  <View style={[styles.card, styles.premiumCard]}>
    <View style={styles.badge}>
      <Text style={styles.badgeText}>MOST POPULAR</Text>
    </View>

    <View style={styles.cardHeaderRow}>
      <Text style={styles.planName}>Premium</Text>
      <PriceTag price="£3.99" period="month" />
    </View>

    <View style={styles.featureList}>
      <FeatureRow label="Unlimited passwords" />
      <FeatureRow label="Document vault" />
      <FeatureRow label="Breach monitoring" />
      <FeatureRow label="All devices" isLast />
    </View>

    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.upgradeButton}
      onPress={onUpgrade}
    >
      <Text style={styles.upgradeButtonText}>Upgrade</Text>
    </TouchableOpacity>
  </View>
);

const FamilyPlanCard = ({ onChooseFamily }: FamilyPlanCardProps) => (
  <View style={styles.card}>
    <View style={styles.cardHeaderRow}>
      <Text style={styles.planName}>Family</Text>
      <PriceTag price="£6.99" period="month" />
    </View>

    <View style={styles.featureList}>
      <FeatureRow label="Everything in Premium" />
      <FeatureRow label="Up to 6 members" />
      <FeatureRow label="Shared vaults" />
      <FeatureRow label="Admin controls" isLast />
    </View>

    <TouchableOpacity
      activeOpacity={0.8}
      style={styles.chooseFamilyButton}
      onPress={onChooseFamily}
    >
      <Text style={styles.chooseFamilyButtonText}>Choose Family</Text>
    </TouchableOpacity>
  </View>
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

interface PlansScreenProps {
  navigation?: {
    goBack?: () => void;
  };
}

export default function PlansScreen({ navigation }: PlansScreenProps) {
  const handleBack = () => {
    if (navigation?.goBack) navigation.goBack();
  };

  const handleUpgrade = () => {
    // hook up navigation / purchase flow here
  };

  const handleChooseFamily = () => {
    // hook up navigation / purchase flow here
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F5F2" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <TouchableOpacity
          activeOpacity={0.6}
          style={styles.backButton}
           onPress={() => router.replace('/home')}

        >
          <ChevronLeft size={22} color="#14201A" />
        </TouchableOpacity>

        <Text style={styles.eyebrow}>Choose your protection</Text>
        <Text style={styles.title}>Plans</Text>

        {/* Plan cards */}
        <FreePlanCard />
        <PremiumPlanCard onUpgrade={handleUpgrade} />
        <FamilyPlanCard onChooseFamily={handleChooseFamily} />

        <Text style={styles.footnote}>
          Cancel anytime. Prices include VAT. Payment handled securely.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F3F5F2',
  },
  scrollContent: {
    marginTop: 25,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },

  // Header
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 14,
    color: '#8B968F',
    marginBottom: 2,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#14201A',
    marginBottom: 20,
  },

  // Card shared
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E7EAE5',
    padding: 20,
    marginBottom: 20,
  },
  premiumCard: {
    backgroundColor: '#FBF3E4',
    borderColor: '#E0B65C',
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
    color: '#14201A',
  },
  priceTag: {
    textAlign: 'right',
  },
  priceAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#14201A',
  },
  pricePeriod: {
    fontSize: 14,
    color: '#8B968F',
  },

  // Badge
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E0B65C',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 14,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#4A3A12',
  },

  // Features
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
    color: '#3A4A40',
    marginLeft: 10,
  },

  // Buttons
  currentPlanButton: {
    borderWidth: 1.5,
    borderColor: '#D7DAD4',
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
  },
  currentPlanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#14201A',
  },
 upgradeButton: {
  backgroundColor: '#E0B65C',
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
    backgroundColor: '#1B4332',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
  },
  chooseFamilyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Footnote
  footnote: {
    fontSize: 13,
    color: '#8B968F',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
});