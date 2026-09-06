"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("./config/env");
const errors_1 = require("./lib/errors");
const auth_1 = __importDefault(require("./routes/auth"));
const vaultItems_1 = __importDefault(require("./routes/vaultItems"));
const cards_1 = __importDefault(require("./routes/cards"));
const notes_1 = __importDefault(require("./routes/notes"));
const documents_1 = __importDefault(require("./routes/documents"));
const emergency_1 = __importDefault(require("./routes/emergency"));
const family_1 = __importDefault(require("./routes/family"));
const recoveryKit_1 = __importDefault(require("./routes/recoveryKit"));
const recoveryCircle_1 = __importDefault(require("./routes/recoveryCircle"));
const estate_1 = __importDefault(require("./routes/estate"));
const continuity_1 = __importDefault(require("./routes/continuity"));
const safetyCheck_1 = __importDefault(require("./routes/safetyCheck"));
const sessions_1 = __importDefault(require("./routes/sessions"));
const users_1 = __importDefault(require("./routes/users"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const support_1 = __importDefault(require("./routes/support"));
const securityAlerts_1 = __importDefault(require("./routes/securityAlerts"));
const subscriptions_1 = __importDefault(require("./routes/subscriptions"));
const payments_1 = __importDefault(require("./routes/payments"));
const backup_1 = __importDefault(require("./routes/backup"));
const testHarness_1 = __importDefault(require("./routes/testHarness"));
function createApp() {
    const app = (0, express_1.default)();
    app.disable('x-powered-by');
    app.set('trust proxy', 1);
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }));
    const allowedOrigins = env_1.env.ALLOWED_ORIGINS === '*' ? true : env_1.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
    app.use((0, cors_1.default)({
        origin: allowedOrigins === true ? true : (origin, cb) => {
            if (!origin || allowedOrigins.includes(origin))
                cb(null, true);
            else
                cb(new Error('CORS not allowed for this origin.'));
        },
        credentials: true,
    }));
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
    app.use('/vault', (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000,
        limit: 1000,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
    }));
    app.use('/vault/auth', (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000,
        limit: 60,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        skipSuccessfulRequests: true,
        message: { error: 'Too many auth attempts. Please try again later.', code: 'RATE_LIMITED' },
    }));
    app.get('/actuator/health', (_req, res) => {
        res.json({ status: 'UP', service: 'guardian-vault-gateway', timestamp: new Date().toISOString() });
    });
    app.use('/api/vault', vaultItems_1.default);
    app.use('/vault/auth', auth_1.default);
    app.use('/vault/cards', cards_1.default);
    app.use('/vault/notes', notes_1.default);
    app.use('/vault/documents', documents_1.default);
    app.use('/vault/emergency', emergency_1.default);
    app.use('/vault/family', family_1.default);
    app.use('/vault/recovery-kit', recoveryKit_1.default);
    app.use('/vault/recovery-circle', recoveryCircle_1.default);
    app.use('/vault/estate-playbooks', estate_1.default);
    app.use('/vault/continuity-drill', continuity_1.default);
    app.use('/vault/safety-check', safetyCheck_1.default);
    app.use('/vault/sessions', sessions_1.default);
    app.use('/vault/users', users_1.default);
    app.use('/vault/notifications', notifications_1.default);
    app.use('/vault/support', support_1.default);
    app.use('/vault/security-alerts', securityAlerts_1.default);
    app.use('/vault/api/subscriptions', subscriptions_1.default);
    app.use('/vault/payments', payments_1.default);
    app.use('/vault/backup', backup_1.default);
    if (env_1.env.NODE_ENV === 'test') {
        app.use('/vault/auth/_test', testHarness_1.default);
    }
    app.use((_req, _res, next) => next(new errors_1.ApiError(404, 'Route not found.', 'NOT_FOUND')));
    app.use((err, req, res, _next) => errors_1.ErrorHandler.handle(err, req, res, _next));
    return app;
}
exports.default = createApp;
//# sourceMappingURL=app.js.map