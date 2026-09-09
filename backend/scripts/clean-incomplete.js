/**
 * Remove customer records that cannot be visited.
 *
 *   docker compose exec -T backend node scripts/clean-incomplete.js --user you@example.com
 *   docker compose exec -T backend node scripts/clean-incomplete.js --user you@example.com --confirm
 *
 * A record with no street address, no city, or no province cannot be put on a
 * map or slotted into a day, so it sits in the list forever taking up room --
 * "Acart Equipment - (no location)" and 212 others like it. Garbage in,
 * garbage out.
 *
 * Without --confirm this prints them as CSV and changes nothing, which is what
 * the launcher saves as a backup before asking to go ahead. Contacts go with
 * the company (ON DELETE CASCADE), so the CSV records how many are lost, and
 * the CSV is the only way back -- keep it.
 */
import { pool, query } from '../config/db.js';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

// Which account? Named, or the only one that has customers in it.
async function resolveUser() {
  const email = opt('user', null);
  if (email) {
    const { rows } = await query('SELECT id, email FROM users WHERE lower(email)=lower($1)', [email]);
    if (!rows.length) throw new Error(`No account here with the email ${email}`);
    return rows[0];
  }
  const { rows } = await query(`
    SELECT u.id, u.email, count(c.id)::int AS companies
      FROM users u LEFT JOIN companies c ON c.owner_id = u.id
     WHERE u.email <> 'demo@example.com'
     GROUP BY u.id, u.email ORDER BY companies DESC`);
  const withData = rows.filter(r => r.companies > 0);
  if (withData.length === 1) return withData[0];
  if (!rows.length) throw new Error('No account here other than the demo login.');
  /* Naming the accounts beats "pick one" -- the whole reason for guessing was
     to save the person a lookup they cannot easily do. */
  const list = rows.map(r => `    ${r.email.padEnd(34)} ${r.companies} customers`).join('\n');
  throw new Error(`More than one account has customers:\n\n${list}\n\n  Re-run naming the one you mean:  --user <email>`);
}

/* Missing any one of the three and the record is not a place you can drive to.
   Written once and used by both the listing and the delete so they can never
   disagree about what is about to go. */
const INCOMPLETE = `(
     c.address  IS NULL OR btrim(c.address)  = ''
  OR c.city     IS NULL OR btrim(c.city)     = ''
  OR c.province IS NULL OR btrim(c.province) = ''
)`;

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

let user;
try { user = await resolveUser(); }
catch (e) { console.error(`\n  ${e.message}\n`); await pool.end(); process.exit(1); }

const { rows } = await query(`
  SELECT c.company_code, c.name, c.address, c.city, c.postal_code, c.phone,
         (SELECT count(*)::int FROM clients cl WHERE cl.company_id = c.id) AS contacts,
         (SELECT count(*)::int FROM trip_stops ts WHERE ts.company_id = c.id) AS trip_stops
    FROM companies c
   WHERE c.owner_id = $1 AND ${INCOMPLETE}
   ORDER BY c.name`, [user.id]);

if (!flag('confirm')) {
  // CSV on stdout -- the launcher redirects this into a file as the backup.
  const head = ['Customer Code', 'Company', 'Address', 'City', 'Postal Code', 'Phone', 'Contacts', 'In trips'];
  console.log(head.join(','));
  for (const r of rows) {
    console.log([r.company_code, r.name, r.address, r.city, r.postal_code, r.phone, r.contacts, r.trip_stops].map(csvCell).join(','));
  }
  const contacts = rows.reduce((a, r) => a + r.contacts, 0);
  const inTrips = rows.filter(r => r.trip_stops > 0).length;
  console.error(`\n  ${user.email}: ${rows.length} customers with no address, city or province, holding ${contacts} contacts.`);
  if (inTrips) console.error(`  WARNING: ${inTrips} of them are stops on a trip and would be dropped from it.`);
  console.error('  Nothing has been changed. Add --confirm to remove them.\n');
  await pool.end();
  process.exit(0);
}

const { rowCount } = await query(
  `DELETE FROM companies c WHERE c.owner_id = $1 AND ${INCOMPLETE}`, [user.id]);
const { rows: [left] } = await query('SELECT count(*)::int AS n FROM companies WHERE owner_id=$1', [user.id]);
console.log(`\n  Removed ${rowCount} incomplete customers from ${user.email}.`);
console.log(`  ${left.n} customers remain.\n`);
await pool.end();
