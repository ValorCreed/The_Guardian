/**
 * Client-side request validation and sanitization.
 *
 * This is defense-in-depth only. The API must repeat validation, use
 * parameterized queries/ORM bindings, enforce authorization, and encode output
 * for its eventual rendering context. Client-side checks can be bypassed by a
 * modified application or a direct HTTP client.
 */

export type ClientValidationIssue = {
  field: string;
  code: string;
  message: string;
};

export class ClientInputValidationError extends Error {
  readonly status = 400;
  readonly code = 'CLIENT_VALIDATION_FAILED';
  readonly path?: string;
  readonly data: {
    error: 'Bad Request';
    message: string;
    fieldErrors: Record<string, string[]>;
    errors: ClientValidationIssue[];
  };

  constructor(path: string | undefined, issues: ClientValidationIssue[]) {
    const safeIssues = issues.length
      ? issues
      : [
          {
            field: 'payload',
            code: 'INVALID_PAYLOAD',
            message: 'The request payload is invalid.',
          },
        ];
    const details = safeIssues
      .slice(0, 6)
      .map((issue) => `${humanizeField(issue.field)}: ${issue.message}`)
      .join('\n');
    const message = `Please correct the following input${safeIssues.length === 1 ? '' : 's'}:\n${details}`;
    const fieldErrors = safeIssues.reduce<Record<string, string[]>>(
      (result, issue) => {
        (result[issue.field] ||= []).push(issue.message);
        return result;
      },
      {}
    );

    super(message);
    this.name = 'ClientInputValidationError';
    this.path = path;
    this.data = {
      error: 'Bad Request',
      message,
      fieldErrors,
      errors: safeIssues,
    };
  }
}

type RuleKind =
  | 'text'
  | 'multilineText'
  | 'email'
  | 'password'
  | 'opaque'
  | 'encrypted'
  | 'backup'
  | 'boolean'
  | 'number'
  | 'integer'
  | 'integerArray'
  | 'enum'
  | 'verificationCode'
  | 'identifier'
  | 'mimeType'
  | 'fileName'
  | 'fileUri';

type FieldRule = {
  kind: RuleKind;
  required?: boolean;
  nullable?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  maxItems?: number;
  values?: readonly string[];
  label?: string;
};

type EndpointSchema = {
  method: string;
  path: RegExp;
  fields: Record<string, FieldRule>;
  requireAtLeastOne?: boolean;
  refine?: (
    value: Record<string, unknown>,
    addIssue: (field: string, code: string, message: string) => void
  ) => void;
};

const MAX_SECRET_LENGTH = 16_384;
const MAX_ENCRYPTED_VALUE_LENGTH = 5 * 1024 * 1024;
const MAX_BACKUP_LENGTH = 50 * 1024 * 1024;
const MAX_DOCUMENT_SIZE = 100 * 1024 * 1024;

const EMAIL_PATTERN =
  /^(?=.{3,254}$)[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const MIME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;
const VERIFICATION_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const INVISIBLE_DIRECTIONAL_CHARACTERS = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
const HTML_TAG_PATTERN = /<[^>]*>/g;

const text = (options: Omit<FieldRule, 'kind'> = {}): FieldRule => ({
  kind: 'text',
  maxLength: 255,
  ...options,
});
const multiline = (options: Omit<FieldRule, 'kind'> = {}): FieldRule => ({
  kind: 'multilineText',
  maxLength: 4000,
  ...options,
});
const email = (required = true): FieldRule => ({
  kind: 'email',
  required,
  maxLength: 254,
});
const password = (
  required = true,
  minLength = 1,
  maxLength = 1024
): FieldRule => ({ kind: 'password', required, minLength, maxLength });
const opaque = (
  required = true,
  maxLength = MAX_SECRET_LENGTH
): FieldRule => ({ kind: 'opaque', required, minLength: required ? 1 : 0, maxLength });
const encrypted = (required = false): FieldRule => ({
  kind: 'encrypted',
  required,
  minLength: required ? 1 : 0,
  maxLength: MAX_ENCRYPTED_VALUE_LENGTH,
});
const bool = (required = true): FieldRule => ({ kind: 'boolean', required });
const integer = (
  required = true,
  min = 0,
  max = Number.MAX_SAFE_INTEGER
): FieldRule => ({ kind: 'integer', required, min, max });
const integerArray = (required = true, maxItems = 500): FieldRule => ({
  kind: 'integerArray',
  required,
  maxItems,
  min: 1,
  max: Number.MAX_SAFE_INTEGER,
});
const enumeration = (
  values: readonly string[],
  required = true
): FieldRule => ({ kind: 'enum', values, required });
const verificationCode = (required = true): FieldRule => ({
  kind: 'verificationCode',
  required,
  minLength: 4,
  maxLength: 128,
});
const identifier = (required = true): FieldRule => ({
  kind: 'identifier',
  required,
  minLength: 1,
  maxLength: 256,
});

const INCIDENT_TYPES = [
  'LOST_OR_STOLEN_DEVICE',
  'MASTER_PASSWORD_EXPOSED',
  'EMAIL_COMPROMISED',
  'PHISHING_ATTACK',
  'UNKNOWN_LOGIN',
  'SIM_SWAP',
  'FAMILY_MISUSE',
  'DURESS_EVENT_ENDED',
  'OTHER',
] as const;
const INCIDENT_TASK_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
] as const;
const PLANS = ['PREMIUM', 'FAMILY'] as const;
const VAULT_ITEM_TYPES = ['PASSWORD', 'CARD', 'DOCUMENT', 'NOTE'] as const;
const ESTATE_ACTION_TYPES = [
  'RELEASE',
  'TRANSFER',
  'CANCEL',
  'DELETE',
  'ARCHIVE',
  'NEVER_RELEASE',
] as const;
const ESTATE_TRIGGER_TYPES = [
  'OWNER_RELEASE',
  'EMERGENCY_APPROVAL',
  'SAFETY_CHECK',
] as const;
const BUG_CATEGORIES = [
  'Vault',
  'Documents',
  'Family',
  'Security',
  'Payment',
  'UI',
  'Other',
] as const;
const BUG_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const;

