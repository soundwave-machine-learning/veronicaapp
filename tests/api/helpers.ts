import request from 'supertest';
import { openDatabase } from '../../server/db';
import { createApp } from '../../server/app';

export function makeApp(options: { password?: string } = {}) {
  const db = openDatabase(':memory:');
  const app = createApp({
    db,
    logErrors: false,
    auth: { password: options.password ?? null, secret: 'test-secret', secureCookies: false },
  });
  return { db, app, http: request(app) };
}
