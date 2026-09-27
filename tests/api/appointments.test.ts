import { describe, expect, it } from 'vitest';
import { makeApp } from './helpers';
import { addDays, todayISO } from '../../shared/dates';

const day = (offset: number) => addDays(todayISO(), offset);

describe('quick add', () => {
  it('creates a cleaning and a new client from just name, date and time', async () => {
    const { http } = makeApp();
    const res = await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(2), time: '10:00' });
    expect(res.status).toBe(201);
    expect(res.body.clientCreated).toBe(true);
    expect(res.body.appointment).toMatchObject({
      date: day(2),
      time: '10:00',
      durationMinutes: 120,
      status: 'scheduled',
      paymentStatus: 'unpaid',
      client: { name: 'Maria Johnson' },
    });

    const list = await http.get(`/api/appointments?from=${day(2)}&to=${day(2)}`);
    expect(list.body).toHaveLength(1);
    const clients = await http.get('/api/clients');
    expect(clients.body.map((c: { name: string }) => c.name)).toEqual(['Maria Johnson']);
  });

  it('re-uses an existing client instead of creating a duplicate', async () => {
    const { http } = makeApp();
    const first = await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(1), time: '10:00' });
    const byId = await http
      .post('/api/appointments')
      .send({ clientId: first.body.client.id, clientName: 'Maria Johnson', date: day(3), time: '10:00' });
    const byName = await http.post('/api/appointments').send({ clientName: '  maria   johnson ', date: day(5), time: '10:00' });
    expect(byId.body.clientCreated).toBe(false);
    expect(byName.body.clientCreated).toBe(false);
    expect(byName.body.client.id).toBe(first.body.client.id);
    const clients = await http.get('/api/clients');
    expect(clients.body).toHaveLength(1);
    const profile = await http.get(`/api/clients/${first.body.client.id}`);
    expect(profile.body.appointments).toHaveLength(3);
  });

  it('saves optional details on the client record', async () => {
    const { http } = makeApp();
    const res = await http.post('/api/appointments').send({
      clientName: 'Maria Johnson',
      date: day(1),
      time: '10:00',
      phone: '555-123-4567',
      address: '123 Main Street',
      price: '120',
      notes: 'Bring extra towels',
    });
    expect(res.body.client).toMatchObject({ phone: '(555) 123-4567', address: '123 Main Street', defaultPriceCents: 12000 });
    expect(res.body.appointment).toMatchObject({ priceCents: 12000, notes: 'Bring extra towels' });
    const next = await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(8), time: '10:00' });
    expect(next.body.appointment.priceCents).toBe(12000);
  });

  it('rejects missing or invalid fields with friendly messages', async () => {
    const { http } = makeApp();
    const cases = [
      [{ clientName: '', date: day(1), time: '10:00' }, 'clientName'],
      [{ clientName: 'Maria', date: '2026-02-31', time: '10:00' }, 'date'],
      [{ clientName: 'Maria', date: day(1), time: '25:00' }, 'time'],
      [{ clientName: 'Maria', date: day(1), time: '10:00', phone: '123' }, 'phone'],
      [{ clientName: 'Maria', date: day(1), time: '10:00', price: 'lots' }, 'price'],
      [{ clientName: 'Maria', date: day(1), time: '10:00', repeat: 'daily' }, 'repeat'],
    ] as const;
    for (const [body, field] of cases) {
      const res = await http.post('/api/appointments').send(body);
      expect(res.status).toBe(400);
      expect(res.body.field).toBe(field);
      expect(res.body.error).toMatch(/please/i);
    }
    expect((await http.get('/api/clients')).body).toHaveLength(0);
  });

  it('ignores a duplicate submission of the same form', async () => {
    const { http } = makeApp();
    const body = { clientName: 'Maria Johnson', date: day(1), time: '10:00', requestId: 'abc-123' };
    const first = await http.post('/api/appointments').send(body);
    const second = await http.post('/api/appointments').send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.appointment.id).toBe(first.body.appointment.id);
    expect((await http.get(`/api/appointments?from=${day(1)}&to=${day(1)}`)).body).toHaveLength(1);
  });
});

