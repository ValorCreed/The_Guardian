import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CardBrand } from '../utils/cardBrand';

type Props = {
  brand: CardBrand;
  compact?: boolean;
};

const BrandText = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) => <Text style={[styles.brandText, style]}>{children}</Text>;

export default function CardBrandLogo({ brand, compact = false }: Props) {
  const scaleStyle = compact ? styles.compact : null;

  if (brand === 'mastercard') {
    return (
      <View style={[styles.logoBox, styles.clearBox, scaleStyle]}>
        <View style={styles.mastercardWrap}>
          <View style={[styles.masterCircle, styles.masterLeft]} />
          <View style={[styles.masterCircle, styles.masterRight]} />
        </View>
        {!compact && <Text style={styles.masterText}>mastercard</Text>}
      </View>
    );
  }

  if (brand === 'visa') {
    return (
      <View style={[styles.logoBox, styles.visaBox, scaleStyle]}>
        <BrandText style={styles.visaText}>VISA</BrandText>
      </View>
    );
  }

  if (brand === 'amex') {
    return (
      <View style={[styles.logoBox, styles.amexBox, scaleStyle]}>
        <BrandText style={styles.amexText}>AMEX</BrandText>
      </View>
    );
  }

  if (brand === 'discover') {
    return (
      <View style={[styles.logoBox, styles.discoverBox, scaleStyle]}>
        <BrandText style={styles.discoverText}>DISCOVER</BrandText>
      </View>
    );
  }

  if (brand === 'verve') {
    return (
      <View style={[styles.logoBox, styles.verveBox, scaleStyle]}>
        <BrandText style={styles.verveText}>verve</BrandText>
      </View>
    );
  }

  if (brand === 'unionpay') {
    return (
      <View style={[styles.logoBox, styles.unionBox, scaleStyle]}>
        <BrandText style={styles.unionText}>UnionPay</BrandText>
      </View>
    );
  }

  if (brand === 'jcb') {
    return (
      <View style={[styles.logoBox, styles.jcbBox, scaleStyle]}>
        <BrandText style={styles.jcbText}>JCB</BrandText>
      </View>
    );
  }

  if (brand === 'diners') {
    return (
      <View style={[styles.logoBox, styles.dinersBox, scaleStyle]}>
        <BrandText style={styles.dinersText}>DINERS</BrandText>
      </View>
    );
  }

  if (brand === 'rupay') {
    return (
      <View style={[styles.logoBox, styles.rupayBox, scaleStyle]}>
        <BrandText style={styles.rupayText}>RuPay</BrandText>
      </View>
    );
  }

  return (
    <View style={[styles.genericChip, scaleStyle]}>
      <View style={styles.genericChipLine} />
      <View style={styles.genericChipLineShort} />
    </View>
  );
}

const styles = StyleSheet.create({
  logoBox: {
    minWidth: 60,
    height: 34,
    borderRadius: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  compact: {
    transform: [{ scale: 0.92 }],
  },
  clearBox: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  brandText: {
    includeFontPadding: false,
    textAlign: 'center',
  },

  visaBox: {
    backgroundColor: '#FFFFFF',
  },
  visaText: {
    color: '#173B87',
    fontSize: 18,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.6,
  },

  mastercardWrap: {
    width: 58,
    height: 30,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  masterCircle: {
    position: 'absolute',
    width: 31,
    height: 31,
    borderRadius: 16,
  },
  masterLeft: {
    left: 7,
    backgroundColor: '#EB001B',
  },
  masterRight: {
    right: 7,
    backgroundColor: '#F79E1B',
    opacity: 0.92,
  },
  masterText: {
    marginTop: -2,
    color: '#fff',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  amexBox: {
    backgroundColor: '#2E77BC',
  },
  amexText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.2,
  },

  discoverBox: {
    backgroundColor: '#FFFFFF',
  },
  discoverText: {
    color: '#111827',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.2,
  },

  verveBox: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  verveText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.5,
  },

  unionBox: {
    backgroundColor: '#FFFFFF',
  },
  unionText: {
    color: '#0F4C81',
    fontSize: 10,
    fontWeight: '900',
  },

  jcbBox: {
    backgroundColor: '#FFFFFF',
  },
  jcbText: {
    color: '#0C8F5A',
    fontSize: 16,
    fontWeight: '900',
  },

  dinersBox: {
    backgroundColor: '#FFFFFF',
  },
  dinersText: {
    color: '#0A4A7A',
    fontSize: 10,
    fontWeight: '900',
  },

  rupayBox: {
    backgroundColor: '#FFFFFF',
  },
  rupayText: {
    color: '#1F3B75',
    fontSize: 13,
    fontWeight: '900',
  },

  genericChip: {
    width: 50,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    paddingHorizontal: 9,
    gap: 5,
  },
  genericChipLine: {
    width: '100%',
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  genericChipLineShort: {
    width: '62%',
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.36)',
  },
});
