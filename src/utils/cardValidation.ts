import { getCardBrandDetails } from './cardBrand';

export type CardValidationInput = {
  cardholderName: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
};

export type CardValidationResult = {
  valid: boolean;
  cardNumber: string;
  expiry: string;
  cvv: string;
  brandName: string;
  errorTitle?: string;
  errorMessage?: string;
};

export const digitsOnly = (value?: string | null) =>
  String(value || '').replace(/\D/g, '');

export const formatExpiryInput = (value: string) => {
  const cleaned = digitsOnly(value).slice(0, 4);
  if (cleaned.length >= 3) {
    return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
  }
  return cleaned;
};

export const normalizeExpiry = (value?: string | null) => {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length !== 4) return String(value || '').trim();
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

export const isFutureExpiry = (value?: string | null, now = new Date()) => {
  const normalized = normalizeExpiry(value);
  const match = normalized.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return false;

  const month = Number(match[1]);
  const year = Number(match[2]);
  if (month < 1 || month > 12) return false;

  const currentYear = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;

  return year > currentYear || (year === currentYear && month >= currentMonth);
};

export function validateCardForm(input: CardValidationInput): CardValidationResult {
  const cardNumber = digitsOnly(input.cardNumber).slice(0, 19);
  const cvv = digitsOnly(input.cvv).slice(0, 4);
  const expiry = normalizeExpiry(input.expiry);
  const cardDetails = getCardBrandDetails(cardNumber);

  const base = {
    cardNumber,
    cvv,
    expiry,
    brandName: cardDetails.displayName,
  };

  if (!input.cardholderName.trim()) {
    return {
      ...base,
      valid: false,
      errorTitle: 'Missing name',
      errorMessage: 'Please enter the cardholder name.',
    };
  }

  if (!cardDetails.isComplete || !cardDetails.passesLuhn) {
    return {
      ...base,
      valid: false,
      errorTitle: 'Invalid card number',
      errorMessage: 'Enter a complete card number with a valid number format.',
    };
  }

  if (!isFutureExpiry(expiry)) {
    return {
      ...base,
      valid: false,
      errorTitle: 'Invalid expiry',
      errorMessage: 'Enter a valid future expiry date in MM/YY format.',
    };
  }

  const acceptedCvvLengths =
    cardDetails.brand === 'unknown'
      ? [3, 4]
      : [cardDetails.securityCodeLength];

  if (!acceptedCvvLengths.includes(cvv.length)) {
    const expected = acceptedCvvLengths.length === 1
      ? `${acceptedCvvLengths[0]} digits`
      : '3 or 4 digits';

    return {
      ...base,
      valid: false,
      errorTitle: 'Invalid security code',
      errorMessage: `${cardDetails.displayName} security codes must contain ${expected}.`,
    };
  }

  return {
    ...base,
    valid: true,
  };
}
