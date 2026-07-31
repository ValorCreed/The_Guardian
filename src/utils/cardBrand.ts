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

const normalizeText = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .trim();

const digitsOnly = (value?: string | null) => String(value || '').replace(/\D/g, '');

const isMastercard = (digits: string) => {
  if (digits.length < 2) return false;

  const firstTwo = Number(digits.slice(0, 2));
  const firstFour = Number(digits.slice(0, 4));

  return (firstTwo >= 51 && firstTwo <= 55) || (firstFour >= 2221 && firstFour <= 2720);
};

export const detectCardBrand = (
  cardNameOrBank?: string | null,
  cardNumber?: string | null
): CardBrand => {
  const text = normalizeText(cardNameOrBank);
  const digits = digitsOnly(cardNumber);

  /*
   * Prefer explicit user text first because many saved card lists only have
   * the bank/card name available, while the full card number is only loaded
   * on the details screen.
   */
  if (/\b(visa|visacard|visa card|visa debit|visa credit)\b/.test(text)) return 'visa';
  if (/\b(mastercard|master card|master-card|mc card|mc debit|mc credit)\b/.test(text)) return 'mastercard';
  if (/\b(american express|amex)\b/.test(text)) return 'amex';
  if (/\b(discover)\b/.test(text)) return 'discover';
  if (/\b(verve)\b/.test(text)) return 'verve';
  if (/\b(unionpay|union pay)\b/.test(text)) return 'unionpay';
  if (/\b(jcb)\b/.test(text)) return 'jcb';
  if (/\b(diners|diners club)\b/.test(text)) return 'diners';
  if (/\b(rupay|ru pay)\b/.test(text)) return 'rupay';

  /*
   * Fallback to common card-network number prefixes.
   * This does not validate the card; it only gives a helpful visual hint.
   */
  if (/^4/.test(digits)) return 'visa';
  if (isMastercard(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^(6011|65|64[4-9]|622)/.test(digits)) return 'discover';
  if (/^(5060|5061|5078|6500)/.test(digits)) return 'verve';
  if (/^62/.test(digits)) return 'unionpay';
  if (/^(2131|1800|35)/.test(digits)) return 'jcb';
  if (/^3(0[0-5]|[68])/.test(digits)) return 'diners';
  if (/^(60|81|82|508)/.test(digits)) return 'rupay';

  return 'unknown';
};

export const getCardBrandDisplayName = (brand: CardBrand) => {
  switch (brand) {
    case 'visa':
      return 'Visa';
    case 'mastercard':
      return 'Mastercard';
    case 'amex':
      return 'American Express';
    case 'discover':
      return 'Discover';
    case 'verve':
      return 'Verve';
    case 'unionpay':
      return 'UnionPay';
    case 'jcb':
      return 'JCB';
    case 'diners':
      return 'Diners Club';
    case 'rupay':
      return 'RuPay';
    default:
      return 'Card';
  }
};
