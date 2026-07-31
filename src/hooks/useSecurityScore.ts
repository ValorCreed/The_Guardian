import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';

import {
  api,
  BackupStatusResponse,
  FamilyMemberPasswordRisk,
  RecoveryKitStatusResponse,
  SharedPasswordItem,
  SubscriptionResponse,
} from '../services/api';
import { decryptPassword } from '../utils/vaultcrypto';
import { checkPwnedPassword } from '../utils/pwnedPasswords';

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
  ownerName?: string;
  ownerEmail?: string;
  shared?: boolean;
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
  | 'BACKUP_NEEDED'
  | 'RECOVERY_KIT_MISSING'
  | 'BREACHED_PASSWORD'
  | 'SHARED_WEAK'
  | 'SHARED_MEDIUM'
  | 'SHARED_REUSED'
  | 'SHARED_OLD'
  | 'SHARED_BREACHED_PASSWORD'
  | 'FAMILY_MEMBER_WEAK'
  | 'FAMILY_MEMBER_MEDIUM'
  | 'FAMILY_MEMBER_REUSED'
  | 'FAMILY_MEMBER_OLD';

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
  breachCount?: number;
  source?: 'OWN' | 'SHARED_FAMILY' | 'ACCOUNT';
  ownerName?: string;
  ownerEmail?: string;
};

export type SecurityReport = {
  score: number;
  totalPasswords: number;
  totalSharedPasswords: number;
  totalFamilyMemberPasswords: number;
  weakCount: number;
  mediumCount: number;
  strongCount: number;
  reusedCount: number;
  oldCount: number;
  missingInfoCount: number;
  breachedCount: number;
  breachCheckFailed: number;
  recoveryKitCreated?: boolean;
  lastBreachScanAt?: string;
  issues: SecurityIssue[];
  freeIssues: SecurityIssue[];
  premiumIssues: SecurityIssue[];
  isPremiumOrFamily: boolean;
  plan: 'FREE' | 'PREMIUM' | 'FAMILY' | string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  backupStatus?: BackupStatusResponse | null;
  recoveryKitStatus?: RecoveryKitStatusResponse | null;
};

const emptyReport: SecurityReport = {
  score: 0,
  totalPasswords: 0,
  totalSharedPasswords: 0,
  totalFamilyMemberPasswords: 0,
  weakCount: 0,
  mediumCount: 0,
  strongCount: 0,
  reusedCount: 0,
  oldCount: 0,
  missingInfoCount: 0,
  breachedCount: 0,
  breachCheckFailed: 0,
  recoveryKitCreated: false,
  issues: [],
  freeIssues: [],
  premiumIssues: [],
  isPremiumOrFamily: false,
  plan: 'FREE',
  backupStatus: null,
  recoveryKitStatus: null,
};

const OLD_PASSWORD_DAYS = 180;
const SHARED_PASSWORD_DETAIL_LIMIT = 25;

const cleanValue = (value?: string | null) => {
  if (!value) return '';

  let cleaned = String(value).trim();

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
    // Not JSON. Keep current cleaned text.
  }

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
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
  if (/^(123|234|345|456|567|678|789|890)/.test(password)) score -= 10;

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

function addAccountIssues(
  issues: SecurityIssue[],
  settings?: { emailVerified: boolean; twoFactorEnabled: boolean },
  recoveryKitStatus?: RecoveryKitStatusResponse | null,
  backupStatus?: BackupStatusResponse | null,
  plan: string = 'FREE'
) {
  if (settings && !settings.emailVerified) {
    issues.unshift(
      makeIssue({
        id: 'email-unverified',
        type: 'EMAIL_UNVERIFIED',
        severity: 'warning',
        title: 'Email is not verified',
        subtitle: 'Verify your email to improve account recovery and prevent lockouts.',
        actionRoute: '/userinfo',
        source: 'ACCOUNT',
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
        subtitle: 'Turn on 2FA so stolen passwords alone cannot unlock your vault.',
        actionRoute: '/twofasetup',
        source: 'ACCOUNT',
        initial: '2',
      })
    );
  }

  if (recoveryKitStatus && !recoveryKitStatus.created) {
    issues.unshift(
      makeIssue({
        id: 'recovery-kit-missing',
        type: 'RECOVERY_KIT_MISSING',
        severity: 'danger',
        title: 'Recovery kit has not been generated',
        subtitle: 'If you forget your password or lose access, you may permanently lose your vault. Generate your recovery kit now.',
        actionRoute: '/recoverykit',
        source: 'ACCOUNT',
        initial: 'R',
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
        source: 'ACCOUNT',
        initial: 'B',
      })
    );
  }
}

