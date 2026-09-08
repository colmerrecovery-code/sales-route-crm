/**
 * Build the demo account.
 *
 * This is the version of GoMichi that gets shown to other reps, so it must
 * never contain a real customer. It is a separate account with its own
 * fictional data; the working account is untouched.
 *
 * Re-runnable: it wipes and rebuilds the demo account's data every time, so a
 * demo that got scribbled on during a meeting resets in seconds.
 *
 *   node scripts/seed-demo.js [--email demo@gomichi.app] [--password ...]
 */
import bcrypt from 'bcrypt';
import { pool, query } from '../config/db.js';
import { HOME, COMPANIES, PEOPLE, NOTES } from './demo-data.js';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const EMAIL = opt('email', 'demo@gomichi.app');
const PASSWORD = opt('password', 'showme123');

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
const pick = (arr, i) => arr[i % arr.length];

// ---- the account
const hash = await bcrypt.hash(PASSWORD, 10);
const { rows: [user] } = await query(
  `INSERT INTO users (email, password_hash, full_name, home_address,
                      home_location, touch_days_tier1, touch_days_tier2, touch_days_tier3, touch_days_tier4)
   VALUES ($1,$2,$3,$4, ST_SetSRID(ST_MakePoint($6,$5),4326)::geography, 60, 21, 120, 45)
   ON CONFLICT (email) DO UPDATE SET
     password_hash=EXCLUDED.password_hash, home_address=EXCLUDED.home_address,
     home_location=EXCLUDED.home_location, touch_days_tier1=EXCLUDED.touch_days_tier1,
     touch_days_tier2=EXCLUDED.touch_days_tier2, touch_days_tier3=EXCLUDED.touch_days_tier3,
     touch_days_tier4=EXCLUDED.touch_days_tier4
   RETURNING id, email`,
  [EMAIL, hash, 'Sample Account', `${HOME.address}, ${HOME.city}`, HOME.lat, HOME.lng]);

// Wipe only this account's data. Cascades clear customers, clients and interactions.
await query('DELETE FROM road_trips WHERE owner_id=$1', [user.id]);
await query('DELETE FROM companies WHERE owner_id=$1', [user.id]);

let n = 0, contacts = 0, logs = 0;
for (const [i, [name, address, city, postal, tier, temp, lastDays, lat, lng]] of COMPANIES.entries()) {
  const code = `C-${String(1001 + i).padStart(6, '0')}`;
  const { rows: [co] } = await query(
    `INSERT INTO companies (owner_id, company_code, name, address, city, postal_code, province, country, phone, location)
     VALUES ($1,$2,$3,$4,$5,$6,'ON','Canada',$7, ST_SetSRID(ST_MakePoint($9,$8),4326)::geography)
     RETURNING id`,
    [user.id, code, name, address, city, postal, `905-555-${String(1000 + i).slice(-4)}`, lat, lng]);
  n++;

  await query(
    `INSERT INTO customers (company_id, tier, temperature, last_contact_at, last_purchase_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [co.id, tier, temp, lastDays == null ? null : daysAgo(lastDays),
     tier === 'tier1' ? daysAgo(lastDays ?? 30) : tier === 'tier3' ? daysAgo(400 + i) : null]);

  // People on the accounts that would actually have them.
  if (tier === 'tier1' || tier === 'tier2') {
    const [first, last, title] = pick(PEOPLE, i);
    await query(
      `INSERT INTO clients (company_id, client_code, first_name, last_name, title, email, phone, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
      [co.id, `${code}-01`, first, last, title,
       `${first.toLowerCase()}.${last.toLowerCase()}@${name.toLowerCase().replace(/[^a-z]+/g, '')}.ca`,
       `905-555-${String(2000 + i).slice(-4)}`]);
    contacts++;
  }

  // A short history, so the timeline is not empty when someone taps in.
  if (lastDays != null) {
    const kinds = ['visit', 'call', 'email', 'note'];
    for (let k = 0; k < (tier === 'tier1' ? 3 : 2); k++) {
      const kind = pick(kinds, i + k);
      await query(
        `INSERT INTO interactions (company_id, user_id, kind, occurred_at, summary)
         VALUES ($1,$2,$3,$4,$5)`,
        [co.id, user.id, kind, daysAgo(lastDays + k * 34), pick(NOTES[kind], i + k)]);
      logs++;
    }
  }
}

console.log(`\n  Demo account ready: ${user.email}`);
console.log(`  Password:           ${PASSWORD}`);
console.log(`\n  ${n} companies, ${contacts} contacts, ${logs} logged calls and visits`);

const { rows: [due] } = await query(`
  SELECT count(*) FILTER (WHERE next_touch_due <= CURRENT_DATE)::int AS overdue,
         count(*)::int AS total
    FROM company_overview WHERE owner_id=$1`, [user.id]);
console.log(`  ${due.overdue} of ${due.total} are overdue for a visit — the dashboard will show that`);
console.log(`\n  Visit cycle: current 60 days, leads 21, inactive 120, cold 45`);
console.log(`  Home base:   ${HOME.address}, ${HOME.city}`);
console.log(`\n  Sign in with the address above, then use "Plan a road trip".\n`);
await pool.end();
