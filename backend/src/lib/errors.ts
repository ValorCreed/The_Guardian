import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly data?: unknown;

  constructor(status: number, message: string, code?: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export const badRequest = (message: string, data?: unknown) => new ApiError(400, message, 'BAD_REQUEST', data);
export const unauthorized = (message = 'Authentication required.') => new ApiError(401, message, 'UNAUTHORIZED');
export const forbidden = (message = 'You do not have permission to do that.') =>
  new ApiError(403, message, 'FORBIDDEN');
export const notFound = (message = 'The requested resource was not found.') => new ApiError(404, message, 'NOT_FOUND');
export const conflict = (message: string, code = 'CONFLICT') => new ApiError(409, message, code);
export const tooManyRequests = (message = 'Too many requests. Please slow down and try again.') =>
  new ApiError(429, message, 'RATE_LIMITED');

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function toZodMessage(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return 'Invalid request payload.';
  return `${first.path.join('.') || 'body'}: ${first.message}`;
}

export class ErrorHandler {
  static handle = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ message: toZodMessage(err), code: 'VALIDATION_ERROR' });
      return;
    }

    if (err instanceof ApiError) {
      const body: Record<string, unknown> = { message: err.message, code: err.code };
      if (err.data !== undefined) body.data = err.data;
      res.status(err.status).json(body);
      return;
    }

    if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
      res.status(400).json({ message: 'Invalid JSON payload.', code: 'INVALID_JSON' });
      return;
    }

    console.error('[error]', err);
    res.status(500).json({ message: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  };
}