describe('conflicts', () => {
  it('warns about overlapping cleanings and shows the conflicting one', async () => {
    const { http } = makeApp();
    await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(1), time: '10:00' });
    const res = await http.post('/api/appointments').send({ clientName: 'Jennifer Smith', date: day(1), time: '11:00' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('You already have a cleaning scheduled around this time.');
    expect(res.body.conflict.appointment).toMatchObject({ time: '10:00', client: { name: 'Maria Johnson' } });
    // Nothing was created, not even the new client.
    expect((await http.get('/api/clients')).body).toHaveLength(1);
  });

  it('allows back-to-back cleanings and booking over canceled ones', async () => {
    const { http } = makeApp();
    const maria = await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(1), time: '10:00' });
    const back = await http.post('/api/appointments').send({ clientName: 'Jennifer Smith', date: day(1), time: '12:00' });
    expect(back.status).toBe(201);
    await http.post(`/api/appointments/${maria.body.appointment.id}/status`).send({ status: 'canceled' });
    const over = await http.post('/api/appointments').send({ clientName: 'Robert Davis', date: day(1), time: '10:00' });
    expect(over.status).toBe(201);
  });

  it('books anyway only when explicitly asked', async () => {
    const { http } = makeApp();
    await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(1), time: '10:00' });
    const res = await http
      .post('/api/appointments')
      .send({ clientName: 'Jennifer Smith', date: day(1), time: '11:00', allowConflict: true });
    expect(res.status).toBe(201);
  });

  it('checks every future date of a repeating cleaning', async () => {
    const { http } = makeApp();
    await http.post('/api/appointments').send({ clientName: 'Robert Davis', date: day(15), time: '10:00' });
    const res = await http
      .post('/api/appointments')
      .send({ clientName: 'Maria Johnson', date: day(1), time: '09:00', repeat: 'weekly' });
    expect(res.status).toBe(409);
    expect(res.body.conflict.requestedDate).toBe(day(15));
  });
});

describe('repeating cleanings', () => {
  it('creates future cleanings every 2 weeks', async () => {
    const { http } = makeApp();
    const res = await http
      .post('/api/appointments')
      .send({ clientName: 'Maria Johnson', date: day(1), time: '10:00', repeat: 'biweekly' });
    expect(res.status).toBe(201);
    expect(res.body.createdCount).toBeGreaterThanOrEqual(13);
    const list = await http.get(`/api/appointments?from=${day(0)}&to=${day(60)}`);
    expect(list.body.map((a: { date: string }) => a.date)).toEqual([day(1), day(15), day(29), day(43), day(57)]);
    expect(list.body[0].series).toMatchObject({ frequency: 'biweekly', startDate: day(1), endsOn: null });
  });

  it('creates more cleanings when the calendar looks further ahead', async () => {
    const { http } = makeApp();
    await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(1), time: '10:00', repeat: 'weekly' });
    const far = await http.get(`/api/appointments?from=${day(400)}&to=${day(420)}`);
    expect(far.body.length).toBe(3);
    // Asking again does not create duplicates.
    const again = await http.get(`/api/appointments?from=${day(400)}&to=${day(420)}`);
    expect(again.body.length).toBe(3);
  });

  it('moves one cleaning without touching the rest of the series', async () => {
    const { http } = makeApp();
    await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(1), time: '10:00', repeat: 'weekly' });
    const list = (await http.get(`/api/appointments?from=${day(0)}&to=${day(30)}`)).body;
    const second = list[1];
    const moved = await http.put(`/api/appointments/${second.id}`).send({ date: day(9), time: '14:00' });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ date: day(9), time: '14:00' });
    const after = (await http.get(`/api/appointments?from=${day(0)}&to=${day(30)}`)).body;
    expect(after.map((a: { date: string; time: string }) => `${a.date} ${a.time}`)).toEqual([
      `${day(1)} 10:00`,
      `${day(9)} 14:00`,
      `${day(15)} 10:00`,
      `${day(22)} 10:00`,
      `${day(29)} 10:00`,
    ]);
    // Viewing further ahead never re-creates the moved cleaning.
    await http.get(`/api/appointments?from=${day(0)}&to=${day(500)}`);
    const check = (await http.get(`/api/appointments?from=${day(8)}&to=${day(8)}`)).body;
    expect(check).toHaveLength(0);
  });

  it('changes this and all later cleanings', async () => {
    const { http } = makeApp();
    await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(1), time: '10:00', repeat: 'weekly' });
    const list = (await http.get(`/api/appointments?from=${day(0)}&to=${day(30)}`)).body;
    await http.post(`/api/appointments/${list[0].id}/status`).send({ status: 'completed' });
    const res = await http.put(`/api/appointments/${list[1].id}`).send({ date: day(9), time: '13:00', scope: 'future' });
    expect(res.status).toBe(200);
    const after = (await http.get(`/api/appointments?from=${day(0)}&to=${day(30)}`)).body;
    expect(after.map((a: { date: string; time: string; status: string }) => `${a.date} ${a.time} ${a.status}`)).toEqual([
      `${day(1)} 10:00 completed`,
      `${day(9)} 13:00 scheduled`,
      `${day(16)} 13:00 scheduled`,
      `${day(23)} 13:00 scheduled`,
      `${day(30)} 13:00 scheduled`,
    ]);
  });

  it('stops repeating after a cleaning but keeps history', async () => {
    const { http } = makeApp();
    await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(1), time: '10:00', repeat: 'weekly' });
    const list = (await http.get(`/api/appointments?from=${day(0)}&to=${day(30)}`)).body;
    await http.post(`/api/appointments/${list[0].id}/status`).send({ status: 'completed' });
    const res = await http.post(`/api/appointments/${list[1].id}/stop-repeating`).send({});
    expect(res.status).toBe(200);
    const after = (await http.get(`/api/appointments?from=${day(0)}&to=${day(400)}`)).body;
    expect(after.map((a: { date: string }) => a.date)).toEqual([day(1), day(8)]);
    expect(after[0].status).toBe('completed');
  });
});

