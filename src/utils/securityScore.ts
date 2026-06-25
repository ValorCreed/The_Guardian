import { VaultItem } from '../services/api';
import { decryptPassword } from './vaultcrypto';

export type SecurityIssue = {
  id: string;
  title: string;
  subtitle: string;
  type: 'WEAK' | 'MEDIUM';
  severity: 'danger' | 'warning';
  initial: string;
};

export type SecurityReport = {
  score: number;
  totalPasswords: number;
  weakCount: number;
  mediumCount: number;
  strongCount: number;
  issues: SecurityIssue[];
};

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value));
};

const getItemName = (item: VaultItem) => {
  return item.title || item.website || 'Saved password';
};

const getInitial = (name: string) => {
  return (name.trim()[0] || '?').toUpperCase();
};

const getPasswordStrength = (password: string): 'weak' | 'medium' | 'strong' => {
  const value = password || '';
  let points = 0;

  if (value.length >= 8) points += 1;
  if (value.length >= 12) points += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) points += 1;
  if (/\d/.test(value)) points += 1;
  if (/[^A-Za-z0-9]/.test(value)) points += 1;

  const obviousWeak = [
    'password',
    '123456',
    '12345678',
    'qwerty',
    'admin',
    'letmein',
    'welcome',
  ];

  if (obviousWeak.some((weak) => value.toLowerCase().includes(weak))) {
    return 'weak';
  }

  if (points <= 2) return 'weak';
  if (points <= 4) return 'medium';
  return 'strong';
};

export const calculateSecurityReport = (items: VaultItem[]): SecurityReport => {
  const passwords = items.filter((item) => item.itemType === 'PASSWORD');

  let weakCount = 0;
  let mediumCount = 0;
  let strongCount = 0;
  const issues: SecurityIssue[] = [];

  passwords.forEach((item) => {
    const name = getItemName(item);
    const decryptedPassword = item.encryptedPassword
      ? decryptPassword(item.encryptedPassword)
      : '';

    if (!decryptedPassword) return;

    const strength = getPasswordStrength(decryptedPassword);

    if (strength === 'weak') {
      weakCount += 1;
      issues.push({
        id: `weak-${item.id}`,
        title: name,
        subtitle: 'Password strength is weak. Use 12+ characters with uppercase, lowercase, numbers, and symbols.',
        type: 'WEAK',
        severity: 'danger',
        initial: getInitial(name),
      });
    } else if (strength === 'medium') {
      mediumCount += 1;
      issues.push({
        id: `medium-${item.id}`,
        title: name,
        subtitle: 'Password strength is moderate. Make it longer or add more character types.',
        type: 'MEDIUM',
        severity: 'warning',
        initial: getInitial(name),
      });
    } else {
      strongCount += 1;
    }
  });

  const totalPasswords = passwords.length;

  let score = 0;

  if (totalPasswords > 0) {
    const strengthPoints = strongCount * 100 + mediumCount * 65 + weakCount * 25;
    score = Math.round(strengthPoints / totalPasswords);
  }

  return {
    score: clamp(score, 0, 100),
    totalPasswords,
    weakCount,
    mediumCount,
    strongCount,
    issues,
  };
};