async function loadSharedPasswordsForSecurity(
  subscription?: SubscriptionResponse
): Promise<VaultPasswordItem[]> {
  const plan = subscription?.plan || 'FREE';
  const isPremiumOrFamily = plan === 'PREMIUM' || plan === 'FAMILY';

  if (!isPremiumOrFamily) return [];

  try {
    const summaries = await api.getSharedPasswordItems?.();
    const limitedSummaries = (summaries || []).slice(0, SHARED_PASSWORD_DETAIL_LIMIT);

    const details = await Promise.allSettled(
      limitedSummaries.map((item: SharedPasswordItem) => api.getSharedPasswordItem(item.id))
    );

    return details
      .filter((result): result is PromiseFulfilledResult<SharedPasswordItem> => result.status === 'fulfilled')
      .map((result) => ({
        ...result.value,
        shared: true,
        ownerName: result.value.ownerName,
        ownerEmail: result.value.ownerEmail,
      }));
  } catch {
    return [];
  }
}


async function loadFamilyMemberPasswordRisksForSecurity(
  subscription?: SubscriptionResponse
): Promise<FamilyMemberPasswordRisk[]> {
  if (subscription?.plan !== 'FAMILY') return [];

  try {
    return (await api.getFamilyMemberPasswordRisks?.()) || [];
  } catch (error: any) {
    const status = error?.status;
    if (status !== 401) {
      console.log('FAMILY MEMBER PASSWORD RISK SCAN FAILED:', error?.message || error);
    }
    return [];
  }
}

function addFamilyMemberPasswordRiskIssues(
  issues: SecurityIssue[],
  risks: FamilyMemberPasswordRisk[]
) {
  let weak = 0;
  let medium = 0;
  let reused = 0;
  let old = 0;
  let strengthTotal = 0;

  (risks || []).forEach((risk) => {
    const memberName = cleanValue(risk.memberName) || cleanValue(risk.memberEmail) || 'Family member';
    const itemTitle = cleanValue(risk.title) || cleanValue(risk.website) || 'Saved password';
    const riskTypes = Array.isArray(risk.riskTypes) ? risk.riskTypes : [];
    const strengthScore = Number(risk.strengthScore || 0);
    const strengthLabel = String(risk.strengthLabel || '').toUpperCase();

    strengthTotal += strengthScore;

    if (strengthLabel === 'WEAK' || riskTypes.includes('WEAK')) {
      weak += 1;
      issues.push(
        makeIssue({
          id: `family-member-weak-${risk.memberId}-${risk.id}`,
          itemId: risk.id,
          type: 'FAMILY_MEMBER_WEAK',
          severity: 'danger',
          title: `${memberName} has a weak password`,
          subtitle: `${itemTitle} is weak. Ask this family member to update it with a stronger, unique password.`,
          actionRoute: '/family',
          premiumOnly: true,
          source: 'SHARED_FAMILY',
          ownerName: memberName,
          ownerEmail: risk.memberEmail,
          initial: memberName.slice(0, 1).toUpperCase() || 'F',
        })
      );
    } else if (strengthLabel === 'MEDIUM' || riskTypes.includes('MEDIUM')) {
      medium += 1;
      issues.push(
        makeIssue({
          id: `family-member-medium-${risk.memberId}-${risk.id}`,
          itemId: risk.id,
          type: 'FAMILY_MEMBER_MEDIUM',
          severity: 'warning',
          title: `${memberName} has a password that needs strengthening`,
          subtitle: `${itemTitle} is only medium strength. Recommend a longer password with numbers and symbols.`,
          actionRoute: '/family',
          premiumOnly: true,
          source: 'SHARED_FAMILY',
          ownerName: memberName,
          ownerEmail: risk.memberEmail,
          initial: memberName.slice(0, 1).toUpperCase() || 'F',
        })
      );
    }

    if (risk.reusedPassword || riskTypes.includes('REUSED')) {
      reused += 1;
      issues.push(
        makeIssue({
          id: `family-member-reused-${risk.memberId}-${risk.id}`,
          itemId: risk.id,
          type: 'FAMILY_MEMBER_REUSED',
          severity: 'danger',
          title: `${memberName} has a reused password`,
          subtitle: `${itemTitle} appears reused across ${risk.reusedCount || 2} family-member login items.`,
          actionRoute: '/family',
          premiumOnly: true,
          source: 'SHARED_FAMILY',
          ownerName: memberName,
          ownerEmail: risk.memberEmail,
          initial: memberName.slice(0, 1).toUpperCase() || 'F',
        })
      );
    }

    if (risk.oldPassword || riskTypes.includes('OLD')) {
      old += 1;
      issues.push(
        makeIssue({
          id: `family-member-old-${risk.memberId}-${risk.id}`,
          itemId: risk.id,
          type: 'FAMILY_MEMBER_OLD',
          severity: 'warning',
          title: `${memberName} has an old password`,
          subtitle: `${itemTitle} has not been updated for a long time. Recommend changing it.`,
          actionRoute: '/family',
          premiumOnly: true,
          source: 'SHARED_FAMILY',
          ownerName: memberName,
          ownerEmail: risk.memberEmail,
          initial: memberName.slice(0, 1).toUpperCase() || 'F',
        })
      );
    }
  });

  return {
    weak,
    medium,
    reused,
    old,
    strengthTotal,
    count: (risks || []).length,
  };
}

