/**
 * Simple password protection.
 *
 * When APP_PASSWORD is set, the whole app asks for that one password and
 * then remembers the device with a signed cookie for a year. There are no
 * user accounts on purpose: one business, one password. Changing
 * APP_PASSWORD (or SESSION_SECRET) signs every device out.
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const COOKIE_NAME = 'veronica_session';
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

export interface AuthConfig {
  password: string | null;
  secret: string;
  secureCookies: boolean;
}

export function authConfigFromEnv(env: NodeJS.ProcessEnv): AuthConfig {
  const password = env.APP_PASSWORD?.trim() || null;
  const secret =
    env.SESSION_SECRET?.trim() ||
    crypto
      .createHash('sha256')
      .update(`veronica:${password ?? 'no-password'}`)
      .digest('hex');
  return { password, secret, secureCookies: env.NODE_ENV === 'production' };
}

function sign(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function createToken(config: AuthConfig, nowMs = Date.now()): string {
  const payload = `v1.${nowMs + MAX_AGE_MS}`;
  return `${payload}.${sign(payload, config.secret)}`;
}

export function verifyToken(config: AuthConfig, token: string | undefined, nowMs = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const payload = `${parts[0]}.${parts[1]}`;
  if (!safeEqual(parts[2], sign(payload, config.secret))) return false;
  const expires = Number(parts[1]);
  return Number.isFinite(expires) && expires > nowMs;
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function isAuthenticated(config: AuthConfig, req: Request): boolean {
  if (!config.password) return true;
  return verifyToken(config, readCookie(req, COOKIE_NAME));
}

export function requireAuth(config: AuthConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isAuthenticated(config, req)) return next();
    res.status(401).json({ error: 'Please sign in.', code: 'unauthorized' });
  };
}

const failures = new Map<string, { count: number; first: number }>();

export function loginHandler(config: AuthConfig) {
  return (req: Request, res: Response) => {
    if (!config.password) {
      res.json({ authenticated: true });
      return;
    }
    const key = req.ip ?? 'unknown';
    const record = failures.get(key);
    const nowMs = Date.now();
    if (record && nowMs - record.first < FAILURE_WINDOW_MS && record.count >= MAX_FAILURES) {
      res.status(429).json({ error: 'Too many tries. Please wait 15 minutes and try again.' });
      return;
    }
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || !safeEqual(password, config.password)) {
      const fresh = !record || nowMs - record.first >= FAILURE_WINDOW_MS;
      failures.set(key, fresh ? { count: 1, first: nowMs } : { count: record.count + 1, first: record.first });
      res.status(401).json({ error: 'That password is not right. Please try again.', field: 'password' });
      return;
    }
    failures.delete(key);
    res.cookie(COOKIE_NAME, createToken(config), {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.secureCookies,
      maxAge: MAX_AGE_MS,
      path: '/',
    });
    res.json({ authenticated: true });
  };
}

export function logoutHandler(config: AuthConfig) {
  return (_req: Request, res: Response) => {
    res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, path: '/' });
    res.json({ authenticated: false });
  };
}
