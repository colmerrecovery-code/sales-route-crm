/**
 * Change the sign-in email on an account, keeping everything it owns.
 *
 * The email in GoMichi is only a username: no mail is ever sent to it, nothing
 * is verified against it, and there is no reset-by-email. So this is a rename,
 * not a migration — every company, contact, trip and interaction is tied to the
 * account's id, which does not change. Nothing moves and nothing is copied.
 *
 *   node scripts/set-email.js --from old@x.com --to new@y.com
 *   node scripts/set-email.js --from old@x.com --to new@y.com --commit
 *
 * Without --commit it only reports what the account holds and stops.
 */
import { pool, query } from '../config/db.js';

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : null; };
const FROM = opt('from'), TO = (opt('to') || '').trim().toLowerCase();
const COMMIT = argv.includes('--commit');

const bail = async (m) => { console.error(m); await pool.end(); process.exit(1); };

if (!FROM || !TO) await bail('Usage: node scripts/set-email.js --from <old email> --to <new email> [--commit]');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(TO)) await bail(`"${TO}" does not look like an email address. Nothing was changed.`);
if (FROM.toLowerCase() === TO) await bail('Those are the same address. Nothing to do.');

const { rows: [user] } = await query('SELECT id, email FROM users WHERE lower(email)=lower($1)', [FROM]);
if (!user) await bail(`No account signs in as "${FROM}".`);

const { rows: [taken] } = await query('SELECT id FROM users WHERE lower(email)=lower($1)', [TO]);
if (taken) await bail(`"${TO}" is already used by another account on this Mac. Pick a different address, or remove that account first with launcher 7.`);

const { rows: [n] } = await query(`
  SELECT (SELECT count(*) FROM companies     WHERE owner_id=$1)::int AS companies,
         (SELECT count(*) FROM road_trips    WHERE owner_id=$1)::int AS trips,
         (SELECT count(*) FROM clients cl JOIN companies c ON c.id=cl.company_id
           WHERE c.owner_id=$1)::int AS contacts`, [user.id]);

console.log(`\nAccount: ${user.email}`);
console.log(`  ${n.companies} customer locations`);
console.log(`  ${n.contacts} contacts`);
console.log(`  ${n.trips} road trip(s)`);
console.log(`\nAll of it belongs to the account itself, not to the email address,`);
console.log(`so every one of those stays exactly where it is.\n`);

if (!COMMIT) {
  console.log(`Nothing changed — this was a preview. Re-run with --commit to rename.\n`);
  await pool.end(); process.exit(0);
}

await query('UPDATE users SET email=$2 WHERE id=$1', [user.id, TO]);
console.log(`Done. Sign in as ${TO} from now on — your password is unchanged.\n`);
await pool.end();
