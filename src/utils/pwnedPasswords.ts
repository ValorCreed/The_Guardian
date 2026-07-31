export type PwnedPasswordResult = {
  breached: boolean;
  count: number;
  checkedAt: string;
  hashPrefix: string;
};

const PWNED_PASSWORDS_RANGE_URL = 'https://api.pwnedpasswords.com/range';
const memoryCache = new Map<string, PwnedPasswordResult>();

function rotateLeft(value: number, bits: number) {
  return (value << bits) | (value >>> (32 - bits));
}

function toUtf8Bytes(value: string) {
  const encoded = unescape(encodeURIComponent(value));
  return Array.from(encoded).map((char) => char.charCodeAt(0));
}

export function sha1Hex(value: string) {
  const bytes = toUtf8Bytes(value);
  const originalBitLength = bytes.length * 8;

  bytes.push(0x80);

  while ((bytes.length % 64) !== 56) {
    bytes.push(0);
  }

  const high = Math.floor(originalBitLength / 0x100000000);
  const low = originalBitLength >>> 0;

  bytes.push((high >>> 24) & 0xff);
  bytes.push((high >>> 16) & 0xff);
  bytes.push((high >>> 8) & 0xff);
  bytes.push(high & 0xff);
  bytes.push((low >>> 24) & 0xff);
  bytes.push((low >>> 16) & 0xff);
  bytes.push((low >>> 8) & 0xff);
  bytes.push(low & 0xff);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array<number>(80).fill(0);

    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4;
      words[index] =
        (bytes[start] << 24) |
        (bytes[start + 1] << 16) |
        (bytes[start + 2] << 8) |
        bytes[start + 3];
    }

    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(
        words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16],
        1
      );
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index += 1) {
      let f = 0;
      let k = 0;

      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (rotateLeft(a, 5) + f + e + k + words[index]) | 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  const toHex = (number: number) => (number >>> 0).toString(16).padStart(8, '0');

  return `${toHex(h0)}${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}`.toUpperCase();
}

export async function checkPwnedPassword(password: string): Promise<PwnedPasswordResult> {
  if (!password) {
    return {
      breached: false,
      count: 0,
      checkedAt: new Date().toISOString(),
      hashPrefix: '',
    };
  }

  const hash = sha1Hex(password);
  const cached = memoryCache.get(hash);

  if (cached) {
    return cached;
  }

  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const response = await fetch(`${PWNED_PASSWORDS_RANGE_URL}/${prefix}`, {
    method: 'GET',
    headers: {
      'Add-Padding': 'true',
      'User-Agent': 'TheGuardianPasswordVault',
    },
  });

  if (!response.ok) {
    throw new Error(`Pwned Passwords check failed with status ${response.status}`);
  }

  const body = await response.text();
  let breachCount = 0;

  body.split(/\r?\n/).forEach((line) => {
    const [returnedSuffix, countValue] = line.trim().split(':');

    if (!returnedSuffix || !countValue) return;

    if (returnedSuffix.toUpperCase() === suffix) {
      breachCount = Number.parseInt(countValue, 10) || 0;
    }
  });

  const result: PwnedPasswordResult = {
    breached: breachCount > 0,
    count: breachCount,
    checkedAt: new Date().toISOString(),
    hashPrefix: prefix,
  };

  memoryCache.set(hash, result);
  return result;
}
