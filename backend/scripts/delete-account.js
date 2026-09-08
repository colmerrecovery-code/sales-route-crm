/**
 * Permanently delete an account and everything it owns.
 *
 *   node scripts/delete-account.js --user someone@example.com --confirm someone@example.com
 *
 * Prints a JSON summary of what exists BEFORE deleting, so the caller can keep a
 * record. Refuses the demo login. Refuses unless --confirm matches --user exactly.
 * Deleting a user cascades to their companies, clients, trips and interactions.
 */
import { pool, query } from '../config/db.js';

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const EMAIL = opt('user');
const CONFIRM = opt('confirm');

if (!EMAIL) { console.error('Usage: --user <email> --confirm <same email>'); await pool.end(); process.exit(1); }
if (EMAIL.toLowerCase() === 'demo@example.com') {
  console.error('The demo login is not deletable from here.'); await pool.end(); process.exit(1);
}
const { rows: [user] } = await query('SELECT id, email, full_name, created_at FROM users WHERE email=$1', [EMAIL]);
if (!user) { console.error(`No account with the email "${EMAIL}".`); await pool.end(); process.exit(1); }

const { rows: [counts] } = await query(`
  SELECT (SELECT count(*)::int FROM companies WHERE owner_id=$1)                                   AS companies,
         (SELECT count(*)::int FROM clients cl JOIN companies c ON c.id=cl.company_id
           WHERE c.owner_id=$1)                                                                    AS contacts,
         (SELECT count(*)::int FROM road_trips WHERE owner_id=$1)                                  AS trips,
         (SELECT count(*)::int FROM interactions WHERE user_id=$1)                                 AS interactions`,
  [user.id]);

console.log(JSON.stringify({ account: user, holds: counts }, null, 2));

if (CONFIRM !== EMAIL) {
  console.error('\nNot deleted. To go ahead, pass --confirm with exactly the same email.');
  await pool.end(); process.exit(2);
}
await query('DELETE FROM users WHERE id=$1', [user.id]);
console.log(`\nDeleted ${user.email} and everything it owned.`);
await pool.end();