describe('status and payment', () => {
  it('completes, pays and cancels without deleting anything', async () => {
    const { http } = makeApp();
    const created = await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(0), time: '10:00', price: '100' });
    const id = created.body.appointment.id;

    const done = await http.post(`/api/appointments/${id}/status`).send({ status: 'completed' });
    expect(done.body).toMatchObject({ status: 'completed', paymentStatus: 'unpaid' });
    expect(done.body.completedAt).toBeTruthy();

    const unpaid = await http.get('/api/appointments/unpaid');
    expect(unpaid.body.map((a: { id: number }) => a.id)).toEqual([id]);

    const paid = await http.post(`/api/appointments/${id}/payment`).send({ paymentStatus: 'paid' });
    expect(paid.body.paymentStatus).toBe('paid');
    expect((await http.get(`/api/appointments/${id}`)).body.paymentStatus).toBe('paid');
    expect((await http.get('/api/appointments/unpaid')).body).toHaveLength(0);

    const canceled = await http.post(`/api/appointments/${id}/status`).send({ status: 'canceled' });
    expect(canceled.body.status).toBe('canceled');
    expect((await http.get(`/api/appointments?from=${day(0)}&to=${day(0)}`)).body).toHaveLength(1);
  });

  it('rejects unknown statuses', async () => {
    const { http } = makeApp();
    const created = await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(0), time: '10:00' });
    const id = created.body.appointment.id;
    expect((await http.post(`/api/appointments/${id}/status`).send({ status: 'deleted' })).status).toBe(400);
    expect((await http.post(`/api/appointments/${id}/payment`).send({ paymentStatus: 'maybe' })).status).toBe(400);
  });

  it('checks for conflicts when a canceled cleaning is brought back', async () => {
    const { http } = makeApp();
    const maria = await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(1), time: '10:00' });
    await http.post(`/api/appointments/${maria.body.appointment.id}/status`).send({ status: 'canceled' });
    await http.post('/api/appointments').send({ clientName: 'Robert Davis', date: day(1), time: '10:00' });
    const res = await http.post(`/api/appointments/${maria.body.appointment.id}/status`).send({ status: 'scheduled' });
    expect(res.status).toBe(409);
  });

  it('finds the next cleaning after today', async () => {
    const { http } = makeApp();
    await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(3), time: '10:00' });
    await http.post('/api/appointments').send({ clientName: 'Robert Davis', date: day(2), time: '15:00' });
    const res = await http.get(`/api/appointments/next?after=${day(0)}`);
    expect(res.body.appointment.client.name).toBe('Robert Davis');
  });

  it('reschedules with conflict checking', async () => {
    const { http } = makeApp();
    const maria = await http.post('/api/appointments').send({ clientName: 'Maria Johnson', date: day(1), time: '10:00' });
    await http.post('/api/appointments').send({ clientName: 'Robert Davis', date: day(2), time: '10:00' });
    const blocked = await http.put(`/api/appointments/${maria.body.appointment.id}`).send({ date: day(2), time: '11:00' });
    expect(blocked.status).toBe(409);
    const ok = await http.put(`/api/appointments/${maria.body.appointment.id}`).send({ date: day(3), time: '11:00' });
    expect(ok.body).toMatchObject({ date: day(3), time: '11:00' });
    // Moving within its own time slot never conflicts with itself.
    const self = await http.put(`/api/appointments/${maria.body.appointment.id}`).send({ date: day(3), time: '11:30' });
    expect(self.status).toBe(200);
  });
});
