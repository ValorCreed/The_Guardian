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
        <View style={styles.discoverRow}>
          <BrandText style={styles.discoverText}>DISC</BrandText>
          <View style={styles.discoverSun} />
          <BrandText style={styles.discoverText}>VER</BrandText>
        </View>
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
        <View style={styles.unionMark}>
          <View style={[styles.unionStripe, styles.unionRed]} />
          <View style={[styles.unionStripe, styles.unionBlue]} />
          <View style={[styles.unionStripe, styles.unionGreen]} />
        </View>
        <BrandText style={styles.unionText}>UnionPay</BrandText>
      </View>
    );
  }

  if (brand === 'jcb') {
    return (
      <View style={[styles.logoBox, styles.jcbBox, scaleStyle]}>
        <View style={styles.jcbMark}>
          <View style={[styles.jcbTile, styles.jcbBlue]}>
            <Text style={styles.jcbLetter}>J</Text>
          </View>
          <View style={[styles.jcbTile, styles.jcbRed]}>
            <Text style={styles.jcbLetter}>C</Text>
          </View>
          <View style={[styles.jcbTile, styles.jcbGreen]}>
            <Text style={styles.jcbLetter}>B</Text>
          </View>
        </View>
      </View>
    );
  }

  if (brand === 'diners') {
    return (
      <View style={[styles.logoBox, styles.dinersBox, scaleStyle]}>
        <View style={styles.dinersMark}>
          <View style={styles.dinersLine} />
          <View style={[styles.dinersLine, styles.dinersLineRight]} />
        </View>
        {!compact && <BrandText style={styles.dinersText}>DINERS</BrandText>}
      </View>
    );
  }

  if (brand === 'rupay') {
    return (
      <View style={[styles.logoBox, styles.rupayBox, scaleStyle]}>
        <BrandText style={styles.rupayText}>RuPay</BrandText>
        <View style={styles.rupayArrows}>
          <View style={[styles.rupayArrow, styles.rupayOrange]} />
          <View style={[styles.rupayArrow, styles.rupayGreen]} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.genericChip, scaleStyle]}>
      <View style={styles.genericChipSquare} />
      <View style={styles.genericChipLines}>
        <View style={styles.genericChipLine} />
        <View style={styles.genericChipLineShort} />
      </View>
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

  visaBox: { backgroundColor: '#FFFFFF' },
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
  masterLeft: { left: 7, backgroundColor: '#EB001B' },
  masterRight: { right: 7, backgroundColor: '#F79E1B', opacity: 0.92 },
  masterText: {
    marginTop: -2,
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  amexBox: { backgroundColor: '#2E77BC' },
  amexText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },

  discoverBox: { backgroundColor: '#FFFFFF' },
  discoverRow: { flexDirection: 'row', alignItems: 'center' },
  discoverText: { color: '#111827', fontSize: 9, fontWeight: '900' },
  discoverSun: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F58220',
    marginHorizontal: -1,
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
    flexDirection: 'row',
    gap: 4,
  },
  unionMark: { flexDirection: 'row', gap: 1 },
  unionStripe: { width: 5, height: 20, borderRadius: 2 },
  unionRed: { backgroundColor: '#E21836' },
  unionBlue: { backgroundColor: '#1B75BB' },
  unionGreen: { backgroundColor: '#00A651' },
  unionText: { color: '#0F4C81', fontSize: 9, fontWeight: '900' },

  jcbBox: { backgroundColor: '#FFFFFF' },
  jcbMark: { flexDirection: 'row', gap: 2 },
  jcbTile: {
    width: 16,
    height: 23,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jcbBlue: { backgroundColor: '#0072BC' },
  jcbRed: { backgroundColor: '#E60012' },
  jcbGreen: { backgroundColor: '#00A651' },
  jcbLetter: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },

  dinersBox: { backgroundColor: '#FFFFFF', flexDirection: 'row', gap: 5 },
  dinersMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    borderColor: '#0A4A7A',
    position: 'relative',
  },
  dinersLine: {
    position: 'absolute',
    left: 7,
    top: 4,
    width: 3,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#0A4A7A',
  },
  dinersLineRight: { left: 13 },
  dinersText: { color: '#0A4A7A', fontSize: 8, fontWeight: '900' },

  rupayBox: { backgroundColor: '#FFFFFF', flexDirection: 'row', gap: 4 },
  rupayText: { color: '#1F3B75', fontSize: 13, fontWeight: '900' },
  rupayArrows: { flexDirection: 'row', gap: 2, transform: [{ skewX: '-18deg' }] },
  rupayArrow: { width: 5, height: 16, borderRadius: 2 },
  rupayOrange: { backgroundColor: '#F7941D' },
  rupayGreen: { backgroundColor: '#0A9F4D' },

  genericChip: {
    minWidth: 58,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 6,
  },
  genericChipSquare: {
    width: 18,
    height: 14,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.48)',
  },
  genericChipLines: { flex: 1, gap: 4 },
  genericChipLine: {
    width: '100%',
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  genericChipLineShort: {
    width: '62%',
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.36)',
  },
});