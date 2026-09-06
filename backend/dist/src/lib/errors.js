"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = exports.tooManyRequests = exports.conflict = exports.notFound = exports.forbidden = exports.unauthorized = exports.badRequest = exports.ApiError = void 0;
exports.asyncHandler = asyncHandler;
const zod_1 = require("zod");
class ApiError extends Error {
    status;
    code;
    data;
    constructor(status, message, code, data) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.data = data;
    }
}
exports.ApiError = ApiError;
const badRequest = (message, data) => new ApiError(400, message, 'BAD_REQUEST', data);
exports.badRequest = badRequest;
const unauthorized = (message = 'Authentication required.') => new ApiError(401, message, 'UNAUTHORIZED');
exports.unauthorized = unauthorized;
const forbidden = (message = 'You do not have permission to do that.') => new ApiError(403, message, 'FORBIDDEN');
exports.forbidden = forbidden;
const notFound = (message = 'The requested resource was not found.') => new ApiError(404, message, 'NOT_FOUND');
exports.notFound = notFound;
const conflict = (message, code = 'CONFLICT') => new ApiError(409, message, code);
exports.conflict = conflict;
const tooManyRequests = (message = 'Too many requests. Please slow down and try again.') => new ApiError(429, message, 'RATE_LIMITED');
exports.tooManyRequests = tooManyRequests;
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
function toZodMessage(error) {
    const first = error.issues[0];
    if (!first)
        return 'Invalid request payload.';
    return `${first.path.join('.') || 'body'}: ${first.message}`;
}
class ErrorHandler {
    static handle = (err, _req, res, _next) => {
        if (err instanceof zod_1.ZodError) {
            res.status(400).json({ message: toZodMessage(err), code: 'VALIDATION_ERROR' });
            return;
        }
        if (err instanceof ApiError) {
            const body = { message: err.message, code: err.code };
            if (err.data !== undefined)
                body.data = err.data;
            res.status(err.status).json(body);
            return;
        }
        if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
            res.status(400).json({ message: 'Invalid JSON payload.', code: 'INVALID_JSON' });
            return;
        }
        console.error('[error]', err);
        res.status(500).json({ message: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
    };
}
exports.ErrorHandler = ErrorHandler;
//# sourceMappingURL=errors.js.map