const vaultItemFields: Record<string, FieldRule> = {
  itemType: enumeration(VAULT_ITEM_TYPES, false),
  title: text({ required: false, minLength: 1, maxLength: 255 }),
  usernameValue: text({ required: false, maxLength: 320 }),
  encryptedPassword: encrypted(false),
  encryptedData: encrypted(false),
  website: text({ required: false, maxLength: 2048 }),
  notes: multiline({ required: false, maxLength: 10_000 }),
  fileName: { kind: 'fileName', required: false, maxLength: 255 },
  mimeType: { kind: 'mimeType', required: false, maxLength: 127 },
  sizeBytes: integer(false, 0, MAX_DOCUMENT_SIZE),
};

const documentFields: Record<string, FieldRule> = {
  documentName: text({ required: false, minLength: 1, maxLength: 255 }),
  documentTitle: text({ required: false, minLength: 1, maxLength: 255 }),
  documentType: { kind: 'mimeType', required: false, maxLength: 127 },
  encryptedFileUrl: encrypted(false),
  encryptedNotes: encrypted(false),
  sizeBytes: integer(false, 0, MAX_DOCUMENT_SIZE),
};

const cardFields: Record<string, FieldRule> = {
  cardName: text({ required: false, minLength: 1, maxLength: 160 }),
  encryptedCardNumber: encrypted(false),
  encryptedExpiryDate: encrypted(false),
  encryptedCvv: encrypted(false),
  encryptedCardholderName: encrypted(false),
  encryptedCardHolderName: encrypted(false),
  encryptedNotes: encrypted(false),
};

const noteFields: Record<string, FieldRule> = {
  title: text({ required: false, minLength: 1, maxLength: 255 }),
  category: text({ required: false, maxLength: 80 }),
  encryptedContent: encrypted(false),
  pinned: bool(false),
};

const familyAccessFields: Record<string, FieldRule> = {
  sharePasswords: bool(true),
  shareCards: bool(true),
  shareDocuments: bool(true),
  shareNotes: bool(true),
  passwordItemIds: integerArray(true),
  cardItemIds: integerArray(true),
  documentItemIds: integerArray(true),
  noteItemIds: integerArray(true),
};

const emergencyContactFields: Record<string, FieldRule> = {
  contactEmail: email(true),
  contactName: text({ required: false, maxLength: 100 }),
  relationship: text({ required: false, maxLength: 80 }),
  waitingPeriodHours: integer(false, 1, 8760),
  allowPasswords: bool(false),
  allowCards: bool(false),
  allowDocuments: bool(false),
  allowNotes: bool(false),
  encryptedEmergencyNote: encrypted(false),
  active: bool(false),
};

