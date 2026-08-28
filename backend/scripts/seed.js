import fs from 'node:fs';
import bcrypt from 'bcrypt';
import path from 'node:path';
import { pool } from '../config/db.js';

let sql = fs.readFileSync(path.resolve(process.env.DB_SQL_DIR || '../database', 'seed-data.sql'), 'utf8');
// Replace the placeholder hash with a real bcrypt hash for "demo1234"
sql = sql.replace(/'\$2b\$10\$[^']+'/, `'${await bcrypt.hash('demo1234', 10)}'`);
const { rows } = await pool.query("SELECT 1 FROM users WHERE email='demo@example.com'");
if (rows.length) {
  await pool.query("UPDATE users SET password_hash=$1 WHERE email='demo@example.com'", [await bcrypt.hash('demo1234', 10)]);
  console.log('demo user already present — password reset to demo1234'); await pool.end(); process.exit(0);
}
await pool.query(sql);
console.log('seeded demo data (login: demo@example.com / demo1234)');
await pool.end();
