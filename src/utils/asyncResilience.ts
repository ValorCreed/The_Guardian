export type AppErrorCode =
  | 'NETWORK_UNREACHABLE'
  | 'REQUEST_TIMEOUT'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'REQUEST_CANCELLED'
  | 'STORAGE_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN_ERROR';

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  signal?: AbortSignal | null;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
};

const DEFAULT_MESSAGE = 'Something went wrong. Please try again.';
const MAX_USER_MESSAGE_LENGTH = 180;
const TECHNICAL_MESSAGE_PATTERN =
  /(stack\s*trace|exception|org\.springframework|java\.|kotlin\.|at\s+[\w$.]+\(|sqlstate|select\s+.+\s+from|insert\s+into|update\s+.+\s+set|delete\s+from)/i;
const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const SENSITIVE_ERROR_KEYS = new Set([
  'stack',
  'trace',
  'exception',
  'debug',
  'cause',
  'suppressed',
  'sql',
  'query',
]);

export class AppOperationError extends Error {
  readonly code: AppErrorCode;
  readonly status?: number;
  readonly transient: boolean;

  constructor(
    message: string,
    options: {
      code?: AppErrorCode;
      status?: number;
      transient?: boolean;
    } = {}
  ) {
    super(toUserMessage(message));
    this.name = 'AppOperationError';
    this.code = options.code || 'UNKNOWN_ERROR';
    this.status = options.status;
    this.transient = Boolean(options.transient);
  }
}

export function toUserMessage(
  value: unknown,
  fallback = DEFAULT_MESSAGE
): string {
  const raw = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!raw || TECHNICAL_MESSAGE_PATTERN.test(raw)) {
    return fallback;
  }

  if (raw.length <= MAX_USER_MESSAGE_LENGTH) {
    return raw;
  }

  const shortened = raw.slice(0, MAX_USER_MESSAGE_LENGTH - 1).trimEnd();
  return `${shortened}…`;
}

export function sanitizeErrorPayload(
  value: unknown,
  depth = 0
): unknown {
  if (depth > 4) return undefined;
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return toUserMessage(value, 'Request failed.');
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => sanitizeErrorPayload(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};

    Object.entries(value as Record<string, unknown>)
      .slice(0, 80)
      .forEach(([key, item]) => {
        if (SENSITIVE_ERROR_KEYS.has(key.toLowerCase())) return;
        const sanitized = sanitizeErrorPayload(item, depth + 1);
        if (sanitized !== undefined) output[key] = sanitized;
      });

    return output;
  }

  return undefined;
}

export function getErrorStatus(error: unknown): number | undefined {
  const status = Number(
    (error as any)?.status ??
      (error as any)?.statusCode ??
      (error as any)?.response?.status
  );

  return Number.isFinite(status) && status > 0 ? status : undefined;
}

export function isAbortLikeError(error: unknown) {
  const name = String((error as any)?.name || '').toLowerCase();
  const code = String((error as any)?.code || '').toLowerCase();
  const message = String((error as any)?.message || '').toLowerCase();

  return (
    name === 'aborterror' ||
    name === 'cancelederror' ||
    name === 'cancellederror' ||
    name === 'screenrequestcancellederror' ||
    code === 'request_cancelled' ||
    message.includes('request was cancelled') ||
    message.includes('request was canceled')
  );
}

export function isTransientError(error: unknown) {
  if (isAbortLikeError(error)) return false;

  const status = getErrorStatus(error);
  if (status && TRANSIENT_STATUS_CODES.has(status)) return true;

  const code = String((error as any)?.code || '').toUpperCase();
  const message = String((error as any)?.message || '').toLowerCase();

  return (
    code === 'NETWORK_UNREACHABLE' ||
    code === 'TRANSIENT_NETWORK_FAILURE' ||
    code === 'REQUEST_TIMEOUT' ||
    code === 'RATE_LIMITED' ||
    code === 'SERVICE_UNAVAILABLE' ||
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('temporarily unavailable') ||
    message.includes('bad gateway') ||
    message.includes('service unavailable')
  );
}

export function getExponentialBackoffDelay(
  retryNumber: number,
  options: {
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitterRatio?: number;
  } = {}
) {
  const baseDelayMs = Math.max(100, options.baseDelayMs ?? 700);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 6000);
  const jitterRatio = Math.max(0, Math.min(options.jitterRatio ?? 0.2, 0.5));
  const exponential = Math.min(
    maxDelayMs,
    baseDelayMs * 2 ** Math.max(0, retryNumber - 1)
  );
  const jitter = exponential * jitterRatio * (Math.random() * 2 - 1);

  return Math.max(100, Math.round(exponential + jitter));
}

export function waitForRetry(
  delayMs: number,
  signal?: AbortSignal | null
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        new AppOperationError('The request was cancelled.', {
          code: 'REQUEST_CANCELLED',
        })
      );
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', cancel);
      resolve();
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(
        new AppOperationError('The request was cancelled.', {
          code: 'REQUEST_CANCELLED',
        })
      );
    };
    const timer = setTimeout(finish, Math.max(0, delayMs));
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

export async function retryAsync<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 5));
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new AppOperationError('The request was cancelled.', {
        code: 'REQUEST_CANCELLED',
      });
    }

    try {
      return await operation(attempt);
    } catch (error: unknown) {
      lastError = error;
      const retryAllowed = options.shouldRetry
        ? options.shouldRetry(error, attempt)
        : isTransientError(error);

      if (!retryAllowed || attempt >= maxAttempts) {
        throw error;
      }

      const delayMs = getExponentialBackoffDelay(attempt, options);
      options.onRetry?.(error, attempt, delayMs);
      await waitForRetry(delayMs, options.signal);
    }
  }

  throw lastError;
}

export function toAppOperationError(
  error: unknown,
  fallbackMessage = DEFAULT_MESSAGE
): AppOperationError {
  if (error instanceof AppOperationError) return error;

  const status = getErrorStatus(error);
  const transient = isTransientError(error);
  const rawCode = String((error as any)?.code || '').toUpperCase();
  const code: AppErrorCode = isAbortLikeError(error)
    ? 'REQUEST_CANCELLED'
    : status === 429
      ? 'RATE_LIMITED'
      : status && [500, 502, 503, 504].includes(status)
        ? 'SERVICE_UNAVAILABLE'
        : rawCode === 'REQUEST_TIMEOUT'
          ? 'REQUEST_TIMEOUT'
          : transient
            ? 'NETWORK_UNREACHABLE'
            : 'UNKNOWN_ERROR';

  return new AppOperationError(
    toUserMessage((error as any)?.message, fallbackMessage),
    { code, status, transient }
  );
}

export function safeErrorSummary(error: unknown) {
  const typed = toAppOperationError(error);
  return {
    name: typed.name,
    code: typed.code,
    status: typed.status,
    transient: typed.transient,
  };
}

export function safeLogError(context: string, error: unknown) {
  if (!__DEV__) return;
  console.warn(`[${context}]`, safeErrorSummary(error));
}
