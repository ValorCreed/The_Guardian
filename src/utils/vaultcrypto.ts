/*
 * Real vault encryption happens on the Spring Boot backend before values are stored.
 * These helpers now only format frontend payloads and decode older values that were
 * saved by the previous encodeURIComponent-based implementation.
 */

const safeDecode = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

export const encryptPassword = (password: string) => {
  return password;
};

export const decryptPassword = (passwordFromApi: string) => {
  return passwordFromApi || '';
};

/*
 * Do not URL-encode simple strings anymore.
 * The backend encrypts these raw values using AES-GCM.
 *
 * Old behavior turned "Morgan" into %22Morgan%22 because it JSON-stringified and
 * URL-encoded simple strings. That is why cardholder names looked strange.
 */
export const encryptJson = (data: any) => {
  if (data === undefined || data === null) return '';
  if (typeof data === 'string') return data;
  return JSON.stringify(data);
};

export const decryptJson = <T,>(encryptedData: string, fallback: T): T => {
  if (!encryptedData) return fallback;

  const decoded = safeDecode(encryptedData).trim();

  try {
    return JSON.parse(decoded) as T;
  } catch {
    if (typeof fallback === 'string') {
      return decoded as T;
    }

    return fallback;
  }
};

export const maskPassword = (password?: string) => {
  if (!password) return '••••••••';
  return '•'.repeat(12);
};

export const maskCardNumber = (cardNumber?: string) => {
  const digits = (cardNumber || '').replace(/\D/g, '');
  const last4 = digits.slice(-4).padStart(4, '•');
  return `••••  ••••  ••••  ${last4}`;
};
