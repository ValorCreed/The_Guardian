import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';

import { api, BackupStatusResponse, SubscriptionResponse } from '../services/api';
import { decryptPassword } from '../utils/vaultcrypto';

type VaultPasswordItem = {
  id: number | string;
  title?: string;
  usernameValue?: string;
  encryptedPassword?: string;
  encryptedData?: string;
  website?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SecurityIssueType =
  | 'WEAK'
  | 'MEDIUM'
  | 'REUSED'
  | 'OLD'
  | 'MISSING_WEBSITE'
  | 'MISSING_USERNAME'
  | 'EMAIL_UNVERIFIED'
  | 'TWO_FACTOR_OFF'
  | 'BACKUP_NEEDED';

export type SecurityIssue = {
  id: number | string;
  type: SecurityIssueType;
  severity: 'danger' | 'warning' | 'info';
  title: string;
  subtitle: string;
  initial: string;
  actionRoute?: string;
  itemId?: number | string;
  premiumOnly?: boolean;
};

export type SecurityReport = {
  score: number;
  totalPasswords: number;
  weakCount: number;
  mediumCount: number;
  strongCount: number;
  reusedCount: number;
  oldCount: number;
  missingInfoCount: number;
  issues: SecurityIssue[];
  freeIssues: SecurityIssue[];
  premiumIssues: SecurityIssue[];
  isPremiumOrFamily: boolean;
  plan: 'FREE' | 'PREMIUM' | 'FAMILY' | string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  backupStatus?: BackupStatusResponse | null;
};

const emptyReport: SecurityReport = {
  score: 0,
  totalPasswords: 0,
  weakCount: 0,
  mediumCount: 0,
  strongCount: 0,
  reusedCount: 0,
  oldCount: 0,
  missingInfoCount: 0,
  issues: [],
  freeIssues: [],
  premiumIssues: [],
  isPremiumOrFamily: false,
  plan: 'FREE',
  backupStatus: null,
};

const OLD_PASSWORD_DAYS = 180;

const cleanValue = (value?: string | null) => {
  if (!value) return '';

  let cleaned = String(value).trim();

  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // Keep original if it cannot be decoded.
  }

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }

  return cleaned;
};

const getInitial = (title?: string) => {
  const cleanTitle = cleanValue(title) || 'P';
  return cleanTitle.slice(0, 1).toUpperCase();
};

const getPasswordValue = (item: VaultPasswordItem) => {
  const rawValue = cleanValue(item.encryptedPassword || item.encryptedData || '');

  if (!rawValue) return '';

  try {
    return decryptPassword(rawValue);
  } catch {
    return rawValue;
  }
};

const getStrengthScore = (password: string) => {
  let score = 0;

  if (password.length >= 8) score += 15;
  if (password.length >= 12) score += 20;
  if (password.length >= 16) score += 10;
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 15;
  if (/[0-9]/.test(password)) score += 15;
  if (/[^A-Za-z0-9]/.test(password)) score += 15;

  const common = ['password', 'qwerty', 'admin', 'welcome', 'guardian', '123456'];
  if (common.some((word) => password.toLowerCase().includes(word))) score -= 25;
  if (/(.)\1{2,}/.test(password)) score -= 10;

  return Math.max(0, Math.min(score, 100));
};

const getStrengthLabel = (score: number): 'WEAK' | 'MEDIUM' | 'STRONG' => {
  if (score < 45) return 'WEAK';
  if (score < 75) return 'MEDIUM';
  return 'STRONG';
};

const getSubtitle = (password: string, strengthScore: number) => {
  const problems: string[] = [];

  if (password.length < 8) problems.push('too short');
  if (password.length < 12) problems.push('less than 12 characters');
  if (!/[A-Z]/.test(password)) problems.push('missing uppercase letters');
  if (!/[0-9]/.test(password)) problems.push('missing numbers');
  if (!/[^A-Za-z0-9]/.test(password)) problems.push('missing symbols');

  if (problems.length === 0) {
    return `Password strength score is ${strengthScore}/100.`;
  }

  return `Password is ${problems.join(', ')}.`;
};

const daysBetweenNowAnd = (value?: string) => {
  if (!value) return 0;

  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return 0;

  return Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24));
};

function makeIssue(input: Omit<SecurityIssue, 'initial'> & { initial?: string }): SecurityIssue {
  return {
    initial: input.initial || getInitial(input.title),
    ...input,
  };
}