async function calculateSecurityReport(
  passwords: VaultPasswordItem[],
  subscription?: SubscriptionResponse,
  settings?: { emailVerified: boolean; twoFactorEnabled: boolean },
  backupStatus?: BackupStatusResponse | null,
  recoveryKitStatus?: RecoveryKitStatusResponse | null,
  sharedPasswords: VaultPasswordItem[] = [],
  familyMemberPasswordRisks: FamilyMemberPasswordRisk[] = []
): Promise<SecurityReport> {
  const ownPasswords = passwords.filter((item) => item && item.id !== undefined && item.id !== null);
  const familyPasswords = sharedPasswords.filter((item) => item && item.id !== undefined && item.id !== null);
  const allPasswordItems = [...ownPasswords, ...familyPasswords];
  const plan = subscription?.plan || 'FREE';
  const isPremiumOrFamily = plan === 'PREMIUM' || plan === 'FAMILY';

  let weakCount = 0;
  let mediumCount = 0;
  let strongCount = 0;
  let reusedCount = 0;
  let oldCount = 0;
  let missingInfoCount = 0;
  let breachedCount = 0;
  let breachCheckFailed = 0;
  let totalStrength = 0;

  const issues: SecurityIssue[] = [];
  const passwordMap = new Map<string, VaultPasswordItem[]>();

  for (const item of allPasswordItems) {
    const password = getPasswordValue(item);
    const isShared = Boolean(item.shared);
    const title = cleanValue(item.title) || cleanValue(item.website) || (isShared ? 'Shared password' : 'Untitled password');
    const username = cleanValue(item.usernameValue);
    const website = cleanValue(item.website);
    const strengthScore = password ? getStrengthScore(password) : 0;
    const strengthLabel = getStrengthLabel(strengthScore);
    const changedAt = item.updatedAt || item.createdAt;
    const ageDays = daysBetweenNowAnd(changedAt);
    const issuePrefix = isShared ? 'shared-' : '';
    const sharedSubtitlePrefix = isShared
      ? `Shared by ${cleanValue(item.ownerName) || cleanValue(item.ownerEmail) || 'a family member'}. `
      : '';

    totalStrength += strengthScore;

    if (password) {
      const key = password;
      const group = passwordMap.get(key) || [];
      group.push(item);
      passwordMap.set(key, group);
    }

    if (strengthLabel === 'WEAK') {
      weakCount += 1;
      issues.push(
        makeIssue({
          id: `${issuePrefix}weak-${item.id}`,
          itemId: item.id,
          type: isShared ? 'SHARED_WEAK' : 'WEAK',
          severity: 'danger',
          title: isShared ? `Shared password is weak: ${title}` : title,
          subtitle: `${sharedSubtitlePrefix}${getSubtitle(password, strengthScore)}`,
          actionRoute: isShared ? '/sharedvaultdetails' : '/vaultdetails',
          premiumOnly: isShared,
          source: isShared ? 'SHARED_FAMILY' : 'OWN',
          ownerName: item.ownerName,
          ownerEmail: item.ownerEmail,
        })
      );
    } else if (strengthLabel === 'MEDIUM') {
      mediumCount += 1;
      issues.push(
        makeIssue({
          id: `${issuePrefix}medium-${item.id}`,
          itemId: item.id,
          type: isShared ? 'SHARED_MEDIUM' : 'MEDIUM',
          severity: 'warning',
          title: isShared ? `Shared password needs strengthening: ${title}` : title,
          subtitle: `${sharedSubtitlePrefix}${getSubtitle(password, strengthScore)}`,
          actionRoute: isShared ? '/sharedvaultdetails' : '/vaultdetails',
          premiumOnly: isShared,
          source: isShared ? 'SHARED_FAMILY' : 'OWN',
          ownerName: item.ownerName,
          ownerEmail: item.ownerEmail,
        })
      );
    } else {
      strongCount += 1;
    }

    if (!isShared && !website) {
      missingInfoCount += 1;
      issues.push(
        makeIssue({
          id: `missing-website-${item.id}`,
          itemId: item.id,
          type: 'MISSING_WEBSITE',
          severity: 'info',
          title,
          subtitle: 'Add the website or app name so search and future autofill work better.',
          actionRoute: '/vaultdetails',
          source: 'OWN',
        })
      );
    }

    if (!isShared && !username) {
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
          source: 'OWN',
        })
      );
    }

    if (ageDays >= OLD_PASSWORD_DAYS) {
      oldCount += 1;
      issues.push(
        makeIssue({
          id: `${issuePrefix}old-${item.id}`,
          itemId: item.id,
          type: isShared ? 'SHARED_OLD' : 'OLD',
          severity: 'warning',
          title: isShared ? `Shared password may be old: ${title}` : title,
          subtitle: `${sharedSubtitlePrefix}This password has not been changed in about ${ageDays} days.`,
          actionRoute: isShared ? '/sharedvaultdetails' : '/vaultdetails',
          premiumOnly: true,
          source: isShared ? 'SHARED_FAMILY' : 'OWN',
          ownerName: item.ownerName,
          ownerEmail: item.ownerEmail,
        })
      );
    }

    if (isPremiumOrFamily && password) {
      try {
        const breachResult = await checkPwnedPassword(password);

        if (breachResult.breached && breachResult.count > 0) {
          breachedCount += 1;
          issues.push(
            makeIssue({
              id: `${issuePrefix}breached-${item.id}`,
              itemId: item.id,
              type: isShared ? 'SHARED_BREACHED_PASSWORD' : 'BREACHED_PASSWORD',
              severity: 'danger',
              title: isShared ? `Shared password appears breached: ${title}` : title,
              subtitle: `${sharedSubtitlePrefix}This password appears in public breach data ${breachResult.count.toLocaleString()} time${breachResult.count === 1 ? '' : 's'}. Change it immediately.`,
              actionRoute: isShared ? '/sharedvaultdetails' : '/vaultdetails',
              premiumOnly: true,
              breachCount: breachResult.count,
              source: isShared ? 'SHARED_FAMILY' : 'OWN',
              ownerName: item.ownerName,
              ownerEmail: item.ownerEmail,
            })
          );
        }
      } catch {
        breachCheckFailed += 1;
      }
    }
  }

  passwordMap.forEach((group) => {
    if (group.length <= 1) return;

    reusedCount += group.length;

    group.forEach((item) => {
      const isShared = Boolean(item.shared);
      const title = cleanValue(item.title) || cleanValue(item.website) || (isShared ? 'Shared password' : 'Untitled password');
      const sharedSubtitlePrefix = isShared
        ? `Shared by ${cleanValue(item.ownerName) || cleanValue(item.ownerEmail) || 'a family member'}. `
        : '';

      issues.push(
        makeIssue({
          id: `${isShared ? 'shared-' : ''}reused-${item.id}`,
          itemId: item.id,
          type: isShared ? 'SHARED_REUSED' : 'REUSED',
          severity: 'danger',
          title: isShared ? `Shared password is reused: ${title}` : title,
          subtitle: `${sharedSubtitlePrefix}This password is reused on ${group.length} saved/shared login${group.length === 1 ? '' : 's'}. Use a unique password.`,
          actionRoute: isShared ? '/sharedvaultdetails' : '/vaultdetails',
          premiumOnly: true,
          source: isShared ? 'SHARED_FAMILY' : 'OWN',
          ownerName: item.ownerName,
          ownerEmail: item.ownerEmail,
        })
      );
    });
  });

  const familyMemberRiskCounts = addFamilyMemberPasswordRiskIssues(issues, familyMemberPasswordRisks);
  weakCount += familyMemberRiskCounts.weak;
  mediumCount += familyMemberRiskCounts.medium;
  reusedCount += familyMemberRiskCounts.reused;
  oldCount += familyMemberRiskCounts.old;

  addAccountIssues(issues, settings, recoveryKitStatus, backupStatus, plan);

  const accountPenalty =
    (settings && !settings.emailVerified ? 8 : 0) +
    (settings && !settings.twoFactorEnabled ? 10 : 0) +
    (recoveryKitStatus && !recoveryKitStatus.created ? 18 : 0) +
    (backupStatus && backupStatus.totalItemCount > 0 && plan !== 'FREE' ? 4 : 0);

  const vaultPenalty =
    breachedCount * 18 +
    weakCount * 10 +
    reusedCount * 7 +
    mediumCount * 3 +
    oldCount * 3 +
    missingInfoCount * 1;

  const scoredPasswordCount = allPasswordItems.length + familyMemberRiskCounts.count;
  const scoredStrengthTotal = totalStrength + familyMemberRiskCounts.strengthTotal;

  const basePasswordScore = scoredPasswordCount > 0
    ? Math.round(scoredStrengthTotal / scoredPasswordCount)
    : 86;

  const noVaultPenalty = scoredPasswordCount === 0 ? 8 : 0;
  const penalty = Math.min(90, accountPenalty + vaultPenalty + noVaultPenalty);
  const score = Math.max(0, Math.min(100, basePasswordScore - penalty));

  const sortedIssues = issues.sort((a, b) => {
    const severityRank = { danger: 0, warning: 1, info: 2 } as const;
    return severityRank[a.severity] - severityRank[b.severity];
  });

  return {
    score,
    totalPasswords: ownPasswords.length,
    totalSharedPasswords: familyPasswords.length,
    totalFamilyMemberPasswords: familyMemberRiskCounts.count,
    weakCount,
    mediumCount,
    strongCount,
    reusedCount,
    oldCount,
    missingInfoCount,
    breachedCount,
    breachCheckFailed,
    recoveryKitCreated: Boolean(recoveryKitStatus?.created),
    lastBreachScanAt: isPremiumOrFamily ? new Date().toISOString() : undefined,
    issues: sortedIssues,
    freeIssues: sortedIssues.filter((issue) => !issue.premiumOnly).slice(0, 6),
    premiumIssues: sortedIssues.filter((issue) => issue.premiumOnly),
    isPremiumOrFamily,
    plan,
    emailVerified: settings?.emailVerified,
    twoFactorEnabled: settings?.twoFactorEnabled,
    backupStatus: backupStatus || null,
    recoveryKitStatus: recoveryKitStatus || null,
  };
}

