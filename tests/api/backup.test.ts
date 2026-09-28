import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { openDatabase } from '../../server/db';
import { createApp } from '../../server/app';
import { backupDatabaseFile, exportData, readBackupFile, restoreData } from '../../server/backup';
import { createAppointment, setPaymentStatus, setStatus } from '../../server/appointments';
import { updateSettings, getSettings } from '../../server/settings';
import { addDays, todayISO } from '../../shared/dates';

const day = (n: number) => addDays(todayISO(), n);

function fillWithFictionalData(db: ReturnType<typeof openDatabase>) {
  updateSettings(db, { ...getSettings(db), businessName: 'Bright Nest Cleaning', ownerName: 'Jordan Example' });
  const done = createAppointment(db, { clientName: 'Maria Johnson', date: day(-7), time: '10:00', phone: '5550100101', address: '123 Main Street', price: '120', notes: 'Friendly dog' });
  setStatus(db, done.appointment.id, 'completed');
  setPaymentStatus(db, done.appointment.id, 'paid');
  const canceled = createAppointment(db, { clientName: 'Robert Davis', date: day(2), time: '09:00' });
  setStatus(db, canceled.appointment.id, 'canceled');
  createAppointment(db, { clientName: 'Maria Johnson', date: day(1), time: '10:00', repeat: 'biweekly' });
}

const withoutTimestamp = (data: ReturnType<typeof exportData>) => ({ ...data, exportedAt: undefined });

describe('backup and restore', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'veronica-backup-'));

  it('restores everything from the downloaded JSON backup', async () => {
    const original = openDatabase(':memory:');
    fillWithFictionalData(original);
    const app = createApp({ db: original, logErrors: false, auth: { password: 'long enough', secret: 's', secureCookies: false } });

    // The download needs the password.
    expect((await request(app).get('/api/backup')).status).toBe(401);
    const login = await request(app).post('/api/login').send({ password: 'long enough' });
    const res = await request(app).get('/api/backup').set('Cookie', login.headers['set-cookie']);
    expect(res.status).toBe(200);
    const file = path.join(dir, 'download.json');
    fs.writeFileSync(file, JSON.stringify(res.body));

    const fresh = openDatabase(path.join(dir, 'fresh.db'));
    const result = restoreData(fresh, readBackupFile(file));
    expect(result).toEqual({ settings: 1, clients: 2, series: 1, appointments: res.body.appointments.length });
    expect(withoutTimestamp(exportData(fresh))).toEqual(withoutTimestamp(exportData(original)));
    expect(res.body).not.toHaveProperty('app_meta');

    // New records continue after the restored ids.
    const next = createAppointment(fresh, { clientName: 'Linda Garcia', date: day(40), time: '15:00' });
    expect(next.client.id).toBeGreaterThan(2);
  });

  it('restores from a .db copy made while the app is running, replacing current data', async () => {
    const live = openDatabase(path.join(dir, 'live.db'));
    fillWithFictionalData(live);
    const copy = await backupDatabaseFile(live, path.join(dir, 'backups'));
    const snapshot = exportData(live);

    // Something goes wrong after the backup...
    createAppointment(live, { clientName: 'Mistake Person', date: day(3), time: '15:00' });
    restoreData(live, readBackupFile(copy));
    expect(withoutTimestamp(exportData(live))).toEqual(withoutTimestamp(snapshot));
  });

  it('refuses files that are not Veronica backups and changes nothing', () => {
    const db = openDatabase(':memory:');
    fillWithFictionalData(db);
    const before = exportData(db);
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, JSON.stringify({ hello: 'world' }));
    expect(() => readBackupFile(bad)).toThrow(/not a Veronica backup/);
    const broken = { ...before, appointments: [...before.appointments, { ...before.appointments[0], id: 999, client_id: 12345 }] };
    expect(() => restoreData(db, broken)).toThrow(/incomplete/);
    expect(withoutTimestamp(exportData(db))).toEqual(withoutTimestamp(before));
  });
});
