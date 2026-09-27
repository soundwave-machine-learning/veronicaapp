import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../server/db';
import { createAppointment, listAppointments, setPaymentStatus } from '../../server/appointments';
import { listClients } from '../../server/clients';
import { addDays, todayISO } from '../../shared/dates';

describe('persistence', () => {
  it('keeps everything after the application restarts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'veronica-'));
    const file = path.join(dir, 'veronica.db');
    const date = addDays(todayISO(), 1);

    const first = openDatabase(file);
    const created = createAppointment(first, { clientName: 'Maria Johnson', date, time: '10:00', phone: '5550100101' });
    setPaymentStatus(first, created.appointment.id, 'paid');
    first.close();

    const second = openDatabase(file);
    expect(listClients(second).map((c) => c.name)).toEqual(['Maria Johnson']);
    const [appointment] = listAppointments(second, { from: date, to: date });
    expect(appointment).toMatchObject({ time: '10:00', paymentStatus: 'paid', client: { phone: '(555) 010-0101' } });
    second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