const SECURITY_REPORT_CACHE_PREFIX = 'theguardian.security.report.v4';
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

  inFlight = (async () => {
    const [passwords, subscription, settings, backupStatus, recoveryKitStatus] = await Promise.all([
      api.getVaultItems(),
      api.getSubscription().catch(() => ({ plan: 'FREE' as const })),
      api.getSecuritySettings().catch(() => undefined),
      api.getBackupStatus().catch(() => null),
      api.getRecoveryKitStatus().catch(() => ({ created: false })),
    ]);

    const sharedPasswords = await loadSharedPasswordsForSecurity(subscription as SubscriptionResponse);
    const familyMemberPasswordRisks = await loadFamilyMemberPasswordRisksForSecurity(subscription as SubscriptionResponse);

    return calculateSecurityReport(
      passwords as VaultPasswordItem[],
      subscription as SubscriptionResponse,
      settings,
      backupStatus as BackupStatusResponse | null,
      recoveryKitStatus as RecoveryKitStatusResponse | null,
      sharedPasswords,
      familyMemberPasswordRisks
    );
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

const SECURITY_ALERT_CACHE_PREFIX = 'theguardian.security.alert.v2';
const SECURITY_ALERT_MIN_INTERVAL_MS = 1000 * 60 * 60 * 12;

async function maybeReportSecurityAlert(email: string, report: SecurityReport) {
  if (!report.isPremiumOrFamily) return;

  const riskyCount = report.breachedCount + report.weakCount + report.reusedCount;

  if (riskyCount <= 0) return;

  const cacheKey = `${SECURITY_ALERT_CACHE_PREFIX}:${email || 'anonymous'}`;
  const signature = [
    report.score,
    report.breachedCount,
    report.weakCount,
    report.reusedCount,
    report.oldCount,
  ].join('|');

  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    const previous = raw ? JSON.parse(raw) : null;
    const previousTime = previous?.sentAt ? new Date(previous.sentAt).getTime() : 0;
    const ageMs = Date.now() - previousTime;

    if (previous?.signature === signature && ageMs < SECURITY_ALERT_MIN_INTERVAL_MS) {
      return;
    }

    await api.reportSecurityScanAlert?.({
      score: report.score,
      totalIssues: report.issues.length,
      breachedCount: report.breachedCount,
      weakCount: report.weakCount,
      reusedCount: report.reusedCount,
      oldCount: report.oldCount,
    });

    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({
        signature,
        sentAt: new Date().toISOString(),
      })
    );
  } catch {
    // Security alert notifications should never block the score screen.
  }
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
      await maybeReportSecurityAlert(email, calculated);
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
