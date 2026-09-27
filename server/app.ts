/** The web server: JSON API under /api plus the built web app. */
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db.js';
import { ConflictError, UserError } from './errors.js';
import { getSettings, updateSettings } from './settings.js';
import { archiveClient, createClient, getClient, listClients, restoreClient, updateClient } from './clients.js';
import {
  createAppointment,
  getAppointment,
  listAppointments,
  listUnpaid,
  nextScheduledAfter,
  setPaymentStatus,
  setStatus,
  stopRepeating,
  updateAppointment,
} from './appointments.js';
import { authConfigFromEnv, isAuthenticated, loginHandler, logoutHandler, requireAuth, type AuthConfig } from './auth.js';

export interface AppOptions {
  db: DB;
  auth?: AuthConfig;
  /** Folder with the built web app (dist/client). Omit in development/tests. */
  staticDir?: string;
  logErrors?: boolean;
}

function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new UserError('We could not find that. It may have been removed.', 404);
  return id;
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function createApp(options: AppOptions) {
  const { db } = options;
  const auth = options.auth ?? authConfigFromEnv(process.env);
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; " +
        "script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });

  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // ---- Session (open to everyone) ----
  api.get('/session', (req, res) => {
    res.json({ authRequired: Boolean(auth.password), authenticated: isAuthenticated(auth, req) });
  });
  api.post('/login', loginHandler(auth));
  api.post('/logout', logoutHandler(auth));
  api.get('/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true });
  });

  // ---- Everything below needs the password (when one is set) ----
  api.use(requireAuth(auth));

  api.get('/settings', (_req, res) => {
    res.json(getSettings(db));
  });
  api.put('/settings', (req, res) => {
    res.json(updateSettings(db, req.body ?? {}));
  });

  api.get('/clients', (req, res) => {
    res.json(listClients(db, { search: queryString(req.query.search), archived: req.query.archived === 'true' }));
  });
  api.post('/clients', (req, res) => {
    res.status(201).json(createClient(db, req.body ?? {}));
  });
  api.get('/clients/:id', (req, res) => {
    const id = idParam(req);
    const client = getClient(db, id);
    res.json({ ...client, appointments: listAppointments(db, { clientId: id }) });
  });
  api.put('/clients/:id', (req, res) => {
    res.json(updateClient(db, idParam(req), req.body ?? {}));
  });
  api.post('/clients/:id/archive', (req, res) => {
    res.json(archiveClient(db, idParam(req), req.body?.today));
  });
  api.post('/clients/:id/restore', (req, res) => {
    res.json(restoreClient(db, idParam(req)));
  });

  api.get('/appointments', (req, res) => {
    res.json(listAppointments(db, { from: queryString(req.query.from), to: queryString(req.query.to) }));
  });
  api.get('/appointments/next', (req, res) => {
    res.json({ appointment: nextScheduledAfter(db, queryString(req.query.after) ?? '') });
  });
  api.get('/appointments/unpaid', (_req, res) => {
    res.json(listUnpaid(db));
  });
  api.post('/appointments', (req, res) => {
    const result = createAppointment(db, req.body ?? {});
    res.status(result.duplicate ? 200 : 201).json(result);
  });
  api.get('/appointments/:id', (req, res) => {
    res.json(getAppointment(db, idParam(req)));
  });
  api.put('/appointments/:id', (req, res) => {
    res.json(updateAppointment(db, idParam(req), req.body ?? {}));
  });
  api.post('/appointments/:id/status', (req, res) => {
    res.json(setStatus(db, idParam(req), req.body?.status, req.body?.allowConflict === true));
  });
  api.post('/appointments/:id/payment', (req, res) => {
    res.json(setPaymentStatus(db, idParam(req), req.body?.paymentStatus));
  });
  api.post('/appointments/:id/stop-repeating', (req, res) => {
    res.json(stopRepeating(db, idParam(req), req.body?.today));
  });

  /** A complete copy of the business data as JSON (Settings → Download backup). */
  api.get('/backup', (_req, res) => {
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="veronica-backup-${stamp}.json"`);
    res.json({
      app: 'veronica',
      exportedAt: new Date().toISOString(),
      settings: db.prepare('SELECT * FROM settings').all(),
      clients: db.prepare('SELECT * FROM clients ORDER BY id').all(),
      series: db.prepare('SELECT * FROM series ORDER BY id').all(),
      appointments: db.prepare('SELECT * FROM appointments ORDER BY id').all(),
    });
  });

  api.use((_req, res) => {
    res.status(404).json({ error: 'We could not find that. It may have been removed.' });
  });

  app.use('/api', api);

  if (options.staticDir && fs.existsSync(options.staticDir)) {
    const staticDir = options.staticDir;
    app.use(
      express.static(staticDir, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    // Every other page is handled by the web app itself.
    app.get(/.*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  // Friendly errors only. Details go to the server log, never to the screen.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err instanceof ConflictError) {
      res.status(409).json({ error: err.message, field: err.field, code: err.code, conflict: err.conflict });
      return;
    }
    if (err instanceof UserError) {
      res.status(err.status).json({ error: err.message, field: err.field, code: err.code });
      return;
    }
    const status = (err as { status?: number; type?: string })?.status;
    if (status === 400 || status === 413) {
      res.status(status).json({ error: 'Something about that request was not right. Please try again.' });
      return;
    }
    if (options.logErrors !== false) console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side. Please try again in a moment.' });
  });

  return app;
}
