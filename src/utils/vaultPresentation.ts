const GENERIC_PACKAGE_SEGMENTS = new Set([
  'app',
  'apps',
  'android',
  'mobile',
  'client',
  'release',
  'prod',
  'production',
  'debug',
  'dev',
]);

const PACKAGE_LABEL_OVERRIDES: Record<string, string> = {
  'com.swiftcare.app': 'SwiftCare',
  'com.elinilesolutions.attendance_knust': 'KNUST Attendance',
  'host.exp.exponent': 'Expo Go',
  'com.exponent.group': 'Expo Go',
  'com.exponent.app': 'Expo Go',
  'com.android.chrome': 'Chrome',
  'com.google.android.gm': 'Gmail',
  'com.google.android.apps.messaging': 'Google Messages',
  'com.google.android.youtube': 'YouTube',
};

const PACKAGE_IDENTIFIER_PATTERN = /^(?:com|org|net|io|app|dev|me|co|host)(?:\.[a-z][a-z0-9_]*){2,}$/i;
const PACKAGE_IDENTIFIER_IN_TEXT_PATTERN = /\b(?:com|org|net|io|app|dev|me|co|host)(?:\.[a-z][a-z0-9_]*){2,}\b/gi;
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

const decodeDisplayText = (value?: string | null) => {
  if (value === undefined || value === null) return '';

  let cleaned = String(value).trim();
  if (!cleaned || cleaned.startsWith('v1:')) return '';

  for (let index = 0; index < 2; index += 1) {
    if (!cleaned.includes('%')) break;

    try {
      const decoded = decodeURIComponent(cleaned);
      if (decoded === cleaned) break;
      cleaned = decoded.trim();
    } catch {
      break;
    }
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'string') cleaned = parsed.trim();
  } catch {
    // Keep ordinary text unchanged.
  }

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  return cleaned;
};

const titleCaseToken = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === 'knust') return 'KNUST';
      if (lower === 'id') return 'ID';
      if (lower === 'tv') return 'TV';
      return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`;
    })
    .join(' ');

export const isAndroidPackageIdentifier = (value?: string | null) => {
  const cleaned = decodeDisplayText(value).toLowerCase();
  return PACKAGE_IDENTIFIER_PATTERN.test(cleaned);
};

export const getFriendlyPackageLabel = (value?: string | null) => {
  const cleaned = decodeDisplayText(value).toLowerCase();
  if (!cleaned) return '';

  const override = PACKAGE_LABEL_OVERRIDES[cleaned];
  if (override) return override;

  const segments = cleaned.split('.').filter(Boolean);

  if (
    segments.includes('exponent') ||
    (segments.includes('expo') && segments.some((part) => part === 'host' || part === 'com'))
  ) {
    return 'Expo Go';
  }
  if (segments.length < 2) return titleCaseToken(cleaned);

  const meaningful = [...segments]
    .reverse()
    .find((segment) => !GENERIC_PACKAGE_SEGMENTS.has(segment));

  return titleCaseToken(meaningful || segments[segments.length - 1]);
};

const getHostname = (value: string) => {
  const clean = value.trim();
  if (!clean) return '';

  try {
    const normalized = URL_SCHEME_PATTERN.test(clean) ? clean : `https://${clean}`;
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

const getFriendlyDomainLabel = (value?: string | null) => {
  const cleaned = decodeDisplayText(value);
  const hostname = getHostname(cleaned);
  if (!hostname) return '';

  if (isAndroidPackageIdentifier(hostname)) {
    return getFriendlyPackageLabel(hostname);
  }

  const parts = hostname.split('.').filter(Boolean);
  if (parts.length === 0) return '';

  const commonSubdomains = new Set(['www', 'accounts', 'login', 'auth', 'secure', 'm']);
  const usableParts = parts.filter((part, index) => {
    if (index === parts.length - 1) return false;
    return !commonSubdomains.has(part);
  });

  const candidate = usableParts[usableParts.length - 1] || parts[0];
  return titleCaseToken(candidate);
};

export const getFriendlyVaultTitle = (
  title?: string | null,
  website?: string | null,
  fallback = 'Saved login'
) => {
  const cleanTitle = decodeDisplayText(title);
  const cleanWebsite = decodeDisplayText(website);

  if (isAndroidPackageIdentifier(cleanTitle)) {
    return getFriendlyPackageLabel(cleanTitle) || fallback;
  }

  const titleLooksLikeAddress =
    URL_SCHEME_PATTERN.test(cleanTitle) ||
    (cleanTitle.includes('.') && !cleanTitle.includes(' '));

  if (cleanTitle && titleLooksLikeAddress) {
    const friendlyDomain = getFriendlyDomainLabel(cleanTitle);
    if (friendlyDomain) return friendlyDomain;
  }

  if (cleanTitle) return cleanTitle;

  if (isAndroidPackageIdentifier(cleanWebsite)) {
    return getFriendlyPackageLabel(cleanWebsite) || fallback;
  }

  const friendlyWebsite = getFriendlyDomainLabel(cleanWebsite);
  return friendlyWebsite || cleanWebsite || fallback;
};

export const getFriendlyVaultSubtitle = (
  username?: string | null,
  website?: string | null,
  fallback = 'Login details'
) => {
  const cleanUsername = decodeDisplayText(username);
  if (cleanUsername) return cleanUsername;

  const cleanWebsite = decodeDisplayText(website);
  if (!cleanWebsite) return fallback;

  if (isAndroidPackageIdentifier(cleanWebsite)) {
    return `${getFriendlyPackageLabel(cleanWebsite)} app`;
  }

  return cleanWebsite;
};

export const humanizeVaultPresentationText = (value?: string | null) => {
  const cleaned = decodeDisplayText(value);
  if (!cleaned) return '';

  return cleaned.replace(PACKAGE_IDENTIFIER_IN_TEXT_PATTERN, (match) => {
    return getFriendlyPackageLabel(match) || match;
  });
};