function calculateSecurityReport(
  passwords: VaultPasswordItem[],
  subscription?: SubscriptionResponse,
  settings?: { emailVerified: boolean; twoFactorEnabled: boolean },
  backupStatus?: BackupStatusResponse | null
): SecurityReport {
  const validPasswords = passwords.filter((item) => item && item.id !== undefined && item.id !== null);
  const plan = subscription?.plan || 'FREE';
  const isPremiumOrFamily = plan === 'PREMIUM' || plan === 'FAMILY';

  if (validPasswords.length === 0) {
    return {
      ...emptyReport,
      plan,
      isPremiumOrFamily,
      emailVerified: settings?.emailVerified,
      twoFactorEnabled: settings?.twoFactorEnabled,
      backupStatus: backupStatus || null,
    };
  }

  let weakCount = 0;
  let mediumCount = 0;
  let strongCount = 0;
  let reusedCount = 0;
  let oldCount = 0;
  let missingInfoCount = 0;
  let totalStrength = 0;

  const issues: SecurityIssue[] = [];
  const passwordMap = new Map<string, VaultPasswordItem[]>();

  validPasswords.forEach((item) => {
    const password = getPasswordValue(item);
    const title = cleanValue(item.title) || cleanValue(item.website) || 'Untitled password';
    const username = cleanValue(item.usernameValue);
    const website = cleanValue(item.website);
    const strengthScore = getStrengthScore(password);
    const strengthLabel = getStrengthLabel(strengthScore);
    const changedAt = item.updatedAt || item.createdAt;
    const ageDays = daysBetweenNowAnd(changedAt);

    totalStrength += strengthScore;

    if (password) {
      // Reuse detection is based on exact decrypted password equality.
      // Do not lowercase this value because passwords are case-sensitive.
      const key = password;
      const group = passwordMap.get(key) || [];
      group.push(item);
      passwordMap.set(key, group);
    }

    if (strengthLabel === 'WEAK') {
      weakCount += 1;
      issues.push(
        makeIssue({
          id: `weak-${item.id}`,
          itemId: item.id,
          type: 'WEAK',
          severity: 'danger',
          title,
          subtitle: getSubtitle(password, strengthScore),
          actionRoute: '/vaultdetails',
        })
      );
    } else if (strengthLabel === 'MEDIUM') {
      mediumCount += 1;
      issues.push(
        makeIssue({
          id: `medium-${item.id}`,
          itemId: item.id,
          type: 'MEDIUM',
          severity: 'warning',
          title,
          subtitle: getSubtitle(password, strengthScore),
          actionRoute: '/vaultdetails',
        })
      );
    } else {
      strongCount += 1;
    }

    if (!website) {
      missingInfoCount += 1;
      issues.push(
        makeIssue({
          id: `missing-website-${item.id}`,
          itemId: item.id,
          type: 'MISSING_WEBSITE',
          severity: 'info',
          title,
          subtitle: 'Add the website or app name so autofill and search work better.',
          actionRoute: '/vaultdetails',
        })
      );
    }

    if (!username) {
      missingInfoCount += 1;
      issues.push(
        makeIssue({
          id: `missing-username-${item.id}`,
          itemId: item.id,
          type: 'MISSING_USERNAME',
          severity: 'info',
          title,
          subtitle: 'Add the username or email for this login.',
          actionRoute: '/vaultdetails',
        })
      );
    }

    if (ageDays >= OLD_PASSWORD_DAYS) {
      oldCount += 1;
      issues.push(
        makeIssue({
          id: `old-${item.id}`,
          itemId: item.id,
          type: 'OLD',
          severity: 'warning',
          title,
          subtitle: `This password has not been changed in about ${ageDays} days.`,
          actionRoute: '/vaultdetails',
          premiumOnly: true,
        })
      );
    }
  });

  passwordMap.forEach((group) => {
    if (group.length <= 1) return;

    reusedCount += group.length;

    group.forEach((item) => {
      const title = cleanValue(item.title) || cleanValue(item.website) || 'Untitled password';

      issues.push(
        makeIssue({
          id: `reused-${item.id}`,
          itemId: item.id,
          type: 'REUSED',
          severity: 'danger',
          title,
          subtitle: `This password is reused on ${group.length} saved logins. Use a unique password.`,
          actionRoute: '/vaultdetails',
          premiumOnly: true,
        })
      );
    });
  });

  if (settings && !settings.emailVerified) {
    issues.unshift(
      makeIssue({
        id: 'email-unverified',
        type: 'EMAIL_UNVERIFIED',
        severity: 'warning',
        title: 'Email is not verified',
        subtitle: 'Verify your email to improve account recovery and security.',
        actionRoute: '/userinfo',
        initial: 'E',
      })
    );
  }

  if (settings && !settings.twoFactorEnabled) {
    issues.unshift(
      makeIssue({
        id: 'two-factor-off',
        type: 'TWO_FACTOR_OFF',
        severity: 'warning',
        title: 'Two-factor authentication is off',
        subtitle: 'Turn on 2FA to add another layer of protection to your vault.',
        actionRoute: '/security',
        initial: '2',
      })
    );
  }

  if (backupStatus && backupStatus.totalItemCount > 0 && plan !== 'FREE') {
    issues.push(
      makeIssue({
        id: 'backup-reminder',
        type: 'BACKUP_NEEDED',
        severity: 'info',
        title: 'Create a fresh encrypted backup',
        subtitle: `You currently have ${backupStatus.totalItemCount} vault items. Keep a recent encrypted backup.`,
        actionRoute: '/backup',
        initial: 'B',
      })
    );
  }

  const baseScore = Math.round(totalStrength / validPasswords.length);
  const penalty = Math.min(35, reusedCount * 4 + oldCount * 2 + missingInfoCount * 1);
  const score = Math.max(0, Math.min(100, baseScore - penalty));

  return {
    score,
    totalPasswords: validPasswords.length,
    weakCount,
    mediumCount,
    strongCount,
    reusedCount,
    oldCount,
    missingInfoCount,
    issues,
    freeIssues: issues.filter((issue) => !issue.premiumOnly).slice(0, 5),
    premiumIssues: issues.filter((issue) => issue.premiumOnly),
    isPremiumOrFamily,
    plan,
    emailVerified: settings?.emailVerified,
    twoFactorEnabled: settings?.twoFactorEnabled,
    backupStatus: backupStatus || null,
  };
}


