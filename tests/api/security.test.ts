import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { getSessionSecret, openDatabase } from '../../server/db';
import { createApp } from '../../server/app';
import { authConfigFromEnv, createToken, verifyToken } from '../../server/auth';

const PASSWORD = 'correct horse battery';

function productionApp() {
  const db = openDatabase(':memory:');
  const auth = authConfigFromEnv({ APP_PASSWORD: PASSWORD, NODE_ENV: 'production' } as NodeJS.ProcessEnv, getSessionSecret(db));
  return { db, auth, app: createApp({ db, auth, logErrors: false }) };
}

const CUSTOMER_ENDPOINTS: [string, string][] = [
  ['get', '/api/settings'],
  ['put', '/api/settings'],
  ['get', '/api/clients'],
  ['post', '/api/clients'],
  ['get', '/api/clients/1'],
  ['put', '/api/clients/1'],
  ['post', '/api/clients/1/archive'],
  ['post', '/api/clients/1/restore'],
  ['get', '/api/appointments?from=2026-01-01&to=2026-12-31'],
  ['get', '/api/appointments/next?after=2026-01-01'],
  ['get', '/api/appointments/unpaid'],
  ['post', '/api/appointments'],
  ['get', '/api/appointments/1'],
  ['put', '/api/appointments/1'],
  ['post', '/api/appointments/1/status'],
  ['post', '/api/appointments/1/payment'],
  ['post', '/api/appointments/1/stop-repeating'],
  ['get', '/api/backup'],
  ['get', '/api/anything-else'],
];

describe('password protection in production', () => {
  it('blocks every customer endpoint without signing in', async () => {
    const { app } = productionApp();
    for (const [method, url] of CUSTOMER_ENDPOINTS) {
      const res = await (request(app) as unknown as Record<string, (u: string) => request.Test>)[method](url).send({});
      expect(res.status, `${method.toUpperCase()} ${url}`).toBe(401);
      expect(JSON.stringify(res.body)).not.toMatch(/Maria|client_id|SELECT/);
    }
  });

  it('signs in with a secure, http-only, same-site cookie and signs out', async () => {
    const { app } = productionApp();
    const bad = await request(app).post('/api/login').send({ password: 'wrong password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe('That password is not right. Please try again.');
    expect(bad.headers['set-cookie']).toBeUndefined();

    const good = await request(app).post('/api/login').send({ password: PASSWORD });
    const cookie = String(good.headers['set-cookie']);
    expect(cookie).toMatch(/veronica_session=v1\./);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    const session = cookie.split(';')[0];
    expect((await request(app).get('/api/clients').set('Cookie', session)).status).toBe(200);
    expect((await request(app).get('/api/session').set('Cookie', session)).body).toEqual({ authRequired: true, authenticated: true });

    const out = await request(app).post('/api/logout').set('Cookie', session).send({});
    expect(String(out.headers['set-cookie'])).toMatch(/veronica_session=;.*Expires=Thu, 01 Jan 1970/);
  });

  it('rejects forged, tampered and expired cookies', () => {
    const { auth } = productionApp();
    const token = createToken(auth);
    expect(verifyToken(auth, token)).toBe(true);
    expect(verifyToken(auth, token.slice(0, -2) + 'xx')).toBe(false);
    const [v, expires, sig] = token.split('.');
    expect(verifyToken(auth, `${v}.${Number(expires) + 1000}.${sig}`)).toBe(false);
    expect(verifyToken(auth, createToken(auth, Date.now() - 400 * 24 * 3600 * 1000))).toBe(false);
  });

  it('changing the password signs every device out', () => {
    const { db, auth } = productionApp();
    const token = createToken(auth);
    const changed = authConfigFromEnv({ APP_PASSWORD: 'a different password', NODE_ENV: 'production' } as NodeJS.ProcessEnv, getSessionSecret(db));
    expect(verifyToken(changed, token)).toBe(false);
  });

  it('keeps the same signing secret across restarts', () => {
    const db = openDatabase(':memory:');
    expect(getSessionSecret(db)).toMatch(/^[0-9a-f]{64}$/);
    expect(getSessionSecret(db)).toBe(getSessionSecret(db));
  });

  it('limits repeated wrong passwords', async () => {
    const { app } = productionApp();
    for (let i = 0; i < 10; i++) await request(app).post('/api/login').set('X-Forwarded-For', '203.0.113.9').send({ password: 'nope' });
    const blocked = await request(app).post('/api/login').set('X-Forwarded-For', '203.0.113.9').send({ password: PASSWORD });
    expect(blocked.status).toBe(429);
  });
});

describe('security headers', () => {
  it('sends basic protections, and HSTS behind an HTTPS proxy', async () => {
    const { app } = productionApp();
    const res = await request(app).get('/api/health').set('X-Forwarded-Proto', 'https');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).not.toContain('unsafe-inline');
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('unsafe input', () => {
  it('stores script-like text as plain text and SQL-like text as data', async () => {
    const { app } = productionApp();
    const login = await request(app).post('/api/login').send({ password: PASSWORD });
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const nasty = `<img src=x onerror=alert(1)> '); DROP TABLE clients; --`;
    const res = await request(app).post('/api/clients').set('Cookie', cookie).send({ name: nasty, address: nasty, notes: nasty });
    expect(res.status).toBe(201);
    expect(res.body.notes).toBe(nasty);
    const list = await request(app).get(`/api/clients?search=${encodeURIComponent("'; DROP TABLE")}`).set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect((await request(app).get('/api/clients').set('Cookie', cookie)).body).toHaveLength(1);
  });

  it('rejects oversized requests politely', async () => {
    const { app } = productionApp();
    const res = await request(app).post('/api/login').send({ password: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/please try again/i);
  });
});