const endpointSchemas: EndpointSchema[] = [
  {
    method: 'POST',
    path: /^\/vault\/auth\/register$/,
    fields: {
      fullname: text({ required: true, minLength: 2, maxLength: 100 }),
      email: email(true),
      password: password(true, 8),
    },
  },
  {
    method: 'POST',
    path: /^\/vault\/auth\/(?:verify-registration|verify-2fa|verify-email)$/,
    fields: { email: email(true), code: verificationCode(true) },
  },
  {
    method: 'POST',
    path: /^\/vault\/auth\/(?:resend-registration-code|resend-verification|forgot-password)$/,
    fields: { email: email(true) },
  },
  {
    method: 'POST',
    path: /^\/vault\/auth\/login$/,
    fields: {
      email: email(true),
      password: password(true, 1),
      forceReplaceDevice: bool(false),
    },
  },
  {
    method: 'POST',
    path: /^\/vault\/auth\/biometric\/login$/,
    fields: { email: email(true), credentialToken: opaque(true, 4096) },
  },
  {
    method: 'PUT',
    path: /^\/vault\/auth\/duress$/,
    fields: {
      currentPassword: password(true, 1),
      duressPassword: password(true, 10),
      alertEnabled: bool(true),
      alertContactUserId: { ...integer(false, 1), nullable: true },
      alertDelayMinutes: integer(true, 0, 1440),
    },
    refine: (value, addIssue) => {
      if (value.currentPassword === value.duressPassword) {
        addIssue(
          'duressPassword',
          'PASSWORD_REUSE',
          'The duress password must differ from the normal master password.'
        );
      }
    },
  },
  {
    method: 'DELETE',
    path: /^\/vault\/auth\/duress$/,
    fields: { currentPassword: password(true, 1) },
  },
  {
    method: 'POST',
    path: /^\/vault\/auth\/duress\/preview$/,
    fields: { currentPassword: password(true, 1) },
  },
  {
    method: 'POST',
    path: /^\/vault\/auth\/incidents\/start$/,
    fields: {
      type: enumeration(INCIDENT_TYPES),
      currentPassword: password(true, 1),
      note: { ...multiline({ required: false, maxLength: 1000 }), nullable: true },
    },
  },
  {
    method: 'PATCH',
    path: /^\/vault\/auth\/incidents\/[^/]+\/tasks\/[^/]+$/,
    fields: { status: enumeration(INCIDENT_TASK_STATUSES) },
  },
  {
    method: 'POST',
    path: /^\/vault\/auth\/incidents\/[^/]+\/rotate-password$/,
    fields: {
      currentPassword: password(true, 1),
      newPassword: password(true, 10),
    },
    refine: (value, addIssue) => {
      if (value.currentPassword === value.newPassword) {
        addIssue(
          'newPassword',
          'PASSWORD_REUSE',
          'The new master password must differ from the current password.'
        );
      }
    },
  },
  {
    method: 'POST',
    path: /^\/vault\/auth\/incidents\/[^/]+\/cancel$/,
    fields: { currentPassword: password(true, 1) },
  },
  {
    method: 'POST',
    path: /^\/vault\/auth\/legal-consent$/,
    fields: {
      version: identifier(true),
      privacyAccepted: bool(true),
      termsAccepted: bool(true),
      clientSource: enumeration(['MOBILE_APP', 'WEB_APP'], false),
    },
  },
  {
    method: 'POST',
    path: /^\/vault\/auth\/reset-password$/,
    fields: {
      email: email(true),
      code: verificationCode(true),
      newPassword: password(true, 8),
    },
  },
  {
    method: 'POST',
    path: /^\/vault\/recovery-kit\/generate$/,
    fields: { password: password(true, 1) },
  },
  {
    method: 'POST',
    path: /^\/vault\/recovery-kit\/reset-password$/,
    fields: {
      recoveryId: identifier(true),
      recoveryKey: opaque(true, 4096),
      newPassword: password(true, 8),
    },
  },
  {
    method: 'POST',
    path: /^\/vault\/recovery-kit\/reset-account$/,
    fields: {
      email: email(true),
      resetCode: verificationCode(true),
      newPassword: password(true, 8),
    },
  },
  {
    method: 'PUT',
    path: /^\/vault\/recovery-circle$/,
    fields: {
      enabled: bool(true),
      threshold: integer(true, 2, 5),
      memberUserIds: integerArray(true, 5),
      password: password(true, 1),
    },
    refine: (value, addIssue) => {
      const members = Array.isArray(value.memberUserIds)
        ? value.memberUserIds
        : [];
      const threshold = Number(value.threshold || 0);
      if (value.enabled === true && members.length < 2) {
        addIssue(
          'memberUserIds',
          'TOO_FEW_MEMBERS',
          'Select at least two Recovery Circle members.'
        );
      }
      if (value.enabled === true && threshold > members.length) {
        addIssue(
          'threshold',
          'THRESHOLD_TOO_HIGH',
          'The approval threshold cannot exceed the selected member count.'
        );
      }
    },
  },
  {
    method: 'POST',
    path: /^\/vault\/recovery-circle\/recovery\/start$/,
    fields: { email: email(true), recoveryCode: opaque(true, 512) },
  },
  {
    method: 'POST',
    path: /^\/vault\/recovery-circle\/recovery\/status$/,
    fields: { requestId: identifier(true), recoveryCode: opaque(true, 512) },
  },
  {
    method: 'POST',
    path: /^\/vault\/recovery-circle\/recovery\/complete$/,
    fields: {
      requestId: identifier(true),
      recoveryCode: opaque(true, 512),
      newPassword: password(true, 8),
    },
  },
  {
    method: 'PUT',
    path: /^\/vault\/users\/me\/profile$/,
    fields: { fullName: text({ required: true, minLength: 2, maxLength: 60 }) },
  },
  {
    method: 'PUT',
    path: /^\/vault\/auth\/2fa$/,
    fields: { enabled: bool(true) },
  },
  {
    method: 'POST',
    path: /^\/vault\/backup\/restore$/,
    fields: {
      encryptedBackup: {
        kind: 'backup',
        required: true,
        minLength: 32,
        maxLength: MAX_BACKUP_LENGTH,
      },
      replaceExisting: bool(true),
    },
  },
  {
    method: 'POST',
    path: /^\/vault\/payments\/initialize$/,
    fields: { plan: enumeration(PLANS) },
  },
  {
    method: 'POST',
    path: /^\/vault\/payments\/verify$/,
    fields: { reference: identifier(true) },
  },
  {
    method: 'POST',
    path: /^\/api\/vault$/,
    fields: {
      ...vaultItemFields,
      itemType: enumeration(VAULT_ITEM_TYPES, true),
      title: text({ required: true, minLength: 1, maxLength: 255 }),
    },
  },
  {
    method: 'PUT',
    path: /^\/api\/vault\/[^/]+$/,
    fields: vaultItemFields,
    requireAtLeastOne: true,
  },
  {
    method: 'POST',
    path: /^\/vault\/documents$/,
    fields: {
      ...documentFields,
      documentName: text({ required: true, minLength: 1, maxLength: 255 }),
      encryptedFileUrl: encrypted(true),
    },
  },
  {
    method: 'PUT',
    path: /^\/vault\/documents\/[^/]+$/,
    fields: documentFields,
    requireAtLeastOne: true,
  },
  {
    method: 'POST',
    path: /^\/vault\/cards$/,
    fields: {
      ...cardFields,
      cardName: text({ required: true, minLength: 1, maxLength: 160 }),
      encryptedCardNumber: encrypted(true),
      encryptedExpiryDate: encrypted(true),
      encryptedCvv: encrypted(true),
    },
  },
  {
    method: 'PUT',
    path: /^\/vault\/cards\/[^/]+$/,
    fields: cardFields,
    requireAtLeastOne: true,
  },
  {
    method: 'POST',
    path: /^\/vault\/notes$/,
    fields: {
      ...noteFields,
      title: text({ required: true, minLength: 1, maxLength: 255 }),
      encryptedContent: encrypted(true),
    },
  },
  {
    method: 'PUT',
    path: /^\/vault\/notes\/[^/]+$/,
    fields: noteFields,
    requireAtLeastOne: true,
  },
  {
    method: 'POST',
    path: /^\/vault\/estate-playbooks$/,
    fields: {
      itemType: enumeration(VAULT_ITEM_TYPES),
      itemId: integer(true, 1),
      actionType: enumeration(ESTATE_ACTION_TYPES),
      triggerType: enumeration(ESTATE_TRIGGER_TYPES),
      recipientContactId: { ...integer(false, 1), nullable: true },
      instructions: multiline({ required: false, maxLength: 4000 }),
    },
  },
  {
    method: 'PUT',
    path: /^\/vault\/estate-playbooks\/[^/]+$/,
    fields: {
      itemType: enumeration(VAULT_ITEM_TYPES),
      itemId: integer(true, 1),
      actionType: enumeration(ESTATE_ACTION_TYPES),
      triggerType: enumeration(ESTATE_TRIGGER_TYPES),
      recipientContactId: { ...integer(false, 1), nullable: true },
      instructions: multiline({ required: false, maxLength: 4000 }),
    },
  },
  {
    method: 'PUT',
    path: /^\/vault\/safety-check$/,
    fields: {
      enabled: bool(true),
      contactId: { ...integer(false, 1), nullable: true },
      intervalDays: { ...integer(false, 1, 365), nullable: true },
      gracePeriodHours: { ...integer(false, 1, 168), nullable: true },
    },
  },
  {
    method: 'POST',
    path: /^\/vault\/emergency\/contacts$/,
    fields: emergencyContactFields,
  },
  {
    method: 'PUT',
    path: /^\/vault\/emergency\/contacts\/[^/]+$/,
    fields: emergencyContactFields,
  },
  {
    method: 'POST',
    path: /^\/vault\/emergency\/requests$/,
    fields: {
      ownerEmail: email(true),
      message: multiline({ required: false, maxLength: 1000 }),
    },
  },
  {
    method: 'POST',
    path: /^\/vault\/family\/members$/,
    fields: { email: email(true), ...familyAccessFields },
  },
  {
    method: 'PUT',
    path: /^\/vault\/family\/members\/[^/]+\/access$/,
    fields: familyAccessFields,
  },
  {
    method: 'POST',
    path: /^\/vault\/security-alerts\/scan$/,
    fields: {
      score: integer(true, 0, 100),
      totalIssues: integer(true, 0, 100_000),
      breachedCount: integer(true, 0, 100_000),
      weakCount: integer(true, 0, 100_000),
      reusedCount: integer(true, 0, 100_000),
      oldCount: integer(true, 0, 100_000),
    },
  },
  {
    method: 'PUT',
    path: /^\/vault\/notifications\/push-token$/,
    fields: {
      installationId: identifier(true),
      expoPushToken: opaque(true, 4096),
      platform: enumeration(['android', 'ios']),
      deviceName: text({ required: true, minLength: 1, maxLength: 160 }),
      appVersion: {
        ...text({ required: false, maxLength: 80 }),
        nullable: true,
      },
    },
  },
  {
    method: 'PUT',
    path: /^\/vault\/notifications\/preferences$/,
    fields: {
      pushEnabled: bool(false),
      securityAlerts: bool(false),
      emergencyRecovery: bool(false),
      continuityReminders: bool(false),
      billing: bool(false),
      productUpdates: bool(false),
    },
    requireAtLeastOne: true,
  },
  {
    method: 'POST',
    path: /^\/vault\/support\/bug-reports$/,
    fields: {
      title: text({ required: true, minLength: 1, maxLength: 140 }),
      category: enumeration(BUG_CATEGORIES),
      severity: enumeration(BUG_SEVERITIES),
      description: multiline({ required: true, minLength: 1, maxLength: 4000 }),
      stepsToReproduce: multiline({ required: false, maxLength: 4000 }),
      includeDiagnostics: bool(true),
      deviceInfo: multiline({ required: false, maxLength: 4000 }),
      appVersion: text({ required: false, maxLength: 120 }),
    },
  },
  {
    method: 'DELETE',
    path: /^\/vault\/users\/me$/,
    fields: { password: password(true, 1) },
  },
];

