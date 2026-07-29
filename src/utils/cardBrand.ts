export type CardBrand =
  | 'visa'
  | 'mastercard'
  | 'amex'
  | 'discover'
  | 'verve'
  | 'unionpay'
  | 'jcb'
  | 'diners'
  | 'rupay'
  | 'unknown';

export type CardBrandDetails = {
  brand: CardBrand;
  displayName: string;
  lengths: number[];
  maxLength: number;
  securityCodeLength: 3 | 4;
  isComplete: boolean;
  isPotentiallyValid: boolean;
  passesLuhn: boolean;
  isValid: boolean;
};

const BRAND_META: Record<
  CardBrand,
  {
    displayName: string;
    lengths: number[];
    securityCodeLength: 3 | 4;
  }
> = {
  visa: {
    displayName: 'Visa',
    lengths: [13, 16, 19],
    securityCodeLength: 3,
  },
  mastercard: {
    displayName: 'Mastercard',
    lengths: [16],
    securityCodeLength: 3,
  },
  amex: {
    displayName: 'American Express',
    lengths: [15],
    securityCodeLength: 4,
  },
  discover: {
    displayName: 'Discover',
    lengths: [16, 19],
    securityCodeLength: 3,
  },
  verve: {
    displayName: 'Verve',
    lengths: [16, 17, 18, 19],
    securityCodeLength: 3,
  },
  unionpay: {
    displayName: 'UnionPay',
    lengths: [16, 17, 18, 19],
    securityCodeLength: 3,
  },
  jcb: {
    displayName: 'JCB',
    lengths: [16, 17, 18, 19],
    securityCodeLength: 3,
  },
  diners: {
    displayName: 'Diners Club',
    lengths: [14, 16],
    securityCodeLength: 3,
  },
  rupay: {
    displayName: 'RuPay',
    lengths: [16],
    securityCodeLength: 3,
  },
  unknown: {
    displayName: 'Other card',
    lengths: [12, 13, 14, 15, 16, 17, 18, 19],
    securityCodeLength: 3,
  },
};

const digitsOnly = (value?: string | null) => String(value || '').replace(/\D/g, '');

const inNumericRange = (
  digits: string,
  prefixLength: number,
  start: number,
  end: number
) => {
  if (digits.length < prefixLength) return false;
  const prefix = Number(digits.slice(0, prefixLength));
  return Number.isFinite(prefix) && prefix >= start && prefix <= end;
};

export function passesLuhnCheck(value?: string | null) {
  const digits = digitsOnly(value);
  if (digits.length < 2) return false;

  let sum = 0;
  let shouldDouble = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

function detectBrandFromNumber(value?: string | null): CardBrand {
  const digits = digitsOnly(value);
  if (!digits) return 'unknown';

  // Verve ranges are checked before broader 50/65 family patterns.
  if (
    inNumericRange(digits, 6, 506099, 506198) ||
    inNumericRange(digits, 6, 507865, 507964) ||
    inNumericRange(digits, 6, 650002, 650027)
  ) {
    return 'verve';
  }

  if (/^3[47]/.test(digits)) return 'amex';

  if (
    inNumericRange(digits, 3, 300, 305) ||
    /^3[689]/.test(digits)
  ) {
    return 'diners';
  }

  if (inNumericRange(digits, 4, 3528, 3589)) return 'jcb';

  if (
    inNumericRange(digits, 2, 51, 55) ||
    inNumericRange(digits, 4, 2221, 2720)
  ) {
    return 'mastercard';
  }

  if (/^4/.test(digits)) return 'visa';

  // Discover's 622 range must be checked before UnionPay's broad 62 prefix.
  if (
    /^6011/.test(digits) ||
    /^65/.test(digits) ||
    inNumericRange(digits, 3, 644, 649) ||
    inNumericRange(digits, 6, 622126, 622925)
  ) {
    return 'discover';
  }

  if (/^62/.test(digits)) return 'unionpay';

  // RuPay has several issuer ranges. These cover common modern ranges and
  // the official sandbox BIN used in the included test data.
  if (/^(508|607482|81|82)/.test(digits)) return 'rupay';

  return 'unknown';
}

function detectBrandFromName(value?: string | null): CardBrand {
  const name = String(value || '').trim().toLowerCase();
  if (!name) return 'unknown';

  if (name.includes('master')) return 'mastercard';
  if (name.includes('visa')) return 'visa';
  if (name.includes('american express') || name.includes('amex')) return 'amex';
  if (name.includes('discover')) return 'discover';
  if (name.includes('verve')) return 'verve';
  if (name.includes('unionpay') || name.includes('union pay')) return 'unionpay';
  if (name.includes('jcb')) return 'jcb';
  if (name.includes('diners')) return 'diners';
  if (name.includes('rupay') || name.includes('ru pay')) return 'rupay';

  return 'unknown';
}

/**
 * Backward-compatible helper used by existing Vault screens.
 * The second argument is treated as the card-number source when supplied;
 * otherwise the first argument may be either a name or number.
 */
export function detectCardBrand(
  nameOrNumber?: string | null,
  cardNumber?: string | null
): CardBrand {
  const numberSource = String(cardNumber ?? nameOrNumber ?? '').trim();
  const normalizedNumber = digitsOnly(numberSource);
  const looksLikePan =
    normalizedNumber.length > 0 &&
    normalizedNumber.length <= 19 &&
    /^[\d\s\-•*]+$/.test(numberSource);

  if (looksLikePan) {
    const numberBrand = detectBrandFromNumber(normalizedNumber);
    if (numberBrand !== 'unknown') return numberBrand;
  }

  return detectBrandFromName(`${nameOrNumber || ''} ${cardNumber || ''}`);
}

export function getCardBrandDisplayName(brand: CardBrand) {
  return BRAND_META[brand].displayName;
}

export function getCardBrandDetails(value?: string | null): CardBrandDetails {
  const digits = digitsOnly(value).slice(0, 19);
  const brand = detectBrandFromNumber(digits);
  const meta = BRAND_META[brand];
  const maxLength = Math.max(...meta.lengths);
  const isComplete = meta.lengths.includes(digits.length);
  const passesLuhn = isComplete && passesLuhnCheck(digits);

  return {
    brand,
    displayName: meta.displayName,
    lengths: meta.lengths,
    maxLength,
    securityCodeLength: meta.securityCodeLength,
    isComplete,
    isPotentiallyValid: digits.length <= maxLength,
    passesLuhn,
    isValid: isComplete && passesLuhn,
  };
}

export function formatCardNumber(value?: string | null) {
  const digits = digitsOnly(value).slice(0, 19);
  const brand = detectBrandFromNumber(digits);

  if (brand === 'amex') {
    return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)]
      .filter(Boolean)
      .join(' ');
  }

  if (brand === 'diners' && digits.length <= 14) {
    return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 14)]
      .filter(Boolean)
      .join(' ');
  }

  return digits.match(/.{1,4}/g)?.join(' ') || digits;
}