const safeEncode = (text: string) => {
  return encodeURIComponent(text);
};

const safeDecode = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

export const encryptPassword = (password: string) => {
  return safeEncode(password);
};

export const decryptPassword = (encryptedPassword: string) => {
  return safeDecode(encryptedPassword || '');
};

export const encryptJson = (data: any) => {
  return safeEncode(JSON.stringify(data));
};

export const decryptJson = <T,>(encryptedData: string, fallback: T): T => {
  try {
    if (!encryptedData) return fallback;
    return JSON.parse(safeDecode(encryptedData));
  } catch {
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