function humanizeField(field: string) {
  if (field === 'payload') return 'Payload';
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function addIssue(
  issues: ClientValidationIssue[],
  field: string,
  code: string,
  message: string
) {
  issues.push({ field, code, message });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeUnicode(value: string) {
  try {
    return value.normalize('NFKC');
  } catch {
    return value;
  }
}

/**
 * Sanitizes text that is metadata or intended for ordinary display.
 * It removes control/directional characters and markup. SQL punctuation is
 * deliberately not stripped because that is lossy and does not replace
 * parameterized database queries.
 */
export function sanitizeDisplayText(value: string, multilineValue = false) {
  let result = normalizeUnicode(value)
    .replace(CONTROL_CHARACTERS, '')
    .replace(INVISIBLE_DIRECTIONAL_CHARACTERS, '')
    .replace(HTML_TAG_PATTERN, '')
    .replace(/[<>]/g, '');

  if (multilineValue) {
    result = result
      .replace(/\r\n?/g, '\n')
      .replace(/[\t ]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n');
  } else {
    result = result.replace(/\s+/g, ' ');
  }

  return result.trim();
}

function validateStringLength(
  value: string,
  field: string,
  rule: FieldRule,
  issues: ClientValidationIssue[]
) {
  if (rule.minLength !== undefined && value.length < rule.minLength) {
    addIssue(
      issues,
      field,
      'TOO_SHORT',
      `Must contain at least ${rule.minLength} character${rule.minLength === 1 ? '' : 's'}.`
    );
  }
  if (rule.maxLength !== undefined && value.length > rule.maxLength) {
    addIssue(
      issues,
      field,
      'TOO_LONG',
      `Must not exceed ${rule.maxLength.toLocaleString()} characters.`
    );
  }
}

function sanitizeField(
  field: string,
  rawValue: unknown,
  rule: FieldRule,
  issues: ClientValidationIssue[]
): unknown {
  if (rawValue === null) {
    if (rule.nullable) return null;
    addIssue(issues, field, 'NULL_NOT_ALLOWED', 'Cannot be null.');
    return undefined;
  }

  switch (rule.kind) {
    case 'text':
    case 'multilineText': {
      if (typeof rawValue !== 'string') {
        addIssue(issues, field, 'INVALID_TYPE', 'Must be text.');
        return undefined;
      }
      const value = sanitizeDisplayText(
        rawValue,
        rule.kind === 'multilineText'
      );
      validateStringLength(value, field, rule, issues);
      return value;
    }

    case 'email': {
      if (typeof rawValue !== 'string') {
        addIssue(issues, field, 'INVALID_TYPE', 'Must be an email address.');
        return undefined;
      }
      const value = normalizeUnicode(rawValue)
        .replace(CONTROL_CHARACTERS, '')
        .replace(INVISIBLE_DIRECTIONAL_CHARACTERS, '')
        .trim()
        .toLowerCase();
      validateStringLength(value, field, rule, issues);
      if (!EMAIL_PATTERN.test(value)) {
        addIssue(
          issues,
          field,
          'INVALID_EMAIL',
          'Enter a complete email address such as name@example.com.'
        );
      }
      return value;
    }

    case 'password':
    case 'opaque':
    case 'encrypted': {
      if (typeof rawValue !== 'string') {
        addIssue(issues, field, 'INVALID_TYPE', 'Must be text.');
        return undefined;
      }
      if (rawValue.includes('\u0000')) {
        addIssue(
          issues,
          field,
          'NULL_BYTE',
          'Contains an unsupported null character.'
        );
      }
      validateStringLength(rawValue, field, rule, issues);
      // Secrets and ciphertext must never be trimmed or rewritten.
      return rawValue;
    }

    case 'backup': {
      if (typeof rawValue !== 'string') {
        addIssue(issues, field, 'INVALID_TYPE', 'Must be backup text.');
        return undefined;
      }
      const value = rawValue.trim();
      validateStringLength(value, field, rule, issues);
      if (!/^[A-Za-z0-9+/=\r\n]+$/.test(value)) {
        addIssue(
          issues,
          field,
          'INVALID_BACKUP',
          'The selected file is not a valid Guardian backup payload.'
        );
      }
      return value;
    }

    case 'boolean':
      if (typeof rawValue !== 'boolean') {
        addIssue(issues, field, 'INVALID_TYPE', 'Must be true or false.');
        return undefined;
      }
      return rawValue;

    case 'number':
    case 'integer': {
      if (
        typeof rawValue !== 'number' ||
        !Number.isFinite(rawValue) ||
        (rule.kind === 'integer' && !Number.isInteger(rawValue))
      ) {
        addIssue(
          issues,
          field,
          'INVALID_NUMBER',
          rule.kind === 'integer'
            ? 'Must be a whole number.'
            : 'Must be a valid number.'
        );
        return undefined;
      }
      if (rule.min !== undefined && rawValue < rule.min) {
        addIssue(issues, field, 'NUMBER_TOO_SMALL', `Must be at least ${rule.min}.`);
      }
      if (rule.max !== undefined && rawValue > rule.max) {
        addIssue(issues, field, 'NUMBER_TOO_LARGE', `Must not exceed ${rule.max}.`);
      }
      return rawValue;
    }

    case 'integerArray': {
      if (!Array.isArray(rawValue)) {
        addIssue(issues, field, 'INVALID_TYPE', 'Must be a list of item IDs.');
        return undefined;
      }
      if (rule.maxItems !== undefined && rawValue.length > rule.maxItems) {
        addIssue(
          issues,
          field,
          'TOO_MANY_ITEMS',
          `Must not contain more than ${rule.maxItems} items.`
        );
      }
      const result: number[] = [];
      const seen = new Set<number>();
      rawValue.forEach((item, index) => {
        if (!Number.isSafeInteger(item)) {
          addIssue(
            issues,
            `${field}[${index}]`,
            'INVALID_ID',
            'Must be a valid whole-number ID.'
          );
          return;
        }
        if (rule.min !== undefined && item < rule.min) {
          addIssue(
            issues,
            `${field}[${index}]`,
            'INVALID_ID',
            `Must be at least ${rule.min}.`
          );
          return;
        }
        if (rule.max !== undefined && item > rule.max) {
          addIssue(
            issues,
            `${field}[${index}]`,
            'INVALID_ID',
            'Exceeds the supported ID range.'
          );
          return;
        }
        if (!seen.has(item)) {
          seen.add(item);
          result.push(item);
        }
      });
      return result;
    }

    case 'enum': {
      if (typeof rawValue !== 'string') {
        addIssue(issues, field, 'INVALID_TYPE', 'Must be a supported value.');
        return undefined;
      }
      if (!rule.values?.includes(rawValue)) {
        addIssue(
          issues,
          field,
          'INVALID_VALUE',
          `Choose one of: ${(rule.values || []).join(', ')}.`
        );
      }
      return rawValue;
    }

    case 'verificationCode':
    case 'identifier': {
      if (typeof rawValue !== 'string') {
        addIssue(issues, field, 'INVALID_TYPE', 'Must be text.');
        return undefined;
      }
      const value = normalizeUnicode(rawValue)
        .replace(CONTROL_CHARACTERS, '')
        .replace(INVISIBLE_DIRECTIONAL_CHARACTERS, '')
        .trim();
      validateStringLength(value, field, rule, issues);
      const valid =
        rule.kind === 'verificationCode'
          ? VERIFICATION_CODE_PATTERN.test(value)
          : IDENTIFIER_PATTERN.test(value);
      if (!valid) {
        addIssue(
          issues,
          field,
          'INVALID_FORMAT',
          'Contains unsupported characters.'
        );
      }
      return value;
    }

    case 'mimeType': {
      if (typeof rawValue !== 'string') {
        addIssue(issues, field, 'INVALID_TYPE', 'Must be a MIME type.');
        return undefined;
      }
      const value = rawValue.trim().toLowerCase();
      validateStringLength(value, field, rule, issues);
      if (!MIME_PATTERN.test(value)) {
        addIssue(
          issues,
          field,
          'INVALID_MIME_TYPE',
          'Use a valid MIME type such as application/pdf or image/png.'
        );
      }
      return value;
    }

    case 'fileName': {
      if (typeof rawValue !== 'string') {
        addIssue(issues, field, 'INVALID_TYPE', 'Must be a file name.');
        return undefined;
      }
      const value = sanitizeDisplayText(rawValue)
        .replace(/[\\/:*?"|]/g, '_')
        .replace(/^\.+/, '')
        .trim();
      validateStringLength(value, field, rule, issues);
      if (!value) {
        addIssue(issues, field, 'EMPTY_FILE_NAME', 'Enter a valid file name.');
      }
      return value;
    }

    case 'fileUri': {
      if (typeof rawValue !== 'string') {
        addIssue(issues, field, 'INVALID_TYPE', 'Must be a local file URI.');
        return undefined;
      }
      const value = rawValue.trim();
      validateStringLength(value, field, rule, issues);
      if (
        !/^(?:file|content|ph|assets-library):\/\//i.test(value) ||
        /[\u0000-\u001F\u007F]/.test(value)
      ) {
        addIssue(
          issues,
          field,
          'INVALID_FILE_URI',
          'Choose a local file from this device.'
        );
      }
      return value;
    }

    default:
      addIssue(issues, field, 'UNSUPPORTED_FIELD', 'Cannot be validated.');
      return undefined;
  }
}

function validateAgainstSchema(
  path: string,
  input: unknown,
  schema: EndpointSchema
) {
  const issues: ClientValidationIssue[] = [];

  if (!isPlainObject(input)) {
    throw new ClientInputValidationError(path, [
      {
        field: 'payload',
        code: 'INVALID_PAYLOAD_TYPE',
        message: 'Must be a JSON object.',
      },
    ]);
  }

  const sanitized: Record<string, unknown> = {};

  Object.entries(schema.fields).forEach(([field, rule]) => {
    const rawValue = input[field];
    if (rawValue === undefined) {
      if (rule.required) {
        addIssue(issues, field, 'REQUIRED', 'This field is required.');
      }
      return;
    }

    const value = sanitizeField(field, rawValue, rule, issues);
    if (value !== undefined) sanitized[field] = value;
  });

  if (schema.requireAtLeastOne && Object.keys(sanitized).length === 0) {
    addIssue(
      issues,
      'payload',
      'EMPTY_UPDATE',
      'Include at least one supported field to update.'
    );
  }

  schema.refine?.(sanitized, (field, code, message) =>
    addIssue(issues, field, code, message)
  );

  if (issues.length) {
    throw new ClientInputValidationError(path, issues);
  }

  return sanitized;
}

function getSchema(pathname: string, method: string) {
  return endpointSchemas.find(
    (schema) => schema.method === method && schema.path.test(pathname)
  );
}

export function validateApiRequestPath(path: string, method: string) {
  const issues: ClientValidationIssue[] = [];
  const requestMethod = String(method || 'GET').toUpperCase();

  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.length > 2048 ||
    /[\u0000-\u001F\u007F\\#]/.test(path)
  ) {
    throw new ClientInputValidationError(path, [
      {
        field: 'requestPath',
        code: 'INVALID_PATH',
        message: 'The request path is invalid.',
      },
    ]);
  }

  let parsed: URL;
  try {
    parsed = new URL(path, 'https://guardian.invalid');
  } catch {
    throw new ClientInputValidationError(path, [
      {
        field: 'requestPath',
        code: 'INVALID_PATH',
        message: 'The request path could not be parsed.',
      },
    ]);
  }

  for (const rawSegment of parsed.pathname.split('/').slice(1)) {
    if (!rawSegment) {
      addIssue(
        issues,
        'requestPath',
        'EMPTY_PATH_SEGMENT',
        'The request path contains an empty segment.'
      );
      continue;
    }
    let segment = '';
    try {
      segment = decodeURIComponent(rawSegment);
    } catch {
      addIssue(
        issues,
        'requestPath',
        'INVALID_PATH_ENCODING',
        'The request path contains invalid encoding.'
      );
      continue;
    }
    if (
      segment === '.' ||
      segment === '..' ||
      /[/?#\\\u0000-\u001F\u007F]/.test(segment) ||
      !/^[A-Za-z0-9._~-]+$/.test(segment)
    ) {
      addIssue(
        issues,
        'requestPath',
        'UNSAFE_PATH_SEGMENT',
        'The request path contains unsupported characters.'
      );
    }
  }

  const queryKeys: string[] = [];
  parsed.searchParams.forEach((_value, key) => queryKeys.push(key));
  if (queryKeys.length) {
    const uniqueKeys = new Set(queryKeys);
    const exactKeys = (...keys: string[]) =>
      uniqueKeys.size === keys.length && keys.every((key) => uniqueKeys.has(key));

    if (
      parsed.pathname === '/vault/auth/legal-consent' &&
      requestMethod === 'GET' &&
      exactKeys('version')
    ) {
      const version = parsed.searchParams.get('version') || '';
      if (!IDENTIFIER_PATTERN.test(version) || version.length > 256) {
        addIssue(
          issues,
          'version',
          'INVALID_VERSION',
          'The legal-consent version is invalid.'
        );
      }
    } else if (
      parsed.pathname === '/vault/api/subscriptions/upgrade' &&
      requestMethod === 'POST' &&
      exactKeys('plan')
    ) {
      if (!PLANS.includes((parsed.searchParams.get('plan') || '') as any)) {
        addIssue(
          issues,
          'plan',
          'INVALID_PLAN',
          'Choose either PREMIUM or FAMILY.'
        );
      }
    } else if (
      parsed.pathname === '/vault/family/members/lookup' &&
      requestMethod === 'GET' &&
      exactKeys('email')
    ) {
      const emailValue = (parsed.searchParams.get('email') || '').toLowerCase();
      if (!EMAIL_PATTERN.test(emailValue)) {
        addIssue(
          issues,
          'email',
          'INVALID_EMAIL',
          'Enter a complete email address such as name@example.com.'
        );
      }
    } else {
      addIssue(
        issues,
        'requestPath',
        'UNEXPECTED_QUERY',
        'The request contains unsupported query parameters.'
      );
    }
  }

  if (issues.length) throw new ClientInputValidationError(path, issues);
}

/**
 * Parses, allowlists, validates, and re-serializes a JSON request body.
 * Unknown keys are intentionally omitted from the returned payload.
 */
export function secureJsonRequestBody(
  path: string,
  method: string,
  body: BodyInit | null | undefined
): BodyInit | null | undefined {
  const requestMethod = String(method || 'GET').toUpperCase();
  validateApiRequestPath(path, requestMethod);

  if (body === undefined || body === null) return body;

  if (typeof body !== 'string') {
    throw new ClientInputValidationError(path, [
      {
        field: 'payload',
        code: 'INVALID_BODY_TYPE',
        message: 'JSON requests must use a serialized object body.',
      },
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new ClientInputValidationError(path, [
      {
        field: 'payload',
        code: 'MALFORMED_JSON',
        message: 'The request body is not valid JSON.',
      },
    ]);
  }

  const pathname = path.split('?')[0];
  const schema = getSchema(pathname, requestMethod);
  if (!schema) {
    throw new ClientInputValidationError(path, [
      {
        field: 'payload',
        code: 'MISSING_VALIDATION_SCHEMA',
        message: 'This request is blocked because no client validation schema is configured for it.',
      },
    ]);
  }

  return JSON.stringify(validateAgainstSchema(path, parsed, schema));
}

export type SecureDocumentUploadMetadata = {
  name: string;
  type: string;
  size?: number;
  documentTitle: string;
};

export type SecureDocumentUploadInput = SecureDocumentUploadMetadata & {
  uri: string;
};

const documentUploadMetadataFields: Record<string, FieldRule> = {
  name: { kind: 'fileName', required: true, minLength: 1, maxLength: 255 },
  type: { kind: 'mimeType', required: true, maxLength: 127 },
  size: integer(false, 0, MAX_DOCUMENT_SIZE),
  documentTitle: text({ required: true, minLength: 1, maxLength: 255 }),
};

export function validateDocumentUploadMetadata(
  input: unknown
): SecureDocumentUploadMetadata {
  const path = '/vault/documents/upload';
  const schema: EndpointSchema = {
    method: 'POST',
    path: /^\/vault\/documents\/upload$/,
    fields: documentUploadMetadataFields,
  };

  return validateAgainstSchema(path, input, schema) as SecureDocumentUploadMetadata;
}

export function validateDocumentUploadInput(
  input: unknown
): SecureDocumentUploadInput {
  const path = '/vault/documents/upload';
  const schema: EndpointSchema = {
    method: 'POST',
    path: /^\/vault\/documents\/upload$/,
    fields: {
      uri: { kind: 'fileUri', required: true, maxLength: 4096 },
      ...documentUploadMetadataFields,
    },
  };

  return validateAgainstSchema(path, input, schema) as SecureDocumentUploadInput;
}