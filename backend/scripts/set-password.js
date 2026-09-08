/**
 * Set a new password for an account. The password is read from STDIN, never
 * from the command line, so it does not appear in shell history or the process
 * list. Nothing is printed back.
 *
 *   printf '%s' 'newpassword' | node scripts/set-password.js --user you@example.com
 */
import bcrypt from 'bcrypt';
import { pool, query } from '../config/db.js';

const argv = process.argv.slice(2);
const i = argv.indexOf('--user');
const EMAIL = i >= 0 ? argv[i + 1] : null;
if (!EMAIL) { console.error('Usage: node scripts/set-password.js --user <email>   (password on stdin)'); await pool.end(); process.exit(1); }

const { rows: [user] } = await query('SELECT id, email FROM users WHERE email=$1', [EMAIL]);
if (!user) { console.error(`No account with the email "${EMAIL}".`); await pool.end(); process.exit(1); }

let pw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) pw += chunk;
pw = pw.replace(/\r?\n$/, '');

if (pw.length < 8) {
  console.error('That password is under 8 characters. Pick a longer one and run this again.');
  await pool.end(); process.exit(1);
}
await query('UPDATE users SET password_hash=$2 WHERE id=$1', [user.id, await bcrypt.hash(pw, 10)]);
console.log(`Password updated for ${user.email}.`);
await pool.end();
