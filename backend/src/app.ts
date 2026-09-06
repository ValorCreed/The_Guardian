import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { env } from './config/env';
import { ApiError, ErrorHandler } from './lib/errors';

import authRouter from './routes/auth';
import vaultItemsRouter from './routes/vaultItems';
import cardsRouter from './routes/cards';
import notesRouter from './routes/notes';
import documentsRouter from './routes/documents';
import emergencyRouter from './routes/emergency';
import familyRouter from './routes/family';
import recoveryKitRouter from './routes/recoveryKit';
import recoveryCircleRouter from './routes/recoveryCircle';
import estateRouter from './routes/estate';
import continuityRouter from './routes/continuity';
import safetyCheckRouter from './routes/safetyCheck';
import sessionsRouter from './routes/sessions';
import usersRouter from './routes/users';
import notificationsRouter from './routes/notifications';
import supportRouter from './routes/support';
import securityAlertsRouter from './routes/securityAlerts';
import subscriptionsRouter from './routes/subscriptions';
import paymentsRouter from './routes/payments';
import backupRouter from './routes/backup';
import testHarnessRouter from './routes/testHarness';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  const allowedOrigins = env.ALLOWED_ORIGINS === '*' ? true : env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: allowedOrigins === true ? true : (origin, cb) => {
          if (!origin || allowedOrigins.includes(origin)) cb(null, true);
          else cb(new Error('CORS not allowed for this origin.'));
        },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use(
    '/vault',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 1000,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
    })
  );
  app.use(
    '/vault/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 60,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      message: { error: 'Too many auth attempts. Please try again later.', code: 'RATE_LIMITED' },
    })
  );

  app.get('/actuator/health', (_req, res) => {
    res.json({ status: 'UP', service: 'guardian-vault-gateway', timestamp: new Date().toISOString() });
  });

  app.use('/api/vault', vaultItemsRouter);
  app.use('/vault/auth', authRouter);
  app.use('/vault/cards', cardsRouter);
  app.use('/vault/notes', notesRouter);
  app.use('/vault/documents', documentsRouter);
  app.use('/vault/emergency', emergencyRouter);
  app.use('/vault/family', familyRouter);
  app.use('/vault/recovery-kit', recoveryKitRouter);
  app.use('/vault/recovery-circle', recoveryCircleRouter);
  app.use('/vault/estate-playbooks', estateRouter);
  app.use('/vault/continuity-drill', continuityRouter);
  app.use('/vault/safety-check', safetyCheckRouter);
  app.use('/vault/sessions', sessionsRouter);
  app.use('/vault/users', usersRouter);
  app.use('/vault/notifications', notificationsRouter);
  app.use('/vault/support', supportRouter);
  app.use('/vault/security-alerts', securityAlertsRouter);
  app.use('/vault/api/subscriptions', subscriptionsRouter);
  app.use('/vault/payments', paymentsRouter);
  app.use('/vault/backup', backupRouter);

  if (env.NODE_ENV === 'test') {
    app.use('/vault/auth/_test', testHarnessRouter);
  }

  app.use((_req, _res, next) => next(new ApiError(404, 'Route not found.', 'NOT_FOUND')));

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) =>
    ErrorHandler.handle(err, req, res, _next)
  );

  return app;
}

export default createApp;