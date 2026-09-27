import { describe, expect, it } from 'vitest';
import { makeApp } from './helpers';
import { addDays, todayISO } from '../../shared/dates';

const day = (offset: number) => addDays(todayISO(), offset);

describe('clients', () => {
  it('creates, edits and searches clients', async () => {
    const { http } = makeApp();
    const created = await http.post('/api/clients').send({
      name: 'Maria Johnson',
      phone: '5551234567',
      address: '123 Main Street',
      notes: 'Has a friendly dog',
      defaultPrice: '$120',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ phone: '(555) 123-4567', defaultPriceCents: 12000, notes: 'Has a friendly dog' });

    const edited = await http.put(`/api/clients/${created.body.id}`).send({ ...created.body, name: 'Maria Johnson', address: '124 Main Street', defaultPrice: '130' });
    expect(edited.body).toMatchObject({ address: '124 Main Street', defaultPriceCents: 13000 });

    await http.post('/api/clients').send({ name: 'Robert Davis', phone: '555 987 6543', address: '789 Pine Road' });
    expect((await http.get('/api/clients?search=mar')).body.map((c: { name: string }) => c.name)).toEqual(['Maria Johnson']);
    expect((await http.get('/api/clients?search=987')).body.map((c: { name: string }) => c.name)).toEqual(['Robert Davis']);
    expect((await http.get('/api/clients?search=pine')).body.map((c: { name: string }) => c.name)).toEqual(['Robert Davis']);
  });

  it('only requires a name and blocks duplicates', async () => {
    const { http } = makeApp();
    expect((await http.post('/api/clients').send({ name: '' })).status).toBe(400);
    expect((await http.post('/api/clients').send({ name: 'Maria Johnson' })).status).toBe(201);
    const dup = await http.post('/api/clients').send({ name: 'maria johnson' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/already have a client named Maria Johnson/);
  });

  it('removing a client keeps their history', async () => {
    const { http, db } = makeApp();
    const past = await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(-7), time: '10:00' });
    await http.post(`/api/appointments/${past.body.appointment.id}/status`).send({ status: 'completed' });
    await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(3), time: '10:00' });
    await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(5), time: '10:00', repeat: 'weekly' });
    const id = past.body.client.id;

    const archived = await http.post(`/api/clients/${id}/archive`).send({ today: day(0) });
    expect(archived.body.archivedAt).toBeTruthy();
    expect((await http.get('/api/clients')).body).toHaveLength(0);
    expect((await http.get('/api/clients?archived=true')).body).toHaveLength(1);

    const profile = await http.get(`/api/clients/${id}`);
    const statuses = profile.body.appointments.map((a: { date: string; status: string }) => `${a.date} ${a.status}`);
    expect(statuses).toEqual([`${day(-7)} completed`, `${day(3)} canceled`]);
    // The row is still in the database.
    expect((db.prepare('SELECT COUNT(*) AS n FROM clients').get() as { n: number }).n).toBe(1);

    const restored = await http.post(`/api/clients/${id}/restore`).send({});
    expect(restored.body.archivedAt).toBeNull();
  });

  it('quick add brings back a removed client instead of creating a duplicate', async () => {
    const { http } = makeApp();
    const client = await http.post('/api/clients').send({ name: 'Maria Johnson' });
    await http.post(`/api/clients/${client.body.id}/archive`).send({});
    const res = await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(1), time: '10:00' });
    expect(res.body.client.id).toBe(client.body.id);
    expect(res.body.client.archivedAt).toBeNull();
  });
});

describe('settings', () => {
  it('has sensible defaults', async () => {
    const { http } = makeApp();
    const res = await http.get('/api/settings');
    expect(res.body).toMatchObject({ defaultDurationMinutes: 120 });
    expect(res.body.reminderTemplate).toContain('{client}');
    expect(res.body.onMyWayTemplate).toContain("I'm on my way");
  });

  it('changing the owner keeps every client and cleaning', async () => {
    const { http } = makeApp();
    const created = await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(1), time: '10:00', price: '100' });
    await http.post(`/api/appointments/${created.body.appointment.id}/payment`).send({ paymentStatus: 'paid' });
    const before = (await http.get(`/api/clients/${created.body.client.id}`)).body;

    const settings = (await http.get('/api/settings')).body;
    const res = await http.put('/api/settings').send({
      ...settings,
      businessName: 'Bright Nest Cleaning',
      ownerName: 'Jordan Example',
      businessPhone: '555-000-1111',
      defaultDurationMinutes: 150,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ businessName: 'Bright Nest Cleaning', ownerName: 'Jordan Example', businessPhone: '(555) 000-1111' });

    const after = (await http.get(`/api/clients/${created.body.client.id}`)).body;
    expect(after).toEqual(before);
  });

  it('validates settings', async () => {
    const { http } = makeApp();
    const settings = (await http.get('/api/settings')).body;
    expect((await http.put('/api/settings').send({ ...settings, businessName: '' })).status).toBe(400);
    expect((await http.put('/api/settings').send({ ...settings, defaultDurationMinutes: 5 })).status).toBe(400);
    expect((await http.put('/api/settings').send({ ...settings, reminderTemplate: ' ' })).status).toBe(400);
    expect((await http.put('/api/settings').send({ ...settings, businessPhone: 'abc' })).status).toBe(400);
  });
});

describe('password protection and errors', () => {
  it('requires the password when one is set', async () => {
    const { http } = makeApp({ password: 'correct horse' });
    expect((await http.get('/api/session')).body).toEqual({ authRequired: true, authenticated: false });
    expect((await http.get('/api/clients')).status).toBe(401);
    expect((await http.post('/api/login').send({ password: 'wrong' })).status).toBe(401);
    const login = await http.post('/api/login').send({ password: 'correct horse' });
    expect(login.status).toBe(200);
    const cookie = login.headers['set-cookie'];
    expect(String(cookie)).toMatch(/HttpOnly/);
    expect((await http.get('/api/clients').set('Cookie', cookie)).status).toBe(200);
    expect((await http.get('/api/clients').set('Cookie', 'veronica_session=v1.9999999999999.forged')).status).toBe(401);
  });

  it('never shows technical errors', async () => {
    const { http } = makeApp();
    const bad = await http.post('/api/appointments').set('Content-Type', 'application/json').send('{not json');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/please try again/i);
    const missing = await http.get('/api/appointments/99999');
    expect(missing.status).toBe(404);
    expect(missing.body.error).toMatch(/could not find/i);
  });

  it('exports a backup', async () => {
    const { http } = makeApp();
    await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(1), time: '10:00' });
    const res = await http.get('/api/backup');
    expect(res.headers['content-disposition']).toMatch(/veronica-backup/);
    expect(res.body.clients).toHaveLength(1);
    expect(res.body.appointments).toHaveLength(1);
  });
});
