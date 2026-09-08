/**
 * Read-only. Prints every account and what it holds, so "my customers are
 * gone" can be answered with a fact instead of a guess: wrong account, or
 * genuinely empty database.
 */
import { pool, query } from '../config/db.js';

const { rows } = await query(`
  SELECT u.email,
         (SELECT count(*) FROM companies   WHERE owner_id=u.id)::int AS companies,
         (SELECT count(*) FROM road_trips  WHERE owner_id=u.id)::int AS trips,
         (SELECT count(*) FROM clients cl JOIN companies c ON c.id=cl.company_id
           WHERE c.owner_id=u.id)::int AS contacts,
         to_char(u.created_at,'Mon DD YYYY') AS made
    FROM users u ORDER BY companies DESC, u.created_at`);

console.log('\n  ACCOUNT                          CUSTOMERS  CONTACTS  TRIPS   CREATED');
console.log('  ' + '-'.repeat(74));
for (const r of rows) {
  console.log('  ' + r.email.padEnd(32) +
    String(r.companies).padStart(8) + String(r.contacts).padStart(10) +
    String(r.trips).padStart(7) + '   ' + r.made);
}
const total = rows.reduce((a, r) => a + r.companies, 0);
console.log('  ' + '-'.repeat(74));
if (!total) {
  console.log('\n  No customers under ANY account. The database itself is empty.');
  console.log('  Nothing here is lost from your spreadsheets - run "2 Import Customers".\n');
} else {
  const top = rows.find(r => r.companies === Math.max(...rows.map(x => x.companies)));
  console.log(`\n  Your customers are all under:  ${top.email}`);
  console.log('  Sign in with THAT address. If it is not the one you used, that is why');
  console.log('  the app looked empty - the data is fine.\n');
}
await pool.end();
