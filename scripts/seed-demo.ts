/**
 * Fill an EMPTY database with made-up demo data (fictional people,
 * 555 phone numbers and made-up streets). For trying Veronica out only:
 *   DATABASE_PATH=./data/demo.db npm run seed:demo
 * Refuses to touch a database that already has clients.
 */
import fs from 'node:fs';
import { openDatabase } from '../server/db.js';
import { createAppointment, setPaymentStatus, setStatus } from '../server/appointments.js';
import { createClient } from '../server/clients.js';
import { addDays, todayISO } from '../shared/dates.js';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const db = openDatabase(process.env.DATABASE_PATH || './data/veronica.db');
const count = (db.prepare('SELECT COUNT(*) AS n FROM clients').get() as { n: number }).n;
if (count > 0) {
  console.error('This database already has clients. Demo data is only added to an empty database.');
  process.exit(1);
}

const today = todayISO();
const day = (offset: number) => addDays(today, offset);

createClient(db, { name: 'Maria Johnson', phone: '555-010-0101', address: '123 Main Street, Springfield', defaultPrice: '120', notes: 'Friendly dog named Biscuit. Spare key under the blue pot.' });
createClient(db, { name: 'Jennifer Smith', phone: '555-010-0102', address: '456 Oak Avenue, Springfield', defaultPrice: '95' });
createClient(db, { name: 'Robert Davis', phone: '555-010-0103', address: '789 Pine Road, Springfield', defaultPrice: '150' });
createClient(db, { name: 'Linda Garcia', address: '22 Elm Court, Springfield' });

const past = createAppointment(db, { clientName: 'Jennifer Smith', date: day(-7), time: '12:30' });
setStatus(db, past.appointment.id, 'completed');
setPaymentStatus(db, past.appointment.id, 'paid');
const unpaid = createAppointment(db, { clientName: 'Robert Davis', date: day(-3), time: '09:00' });
setStatus(db, unpaid.appointment.id, 'completed');

createAppointment(db, { clientName: 'Maria Johnson', date: today, time: '09:00', repeat: 'biweekly' });
createAppointment(db, { clientName: 'Jennifer Smith', date: today, time: '12:30' });
createAppointment(db, { clientName: 'Robert Davis', date: today, time: '16:00' });
createAppointment(db, { clientName: 'Linda Garcia', date: day(2), time: '16:30', repeat: 'monthly' });
createAppointment(db, { clientName: 'Jennifer Smith', date: day(3), time: '13:00', repeat: 'weekly' });

console.log('Demo data added.');
db.close();