const SECURITY_REPORT_CACHE_PREFIX = 'theguardian.security.report.v3';
const SECURITY_SCORE_INITIAL_SYNC_KEY = 'securityScoreNeedsInitialSync';

let memoryReport: SecurityReport | null = null;
let memoryEmail = '';
let initialSyncDoneForEmail = '';
let inFlight: Promise<SecurityReport> | null = null;

const getActiveEmail = async () => {
  const email = await AsyncStorage.getItem('userEmail');
  return (email || 'anonymous').trim().toLowerCase();
};

const getCacheKey = (email: string) => `${SECURITY_REPORT_CACHE_PREFIX}:${email || 'anonymous'}`;

const readCachedReport = async (email: string) => {
  try {
    const raw = await AsyncStorage.getItem(getCacheKey(email));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.report) return null;

    return parsed.report as SecurityReport;
  } catch {
    return null;
  }
};

const saveCachedReport = async (email: string, report: SecurityReport) => {
  try {
    await AsyncStorage.setItem(
      getCacheKey(email),
      JSON.stringify({
        report,
        savedAt: new Date().toISOString(),
      })
    );
  } catch {
    // Cache failures should never block the app.
  }
};

async function loadReportFromServer(force = false) {
  if (force) {
    inFlight = null;
    api.clearCache?.();
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = Promise.all([
    api.getVaultItems(),
    api.getSubscription().catch(() => ({ plan: 'FREE' as const })),
    api.getSecuritySettings().catch(() => undefined),
    api.getBackupStatus().catch(() => null),
  ])
    .then(([passwords, subscription, settings, backupStatus]) =>
      calculateSecurityReport(
        passwords as VaultPasswordItem[],
        subscription as SubscriptionResponse,
        settings,
        backupStatus as BackupStatusResponse | null
      )
    )
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export const useSecurityScore = () => {
  const [report, setReport] = useState<SecurityReport>(memoryReport || emptyReport);
  const [loading, setLoading] = useState(false);

  const hydrateCachedReport = useCallback(async () => {
    const email = await getActiveEmail();

    if (memoryReport && memoryEmail === email) {
      setReport(memoryReport);
      return memoryReport;
    }

    const cached = await readCachedReport(email);

    if (cached) {
      memoryEmail = email;
      memoryReport = cached;
      setReport(cached);
      return cached;
    }

    setReport(emptyReport);
    return null;
  }, []);

  const refreshFromServer = useCallback(async () => {
    const email = await getActiveEmail();

    try {
      setLoading(true);

      const calculated = await loadReportFromServer(true);

      memoryEmail = email;
      memoryReport = calculated;
      initialSyncDoneForEmail = email;

      await saveCachedReport(email, calculated);
      await AsyncStorage.removeItem(SECURITY_SCORE_INITIAL_SYNC_KEY);

      setReport(calculated);
      return calculated;
    } catch (error) {
      console.log('SECURITY SCORE ERROR:', error);

      const cached = await readCachedReport(email);
      if (cached) {
        memoryEmail = email;
        memoryReport = cached;
        setReport(cached);
        return cached;
      }

      setReport(emptyReport);
      return emptyReport;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSecurityScore = useCallback(async () => {
    const email = await getActiveEmail();
    const needsInitialSync = await AsyncStorage.getItem(SECURITY_SCORE_INITIAL_SYNC_KEY);

    if (needsInitialSync === 'true' || initialSyncDoneForEmail !== email) {
      await refreshFromServer();
      return;
    }

    const cached = await hydrateCachedReport();

    if (!cached) {
      await refreshFromServer();
    }
  }, [hydrateCachedReport, refreshFromServer]);

  useFocusEffect(
    useCallback(() => {
      loadSecurityScore();
    }, [loadSecurityScore])
  );

  useEffect(() => {
    hydrateCachedReport();
  }, [hydrateCachedReport]);

  return {
    report,
    loading,
    reload: refreshFromServer,
  };
};
